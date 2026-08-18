/**
 * Unbox / Receiving History paints coarse lifecycle status (Scanned / Unboxed /
 * Received). Testing History stays on fine workflow stages so FAILED / PASSED
 * remain visible — `isHistory` alone must not collapse them.
 *
 * SoT: deriveReceivingLineStatus + receivingCoarseStatusPaint (rail/status.ts).
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const ROOT = process.cwd();

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8');
}

function stripBlockComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '');
}

describe('History coarse status vocabulary', () => {
  it('ReceivingLinesTable opts History into statusVocabulary=coarse', () => {
    const src = stripBlockComments(read('src/components/station/ReceivingLinesTable.tsx'));
    assert.match(
      src,
      /statusVocabulary=\{isHistoryMode \? ['"]coarse['"] : ['"]fine['"]\}/,
      'Unbox / Receiving History must pass coarse status vocabulary',
    );
  });

  it('compare History panes also pass coarse vocabulary', () => {
    const src = stripBlockComments(
      read('src/components/receiving/unbox/compare/ReceivingPaneTable.tsx'),
    );
    assert.match(
      src,
      /statusVocabulary=\{modeState\.isHistoryMode \? ['"]coarse['"] : ['"]fine['"]\}/,
    );
  });

  it('TestingHistoryList never passes statusVocabulary=coarse', () => {
    const src = stripBlockComments(read('src/components/tech/TestingHistoryList.tsx'));
    assert.doesNotMatch(
      src,
      /statusVocabulary/,
      'Testing History must keep fine FAILED / PASSED (default vocabulary)',
    );
  });

  it('ReceivingGridRow paints coarse via receivingCoarseStatusPaint', () => {
    const src = stripBlockComments(
      read('src/components/station/receiving-grid/ReceivingGridRow.tsx'),
    );
    assert.match(src, /receivingCoarseStatusPaint/);
    assert.match(src, /statusVocabulary === ['"]coarse['"]/);
  });

  it('ReceivingStatusCell uses ctx statusBadgeClass (not fine workflowStageBadge)', () => {
    const src = stripBlockComments(
      read('src/components/station/receiving-grid/cells/ReceivingStatusCell.tsx'),
    );
    assert.match(src, /toneClass=\{statusBadgeClass\}/);
    assert.doesNotMatch(src, /workflowStageBadge/);
  });
});
