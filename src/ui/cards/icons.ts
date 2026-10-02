// Definisi ikon kartu, disalin dari katalog desain cards.html.
//
// Semua ikon memakai viewBox 0 0 64 64 dengan garis (stroke) agar tetap tajam
// saat diperbesar, dan sekali didefinisikan sebagai <symbol> lalu dipakai ulang
// lewat <use>. Kartu yang berbagi efek memakai ikon yang sama, sama seperti
// di katalog.

export const CARD_ICON_SYMBOLS: Record<string, string> = {
  lancer: '<path d="M13 47h16V31h15V16h8M44 31l8-8 8 8M29 47l-8 8"/>',
  tempo: '<path d="M12 49h13V37h13V25h13V13h5M47 13h9v9"/>',
  ration:
    '<path d="M24 12h16M28 12v13L17 45a5 5 0 0 0 4 7h22a5 5 0 0 0 4-7L36 25V12M24 39h24M28 33h7"/>',
  ward: '<path d="M32 8 51 16v14c0 12-8 20-19 26-11-6-19-14-19-26V16zM23 32l6 6 13-14"/>',
  disrupt: '<path d="M10 32h9l6-12 8 24 7-15 5 7h9M10 12v6M54 46v6"/>',
  focus:
    '<circle cx="32" cy="32" r="17"/><circle cx="32" cy="32" r="5"/><path d="M32 7v11M32 46v11M7 32h11M46 32h11"/>',
  pawnstep:
    '<circle cx="32" cy="17" r="7"/><path d="M22 29h20l5 16H17zM14 52h36M12 23l-5-5M52 23l5-5"/>',
  mark: '<circle cx="32" cy="32" r="15"/><circle cx="32" cy="32" r="5"/><path d="M32 6v12M32 46v12M6 32h12M46 32h12"/>',
  pierce: '<path d="M12 18h28l12 14-12 14H12M30 24l8 8-8 8M5 32h29"/>',
  shock: '<path d="M37 7 15 35h15l-4 22 23-31H34z"/>',
  leech: '<circle cx="19" cy="23" r="8"/><circle cx="45" cy="41" r="8"/><path d="m25 29 14 8M32 19l7 5-7 5M32 45l-7-5 7-5"/>',
  surcharge: '<path d="M14 17h36M14 28h25M14 39h36M14 50h25M44 24v9M40 28h9"/>',
  counterspell: '<path d="M32 8 51 16v14c0 12-8 20-19 26-11-6-19-14-19-26V16zM24 25l16 16M40 25 24 41"/>',
  parry: '<path d="M45 17a20 20 0 1 0 5 24M45 17V7M45 17H35M17 32h18l9-9"/>',
  riposte: '<path d="M14 49 49 14M38 14h11v11M14 38v11h11M20 20l24 24"/>',
  reserve:
    '<rect x="13" y="16" width="38" height="33"/><path d="M20 24h24M20 32h24M20 40h12M44 44v-8M40 40h8"/>',
  quiet: '<path d="M12 42h40M18 34h28M24 26h16M30 18h4M13 49h38"/>',
  lastLaugh: '<path d="M13 42 25 30l8 7 18-21M41 16h10v10M16 50h32"/>',
  salvage:
    '<path d="M16 17h32v34H16zM22 25h20M22 33h14M22 41h8M39 43l5 5 9-12"/>',
  relay:
    '<rect x="10" y="17" width="18" height="28"/><rect x="36" y="17" width="18" height="28"/><path d="M23 10 30 17l-7 7M41 52l-7-7 7-7M25 17h14M39 45H25"/>',
  phase:
    '<rect x="12" y="12" width="40" height="40"/><path d="M20 20h8v8h-8zM36 36h8v8h-8zM28 24l12 12M34 24l6-6M34 40l-6 6"/>',
  prism: '<path d="m32 10 23 42H9zM20 40h24M25 31h14M29 22h6M32 10v12M32 32v20"/>',
  pawnraid:
    '<circle cx="32" cy="17" r="7"/><path d="M22 29h20l5 16H17zM14 52h36M32 47V27M26 34l6-7 6 7"/>',
  rookbend: '<path d="M16 51h32M20 47V25h24v22M17 25V15h8v6h8v-6h8v10M23 39h18M26 34l6-6 6 6"/>',
  stagger: '<path d="M13 46 26 33l8 7 17-20M41 20l10 0 0 10M13 17l10 7M16 52h33"/>',
  snare: '<path d="M13 18h38M13 46h38M18 18v10l14 9 14-9V18M18 46V36l14-9 14 9v10M32 18v9M32 37v9"/>',
  sacrifice:
    '<circle cx="32" cy="16" r="6"/><path d="M23 28h18l5 16H18zM13 51h38M32 34v10M27 39h10"/>',
  blockade: '<path d="M12 20h40M12 32h40M12 44h40M18 13v38M32 13v38M46 13v38"/>',
  fortune: '<path d="M14 14h28v36H14zM22 9h28v36M29 4h22v36M35 15v13M42 21v13"/>',
};

/** Ikon refresh solid agar kedua ujung panah menyatu jelas dengan lingkaran. */
export const REROLL_ICON = '<path d="M17.65 6.35C16.2 4.9 14.21 4 12 4 7.58 4 4 7.58 4 12s3.58 8 8 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0 1 12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>';

/** Blok <symbol> untuk disisipkan sekali per render (disembunyikan, tanpa layout). */
export function renderCardIconDefs(): string {
  const symbols = Object.keys(CARD_ICON_SYMBOLS)
    .map(function (id) {
      return '<symbol id="icon-' + id + '" viewBox="0 0 64 64">' + CARD_ICON_SYMBOLS[id] + '</symbol>';
    })
    .join('');
  return (
    '<svg class="icon-defs" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">' +
    symbols +
    '</svg>'
  );
}

/** Path inline sebagai cadangan saat <symbol> belum tersedia (mis. render pertama). */
export function inlineCardIcon(icon: string): string {
  return CARD_ICON_SYMBOLS[icon] ?? CARD_ICON_SYMBOLS.shock;
}

export function hasCardIcon(icon: string): boolean {
  return Object.prototype.hasOwnProperty.call(CARD_ICON_SYMBOLS, icon);
}
