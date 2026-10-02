import type { CardKind } from './cards/cards.ts';

export const HERO_CAST_EFFECTS = {
  phase: 'hero-phase',
  fold: 'hero-fold',
  focus: 'hero-focus',
  smite: 'hero-smite',
  ward: 'hero-ward',
  aegis: 'hero-aegis',
  pawnstep: 'hero-pawnstep',
  pawnrush: 'hero-pawnrush',
  snare: 'hero-snare',
  skip: 'hero-skip',
  blockade: 'hero-blockade',
  citadel: 'hero-citadel',
} as const;

export const CARD_CAST_EFFECTS = {
  offense: 'card-offense',
  defense: 'card-defense',
  spell: 'card-spell',
  consumable: 'card-consumable',
  joker: 'card-joker',
} as const satisfies Record<CardKind, string>;

function playEffect(root: HTMLElement, effectName: string | undefined): void {
  if (!effectName) return;
  const stage = root.querySelector<HTMLElement>('.board-stage');
  if (!stage) return;

  stage.querySelector('.combat-cast-fx')?.remove();
  const effect = document.createElement('div');
  effect.className = 'combat-cast-fx';
  effect.dataset['effect'] = effectName;
  effect.setAttribute('aria-hidden', 'true');
  effect.append(document.createElement('i'), document.createElement('i'), document.createElement('i'));
  effect.addEventListener('animationend', function (event) {
    if (event.target === effect) effect.remove();
  });
  effect.addEventListener('animationcancel', function (event) {
    if (event.target === effect) effect.remove();
  });
  stage.append(effect);
}

export function playHeroCastFx(root: HTMLElement, action: string): void {
  playEffect(root, HERO_CAST_EFFECTS[action as keyof typeof HERO_CAST_EFFECTS]);
}

export function playCardCastFx(root: HTMLElement, kind: CardKind): void {
  playEffect(root, CARD_CAST_EFFECTS[kind]);
}
