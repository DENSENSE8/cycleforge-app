# HANDOFF — Industrial record: evidence panel, buyer-note interlock, labels port (2026-09-24)

Paste this as the first message of a fresh session in the **prod lane**
(`~/Projects/cycleforge-lanes/prod`). Record law: `HANDOFF-industrial-record-ledger.md`
(anatomy updated this session). Dev origin `http://localhost:3050` only. Do not commit. The tree
carries other lanes' uncommitted work — touch only what the task needs.

## First step

1. `read agent://LabelsWalkPort` (or its transcript). A sub-agent was porting the **Labels**
   paperwork walk (`src/components/outbound/orders/paperwork/**`) to the industrial DS. If it
   didn't finish, finish its brief: same behaviour, new faces, before/after screenshots at 1440×900.
2. One open fix, not started yet: in `LedgerTrackingReplace`
   (`outbound-orders-ledger-editors.tsx`, the `{current ? 'Replace' : 'Add'}` label), make the
   trigger a square pencil icon cell so the evidence panel's `TRK#` row stops truncating the
   number. The owner wants that row to be just `TRK#`, the number, and its actions (no carrier).

## Done this session (all uncommitted, verified live at :3050)

- **Phone header** (`MobileTopBar`, `mobile-scan-cta`, `MobileActionSlot`, `MobileDetailTopBar`):
  menu and scan are square 44px cells, flush to the edges. The scan button is icon-only.
  `mobile-action-slot.test.ts` was updated for this.
- **Phone `/m/orders` bar** (`MobileToShipQueue.tsx`): two rows of desk-style segments.
  Row 1 is the view tabs with counts. Row 2 is search icon · Platforms · sort · Ledger ·
  sync icon on the right.
- **Platform short labels**: the ledger band 1 (and the seed parent), the phone record, and the
  evidence panel / phone sheet read `useOrderChannel()`. The ledger toolbar has an **Edit
  platforms** button (`CatalogManagerPopover`). The duplicate-key warning in
  `CatalogManagerList` fallback labels is fixed. Migration
  `2026-09-24_platform_short_labels.sql` is **not applied** (it is the only pending one).
- **Buyer-note interlock**. Buyer note = `orders.buyer_note` (only eBay ingests it).
  - Logic: `src/lib/orders/buyer-note-interlock.ts`. The ack is an `ops_events` row keyed to
    the current note's sha, so there is no new table and an edited note holds again.
  - Ack route: `POST /api/orders/[id]/buyer-note/ack`, gated packing.complete_order OR
    shipping.buy_label in-handler. It is pinned in `route-permission-manifest.test.ts`; the
    manifest was regenerated, which also picked up other lanes' new routes.
  - Server gates: `/api/packing-logs/draft`, `/api/packing-logs`, `/api/pack/ship`,
    `/api/shipping/order-labels/purchase`.
  - Client: `sendWithBuyerNoteAck` (`src/lib/orders/buyer-note-ack-client.ts`) is used by the
    phone pack start, `PackScanColumn`, `MarkAsShippedForm`, and `BuyLabelSection`. It opens the
    app confirm dialog with the full note, then retries with a fresh idempotency key.
  - UI: `RecordNoteSlot` / `BuyerNoteBlock` (`src/design-system/components/RecordNoteSlot.tsx`).
    The NOTE badge sits on band 1 beside the state code, in a fixed-width slot on every row.
    Noted rows get a 2px amber inset on the spine. The note text leads the evidence panel and
    the phone sheet.
  - Removed: the note editor from ledger band 3. It remains in the evidence Note fact.
  - Verified: an un-acked draft and label purchase both return 409 `BUYER_NOTE_UNACKNOWLEDGED`.
    The modal was screenshotted. After the ack, the hold released.
- **Evidence panel** (`OutboundOrderEvidence.tsx`):
  - SKU stock ↗ (`/inventory?sku=`) and All products ↗ (`/inventory/skus`).
  - Set/Change SKU bin (`LedgerSkuBinPicker` → `/api/update-sku-location`, which now
    invalidates the orders caches).
  - Platform picker (`LedgerPlatformPicker` → `PATCH /api/orders/[id]` `accountSource`).
  - Order # and TRK# each have copy + open (`LedgerValueActions`); TRK# also has Replace
    (assign waist `shippingTrackingNumber`).
  - The feed now returns `buyer_note` and `sku_home_location`. The cache key was bumped
    (`recordFactsVersion`).
  - Ledger BIN falls back to `BIN HOME …` (`resolveOrderBin`) when nothing is allocated.
- **Pre-existing bugs fixed on the phone pack path**: the draft route's `FOR UPDATE` on an outer
  join is now `FOR UPDATE OF o`. The `startPackerLogCapture` ON CONFLICT predicate now matches
  its partial index (`AND shipment_id IS NOT NULL`). Before these fixes, phone pack start could
  never succeed.

## Open decisions / follow-ups

1. Ecwid writes `customerComments` into `orders.notes` (the operator trail), not `buyer_note`, and
   Amazon, ShipStation, Shopify and Square ingest no buyer note. Recommended: map them to
   `buyer_note` in `ingest-canonical-orders` + the connectors.
2. The phone sheet has none of the new panel edits yet (platform, bin, tracking, stock). SURFACE_LAW
   says every verb must be completable on `/m`.
3. `/m/orders` is still the default card view. The ledger stays a test mode until the
   outbound-workflow cohort is re-ratified.
4. Seed order 13631 (`CF-ML-5LINE-SEED`) was used for tests and reverted. Its ops_events and
   audit_logs ack rows remain because those tables are append-only.
5. `verify:fast`: my files are clean. Typecheck reds belong to other lanes (`picking/sessions.ts`,
   `UnitQcRunner.tsx`, the print-station `targetStationId` edits).
6. Migrations `2026-09-24_platform_short_labels.sql` and
   `2026-09-24_automation_rules_item_sku_pair_key.sql` are unapplied. Apply them only with the
   owner's go-ahead.
