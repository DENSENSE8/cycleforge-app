/**
 * The notes a stock label last printed with, remembered per org + SKU on this
 * browser (operator 2026-10-08: the next print of the same SKU starts from the
 * last notes). Browser storage, not a column: the notes are a print-time
 * draft, not a fact of the SKU, and need no migration.
 */

/** The storage calls the notes need (`localStorage` in the app). */
export type StockLabelNotesStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const KEY_PREFIX = 'cf.stockLabelNotes';

function notesKey(orgId: string, sku: string): string {
  return `${KEY_PREFIX}:${orgId}:${sku.trim().toUpperCase()}`;
}

/** This browser's localStorage, or null (server render, storage blocked). */
export function stockLabelNotesStorage(): StockLabelNotesStorage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** The last notes printed for this SKU in this org, or '' when none. */
export function readStockLabelNotes(storage: StockLabelNotesStorage | null, orgId: string, sku: string): string {
  if (!storage || !orgId || !sku.trim()) return '';
  try {
    return storage.getItem(notesKey(orgId, sku)) ?? '';
  } catch {
    return '';
  }
}

/** Remember the notes this SKU just printed with; blank notes forget them. */
export function rememberStockLabelNotes(storage: StockLabelNotesStorage | null, orgId: string, sku: string, notes: string): void {
  if (!storage || !orgId || !sku.trim()) return;
  try {
    if (notes.trim()) storage.setItem(notesKey(orgId, sku), notes);
    else storage.removeItem(notesKey(orgId, sku));
  } catch {
    /* private mode / quota — the label still printed */
  }
}
