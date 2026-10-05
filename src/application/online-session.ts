import type { PeerEndpoint, PeerLink } from '../adapters/peerjs-network.ts';
import {
  ARENA_PEER_ID,
  generateRoomCode,
  isValidRoomCode,
  resolveColors,
  roomPeerId,
  type Color,
  type ColorPick,
  type PvpAction,
  type PlayerInfo,
  type RoomMessage,
  type SelectionSync,
} from '../domain/online/protocol.ts';
import { createQueue, enqueue, pairNext, removePeer, type MatchmakingQueue, type QueuedPlayer } from '../domain/online/matchmaking.ts';
import {
  cancelPvpTargetCommand,
  choosePvpPromotion,
  executePvpPremove,
  movePvpPiece,
  playPvpCardCommand,
  queuePvpPremove as validatePremove,
  rerollPvpHand,
  resignPvp,
  resolvePvpTargetCommand,
  usePvpSkillCommand,
  usePvpUltimateCommand,
} from '../domain/pvp/commands.ts';
import { makePvpHand } from '../domain/pvp/rules.ts';
import { createInitialPvp, type PvpDeps, type PvpState, otherColor } from '../domain/pvp/state.ts';

export interface OnlinePlayerProfile { heroId: string; deckCardIds: string[] }
export interface OnlineSessionSnapshot {
  mode: 'home'|'matchmaking'|'room'|'battle'; status: string; connectionText: string;
  error: string|null; busy: boolean; roomCode: string; colorPick: ColorPick;
  localColor: 'w'|'b'|null; localProfile: OnlinePlayerProfile|null;
  opponent: PlayerInfo|null; battle: PvpState|null;
  localPremove: {from:[number,number];to:[number,number]}|null;
  remotePremove: {from:[number,number];to:[number,number]}|null;
  remoteSelection: SelectionSync|null;
}
type Mode = OnlineSessionSnapshot['mode'];
type Listen = () => void;
type Route = { id: string };
const CODE_ATTEMPTS = 6;
const SEED_MAX = 0xffffffff;

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function validPick(value: unknown): value is ColorPick { return value === 'w' || value === 'b' || value === 'random'; }
function validColor(value: unknown): value is Color { return value === 'w' || value === 'b'; }
function validProfile(value: unknown, deps: PvpDeps): value is OnlinePlayerProfile {
  if (
    !isRecord(value) ||
    typeof value.heroId !== 'string' ||
    !deps.heroes[value.heroId] ||
    !Array.isArray(value.deckCardIds) ||
    value.deckCardIds.length !== 11 ||
    !value.deckCardIds.every((id) => typeof id === 'string')
  ) {
    return false;
  }
  const ids = value.deckCardIds as string[];
  if (new Set(ids).size !== ids.length) return false;
  const cards = ids.map((id) => deps.cards[id]);
  return cards.every((card) => card !== undefined) &&
    cards.filter((card) => card?.kind === 'joker').length === 1;
}
function validPlayerInfo(value: unknown, deps: PvpDeps): value is PlayerInfo {
  return isRecord(value) && validColor(value.color) && validProfile(value, deps);
}
function sameProfile(a: OnlinePlayerProfile, b: OnlinePlayerProfile): boolean {
  return a.heroId === b.heroId && a.deckCardIds.length === b.deckCardIds.length &&
    a.deckCardIds.every((id, index) => id === b.deckCardIds[index]);
}
function validCoord(value: unknown): value is [number, number] {
  return Array.isArray(value) && value.length === 2 && Number.isInteger(value[0]) && Number.isInteger(value[1]) && value[0] >= 0 && value[0] < 8 && value[1] >= 0 && value[1] < 8;
}
function validSelection(value: unknown): value is SelectionSync {
  return isRecord(value) && (value.from === null || validCoord(value.from)) && (value.to === null || validCoord(value.to));
}
function validAction(value: unknown): value is PvpAction {
  if (!isRecord(value) || typeof value.kind !== 'string') return false;
  switch (value.kind) {
    case 'move': return validCoord(value.from) && validCoord(value.to) && (value.promotion === undefined || ['q','r','b','n'].includes(String(value.promotion)));
    case 'card': return Number.isInteger(value.slot) && Number(value.slot) >= 0 && Number(value.slot) <= 2;
    case 'card-target': return Number.isInteger(value.row) && Number(value.row) >= 0 && Number(value.row) < 8 && Number.isInteger(value.col) && Number(value.col) >= 0 && Number(value.col) < 8;
    case 'promotion': return ['q','r','b','n'].includes(String(value.piece));
    case 'cancel-target': case 'reroll': case 'hero-skill': case 'hero-ultimate': case 'resign': return true;
    default: return false;
  }
}
function validRoomMessage(value: unknown): value is RoomMessage {
  if (!isRecord(value) || typeof value.type !== 'string') return false;
  switch (value.type) {
    case 'hello': return typeof value.heroId === 'string' && Array.isArray(value.deckCardIds) && value.deckCardIds.every((x) => typeof x === 'string');
    case 'color-pick': return validPick(value.pick);
    case 'color-assign': return validColor(value.you);
    case 'game-start': return Number.isInteger(value.seed) && Number(value.seed) >= 0 && Number(value.seed) <= SEED_MAX && Array.isArray(value.players) && value.players.length === 2 && value.players.every((x) => isRecord(x) && typeof x.heroId === 'string' && Array.isArray(x.deckCardIds) && x.deckCardIds.every((y) => typeof y === 'string') && validColor(x.color));
    case 'action': return Number.isSafeInteger(value.seq) && Number(value.seq) > 0 && validAction(value.action);
    case 'selection': return (value.from === null || validCoord(value.from)) && (value.to === null || validCoord(value.to));
    case 'premove': return validCoord(value.from) && validCoord(value.to);
    case 'premove-clear': case 'leave': return true;
    default: return false;
  }
}
function info(profile: OnlinePlayerProfile, color: Color): PlayerInfo { return { heroId: profile.heroId, deckCardIds: profile.deckCardIds.slice(), color }; }
function samePeer(a: string, b: string): boolean { return a.length > 0 && a === b; }
function isPeerIdCollision(error: unknown): boolean {
  if (!isRecord(error)) return false;
  const type = typeof error.type === 'string' ? error.type : '';
  const message = typeof error.message === 'string' ? error.message.toLowerCase() : '';
  return type === 'unavailable-id' || message.includes('unavailable-id') || message.includes('already taken');
}

export class OnlineSessionController {
  private value: OnlineSessionSnapshot = { mode: 'home', status: '', connectionText: 'Belum tersambung', error: null, busy: false, roomCode: '', colorPick: 'random', localColor: null, localProfile: null, opponent: null, battle: null, localPremove: null, remotePremove: null, remoteSelection: null };
  private listeners: Listen[] = [];
  private endpoint: PeerEndpoint | null = null;
  private link: PeerLink | null = null;
  private peerLinks = new Map<string, PeerLink>();
  private queue: MatchmakingQueue = createQueue();
  private queued: Map<string, QueuedPlayer> = new Map();
  private routeLinks = new Map<string, string>();
  private sequenceOut = 0;
  private sequenceIn = 0;
  private generation = 0;
  private disposed = false;
  private isArena = false;
  private hostReady = false;
  private remoteHello: OnlinePlayerProfile | null = null;
  private peerReady = false;
  private matchCounter = 0;
  private remoteColorPick: ColorPick = 'random';
  private premoveOwner: Color | null = null;

  private readonly deps: PvpDeps;
  private readonly onChange: () => void;
  constructor(deps: PvpDeps, onChange: () => void = () => {}) {
    this.deps = deps;
    this.onChange = onChange;
  }
  private routeMatchIds = new Map<string, string>();
  private pairRoute: Route | null = null;
  get snapshot(): OnlineSessionSnapshot { return this.value; }

  private update(patch: Partial<OnlineSessionSnapshot>): void { this.value = { ...this.value, ...patch }; this.onChange(); }
  private listen(unsub: Listen): void { this.listeners.push(unsub); }
  private active(token: number): boolean { return !this.disposed && token === this.generation; }
  private async endpointFor(token: number, id?: string): Promise<PeerEndpoint> {
    // Keep PeerJS/WebRTC code in a lazy chunk; offline gameplay must not open signaling.
    const { createPeerEndpoint } = await import('../adapters/peerjs-network.ts');
    const endpoint = await createPeerEndpoint(id);
    if (!this.active(token)) { endpoint.close(); throw new Error('Session cancelled'); }
    this.endpoint = endpoint;
    this.listen(endpoint.onState((state, message) => {
      if (state === 'error' || state === 'disconnected' || state === 'closed') {
        const status = state === 'disconnected' ? 'Layanan sinyal terputus.' : 'Koneksi layanan sinyal ditutup.';
        this.fail(message || status);
      } else this.update({ connectionText: 'Terhubung ke layanan sinyal' });
    }));
    return endpoint;
  }
  private attach(link: PeerLink, onMessage: (payload: unknown) => void): void {
    this.link = link;
    this.listen(link.onData(onMessage));
    this.listen(link.onState((state, message) => {
      if (state === 'closed' || state === 'error') {
        this.fail(message || (state === 'closed' ? 'Koneksi lawan terputus.' : 'Koneksi lawan gagal.'));
      } else this.update({ connectionText: 'Terhubung ke lawan' });
    }));
  }
  private fail(message: string): void {
    if (this.disposed) return;
    this.update({ error: message, status: '', connectionText: 'Koneksi bermasalah', busy: false });
  }
  private sendRoom(message: RoomMessage): boolean {
    if (!this.link) {
      this.fail('Koneksi pemain belum tersedia.');
      return false;
    }
    try {
      if (this.pairRoute) this.link.send({ type: 'relay', matchId: this.pairRoute.id, message });
      else this.link.send(message);
      return true;
    } catch (error) {
      this.fail(error instanceof Error ? error.message : String(error));
      return false;
    }
  }
  private begin(mode: Mode, profile: OnlinePlayerProfile): number {
    this.reset(false);
    this.disposed = false;
    const token = ++this.generation;
    if (!validProfile(profile, this.deps)) {
      this.update({
        mode,
        status: 'Lengkapi dek 10 kartu + 1 Joker dan pilih hero sebelum duel online.',
        error: 'Profil pemain tidak valid untuk duel online.',
        busy: false,
        roomCode: '',
        localColor: null,
        localProfile: null,
        opponent: null,
        battle: null,
      });
      return token;
    }
    const waitingToStart = mode === 'matchmaking';
    this.update({
      mode,
      status: waitingToStart ? 'Pilih warna, lalu siapkan pencarian.' : 'Membuat ruang…',
      error: null,
      busy: !waitingToStart,
      roomCode: '',
      localColor: null,
      localProfile: { heroId: profile.heroId, deckCardIds: profile.deckCardIds.slice() },
      opponent: null,
      battle: null,
      localPremove: null,
      remotePremove: null,
      remoteSelection: null,
    });
    return token;
  }
  openMatchmaking(profile: OnlinePlayerProfile): void {
    this.begin('matchmaking', profile);
  }
  setColorPick(pick: ColorPick): void {
    if (!validPick(pick) || (this.value.mode === 'room' && this.hostReady)) return;
    this.update({ colorPick: pick });
    if (this.value.mode === 'room') return;
    if (this.value.mode !== 'matchmaking' || this.value.battle || !this.value.localProfile) return;
    if (this.isArena && this.endpoint) {
      const player: QueuedPlayer = {
        peerId: this.endpoint.id,
        pick,
        heroId: this.value.localProfile.heroId,
        deckCardIds: this.value.localProfile.deckCardIds.slice(),
      };
      this.queued.set(player.peerId, player);
      this.queue = {
        waiting: this.queue.waiting.map((entry) => entry.peerId === player.peerId ? player : entry),
      };
    } else if (this.link) {
      try {
        this.link.send({
          type: 'queue',
          pick,
          heroId: this.value.localProfile.heroId,
          deckCardIds: this.value.localProfile.deckCardIds.slice(),
        });
      } catch (error) {
        this.fail(error instanceof Error ? error.message : String(error));
      }
    }
  }
  async createRoom(profile: OnlinePlayerProfile): Promise<void> {
    const token = this.begin('room', profile);
    if (!this.value.localProfile) return;
    try {
      for (let attempt = 0; attempt < CODE_ATTEMPTS && this.active(token); attempt++) {
        const code = generateRoomCode(Math.random);
        let endpoint: PeerEndpoint;
        try { endpoint = await this.endpointFor(token, roomPeerId(code)); }
        catch (error) {
          if (this.active(token) && isPeerIdCollision(error)) continue;
          throw error;
        }
        if (!this.active(token)) return;
        if (!samePeer(endpoint.id, roomPeerId(code))) { endpoint.close(); this.endpoint = null; continue; }
        this.update({ roomCode: code, status: 'Ruang siap. Menunggu lawan.', busy: false, connectionText: 'Ruang terbuka' });
        this.listen(endpoint.onConnection((link) => {
          if (!this.active(token) || this.link) { link.close(); return; }
          this.peerReady = false; this.remoteHello = null; this.hostReady = false;
          this.attach(link, (payload) => this.onRoomPayload(payload, true));
        }));
        return;
      }
      if (this.active(token)) this.fail('Tidak dapat membuat kode ruang unik. Coba lagi.');
    } catch (error) { if (this.active(token)) this.fail(error instanceof Error ? error.message : String(error)); }
  }
  async joinRoom(code: string, profile: OnlinePlayerProfile): Promise<void> {
    const token = this.begin('room', profile);
    if (!this.value.localProfile) return;
    if (!isValidRoomCode(code)) { this.fail('Kode ruang harus tepat lima digit.'); return; }
    try {
      const endpoint = await this.endpointFor(token);
      const link = await endpoint.connect(roomPeerId(code));
      if (!this.active(token)) { link.close(); return; }
      this.update({ roomCode: code, busy: false, status: 'Terhubung. Menunggu pemain lain siap.', connectionText: 'Terhubung ke lawan' });
      this.attach(link, (payload) => this.onRoomPayload(payload, false));
      if (!this.sendRoom({ type: 'hello', heroId: profile.heroId, deckCardIds: profile.deckCardIds.slice() })) return;
    } catch (error) { if (this.active(token)) this.fail(error instanceof Error ? error.message : String(error)); }
  }
  readyRoom(): void {
    if (this.value.mode !== 'room' || this.value.localColor !== null || !this.link || this.hostReady) return;
    if (!this.sendRoom({ type: 'color-pick', pick: this.value.colorPick })) return;
    this.hostReady = true;
    if (this.remoteHello && this.peerReady) {
      this.startRoomAsHost();
    } else {
      this.update({ status: 'Siap. Menunggu lawan siap.', busy: true });
    }
  }
  private onRoomPayload(payload: unknown, host: boolean): void {
    if (this.disposed || this.value.mode === 'home') return;
    if (!validRoomMessage(payload)) { this.fail('Pesan ruang tidak valid.'); this.link?.close(); return; }
    if (payload.type === 'leave') { this.fail('Lawan meninggalkan pertandingan.'); this.clearNetwork(); return; }
    if (payload.type === 'hello') {
      if (!validProfile(payload, this.deps)) { this.fail('Profil lawan tidak valid.'); this.link?.close(); return; }
      this.remoteHello = { heroId: payload.heroId, deckCardIds: payload.deckCardIds.slice() };
      if (host) {
        if (!this.sendRoom({ type: 'hello', heroId: this.value.localProfile!.heroId, deckCardIds: this.value.localProfile!.deckCardIds.slice() })) return;
        if (this.hostReady && this.peerReady) this.startRoomAsHost();
      } else {
        this.peerReady = true;
        if (!this.sendRoom({ type: 'hello', heroId: this.value.localProfile!.heroId, deckCardIds: this.value.localProfile!.deckCardIds.slice() })) return;
      }
      return;
    }
    if (payload.type === 'color-pick') {
      if (host) {
        this.remoteColorPick = payload.pick;
        this.peerReady = true;
        if (this.hostReady && this.remoteHello) this.startRoomAsHost();
      } else if (!this.value.battle) {
        this.startRoomAsGuest(payload.pick);
      }
      return;
    }
    if (payload.type === 'color-assign') {
      this.update({ localColor: payload.you, opponent: this.remoteHello ? info(this.remoteHello, otherColor(payload.you)) : this.value.opponent });
      return;
    }
    if (payload.type === 'game-start') { this.installBattle(payload.seed, payload.players); return; }
    if (!this.value.battle) {
      this.fail('Pesan permainan tiba sebelum duel dimulai.');
      this.link?.close();
      return;
    }
    this.processRoomGameplay(payload);
  }
  private startRoomAsHost(): void {
    if (!this.hostReady || !this.peerReady || !this.remoteHello || !this.value.localProfile || this.value.battle) return;
    const [hostColor, guestColor] = resolveColors(this.value.colorPick, this.remoteColorPick, Math.random);
    if (!this.value.localProfile) return;
    const players = [info(this.value.localProfile, hostColor), info(this.remoteHello, guestColor)];
    if (!this.sendRoom({ type: 'color-assign', you: guestColor })) return;
    const seed = Math.floor(Math.random() * 0x100000000) >>> 0;
    if (!this.sendRoom({ type: 'game-start', seed, players })) return;
    this.update({ localColor: hostColor, opponent: info(this.remoteHello, guestColor), status: 'Memulai duel…' });
    this.installBattle(seed, players);
  }
  private startRoomAsGuest(hostPick: ColorPick): void {
    if (!this.remoteHello || !this.value.localProfile) return;
    this.remoteColorPick = hostPick;
    this.update({ status: 'Menunggu pemilik ruang menentukan warna…' });
  }
  private installBattle(seed: number, players: PlayerInfo[]): void {
    if (this.value.battle) return;
    const localProfile = this.value.localProfile;
    const localColor = this.value.localColor;
    if (
      !localProfile ||
      !validColor(localColor) ||
      players.length !== 2 ||
      players.some((player) => !validPlayerInfo(player, this.deps))
    ) {
      this.fail('Data awal pertandingan tidak valid.');
      return;
    }
    const white = players.find((player) => player.color === 'w');
    const black = players.find((player) => player.color === 'b');
    const local = players.find((player) => player.color === localColor);
    const opponent = players.find((player) => player.color !== localColor);
    if (
      !white ||
      !black ||
      !local ||
      !opponent ||
      !sameProfile(local, localProfile) ||
      !this.value.opponent ||
      !sameProfile(opponent, this.value.opponent)
    ) {
      this.fail('Profil pemain tidak sesuai dengan pertukaran data ruang.');
      return;
    }
    let state = createInitialPvp(
      {
        white: { ...white, hand: ['', '', ''] },
        black: { ...black, hand: ['', '', ''] },
        seed,
      },
      this.deps,
    );
    const whiteHand = makePvpHand(state, this.deps, white.deckCardIds);
    state = whiteHand.state;
    state.sides.w.hand = whiteHand.hand;
    const blackHand = makePvpHand(state, this.deps, black.deckCardIds);
    state = blackHand.state;
    state.sides.b.hand = blackHand.hand;
    this.sequenceIn = 0;
    this.sequenceOut = 0;
    this.update({
      mode: 'battle',
      battle: state,
      status: localColor === state.turn ? 'Giliran Anda.' : 'Menunggu giliran lawan.',
      busy: false,
      opponent,
    });
  }
  private applyAction(state: PvpState, color: Color, action: PvpAction): { state: PvpState; ok: boolean; message: string } {
    switch (action.kind) {
      case 'move': {
        const moved = movePvpPiece(state, this.deps, color, action.from, action.to);
        if (!moved.ok || !action.promotion) return moved;
        if (!moved.state.pendingPromotion) return { state: moved.state, ok: false, message: 'Promosi tidak menunggu pilihan.' };
        return choosePvpPromotion(moved.state, this.deps, color, action.promotion);
      }
      case 'card': return playPvpCardCommand(state, this.deps, color, action.slot);
      case 'card-target': return resolvePvpTargetCommand(state, this.deps, color, action.row, action.col);
      case 'cancel-target': return cancelPvpTargetCommand(state, this.deps, color);
      case 'reroll': return rerollPvpHand(state, this.deps, color);
      case 'hero-skill': return usePvpSkillCommand(state, this.deps, color);
      case 'hero-ultimate': return usePvpUltimateCommand(state, this.deps, color);
      case 'promotion': return choosePvpPromotion(state, this.deps, color, action.piece);
      case 'resign': return { state: resignPvp(state, color), ok: true, message: 'Menyerah.' };
    }
  }
  submitAction(action: PvpAction): { ok: boolean; message: string } {
    const state = this.value.battle;
    const color = this.value.localColor;
    if (!state || !color || !this.link || !validAction(action)) {
      return { ok: false, message: 'Tidak ada pertandingan aktif atau aksi tidak valid.' };
    }
    const result = this.applyAction(state, color, action);
    if (!result.ok) {
      this.update({ status: result.message });
      return { ok: false, message: result.message };
    }
    const sequence = this.sequenceOut + 1;
    if (!this.sendRoom({ type: 'action', seq: sequence, action })) {
      return { ok: false, message: 'Aksi gagal dikirim; giliran tidak diterapkan.' };
    }
    this.sequenceOut = sequence;
    this.update({
      battle: result.state,
      status: result.message || result.state.status,
      ...(action.kind === 'move' ? { remotePremove: null } : {}),
    });
    this.afterAction(result.state);
    return { ok: true, message: result.message };
  }
  private processRoomGameplay(message: RoomMessage): void {
    if (!this.value.battle || !this.value.localColor) return;
    if (message.type === 'leave') {
      this.fail('Lawan meninggalkan pertandingan.');
      this.clearNetwork();
      return;
    }
    if (message.type === 'selection') {
      this.update({ remoteSelection: { from: message.from, to: message.to } });
      return;
    }
    if (message.type === 'premove-clear') {
      this.update({ remotePremove: null, remoteSelection: null });
      return;
    }
    if (message.type === 'premove') {
      const color = otherColor(this.value.localColor);
      const checked = validatePremove(this.value.battle, color, message.from, message.to);
      if (!checked.ok || !checked.premove) {
        this.fail('Lawan mengirim premove yang tidak legal.');
        this.link?.close();
        return;
      }
      this.update({ remotePremove: { from: message.from, to: message.to } });
      return;
    }
    if (message.type !== 'action') return;
    if (message.seq !== this.sequenceIn + 1 || !validAction(message.action)) {
      this.fail('Urutan atau isi aksi lawan tidak valid.');
      this.link?.close();
      return;
    }
    const color = otherColor(this.value.localColor);
    const result = this.applyAction(this.value.battle, color, message.action);
    if (!result.ok) {
      this.fail('Aksi lawan tidak legal: ' + result.message);
      this.link?.close();
      return;
    }
    this.sequenceIn = message.seq;
    this.update({
      battle: result.state,
      status: result.message || result.state.status,
      ...(message.action.kind === 'move' ? { remotePremove: null, remoteSelection: null } : {}),
    });
    this.afterAction(result.state);
    if (result.state.turn === this.value.localColor && this.value.localPremove && this.premoveOwner === this.value.localColor) this.runPremove();
  }
  private afterAction(state: PvpState): void { if (state.gameOver) this.update({ status: state.status }); }
  setSelection(selection: SelectionSync): void {
    if (!validSelection(selection)) return;
    this.sendRoom({ type: 'selection', from: selection.from, to: selection.to });
  }
  queuePremove(from: [number, number], to: [number, number]): { ok: boolean; message: string } {
    const state = this.value.battle;
    const color = this.value.localColor;
    if (!state || !color || !validCoord(from) || !validCoord(to) || !this.link) {
      return { ok: false, message: 'Premove tidak tersedia.' };
    }
    const checked = validatePremove(state, color, from, to);
    if (!checked.ok || !checked.premove) return { ok: false, message: checked.message };
    const premove = { from: [...from] as [number, number], to: [...to] as [number, number] };
    if (!this.sendRoom({ type: 'premove', from: premove.from, to: premove.to })) {
      return { ok: false, message: 'Premove gagal dikirim.' };
    }
    this.premoveOwner = color;
    this.update({ localPremove: premove });
    return { ok: true, message: checked.message };
  }
  private runPremove(): void {
    const premove = this.value.localPremove; const color = this.value.localColor; const state = this.value.battle;
    if (!premove || !color || !state || this.premoveOwner !== color || state.turn !== color) return;
    const result = executePvpPremove(state, this.deps, { ...premove, color });
    this.premoveOwner = null;
    this.update({ localPremove: null }); this.sendRoom({ type: 'premove-clear' });
    if (result.ok) this.submitAction({ kind: 'move', from: premove.from, to: premove.to });
  }
  clearPremove(): void { this.premoveOwner = null; this.update({ localPremove: null }); this.sendRoom({ type: 'premove-clear' }); }
  cancel(): void { this.reset(true); }
  leave(): void { this.reset(true); }
  dispose(): void { this.reset(true); this.disposed = true; }
  private clearNetwork(): void {
    for (const unsubscribe of this.listeners.splice(0)) unsubscribe();
    for (const link of this.peerLinks.values()) link.close(); this.peerLinks.clear();
    this.link?.close(); this.link = null;
    this.endpoint?.close(); this.endpoint = null;
  }
  private reset(invalidate: boolean): void {
    if (invalidate) this.generation++;
    if (this.link) this.sendRoom({ type: 'leave' });
    for (const [peerId, link] of this.peerLinks) {
      if (link !== this.link) {
        const matchId = this.routeMatchIds.get(peerId);
        if (matchId) {
          try {
            link.send({ type: 'relay', matchId, message: { type: 'leave' } });
          } catch {
            // The remote endpoint already closed; local cleanup still proceeds.
          }
        }
      }
      this.queue = removePeer(this.queue, peerId);
    }
    this.clearNetwork();
    this.queue = createQueue();
    this.queued.clear();
    this.routeLinks.clear();
    this.routeMatchIds.clear();
    this.isArena = false;
    this.hostReady = false;
    this.peerReady = false;
    this.remoteHello = null;
    this.remoteColorPick = 'random';
    this.premoveOwner = null;
    this.pairRoute = null;
    this.sequenceIn = 0;
    this.sequenceOut = 0;
    this.update({
      mode: 'home',
      status: '',
      connectionText: 'Belum tersambung',
      error: null,
      busy: false,
      roomCode: '',
      localColor: null,
      localProfile: null,
      opponent: null,
      battle: null,
      localPremove: null,
      remotePremove: null,
      remoteSelection: null,
    });
  }

  async findMatch(): Promise<void> {
    const profile = this.value.localProfile;
    if (!profile) { this.fail('Pilih profil pemain sebelum mencari lawan.'); return; }
    if (this.endpoint) return;
    const token = this.generation || ++this.generation;
    this.update({ mode: 'matchmaking', localProfile: profile, busy: true, error: null, status: 'Mencari lawan…', connectionText: 'Menghubungkan…' });
    const queued: QueuedPlayer = { peerId: '', pick: this.value.colorPick, heroId: profile.heroId, deckCardIds: profile.deckCardIds.slice() };
    try {
      let arena: PeerEndpoint | null = null;
      try { arena = await this.endpointFor(token, ARENA_PEER_ID); this.isArena = true; }
      catch { if (!this.active(token)) return; }
      if (arena && this.active(token)) {
        queued.peerId = arena.id;
        queued.pick = this.value.colorPick;
        this.enqueueLocal(queued);
        this.listen(arena.onConnection((link) => this.acceptQueueLink(link, token)));
        this.update({ busy: true, status: 'Antrean aktif. Menunggu lawan.', connectionText: 'Ruang antrean siap' });
        return;
      }
      const client = await this.endpointFor(token);
      if (!this.active(token)) return;
      queued.peerId = client.id;
      const link = await client.connect(ARENA_PEER_ID);
      if (!this.active(token)) { link.close(); return; }
      this.attach(link, (payload) => this.onArenaClientMessage(payload, queued, token));
      queued.pick = this.value.colorPick;
      link.send({ type: 'queue', pick: queued.pick, heroId: queued.heroId, deckCardIds: queued.deckCardIds });
      this.update({ status: 'Antrean aktif. Menunggu lawan.', busy: true, connectionText: 'Menunggu di ruang antrean' });
    } catch (error) {
      if (!this.active(token)) return;
      if (!this.isArena) {
        this.clearNetwork();
        try {
          const endpoint = await this.endpointFor(token, ARENA_PEER_ID);
          if (this.active(token)) {
            this.isArena = true;
            queued.peerId = endpoint.id;
            queued.pick = this.value.colorPick;
            this.enqueueLocal(queued);
            this.listen(endpoint.onConnection((link) => this.acceptQueueLink(link, token)));
            this.update({ busy: true, status: 'Antrean aktif. Menunggu lawan.', connectionText: 'Ruang antrean siap' });
            return;
          }
        } catch (ownerError) {
          if (this.active(token)) this.fail(ownerError instanceof Error ? ownerError.message : String(ownerError));
        }
      } else this.fail(error instanceof Error ? error.message : String(error));
    }
  }
  private enqueueLocal(player: QueuedPlayer): void { this.queue = enqueue(this.queue, player); this.queued.set(player.peerId, player); this.tryPair(); }
  private acceptQueueLink(link: PeerLink, token: number): void {
    if (!this.active(token) || this.peerLinks.has(link.peerId)) { link.close(); return; }
    this.peerLinks.set(link.peerId, link);
    this.listen(link.onData((payload) => this.onArenaIncoming(link, payload, token)));
    this.listen(link.onState((state, message) => {
      if (state === 'closed' || state === 'error') {
        this.queue = removePeer(this.queue, link.peerId);
        this.queued.delete(link.peerId);
        this.peerLinks.delete(link.peerId);
        this.fail(message || 'Pemain di antrean terputus.');
      }
    }));
  }
  private onArenaIncoming(link: PeerLink, payload: unknown, token: number): void {
    if (!this.active(token) || !isRecord(payload)) {
      link.close();
      return;
    }
    if (payload.type === 'queue') {
      const profile = { heroId: payload.heroId, deckCardIds: payload.deckCardIds };
      if (!link.peerId || !validPick(payload.pick) || !validProfile(profile, this.deps)) {
        link.close();
        return;
      }
      if (this.routeLinks.has(link.peerId)) return;
      const player: QueuedPlayer = {
        peerId: link.peerId,
        pick: payload.pick,
        heroId: profile.heroId,
        deckCardIds: profile.deckCardIds.slice(),
      };
      if (this.queued.has(player.peerId)) {
        this.queued.set(player.peerId, player);
        this.queue = {
          waiting: this.queue.waiting.map((entry) => entry.peerId === player.peerId ? player : entry),
        };
      } else {
        this.queued.set(player.peerId, player);
        this.queue = enqueue(this.queue, player);
      }
      this.tryPair();
      return;
    }
    const mapped = this.routeLinks.get(link.peerId);
    if (mapped === this.endpoint?.id && validRoomMessage(payload)) {
      this.onRoomPayload(payload, true);
      return;
    }
    if (mapped && validRoomMessage(payload)) {
      try {
        this.peerLinks.get(mapped)?.send({
          type: 'relay',
          matchId: this.routeMatchIds.get(link.peerId),
          message: payload,
        });
      } catch (error) {
        this.fail(error instanceof Error ? error.message : String(error));
      }
      return;
    }
    if (isRelayEnvelope(payload, this.routeMatchIds.get(link.peerId) ?? '')) {
      const destination = this.routeLinks.get(link.peerId);
      if (destination === this.endpoint?.id) {
        this.onRoomPayload(payload.message, true);
      } else if (destination) {
        try {
          this.peerLinks.get(destination)?.send(payload);
        } catch (error) {
          this.fail(error instanceof Error ? error.message : String(error));
        }
      }
      return;
    }
    if (validRoomMessage(payload)) {
      this.fail('Pesan pertandingan tidak dikenali di lobby matchmaking.');
      link.close();
    } else if (payload.type === 'relay') {
      this.fail('Pesan relay tidak valid atau tidak cocok.');
      link.close();
    }
  }
  private tryPair(): void {
    while (true) {
      const next = pairNext(this.queue, Math.random);
      this.queue = next.queue;
      if (!next.pair) return;
      const pair = next.pair;
      const matchId = `${Date.now().toString(36)}-${(this.matchCounter++).toString(36)}`;
      const hostSelf = pair.host.peerId === this.endpoint?.id;
      const guestSelf = pair.guest.peerId === this.endpoint?.id;
      const assign = (
        player: QueuedPlayer,
        other: QueuedPlayer,
        youAre: 'host' | 'guest',
        color: Color,
        self: boolean,
      ): void => {
        const opponent = info(other, other === pair.host ? pair.hostColor : pair.guestColor);
        const paired = {
          type: 'paired',
          hostPeerId: pair.host.peerId,
          guestPeerId: pair.guest.peerId,
          matchId,
          youAre,
          yourColor: color,
          opponent,
          viaRelay: true,
        };
        if (self) {
          const remote = this.peerLinks.get(other.peerId);
          if (!remote) throw new Error('Koneksi pemain lawan terputus.');
          this.startArenaLocalMatch(remote, player, color, opponent, matchId);
        } else {
          const remote = this.peerLinks.get(player.peerId);
          if (!remote) throw new Error('Koneksi pemain antrean terputus.');
          remote.send(paired);
        }
      };
      try {
        assign(pair.host, pair.guest, 'host', pair.hostColor, hostSelf);
        assign(pair.guest, pair.host, 'guest', pair.guestColor, guestSelf);
      } catch (error) {
        this.fail(error instanceof Error ? error.message : String(error));
        return;
      }
      this.routeLinks.set(pair.host.peerId, pair.guest.peerId);
      this.routeLinks.set(pair.guest.peerId, pair.host.peerId);
      this.routeMatchIds.set(pair.host.peerId, matchId);
      this.routeMatchIds.set(pair.guest.peerId, matchId);
      this.queued.delete(pair.host.peerId);
      this.queued.delete(pair.guest.peerId);
      if (hostSelf) {
        const seed = Math.floor(Math.random() * 0x100000000) >>> 0;
        const players = [info(pair.host, pair.hostColor), info(pair.guest, pair.guestColor)];
        if (!this.sendRoom({ type: 'game-start', seed, players })) return;
        this.installBattle(seed, players);
      }
    }
  }
  private startArenaLocalMatch(
    remote: PeerLink,
    local: QueuedPlayer,
    color: Color,
    opponent: PlayerInfo,
    matchId: string,
  ): void {
    this.link = remote;
    this.pairRoute = { id: matchId };
    this.update({
      mode: 'battle',
      localColor: color,
      opponent,
      localProfile: { heroId: local.heroId, deckCardIds: local.deckCardIds.slice() },
      busy: false,
      status: 'Lawan ditemukan.',
    });
  }
  private onArenaClientMessage(payload: unknown, queued: QueuedPlayer, token: number): void {
    if (!this.active(token) || !isRecord(payload) || typeof payload.type !== 'string') {
      this.fail('Pesan matchmaking tidak valid.');
      return;
    }
    if (payload.type === 'paired') {
      const opponent = payload.opponent;
      if (
        typeof payload.matchId !== 'string' ||
        !/^[a-z0-9-]{1,64}$/.test(payload.matchId) ||
        typeof payload.hostPeerId !== 'string' ||
        typeof payload.guestPeerId !== 'string' ||
        samePeer(payload.hostPeerId, payload.guestPeerId) ||
        (payload.youAre !== 'host' && payload.youAre !== 'guest') ||
        !validColor(payload.yourColor) ||
        !validPlayerInfo(opponent, this.deps) ||
        opponent.color === payload.yourColor ||
        payload.viaRelay !== true ||
        !this.link ||
        !this.endpoint
      ) {
        this.fail('Penetapan matchmaking tidak valid.');
        return;
      }
      const expectedPeerId = payload.youAre === 'host' ? payload.hostPeerId : payload.guestPeerId;
      if (expectedPeerId !== this.endpoint.id) {
        this.fail('Penetapan pertandingan ditujukan ke peer lain.');
        this.link.close();
        return;
      }
      this.update({ opponent, localColor: payload.yourColor, status: 'Lawan ditemukan.', busy: false });
      this.pairRoute = { id: payload.matchId };
      if (payload.youAre === 'host') {
        const seed = Math.floor(Math.random() * 0x100000000) >>> 0;
        const players = [info(queued, payload.yourColor), opponent];
        if (!this.sendRoom({ type: 'game-start', seed, players })) return;
        this.installBattle(seed, players);
      }
      return;
    }
    const route = this.pairRoute;
    if (route && isRelayEnvelope(payload, route.id)) {
      const message = payload.message;
      if (message.type === 'game-start') this.installBattle(message.seed, message.players);
      else this.processRoomGameplay(message);
      return;
    }
    this.fail('Pesan matchmaking tidak diharapkan.');
  }
}
function isRelayEnvelope(value: Record<string, unknown>, id: string): value is Record<string, unknown> & { message: RoomMessage } {
  return value.type === 'relay' && value.matchId === id && validRoomMessage(value.message);
}
