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

test('the ticket preview and a print control are both on the review display', () => {
  const pane = read(PANE);
  // The number rides the sheet's own heading slot, through ONE derivation.
  assert.match(pane, /paperworkTicketId \?\? ''/);
  assert.match(pane, /useNextTicketPreview/);
  assert.match(pane, /ariaLabel="Print this paperwork"/);
  assert.match(pane, /<Printer /, 'a print affordance is a printer glyph');
});

/**
 * A LINKED ticket outranks the projection (2026-09-15, with the ticket step).
 *
 * This assertion replaced a bare `nextTicketId ?? ''` pin. The law it was
 * defending — the sheet's number comes from one derivation handed to both
 * mounts — is unchanged; what changed is that there are now TWO possible
 * numbers, and only one of them is a fact. `ATTACH_TICKET` stamps
 * `repair_service.ticket_number` with the picked ticket, so a sheet still
 * showing the projection after the counter chose to attach would disagree with
 * the paper it prints.
 */
test('a picked existing ticket, not the projection, is what the sheet states', () => {
  const pane = read(PANE);
  assert.match(
    pane,
    /ticketChoice\?\.mode === 'attach'[\s\S]{0,200}ticketId[\s\S]{0,120}:\s*nextTicketId/,
    'the attach id wins, the projection is the fallback',
  );
});

/**
 * The icon must NOT print the sheet on screen.
 *
 * The visible sheet is `density="compact"` — column width, small type, sized
 * for a 512px form measure. Printing it would hand the customer a signed
 * document that is not the drop-off paperwork: a third rendering of the
 * agreement, the exact defect that got the hand-rolled review card deleted.
 * So the icon prints the A4 `surface="print"` layout of the SAME component,
 * with the same props object and the same ink.
 */
test('print targets the A4 surface, and both mounts share one props object', () => {
  const pane = read(PANE);
  assert.match(pane, /printDomNode\(printSheetRef\.current/, 'never the on-screen sheet ref');
  assert.match(pane, /surface="print"/, 'the printed copy is the A4 layout');

  // One facts object, two mounts — they cannot state different facts.
  const spreads = pane.match(/\{\.\.\.paperworkProps\}/g) ?? [];
  assert.equal(spreads.length, 2, 'screen sheet and print copy must share the props memo');
  assert.doesNotMatch(
    pane,
    /buildRepairIntakeReceiptProps\([\s\S]{0,400}buildRepairIntakeReceiptProps\(/,
    'the mapper must be called once, not per mount',
  );

  // The print copy has to LAY OUT to be printable, so it is parked
  // off-viewport rather than `hidden`; printDomNode clears that on its clone.
  assert.match(pane, /left: '-10000px'/);
  assert.match(read('src/lib/print/print-dom-node.ts'), /cloneNode\(true\)/);
});
