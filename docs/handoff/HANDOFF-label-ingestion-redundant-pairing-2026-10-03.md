# Handoff — Label ingestion: redundant pairing + backfill from the label (2026-10-03)

Pin this. A shipping label bought **anywhere** (CycleForge, Amazon Buy Shipping, eBay labels,
ShipStation, a carrier site) must land on its order — parsed, paired, and the order's missing
facts filled from the label — without depending on any single system being right. CycleForge
is in dogfood: it is one source, never the only one.

## 0. Owner decisions (defaults — confirm before turning anything from shadow to live)

| # | Decision | Default in this handoff |
|---|---|---|
| D1 | Label fills a **missing** order address | Yes: fill blanks only, never overwrite a present field |
| D2 | Label fills a **missing** order tracking number | Yes: primary when the order has none, additional package when it has one (already live) |
| D3 | Label address disagrees with the order's address (ZIP differs) | Do not auto-pair by name; confirmation exception |
| D4 | New external sources (Amazon packages, eBay fulfillments, carrier destination) | Shadow mode first (log agreement, do not pair alone) for 1–2 weeks |
| D5 | Is a label-derived address a "staff correction" (`shipping_edited_at`)? | No — it is channel-grade data; stamp provenance in audit, leave `shipping_edited_at` NULL so a later channel sync may still correct it |

## 1. The job (operator definition of done)

1. **Buy in CycleForge** (first-class path): select an order → buy label → it is paired at purchase.
2. **Old way stays** (fallback): bulk-upload label PDFs → print them, paired or not.
3. **New way**: bulk-upload label PDFs → every page is parsed and paired to its order number:
   - buyer has exactly one open order → paired to that order (all its product lines);
   - buyer has several open orders and some already hold labels → the most recent unlabeled one;
   - buyer has several open orders, none (or all) labeled → **confirmation exception** (operator picks;
     the buyer's other waiting labels then pair by rule).
4. **Backfill from the label** (this handoff's new requirement):
   - order has **no tracking** → the label's tracking becomes the order's tracking;
   - order has **no ship-to address** (or no buyer name) → the label's ship-to block is parsed and
     written onto the order's buyer.
5. **Pack**: scan the tote or a unit serial → its order → all documents (every label, slip, manuals)
   → automatic print drop.

## 2. First principles (industry roots — cite these when deciding edge cases)

1. **Identity is minted at creation, not inferred later.** The system that bought the label already
   holds `tracking ↔ shipment/order` (ShipStation label response carries `tracking_number` +
   `shipment_id`; Amazon/eBay mark the order shipped with tracking when you buy through them). Ask the
   issuing platform before reading the PDF.
2. **Machine-readable beats human-readable.** USPS IMpb = `420`+ZIP routing + channel AI + tracking
   (USPS Pub 199). UPS MaxiCode carries destination postal code, tracking, shipper number, optional
   Shipment ID, package x of n, ship-to address/city/state. Printed text is for people.
3. **Put your own key on the label.** Carrier reference fields (ShipStation `label_messages`
   `reference1..3`; USPS ≤60 chars printed under the barcode; FedEx REF/INV/PO; UPS "Trx Ref No").
   Order number in `reference1` makes pairing exact.
4. **One package, one license plate; orders link by data.** (GS1 Logistic Label: SSCC per unit,
   customer PO as AI 400.) Tracking = our package key; an order may own several, a package one order.
5. **Fuzzy matching is a fallback that ends in a human queue.** Name alone never auto-pairs when the
   address disagrees; two independent soft keys (name + ZIP) may.
6. **Verify at pack-out.** Scan the label barcode against the order before it leaves.
7. **Redundancy = independent sources + reconciliation**, not retries of one source.

Sources: ShipStation label messages (docs.shipstation.com/label-messages), ShipStation US label
examples (help.shipstation.com …/10150289124891), UPS MaxiCode field list
(support.celiveo.com …/79000144553), USPS IMpb (Federal Register 2011-24705; Pub 199 v28), GS1
Logistic Label Guideline (gs1.org), Amazon Orders API v2026-01-01 `includedData=PACKAGES`
(github.com/amzn/selling-partner-api-models/discussions/3089), eBay `getShippingFulfillments`
(developer.ebay.com).

## 3. Evidence sources and the decision rule

| # | Source | Strength | Fails when |
|---|---|---|---|
| A | Bought in CycleForge (`shipping_label_purchases`) | exact | CycleForge down / buggy (dogfood) |
| B | Issuing platform's record: Amazon Orders v2026-01-01 packages, eBay `getShippingFulfillments`, ShipStation shipments | exact | API unwired / lagging / rate-limited |
| C | The label PDF: barcode tracking, ship-to block (name, address, ZIP), reference fields | exact (reference) / soft (name, address) | image-only, unreadable |
| D | Carrier tracking: destination city/state/ZIP from USPS/UPS/FedEx tracking poller | soft, independent of the PDF | not yet carrier-scanned |
| E | Human: confirmation exception + pack-time label scan | final | human error |

**Rule:** auto-pair on **one exact** source, or **two independent soft** sources that agree.
Disagreement or a single soft source → confirmation exception. A reconciler re-checks paired labels as
new sources arrive (B or D contradicting a pair → flag as suspected mispair; confirming → upgrade).

## 4. What is already live (do not rebuild)

Migrations applied to the prod lane DB 2026-10-03:
`2026-10-03_label_ingestions_buyer_pairing.sql` (column `label_ingestions.detected_ship_to_name`,
match methods `TRACKING_NUMBER | BUYER_NAME | BUYER_NAME_NEXT_UNLABELED | OPERATOR_CONFIRMED`,
index `(organization_id, matched_order_id)`), `2026-10-03_document_print_jobs_label_ingestion.sql`.

| Area | File | What it does |
|---|---|---|
| Layout reader (pure) | `src/lib/label-ingestions/label-text-layout.ts` | positioned text → runs; `readShipToName` (SHIP TO marker → else not-origin-ZIP block → else largest/lowest); `readTrackingFromRuns`; `readTrackingValue` |
| Barcode reader | `src/lib/label-ingestions/label-barcodes.ts` | pure-JS Code128/PDF417/DataMatrix from embedded rasters (`@zxing/library`), upright + quarter-turn, banded |
| Parser | `src/lib/label-ingestions/pdf-parser.ts` | labelled refs → tracking (labelled › layout › barcode) → `shipToName`; `LABEL_PARSER_VERSION = v2.0.0` |
| Resolver | `src/lib/label-ingestions/exact-resolver.ts` | ladder: printed ref+account › tracking already on one logical order › buyer-name rule (`pickBuyerOrder`), per-buyer advisory lock; `findBuyerOrders`, `normalizeBuyerName`, `sameBuyer` |
| Settle | `src/lib/label-ingestions/ingestion-service.ts` `processStagedLabel` | resolve + MATCHED/QUARANTINED in one tx; sets `matched_order_id`; post-commit `attachPairedTracking` (primary if order untracked, else additional package; skipped for `TRACKING_NUMBER`) |
| Exception | same file: `listLabelPairingCandidates`, `confirmLabelIngestionOrder`; routes `GET /api/v1/label-ingestions/{id}/candidates`, `POST …/{id}/confirm-order` | operator pick → MATCHED `OPERATOR_CONFIRMED`, audit, attach tracking, re-resolve the buyer's other `BUYER_AMBIGUOUS` labels |
| Desk UI | `src/features/labels-docs/PairOrderCard.tsx`, `upload/use-label-uploads.ts` | buyer's candidates (unlabeled first) + search; upload summary `N added · N paired · N to confirm · N unpaired` |
| Batch | `src/lib/label-batches/batches.ts`, contract `confirmPages` | per-batch paired / to-confirm counts; route `maxDuration = 300` |
| Pack | `src/app/api/packing-logs/route.ts`, `src/lib/packing/pack-scan-order.ts`, `src/lib/neon/serial-units-queries.ts#findOpenOrderForUnitScan`, `src/lib/documents/print-bundle.ts` | tote / unit serial → order → pack → bundle of every label (incl. paired MATCHED/LINKED ingestions), slip, manuals → auto print; mobile `/m/pack/start/{id}?print=1` |

Measured on real labels on file: ShipStation USPS and Pitney Bowes labels have a text layer (name +
tracking read); 54/100 UPS labels are image-only (tracking read from the 1Z Code128; **no name**).

## 5. Work to do

### Phase 1 — Parse the full ship-to block (prerequisite for backfill + ZIP guard)

- `label-text-layout.ts`: replace `readShipToName` with `readShipTo(runs)` returning
  `{ name, company, address1, address2, city, state, postalCode } | null` from the chosen block
  (block lines top→bottom: name, optional company, street line(s), city/state/ZIP; `CITY_STATE_ZIP`
  already captures ZIP; split city/state from that line). Keep the block-selection rules unchanged.
- `ParsedLabelEvidence.shipTo` (replaces `shipToName`); keep `shipToName` derived for the resolver.
- Migration (new file, never edit applied ones): `label_ingestions.detected_ship_to JSONB` (bounded
  CHECK on size). Stores only the parsed block, never raw text.
- Tests: extend `label-text-layout.test.ts` fixtures (ShipStation USPS, rotated Pitney Bowes) to
  assert every field; a two-street-line address; an address with `APT`/`STE`; a company line.

### Phase 2 — Backfill the order from the label (D1, D2, D5)

- After MATCHED (auto or `OPERATOR_CONFIRMED`), post-commit, best-effort like `attachPairedTracking`:
  - **Tracking**: already live — keep; add an audit row `label_ingestion.tracking_backfilled`.
  - **Address / buyer name**: read the order's buyer (customer book ship-to, else ShipStation
    `ship_to`). For each field that is **blank on the order** and present on the label, fill it.
    Writer: reuse the customer-book path (`src/lib/orders/order-buyer.ts` `updateOrderBuyer` /
    `buyerFromShipToSnapshot`) — do **not** add a second ship-to writer. It currently stamps
    `shipping_edited_at`; per D5 add an option so a label backfill leaves the stamp NULL.
  - Never overwrite a present field. Never write when the label ZIP disagrees with an existing order
    ZIP (that label is a D3 exception, not a backfill).
  - Audit: `label_ingestion.address_backfilled` with the fields filled and the ingestion id.
- UI: the paired card / order record shows "Address from label" provenance on filled fields.
- Tests: fills only blanks; refuses on ZIP conflict; multi-row logical order gets one customer write.

### Phase 3 — ZIP guard on buyer-name pairing (D3)

- `exact-resolver.ts`: `findBuyerOrders` also returns each candidate's ship-to ZIP5; the buyer rung
  pairs only when the label ZIP5 equals the candidate's ZIP5, or the candidate has no ZIP (then it is a
  backfill case). Mismatch → new reason `BUYER_ADDRESS_MISMATCH` (copy in `ledger-view.ts`).
- Candidates list shows the ZIP and flags mismatches.

### Phase 4 — Independent platform sources (B) in shadow mode (D4)

- **eBay**: `EbayClient.getOrderShippingFulfillments` (`src/lib/ebay/client.ts:413`) exists with no
  caller. Add a source that, for an eBay candidate order, reads fulfillments and compares
  `shipmentTrackingNumber` to the label's tracking.
- **Amazon**: `src/lib/amazon/client.ts` uses Orders `/v0`. Add `getOrder` on
  `/orders/2026-01-01/orders/{orderId}?includedData=PACKAGES` (tracking, carrier, package status;
  historical orders too) — also a backfill job for order tracking.
- **Carrier destination (D)**: read destination city/state/ZIP the tracking poller already stores
  (`shipping_tracking_numbers.latest_payload`) and compare with the label/order ZIP.
- Evidence ledger: `label_ingestions.pairing_evidence JSONB` = `[{source, orderId|null, verdict:
  'agree'|'disagree'|'absent', at}]`. Shadow mode: record, never pair from B/D alone. Metrics query:
  agreement rate per source, mispairs caught, labels left unpaired.

### Phase 5 — Reconciler + promotion

- Cron (pattern: `src/app/api/cron/documents/ecwid-packing-slips/route.ts` + `withCronLock`):
  re-resolve `QUARANTINED` labels (orders arrive after labels), re-check MATCHED labels against B/D;
  contradiction → flag `SUSPECTED_MISPAIR` on the desk; never silently re-pair.
- Promote a source from shadow to "exact" only after its shadow metrics meet the bar the owner sets.

### Phase 6 — Own key on the label + pack-time verify

- ShipStation setting: Label Message 1 = order number. Parser: read USPS bottom-of-label messages,
  FedEx `REF:`, UPS `Trx Ref No` as a CycleForge/marketplace reference (exact rung).
- Pack: scanning the applied label's barcode must equal the order's tracking; mismatch blocks pack.

## 6. Non-goals / guardrails

- No raw PDF text persisted. No overwrite of present order data from a label. No auto-pair among
  several orders. No second ship-to writer, print transport or order search API.
- Applied migrations are immutable (`scripts/run-pending-migrations.mjs` checks sha256) — new file
  for every schema change.
- Dev origin `http://localhost:3050` only; lane `cycleforge-lane@prod`. The lane DB holds **real**
  orders: test with QA orders or the owner-approved test label, and clean up.

## 7. Test assets

- `~/Downloads/TEST-label-Anna-Jones-113-5100995-6505066.pdf` — USPS Ground Advantage label in the
  measured ShipStation layout for real open order **Amazon 113-5100995-6505066** (row 19802, buyer
  Anna Jones, ABINGDON VA 24211-7068), fake tracking `9400 1999 0010 0302 6100 01`. Dry-run verdict:
  `BUYER_NAME → 113-5100995-6505066`. Uploading it **writes fake tracking onto that real order** —
  remove afterwards.
- To make another: render with `pdf-lib` at 288×432 pt using the positions in
  `label-text-layout.test.ts` (`SHIPSTATION_USPS`), barcodes via `bwip-js` (`code128` text
  `420<zip5><tracking>`, `datamatrix`, `pdf417`). For a Phase 2 test pick an open order whose
  customer/ShipStation ship-to address is blank.

## 8. Verify

- `node --require ./scripts/register-server-only-shim.cjs --import tsx --test src/lib/label-ingestions/*.test.ts src/lib/packing/pack-scan-order.test.ts src/lib/documents/print-bundle.test.ts`
- `pnpm exec tsc --noEmit -p .`, `pnpm exec tsx scripts/generate-v1-openapi.ts` when v1 routes change.
- `pnpm verify:fast` — at handoff time it was red on gates outside this work
  (`src/components/package-feed/PackageFeedColumnView.tsx` typecheck; design-consolidation entries
  `mobile-sheet-systems`, `mobile-location-ordinal-picker`; 4 lint errors not yet attributed).
- Smoke at `:3050/shipping/label-intake`: upload → summary counts → card paired → order shows tracking
  and (Phase 2) the backfilled address → pack scan → print dialog with label + slip.
