import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';

/**
 * The PO-items lane decision is LAW, not per-station taste.
 *
 * Unbox, Testing, `/search`, and Scan Out each used to route matched-vs-unfound
 * themselves, and Testing's copy omitted the lineless-real-PO probe — so a real
 * PO carton whose lines had not landed yet offered the add / pair path on two
 * stations and read as a dead end on the third. Nothing could notice, because
 * the disagreement lived in two files that never mentioned each other.
 *
 * These read source text, which is normally the wrong way to pin anything
 * (AGENTS.md). They are here for the one claim a mounted test cannot make:
 * that no station has grown a SECOND copy of the routing. The routing's
 * behaviour is exercised by the surfaces themselves.
 */
const CALLERS = {
  unbox: 'src/components/receiving/workspace/line-edit/LinePoItemsSection.tsx',
  testing: 'src/components/tech/testing-panel/TestingPoItemsSection.tsx',
  search: 'src/components/search/station/SearchReceivingPoItems.tsx',
  'scan-out': 'src/components/outbound/scan-out/ScanOutActivePanel.tsx',
} as const;

const read = (p: string) => readFileSync(p, 'utf8');

describe('PO items — one surface, one lane decision', () => {
  it('every station renders PoItemsSection', () => {
    for (const [station, path] of Object.entries(CALLERS)) {
      assert.match(read(path), /<PoItemsSection\b/, `${station} must compose the shared section`);
    }
  });

  it('no station routes the lanes itself any more', () => {
    for (const [station, path] of Object.entries(CALLERS)) {
      const src = read(path);
      assert.doesNotMatch(
        src,
        /shouldUseUnmatchedItemsSurface|shouldUsePoAccordion/,
        `${station} re-derives the lane — that is the fork this consolidation removed`,
      );
      assert.doesNotMatch(
        src,
        /<PoLinesAccordion\b|<UnmatchedItemsSection\b/,
        `${station} reaches past the shared section to a lane surface`,
      );
    }
  });

  it('the shared section probes for a lineless real PO', () => {
    const src = read('src/components/receiving/workspace/PoItemsSection.tsx');
    assert.match(src, /linelessRealPo/);
    // Never call a carton lineless while its siblings are still in flight —
    // the lane would flip to unfound for one paint and back.
    assert.match(src, /siblingCount === undefined \? false/);
    // Same key as the accordion's own read, so the probe costs no request.
    assert.match(src, /receivingSiblingsQueryKey/);
  });
});
