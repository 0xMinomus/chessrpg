import { BOSSES } from '../src/content/bosses.ts';
import { CHAPTERS, DUNGEON_FLOORS, LEGACY_BOSS_IDS } from '../src/content/dungeon.ts';
import { CARDS } from '../src/content/cards.ts';
import { HEROES } from '../src/content/heroes.ts';
import {
  claimFloorReward,
  defaultCampaign,
  isFloorUnlocked,
  nextFloorId,
  normalizeCampaign,
} from '../src/domain/campaign/progress.ts';
import { CAMPAIGN_STORAGE_KEY, createCampaignStore, createMemoryBacking } from '../src/adapters/browser-storage.ts';

const heroIds = HEROES.map((hero) => hero.id);
const floorIds = DUNGEON_FLOORS.map((floor) => floor.id);
const deckCatalog = {
  regularCardIds: CARDS.filter((card) => card.kind !== 'joker').map((card) => card.id),
  jokerCardIds: CARDS.filter((card) => card.kind === 'joker').map((card) => card.id),
};
let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, condition: boolean, detail = ''): void {
  if (condition) passed += 1;
  else {
    failed += 1;
    failures.push(name + (detail ? ' :: ' + detail : ''));
  }
}

function main(): void {
  check('campaign: sepuluh chapter', CHAPTERS.length === 10, String(CHAPTERS.length));
  check('campaign: chapter tersebar ke enam region peta', new Set(CHAPTERS.map((chapter) => chapter.area)).size === 6);
  check('campaign: 50 lantai', DUNGEON_FLOORS.length === 50, String(DUNGEON_FLOORS.length));
  check(
    'campaign: tiap chapter tepat lima lantai dan boss di lantai kelima',
    CHAPTERS.every((chapter) => {
      const floors = DUNGEON_FLOORS.filter((floor) => floor.chapterId === chapter.id);
      return floors.length === 5 && floors[4].floorNumber === 5 && floors[4].isBoss && floors[4].id === chapter.bossId;
    }),
  );
  check('campaign: ID lantai unik', new Set(floorIds).size === 50);
  check('campaign: sepuluh boss memakai skill berbeda', BOSSES.length === 10 && new Set(BOSSES.map((boss) => boss.ruleKey)).size === 10);

  const fresh = defaultCampaign(heroIds, deckCatalog);
  check('progres: hanya lantai pertama yang terbuka saat awal', isFloorUnlocked(floorIds, fresh, floorIds[0]) && !isFloorUnlocked(floorIds, fresh, floorIds[1]));
  check('progres: tantangan berikutnya lantai pertama', nextFloorId(floorIds, fresh) === floorIds[0]);
  const lockedBoss = claimFloorReward(fresh, DUNGEON_FLOORS[4].id, DUNGEON_FLOORS[4].reward, floorIds);
  check('progres: hadiah boss terkunci tidak dapat diklaim', !lockedBoss.firstClear);

  let campaign = fresh;
  for (let index = 0; index < 4; index += 1) {
    const floor = DUNGEON_FLOORS[index];
    const claim = claimFloorReward(campaign, floor.id, floor.reward, floorIds);
    campaign = claim.campaign;
    check('progres: kemenangan membuka lantai ' + (index + 2), claim.firstClear && isFloorUnlocked(floorIds, campaign, floorIds[index + 1]));
  }
  check('progres: chapter berikutnya tetap terkunci sebelum boss', !isFloorUnlocked(floorIds, campaign, DUNGEON_FLOORS[5].id));
  check('progres: boss chapter terbuka setelah empat lantai', isFloorUnlocked(floorIds, campaign, DUNGEON_FLOORS[4].id));
  check('progres: boss menjadi tantangan berikutnya', nextFloorId(floorIds, campaign) === DUNGEON_FLOORS[4].id);
  const bossClear = claimFloorReward(campaign, DUNGEON_FLOORS[4].id, DUNGEON_FLOORS[4].reward, floorIds);
  check('progres: boss mengalahkan lantai boss membuka chapter selanjutnya', bossClear.firstClear && isFloorUnlocked(floorIds, bossClear.campaign, DUNGEON_FLOORS[5].id));
  check('progres: chapter selanjutnya menjadi tantangan berikutnya', nextFloorId(floorIds, bossClear.campaign) === DUNGEON_FLOORS[5].id);
  const replay = claimFloorReward(bossClear.campaign, DUNGEON_FLOORS[4].id, DUNGEON_FLOORS[4].reward, floorIds);
  check('hadiah: replay tidak menggandakan clear atau koin', !replay.firstClear && replay.campaign.coins === bossClear.campaign.coins);

  const originalDeck = fresh.deckCardIds.join(',');
  const migrated = normalizeCampaign(
    {
      coins: 77,
      selectedHero: 'liora',
      defeatedBosses: LEGACY_BOSS_IDS.slice(0, 3),
      deckCardIds: fresh.deckCardIds,
    },
    heroIds,
    floorIds,
    LEGACY_BOSS_IDS,
    deckCatalog,
  );
  check('save lama: progres tiga boss lama diterjemahkan ke tiga chapter selesai', migrated.clearedFloorIds.length === 15);
  check('save lama: coin, hero, dan deck tetap utuh', migrated.coins === 77 && migrated.selectedHero === 'liora' && migrated.deckCardIds.join(',') === originalDeck);
  check('save lama: progres berlanjut setelah chapter boss lama', nextFloorId(floorIds, migrated) === DUNGEON_FLOORS[15].id);
  const backing = createMemoryBacking();
  const store = createCampaignStore(backing, LEGACY_BOSS_IDS);
  check('save: progres tersimpan', store.save(migrated));
  const storedRaw = backing.getItem(CAMPAIGN_STORAGE_KEY);
  const storedValue: unknown = storedRaw === null ? null : JSON.parse(storedRaw);
  let legacyProjection: string[] = [];
  if (storedValue && typeof storedValue === 'object' && 'defeatedBosses' in storedValue && Array.isArray(storedValue.defeatedBosses)) {
    legacyProjection = storedValue.defeatedBosses.filter((id): id is string => typeof id === 'string');
  }
  check('save: rollback mempertahankan progres untuk tiga boss lama', legacyProjection.join(',') === LEGACY_BOSS_IDS.slice(0, 3).join(','));
  const reloaded = store.load(heroIds, floorIds, deckCatalog);
  check('save: reload mempertahankan progres chapter baru', reloaded.clearedFloorIds.join(',') === migrated.clearedFloorIds.join(','));

  const corruptOrder = normalizeCampaign(
    { clearedFloorIds: [floorIds[0], floorIds[2]] },
    heroIds,
    floorIds,
    LEGACY_BOSS_IDS,
    deckCatalog,
  );
  check('save: lantai out-of-order tidak melewati gerbang', corruptOrder.clearedFloorIds.join(',') === floorIds[0] && nextFloorId(floorIds, corruptOrder) === floorIds[1]);

  console.log('PASS ' + passed + ' / FAIL ' + failed);
  for (const failure of failures) console.log('  FAIL: ' + failure);
  if (failed > 0) throw new Error(failures.join('\n'));
}

main();
