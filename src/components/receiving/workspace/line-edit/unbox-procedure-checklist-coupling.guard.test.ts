/**
 * Hard law: the deck's compressing geometry is only legal while the checklist
 * display is reachable.
 *
 * The centre deck shows exactly ONE queued card as a ~14px sliver and collapses
 * every step after it precisely behind that peek, `pointer-events-none`. Nothing
 * is hidden or re-sorted — every card stays mounted, in vocabulary order — but a
 * step four places out is genuinely not reachable from the deck itself. That is
 * an acceptable trade *only* because two other surfaces reach it: the pager
 * pinned above the composer, and the right-edge `checklist` display.
 *
 * `station-workbench.md`, `ProcedureDeck.tsx` and `UnboxProcedureDeck.tsx` all
 * state that coupling in prose — "de-default the checklist and the deck goes
 * back to a flat column in the same change" — and until now nothing in code held
 * the two together. A prose precondition is the kind that gets quietly dropped
 * by a change that only looks at one of the files, and the resulting bench has
 * steps an operator can see and cannot open.
 *
 * ## The direction of the assertion
 *
 * This asserts BOTH halves, deliberately: the covering geometry exists, and the
 * checklist is reachable. If the deck is ever legitimately flattened back to a
 * full column, this guard's first test goes red — and the correct response is to
 * DELETE this file in that same change, not to relax it. Making the pair move
 * together is the entire job.
 *
 * Run: `node --require ./scripts/register-server-only-shim.cjs --import tsx \
 *        --test src/components/receiving/workspace/line-edit/unbox-procedure-checklist-coupling.guard.test.ts`
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  UNBOX_SIDE_TAB_ORDER,
  isUnboxSideTabVisible,
  resolveUnboxSideTab,
  type UnboxSideTabGates,
} from './unbox-side-tabs';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const SRC = join(HERE, '../../../..');

const read = (rel: string) => readFileSync(join(SRC, rel), 'utf8');

/** Comments stripped, so a docblock promising the coupling can't satisfy a check. */
const code = (rel: string) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/.*$/gm, ' ');

/** Nothing visible — the sparsest carton the strip can produce. */
const NO_GATES: UnboxSideTabGates = {
  hasClassifyTab: false,
  hasPairingTab: false,
  hasListingsTab: false,
  hasUnits: false,
  hasPoNoteTab: false,
  hasTrackingTab: false,
  hasTimelineTab: false,
};

test('the deck still covers queued cards — the geometry this coupling pays for', () => {
  const deck = code('design-system/components/procedure/ProcedureDeck.tsx');

  assert.match(
    deck,
    /pointer-events-none/,
    'the covered cards must stay pointer-dead. If the deck was flattened to a full ' +
      'column, this guard has nothing left to protect — delete the file in that change.',
  );
  assert.match(
    deck,
    /isCovered/,
    'the deck no longer distinguishes a covered card from the peek — see above.',
  );
  // A covered card must never be a control: it is never on screen, so a button
  // there is a phantom affordance that still takes Tab. This was a shipped
  // defect (every queued card shared the peek's z-20 and swallowed its clicks).
  assert.match(
    deck,
    /onSelectStep\s*&&\s*!isCovered/,
    'a covered card must not render as a button — the checklist is where those are reached',
  );
});

test('the checklist display survives every gate — it is the deck’s reachability floor', () => {
  assert.equal(
    isUnboxSideTabVisible('checklist', NO_GATES),
    true,
    'a carton with nothing else to show still has a procedure, and the deck depends on it',
  );
  assert.equal(
    resolveUnboxSideTab('checklist', NO_GATES),
    'checklist',
    'the resolver must never fall the checklist back to another display',
  );
  assert.equal(
    UNBOX_SIDE_TAB_ORDER.includes('checklist'),
    true,
    'checklist must stay a mountable display body, or ?display=checklist 404s silently',
  );
});

test('buildUnboxSideTabs mounts a checklist body', () => {
  const tabs = code('components/receiving/workspace/line-edit/terminal/unbox-tabs.tsx');

  assert.match(
    tabs,
    /id:\s*'checklist'/,
    'the checklist tab is declared in the vocabulary but has no body here — the ring ' +
      'would open an empty column and the deck would have no reachability floor',
  );
  assert.match(
    tabs,
    /<UnboxProcedureChecklist\b/,
    'the checklist body must render UnboxProcedureChecklist — the SECOND VIEW of the ' +
      'deck’s own steps, off the same useUnboxProcedureSteps derivation',
  );
});

test('the scan-progress ring is the checklist’s entry, and it is the only one', () => {
  const panel = code('components/receiving/workspace/LineEditPanel.tsx');

  assert.match(
    panel,
    /openDisplays\(\s*'checklist'\s*\)/,
    'nothing opens the checklist display. It is ring-only by design (it carries no ' +
      'strip cell), so losing that handler makes it unreachable from the bench entirely.',
  );
  assert.match(
    panel,
    /onOpenChecklist=/,
    'UnboxScanProgressControl must receive the open handler — the ring IS the entry',
  );
});

test('both procedure views read one derivation, so reaching a step there shows the same state', () => {
  // The reachability floor is only worth anything if the checklist agrees with
  // the deck. Two derivations would make the right edge a plausible second
  // opinion rather than a way back into the same work.
  const checklist = code('components/receiving/workspace/line-edit/UnboxProcedureChecklist.tsx');
  const deckAdapter = code('components/receiving/workspace/line-edit/UnboxProcedureDeck.tsx');

  for (const [name, src] of [
    ['UnboxProcedureChecklist', checklist],
    ['UnboxProcedureDeck', deckAdapter],
  ] as const) {
    assert.match(
      src,
      /useUnboxProcedureSteps\s*\(/,
      `${name} must derive its steps from useUnboxProcedureSteps — the danger was ` +
        'never two views, it was two derivations',
    );
    assert.equal(
      /deriveProcedureSteps\s*\(/.test(src),
      false,
      `${name} calls deriveProcedureSteps directly, bypassing the shared hook (and with ` +
        'it the realtime subscription and the shared focus pointer)',
    );
  }
});
