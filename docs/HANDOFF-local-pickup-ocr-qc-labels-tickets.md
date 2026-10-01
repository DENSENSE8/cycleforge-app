# Handoff prompt — Local pickup paperwork → unit labels → QC → tickets

Use this as the implementation prompt for the next CycleForge workstream. It
is intentionally executable: preserve the invariants, work phase by phase, and
do not replace existing source-of-truth writers with page-local mutations.

## Mission

Finish the local-pickup lane so an operator can photograph paperwork on a
phone or kiosk, review the OCR result, land the pickup once, and see it in both
Receiving and Sales. After receiving, every physical product must have its own
printable 2×1 QC label, scannable unit identity, visible triage/testing state,
and first-class support-ticket linkage.

The fast Receiving surface must make these states readable without opening a
record:

- triage not started / triaged;
- QC pending / testing again / passed / failed;
- label missing / printed;
- ticket absent / linked, with one direct Open ticket action.

AI Chat is a view and command surface over those records. It is never the
source of truth for OCR, pickups, units, QC results, labels, or tickets.

## Non-negotiable first principles

1. **Evidence is not an operational record.** A document upload produces a
   `DocumentOcrArtifact`. Receiving converts reviewed evidence into an
   `InboundOrderDraft`; only `ingestInboundOrder` writes the inbound order.
2. **One physical item, one durable unit identity.** Quantity three means three
   `receiving_line_unit` rows and, once issued, three `serial_units` identities
   and three 2×1 label jobs. Never print three indistinguishable SKU-only labels.
3. **Events are truth; fast facts are projections.** `testing_results`,
   `inventory_events`, `label_print_jobs`, triage writes, and `ticket_links`
   remain authoritative. A Receiving status projection may denormalize them,
   but must be rebuildable and must never become an alternate writer.
4. **One print grammar.** Reuse the existing product/QC label face and print
   pipeline. Do not clone `printRepairLabel`, hand-build a second 2×1 HTML
   face, or bypass print profiles.
5. **One modern list grammar.** Pickup/Receiving work uses
   `TriageCardList` + `RecordCard`, with expandable item rows and a record
   plane. Keep pickup on the card surface and do not hand-roll a second grid.
6. **One ticket grammar.** `support_tickets` + `ticket_links` own CycleForge's
   ticket identity/linkage; the provider adapter owns provider synchronization
   while that integration remains external. Reuse `TicketComposer` and
   `SupportTicketDetail`. Chat renders the same ticket read model; it does not
   store a private transcript or ticket copy.
7. **Navigation is declared, never populated by hardcoded records.** Contextual
   sidebar structure comes from `src/lib/nav/**`; recents and counts come from
   org-scoped loaders.
8. **Mobile is a first-class operator path.** Capture, review, label issue,
   scan, QC result, and ticket open must each have a `/m/*` completion path.
9. **Unlimited OCR is the dedicated local OCR model.** The exact Ollama model
   id is `unlimited-ocr:latest` on the RTX 5070 Ti. Keep page/byte limits,
   idempotency, timeouts, backpressure, and an explicit unavailable state.
   Never silently spill document bytes to a paid provider.

## Existing roots to build on

### Document intake and local OCR

- `src/lib/document-intake/contract.ts`
- `src/lib/document-intake/document-ocr.ts`
- `src/lib/inbound/extract-po-llm.ts`
- `src/app/api/receiving/inbound/extract-po/route.ts`
- `src/lib/assistant/attachment-ocr.ts`
- `src/lib/assistant/context-store.ts`
- `src/lib/assistant/agent-loop.ts`

The shared OCR layer accepts document bytes and emits page-labelled evidence
with a SHA-256 and `unlimited_ocr` provenance. Receiving and Chat are separate
adapters. Chat treats OCR text as untrusted `<document-content>` and cannot
create Receiving rows merely because a document was attached.

Production Vercel calls the server-reachable 5070 Ti Ollama endpoint through
`UNLIMITED_OCR_BASE_URL`, requests `UNLIMITED_OCR_MODEL`, and authenticates with
the optional bearer plus Cloudflare Access service-token variables. The browser
never calls the GPU tunnel directly. The authenticated readiness signal is
`GET /api/receiving/inbound/ocr-health`; do not weaken the local-only failure
when the endpoint is absent.

### Inbound/pickup writer and two read surfaces

- `src/lib/inbound/inbound-order-draft.ts`
- `src/lib/inbound/ingest-inbound-order.ts`
- `src/components/receiving/pickup/PickupWorkspace.tsx`
- `src/components/receiving/pickup/cards/**`
- `src/components/mobile/receiving/MobilePickupPaperworkScreen.tsx`
- `src/lib/local-pickup/pickup-lines-query.ts`
- `src/lib/walk-in/transactions.ts`

`InboundOrderDraft → ingestInboundOrder` is the only inbound writer. Its pickup
projection supplies both the Receiving local-pickup history and the Sales money
receipt. Do not add a second “chat import” or “mobile import” writer.

### Unit/QC label printing

- `src/lib/receiving/ensure-line-units.ts`
- `src/lib/print/unitLabelCore.ts`
- `src/lib/print/printProductLabel.ts`
- `src/components/labels/LabelFacePreview.tsx`
- `src/components/labels/LabelPreviewCard.tsx`
- `src/app/api/post-multi-sn/route.ts`
- `src/lib/labels/auto-unit-labels.ts`
- `src/lib/labels/print-jobs.ts`
- `src/components/inventory/qc-labels/QcLabelRecord.tsx`
- `src/lib/labels/qc-labels-queries.ts`
- `src/lib/print/printRepairLabel.ts` (behavioral reference only)

The repair label proves the simple 2×1 physical workflow. The receiving item
must use the product/QC face, because that face encodes the durable unit UID
used by Testing, Picking, Packing, and QC-label history.

### Testing and ticket linkage

- `src/lib/tech/recordTestVerdict.ts`
- `src/components/tech/TestingUnitSlots.tsx`
- `src/components/tech/testing-panel/TestingUnitsDisplay.tsx`
- `src/lib/support/tickets.ts`
- `src/lib/support/ticket-link.ts`
- `src/app/api/support/tickets/by-entity/route.ts`
- `src/app/api/support/tickets/link/route.ts`
- `src/components/receiving/workspace/line-edit/TicketDisplayHost.tsx`
- `src/components/composer/TicketComposer.tsx`
- `src/components/support/zendesk/chat/SupportTicketDetail.tsx`

`recordTestVerdict` owns PASS / TEST_AGAIN / TESTING_FAILED and the receiving
line rollup. `ticket_links` already supports `SERIAL_UNIT`, so a failed physical
unit can carry a ticket without falsely applying that ticket to every sibling
unit on a multi-quantity line.

## Canonical flow

```text
phone / kiosk / desktop upload
        │
        ▼
DocumentOcrArtifact (immutable evidence; local 5070 Ti)
        │
        ├── Chat adapter ──► untrusted transcript context ──► read/display only
        │
        ▼
Receiving adapter ──► reviewed InboundOrderDraft
        │
        ▼
ingestInboundOrder (only writer)
        │
        ├── local pickup Receiving projection
        └── Sales money-receipt projection
        │
        ▼
receiving_line ──► receiving_line_unit × physical quantity
        │
        ▼
serial_unit + unit_uid ──► 2×1 product/QC label + label_print_jobs
        │
        ▼
testing_results / inventory_events ──► PASS | TEST_AGAIN | TESTING_FAILED
        │
        ├── receiving fast-status projection
        └── ticket_links(SERIAL_UNIT) ──► support ticket detail/composer
                                            └── Chat renders same read model
```

## Phase 1 — complete the OCR intake foundation

1. Keep `DocumentOcrArtifact` provider-neutral and byte-derived. Add a durable
   document-intake asset table only when OCR evidence must survive independently
   of the uploaded file; do not reuse a business table as the OCR truth.
2. Move AI-composer attachment storage off the product-manual semantic lane in
   a focused migration. A minimal `document_intake_files` row should include:
   `id`, `organization_id`, `created_by`, `purpose`, `display_name`,
   `file_name`, `mime_type`, `byte_size`, `source_url`, `sha256`, timestamps,
   soft-delete, and optional OCR artifact JSON/version. Keep the current manual
   attachment compatibility until existing chats are migrated.
3. Support image pages and PDFs. For text PDFs, capture embedded text and retain
   the same artifact contract; for scanned pages, raster/OCR locally. A mixed
   multi-page document remains one artifact with ordered pages.
4. Add an OCR job state (`queued | reading | ready | needs_review | failed`) so
   a slow GPU does not hold an HTTP upload open. Deduplicate by
   `(organization_id, sha256, ocr_version)`.
5. Provide a staff-visible health/error state: configured, reachable, model,
   queue depth, last success. Never expose the vision token.

Acceptance:

- the same image yields the same SHA-256 artifact for Receiving and Chat;
- raw bytes never enter `resolveOrgAiChain` or its managed failovers;
- an unavailable local OCR service produces a reviewable failure, not invented
  pickup facts;
- instructions printed inside an attachment never override the assistant's
  system/tool policy.

## Phase 2 — materialize physical units before printing

Create a domain service such as
`src/lib/receiving/issue-receiving-unit-labels.ts`. Do not make a server module
call `/api/post-multi-sn` over HTTP. Extract/reuse its canonical primitives:

1. Lock the receiving line and load `quantity_expected`, SKU/catalog identity,
   condition, and current `receiving_line_unit` rows.
2. Call `ensureLineUnits` so the durable slot count is at least the physical
   quantity. Never shrink already-created units when quantity later falls.
3. For every slot without a `serial_unit_id`, mint/upsert a `serial_unit` with
   a stable internal synthetic serial and `unit_uid`. Record Receiving lineage,
   not `origin_source: manual`.
4. Attach each unit to its exact `receiving_line_unit` row inside the same
   tenant transaction where possible.
5. Return a label payload per unit. Browser/station printing consumes those
   payloads through `printProductLabel`; `label_print_jobs` records each unit.
6. Idempotency key shape:
   `receiving-label:{receivingLineId}:{receivingLineUnitId}:{issuanceVersion}`.
   A network retry with the same issuance version returns the same unit UID and
   ledger row. A new operator print action uses a new issuance version and is a
   reprint; neither path mints a new unit.

The 2×1 face must use `productLabelFace` / `LabelFacePreview`. Recommended
content is the existing product grammar: canonical title/SKU, condition, color
when known, and DataMatrix containing `unit_uid`. Do not print OCR confidence,
payment data, seller PII, or a support thread on a product sticker.

Acceptance:

- a pickup line with quantity 3 prints three distinct scannable unit labels;
- scanning any label resolves exactly one `serial_units.id` and opens its unit;
- reprinting increments `label_print_jobs` without minting another identity;
- the on-screen preview and physical print are generated from the same face.

### Phase 2 implementation checkpoint — 2026-09-29

The foundational writer and browser print connection are now present:

- `src/lib/receiving/issue-receiving-unit-labels.ts` locks the line, grows (and
  never shrinks) `receiving_line_unit`, creates stable `AUTO-RLU-{unitId}`
  storage identities for no-serial products, mints canonical `unit_uid` values
  through `upsertSerialUnit`, and returns one payload per physical unit.
- `POST /api/receiving/lines/[id]/unit-labels` is tenant/auth scoped with
  `print.label`; it never accepts an organization id from the browser.
- `src/lib/receiving/print-receiving-line-labels.ts` now calls that writer,
  prints every returned payload through `printProductLabel`, and records one
  idempotent `label_print_jobs` row per dispatched unit.
- Reprints preserve advanced unit lifecycle states instead of resetting a
  tested/stocked/picked/shipped unit to `LABELED`.

The next implementation context begins at Phase 3. Before calling Phase 2
fully proven in production, exercise one real quantity-3 line at `:3050` with
the configured 2×1 printer and confirm three distinct DataMatrix scans resolve
to the same three unit rows after a reprint.

## Phase 3 — build the fast Receiving QC projection

Add a rebuildable projection keyed by physical receiving unit, for example
`receiving_unit_stage_facts`:

```text
organization_id
receiving_line_unit_id  (unique tenant key)
receiving_line_id
serial_unit_id
unit_uid
triage_state            NOT_STARTED | TRIAGED
label_state             MISSING | PRINTED
qc_state                PENDING | TEST_AGAIN | PASSED | FAILED
latest_verdict
tested_at / tested_by
primary_support_ticket_id
updated_at / projection_version
```

This table is a read projection only. Implement one refresher,
`refreshReceivingUnitStageFacts(orgId, { lineIds?, serialUnitIds? })`, plus a
bounded rebuild command. Call it after these existing writers commit:

- triage completion/staging;
- `ensureLineUnits` / label issuance;
- `recordTestVerdict`;
- label print/reprint recording;
- ticket link/unlink for Receiving or `SERIAL_UNIT`.

Backfill from existing `receiving_line_unit`, `serial_units`,
`testing_results`, `label_print_jobs`, triage tables, and `ticket_links`. Add
tenant-leading indexes for `(organization_id, qc_state, updated_at DESC)`,
`(organization_id, receiving_line_id)`, and unit UID/serial lookup. Prove with
`EXPLAIN (ANALYZE, BUFFERS)` before adding more indexes.

Acceptance:

- projection recompute equals the event-derived state for fixtures covering
  pending, retest, pass, fail, label missing/printed, and linked ticket;
- two concurrent verdict/print operations converge to the same final row;
- the Receiving list does not run a per-card lateral query against
  `testing_results` or `ticket_links`.

### Phase 3 implementation checkpoint — 2026-09-29

The rebuildable projection is implemented and applied:

- `2026-09-29b_receiving_unit_stage_facts.sql` creates the tenant-keyed
  projection, constraints, initial backfill, and indexes for QC, label, line,
  and unit-UID reads.
- `src/lib/receiving/receiving-unit-stage-facts.ts` is the one projection
  writer. It supports targeted refreshes by carton, line, or serial unit, an
  org-bounded rebuild, and a projection-only fast read for the Phase 4 cards.
- Unit materialization/label issuance, triage completion, label-print jobs,
  test verdicts, and canonical ticket link/unlink now refresh the affected
  physical units.
- `scripts/rebuild-receiving-unit-stage-facts.ts --org <uuid>` is the bounded
  repair command; repeated `--line <id>` arguments narrow it further.

Migration verification on the development database produced 3,366 source
`receiving_line_unit` rows and 3,366 projection rows. The QC query uses
`idx_receiving_unit_stage_facts_qc`; an immediate full-tenant rebuild changed
zero rows, an independent source-vs-projection comparison found zero state
mismatches, and the table has forced RLS. The indexed pending-QC read returned
50 rows in 0.066 ms with five shared-buffer hits. Phase 4 should read this projection rather than rejoining
`testing_results`, `label_print_jobs`, or `ticket_links` per card.

## Phase 4 — Receiving display and triage controls

Extend the existing modern card adapter, not the retired table:

- `src/components/receiving/incoming/cards/receipt-card-model.ts`
- `src/components/receiving/incoming/cards/IncomingDeliveryCard.tsx`
- `src/components/receiving/incoming/IncomingDeliveriesLedger.tsx`
- `src/components/receiving/incoming/IncomingDeliveryEvidence.tsx`

Card face:

- purchase/local-pickup identity and seller/vendor;
- item count and per-line expansion;
- compact aggregate: `3 units · 2 passed · 1 pending`;
- strongest actionable state wins: Failed → Pending → Retest → Passed;
- label warning when any unit lacks a printed QC label;
- ticket chip when any unit/line/carton has a linked ticket;
- next action: Triage, Print labels, Test, Retest, Resolve failure, or Put away.

Expanded item row:

- one row per physical unit when quantity > 1;
- unit UID/serial, condition, label state, QC state, tester/time;
- direct Open ticket when linked;
- Print/Reprint and Open unit actions.

Filters/sorts belong in the declared contextual-navigation controls and URL:
QC status, triage status, label state, ticket presence, vendor/source, pickup
date, and last activity. Default sort is actionable state then oldest pending.
The list, chips, counts, and sidebar facets must use the same server predicate.

Do not hardcode sample orders, vendors, amounts, recents, or status counts in
the contextual sidebar. Do not call this a DataTable in code unless it actually
mounts the repository's one `DataTable`; the intended primary face here is the
modern `TriageCardList` family already used by Incoming and Pickup.

### Phase 4 implementation checkpoint — 2026-09-29

The local-pickup Receiving history now reads the unit-stage projection in one
batched query and renders through `TriageCardList`; it does not use a data table
and does not issue a per-card event query. Each expanded product is
split into its expected physical units and shows UID/serial, condition, QC,
label, tester, price, and ticket context. Expected quantity without a durable
unit is intentionally visible as pending work rather than disappearing.

`local_pickup_order_items.receiving_line_id` is now the direct, tenant-indexed
bridge to the canonical inbound line. `ingestInboundOrder` writes that bridge
atomically for new imports. The migration only backfills legacy rows when the
carton/SKU match has exactly one truthful candidate; ambiguous historical rows
remain unlinked and visible as virtual pending units.

The contextual controls are declared URL state for order status, strongest QC,
triage, label, linked-ticket presence, seller/vendor, and pickup date. Facets
and cards share one order-level predicate; the default sort is actionable state
then oldest pickup. Live parity at `:3050` showed matching card/facet counts for
all, pending QC, missing labels, and a bounded pickup-date window.

Measured database cost does not justify another index: the 252-row pickup feed
executed in 1.112 ms with 137 shared-buffer hits and no reads, while the indexed
unit-stage pending-QC query returned 50 rows in 0.066 ms. Remaining warm request
time is outside the data-table query (framework/auth/network), so additional
table indexes would add write cost without addressing the observed latency.

## Phase 5 — first-class ticket integration

1. Link a failure ticket at the narrowest truthful entity:
   `SERIAL_UNIT` for one failed product, `RECEIVING_LINE` for a line-wide issue,
   `RECEIVING` for carton-wide damage. Do not fan a unit failure onto siblings.
2. Reuse `getPrimarySupportTicketForReceiving` and the universal
   `/api/support/tickets/link` waist. Extend anchor input to `serialUnitId` only
   if the existing lower-level `ticket_links` path cannot express it directly.
3. The Receiving card/record Open ticket action mounts
   `TicketDisplayHost → SupportTicketDetail`. Replies use `TicketComposer`.
4. On phone, a ticket is a full `DetailHubScreen` route, not the primary record
   inside a bottom sheet. A quick look at a linked ticket may use a sheet.
5. Preserve the provider boundary: internal IDs, entity linkage, assignment,
   and cached search/status live in CycleForge; provider messages are fetched
   through the helpdesk adapter until the provider-migration phase explicitly
   changes that contract.

Acceptance:

- a failed unit can create/link/open one ticket from Receiving;
- a linked ticket appears on that unit, its containing line/card aggregate,
  the support workspace, and Chat from one `ticket_links` relation;
- unlink removes the relationship everywhere without deleting the ticket;
- posting a reply from Receiving and Support uses the same composer/payload.

### Phase 5 implementation checkpoint — 2026-09-29

`SERIAL_UNIT` is now a first-class anchor in the universal ticket link and
create contracts. Both routes tenant-validate the physical unit before linking,
and the canonical `linkSupportTicketEntity`/`unlinkTicket` writers continue to
refresh `receiving_unit_stage_facts`, so pickup cards and facets see the change
without an event-table join.

A failed materialized unit in the local-pickup record exposes both **New ticket**
and **Link ticket**. Creation uses the shared idempotent Support create flow;
linking uses the shared candidate picker and `/api/support/tickets/link`. The
unit, not its siblings, is the anchor. The exact-unit reader now checks that
unit first, then its line/carton fallback, and deliberately excludes sibling
unit tickets.

Opening a linked ticket no longer sends the operator away from Receiving. The
pickup record resolves the provider ticket from the internal projection id and
mounts `TicketDisplayHost → SupportTicketDetail`, which means replies use the
same Ticket composer and payload as Support. Internal-only/unavailable provider
threads fail visibly instead of treating an internal registry id as a Zendesk
id.

## Phase 6 — Chat displays the same truth

Extend the assistant read-tool path; do not paste whole provider tickets into
the chat prompt. Chat should resolve a referenced pickup/receiving line/unit,
call the same ticket and QC read services, and render a compact record artifact
with:

- pickup/order identity;
- unit UID/serial;
- triage, label, and QC status;
- linked ticket label/status;
- an Open record/Open ticket action.

Any write—print, record verdict, create/link ticket—must use the existing tool
permission and confirmation chokepoint. An attached document may populate OCR
context, but cannot automatically file a ticket or overwrite QC state.

### Phase 6 implementation checkpoint — 2026-09-29

`get_unit_journey` now joins the same `receiving_unit_stage_facts` row used by
Receiving with the direct local-pickup line bridge and support-ticket registry.
For a found unit it carries a validated record artifact into Chat containing
pickup identity, unit UID/serial, triage, label, QC, tested time, inventory and
workflow status, recent events/reasons, and linked-ticket status. The artifact
deep-links to the local-pickup record and to the provider ticket when available.

The model receives only a compact factual summary while the exact database
values render in the artifact, so it cannot retype or mutate operational truth.
Chat remains a reader: OCR intake, ticket writes, QC verdicts, and labels stay
behind their canonical domain writers.

## Phase 7 — mobile and kiosk completion

- Keep `/m/receiving/pickup/new` as the camera-first capture/review door.
- After landing, show the pickup and its unit-label work queue.
- Provide a batch “Print N unit labels” action that dispatches to the selected
  print station; show per-unit completion/failure, not one optimistic success.
- Scanning a printed unit label opens the existing mobile unit/QC hub.
- QC verdict and ticket open/link must be completable without a desktop import.
- Kiosk capture may create a review draft, but staff authentication/permission
  owns the final receiving and ticket writes.

### Phase 7 mobile checkpoint — 2026-09-29

The existing camera-first route now keeps the canonical line IDs returned by
`ingestInboundOrder`. After a successful landing it offers one batch **Print N
product labels** action through the same unit-identity/2×1 product-label writer
used by desktop Receiving. The result reports the exact number of dispatched
unit labels and the expected unit count on any failed lines, instead of showing
one optimistic batch success. Reprints preserve unit UIDs and remain idempotent
in the print ledger.

The capture door was rechecked at 390×844 on `:3050`. Mobile QC scan routing
and a dedicated phone ticket detail/link face remain the unfinished portions
of this phase; desktop Receiving already has the full ticket round trip.

## Phase 8 — migration away from Google Sheets

Do not switch staff off Sheets until the import and reconciliation report prove
parity. Build an idempotent importer that maps each historical row to the same
pickup writer contract, preserving source row identity in import metadata.
Reconcile counts and money totals by pickup date/vendor/payment method, then
make Sheets read-only, then remove staff access. Never maintain dual writers.

Required reconciliation outputs:

- imported / skipped / needs-review row counts;
- duplicate keys and conflicting amounts;
- pickup totals and paid/payable totals by date/vendor;
- rows missing item detail (must remain reviewable, never synthesized);
- a link from every imported source row to its CycleForge pickup record.

### Kiosk intake implementation checkpoint — 2026-09-29

The kiosk-side round trip now has a first-class review path:

- `Local pickup intake` is a data-driven entry in the kiosk command menu. It is
  a staff tool over the current sale/repair cart, so opening it never mutates or
  clears that cart.
- The catalog browse surface exposes `Can't find it? Add manually` in the top
  action row. Manual products are visible and removable before review; catalog
  and manual picks become independent inbound lines.
- `Read paperwork` accepts up to six camera/gallery images and calls
  `POST /api/kiosk/local-pickup/extract`. That device-authenticated adapter uses
  the same local-only `extractPoIntake(..., type: 'PICKUP')` path as Receiving
  and returns a draft only; it never writes an operational record.
- The three-step kiosk form requires an existing org vendor, pickup identity
  and date, then quantity, condition, parts status, and price per product. The
  review step posts to `POST /api/kiosk/local-pickup`, which calls
  `ingestInboundOrder`; it does not write `local_pickup_orders` directly. The
  final import requires a named staff PIN with `receiving.scan_po`; the paired
  device alone can only build and review the draft.
- Vendor names load once through a narrow `id, name` query and filter on the
  tablet. `EXPLAIN (ANALYZE, BUFFERS)` measured the source query at 0.061 ms
  with one shared-buffer hit on the current dataset, so no speculative index
  was added.

Browser proof at `:3050` covered 1366×900 and 1024×768: manual entry, vendor
selection, per-item triage, review totals, and the enabled final import action,
with no browser console errors. A real OCR image and final write remain the
production integration check because both invoke external/local infrastructure
and create durable business records.

### Kiosk landing and label checkpoint — 2026-09-29

The kiosk now keeps the result of the canonical inbound landing rather than
discarding it. The result carries the local-pickup projection id created in the
same transaction plus every receiving-line id. The done face therefore shows
the exact line/unit counts, opens the resulting Receiving pickup record, and
states the next operator action instead of ending at a generic success message.

**Print N product labels** is now available directly on that face. It uses a
device-authenticated route with a second named-staff PIN check for
`print.label`, verifies that every requested line belongs to the landed pickup,
then calls the existing durable receiving-unit/2×1-label writer. Successful
lines dispatch one label per physical unit and write the same idempotent print
ledger as Receiving; lines that still need catalog SKU pairing are reported as
partial failures without hiding labels that were ready.

Browser proof at `:3050` exercised the complete mocked operator round trip:
command selection, top-row manual product entry, existing-vendor selection,
per-item price and condition, review, staff-authorized import, the new done
face, print authorization, and exact `1 label dispatched` feedback. The mocked
landing asserted that label dispatch used the returned pickup id and receiving
line id, not a second lookup or a parallel write model.

## Verification gate for every phase

- Focused unit/integration tests for the writer and pure adapters.
- Tenant-isolation/IDOR test for every new by-id route.
- Idempotency and retry tests for OCR, unit issuance, print logs, verdicts, and
  ticket links.
- Mobile boundary checks: mobile components cannot import desktop workbenches.
- Visual proof on `http://localhost:3050` only, desktop and phone widths.
- `pnpm verify:fast`; use `pnpm verify` for the projection/schema/refactor phase.
- Report unrelated pre-existing failures separately; do not hide or allowlist a
  new violation.

## Definition of done

From a phone, an authorized staff member photographs local-pickup paperwork,
reviews the locally OCR'd facts, and lands one pickup. That pickup appears in
Receiving and Sales from the same write. Receiving shows every physical item,
its unique 2×1 QC label, triage state, latest testing verdict, and linked ticket
at a glance. A label scan opens the exact unit; a failure opens the exact ticket.
Chat can show the same pickup/QC/ticket record and deep-link to it, but owns none
of those facts. Google Sheets is no longer a writer or daily staff surface.
