/**
 * The repair paperwork is the review surface, and this pins the four ways the
 * 2026-09-15 ruling can quietly stop being true.
 *
 * Operator: *"it should just display the paperwork instead of the hand-rolled
 * review component … displaying the signature live onto the paperwork and
 * displaying the ticket number that will be created in the paperwork display
 * and displaying the full paperwork. Like right now it's just displaying the
 * drop-off, it should display the pickup signature as well at the bottom of the
 * paperwork and there should be a print icon top right."*
 *
 * A source-shape test on purpose: this repo has no React test renderer, and the
 * invariants are "which component renders the agreement" and "which prop
 * carries which meaning". The printed geometry itself is measured in
 * `src/lib/repair/signature-geometry.test.ts`.
 *
 *   npx tsx --test src/components/repair/repair-paperwork-law.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const FORM = 'src/components/repair/RepairServiceForm.tsx';
const PANE = 'src/app/kiosk/v2/KioskRepairPane.tsx';
const read = (p: string) => readFileSync(p, 'utf8');

/**
 * SCALE and COMPLETENESS are different questions. `density` carried both, so
 * the only way to get the pickup signature was to also accept A4 geometry —
 * which does not fit a 512px counter form column. Re-merging them is how the
 * pickup line disappears again.
 */
test('scale and completeness are separate props on the paperwork', () => {
  const src = read(FORM);
  assert.match(src, /density\?: 'full' \| 'compact'/);
  assert.match(src, /sections\?: 'dropoff' \| 'full'/);
  // Completeness gates the pickup block — never `isCompact` again.
  assert.match(src, /\{showFullDocument && \(/);
  assert.doesNotMatch(src, /\{!isCompact && \(/, 'the pickup block is gated by sections, not scale');
});

test('the review step renders the WHOLE document, at column scale', () => {
  const src = read(PANE);
  assert.match(src, /sections="full"/, 'the pickup signature must be on the sheet');
  assert.match(src, /density="compact"/, 'an A4 page does not fit the form column');
  assert.match(src, /<RepairServiceForm/);
  // And the hand-rolled summary stays gone.
  assert.doesNotMatch(src, /KioskRepairReviewCard/);
});

/**
 * The ink lands on the document the customer is signing, and the band it lands
 * in is the PRINTED band — same height, same `object-fit`, so the screen and
 * the paper cannot disagree about where the stroke sits.
 */
test('the signature is drawn into the band, at printed geometry', () => {
  const form = read(FORM);
  assert.match(form, /signatureUrl\?: string \| null/);
  assert.match(form, /REPAIR_PRINT_SIGNATURE_BAND\.inkHeightPx/, 'band height is the print law');
  assert.match(form, /object-contain/, 'the same fit the print route uses');
  assert.doesNotMatch(form, /height: '24px'/, 'the bare literal is retired');

  const pane = read(PANE);
  assert.match(
    pane,
    /dropoffSignatureUrl=\{signatureData\?\.dataUrl \?\? null\}/,
    'the pad output must reach the sheet live',
  );
  assert.doesNotMatch(
    pane,
    /pickupSignatureUrl=/,
    'nobody has collected the unit yet — pickup stays an empty rule',
  );
});

test('the ticket preview is on the review display', () => {
  const pane = read(PANE);
  // The number rides the sheet's own heading slot, through ONE derivation.
  assert.match(pane, /paperworkTicketId \?\? ''/);
  assert.match(pane, /useNextTicketPreview/);
  assert.doesNotMatch(pane, /kiosk-repair-print|Print paperwork/);
});

/**
 * The review is the only paperwork mount. Success is the cart's receipt face,
 * so there is no second submitted-paperwork rendering to keep in sync.
 */
test('one paperwork derivation feeds every review sheet, with no second mount', () => {
  const pane = read(PANE);
  assert.match(pane, /const paperworkSheets = useMemo/);
  assert.match(pane, /paperworkSheets\.map\(\(sheet\) =>/);
  assert.equal((pane.match(/<RepairServiceForm/g) ?? []).length, 1);
  assert.equal((pane.match(/\{\.\.\.sheet\.props\}/g) ?? []).length, 1);
  assert.match(pane, /<KioskCartDoneFace/);
  assert.doesNotMatch(pane, /printDomNode|surface="print"/);
});
