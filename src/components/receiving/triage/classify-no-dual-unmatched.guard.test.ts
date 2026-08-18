/**
 * Arrival / Unbox Classify must not mount useUnmatchedItems — items accordion
 * owns that controller. Dual mount GETs + setLines([]) and flashes empty lines.
 *
 * Run: `npx tsx --test src/components/receiving/triage/classify-no-dual-unmatched.guard.test.ts`
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const DIR = dirname(fileURLToPath(import.meta.url));
const CLASSIFY = readFileSync(join(DIR, 'TriageClassifySection.tsx'), 'utf8');

describe('Classify single unmatched controller', () => {
  it('does not call useUnmatchedItems', () => {
    assert.doesNotMatch(CLASSIFY, /useUnmatchedItems\s*\(/);
  });

  it('uses addUnmatchedLine for repair identify', () => {
    assert.match(CLASSIFY, /addUnmatchedLine/);
    assert.match(CLASSIFY, /handleRepairIdentifySelect/);
  });

  it('Urgency · Platform · Type are flush SearchableSelectField comboboxes', () => {
    assert.match(
      CLASSIFY,
      /SearchableSelectField/,
      'Classify dimensions use the house searchable combobox (claim / Add Inbound golden)',
    );
    assert.match(CLASSIFY, /appearance=["']flush["']/);
    assert.doesNotMatch(
      CLASSIFY,
      /function ClassifyDimension/,
      'accordion ClassifyDimension drill rows are retired — comboboxes replace them',
    );
  });
});
