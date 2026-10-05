// Protokol online 1v1: bentuk pesan murni yang dikirim lewat DataChannel.
//
// Dua jalur masuk memakai protokol yang sama setelah kedua pemain terhubung:
// - Jalur kode: host membuat room `cc-room-<kode5angka>`, tamu connect ke id itu.
// - Jalur matchmaking: pasangan dibentuk lewat lobby `cc-arena-1`, lalu tamu
//   connect langsung ke peer host pasangan.
// Domain ini tidak menyentuh jaringan; adapter menyediakan kanal pesan.

import type { PromotionChoice } from '../chess/promotion.ts';

export type Color = 'w' | 'b';

/** Preferensi warna yang bisa dipilih pemain (matchmaking ataupun room). */
export type ColorPick = Color | 'random';

/** Prefix id peer untuk room kode. Kode = 5 digit setelah prefix. */
export const ROOM_PEER_PREFIX = 'cc-room-';

/** Id peer well-known untuk lobby matchmaking. Berubah per versi protokol. */
export const ARENA_PEER_ID = 'cc-arena-1';

/** Batas digit kode room. */
export const ROOM_CODE_LENGTH = 5;

/** Format kode room valid: tepat 5 digit angka. */
export function isValidRoomCode(code: string): boolean {
  return new RegExp('^[0-9]{' + ROOM_CODE_LENGTH + '}$').test(code);
}


/** Generate a fixed-width room code; leading zeroes are valid. */
export function generateRoomCode(rng: () => number): string {
  const value = Math.max(0, Math.min(99999, Math.floor(rng() * 100000)));
  return String(value).padStart(ROOM_CODE_LENGTH, '0');
}
export function roomPeerId(code: string): string {
  return ROOM_PEER_PREFIX + code;
}

/** Aksi pemain yang diteruskan ke lawan; validasi ulang di sisi penerima. */
export type PvpAction =
  | { kind: 'move'; from: [number, number]; to: [number, number]; promotion?: PromotionChoice }
  | { kind: 'card'; slot: number }
  | { kind: 'card-target'; row: number; col: number }
  | { kind: 'cancel-target' }
  | { kind: 'reroll' }
  | { kind: 'hero-skill' }
  | { kind: 'hero-ultimate' }
  | { kind: 'promotion'; piece: PromotionChoice }
  | { kind: 'resign' };

/** Sinkron seleksi bidak: lawan melihat petak asal/tujuan yang sedang dipilih. */
export interface SelectionSync {
  from: [number, number] | null;
  to: [number, number] | null;
}

/** Pesan lobby matchmaking dari antrian ke pemilik lobby. */
export interface QueueMessage {
  type: 'queue';
  pick: ColorPick;
  heroId: string;
  deckCardIds: string[];
}

/** Assignment from the matchmaking coordinator; the matched link is already open. */
export interface PairedMessage {
  type: 'paired';
  hostPeerId: string;
  guestPeerId: string;
  matchId: string;
  youAre: 'host' | 'guest';
  yourColor: Color;
  opponent: PlayerInfo;
  viaRelay: boolean;
}

export interface PlayerInfo {
  heroId: string;
  deckCardIds: string[];
  color: Color;
}

/** Pesan yang mengalir di kanal room (setelah connect langsung). */
export type RoomMessage =
  | { type: 'hello'; heroId: string; deckCardIds: string[] }
  | { type: 'color-pick'; pick: ColorPick }
  | { type: 'color-assign'; you: Color }
  | { type: 'game-start'; seed: number; players: PlayerInfo[] }
  | { type: 'action'; seq: number; action: PvpAction }
  | { type: 'selection'; from: [number, number] | null; to: [number, number] | null }
  | { type: 'premove'; from: [number, number]; to: [number, number] }
  | { type: 'premove-clear' }
  | { type: 'leave' };

/** Semua pesan kanal (lobby + room) dalam satu union untuk decoding. */
export type WireMessage = QueueMessage | PairedMessage | RoomMessage;

/**
 * Tetapkan warna dari dua preferensi.
 * Aturan: preferensi berbeda dan bukan random → masing-masing dapat pilihannya;
 * salah satu random → pemain lain dapat pilihannya, sisanya untuk yang random;
 * sama atau keduanya random → acak.
 */
export function resolveColors(a: ColorPick, b: ColorPick, rng: () => number): [Color, Color] {
  const ca: Color | null = a === 'random' ? null : a;
  const cb: Color | null = b === 'random' ? null : b;
  if (ca !== null && cb !== null && ca !== cb) return [ca, cb];
  if (ca !== null && cb === null) return [ca, ca === 'w' ? 'b' : 'w'];
  if (ca === null && cb !== null) return [cb === 'w' ? 'b' : 'w', cb];
  return rng() < 0.5 ? ['w', 'b'] : ['b', 'w'];
}

/** Pesan status kanal untuk UI: satu sumber teks koneksi. */
export type ChannelStatus =
  | { kind: 'idle' }
  | { kind: 'creating' }
  | { kind: 'joining' }
  | { kind: 'matching' }
  | { kind: 'connected' }
  | { kind: 'error'; message: string };
