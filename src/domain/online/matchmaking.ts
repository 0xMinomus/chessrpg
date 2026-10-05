// Antrian matchmaking: logika murni pemilik lobby (pasangan + warna).
//
// Pemilik lobby menerima QueueMessage dari pemain yang connect ke ARENA_PEER_ID.
// Pasangan dibentuk dari dua antrian terlama; warna ditetapkan dari preferensi
// lewat resolveColors. Domain ini tidak menyentuh jaringan: adapter memanggil
// enqueue/dequeue dan membaca hasil pairNext.

import type { Color, ColorPick } from './protocol.ts';
import { resolveColors } from './protocol.ts';

export interface QueuedPlayer {
  peerId: string;
  pick: ColorPick;
  heroId: string;
  deckCardIds: string[];
}

export interface PairedMatch {
  host: QueuedPlayer;
  guest: QueuedPlayer;
  hostColor: Color;
  guestColor: Color;
}

export interface MatchmakingQueue {
  waiting: QueuedPlayer[];
}

export function createQueue(): MatchmakingQueue {
  return { waiting: [] };
}

export function enqueue(queue: MatchmakingQueue, player: QueuedPlayer): MatchmakingQueue {
  return { waiting: queue.waiting.concat([player]) };
}

/** Hapus semua entri peer (putus koneksi / batal antri). */
export function removePeer(queue: MatchmakingQueue, peerId: string): MatchmakingQueue {
  return { waiting: queue.waiting.filter(function (player) {
    return player.peerId !== peerId;
  }) };
}

/**
 * Ambil pasangan terlama bila antrian berisi minimal dua pemain.
 * Warna memakai resolveColors; posisi host = pemain pertama antrian.
 */
export function pairNext(queue: MatchmakingQueue, rng: () => number): { queue: MatchmakingQueue; pair: PairedMatch | null } {
  if (queue.waiting.length < 2) return { queue, pair: null };
  const host = queue.waiting[0];
  const guest = queue.waiting[1];
  const rest = queue.waiting.slice(2);
  const [hostColor, guestColor] = resolveColors(host.pick, guest.pick, rng);
  return {
    queue: { waiting: rest },
    pair: { host, guest, hostColor, guestColor },
  };
}
