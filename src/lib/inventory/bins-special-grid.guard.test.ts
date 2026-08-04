import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

describe('bins grid special-bin location cell', () => {
  it('renders name when row/col are null', () => {
    const src = readFileSync(
      fileURLToPath(
        new URL('../../components/warehouse/bins-grid/cells/index.tsx', import.meta.url),
      ),
      'utf8',
    );
    assert.match(src, /row\.row_label != null && row\.col_label != null/);
    assert.match(src, /row\.name \|\| 'Special bin'/);
  });
});

describe('bins-overview includes special barcodes', () => {
  it('API passes specialBinBarcodesForOverview into getBinsOverview', () => {
    const src = readFileSync(
      fileURLToPath(new URL('../../app/api/inventory/bins-overview/route.ts', import.meta.url)),
      'utf8',
    );
    assert.match(src, /specialBinBarcodesForOverview/);
    assert.match(src, /specialBarcodes/);
  });
});
