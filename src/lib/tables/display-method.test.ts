import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  DISPLAY_ROWS_PER_SCREEN,
  DISPLAY_SHAPES,
  DISPLAY_VERBS,
  confidenceTier,
  displayConfidence,
  parseDisplayFacts,
  scoreDisplayMethod,
  type DisplayFacts,
} from '@/lib/tables/display-method';

const PAGES: { page: string; facts: DisplayFacts; top: string; decision: string }[] = [
  {
    page: '/unbox receiving lines',
    facts: { steadyRows: 40, comparedFacts: 6, verb: 'scan-and-act', surface: 'desk', shape: 'grouped', rowsPerScreen: 'many' },
    top: 'card-list',
    decision: 'implement',
  },
  {
    page: 'FBA ready keep-sheet',
    facts: { steadyRows: 60, comparedFacts: 8, verb: 'edit-in-place', surface: 'desk', shape: 'entity-per-row', rowsPerScreen: 'many' },
    top: 'data-table',
    decision: 'implement',
  },
  {
    page: 'order lookup whose steady state is one row',
    facts: { steadyRows: 1, comparedFacts: 3, verb: 'browse-and-drill', surface: 'desk', shape: 'entity-per-row' },
    top: 'detail-hub',
    decision: 'implement',
  },
  {
    page: '/m/pick phone pick list',
    facts: { steadyRows: 25, comparedFacts: 3, verb: 'scan-and-act', surface: 'phone', shape: 'entity-per-row', rowsPerScreen: 'few' },
    top: 'card-list',
    decision: 'implement',
  },
  {
    page: 'settings locations list (4 rows, admin)',
    facts: { steadyRows: 4, comparedFacts: 3, verb: 'edit-in-place', surface: 'desk', shape: 'entity-per-row', admin: true },
    top: 'admin-table',
    decision: 'implement',
  },
];

for (const { page, facts, top, decision } of PAGES) {
  test(`${page} → ${top} (${decision})`, () => {
    const result = scoreDisplayMethod(facts);
    assert.equal(result.top, top);
    assert.equal(result.decision, decision);
  });
}

test('the /unbox acceptance facts (five gathered) still put card-list on top', () => {
  const result = scoreDisplayMethod({ steadyRows: 40, comparedFacts: 6, verb: 'scan-and-act', surface: 'desk', shape: 'grouped' });
  assert.equal(result.factsGathered, 5);
  assert.equal(result.top, 'card-list');
  assert.equal(result.ranked[0]?.score, 22);
  assert.equal(result.confidence, 22 / 25);
  assert.equal(result.tier, 'HIGH');
});

test('an ambiguous browse page lands the top two in one tier → ask with a full menu', () => {
  const result = scoreDisplayMethod({ steadyRows: 12, comparedFacts: 4, verb: 'browse-and-drill', surface: 'desk' });
  assert.equal(result.decision, 'ask');
  assert.equal(result.top, 'card-list');
  assert.equal(result.runnerUp, 'record-ledger');
  assert.equal(result.ranked[0]?.tier, result.ranked[1]?.tier);
  for (const candidate of result.ranked.slice(0, 2)) {
    assert.ok(candidate.tradeOff.length > 0);
    assert.ok(candidate.settlingFact.length > 0);
    assert.ok(candidate.reasons.length > 0);
  }
});

test('the top pick in MEDIUM with a lower-tier runner-up names the runner-up', () => {
  // Phone count sheet editing six facts per line: cards win (14/20 = 0.70 MEDIUM)
  // with triage-sections a LOW runner-up (9/20) — implement, name the runner-up.
  const result = scoreDisplayMethod({ steadyRows: 40, comparedFacts: 6, verb: 'edit-in-place', surface: 'phone' });
  assert.equal(result.top, 'card-list');
  assert.equal(result.confidence, 0.7);
  assert.equal(result.tier, 'MEDIUM');
  assert.equal(result.runnerUp, 'triage-sections');
  assert.equal(result.decision, 'implement-name-runner-up');
});

test('reasons carry the pin modifiers that moved a score', () => {
  const result = scoreDisplayMethod({ steadyRows: 1, comparedFacts: 6, verb: 'read-and-compare', surface: 'desk' });
  const dataTable = result.ranked.find((c) => c.id === 'data-table');
  const detailHub = result.ranked.find((c) => c.id === 'detail-hub');
  assert.ok(dataTable?.reasons.includes('+2 ≥5 compared columns at a desk with a sort/spreadsheet-edit verb'));
  assert.ok(dataTable?.reasons.includes('-2 steady state ≤3 rows'));
  assert.ok(detailHub?.reasons.includes('+3 steady state ≤1 row'));
});

test('SURFACE_LAW: no phone page ever scores data-table on top', () => {
  const opt = <T>(values: readonly T[]) => [undefined, ...values];
  for (const steadyRows of [0, 1, 2, 3, 10, 40, 500])
    for (const comparedFacts of [0, 3, 6, 12])
      for (const verb of DISPLAY_VERBS)
        for (const shape of opt(DISPLAY_SHAPES))
          for (const rowsPerScreen of opt(DISPLAY_ROWS_PER_SCREEN))
            for (const urgencyBands of opt([true, false]))
              for (const admin of opt([true, false])) {
                const facts: DisplayFacts = { steadyRows, comparedFacts, verb, surface: 'phone' };
                if (shape) facts.shape = shape;
                if (rowsPerScreen) facts.rowsPerScreen = rowsPerScreen;
                if (urgencyBands !== undefined) facts.urgencyBands = urgencyBands;
                if (admin !== undefined) facts.admin = admin;
                const top = scoreDisplayMethod(facts).top;
                assert.notEqual(top, 'data-table', JSON.stringify(facts));
                assert.notEqual(top, 'admin-table', JSON.stringify(facts));
              }
});

const PIPELINE_FACTS: DisplayFacts = {
  steadyRows: 300,
  comparedFacts: 4,
  verb: 'monitor-pipeline',
  surface: 'desk',
  shape: 'grouped',
  statusGroups: 8,
  rowsPerScreen: 'many',
  urgencyBands: true,
};

test('a desk pipeline watched across 6–12 statuses → column-board (implement, HIGH)', () => {
  for (const statusGroups of [6, 8, 12]) {
    const result = scoreDisplayMethod({ ...PIPELINE_FACTS, statusGroups });
    assert.equal(result.top, 'column-board', `statusGroups ${statusGroups}`);
    assert.equal(result.tier, 'HIGH');
    assert.equal(result.decision, 'implement');
    assert.deepEqual(result.ranked[0]?.imports, ['src/design-system/components/column-board/ColumnBoard.tsx']);
  }
});

test('the same pipeline on a phone is one column = the card list; the board loses', () => {
  const result = scoreDisplayMethod({ ...PIPELINE_FACTS, surface: 'phone' });
  assert.equal(result.top, 'card-list');
  const board = result.ranked.find((c) => c.id === 'column-board');
  assert.ok(board?.reasons.includes('-10 SURFACE_LAW: lists on a phone are cards'));
  assert.ok(result.ranked.indexOf(board) > 1);
});

test('one status group at a desk never draws a column board', () => {
  const result = scoreDisplayMethod({ ...PIPELINE_FACTS, statusGroups: 1 });
  assert.notEqual(result.top, 'column-board');
});

test('SURFACE_LAW: no phone page ever scores column-board on top', () => {
  for (const verb of DISPLAY_VERBS)
    for (const statusGroups of [0, 1, 3, 8, 20])
      for (const shape of DISPLAY_SHAPES) {
        const facts: DisplayFacts = { ...PIPELINE_FACTS, verb, statusGroups, shape, surface: 'phone' };
        assert.notEqual(scoreDisplayMethod(facts).top, 'column-board', JSON.stringify(facts));
      }
});

test('confidence = top ÷ (5 × facts), clamped to [0, 1]', () => {
  assert.equal(displayConfidence(15, 4), 0.75);
  assert.equal(displayConfidence(10, 4), 0.5);
  assert.equal(displayConfidence(40, 4), 1);
  assert.equal(displayConfidence(-3, 4), 0);
});

test('tier edges: 0.75 is HIGH, 0.50 is MEDIUM', () => {
  assert.equal(confidenceTier(0.75), 'HIGH');
  assert.equal(confidenceTier(0.7499), 'MEDIUM');
  assert.equal(confidenceTier(0.5), 'MEDIUM');
  assert.equal(confidenceTier(0.4999), 'LOW');
  assert.equal(confidenceTier(displayConfidence(15, 4)), 'HIGH');
  assert.equal(confidenceTier(displayConfidence(14, 4)), 'MEDIUM');
  assert.equal(confidenceTier(displayConfidence(10, 4)), 'MEDIUM');
  assert.equal(confidenceTier(displayConfidence(9, 4)), 'LOW');
});

test('parseDisplayFacts rejects bad enums, counts and unknown facts', () => {
  const bad = parseDisplayFacts({ steadyRows: -1, comparedFacts: 2.5, verb: 'stare', surface: 'tv', colour: 'red' });
  assert.equal(bad.ok, false);
  if (!bad.ok) assert.equal(bad.errors.length, 5);
  assert.equal(parseDisplayFacts([]).ok, false);
  const good = parseDisplayFacts({ steadyRows: 3, comparedFacts: 0, verb: 'scan-and-act', surface: 'kiosk', admin: false });
  assert.deepEqual(good, { ok: true, facts: { steadyRows: 3, comparedFacts: 0, verb: 'scan-and-act', surface: 'kiosk', admin: false } });
  assert.equal(parseDisplayFacts({ steadyRows: 3, comparedFacts: 0, verb: 'monitor-pipeline', surface: 'desk', statusGroups: -2 }).ok, false);
  assert.deepEqual(parseDisplayFacts({ steadyRows: 300, comparedFacts: 4, verb: 'monitor-pipeline', surface: 'desk', statusGroups: 8 }), {
    ok: true,
    facts: { steadyRows: 300, comparedFacts: 4, verb: 'monitor-pipeline', surface: 'desk', statusGroups: 8 },
  });
});
