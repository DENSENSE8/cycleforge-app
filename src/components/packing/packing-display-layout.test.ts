import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const read = (path: string) => readFileSync(path, 'utf8');

const PACK_PANEL = read('src/components/packer/PackOrderPanel.tsx');
const PACK_CHECKLIST = read('src/components/packing/OrderPackChecklist.tsx');
const PACK_ROW = read('src/components/packing/PackChecklistLineRow.tsx');
const QC_PANEL = read('src/components/tech/TestingPanel.tsx');
const QC_ITEMS = read('src/components/tech/testing-panel/TestingPoUnboxingSection.tsx');

describe('packing station display layout', () => {
  it('uses the shared Items disclosure rather than a packing-only header', () => {
    assert.match(PACK_PANEL, /<StationScanPaneHost\b/);
    assert.match(PACK_PANEL, /<OrderPackChecklist\b/);
    assert.match(PACK_CHECKLIST, /embedded\??:\s*boolean/);
    assert.doesNotMatch(
      PACK_CHECKLIST,
      /<p[^>]*>Pack checklist<\/p>/,
      'packing content must not paint a second section header',
    );
  });

  it('uses the shared item-record face for packing lines', () => {
    assert.match(PACK_ROW, /ItemRecordRow/);
    assert.match(PACK_ROW, /data-item-record|<ItemRecordRow\b/);
    assert.doesNotMatch(
      PACK_ROW,
      /ItemRecordMetaGrid|PoLineMetaGrid/,
      'pack inherits desk six-track order from ItemRecordRow — no second meta grid',
    );
    assert.doesNotMatch(
      PACK_ROW,
      /aria-label=\{expanded \? ['"]Collapse details['"] : ['"]Expand details['"]\}/,
      'the packing adapter must not own a second expand/collapse button',
    );
  });

  it('inherits desk six-track order from ItemRecordMetaGrid', () => {
    const meta = read('src/design-system/components/item-record/ItemRecordMetaGrid.tsx');
    assert.deepEqual(
      [...meta.matchAll(/data-col="([^"]+)"/g)].map((m) => m[1]),
      ['qty', 'price', 'condition', 'sku', 'serial', 'location'],
    );
    assert.doesNotMatch(
      PACK_ROW,
      /<ItemRecordMetaGrid\b/,
      'Pack must not remount the desk six-track; ItemRecordRow owns it',
    );
    assert.doesNotMatch(
      read('src/design-system/components/item-record/ItemRecordMobileMeta.tsx'),
      /<ItemRecordMetaGrid\b/,
      'phone cluster must never mount the desk six-track',
    );
  });

  it('does not add a packing-local station well or layout animation', () => {
    assert.doesNotMatch(PACK_PANEL, /STATION_BAND_BODY_WELL_CLASS/);
    assert.doesNotMatch(PACK_ROW, /layout=|animate-\[?height|transition-\[?height/);
  });

  it('keeps operational QC on the same Items band and embedded PO surface', () => {
    assert.match(QC_PANEL, /<StationBandStack\b/);
    assert.match(QC_PANEL, /id:\s*['"]items['"]/);
    assert.match(QC_ITEMS, /embedded/);
    assert.match(QC_PANEL, /suppressItemsHeader/);
  });
});
