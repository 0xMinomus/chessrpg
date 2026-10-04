// Orkestrasi duel PvP: host menjalankan state otoritatif (termasuk RNG),
// tamu mengirim intent dan menerima snapshot. Tanpa DOM; WebRTC lewat adapter.

import { PvpPeer, type PvpPeerStatus } from '../adapters/webrtc.ts';
import { deckSelectionStatus, type DeckCatalog } from '../domain/campaign/deck.ts';
import {
  cancelTarget,
  choosePromotion,
  playCard,
  rerollHand,
  tapSquare,
  canUndo,
  restartPvp,
  undoTurn,
  useHeroSkill,
  useHeroUltimate,
} from '../domain/pvp/commands.ts';
import {
  createInitialPvp,
  snapshotPvp,
  type PvpDeps,
  type PvpState,
  type PvpSnapshot,
} from '../domain/pvp/state.ts';

export type PvpRole = 'host' | 'guest';
export type PvpColor = 'w' | 'b';

export interface PvpUiModel {
  phase: 'lobby' | 'connecting' | 'duel';
  role: PvpRole | null;
  color: PvpColor | null;
  signal: string | null;
  signalKind: 'offer' | 'answer' | null;
  status: string;
  pvp: PvpState | null;
  connectionStatus: PvpPeerStatus;
  error: string | null;
  canUndo: boolean;
  myHero: string | null;
  opponentHero: string | null;
}

type ProtocolMessage =
  | { type: 'hello'; heroId: string; deck: string[] }
  | { type: 'hello-ack'; heroId: string; deck: string[] }
  | { type: 'state'; snapshot: PvpSnapshot; canUndo: boolean }
  | { type: 'command'; name: string; args: unknown[] }
  | { type: 'bye' };

export interface PvpCallbacks {
  onUpdate(model: PvpUiModel): void;
}

export type PvpCommandName =
  | 'square'
  | 'card'
  | 'hero-skill'
  | 'hero-ultimate'
  | 'reroll'
  | 'cancel-target'
  | 'promotion'
  | 'undo'
  | 'restart';

/**
 * Pengontrol sesi PvP. Host = putih, tamu = hitam. Host otoritatif penuh;
 * tamu hanya mirror state dan mengirim command saat gilirannya.
 */
export class PvpController {
  private peer: PvpPeer;
  private model: PvpUiModel;
  private localHeroId: string;
  private localDeck: string[];
  private hostState: PvpState | null = null;
  private readonly deckCatalog: DeckCatalog;

  constructor(
    private readonly deps: PvpDeps,
    private readonly callbacks: PvpCallbacks,
    heroId: string,
    deck: string[],
  ) {
    this.localHeroId = heroId;
    const cards = Object.values(deps.cards);
    this.deckCatalog = {
      regularCardIds: cards.filter((card) => card.kind !== 'joker').map((card) => card.id),
      jokerCardIds: cards.filter((card) => card.kind === 'joker').map((card) => card.id),
    };
    this.localDeck = deck;
    this.model = {
      phase: 'lobby',
      role: null,
      color: null,
      signal: null,
      signalKind: null,
      status: 'Belum terhubung.',
      connectionStatus: 'idle',
      error: null,
      canUndo: false,
      pvp: null,
      myHero: heroId,
      opponentHero: null,
    };
    this.peer = new PvpPeer({
      onSignal: (signal, kind): void => {
        this.model = { ...this.model, signal, signalKind: kind };
        this.emit();
      },
      onStatus: (status: PvpPeerStatus): void => {
        this.model = {
          ...this.model,
          connectionStatus: status,
          status: this.model.phase === 'duel' ? this.model.status : statusText(status),
        };
        this.emit();
      },
      onMessage: (message: unknown): void => {
        if (message && typeof message === 'object' && 'type' in message) {
          this.handleMessage(message as ProtocolMessage);
        }
      },
      onOpen: (): void => {
        this.onChannelOpen();
      },
      onClosed: (reason: string): void => {
        this.model = { ...this.model, status: reason, error: reason, phase: 'lobby', pvp: null, canUndo: false };
        this.emit();
      },
    });
  }

  getModel(): PvpUiModel {
    return this.model;
  }

  /** Host: mulai sesi dan hasilkan tawaran. */
  host(): void {
    if (this.model.role !== null || !this.validLoadout(this.localHeroId, this.localDeck)) return;
    this.model = { ...this.model, role: 'host', color: 'w', myHero: this.localHeroId, opponentHero: null };
    this.emit();
    this.peer.host();
  }

  /** Tamu: gabung dan tunggu tawaran host. */
  join(): void {
    if (this.model.role !== null || !this.validLoadout(this.localHeroId, this.localDeck)) return;
    this.model = { ...this.model, role: 'guest', color: 'b' };
    this.emit();
    this.peer.join();
  }

  /** Masukkan SDP dari peer (copy-paste). */
  applySignal(sdp: string): void {
    if (!sdp.trim()) {
      this.model = { ...this.model, error: 'Tempel kode SDP lawan sebelum melanjutkan.' };
      this.emit();
      return;
    }
    this.model = { ...this.model, error: null };
    void this.peer.handleSignal(sdp);
  }

  async copySignal(): Promise<void> {
    if (!this.model.signal) return;
    try {
      await this.peer.copySignal(this.model.signal);
      this.model = { ...this.model, status: 'Kode disalin. Bagikan kepada lawan.', error: null };
    } catch {
      this.model = { ...this.model, error: 'Clipboard tidak tersedia. Pilih dan salin kode secara manual.' };
    }
    this.emit();
  }

  /** Pemain lokal mengirim command (guest → host; host → dirinya sendiri). */
  dispatch(name: PvpCommandName, args: unknown[]): void {
    if (this.model.phase !== 'duel' || !this.hostState) return;
    if (name !== 'restart' && !(name === 'undo' && this.hostState.gameOver) &&
        (this.hostState.turn !== this.model.color || this.hostState.gameOver)) return;
    if (this.model.role === 'host') {
      this.applyLocalCommand(name, args);
    } else {
      this.peer.send({ type: 'command', name, args });
    }
  }

  close(): void {
    this.peer.send({ type: 'bye' });
    this.peer.close();
    this.hostState = null;
    this.model = {
      ...this.model, phase: 'lobby', role: null, color: null, pvp: null,
      signal: null, signalKind: null, error: null, canUndo: false,
    };
  }

  private onChannelOpen(): void {
    if (this.model.role === 'host') {
      this.model = { ...this.model, phase: 'connecting', status: 'Menunggu loadout lawan…' };
      this.emit();
      this.peer.send({ type: 'hello', heroId: this.localHeroId, deck: this.localDeck });
    }
    // Tamu menunggu 'hello' dari host.
  }

  private handleMessage(message: ProtocolMessage): void {
    if (!message) return;
    switch (message.type) {
      case 'hello': {
        if (this.model.role !== 'guest' || !this.validLoadout(message.heroId, message.deck)) return;
        // Tamu menerima hero/deck host → balas loadout sendiri.
        this.model = {
          ...this.model,
          opponentHero: message.heroId,
          status: 'Menyiapkan pertarungan…',
        };
        this.emit();
        this.peer.send({ type: 'hello-ack', heroId: this.localHeroId, deck: this.localDeck });
        break;
      }
      case 'hello-ack': {
        if (this.model.role !== 'host' || this.hostState || !this.validLoadout(message.heroId, message.deck)) return;
        // Host menerima loadout tamu → buat state awal, kirim snapshot.
        this.model = { ...this.model, opponentHero: message.heroId };
        this.startDuel(message.heroId, message.deck);
        break;
      }
      case 'state': {
        if (this.model.role !== 'guest' || !message.snapshot || !Array.isArray(message.snapshot.board)) return;
        this.hostState = { ...message.snapshot, past: [], anchor: null, dealtSlot: null };
        this.model = {
          ...this.model,
          phase: 'duel',
          pvp: this.hostState,
          status: this.hostState.status,
          canUndo: message.canUndo === true,
          error: null,
        };
        this.emit();
        break;
      }
      case 'command': {
        // Host menerima intent tamu.
        if (this.model.role === 'host' && Array.isArray(message.args)) {
          this.applyRemoteCommand(message.name as PvpCommandName, message.args);
        }
        break;
      }
      case 'bye': {
        this.peer.close();
        this.hostState = null;
        this.model = { ...this.model, phase: 'lobby', pvp: null, canUndo: false, status: 'Lawan meninggalkan permainan.' };
        this.emit();
        break;
      }
      default:
        break;
    }
  }

  private startDuel(guestHeroId: string, guestDeck: string[]): void {
    const state = createInitialPvp(
      {
        whiteHeroId: this.localHeroId,
        blackHeroId: guestHeroId,
        whiteDeck: this.localDeck,
        blackDeck: guestDeck,
        board: this.deps.chess.initialBoard(),
      },
      this.deps,
    );
    this.hostState = state;
    this.model = { ...this.model, phase: 'duel', pvp: state, status: state.status, error: null, canUndo: canUndo(state) };
    this.emit();
    this.broadcast();
  }

  /** Host: kirim snapshot ke tamu setelah setiap mutasi. */
  private broadcast(): void {
    if (!this.hostState) return;
    this.peer.send({ type: 'state', snapshot: snapshotPvp(this.hostState), canUndo: canUndo(this.hostState) });
  }

  /** Host: terapkan command (dari dirinya atau tamu) lalu broadcast. */
  private applyLocalCommand(name: PvpCommandName, args: unknown[]): void {
    this.applyCommand(name, args);
  }

  private applyRemoteCommand(name: PvpCommandName, args: unknown[]): void {
    if (!this.hostState) return;
    if (name !== 'restart' && !(name === 'undo' && this.hostState.gameOver) &&
        (this.hostState.turn !== 'b' || this.hostState.gameOver)) {
      this.broadcast();
      return;
    }
    this.applyCommand(name, args);
  }

  private applyCommand(name: PvpCommandName, args: unknown[]): void {
    const state = this.hostState;
    if (!state) return;
    let result: { state: PvpState; ok: boolean; message: string };
    switch (name) {
      case 'square': {
        const row = args[0];
        const col = args[1];
        if (typeof row !== 'number' || typeof col !== 'number' || !Number.isInteger(row) || !Number.isInteger(col) ||
            row < 0 || row > 7 || col < 0 || col > 7) return;
        result = tapSquare(state, this.deps, row, col);
        break;
      }
      case 'card': {
        const slot = args[0];
        if (typeof slot !== 'number' || !Number.isInteger(slot) || slot < 0 || slot > 2) return;
        result = playCard(state, this.deps, slot);
        break;
      }
      case 'hero-skill':
        result = useHeroSkill(state, this.deps);
        break;
      case 'hero-ultimate':
        result = useHeroUltimate(state, this.deps);
        break;
      case 'reroll':
        result = rerollHand(state, this.deps);
        break;
      case 'cancel-target':
        result = cancelTarget(state, this.deps);
        break;
      case 'promotion': {
        const choice = args[0];
        if (choice !== 'q' && choice !== 'r' && choice !== 'b' && choice !== 'n') return;
        result = choosePromotion(state, this.deps, choice);
        break;
      }
      case 'undo':
        result = undoTurn(state);
        break;
      case 'restart':
        result = restartPvp(state, this.deps);
        break;
      default:
        return;
    }
    this.hostState = result.state;
    this.model = { ...this.model, pvp: result.state, status: result.state.status, canUndo: canUndo(result.state) };
    this.emit();
    this.broadcast();
  }

  private validLoadout(heroId: unknown, deck: unknown): deck is string[] {
    return typeof heroId === 'string' && !!this.deps.heroes[heroId] &&
      Array.isArray(deck) && deck.every((id) => typeof id === 'string') &&
      deckSelectionStatus(deck, this.deckCatalog).complete;
  }

  private emit(): void {
    this.callbacks.onUpdate(this.model);
  }
}


function statusText(status: PvpPeerStatus): string {
  switch (status) {
    case 'creating-offer':
      return 'Membuat tawaran koneksi…';
    case 'awaiting-answer':
      return 'Menunggu jawaban lawan. Salin tawaran di bawah ke lawan.';
    case 'awaiting-offer':
      return 'Menunggu tawaran lawan. Tempel tawaran lawan di bawah.';
    case 'creating-answer':
      return 'Membuat jawaban…';
    case 'connecting':
      return 'Menghubungkan…';
    case 'connected':
      return 'Terhubung.';
    case 'failed':
      return 'Koneksi gagal.';
    case 'closed':
      return 'Koneksi ditutup.';
    case 'idle':
    default:
      return 'Belum terhubung.';
  }
}
