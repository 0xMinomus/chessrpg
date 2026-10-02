// Progres kampanye dungeon: koin, hero, dan lantai yang ditaklukkan.
// Murni (tanpa DOM/storage); adapter browser menyimpan hasil normalisasi.

import { defaultDeckSelection, normalizeDeckSelection, type DeckCatalog } from './deck.ts';

export interface Campaign {
  coins: number;
  ownedHeroes: string[];
  selectedHero: string;
  clearedFloorIds: string[];
  deckCardIds: string[];
}

/**
 * Kampanye awal: 30 koin, semua hero terbuka untuk pengujian baseline,
 * hero aktif Arunika. Cerminan defaultCampaign prototipe.
 */
export function defaultCampaign(heroIds: string[], deckCatalog: DeckCatalog): Campaign {
  return {
    coins: 30,
    ownedHeroes: heroIds.slice(),
    selectedHero: heroIds.indexOf('arunika') !== -1 ? 'arunika' : (heroIds[0] ?? 'arunika'),
    clearedFloorIds: [],
    deckCardIds: defaultDeckSelection(deckCatalog),
  };
}

/**
 * Normalisasi save mentah → kampanye yang dapat dimainkan. Save boss lama
 * dipetakan ke chapter lengkap; progres baru dipotong pada prefix berurutan.
 */
export function normalizeCampaign(
  raw: unknown,
  heroIds: string[],
  floorIds: readonly string[],
  legacyBossIds: readonly string[],
  deckCatalog: DeckCatalog,
): Campaign {
  const fallback = defaultCampaign(heroIds, deckCatalog);
  if (!raw || typeof raw !== 'object') {
    return { ...fallback, ownedHeroes: heroIds.slice(), clearedFloorIds: [] };
  }
  const stored = raw as Record<string, unknown>;
  const clearedFloorIds = normalizeClearedFloorIds(
    stored.clearedFloorIds,
    stored.defeatedBosses,
    floorIds,
    legacyBossIds,
  );
  const selectedHero =
    typeof stored.selectedHero === 'string' && heroIds.indexOf(stored.selectedHero) !== -1
      ? stored.selectedHero
      : fallback.selectedHero;
  return {
    coins:
      typeof stored.coins === 'number' && Number.isFinite(stored.coins)
        ? Math.max(0, stored.coins)
        : fallback.coins,
    ownedHeroes: heroIds.slice(),
    selectedHero,
    clearedFloorIds,
    deckCardIds: normalizeDeckSelection(stored.deckCardIds, deckCatalog),
  };
}

function normalizeClearedFloorIds(
  currentValue: unknown,
  legacyValue: unknown,
  floorIds: readonly string[],
  legacyBossIds: readonly string[],
): string[] {
  const requested = new Set<string>();
  if (Array.isArray(currentValue)) {
    for (const id of currentValue) {
      if (typeof id === 'string' && floorIds.indexOf(id) !== -1) requested.add(id);
    }
  } else {
    const legacyClears = new Set<string>();
    if (Array.isArray(legacyValue)) {
      for (const id of legacyValue) {
        if (typeof id === 'string') legacyClears.add(id);
      }
    }
    let clearedThrough = -1;
    for (const bossId of legacyBossIds) {
      if (!legacyClears.has(bossId)) break;
      const bossFloorIndex = floorIds.indexOf(bossId);
      if (bossFloorIndex < 0) break;
      clearedThrough = bossFloorIndex;
    }
    for (const id of floorIds.slice(0, clearedThrough + 1)) requested.add(id);
  }

  const ordered: string[] = [];
  for (const id of floorIds) {
    if (!requested.has(id)) break;
    ordered.push(id);
  }
  return ordered;
}

/** Lantai pertama terbuka; selanjutnya menunggu clear pada lantai sebelumnya. */
export function isFloorUnlocked(
  floorIds: readonly string[],
  campaign: Campaign,
  floorId: string,
): boolean {
  const index = floorIds.indexOf(floorId);
  if (index < 0) return false;
  return index === 0 || campaign.clearedFloorIds.indexOf(floorIds[index - 1]) !== -1;
}

/** Lantai clear berurutan berikutnya; setelah tamat, pilih lantai terakhir. */
export function nextFloorId(floorIds: readonly string[], campaign: Campaign): string {
  const next = floorIds.find((id) => campaign.clearedFloorIds.indexOf(id) === -1);
  return next ?? floorIds[floorIds.length - 1] ?? '';
}

export interface RewardClaim {
  campaign: Campaign;
  firstClear: boolean;
}

/** Hadiah hanya diberikan sekali dan hanya untuk lantai yang sedang terbuka. */
export function claimFloorReward(
  campaign: Campaign,
  floorId: string,
  reward: number,
  floorIds: readonly string[],
): RewardClaim {
  if (
    campaign.clearedFloorIds.indexOf(floorId) !== -1 ||
    !isFloorUnlocked(floorIds, campaign, floorId)
  ) {
    return { campaign, firstClear: false };
  }
  return {
    campaign: {
      ...campaign,
      clearedFloorIds: campaign.clearedFloorIds.concat([floorId]),
      coins: campaign.coins + reward,
    },
    firstClear: true,
  };
}


/** Pilih hero aktif (harus ada di daftar hero yang dikenal). */
export function chooseHero(campaign: Campaign, heroId: string, heroIds: string[]): Campaign {
  if (heroIds.indexOf(heroId) === -1) return campaign;
  return { ...campaign, selectedHero: heroId };
}
