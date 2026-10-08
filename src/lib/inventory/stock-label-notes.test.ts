/**
 * Stock label notes — remembered per org + SKU, blank forgets.
 *
 * Run: node --import tsx --test src/lib/inventory/stock-label-notes.test.ts
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readStockLabelNotes, rememberStockLabelNotes, type StockLabelNotesStorage } from './stock-label-notes';

function memoryStorage(): StockLabelNotesStorage & { size: () => number } {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
    size: () => map.size,
  };
}

describe('stock label notes', () => {
  it('the next print of the same SKU in the same org starts from the last notes', () => {
    const storage = memoryStorage();
    rememberStockLabelNotes(storage, 'org-a', 'apl-2639', 'Fragile\nTop shelf');
    assert.equal(readStockLabelNotes(storage, 'org-a', ' APL-2639 '), 'Fragile\nTop shelf');
    assert.equal(readStockLabelNotes(storage, 'org-b', 'APL-2639'), '');
    assert.equal(readStockLabelNotes(storage, 'org-a', 'APL-2640'), '');
  });

  it('blank notes forget the SKU; no storage, org or SKU is a no-op', () => {
    const storage = memoryStorage();
    rememberStockLabelNotes(storage, 'org-a', 'APL-2639', 'Fragile');
    rememberStockLabelNotes(storage, 'org-a', 'APL-2639', '   ');
    assert.equal(storage.size(), 0);
    rememberStockLabelNotes(storage, '', 'APL-2639', 'x');
    rememberStockLabelNotes(storage, 'org-a', ' ', 'x');
    rememberStockLabelNotes(null, 'org-a', 'APL-2639', 'x');
    assert.equal(storage.size(), 0);
    assert.equal(readStockLabelNotes(null, 'org-a', 'APL-2639'), '');
  });
});
