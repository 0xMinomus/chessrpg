// Adapter penyimpanan kampanye: satu-satunya pemilik akses storage.
// Key berversi dipertahankan dari prototipe; data dinormalisasi domain.

import {
  defaultCampaign,
  normalizeCampaign,
  type Campaign,
} from '../domain/campaign/progress.ts';
import type { DeckCatalog } from '../domain/campaign/deck.ts';

/** Key save kampanye dari prototipe dungeon aktif. */
export const CAMPAIGN_STORAGE_KEY = 'crown-catalyst-dungeon-v1';

export interface StorageBacking {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface CampaignStore {
  load(heroIds: string[], bossIds: string[], deckCatalog: DeckCatalog): Campaign;
  save(campaign: Campaign): boolean;
}

/** Backing in-memory untuk pengujian / saat storage browser tak tersedia. */
export function createMemoryBacking(initial: Record<string, string> = {}): StorageBacking {
  const data: Record<string, string> = { ...initial };
  return {
    getItem(key: string) {
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
    },
    setItem(key: string, value: string) {
      data[key] = value;
    },
  };
}

/** Backing localStorage; null bila browser tak menyediakan / menolak akses. */
export function createLocalStorageBacking(): StorageBacking | null {
  try {
    const storage = globalThis.localStorage;
    if (!storage) return null;
    return {
      getItem(key: string) {
        return storage.getItem(key);
      },
      setItem(key: string, value: string) {
        storage.setItem(key, value);
      },
    };
  } catch (_error) {
    return null;
  }
}

export function createCampaignStore(backing: StorageBacking | null): CampaignStore {
  return {
    load(heroIds: string[], bossIds: string[], deckCatalog: DeckCatalog): Campaign {
      if (!backing) return defaultCampaign(heroIds, deckCatalog);
      try {
        const raw = backing.getItem(CAMPAIGN_STORAGE_KEY);
        if (raw == null) return defaultCampaign(heroIds, deckCatalog);
        return normalizeCampaign(JSON.parse(raw) as unknown, heroIds, bossIds, deckCatalog);
      } catch (_error) {
        return defaultCampaign(heroIds, deckCatalog);
      }
    },
    save(campaign: Campaign): boolean {
      if (!backing) return false;
      try {
        backing.setItem(CAMPAIGN_STORAGE_KEY, JSON.stringify(campaign));
        return true;
      } catch (_error) {
        return false;
      }
    },
  };
}
