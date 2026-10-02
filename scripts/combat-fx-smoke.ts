import { CARDS } from '../src/content/cards.ts';
import { HEROES } from '../src/content/heroes.ts';
import { CARD_CAST_EFFECTS, HERO_CAST_EFFECTS } from '../src/ui/combat-fx.ts';

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean): void {
  if (condition) {
    passed += 1;
    console.log('PASS', name);
  } else {
    failed += 1;
    console.error('FAIL', name);
  }
}

const heroActions = HEROES.flatMap((hero) => [hero.skillAction, hero.ultimateAction]);
const heroEffects = heroActions.map((action) => HERO_CAST_EFFECTS[action as keyof typeof HERO_CAST_EFFECTS]);
const cardEffects = CARDS.map((card) => CARD_CAST_EFFECTS[card.kind]);

check('setiap skill dan ultimate hero punya efek cast', heroEffects.every(Boolean));
check('semua skill dan ultimate hero punya efek visual berbeda', new Set(heroEffects).size === heroActions.length);
check('setiap kartu mendapat efek dari jenisnya', cardEffects.length === CARDS.length && cardEffects.every(Boolean));
check('kartu berbagi lima keluarga efek, bukan satu efek per kartu', new Set(cardEffects).size === 5 && CARDS.length > 5);

console.log(`combat FX smoke: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} combat FX check(s) failed`);
