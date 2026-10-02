// Progres kampanye dungeon: koin, hero, boss yang ditaklukkan.
// Murni (tanpa DOM/storage); adapter browser menyimpan hasil normalisasi.

import { defaultDeckSelection, normalizeDeckSelection, type DeckCatalog } from './deck.ts';

export interface Campaign {
  coins: number;
  ownedHeroes: string[];
  selectedHero: string;
  defeatedBosses: string[];
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
    defeatedBosses: [],
    deckCardIds: defaultDeckSelection(deckCatalog),
  };
}

/**
 * Normalisasi save mentah → kampanye yang dapat dimainkan.
 * Cerminan loadCampaign prototipe: JSON rusak / field hilang / nilai invalid
 * jatuh ke default; ownedHeroes selalu daftar penuh (build pengujian);
 * defeatedBosses disaring ke id boss yang dikenal.
 */
export function normalizeCampaign(
  raw: unknown,
  heroIds: string[],
  bossIds: string[],
  deckCatalog: DeckCatalog,
): Campaign {
  const fallback = defaultCampaign(heroIds, deckCatalog);
  if (!raw || typeof raw !== 'object') {
    return { ...fallback, ownedHeroes: heroIds.slice(), defeatedBosses: [] };
  }
  const stored = raw as Record<string, unknown>;
  const defeatedBosses = Array.isArray(stored.defeatedBosses)
    ? (stored.defeatedBosses as unknown[]).filter(function (id): id is string {
        return typeof id === 'string' && bossIds.indexOf(id) !== -1;
      })
    : [];
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
    defeatedBosses,
    deckCardIds: normalizeDeckSelection(stored.deckCardIds, deckCatalog),
  };
}

/** Boss terbuka bila boss sebelumnya sudah dikalahkan (lantai 1 selalu buka). */
export function isBossUnlocked(
  bossIds: string[],
  campaign: Campaign,
  bossId: string,
): boolean {
  const index = bossIds.indexOf(bossId);
  if (index <= 0) return index === 0;
  return campaign.defeatedBosses.indexOf(bossIds[index - 1]) !== -1;
}

/** Boss terbuka berikutnya yang belum dikalahkan; terakhir bila semua selesai. */
export function nextBossId(bossIds: string[], campaign: Campaign): string {
  const next = bossIds.find(function (id) {
    return isBossUnlocked(bossIds, campaign, id) && campaign.defeatedBosses.indexOf(id) === -1;
  });
  return next ?? bossIds[bossIds.length - 1];
}

export interface RewardClaim {
  campaign: Campaign;
  firstClear: boolean;
}

/**
 * Klaim hadiah kemenangan: kemenangan pertama atas boss menambah defeatedBosses
 * + koin; pengulangan tidak memberi apa-apa.
 */
export function claimReward(
  campaign: Campaign,
  bossId: string,
  reward: number,
): RewardClaim {
  if (campaign.defeatedBosses.indexOf(bossId) !== -1) {
    return { campaign, firstClear: false };
  }
  return {
    campaign: {
      ...campaign,
      defeatedBosses: campaign.defeatedBosses.concat([bossId]),
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
