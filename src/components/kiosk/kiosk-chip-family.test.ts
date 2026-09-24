/**
 * ONE chip family on the kiosk, and the cart is CARDS — Phase 2 law.
 *
 * Two regressions this pins:
 *
 * 1. **The chip fork.** `ReasonSelector` hand-composed `KIOSK_PILL` + a tone
 *    token + an absolutely-positioned `Check` at its call site. Every new pill
 *    would have copied that stack, and the desk `badge` (square, 18px) is not
 *    the right chip for a thumb. `KioskChip` is the touch tier; nothing else
 *    may assemble one.
 * 2. **The cart display.** The cart mounted `CompoundRow` — the desk compound
 *    table row — which painted a full-width spreadsheet on the glass. Operator
 *    2026-09-14: *"This is a wrong display. It should display a mobile-like
 *    chip display component with a rounded corner radius and kind of pills and
 *    buttons."* `SURFACE_LAW` §5: lists on a phone-shaped surface are cards,
 *    never a DataTable.
 *
 * Source-shape assertions, same posture as `kiosk-pane-frame.test.ts`: this
 * repo has no React test renderer, and "which component owns the chip" is the
 * invariant. The paint is verified at runtime on /kiosk/v2.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p: string) => readFileSync(p, 'utf8');

/**
 * Source with comments removed.
 *
 * Every assertion below that says "this token must NOT appear" has to read
 * stripped source: the docblocks in these files legitimately NAME the face
 * they replaced (`elevationClass('overlay')`, `appearance="flush"`,
 * `KIOSK_UTILITY_SHEET`), and a raw match on the file reports the deletion
 * ledger as the violation it records.
 */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

/** Kiosk surfaces that paint chips. Add a surface here when you add one. */
const CHIP_SURFACES = [
  'src/components/repair/ReasonSelector.tsx',
  'src/components/kiosk/KioskCartLineCard.tsx',
] as const;

/** Every kiosk-owned view file — none may hand-roll a pill. */
const KIOSK_VIEWS = [
  'src/app/kiosk/v2/KioskCartLedger.tsx',
  'src/app/kiosk/v2/KioskCustomerFace.tsx',
  'src/app/kiosk/v2/KioskRepairPane.tsx',
  'src/components/kiosk/KioskCartLineCard.tsx',
  'src/components/repair/ReasonSelector.tsx',
] as const;

test('chip surfaces mount KioskChip instead of composing a pill', () => {
  for (const file of CHIP_SURFACES) {
    const src = read(file);
    assert.match(src, /<KioskChip/, `${file} does not mount KioskChip`);
    for (const token of ['KIOSK_PILL_IDLE', 'KIOSK_PILL_ACTIVE', 'KIOSK_PILL_ACTIVE_ISSUE']) {
      assert.doesNotMatch(
        src,
        new RegExp(token),
        `${file} composes ${token} directly — tones belong to KioskChip`,
      );
    }
  }
});

test('no kiosk view hand-rolls a rounded-full chip', () => {
  for (const file of KIOSK_VIEWS) {
    const src = read(file);
    assert.doesNotMatch(
      src,
      /rounded-full/,
      `${file} hand-rolls a rounded-full face — mount KioskChip (touch) or badge (desk)`,
    );
  }
});

/**
 * ONE entry control on the kiosk, notes included.
 *
 * The repair step's notes was a `TextField appearance="flush"` — a
 * square-cornered field with a bottom divider and a floating label — on a
 * surface where every other control is a rounded placeholder-in-box entry.
 * Operator 2026-09-15: *"reuse the exact same notes component in the contact
 * information … it doesn't have to be a squared corner radius."*
 */
test('kiosk notes use the same entry control as the contact block', () => {
  const src = stripComments(read('src/components/repair/ReasonSelector.tsx'));
  const start = src.indexOf('if (pills) {');
  const end = src.indexOf('\n  return (', start);
  assert.ok(start > 0 && end > start, 'the pills branch moved — re-anchor this test');
  const pills = src.slice(start, end);
  assert.match(
    pills,
    /<KioskEntryField[\s\S]*multiline/,
    'kiosk notes must be KioskEntryField multiline, the contact block’s own control',
  );
  assert.doesNotMatch(
    pills,
    /appearance="flush"/,
    'a flush TextField is the squared-corner face the operator rejected',
  );
  // And the control it mounts is the one token every kiosk input answers to.
  assert.match(
    read('src/components/kiosk/KioskCustomerIntake.tsx'),
    /className=\{KIOSK_POS_ENTRY_AREA\}/,
    'the multiline entry face is KIOSK_POS_ENTRY_AREA',
  );
});

test('the chip component owns both faces and states its tone with a glyph slot', () => {
  const src = read('src/components/kiosk/KioskChip.tsx');
  assert.match(src, /face\?: 'row' \| 'meta'/);
  // Row face composes the pinned kiosk pill tokens — it does not restate them.
  assert.match(src, /KIOSK_PILL_IDLE/);
  assert.match(src, /KIOSK_PILL_ACTIVE_ISSUE/);
  // A chip that does something is a button; a chip that states a fact is a span.
  assert.match(src, /if \(!onClick\)/);
  assert.match(src, /icon\?: ReactNode/);
});

test('the cart list is cards, not the desk compound table', () => {
  const cart = read('src/app/kiosk/v2/KioskCartLedger.tsx');
  // The MOUNT and the IMPORT, not the word: the deletion-ledger comments in
  // that file legitimately name what they removed.
  assert.doesNotMatch(cart, /<CompoundRow/, 'the desk compound row is not the phone SoT (SURFACE_LAW §5)');
  assert.doesNotMatch(cart, /from '@\/components\/tables\/compound/);
  assert.doesNotMatch(cart, /columns=\{CART_COMPOUND_COLUMNS\}/);
  assert.doesNotMatch(cart, /role="table"/, 'a cart on a tablet is a list of cards');
  // The customer's screen shows the SAME card, so the two faces cannot drift.
  assert.match(read('src/app/kiosk/v2/KioskCustomerFace.tsx'), /<KioskCartLineCard/);
});

test('the read-mostly panels are a bounded rounded sheet, not a full-width slab', () => {
  const chrome = read('src/app/kiosk/kiosk-chrome.ts');
  assert.doesNotMatch(
    chrome,
    /export const KIOSK_UTILITY_PANEL_FACE/,
    'the h-full w-full panel face is what made the cart a full-width popover',
  );
  assert.match(chrome, /export const KIOSK_UTILITY_SHEET/);
  // Corner comes from a token (the mobile card corner), never a literal.
  assert.match(chrome, /MOBILE_SCAN_CARD_CORNER/);
  assert.match(chrome, /max-w-2xl/, 'the sheet is bounded — that is the whole point');

  assert.match(
    read('src/app/kiosk/v2/KioskPaperworkPanel.tsx'),
    /KIOSK_UTILITY_SHEET/,
    'the paperwork panel is not on the sheet face',
  );
});

/**
 * The CART is a FORM, so it wears the repair intake skeleton, not a card.
 *
 * Operator 2026-09-15: *"it should be very similar to the repair service intake
 * form with the stepper on top and its full width and then a fixed width in the
 * middle. Why are you fixing width for the entire display? … There should be no
 * reason why you're wrapping the cart form and then having another background
 * for it. There should just be a white background."*
 *
 * So: one white full-bleed plane per pane (`KIOSK_CENTRE_SURFACE`), the measure
 * on the BODY (`KioskPaneForm` → `KIOSK_POS_FORM_MEASURE`), and no second plane
 * behind the cart at all.
 */
test('every kiosk FORM is one white full-bleed centre surface', () => {
  const chrome = read('src/app/kiosk/kiosk-chrome.ts');
  assert.match(chrome, /export const KIOSK_CENTRE_SURFACE\s*=\s*\n?\s*'flex min-h-0 min-w-0 flex-1 flex-col bg-surface-card'/);

  const cart = read('src/app/kiosk/v2/KioskCartLedger.tsx');
  assert.match(cart, /className=\{KIOSK_CENTRE_SURFACE\}/, 'the cart is the centre surface');
  assert.doesNotMatch(
    stripComments(cart),
    /KIOSK_UTILITY_SHEET/,
    'a bounded card around a form fixes the width of its CHROME — that is the popover the operator rejected',
  );

  // The measure lives on the frame's BODY, never on the plane, so the step band
  // and the action floor run edge to edge.
  const frame = read('src/components/kiosk/KioskPaneForm.tsx');
  assert.match(frame, /KIOSK_POS_FORM_MEASURE/);
  assert.doesNotMatch(chrome, /KIOSK_CENTRE_SURFACE[\s\S]{0,120}max-w/, 'the plane is not measured');

  // One skeleton, propagated: every centre pane mounts the same plane. Since
  // Buyback and Pickup were deleted (2026-09-23) the shell hosts ONE centre
  // pane of its own — the repair stage.
  const shell = read('src/app/kiosk/KioskShell.tsx');
  assert.match(shell, /className=\{KIOSK_CENTRE_SURFACE\}/, 'the repair stage mounts the shared plane');
  assert.doesNotMatch(
    stripComments(shell),
    /"flex min-h-0 flex-1 flex-col bg-surface-card"/,
    'a hand-rolled white pane column is a fork of KIOSK_CENTRE_SURFACE',
  );
});

/**
 * Flat, everywhere. The sheet composed `elevationClass('overlay')` for one
 * session and the cart line card carried a soft lift per row. Operator
 * 2026-09-14: *"it should not display a depth drop shadow."*
 *
 * Declarations are matched, not whole files: the docblocks legitimately name
 * the elevation they removed.
 */
test('kiosk surfaces are FLAT — depth is a plane, not a blur', () => {
  const chrome = read('src/app/kiosk/kiosk-chrome.ts');
  const sheetDecl = /export const KIOSK_UTILITY_SHEET = cn\(([\s\S]*?)\n\);/.exec(chrome);
  assert.ok(sheetDecl, 'KIOSK_UTILITY_SHEET is no longer a cn() composition');
  assert.doesNotMatch(
    sheetDecl[1],
    /elevationClass|shadow-/,
    'the sheet carries no elevation — operator 2026-09-14: "it should not display a depth drop shadow"',
  );
  assert.match(sheetDecl[1], /border border-border-soft/, 'the hairline is the sheet edge');

  // The sunken plane is the SHEET's cue only, and never behind the cart, which
  // is white full-bleed. A permanent sunken stage would recolour the browse
  // surface and break the one-background law in kiosk-pos-surface.test.ts.
  assert.match(chrome, /export const KIOSK_UTILITY_STAGE = 'bg-surface-sunken'/);
  assert.match(
    read('src/app/kiosk/KioskShell.tsx'),
    /utilitySlot !== null && utilitySlot !== 'cart' && KIOSK_UTILITY_STAGE/,
  );

  const card = read('src/components/kiosk/KioskCartLineCard.tsx');
  assert.doesNotMatch(
    stripComments(card),
    /elevationClass|shadow-/,
    'a lifted card on a de-shadowed surface is the same popover cue one altitude down',
  );
});
