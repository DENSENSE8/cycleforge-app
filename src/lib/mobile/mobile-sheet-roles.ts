/**
 * The sheet-vs-screen law (operator 2026-09-24), as data: every phone file that
 * mounts `<BottomSheet` — anything under `src/components/mobile` or `src/app/m`
 * — declares what that sheet is FOR.
 *
 * Allowed roles are the five the operator named:
 *   - `edit`        — an edit opened from the `/info` pencil (or a row pencil)
 *   - `dock-verb`   — the form behind one verb (a dock verb, a row CTA)
 *   - `confirm`     — a deliberate confirmation / notice
 *   - `picker`      — choose a value, staff, reason, type, bin
 *   - `linked-peek` — a quick look at a LINKED thing from inside another screen
 *
 * `record` is the one role the law is shrinking: the PRIMARY record of the job
 * being worked (an order while picking or packing, a carton, a unit, a bin, a
 * SKU, a ticket) shown as a sheet. It belongs on its hub route — a full
 * scrollable screen on `DetailHubScreen` with an X back to the job. Existing
 * record sheets are counted against {@link MOBILE_RECORD_SHEET_BASELINE}.
 *
 * Read by `scripts/detail-hub-guard.ts` (the `Detail hub` gate): an unlisted
 * sheet file fails with "classify it", a listed file that no longer mounts a
 * sheet fails with "drop it", and the record count may only go down.
 */

export type MobileSheetRole = 'edit' | 'dock-verb' | 'confirm' | 'picker' | 'linked-peek' | 'record';

/** Repo-relative file (POSIX) → the role of the sheet(s) it mounts. A file with several sheets takes the heaviest role. */
export const MOBILE_SHEET_ROLES: Readonly<Record<string, MobileSheetRole>> = {
  // daily
  'src/components/mobile/daily/MobileDailyComposerSheet.tsx': 'dock-verb', // add-a-checklist-item form
  'src/components/mobile/daily/MobileDailySheets.tsx': 'edit', // a checklist row's pencil lands here, title focused
  'src/components/mobile/daily/MobileTaskSheet.tsx': 'dock-verb', // a handed task's row CTA: instructions + Start / Mark done / Add media
  'src/components/mobile/daily/MobileSharedTaskComposerSheet.tsx': 'dock-verb', // Add task: words, who, optional record
  // fnsku
  'src/components/mobile/fnsku/FnskuStationSheet.tsx': 'picker', // which print station takes the FBA label reprint
  // on-hold
  'src/components/mobile/onhold/SkuExceptionEditSheet.tsx': 'edit', // /m/on-hold/[sku]/info pencil
  // orders
  'src/components/mobile/orders/MobileOrderEvidenceSheet.tsx': 'record', // the order, from the to-ship ledger
  'src/components/mobile/orders/MobileOrderPaperworkSheet.tsx': 'dock-verb', // order documents and pair/print actions from pick or pack
  // packer
  'src/components/mobile/packer/MobilePackingSheet.tsx': 'record', // one packed order (packer log entry)
  // pair
  'src/components/mobile/pair/PairDetailSheet.tsx': 'linked-peek', // where this SKU already lives, before pairing a bin
  // picker
  'src/components/mobile/picker/ShortPickSheet.tsx': 'confirm', // short-pick reason, a deliberate decision
  'src/components/mobile/picker/directed/DirectedPickNotesSheet.tsx': 'dock-verb', // note on this pick
  // receiving
  'src/components/mobile/receiving/MobileArrivalClassifyFlow.tsx': 'picker', // Platform → Type → Priority
  'src/components/mobile/receiving/MobileArrivalDetailsSheet.tsx': 'edit', // Platform · Type · Priority in one sheet
  'src/components/mobile/receiving/MobileCartonSheet.tsx': 'record', // the carton; its hub is /m/r/[id]
  'src/components/mobile/receiving/ReceivingShareToPhoneSheet.tsx': 'confirm', // "Shared from computer" notice
  // redesign
  'src/components/mobile/redesign/MobileOrderDocumentsSheet.tsx': 'dock-verb', // Documents verb
  'src/components/mobile/redesign/MobileToShipPickerSheet.tsx': 'picker', // pass pick to another picker
  'src/components/mobile/redesign/MobileToShipSheet.tsx': 'record', // the order, from the to-ship queue
  // repair
  'src/components/mobile/repair/RepairCustomerPickerSheet.tsx': 'picker',
  'src/components/mobile/repair/RepairInfoEditSheet.tsx': 'edit', // /m/rs/[id]/info pencil
  'src/components/mobile/repair/RepairPickupSheet.tsx': 'dock-verb', // pickup sign-off
  'src/components/mobile/repair/RepairStatusSheet.tsx': 'dock-verb',
  'src/components/mobile/repair/ScanValueField.tsx': 'picker', // scan a value into a field
  // reports
  'src/components/mobile/reports/MobilePackerItemsSheet.tsx': 'linked-peek', // one packer's packs, from the day report
  'src/components/mobile/reports/MobileStaffDayReport.tsx': 'linked-peek', // one staffer's day, from the day report
  // scan
  'src/components/mobile/scan/ProvisionalCreateSheet.tsx': 'dock-verb', // pair screen's "SKU exception" verb: identify · triage · put away
  // shipping
  'src/components/mobile/shipping/shipment/ShipmentResolveSheet.tsx': 'dock-verb', // package hub's Resolve exception
  // station
  'src/components/mobile/station/MobileStationEntrySheet.tsx': 'linked-peek', // every fact of one /m/scan tape entry; the record is its hub
  // unit
  'src/components/mobile/unit/UnitLineSheets.tsx': 'dock-verb', // Line test · Stash in bin
  'src/components/mobile/unit/UnitSheetParts.tsx': 'dock-verb', // shell of the unit hub's verb sheets
};

/**
 * `record` entries when the gate landed (2026-09-25). SHRINK-ONLY: move a
 * record sheet onto its hub route, delete its entry, and drop this number in
 * the same commit. Raising it is the one edit this constant exists to stop.
 */
export const MOBILE_RECORD_SHEET_BASELINE = 4;
