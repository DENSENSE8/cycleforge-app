> **Status 2026-09-25:** Phase 1 built (uncommitted). The global-header `+`
> opens the **label intake desk**: order number (paired order or reference-only
> number) → return / replacement label, one triage surface. Support Phase 2
> remains deferred.
> Continue from [`support-call-desk-HANDOFF.md`](./support-call-desk-HANDOFF.md).

# Support call desk — plan (global Add · label on a call · live Nextiva)

Operator, 2026-09-25: "I must be able to add an order or add a shipment globally,
wherever I need to … link a support ticket, link an order number, link a label or
buy a label through the ShipStation API … displayed in the triage design system …
the customer called at this date and time, reported this issue, a shipping label
was bought for this return and replacement." Long-term: "I'm on the phone with the
customer, a webhook shows the call live through Nextiva, and AI adjusts what I need
to do." Desktop app pairs to Nextiva natively; web shows the same thing through a
Staff-ID websocket link.

Phase 1's definition of done, in the operator's words: **"I'm on the phone and I
searched the order."**

Builds on (do not fork): `docs/todo/order-intake-acknowledgment-PLAN.md` (caged
intake + G1–G3 gates, implemented), `docs/todo/nextiva-voice-support-mode-plan.md`
(call log + voicemail modes, ~65% shipped; §9 credential spike still open),
`docs/todo/support-service-workspace-PLAN.md`.

## What exists (evidence, 2026-09-25)

| Need | Exists | Gap |
|---|---|---|
| Order record display | `OutboundOrdersLedger` + `OutboundOrderEvidence` (To-ship, Exceptions reuse it) | Only on outbound desks |
| Global find | ⌘K `CommandBar` → `/api/global-search` → order hit → `/search?sel=order:<id>` | Legacy card dossier (`SearchOrderDossier`), not the design system |
| Buy / void / link labels | `/api/shipping/order-rates`, `/api/shipping/order-labels/purchase` (`purpose` outbound · return · replacement), `shipping_label_purchases`, `BuyLabelSection`, `OrderLabelEntries` | Return + replacement are two separate buys; no support context |
| Ticket ↔ order ↔ label | `ticket_links` (1 primary anchor + references), `linkLabelToTicket` | No "call" record tying time + issue + labels together |
| Global "+" | `src/lib/global-add/catalog.ts` (6 groups, intent bus); header "+" retired 2026-09-22 into the Activity inbox | Navigates away; no support verbs; not triage |
| Calls | `call_events`, `voicemails`, webhook `/api/integrations/nextiva/webhook/[token]`, click-to-call, `matchCustomer` (customers + square only) | Caller → orders not resolved; `voice_event` published but no client subscribes; no per-staff call channel |
| Automations | `automation_rules` / `automation_runs`; triggers `order.imported` … ; action only `assign_work` | No support trigger, no label action |
| Desktop | Electron shell (`electron/`), `desktop_devices` enrolment, staff bridges (`org:{org}:print:{staffId}` …) | No voice code in Electron; no voice bridge channel |

## Phase 1 — On-the-phone order lookup (BUILT 2026-09-25)

The foundation every later phase stands on: one place an operator lands with a
customer on the line.

- `/search?sel=order:<id|order#>` (every ⌘K order hit, thread link, AI tool href)
  renders `SearchOrderLedger` in `ModeRegion mode="triage"`: the To-ship
  `OutboundOrdersLedger` over the order's lines (any status, shipped included),
  the searched line opened in the SAME `OutboundOrderEvidence` rail To-ship uses.
- The ledger's find box searches ALL orders (`/api/orders?q=&includeShipped=true`
  — order #, tracking, SKU, title, and now the customer: name, email, ShipStation
  ship-to name, and a read-out phone number matched on its last 10 digits), so the
  next "what about my other order?" is one type away.
- Phone `/m/search` keeps its compact dossier (mobile-first law) until Phase 6.

Acceptance: ⌘K → order # or customer → Enter → lines + evidence rail (customer,
price, labels, tracking, notes, platform) without leaving the page.

## Phase 2 — The record remembers the call
> **Deferred for this increment (operator 2026-09-25).** Only the approved
> tenant schema migration `2026-09-25d_support_interactions.sql` has landed and
> been applied. No History UI, interaction routes, or caller→order matching.

- `support_interactions` (tenant-from-birth): `occurred_at`, `channel`
  (`call` · `voicemail` · `email` · `chat` · `walk_in`), `call_event_id`,
  `staff_id`, `customer_id`, `issue_code` + free text, `outcome`. Children via the
  existing waists — orders and labels through `ticket_links`-style references
  (`interaction_links(entity_type, entity_id, role)`), never a second label table.
- Evidence rail gains a **History** section (`EvidenceDisclosure`): interactions,
  tickets, labels, notes in time order — restores the timeline the legacy dossier
  had (`orderTimelineQuery`) inside the design system, on To-ship too.
- Caller → orders: extend `matchCustomer` to orders' ship-to / bill-to phone and
  `customers.id → orders`; `call_events.matched_customer` gains `order_ids`.

## Phase 3 — Global label intake, in triage (BUILT 2026-09-25)

- The global-header `+` opens `/search?entry=label`, which mounts
  `LabelIntakeDesk` (`src/components/outbound/label-intake/`) — a purpose-built
  triage ledger, not the search browse / To-ship DataTable and not
  `BuyLabelSection`. Rows: Order # (fixed-width, pairs as you type) · Item ·
  Label (RPL / RTN) · Ship to/from · Parcel · Rate ledger · Buy (buy → confirm →
  bought → print → offer the other label). Evidence column: every label under
  the number, print per row, **Pair** verb.
- **Paired** (number is an order): the order's address and parcel prefill;
  rates/buys go through `/api/shipping/order-rates` +
  `/api/shipping/order-labels/purchase` (tracking, documents, notes,
  buyer-note interlock, replacement tracking email).
- **Reference only** (number not in the system): address typed inline;
  `/api/shipping/label-intake/{rates,purchase}` rate and buy from it and record
  the row in `shipping_label_purchases` with `order_id` NULL, `order_ref`,
  `ship_to` (migration `2026-09-25f`, applied). When the order later exists,
  `/api/shipping/label-intake/pair` attaches those rows (replacement joins
  tracking, notes trail written).
- Retired: the exception-intake overlay door and the evidence-rail
  "Problem order" section from the first cut.
- Future generic Add verbs may still use `global-add/catalog.ts` and a
  `DeskStageOverlay`; not part of this label workflow.

## Phase 4 — Label suggestion rule

- Automation vocabulary: trigger `support.issue_logged`; `when` gains
  `issue_code`, `platform`, `destination_country`, `order_value`; action
  `suggest_label { purposes: ['return','replacement'], carrier?, service?, package? }`.
- Evaluation writes a suggestion onto the interaction; the Log-a-call form shows
  "Suggested: RTN USPS Ground Advantage + RPL same service · $x.xx" from a live
  rate-shop, one press to buy. Rule authoring lives with the existing automation
  settings; `automation_runs` records every suggestion shown and taken.

## Phase 5 — Live call (Nextiva) + AI

Prerequisite: `nextiva-voice-support-mode-plan.md` §9 spike (auth, call-start
webhook fields, extension → staff mapping, transcript availability).

- Webhook call-start / answer / end → `call_events` (exists) → publish on a
  STAFF channel `org:{org}:voice:{staffId}` (new, beside the print/station
  bridges) resolved from the answering extension.
- **Live call panel** (triage, right rail on any page): caller, matched customer,
  their orders (Phase 1 lookup run on the caller's number), open tickets, and the
  Phase-3 Log-a-call form pre-filled with the call. Ends → interaction saved.
- AI: the assistant subscribes to the same channel; with a transcript it proposes
  the issue code, outcome and the Phase-4 label; without one it works from the
  operator's typed notes. Suggestions only — the operator presses Buy.
- Desktop: Electron gains the native Nextiva pairing (softphone / app bridge) and
  publishes call state on the staff channel; web mirrors the panel for the same
  Staff ID once the desktop is enrolled (`desktop_devices`). Web alone still works
  from webhooks.

## Phase 6 — Phone parity

`/m/search` order selection and the Log-a-call form on `/m/*` per
`docs/mobile-first/SURFACE_LAW.md`; Support lane leaves `hidden` once it has a
phone surface.

## Order of work

1 → 2 → 3 → 4 → 5 → 6. Phases 2–4 need no Nextiva access; Phase 5 starts with
the §9 spike, which can run in parallel with Phase 2.
