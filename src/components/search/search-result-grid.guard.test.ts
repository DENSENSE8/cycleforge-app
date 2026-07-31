import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { SEARCH_RESULT_GRID } from './search-result-grid';

/**
 * Comfortable /search Monitor feed SoT:
 *   • One shared CSS Grid template for live row + skeleton (zero reflow).
 *   • Polymorphic Reference track — TrackingChip XOR SerialChip, never both columns.
 *   • Flat RRF list — no CATEGORY_TABS grouping on the full results surface.
 */

function readSibling(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8');
}

describe('SearchResultRow comfortable grid', () => {
  const rowSrc = readSibling('./SearchResultRow.tsx');
  const skeletonSrc = readSibling('./SearchResultRowSkeleton.tsx');
  const gridSrc = readSibling('./search-result-grid.ts');
  const surfaceSrc = readSibling('./SearchResultsSurface.tsx');

  it('exports a single SEARCH_RESULT_GRID track template', () => {
    assert.match(gridSrc, /SEARCH_RESULT_GRID/);
    assert.ok(
      SEARCH_RESULT_GRID.includes('grid-cols-['),
      'SEARCH_RESULT_GRID must declare explicit track sizes',
    );
  });

  it('comfortable row and skeleton both import SEARCH_RESULT_GRID', () => {
    assert.match(rowSrc, /SEARCH_RESULT_GRID/);
    assert.match(skeletonSrc, /SEARCH_RESULT_GRID/);
    assert.match(rowSrc, /from '\.\/search-result-grid'/);
    assert.match(skeletonSrc, /from '\.\/search-result-grid'/);
  });

  it('uses polymorphic Reference — TrackingChip and SerialChip, not dual columns', () => {
    assert.match(rowSrc, /TrackingChip/);
    assert.match(rowSrc, /SerialChip/);
    // Comfortable branch: tracking ? TrackingChip : serial ? SerialChip
    assert.match(
      rowSrc,
      /tracking \?[\s\S]*?<TrackingChip[\s\S]*?: serial \?[\s\S]*?<SerialChip/,
      'Reference track must be tracking XOR serial (ternary), not two parallel columns',
    );
  });

  it('wires condition and platform through house SoTs', () => {
    assert.match(rowSrc, /conditionLabel/);
    assert.match(rowSrc, /conditionGradeTone/);
    assert.match(rowSrc, /PlatformMark/);
  });

  it('flattens /search results — no CATEGORY_TABS grouping on the surface', () => {
    assert.doesNotMatch(
      surfaceSrc,
      /CATEGORY_TABS/,
      'SearchResultsSurface must not group by CATEGORY_TABS (flat RRF list)',
    );
    assert.match(surfaceSrc, /MonitorListBlock/);
    assert.match(surfaceSrc, /SearchResultRowSkeleton/);
    assert.match(surfaceSrc, /mode="wait"/);
  });
});
