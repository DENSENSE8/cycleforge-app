/**
 * Suggested next questions: every chip must name an entity this turn's data
 * returned, never re-ask what was just answered, and stay within 3 × 60 chars.
 * Run: npm run test:assistant
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { suggestFollowUps, FOLLOW_UPS_MAX, FOLLOW_UP_MAX_CHARS } from './follow-ups';
import type { SessionArtifact } from './ui-artifacts';

const locateTable = (rows: Array<Record<string, string | number | null>>): SessionArtifact => ({
  kind: 'table',
  title: 'Where is 00066-P-2',
  columns: ['Bin', 'Room', 'Qty'],
  rows,
  entityHint: 'bin',
  idColumn: 'Bin',
});

test('locate_product: suggests the fullest bin first, then the total for a multi-bin SKU', () => {
  const out = suggestFollowUps({
    question: 'Where is SKU 00066-P-2?',
    tools: [{ name: 'locate_product', input: { query: '00066-P-2' } }],
    artifacts: [
      {
        producedBy: 'locate_product',
        artifact: locateTable([
          { SKU: '00066-P-2', Bin: 'C-03-16-3', Room: 'A', Qty: 1 },
          { SKU: '00066-P-2', Bin: 'C-03-12-3', Room: 'A', Qty: 41 },
        ]),
      },
    ],
  });
  assert.deepEqual(out, [
    'What else is in bin C-03-12-3?',
    'What else is in bin C-03-16-3?',
    'How many 00066-P-2 do we have in total?',
  ]);
});

test('a bin the same turn already listed is never suggested again', () => {
  const out = suggestFollowUps({
    question: 'Where is SKU 00099-P-1, and what else is stored in bin C-03-08-2?',
    tools: [
      { name: 'locate_product', input: { query: '00099-P-1' } },
      { name: 'list_location_contents', input: { location: 'C-03-08-2' } },
    ],
    artifacts: [
      {
        producedBy: 'locate_product',
        artifact: locateTable([
          { SKU: '00099-P-1', Bin: 'C-03-08-1', Qty: 42 },
          { SKU: '00099-P-1', Bin: 'C-03-08-2', Qty: 3 },
        ]),
      },
      {
        producedBy: 'list_location_contents',
        artifact: {
          kind: 'table',
          title: 'Bin C-03-08-2',
          columns: ['SKU', 'Qty'],
          rows: [
            { SKU: '00099-P-1', Qty: 3 },
            { SKU: 'TMP-XYZ', Qty: 12 },
          ],
        },
      },
    ],
  });
  assert.ok(!out.includes('What else is in bin C-03-08-2?'));
  assert.ok(out.includes('What else is in bin C-03-08-1?'));
  // The located SKU is not re-offered as "where else"; the bin's other SKU is.
  assert.ok(!out.some((s) => s.includes('00099-P-1 stored')));
  assert.ok(out.includes('Where else is TMP-XYZ stored?'));
});

test('a not-found locate offers a product search on what was typed, and nothing invented', () => {
  const out = suggestFollowUps({
    question: 'Where is SKU ZZ-NOPE-000?',
    tools: [{ name: 'locate_product', input: { query: 'ZZ-NOPE-000' } }],
    artifacts: [],
  });
  assert.deepEqual(out, ['Search products matching ZZ-NOPE-000']);
});

test('no mapped tool and no mention → no chips', () => {
  assert.deepEqual(suggestFollowUps({ question: "What's the weather in Paris?", tools: [], artifacts: [] }), []);
});

test('caps at 3, drops over-long items, and never repeats the question', () => {
  const rows = Array.from({ length: 6 }, (_, i) => ({ SKU: `S-${i}`, Qty: i }));
  const out = suggestFollowUps({
    question: 'Where else is S-0 stored',
    tools: [{ name: 'list_location_contents', input: { location: 'C-01-01-1' } }],
    artifacts: [
      {
        producedBy: 'list_location_contents',
        artifact: { kind: 'table', title: 'Bin C-01-01-1', columns: ['SKU', 'Qty'], rows },
      },
    ],
  });
  assert.equal(out.length, FOLLOW_UPS_MAX);
  assert.ok(!out.includes('Where else is S-0 stored?'));
  assert.ok(out.every((s) => s.length <= FOLLOW_UP_MAX_CHARS));

  const long = 'X'.repeat(70);
  assert.deepEqual(
    suggestFollowUps({ question: 'q', tools: [{ name: 'locate_product', input: { query: long } }], artifacts: [] }),
    [],
  );
});

test('an unread mention offers its reader', () => {
  const out = suggestFollowUps({
    question: 'hi',
    tools: [],
    artifacts: [],
    mentions: [{ kind: 'bin', id: 'C-03-12-3', label: 'bin C-03-12-3' }],
  });
  assert.deepEqual(out, ['What is in bin C-03-12-3?']);
});
