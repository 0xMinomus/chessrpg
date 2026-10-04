// Pembayaran resource kartu: mana, jatah kartu gratis, batas EN, draw tangan.
//
// Aturan biaya mengikuti prototipe dungeon aktif secara verbatim:
// - Kartu membayar MANA (heroMana), bukan EN.
// - Reroll seluruh tangan membayar EN (energy): putaran pertama tiap giliran
//   gratis, putaran berikutnya 1 EN. Batas dasar 2 + bonusRerolls.
// - Surcharge: kartu offense +offenseSurcharge milik Nila, kartu joker
//   +jokerSurcharge milik Saka. Diskon Fokus cadangan −1, minimum 0.

import {
  ENERGY_CAP,
  HERO_MANA_CAP,
  type BattleDeps,
  type BattleState,
  type CardDef,
  type HeroDef,
} from './state.ts';

export function currentCardCost(card: CardDef, hero: HeroDef, reserveArmed: boolean): number {
  const surcharge =
    (card.kind === 'offense' ? hero.offenseSurcharge ?? 0 : 0) +
    (card.kind === 'joker' ? hero.jokerSurcharge ?? 0 : 0);
  return Math.max(0, card.cost + surcharge - (reserveArmed ? 1 : 0));
}

export interface CardPlayability {
  ok: boolean;
  reason: string;
}

/** Cek jatah kartu 0-mana + kecukupan mana (tanpa mengubah state). */
export function canPlayCard(
  state: BattleState,
  card: CardDef,
  hero: HeroDef,
): CardPlayability {
  if (state.bossCardSilence) {
    return { ok: false, reason: 'Kartu skill terkunci untuk giliran putih ini.' };
  }
  if (card.cost === 0 && state.freeSkillUsedThisTurn) {
    return { ok: false, reason: 'Jatah satu kartu 0 mana per giliran sudah dipakai.' };
  }
  const cost = currentCardCost(card, hero, state.reserveArmed);
  if (state.heroMana < cost) {
    return {
      ok: false,
      reason: 'Butuh ' + cost + ' mana; mana sekarang ' + state.heroMana + ' / ' + HERO_MANA_CAP + '.',
    };
  }
  return { ok: true, reason: '' };
}

/** Bayar biaya kartu: kurangi mana, habiskan diskon cadangan. */
export function payCardCost(state: BattleState, card: CardDef, hero: HeroDef): BattleState {
  const cost = currentCardCost(card, hero, state.reserveArmed);
  return { ...state, heroMana: state.heroMana - cost, reserveArmed: false };
}

/** Kembalikan mana saat kartu target dibatalkan (dibatasi kapasitas). */
export function refundCardCost(state: BattleState, amount: number): BattleState {
  return { ...state, heroMana: Math.min(HERO_MANA_CAP, state.heroMana + amount) };
}

export function gainMana(state: BattleState, amount: number): BattleState {
  return { ...state, heroMana: Math.min(HERO_MANA_CAP, state.heroMana + amount) };
}

export function gainEnergy(state: BattleState, amount: number): BattleState {
  return { ...state, energy: Math.min(ENERGY_CAP, state.energy + amount) };
}

export function loseEnergy(state: BattleState, amount: number): BattleState {
  return { ...state, energy: Math.max(0, state.energy - amount) };
}

export function gainEnemyEnergy(state: BattleState, amount: number): BattleState {
  return { ...state, enemyEnergy: Math.min(ENERGY_CAP, state.enemyEnergy + amount) };
}

export function loseEnemyEnergy(state: BattleState, amount: number): BattleState {
  return { ...state, enemyEnergy: Math.max(0, state.enemyEnergy - amount) };
}

/** Batas putar ulang giliran ini: 2 + bonus (Kartu Keberuntungan). */
export function rerollLimit(state: Pick<BattleState, 'bonusRerolls'>): number {
  return 2 + state.bonusRerolls;
}

/** Biaya EN putar ulang: putaran pertama gratis, berikutnya 1 EN. */
export function rerollCost(state: Pick<BattleState, 'rollsThisTurn'>): number {
  return state.rollsThisTurn === 0 ? 0 : 1;
}

/**
 * Tarik satu kartu dengan bobot (Joker 0,2 vs biasa 1), tanpa duplikat
 * terhadap daftar excluded. Cerminan drawSkill prototipe.
 */
export function drawCard(
  cards: CardDef[],
  excluded: string[],
  rng: { next(): number },
): string {
  const options = cards.filter(function (card) {
    return excluded.indexOf(card.id) === -1;
  });
  const totalWeight = options.reduce(function (total, card) {
    return total + (card.weight ?? 1);
  }, 0);
  let roll = rng.next() * totalWeight;
  for (let i = 0; i < options.length; i += 1) {
    roll -= options[i].weight ?? 1;
    if (roll < 0) return options[i].id;
  }
  return options[options.length - 1].id;
}

function cardList(deps: BattleDeps, deckCardIds?: string[]): CardDef[] {
  if (!deckCardIds) return Object.values(deps.cards);
  return deckCardIds
    .map(function (id) {
      return deps.cards[id];
    })
    .filter(function (card): card is CardDef {
      return card !== undefined;
    });
}

/** Tangan baru 3 kartu tanpa duplikat. Cerminan makeHand prototipe. */
export function makeHand(excluded: string[], deps: BattleDeps, deckCardIds?: string[]): [string, string, string] {
  const hand: string[] = [];
  const blocked = excluded.slice();
  while (hand.length < 3) {
    hand.push(drawCard(cardList(deps, deckCardIds), blocked.concat(hand), deps.rng));
  }
  return [hand[0], hand[1], hand[2]];
}

/**
 * Ganti satu slot tangan setelah kartu dipakai (cerminan replaceHandSlot).
 * Kartu berbiaya dasar 0 yang dikonsumsi menghanguskan jatah gratis giliran.
 */
export function replaceHandSlot(
  state: BattleState,
  deps: BattleDeps,
  slot: number,
  oldId: string | null,
): BattleState {
  const old = oldId ? deps.cards[oldId] : undefined;
  const freeUsed = state.freeSkillUsedThisTurn || (old != null && old.cost === 0);
  const excluded = state.hand.filter(function (_id, index) {
    return index !== slot;
  });
  if (oldId) excluded.push(oldId);
  const next = state.hand.slice();
  next[slot] = drawCard(cardList(deps, state.deckCardIds), excluded, deps.rng);
  return { ...state, freeSkillUsedThisTurn: freeUsed, hand: next, dealtSlot: slot };
}
