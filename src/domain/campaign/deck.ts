// Validasi dan operasi murni untuk loadout kartu kampanye.

export interface DeckCatalog {
  regularCardIds: string[];
  jokerCardIds: string[];
}

export const DECK_REGULAR_LIMIT = 10;
export const DECK_JOKER_LIMIT = 1;

export interface DeckSelectionStatus {
  regularCount: number;
  jokerCount: number;
  complete: boolean;
}

export function defaultDeckSelection(catalog: DeckCatalog): string[] {
  return catalog.regularCardIds.slice(0, DECK_REGULAR_LIMIT).concat(catalog.jokerCardIds.slice(0, DECK_JOKER_LIMIT));
}

/** Buang id asing/duplikat dan batasi tiap jenis tanpa mengubah urutan pilihan. */
export function normalizeDeckSelection(raw: unknown, catalog: DeckCatalog): string[] {
  if (!Array.isArray(raw)) return defaultDeckSelection(catalog);

  const selected: string[] = [];
  let regularCount = 0;
  let jokerCount = 0;
  for (const id of raw) {
    if (typeof id !== 'string' || selected.indexOf(id) !== -1) continue;
    if (catalog.regularCardIds.indexOf(id) !== -1 && regularCount < DECK_REGULAR_LIMIT) {
      selected.push(id);
      regularCount += 1;
    } else if (catalog.jokerCardIds.indexOf(id) !== -1 && jokerCount < DECK_JOKER_LIMIT) {
      selected.push(id);
      jokerCount += 1;
    }
  }
  return selected;
}

export function deckSelectionStatus(selection: string[], catalog: DeckCatalog): DeckSelectionStatus {
  const isList = Array.isArray(selection);
  const raw = isList ? selection : [];
  const normalized = normalizeDeckSelection(raw, catalog);
  const regularCount = normalized.filter(function (id) {
    return catalog.regularCardIds.indexOf(id) !== -1;
  }).length;
  const jokerCount = normalized.filter(function (id) {
    return catalog.jokerCardIds.indexOf(id) !== -1;
  }).length;
  const valid = isList && normalized.length === raw.length;
  return {
    regularCount,
    jokerCount,
    complete: valid && regularCount === DECK_REGULAR_LIMIT && jokerCount === DECK_JOKER_LIMIT,
  };
}

/** Tambah/hapus pilihan; percobaan melewati batas atau id asing tidak mengubah state. */
export function toggleDeckCard(selection: string[], cardId: string, catalog: DeckCatalog): string[] {
  const normalized = normalizeDeckSelection(selection, catalog);
  const selectedIndex = normalized.indexOf(cardId);
  if (selectedIndex !== -1) {
    return normalized.filter(function (id) {
      return id !== cardId;
    });
  }

  if (catalog.regularCardIds.indexOf(cardId) !== -1) {
    const count = normalized.filter(function (id) {
      return catalog.regularCardIds.indexOf(id) !== -1;
    }).length;
    if (count >= DECK_REGULAR_LIMIT) return normalized;
  } else if (catalog.jokerCardIds.indexOf(cardId) !== -1) {
    const count = normalized.filter(function (id) {
      return catalog.jokerCardIds.indexOf(id) !== -1;
    }).length;
    if (count >= DECK_JOKER_LIMIT) return normalized;
  } else {
    return normalized;
  }

  return normalized.concat(cardId);
}
