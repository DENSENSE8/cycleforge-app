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
const SUBMIT = 'src/lib/kiosk/submit-kiosk-visit.ts';
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
  // The commit key cannot fire on an undecided visit — and it reads the CART's
  // devices, not the form's retired singular serial + price.
  assert.match(
    pane,
    /canSubmitRepairIntake\(formData, !!signatureData, devices\) && ticketSettled/,
  );
});

test('review contains no kiosk print control', () => {
  const pane = code(PANE);
  assert.doesNotMatch(pane, /kiosk-repair-print|kiosk-repair-success-print|printDomNode/);
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
 *
 * ## What it SUBMITS changed on 2026-09-16
 *
 * It used to `fetch` a device-authed endpoint of its own that wrote one bare
 * `repair_service` row — no counter header, no visit, no payment — while the
 * cart posted `/api/kiosk/intake`. Two write paths for one counter visit, and
 * whichever key the staffer pressed decided which happened. Now both keys call
 * `submitKioskVisit`, so this pane must hold NO fetch of its own, and the one
 * success document is `KioskCartDoneFace` rather than a second terminal hero
 * that could only state the single row the retired endpoint wrote.
 */
test('the review floor submits with ONE orange submit key', () => {
  const pane = code(PANE);
  assert.match(
    pane,
    /<Button\s*\n\s*variant="warning"[\s\S]{0,400}Submitting…' : 'Submit repair'/,
  );
  assert.match(pane, /variant="warning"[\s\S]{0,200}className=\{KIOSK_POS_CTA\}/);
  assert.match(pane, /await submitKioskVisit\(/, 'the CTA submits the VISIT');
  assert.doesNotMatch(
    pane,
    /fetch\(/,
    'a second write path is what submitKioskVisit exists to remove',
  );
  assert.match(
    pane,
    /<KioskCartDoneFace\s*\n\s*result=\{transaction\}/,
    'the visit success page is the one success page',
  );
  assert.match(
    pane,
    /data-testid="kiosk-repair-success"/,
    'a submitted visit still answers to its own anchor',
  );
  assert.doesNotMatch(
    pane,
    /rsNumber/,
    'the pane no longer renders a terminal record of its own',
  );
  assert.doesNotMatch(pane, /Save to cart|Saved to cart/, 'the mechanism label is retired');
  assert.doesNotMatch(
    pane,
    /bg-orange|bg-amber|from-orange/,
    'no hue override — grow the variant map instead',
  );
});

/**
 * The idempotency key belongs to the SUBMIT, not to the press: the counter
 * dedupes on it, so a fresh key on the second press of a timed-out submit is
 * how one drop-off gets recorded twice. `??=` mints it once and keeps it.
 */
test('a retry reuses the first press key', () => {
  const pane = code(PANE);
  assert.match(pane, /submissionKey = useRef<string \| null>\(null\)/);
  assert.match(pane, /submissionKey\.current \?\?= safeRandomUUID\(\)/);
  assert.match(pane, /idempotencyKey: submissionKey\.current/);
});

/**
 * The decision is a VISIT fact. `ticketWork` is transaction-level on
 * `CounterTransactionInput` and fans out to one outbox row per repair, so a
 * per-LINE choice would be a shape the write path cannot honour.
 *
 * The MAPPING moved into `submitKioskVisit` on 2026-09-16, because both keys
 * submit through it now. So both callers hand over the raw session choice and
 * exactly ONE place turns it into `ticketWork` — which is the property that
 * matters: two mappings is how the pane and the cart come to file a drop-off
 * differently.
 */
test('the decision lives on the session root and reaches the submit', () => {
  const pane = read(PANE);
  assert.match(pane, /session\.ticketChoice/);
  assert.match(pane, /actions\.setTicketChoice/);
  assert.match(pane, /ticketChoice: session\.ticketChoice/, 'the pane hands over the choice');
  assert.doesNotMatch(
    read('src/lib/kiosk/repair-line-payload.ts'),
    /ticket/i,
    'a transaction-level decision must not be copied onto a cart line',
  );

  const cart = read(CART);
  assert.match(cart, /ticketChoice: session\.ticketChoice/, 'so does the cart');

  const submit = read(SUBMIT);
  assert.match(submit, /ticketWork: kioskTicketWork\(session\.ticketChoice/);
  for (const caller of [pane, cart]) {
    assert.doesNotMatch(
      caller,
      /ticketWork:/,
      'ONE mapping, in submitKioskVisit — a caller that builds its own can drift',
    );
  }
  assert.doesNotMatch(
    submit,
    /ticketWork:\s*services\.length > 0 \? \{ mode: 'create' \}/,
    'the hardcoded create is what left the attach arm with no caller',
  );
});
