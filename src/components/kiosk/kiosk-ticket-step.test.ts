/**
 * The ticket step's laws — the ways this port can quietly become the thing it
 * was ported away from.
 *
 * Operator 2026-09-15: *"after the customer has submitted their signature it
 * should display with a link existing ticket or create new ticket … the
 * components are already there in the unbox component, I just need the same
 * component logic under the umbrella formatting of the kiosk design system."*
 *
 * So there are exactly two failure modes worth a test, and they pull in
 * opposite directions:
 *
 * 1. **Forking the logic.** Re-implementing the debounced/aborted candidate
 *    search beside `useTicketSearch` (the receiving claim flow's own adapter is
 *    the precedent) is how two link surfaces start behaving differently.
 * 2. **Importing the desk presentation.** `TicketPicker` / `ClaimModeSelect`
 *    are `DenseComposeSearchInput` + hairline `TicketPickRow`s + a
 *    `SearchableSelectField` — desk-micro type built for a mouse. Mounting one
 *    on a counter tablet is the same defect `SURFACE_LAW` §5 caught in the cart.
 *
 * Source-shape on purpose: this repo has no React test renderer, and the
 * invariant is "which module owns which half". The decision rules themselves
 * are behaviour-tested in `src/lib/kiosk/repair-ticket-choice.test.ts`.
 *
 *   npx tsx --test src/components/kiosk/kiosk-ticket-step.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const STEP = 'src/components/kiosk/KioskTicketStep.tsx';
const HOOK = 'src/components/kiosk/useKioskTicketSearch.ts';
const PANE = 'src/app/kiosk/v2/KioskRepairPane.tsx';
const CART = 'src/app/kiosk/v2/KioskCartLedger.tsx';
const read = (p: string) => readFileSync(p, 'utf8');

/**
 * The docblocks NAME the desk components on purpose — they say what was not
 * mounted and why. A banned-symbol scan therefore has to read code, not prose,
 * or the explanation itself fails the test.
 */
const code = (p: string) =>
  read(p)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

test('the search LOGIC is the shared hook, not a second implementation', () => {
  const hook = read(HOOK);
  assert.match(hook, /from '@\/components\/support\/link\/useTicketSearch'/);
  // The kiosk-specific parts are the URL and the transport, nothing else.
  assert.match(hook, /\/api\/kiosk\/repair\/ticket-candidates/);
  assert.match(hook, /kioskFetchHealed/, 'a device call must survive a stale cookie');
  // No re-implementation: the debounce and the abort live in the shared hook.
  assert.doesNotMatch(hook, /setTimeout|AbortController/);
});

test('the step wears the kiosk tier, never the desk picker', () => {
  const step = code(STEP);
  assert.match(step, /KioskChip/, 'the two modes are the touch pill family');
  assert.match(step, /KioskEntryField/, 'one entry control across the kiosk');
  assert.match(step, /MOBILE_SCAN_ROW_CORNER/, 'a candidate is a touch CARD');
  for (const desk of [
    'TicketPicker',
    'TicketPickRow',
    'DenseComposeSearchInput',
    'SearchableSelectField',
    'CompoundRow',
    'statusBadge',
  ]) {
    assert.doesNotMatch(
      step,
      new RegExp(`\\b${desk}\\b`),
      `${desk} is the desk tier — SURFACE_LAW §5: a list on a phone-shaped surface is cards`,
    );
  }
  assert.doesNotMatch(step, /role="table"/);
  assert.doesNotMatch(step, /rounded-full/, 'radius comes from the token, never a literal');
});

/**
 * ONE slider, and it opens on Create.
 *
 * Operator 2026-09-15: *"the create new and the link existing should be
 * simplified into just one slider where you would be able to slide back and
 * forth since this would be on a mobile display, and automatically select
 * create new ticket."* Two rules fall out: the halves sit in a single pill
 * TRACK (a stacked pair of full-width pills is two controls, not one slider),
 * and the Create side is the position an untouched control shows — which is
 * only honest because `null` also POSTS as create and counts as settled.
 */
test('the modes are one pill track that opens on Create', () => {
  const step = code(STEP);
  assert.match(
    step,
    /flex items-stretch gap-1 bg-surface-sunken p-1[\s\S]{0,120}cornerClass\('pill'\)/,
    'the two halves share one sunken pill track',
  );
  // Create is derived from the ABSENCE of a link choice, so untouched = create.
  assert.match(step, /const creating = !linking;/);
  /*
   * The selected half is the THUMB tone, not `accent`. On a sunken track
   * `surface-accent` computes one point of luminance away from the trough —
   * measured invisible 2026-09-15 — so the chip family grew a raised
   * card-white face for this job rather than the call site painting a `bg-`
   * override over the primitive.
   */
  assert.match(step, /tone=\{creating \? 'thumb' : 'idle'\}/);
  assert.match(step, /tone=\{linking \? 'thumb' : 'idle'\}/);
  assert.doesNotMatch(step, /className=\{[a-z]+ \? undefined : 'bg-/, 'no fill override');
  // Sliding to Link is not yet a decision — a zero id keeps the commit refused.
  assert.match(step, /\{ mode: 'attach', ticketId: 0, ticketLabel: '' \}/);
});

/**
 * It lives INSIDE Review & sign, revealed by the ink.
 *
 * Two rulings, both from 2026-09-15 and both load-bearing: the question
 * appears *"after the customer has submitted their signature"*, and it is
 * *"mounted under one step"* rather than spending a progress segment of its
 * own. A fifth step would satisfy the first and break the second; rendering it
 * unconditionally would satisfy the second and break the first.
 */
test('the question is revealed by the signature, inside the review step', () => {
  const pane = read(PANE);
  assert.match(pane, /'Review & sign',\s*\n\] as const/, 'Review & sign is the LAST header');
  assert.doesNotMatch(pane, /'Support ticket'/, 'no fifth step');
  assert.doesNotMatch(pane, /REVIEW_STEP/, 'review is lastStep again');
  // Gated on ink, not mounted flat.
  assert.match(pane, /\{signatureData \? \(\s*\n\s*<KioskTicketStep/);
  // The commit key cannot fire on an undecided visit.
  assert.match(pane, /canSubmitRepairIntake\(formData, !!signatureData\) && ticketSettled/);
});

/**
 * The print affordance is a LABELLED CTA on the heading's own row.
 *
 * Operator 2026-09-15, twice: *"button should not display in a second row, it
 * should display in the same row as review and sign"*, then *"ensure the print
 * icon on the most right displays as a text print and a print icon, just like
 * the shipping CTA, primary CTA on the top right. Should not be a boxy print
 * button."* So: one row, right-aligned, `Button` with icon AND word at the
 * primitive's own corner — never an `IconButton` tile and never a strip of its
 * own. It is BODY content; the pane owns one header, the step band.
 */
test('print is a labelled CTA on the step heading row', () => {
  const pane = code(PANE);
  assert.match(
    pane,
    /<div className="flex items-center justify-between gap-3 px-4 pb-3 pt-5">\s*\n\s*<h2[\s\S]{0,200}STEP_HEADERS\[step\][\s\S]{0,700}data-testid="kiosk-repair-print"[\s\S]{0,80}>\s*\n\s*Print\s*\n\s*<\/Button>/,
    'the heading, the glyph and the WORD are one row',
  );
  assert.match(pane, /icon=\{<Printer \/>\}/, 'glyph plus label, not a glyph alone');
  assert.doesNotMatch(pane, /IconButton/, 'the boxy icon tile is gone');
  assert.doesNotMatch(
    pane,
    /<div className="flex items-center justify-end">/,
    'the second print row stays deleted',
  );
  assert.doesNotMatch(pane, /KIOSK_PANE_HEADER_BAND|KIOSK_PANE_HEADER_TITLE/);
});

/**
 * The commit key is the repair lane's own orange, named for the job (operator
 * 2026-09-15: *"save to cart CTA button at the most bottom should be an orange
 * submit repair button"*).
 *
 * `variant="warning"` is the amber intent from the Button fill map — the same
 * ink the repair command wears in the mode selector. A `className` hue
 * override would be painting over the primitive, which `AGENTS.md` bans, and
 * `KIOSK_POS_CTA` must stay on it so the key still casts nothing.
 */
test('the review floor commits with ONE orange submit key', () => {
  const pane = code(PANE);
  assert.match(
    pane,
    /<Button\s*\n\s*variant="warning"[\s\S]{0,400}Repair submitted' : 'Submit repair'/,
  );
  assert.match(pane, /variant="warning"[\s\S]{0,200}className=\{KIOSK_POS_CTA\}/);
  assert.doesNotMatch(pane, /Save to cart|Saved to cart/, 'the mechanism label is retired');
  assert.doesNotMatch(
    pane,
    /bg-orange|bg-amber|from-orange/,
    'no hue override — grow the variant map instead',
  );
});

/**
 * The decision is a VISIT fact. `ticketWork` is transaction-level on
 * `CounterTransactionInput` and fans out to one outbox row per repair, so a
 * per-LINE choice would be a shape the write path cannot honour.
 */
test('the decision lives on the session root and reaches the submit', () => {
  const pane = read(PANE);
  assert.match(pane, /session\.ticketChoice/);
  assert.match(pane, /actions\.setTicketChoice/);
  assert.doesNotMatch(
    read('src/lib/kiosk/repair-line-payload.ts'),
    /ticket/i,
    'a transaction-level decision must not be copied onto a cart line',
  );

  const cart = read(CART);
  assert.match(cart, /ticketWork: kioskTicketWork\(session\.ticketChoice/);
  assert.doesNotMatch(
    cart,
    /ticketWork:\s*services\.length > 0 \? \{ mode: 'create' \}/,
    'the hardcoded create is what left the attach arm with no caller',
  );
});
