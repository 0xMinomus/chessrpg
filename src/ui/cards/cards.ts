// Tangan kartu: 3 slot + tombol putar ulang.
//
// Markup mengikuti katalog desain `cards.html`: kartu berbingkai kertas krem
// dengan sudut terpotong, aksen warna per jenis (Serang/Bertahan/Mantra/
// Konsumsi/Joker), ikon garis 64×64, blok judul + deskripsi, dan baris status.
// Kartu tetap satu tombol utuh untuk tetikus, sentuh, dan keyboard.

import { cardIconSrc, REROLL_ICON } from './icons.ts';

export type CardKind = 'offense' | 'defense' | 'spell' | 'consumable' | 'joker';

export interface CardMeta {
  id: string;
  name: string;
  cost: number;
  kind: CardKind;
  tag: string;
  desc: string;
  /** Kunci ikon di src/ui/cards/icons.ts (satu ikon per kartu). */
  icon: string;
}

export interface CardSlotView {
  card: CardMeta;
  cost: number;
  targeting: boolean;
  locked: boolean;
  stateLabel: string;
  actionLabel: string;
  /** Mana saat ini kurang untuk membayar kartu ini (tampilan abu-abu). */
  unaffordable?: boolean;
}

export interface RerollView {
  available: boolean;
  label: string;
  caption: string;
  disabled: boolean;
  reason: string;
}

/** Sudut terpotong (notch) supaya kartu terasa seperti kartu cetak retro. */
const NOTCH = 'polygon(10px 0,calc(100% - 10px) 0,calc(100% - 10px) 4px,calc(100% - 4px) 4px,calc(100% - 4px) 10px,100% 10px,100% calc(100% - 10px),calc(100% - 10px) calc(100% - 10px),calc(100% - 10px) 100%,10px 100%,10px calc(100% - 4px),4px calc(100% - 4px),4px calc(100% - 10px),0 calc(100% - 10px),0 10px,4px 10px,4px 4px,10px 4px)';

function escape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function renderHand(slots: CardSlotView[], commandName = 'card'): string {
  return slots
    .map(function (slot, index) {
      const card = slot.card;
      const free = slot.cost === 0;
      const costLabel = free ? '0 MANA' : String(slot.cost).padStart(2, '0') + ' MANA';
      const baseLabel = free ? 'Biaya 0 mana' : 'Biaya ' + slot.cost + ' mana';
      const ariaLabel = slot.targeting
        ? 'Batalkan ' + card.name + ' dan kembalikan ' + slot.cost + ' mana'
        : card.name + '. ' + card.desc + ' ' + baseLabel + '. ' + slot.stateLabel + '. ' + slot.actionLabel + '.';
      const stateClass = slot.targeting
        ? ' is-targeting'
        : slot.locked
          ? ' is-locked' + (slot.unaffordable ? ' is-unaffordable' : '')
          : ' is-ready';
      return (
        '<article class="skill-card kind-' +
        card.kind +
        stateClass +
        '" role="listitem" data-card-id="' +
        escape(card.id) +
        '">' +
        '<div class="card-face" style="--card-notch:' +
        NOTCH +
        '">' +
        '<span class="card-top">' +
        '<span class="card-kind"><i class="kind-mark" aria-hidden="true"></i>' +
        escape(card.tag) +
        '</span>' +
        '<span class="card-cost' +
        (free ? ' free' : '') +
        '" title="' +
        baseLabel +
        '">' +
        costLabel +
        '</span>' +
        '</span>' +
        '<span class="card-art" aria-hidden="true">' +
        '<img class="card-icon" src="' +
        cardIconSrc(card.icon) +
        '" alt="" loading="lazy" decoding="async"/>' +
        '</span>' +
        '<span class="card-copy"><span class="card-title" role="heading" aria-level="3">' +
        escape(card.name) +
        '</span><span class="card-description">' +
        escape(card.desc) +
        '</span></span>' +
        '<span class="card-state"><span>' +
        escape(slot.stateLabel) +
        '</span><strong>' +
        escape(slot.actionLabel) +
        '</strong></span>' +
        '</div>' +
        '<button class="card-play" type="button" data-command="' +
        commandName +
        '" data-slot="' +
        index +
        '" aria-pressed="' +
        (slot.targeting ? 'true' : 'false') +
        '" aria-label="' +
        escape(ariaLabel) +
        '"' +
        (slot.locked ? ' disabled' : '') +
        '></button>' +
        '</article>'
      );
    })
    .join('');
}

export function renderReroll(view: RerollView): string {
  return (
    '<button class="roll-availability" type="button" data-command="reroll" aria-label="' +
    view.label +
    '. ' +
    view.reason +
    '"' +
    (view.disabled ? ' disabled' : '') +
    ' title="' +
    view.reason +
    '">' +
    '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
    REROLL_ICON +
    '</svg>' +
    '<span class="roll-counter">Putar kartu</span>' +
    '<small class="roll-caption">' +
    view.caption +
    '</small></button>'
  );
}
