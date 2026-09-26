# FBA event-driven lifecycle — plan of record

**Status:** Active plan of record; specification only, not yet implemented

## Outcome

Build the full Fulfillment by Amazon operating pipeline on a database-enforced,
append-only lifecycle. Every physical unit must move through the same mandatory
gates:

`INBOUND -> TRIAGE -> PREP_REQUIRED -> STAGED_FOR_PLAN -> PACKED_IN_BOX -> SHIPPED`

The UI is a projection of those states. It never invents a second workflow and
never becomes an alternate state writer.

`PREP_REQUIRED` is the verification gate for every unit, including inventory
whose resolved prep instruction is `NONE`. A unit cannot reach
`STAGED_FOR_PLAN` until its prep instruction, evidence, and verification receipt
are complete.

## Existing CycleForge foundations to reuse

- `/shipping/fba` is the canonical FBA workbench and already separates ready,
  plan, combine, shipped, and catalog modes.
- `fba_shipments`, `fba_shipment_items`, `fba_fnsku_logs`, and the FBA scan and
  label endpoints already provide shipment, item, staff-attribution, and event
  seams. They are migration inputs, not permission to preserve bypasses.
- `src/lib/fba/status.ts` currently defines
  `PLANNED -> TESTED -> PACKED -> LABEL_ASSIGNED -> SHIPPED`, while older FBA
  diagrams still name `READY_TO_GO`. The migration must remove this vocabulary
  drift and publish one lifecycle.
- `routeScan()` and the Universal Scan Router are the one decoder and routing
  waist. The root scanner intercept must call them rather than create another
  barcode classifier.
- The mobile scan kernel owns camera/HID capture behavior; the staff print
  bridge, print station, FNSKU label renderer, and label-print ledger own output.
- Existing `close`, `mark-shipped`, and scan routes currently allow force-close,
  `PACKED -> SHIPPED`, or direct creation in `PACKED`. Those paths must be
  migrated behind the transition engine and then removed.
- Existing documentation permits deleting a completed shipment after its items
  ship. This plan replaces deletion with a retained immutable shipment snapshot
  and accounting ledger.

## Authority and invariants

1. Unit lifecycle and shipment lifecycle are separate types. A shipment is an
   aggregate and cannot advance beyond its least-complete required unit or box.
2. All lifecycle writes pass through one database transition function. API
   routes, AI tools, bulk imports, administrative tools, and workers may request
   a transition but cannot update the current state directly.
3. The transition event is append-only. Corrections are compensating events
   with a reason and actor, never updates or deletes.
4. The current-state row is a transactional projection of the event stream and
   is guarded by the expected prior state and version.
5. A unit may advance only one mandatory gate at a time. Holds, exceptions,
   cancellations, and reconciliation are orthogonal dispositions and cannot be
   used to jump forward.
6. Shipping is impossible until every included box is sealed and every included
   unit has a valid `PACKED_IN_BOX` assignment, required labels, evidence, and
   tracking context.

## Canonical payloads

### Lifecycle transition request

```ts
type FbaTransitionCommand = {
  unitId: string
  expectedFrom: 'INBOUND' | 'TRIAGE' | 'PREP_REQUIRED' | 'STAGED_FOR_PLAN' | 'PACKED_IN_BOX'
  to: 'TRIAGE' | 'PREP_REQUIRED' | 'STAGED_FOR_PLAN' | 'PACKED_IN_BOX' | 'SHIPPED'
  eventType: string
  actorId: string
  stationId: string | null
  clientEventId: string
  idempotencyKey: string
  occurredAt: string
  reasonCode: string | null
  evidenceIds: string[]
  metadata: Record<string, unknown>
}
```

### Global scan command

```ts
type FbaScanCommand = {
  rawCode: string
  currentSurface: string
  stationId: string
  activeBoxId: string | null
  clientEventId: string
  capturedAt: string
}
```

The resolver returns the classified identifier, matched unit/SKU, authoritative
state, allowed next actions, destination surface, and an idempotent receipt.

### Print job

```ts
type FbaPrintJob = {
  id: string
  sourceEventId: string
  artifactType: 'FNSKU_2X1' | 'BOX_LABEL' | 'PALLET_LABEL' | 'SHIPMENT_LABEL' | 'POSTER_13X19'
  mediaProfile: string
  printerProfile: string
  copies: number
  payloadRef: string
  idempotencyKey: string
}
```

### Box scan

```ts
type FbaBoxScanCommand = {
  boxId: string
  fnsku: string
  quantity: number
  expectedBoxVersion: number
  clientEventId: string
  stationId: string
  actorId: string
}
```

### Export and accounting dispatch

```ts
type FbaExportCommand = {
  shipmentId: string
  format: 'SELLER_CENTRAL_TSV' | 'CSV' | 'COGS_WEBHOOK'
  filterSnapshot: Record<string, unknown>
  requestedBy: string
  idempotencyKey: string
}
```

## Spatial dependency matrix and contextual filtering rail

Desktop FBA triage follows one stable three-zone contract. The zones describe
meaning, not a particular component tree:

| Zone | Fixed meaning | FBA composition |
|---|---|---|
| Left / intercept | Urgency, filters, saved views, search, scanner status | Existing `ContextPanelLayout`; contextual facets for the active FBA mode; solid amber `EXCEPTIONS` and red `OOS` are reserved here |
| Center / triage | The record set and the variables used to decide | Shared LedgerGrid/DataTable binding with rigid 1px rules, stable identity tracks, SKU/FNSKU/ASIN, location, condition, prep, quantity, box, and buyer or operator notes |
| Right / secondary | Detail, history, evidence, and low-frequency controls | Existing right-inspector/detail stack; visually subordinate until a row is selected |
| Bottom-right / execution | The one primary progression action | Existing governed action dock, occupying the same coordinate and hardware meaning in every FBA execution mode |

The first squint must expose no more than four to seven decision chunks:

1. status and urgency in the left rail;
2. identity and operating parameters in the center matrix;
3. the selected record's evidence and history at the right;
4. the primary next action at the bottom-right.

The FBA rail is already mounted through `ContextPanelLayout`, but today it is a
scan/plan/combine feed rather than a complete filtering system. Build the new
rail by composing the existing shell, `useSavedViews`, URL parameters, table
bindings, and the existing collapse preference. FBA needs a registered generic
saved-view surface and database CHECK migration; it must not create a second
saved-view store, filter state store, table engine, or collapse mechanism.

The rail changes vocabulary from one declarative context registry, keyed by the
active FBA lifecycle surface or mode:

| Context | Facets and exact information |
|---|---|
| Inbound / Triage | Exception, OOS, unknown identifier, condition, age, source, owner, station, location, buyer note, evidence missing |
| Prep | Prep procedure, prep state, label state, dangerous goods, expiration/lot/serial, evidence missing, printer/job state, owner |
| Plan / Staging | Plan, fulfillment center, destination, SKU/FNSKU/ASIN, staged state, quantity variance, due date, owner, exception |
| Packing | Active box, box state, weight band, missing unit weight, unpacked/staged, rejected scan, packer, station, label state |
| Shipped / Reconciliation | Carrier, tracking, Amazon received state, discrepancy, fee, COGS dispatch, reimbursement/case, ship date, owner |
| Catalog | Identifier coverage, missing FNSKU, prep defaults, dimensions/weight completeness, status, import error |

Lifecycle modes remain system navigation. Saved views are named combinations of
facets within a mode and write the same URL vocabulary consumed by the center
query. Applying a view must never mutate `tableId`, replace the table engine, or
fork the record source.

Spatial stability is a behavior contract. A control does not move merely
because it becomes temporarily unavailable: its governed slot remains disabled
or intentionally empty. Dense active space uses the existing 4px/8px spacing
rhythm, rigid row geometry, and typography roles rather than arbitrary small
text or padding removal.

## Command and focus architecture

The outer left context rail remains the filter/search/saved-view surface. Inside
the resulting work area, FBA triage uses the existing split-record composition:
the filtered queue occupies the list side of `DeskRecordPlane` and the selected
unit, shipment, receipt, OCR result, SKU matrix, evidence, and commands occupy
its detail stage. This satisfies both spatial contracts without creating two
competing sidebars:

`[context filters] [focused queue] [selected record stage]`

The codebase already contains most of the interaction kernel:

- `useRecordCursorKeyboard` owns `J`/`K`, arrow stepping, Enter-first-open, and
  editor/overlay/list-key exclusions.
- `RecordLedger` virtualizes the queue and follows the open record; `DeskRecordPlane`
  owns the split stage, Escape behavior, and focus return to the record row.
- `useOptimisticMutation` owns paint-first cache patches, failure rollback,
  error feedback, and settle-time reconciliation.
- `CommandBar` is the sole `Cmd/Ctrl+K` owner and already resolves records,
  printed handles, recents, and search facets through the shared search stack.
- Shared dialog and focus-trap primitives already keep modal focus contained.

The FBA workspace does not currently compose the record cursor, record ledger,
split stage, or optimistic mutation primitive. Its Plan, Combine, and Shipped
main panes reuse sidebar rail bodies after the unsafe board table was removed.
That is the integration gap.

The global palette also has a concrete gap: the current `CommandBar` declares
itself as records-only and does not mount contextual warehouse actions. Older
work logs describing navigation/mode groups are not the live implementation.
Extend this one palette with a permission- and state-aware command registry;
do not create a second launcher. Its groups are Destinations, Contextual
Actions, Records, and Recent. Pasted ASIN, FNSKU, UPC, ECWID order, tracking,
unit, carton, and location identifiers route through the existing decoder and
search resolvers.

Number keys are context-scoped, never globally ambiguous. Condition grading
keeps `1 = New`, `2 = Very Good`, `3 = Good`. Intake disposition may use
`1 = Accept`, `2 = Damaged`, `3 = Manual Review` only while that exact mode is
active and the visible key legend says so. Scanner capture, modal focus, text
editing, and focused list controls outrank single-key actions.

The only explicit concurrent-operator capacity assumption currently stated in
the codebase is 100 operators (`useIncomingSummary`). Until measured production
staffing replaces it, 100 concurrent authenticated operators is this plan's
peak validation target.

## Execution waves

### Wave 0 — inventory and freeze

Record every existing state writer, force flag, scanner entry point, print path,
shipment deletion path, and downstream report. Freeze new direct writers while
the migration is built.

### Wave 1 — event ledger and transition engine

Add the canonical state types, append-only transition ledger, current-state
projection, transition matrix, database enforcement, idempotency, optimistic
concurrency, shipment aggregation, and migration/backfill verification.

### Wave 2 — triage and prep execution

Connect the root scanner intercept and condition macro keys to the transition
engine. Capture prep instructions, evidence, verification, and silent label
print jobs through the existing router and print bridge.

### Wave 3 — carton matrix

Add active cartons, blind scan-to-pack, unit-to-box assignments, running weight,
hard limit rejection, sealing, concurrency protection, and box-level audit
receipts.

### Wave 4 — shipping ledger and exports

Replace force-close with guarded sealing and shipping, retain immutable shipment
snapshots, expose Seller Central TSV copy, stream filtered CSV exports, and
dispatch COGS through an idempotent accounting outbox.

### Wave 5 — rollout and proof

Shadow-validate old and new projections, reconcile discrepancies, cut reads and
writes to the new engine, remove bypasses, publish analytics, and run end-to-end
warehouse scenarios before enabling the pipeline by default.

## Definition of Done

- [ ] Separate unit lifecycle, shipment lifecycle, carton lifecycle, and exception disposition into explicit Drizzle/PostgreSQL types so one enum cannot let an aggregate outrun its units.
- [ ] Make `INBOUND -> TRIAGE -> PREP_REQUIRED -> STAGED_FOR_PLAN -> PACKED_IN_BOX -> SHIPPED` the only forward unit path, with adjacent transitions required and no skipped gate.
- [ ] Define `PREP_REQUIRED` as a mandatory verification gate for every unit, including a verified `NONE` prep instruction, and block staging until required prep, labels, and evidence are complete.
- [ ] Add an append-only lifecycle event ledger containing unit, shipment, box, from/to state, event type, actor, station, source, reason, evidence, metadata, client event, idempotency key, version, and event time.
- [ ] Enforce legal transitions in PostgreSQL through one transition function/trigger and database privileges so application code, imports, AI tools, and administrators cannot directly update lifecycle state.
- [ ] Update the current-state projection and append the transition event in one transaction, guarded by expected prior state and optimistic version.
- [ ] Implement the canonical `FbaTransitionCommand` payload with `unitId`, `expectedFrom`, `to`, `eventType`, `actorId`, `stationId`, `clientEventId`, `idempotencyKey`, `occurredAt`, `reasonCode`, `evidenceIds`, and `metadata`.
- [ ] Make every transition idempotent and concurrency-safe so retries return the original receipt and competing stale writes fail without partial mutation.
- [ ] Remove force-close, direct-to-`PACKED`, `PACKED -> SHIPPED`, and every other lifecycle bypass after migration; administrative corrections must be permissioned compensating events with reasons and cannot fabricate completion.
- [ ] Backfill existing `PLANNED`, `TESTED`, `PACKED`, `LABEL_ASSIGNED`, `SHIPPED`, and documented `READY_TO_GO` records into the new lifecycle with preserved timestamps, actors, source identifiers, and reconciliation reports.
- [ ] Reconcile code, diagrams, API contracts, reports, and tests to one canonical vocabulary so `READY_TO_GO` and the older status chain cannot continue as shadow state machines.
- [ ] Derive shipment status from required unit and carton gates, and prevent shipment-level transitions from advancing beyond incomplete children.
- [ ] Create first-class carton records with shipment, dimensions, tare, measured weight, calculated weight, size class, status, seal receipt, label, tracking context, and immutable unit assignments.
- [ ] Preserve and link existing FBA scan events, FNSKU logs, label batches, print receipts, station activity, and staff attribution instead of deleting or duplicating their history.
- [ ] Add a persistent root-level HID scanner intercept that buffers zero-focus scans from any non-kiosk surface without requiring a search field click.
- [ ] Reuse `routeScan()` and the Universal Scan Router to classify UPC, ASIN, FNSKU, unit, carton, command, and legacy printed payloads; do not add a second decoder.
- [ ] Distinguish scanner bursts from normal typing, never steal keystrokes from editable controls, preserve accessibility shortcuts, exclude kiosk/payment capture, and keep the listener mounted across navigation.
- [ ] Resolve a recognized UPC/ASIN/FNSKU to the authoritative record and state, then route directly to the item triage profile with return context and an exact next action.
- [ ] Scope triage condition macro keys to the active triage surface: `1 = New`, `2 = Very Good`, and `3 = Good`, with visible labels and no effect while an editable control is focused.
- [ ] Auto-save a condition through the transition engine, show an immutable success or failure receipt, and clear/re-arm the triage surface for the next scan without a mouse action.
- [ ] Implement the canonical `FbaScanCommand` payload with `rawCode`, `currentSurface`, `stationId`, `activeBoxId`, `clientEventId`, and `capturedAt`, returning classification, match, state, allowed actions, destination, and receipt.
- [ ] Store prep instructions, required procedure, supplies, label ownership, dangerous-goods result, expiration/lot/serial rules, operator verification, photos/videos, and exception evidence against the unit and lifecycle event.
- [ ] Publish print jobs through a transactional outbox tied to the successful prep event so `PREP COMPLETE` cannot commit without a durable label job and never opens a browser print dialog.
- [ ] Implement the canonical `FbaPrintJob` payload with source event, artifact type, media profile, printer profile, copies, payload reference, and idempotency key.
- [ ] Route 2x1 FNSKU and standard thermal labels to approved thermal profiles and 13x19 or specialized large-format artifacts to an explicit wide-format profile such as the PIXMA PRO-200.
- [ ] Require printer capability, media compatibility, staff permission, station authorization, and Auto Full Access for unattended output; otherwise queue visibly for authorized confirmation.
- [ ] Track queued, claimed, printing, printed, failed, retried, and cancelled print states with deduplication, bounded retries, operator-readable errors, and immutable printer receipts.
- [ ] Render a locked active-box anchor on the packing surface with box number, dimensions, running units, running weight, limit, and status before accepting scans.
- [ ] Make blind scan-to-pack transactionally assign only a `STAGED_FOR_PLAN` unit to the active box and advance it to `PACKED_IN_BOX`; never rely on drag-and-drop.
- [ ] Implement the canonical `FbaBoxScanCommand` payload with `boxId`, `fnsku`, `quantity`, `expectedBoxVersion`, `clientEventId`, `stationId`, and `actorId`.
- [ ] Calculate projected carton weight from SKU master weights plus tare, record measured scale weight when available, expose missing-weight exceptions, and enforce Amazon's configured limit with a default 50 lb policy.
- [ ] Reject a scan before mutation when it would exceed the active box limit, leave counts unchanged, emit harsh audible/haptic feedback, and turn the active-box header solid red with the exact excess.
- [ ] Lock box/version updates so two scanners cannot double-pack a unit or oversubscribe carton weight, and make repeated scans return the original assignment receipt.
- [ ] Allow sealing and shipping only when carton contents reconcile, every unit is `PACKED_IN_BOX`, required labels and evidence exist, weights are valid, boxes are sealed, and tracking/carrier requirements pass.
- [ ] Retain sealed boxes, shipped units, shipment snapshots, manifests, transition events, costs, and reconciliation outcomes permanently; replace completed-shipment deletion with archival visibility controls.
- [ ] Generate an exact Seller Central box-content TSV snapshot containing ASIN, FNSKU, quantities, and box assignments and provide one-click `COPY FBA PAYLOAD` with a validated checksum and copied receipt.
- [ ] Stream permission-scoped CSV exports from the authoritative ledger without temporary generation, preserving filters, selected columns, plan/shipment version, timezone, and source provenance.
- [ ] Implement the canonical `FbaExportCommand` payload for `SELLER_CENTRAL_TSV`, `CSV`, and `COGS_WEBHOOK` with shipment, filter snapshot, requester, and idempotency key.
- [ ] Dispatch COGS and shipment-close data through an idempotent accounting outbox/webhook with delivery status, retries, signature, external receipt, replay controls, and no duplicate ledger entry.
- [ ] Provide analytics and reports for planned, staged, packed, shipped, received, and reconciled units; carton throughput and weight; cycle time; prep/label completion; exceptions; fees; cost; discrepancies; and operator/station performance.
- [ ] Keep the industrial triage table, native CSV/XLSX/PDF/photo/video uploads, versioned shared plans, approvals, assignments, procedures, exceptions, and linked evidence connected to the same authoritative FBA records.
- [ ] Apply role-scoped access to transition, condition grading, prep verification, silent printing, box sealing, shipping, export, reconciliation, compensation, and AI mutation, with the universal task system able to assign accountable follow-up.
- [ ] Provide exact loading, empty, validation, conflict, stale-version, overweight, printer-offline, partial-import, offline, retry, permission-denied, and Amazon-unavailable states without optimistic false success.
- [ ] Roll out through inventory, backfill, shadow comparison, discrepancy repair, writer cutover, reader cutover, bypass removal, and rollback checkpoints with no interval where two state machines are authoritative.
- [ ] Add observability for rejected transitions, duplicate commands, stale versions, stuck print jobs, overweight attempts, unmatched scans, export failures, webhook retries, and ledger/projection drift, with operator-owned alerts and safe kill switches.
- [ ] Cover the transition matrix, database immutability, idempotency, concurrency, scanner classification, macro-key scoping, print routing, box weight rejection, sealing gates, TSV format, CSV streaming, and COGS delivery with automated tests.
- [ ] Run an end-to-end browser and warehouse-device scenario from inbound scan through triage, prep verification, silent FNSKU print, active-box packing, overweight rejection, seal, ship, TSV copy, CSV export, COGS receipt, and immutable audit replay.
- [ ] Define one declarative FBA spatial-context registry that maps each lifecycle surface or mode to its left-rail facets, default saved view, urgency blocks, center columns, primary action, secondary actions, keyboard bindings, and scanner behavior instead of scattering mode switches across components.
- [ ] Reuse the existing `ContextPanelLayout`, context-panel width and collapse preference, resize handle, parked strip, and center-floor budget for the FBA contextual rail; do not create a second sidebar shell, overlay drawer, or collapse state.
- [ ] Register FBA in the polymorphic saved-views source of truth and its PostgreSQL CHECK migration so personal and authorized shared FBA views persist through `useSavedViews` rather than a new local or route-specific store.
- [ ] Make every FBA facet, search term, sort, lifecycle mode, and selected record use a declared URL vocabulary so filters are deep-linkable, browser back/forward-safe, restorable, and consumed by the same center-table query.
- [ ] Change the left rail context from the active FBA route/mode through the shared registry: inbound/triage, prep, plan/staging, packing, shipped/reconciliation, and catalog each expose only their relevant filters and counts.
- [ ] Provide the specified contextual facets for identifiers, status, exception, OOS, condition, location, buyer note, evidence, prep, dangerous goods, labels, plan, destination, quantities, boxes, weights, operators, stations, carrier, reconciliation, fees, COGS, and import quality without turning facets into new lifecycle states.
- [ ] Compute rail facet counts and center rows from the same authoritative query/filter projection so a count, saved view, export, and visible table can never describe different record sets.
- [ ] Reserve solid amber `EXCEPTIONS` and solid red `OOS` for stable urgency blocks on the left rail, with text/icon redundancy and fixed positions; normal filters and navigation remain visually quieter.
- [ ] Pass the four-to-seven-chunk squint test in every FBA context: status/urgency reads first at left, identity and parameters second in the center, evidence/history third at right, and one primary next action remains obvious at bottom-right.
- [ ] Rebuild the FBA center collection on the shared LedgerGrid/DataTable binding with stable identity tracks and rigid 1px rules, grouping SKU/FNSKU/ASIN, bin/location, condition, prep, quantity, box, and buyer/operator notes without column jumping.
- [ ] Keep history, audit, evidence, and low-frequency controls in the existing right inspector/detail stack or trailing secondary region, visually muted until selection and never competing with the primary execution control.
- [ ] Anchor the primary progression action to the same bottom-right execution slot across triage, prep, staging, packing, and shipping; changing state may change its label and permission, not its physical meaning or coordinate.
- [ ] Map triage grading to the physical number pad and keyboard through the shared binding registry, with immediate pressed/saved/error feedback and no mouse focus requirement, while editable controls and accessibility shortcuts remain protected.
- [ ] Keep the global scanner intercept permanently mounted and independent of left-rail search focus, saved-view changes, selection, right-inspector state, and route transitions so a Tera Pro scan always reaches the shared decoder first.
- [ ] Define a deliberate-friction policy: ordinary reversible or idempotent execution actions commit immediately with receipts, while destructive, compensating, shipment-closing, OOS-disposition, and other high-risk exceptions require role checks plus typed confirmation or equivalent non-muscle-memory proof.
- [ ] Preserve spatial slots when actions are unavailable by rendering governed disabled or empty states instead of shifting neighboring controls, and prevent loading, error, permission, and zero-result states from moving the execution target.
- [ ] Enforce active-space density through the existing 4px/8px spacing rhythm, fixed row heights, rigid typography roles, 1px separators, and shared tokens; do not use arbitrary tiny type, ad hoc padding, or nested cards to manufacture density.
- [ ] Keep filters and saved views in the workbench rail but keep scan-station MRU/error periphery ephemeral, preserving the existing regional rule that station history is not a durable saved-view filter system.
- [ ] Add automated contracts for the FBA context registry, URL round trips, saved-view surface/CHECK parity, facet-count/table parity, fixed urgency placement, keyboard focus exclusions, stable execution-slot geometry, and absence of duplicate sidebar/table/filter engines.
- [ ] Browser-test all FBA contexts at supported desktop widths and hardware-test HID scanner plus number pad: the rail changes correctly, active filters survive navigation, the center retains usable width or horizontal scrolling, the scanner never loses interception, and high-risk exceptions break the normal motor pattern.
- [ ] Compose the FBA triage work area from the existing `RecordLedger` and `DeskRecordPlane` so the filtered queue and selected record details remain in one split surface with no list-to-detail page navigation.
- [ ] Feed the split queue from the same ordered, filtered, permission-scoped projection used by the contextual rail counts and exports, preserving stable record IDs while filters, realtime events, and optimistic mutations change the visible set.
- [ ] Mount the shared `useRecordCursorKeyboard` for FBA so `J`/`ArrowDown` and `K`/`ArrowUp` move exactly one visible record, reveal it, scroll it into view, and stand down for editors, overlays, scanner capture, and nested list-key owners.
- [ ] Render the focused record's OCR output, receipt image, SKU matrix, lifecycle state, evidence, and allowed commands in the right stage immediately when the queue cursor changes, without Enter, route navigation, or a second fetch when data is already cached.
- [ ] Preserve exact keyboard focus through selection changes, record closure, filter changes, optimistic removal, and palette open/close, returning to the surviving active queue row or its deterministic next neighbor rather than the document body.
- [ ] Define one permissioned, mode-scoped single-key action registry whose visible legend and handler come from the same data, and reject collisions with global chords, scanner buffers, editable controls, overlays, and accessibility shortcuts.
- [ ] Keep condition grading as `1 = New`, `2 = Very Good`, `3 = Good`; allow `1 = Accept`, `2 = Damaged`, `3 = Manual Review` only in the explicit intake-disposition context, with the active mapping always visible and impossible to fire from another mode.
- [ ] On a valid single-key action, optimistically remove or update the focused item, close its stale detail, select the deterministic next item, and paint the next stage within 100 ms without waiting for the database response.
- [ ] Reconcile optimistic triage through the lifecycle event ID, expected version, and idempotency receipt; on rejection or network failure restore the item in stable order, restore focus, explain the conflict non-modally, and never display an uncommitted state as durable success.
- [ ] Extend the existing global `CommandBar` as the sole `Cmd/Ctrl+K` owner with permission- and state-aware Destinations, Contextual Actions, Records, and Recent groups; do not add another command menu or keyboard listener that competes for the chord.
- [ ] Make Command Palette actions context-sensitive so queries such as `Move`, `Assign`, `Print`, `Box`, and `Review` surface only legal commands such as Move to Next Box or Assign Bin for the focused FBA record and current lifecycle state.
- [ ] Route pasted ASIN, FNSKU, UPC, ECWID order, tracking, unit, carton, and location identifiers through the shared decoder/search stack and either open the matched FBA record or present an explicit no-match action without navigating through intermediate pages.
- [ ] Trap keyboard focus inside the open Command Palette, make Escape close only the top overlay, and restore focus to the exact focused triage row or stage control on close; remove the current lost-focus behavior caused by suppressing dialog auto-focus restoration without a manual target.
- [ ] Simplify global top-bar navigation to identity, system status, and the Command Palette trigger while retaining page-specific filters in the contextual rail; the palette owns global routing and actions, not the rail's live facet state.
- [ ] Apply a stark unobscured 2px industrial focus outline to every actionable control and focused queue row through the shared focus-ring token, maintaining contrast across status colors and never using a subtle background tint as the only selection signal.
- [ ] Announce OCR, local-model extraction, print, sync, and reconciliation progress through scoped `aria-live="polite"` status regions and immutable receipts without opening a modal, moving focus, or reflowing the execution controls.
- [ ] Establish and test keyboard arbitration priority as modal/focus trap, editable control, scanner burst, nested list owner, global chord, record cursor, then mode-scoped single-key action so one keystroke has exactly one owner.
- [ ] Load-test the FBA read, cursor, transition, optimistic-reconcile, scan, and realtime paths with 100 concurrent authenticated operators, reporting p50/p95 action-to-paint and commit latency, database pool use, conflicts, dropped events, and rollback correctness; keep valid local paint under 100 ms.
- [ ] Add browser tests for J/K stepping, auto-rendered details, context-scoped 1/2/3 actions, optimistic next-item selection, rollback focus restoration, Command Palette action filtering, focus trap/return, high-contrast focus rings, and polite non-blocking status announcements.

## Verification scenarios

1. Attempt every legal adjacent transition and every illegal skip directly
   through the API and database; only adjacent transitions produce events.
2. Scan a known UPC from an unrelated screen, grade it with `2`, and confirm the
   triage record saves as Very Good and re-arms without focus or mouse input.
3. Complete prep twice with the same idempotency key; one transition, one label
   job, and one immutable receipt exist.
4. Pack the same FNSKU simultaneously from two stations; exactly one box
   assignment wins and the stale station receives a conflict receipt.
5. Push a 49 lb carton over the configured 50 lb limit; the scan is rejected,
   the unit remains staged, box counts do not change, and red/audio/haptic
   feedback identifies the excess.
6. Try to ship with an unsealed box, missing evidence, missing label, or staged
   unit; every attempt fails without a partial shipment mutation.
7. Copy the Seller Central payload and compare its checksum, rows, quantities,
   and box assignments to the immutable shipment snapshot.
8. Retry CSV and COGS dispatch; the CSV streams the same scoped data and the
   accounting ledger records exactly one external transaction.
9. Replay the lifecycle event ledger and reproduce the current state, carton
   contents, shipment totals, costs, and actor/station history exactly.

## Related plans and seams

- `docs/todo/fba-surface-split-plan.md` in the main CycleForge checkout — FBA
  workbench modes and canonical route contract.
- `docs/todo/universal-scan-router-PLAN.md` — one decoder, state-aware routing,
  idempotent station handoff, and the global scan dock.
- `docs/warehouse-os/PLAN-mobile-scan-kernel.md` — one lens, HID/camera capture,
  offline posture, and station-specific truth.
- `docs/todo/printed-code-round-trip-HANDOFF.md` — every printed payload must
  resolve through the shared decoder.
- `docs/handoff/fnsku-reprint-HANDOFF.md` — FNSKU renderers, print bridge,
  print-station ownership, copy count, and silent kiosk output.
- `docs/todo/shipping-desk-to-ship-prep-shipped-PLAN.md` — Amazon Prep ownership,
  shipped history, URL contracts, and desk boundaries.
- `docs/diagrams/07-fba-shipment-flow.md` and
  `docs/diagrams/14-fba-station-trace.md` — current routes, tables, force-close
  behavior, activity logs, label queues, and migration inventory.
