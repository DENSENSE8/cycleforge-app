# HANDOFF — Repair service record on the two-column record + inline Add (owner 2026-09-30)

Paste this whole file as the prompt. It is self-contained.

## Goal

The Repair service record (the view opened from a repair card, `?openRepair=<id>`)
is rebuilt on the SAME two-column record that Inbound (`InboundRecordView`) and
Outbound (`OrderRecordView`) now use, and every piece of the old repair record is
deleted from the codebase. Owner: "the current more details display is not useful
at all… I do not see any code at all from it."

- **Left two-thirds — the work.** Top-left is the **Fulfillment** band, focused
  on the repair's **status points** (where the device is in the repair), with
  the carrier tracking updates for a shipped-in repair. Below it: the device
  (product row), serial, reported issue, status history, staff notes.
- **Right one-third — more details.** The product shown exactly like the
  inbound/outbound item, then the customer, then the paperwork / ticket facts.
- **Actions at the far right of the record header**, as on inbound/outbound.
  Exact verbs (owner list): **Link ticket · Create ticket · Print paperwork ·
  Print receipt · Print 2×1 label · Mark done · Mark pending**. Plus the ones the
  record already needs: Change status, Start pickup (sign), Square checkout,
  Cancel repair (in the overflow).
- **Inline Add button to the right of "Repair service"** that starts a new
  repair intake in place.

## Working rules

- Shared worktree with other live sessions. Never revert files you did not
  change; re-read right before each edit; never rewrite whole shared files.
  Shared design files currently edited by others: `RecordCard.tsx`,
  `TriageSelectBar.tsx`, `TriageRow.tsx`, `DeskRecordViewSwitch.tsx`,
  `DeskStageOverlay.tsx`, `DeskPageChrome.tsx`, `pinned.json`. Touch them only
  additively and list the lines you changed.
- Dev origin `http://localhost:3050` only (AGENTS.md §1). Never start another
  server. Browser sign-in: `POST /api/auth/staff-picker` then `/api/auth/signin`
  `{ staffId, deviceKind: 'personal' }`, header `x-tenant-slug: usav`
  (pattern: `tests/shot.mjs`, base URL `:3050`).
- The DB is real dogfood data (org `00000000-0000-0000-0000-000000000001`).
  Prove every write on ONE ticket and put it back (status, notes). Do not
  create real Zendesk tickets or real Square links during verification — use
  the dry path or stop at the request and report.
- Before any new component: `skill://new-ui-surface` and
  `node tools/design-mcp/ds.mjs contract "<job>"`. Routes: `skill://new-route`.
  Domain tests: `skill://domain-unit-test`.
- No shims, no aliases, no re-exports. Done = `pnpm verify:fast` green
  (report ambient reds from other sessions separately). Do not commit or deploy.

## Read these (context budget)

1. `docs/handoff/HANDOFF-record-grammar-port-2026-09-29.md` — the owner-accepted
   plan for ONE record grammar. **Step 4 is this repair record.** Steps 1–2
   (`RecordItem`, `RecordModel` + `RecordView`) are NOT built yet (no
   `RecordView` / `repairRecordModel` exist in `src/`). Decide first: if another
   session has landed `RecordView` by the time you start, compose it; if not,
   build the repair record by composing the same primitives `InboundRecordView`
   composes (below) — do NOT fork a third layout.
2. `src/components/receiving/record/InboundRecordView.tsx`,
   `inbound-record-model.tsx`, `useInboundRecord.tsx`, `inbound-record-verbs.tsx`
   — the reference record (verbs → header strip, fulfillment lead, items,
   serials, notes, aside).
3. `src/components/outbound/orders/OrderRecordView.tsx` — only the item row
   (≈ l.820–960, `OrderItem`) and its fulfillment band.
4. Primitives: `src/design-system/components/DeskRecordPlane.tsx`
   (`DeskRecordLayout`; `DESK_RECORD_COLUMNS_CLASS` / `…MAIN_COLUMN_CLASS`
   (`@4xl:col-span-2`) / `…ASIDE_COLUMN_CLASS` in `tokens/desk-stage.ts`),
   `record-ledger/{RecordGroup,RecordFulfillmentSources,StepRail,LatestEdgeScroller,CarrierEventsRail,RecordItemIdentity,RecordSerials,InlineStageAssign}.tsx`,
   `src/design-system/components/RecordFlowFacts.tsx`,
   `record-action-strip/RecordActionStrip.tsx` (`face="header"`).
5. Pinned laws: `pinned.json` → `DeskRecordPlane` ("every record … is ONE
   two-column body: main = the work; aside = evidence"; no hand-rolled split or
   aside), `DeskPageChrome` (while a record is open, no page title and no page
   CTA), `RecordActionStrip`, `RepairCardList`.

## Current implementation

- List: `src/components/repair/RepairCardList.tsx`, one `RepairCard` per ticket
  through `TriageCardList` on Receiving `/repair` and Sales
  `/dashboard?mode=repairs`. It owns checked-card bulk actions and opens
  `RepairServiceRecordView` through `DeskRecordPlane`.
- Historical baseline removed by the migration: `RepairRecordView.tsx`,
  `RepairRecordStatus.tsx`, `repair-record-sections.tsx`,
  `repair-record-verbs.tsx`, `details-panel/useRepairDetailsPanel.ts`,
  `RepairDetailsPanel.tsx`, and `details-panel/*`. Their callers now open the
  shared repair record rather than mounting the retired inspector.
- Not affected (own stacks, keep): mobile `/m/rs/*` (`src/components/mobile/repair/*`),
  kiosk intake (`RepairServiceForm`, `RepairPaperworkCanvas`, …),
  `RepairPickupFlow.tsx` (reuse it as a panel for Start pickup).
- Queue data: `RSRecord` from `getAllRepairs` / `searchRepairs`
  (`src/lib/neon/repair-service-queries.ts`) — includes `status`,
  `status_history` (jsonb), `intake_channel` ('shipment' | 'pickup'),
  `received_at`, `due_at` (3-business-day SLA), `ticket_number`,
  `source_tracking_number`, `source_order_id`, `source_sku`, `serial_number`,
  `issue`, `price`, `customer_id`/`contact_info`, `counter_transaction_id`,
  `receiving_line_id` / `receiving_id` (drop-off carton `R-{id}`), `image_url`.
- Status faces: `src/design-system/tokens/repair-status.ts` (`REPAIR_STATUS`)
  and `src/lib/repair-status.ts`; the table displays status read-only while the
  selected-set bulk bar and record Change status panel own mutations.

## The record, section by section

### Header (identity left, actions far right)

`DeskStageRecordHeader` via the list's record slot: title `#{ticket_number}`
(fall back to "No ticket #"; never print `RS-{id}` as the identifier — the owner
removed it from the card), subtitle `customer · Shipped in|Dropped off · due
<date>` (or the closed date). Actions: `RecordActionStrip face="header"` built
from a `repairRecordVerbs(repair)` model, in this order (primary first, the
strip collapses to icons by container width):

| Verb | Writer (exists?) | Notes |
|---|---|---|
| Mark done | `PATCH /api/repair-service {id, status:'Done'}` → `updateRepairStatus` ✅ | Hidden when already closed. If the ticket is Awaiting Pickup, "Mark done" = Start pickup (signature) via `POST /api/repair-service/pickup` (`submitRepairPickup`) — decide one behaviour and state it. |
| Mark pending | same PATCH, `status:'Pending Repair'` ✅ | Hidden when already pending. |
| Print 2×1 label | `buildRepairLabelPayload` + `printRepairLabel` (`src/lib/print/printRepairLabel.ts`) then `POST /api/repair-service/[id]/label-printed` ✅ | Must print the REP-{id} 2×1 sticker exactly as today. |
| Print paperwork | `GET /api/repair-service/print/[id]` (`renderRepairPaperHtml`) ✅ | Inline: print through the house print path (iframe/print station), not a new tab, if the other records do so — check `inbound-record-verbs.tsx`. |
| Print receipt | `GET /api/counter/visit/[id]/receipt` (`buildVisitReceipt`) ✅ only when `counter_transaction_id` is set | For tickets without a counter visit there is NO receipt writer. Either build a repair receipt from `repair_service` (price, customer, issue, ticket) reusing `visit-receipt-html.ts`'s renderer, or disable with a reason — pick and justify. |
| Link ticket | `linkTicketToAnchor({type:'repair'})` exists in `src/lib/support/ticket-link.ts:143`, but `POST /api/support/tickets/link` Zod `LinkBody` (route.ts:72) lacks `repair` ❌ | Add the `repair` anchor to the route schema (+ manifest regression test). Keep `ticket_number` (Zendesk #) edit as the existing `PATCH … field:'ticket_number'`. |
| Create ticket | `createSupportTicket` (`src/lib/support/create-ticket.ts:121`), route `POST /api/support/tickets` Zod (route.ts:13) lacks `repair` ❌ | Add the anchor. Reuse the existing support create-ticket panel used by inbound/outbound records (find it in their verbs), never a new form. |
| Change status | `RepairStatusControl` / `useRepairStatusChange` ✅ | Same writer as the card. |
| Start pickup | `RepairPickupFlow` as a panel → `POST /api/repair-service/pickup` ✅ | Only when Awaiting Pickup / Repaired. |
| Square checkout | `POST /api/repair/square-payment-link` ✅ | Overflow. |
| Cancel repair | `DELETE /api/repair-service/[id]` ✅ | Overflow, destructive, asks for a reason as today. |

All verbs are also keyboard-reachable through the strip's hotkeys, like
inbound. Remove `RepairRecordStrip` from the list's `strip` slot; the list's
strip becomes the same verbs (or nothing) — mirror what `InboundRecordView`'s
host passes.

### Main column (two-thirds), top to bottom

1. **Fulfillment (top-left, leads the record).** `RecordGroup` with
   `RecordFulfillmentSources flow="inbound"`:
   - **Internal rail = the repair's status points** (the owner's focus). A
     `REPAIR_LIFECYCLE` step list in design tokens (one place, tones from
     `STATE_TONE_CLASSES`): Checked in → Received → Label printed → In repair
     → Repaired / Contact customer → Awaiting payment (only when used) →
     Ready for pickup / Shipped back → Closed. Who/when per step from
     `status_history` (+ `received_at`, `label_printed_at`). Branch states
     (Awaiting Parts, Awaiting Additional Parts Payment) show as the current
     step's sub-state, not extra columns. `StepRail` inside
     `LatestEdgeScroller`, newest started step pinned right. The due date
     (`due_at`) sits on the band as the SLA (same wording/tones as the card:
     "8d late", "Due today").
   - **External rail = carrier tracking** for shipped-in repairs:
     `source_tracking_number` → `shipping_tracking_numbers.tracking_number_normalized`
     → `shipment_tracking_events`. Add `GET /api/repair-service/[id]/carrier-events`
     mirroring `src/app/api/receiving/[id]/carrier-events/route.ts` (or
     generalise that reader into a lib fn both call — preferred) and feed
     `CarrierEventsRail`. Drop-offs have no external rail (the switcher shows
     internal only). If the repair's return shipment has a tracking number,
     show it too.
2. **Device** — the reported issue as the lead text of this group, then
   `RecordSerials` (the serial, copyable), then price.
3. **Status history** — timeline from `status_history` (who, when, from → to).
4. **Staff notes** — the same notes group as inbound (`PATCH … {notes}`).

### Aside (one-third) — "more details"

1. **Product, exactly like inbound/outbound** — the item row: 112px photo in
   `PhotoHoverPeek` (fallback initials), title `line-clamp-3` bold,
   `ItemIdentityRow label="SKU"` (`source_sku`, `SkuOpenInMenu`), `Item`/order
   row (`source_order_id` → Ecwid link when present). If the record-grammar
   Step 1 `RecordItem` exists, use it; else extract the shared item row from
   `InboundItem`/`OrderItem` rather than a third copy.
2. **Customer** — name, `tel:` phone, `mailto:` email (Step 4 decision already
   accepted), linked customer record.
3. **Movement / references** — `RecordFlowFacts direction="inbound"`: channel
   (Shipped in / Dropped off), inbound tracking, drop-off carton `R-{id}` (link
   to the receiving record), ticket # (Zendesk link), support tickets linked.
4. **Photos** door (entity `REPAIR_SERVICE`) and alerts card (load failures,
   overdue SLA) — same components inbound uses.

## Inline Add to the right of "Repair service"

- A `+` (Plus) icon button inline immediately right of the page title
  "Repair service" (list state only — `DeskPageChrome` hides title + CTA while a
  record is open). Accessible name "New repair", tooltip + hotkey `N` if the
  desk hotkey map has it free. It opens the existing intake
  (`RepairIntakeHost` / `RepairIntakeForm`, `?new=true`, submits
  `POST /api/repair/submit` → `submitRepairIntake`, which now also creates the
  drop-off's receiving record).
- Prefer the inline-in-list form: `TriageCardList leadSlot` renders the intake
  form above the cards (precedent: `OrderListLeadSlot`, `StockAddForm`,
  `FnskuCreateForm`) instead of the modal overlay; on submit the new card
  appears on top and its record opens. If the intake form is too tall for a
  lead slot, keep the overlay and say why.
- Check with `ds_contract "inline add button beside a page title"` whether
  `DeskPageChrome` already has a title-accessory slot; if not, add ONE
  additive `titleAccessory` prop there (other session owns the file — minimal,
  listed). Remove the page's separate top-right "Add" for repairs so there is
  one Add, not two. Same button on Sales `/dashboard?mode=repairs`.

## Deletion list (must be gone at the end)

`RepairRecordView.tsx`, `RepairRecordStatus.tsx` (`RepairStatusStrip`,
`repairPipeline`), `repair-record-sections.tsx`, `repair-record-verbs.tsx`
(`RepairRecordStrip` & co.), `RepairDetailsPanel.tsx`, `details-panel/*`,
`REPAIR_RECORD_COLUMN_CLASS` and any token/test/pinned entry that only served
them. Before deleting, run LSP references for every exported symbol and cut over
all record-plane callers. The retired symbols must have zero references.

## Model + tests

- `src/lib/repair/repair-record-model.ts` (pure): `RSRecord` → header, verbs
  (enabled/hidden + reason per status), lifecycle steps (from
  `status_history`), fulfillment sources, aside facts.
- `repair-record-model.test.ts`: lifecycle step states per status incl. branch
  states and closed; verb visibility (Mark done hidden when closed, Mark
  pending hidden when pending, Print receipt disabled without a counter visit
  unless you build the repair receipt, Start pickup only when ready); external
  rail present only with a tracking number; ticket title fallback.
- Route tests: `route-permission-manifest.test.ts` rows for any new/changed
  route (carrier-events, support link/create with the repair anchor).

## Acceptance (observable at `http://localhost:3050`, 1440×900 and 390×844)

1. `/repair?channel=pickup&openRepair=4894` (#10089, Roxann Fenn, Dropped off):
   header `#10089` with the verbs at the far right; fulfillment band top-left
   with the status points (Checked in, Received …) and the due date; product
   row in the aside identical in look to an inbound item; customer with
   tel/mailto; `R-{carton}` link to its receiving record once linked.
2. A shipped-in ticket with a tracking number (find one:
   `select id from repair_service where source_tracking_number is not null`)
   shows the carrier rail with events.
3. Each verb exercised on ONE ticket and reverted: Mark pending → Mark done →
   back to its original status (both in status history); Print 2×1 label and
   Print paperwork reach the print path; Print receipt behaves as decided;
   Link ticket links an existing support ticket then unlink it; Create ticket
   stops before creating (or creates on a test ticket and deletes it — say
   which).
4. Inline `+` right of "Repair service" opens the intake; do not submit a real
   repair (or submit one and cancel it, and report ids).
5. Cmd-K "10089" still lands on this record (Dropped off view, record open).
6. The grep in "Deletion list" is empty; `pnpm verify:fast` green;
   `ds_critique` clean on new UI files; screenshots in `/tmp/repair-record/`.
7. Do not deploy — the owner validates first.

## Open decisions to report (don't block on them)

- Mark done on an Awaiting Pickup ticket: plain status or pickup + signature?
- Receipt for tickets without a counter visit: build a repair receipt, or
  disabled with reason?
- Inline Add: lead-slot form vs the existing overlay.


## Desktop queue and record contract

- The desktop queue is the registered `repair.queue` `DataTable`. Its
  checkmark gutter owns selection; workflow status remains a read-only row
  fact and is changed only through the selected-set action bar or the open
  record's Change status panel.
- Selected repairs support status changes, staff assignment, one print run
  for repair labels, ticket-number copy, CSV export, and partial-failure
  reporting.
- The funnel combines workflow-status and warehouse-attention questions:
  overdue, missing ticket/serial/price/customer, needs label, parts/payment
  waits, and inbound not received. These params participate in saved views.
- The open record contains embedded support-ticket triage, complete manual
  repair/customer/source editing, the shared bench timer/action writer, and
  tenant-scoped before/after activity history.
- Keyboard access keeps `J`/`K` for record walking. Record verbs use distinct
  keys (`T` triage ticket, `V` link ticket, `I` information, `B` bench log).
