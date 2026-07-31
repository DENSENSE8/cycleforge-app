import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { SEARCH_RESULT_GRID } from './search-result-grid';

/**
 * Comfortable /search Monitor feed SoT:
 *   • One shared CSS Grid template for live row + skeleton (zero reflow).
 *   • Glyph | Id | Match | Tracking | Age — no status/condition/platform.
 *   • TrackingChip on the right; OrderIdChip on the left (never dual id columns).
 *   • Flat RRF list — no CATEGORY_TABS grouping on the full results surface.
 */

function readSibling(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8');
}

describe('SearchResultRow comfortable grid', () => {
  const rowSrc = readSibling('./SearchResultRow.tsx');
  const skeletonSrc = readSibling('./SearchResultRowSkeleton.tsx');
  const gridSrc = readSibling('./search-result-grid.ts');
  const chipsSrc = readSibling('./search-result-chips.ts');
  const surfaceSrc = readSibling('./SearchResultsSurface.tsx');

  // ComfortableAlignedRow only — slice from that function to export.
  const comfortableSrc = (() => {
    const start = rowSrc.indexOf('function ComfortableAlignedRow');
    const end = rowSrc.indexOf('function OrderRow');
    return start >= 0 && end > start ? rowSrc.slice(start, end) : rowSrc;
  })();

  it('exports a single SEARCH_RESULT_GRID track template', () => {
    assert.match(gridSrc, /SEARCH_RESULT_GRID/);
    assert.ok(
      SEARCH_RESULT_GRID.includes('grid-cols-['),
      'SEARCH_RESULT_GRID must declare explicit track sizes',
    );
    assert.match(
      gridSrc,
      /Glyph \| Id \| Match \| Tracking \| Age/,
      'comfortable tracks must be Glyph · Id · Match · Tracking · Age',
    );
  });

  it('comfortable row and skeleton both import SEARCH_RESULT_GRID', () => {
    assert.match(rowSrc, /SEARCH_RESULT_GRID/);
    assert.match(skeletonSrc, /SEARCH_RESULT_GRID/);
    assert.match(rowSrc, /from '\.\/search-result-grid'/);
    assert.match(skeletonSrc, /from '\.\/search-result-grid'/);
  });

  it('leads with blue package glyphs and OrderIdChip last-4', () => {
    assert.match(comfortableSrc, /OrderIdChip/);
    assert.match(comfortableSrc, /getLast4\(orderId\)/);
    assert.match(comfortableSrc, /EntityTile/);
    assert.match(rowSrc, /search-result-identity/);
    assert.match(chipsSrc, /order:\s*Package/);
    assert.match(chipsSrc, /receiving:\s*PackageOpen/);
    assert.match(chipsSrc, /receiving:\s*'blue'/);
  });

  it('puts TrackingChip on the right and never paints status/condition/platform', () => {
    assert.match(comfortableSrc, /TrackingChip/);
    assert.doesNotMatch(
      comfortableSrc,
      /PlatformMark/,
      'comfortable row must not render PlatformMark',
    );
    assert.doesNotMatch(
      comfortableSrc,
      /conditionLabel|conditionGradeTone/,
      'comfortable row must not render condition chips',
    );
    assert.doesNotMatch(
      comfortableSrc,
      /statusRaw|Chip label=\{statusRaw\}/,
      'comfortable row must not render status chips',
    );
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
