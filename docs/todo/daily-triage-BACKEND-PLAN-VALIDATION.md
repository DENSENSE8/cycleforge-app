# Daily triage — Backend spine (for validation)

**Status:** Proposal — **needs validation** (do not schedule build until pressure-tested)  
**Created:** 2026-07-31  
**Companion UI plan:** [`daily-triage-FRONTEND-PLAN-VALIDATION.md`](./daily-triage-FRONTEND-PLAN-VALIDATION.md)  
**Cursor plan:** `~/.cursor/plans/triage_backend_spine_f54b6071.plan.md`  
**Related:**
- [`home-triage-subscriptions-PLAN-VALIDATION.md`](./home-triage-subscriptions-PLAN-VALIDATION.md)
- [`home-ops-tv-collab-surfaces-plan.md`](./home-ops-tv-collab-surfaces-plan.md)
- [`contextual-my-day-home-plan.md`](./contextual-my-day-home-plan.md)
- [`.claude/rules/polymorphic-tables.md`](../../.claude/rules/polymorphic-tables.md)
- [`.claude/rules/backend-patterns.md`](../../.claude/rules/backend-patterns.md)

> Validate with floor leads / support before implementation. Update the **Validation log** below as checks land.

---

## Verdict (working)

Close the existing subscription pipe and grow it — do **not** invent a second inbox, ticket creator, or link hub.

**In scope:** event vocabulary bridge · pin tracking (STN) · fan-out completion · unified `TriageTask` feed API · platform message ingest · bad-feedback settings → auto `createSupportTicket` → assign/fan-out.

**Out of scope:** UI (frontend plan) · general email SMTP · SLA cron walker · multi-provider messaging beyond first slice · new `triage_tasks` table.

---

## Waist (law)

```text
Webhook / poll / station write / platform feedback
  → domain update
  → recordOpsEvent(notifiable key, entityType, entityId)
  → notification_outbox
  → drainNotificationOutbox
  → staff_inbox_items
  → Ably inbox.updated
  → GET /api/my-day | GET /api/inbox

Bad feedback (extra):
  rating ≤ threshold + setting on
  → createSupportTicket (idempotent) + ticket_links
  → upsertTicketAssignment + support_assignment notify
  → My Day + Support + entity chips
```

Never write `staff_inbox_items` from webhook handlers.  
Never invent a second ticket create path — use `src/lib/support/create-ticket.ts`.

---

## Phases

### B0 — Event vocabulary bridge — **RESOLVED 2026-08-01, see design below**

~~Fix | Aliases/dual-write + tests in `event-vocabulary.ts`~~ — this line was right in spirit but too vague
to build from, and the validation pass's own "treat B0 as build the mapping, not add aliases" framing was
**partly wrong** — walked back below. Full mapping in `src/lib/ops-events.ts` / `event-vocabulary.ts` /
`fanout-worker.ts`, read 2026-08-01. **There are two structurally different writers into `ops_events`, and
they need two different fixes — neither is "just add aliases."**

**Writer 1 — `recordOpsEvent()` direct callers.** Only **8 production call sites** exist (not the ~20
loosely implied earlier — that count conflated `ops_events` with the unrelated `inventory_events`
state-machine log written by `transition()`, which has no connection to notifications; `ADJUSTED`/
`SHIPPED`/`PICKED`/`ALLOCATED`/`PUTAWAY` live there, not here). `ops_events.event_type` is **unconstrained
TEXT** — no DB CHECK, no schema risk to changing what string gets written. The real risk is entirely at
the **read side**: several of these legacy keys are load-bearing in production SQL outside the
notification pipe.

| Legacy key (`recordOpsEvent` call site) | Entity | Live legacy readers (confirmed, file:line) | Fix |
|---|---|---|---|
| `UNBOX_CONFIRMED` (`mark-received-po/route.ts:443,650`) | receiving | `build-sql.ts:673` — `NOT EXISTS` gate keeping unboxed lines **out of the triage queue** | **Dual-write required.** A rename would push already-unboxed lines back into triage — a real regression, not cosmetic. Add a second `recordOpsEvent` call at the same 2 sites: `eventType: 'receiving.carton.received'` (**already exists** in `NOTIFIABLE_EVENTS`, family `unbox`, severity 1) — same payload, `clientEventId` suffixed `:notify` for its own idempotency slot. |
| `TRACKING_SCANNED` (`record-scan.ts:151`) | receiving | `build-sql.ts:267` — `MIN/MAX(occurred_at)` computing the grid's first/last-scanned columns | **Dual-write required**, same reason. Add `eventType: 'receiving.carton.arrived'` (**already exists**, family `delivery`, severity 0). |
| `UNBOX_SCAN_OPENED` (`unbox-scan-opened.ts:127`) | receiving | `build-sql.ts` ×4, `unfound-queue/route.ts:105`, and its **own** read-back query (`unbox-scan-opened.ts:28`) | **Dual-write required.** Add `eventType: 'receiving.carton.opened'` (**already exists**, family `unbox`, severity 0). |
| `TICKET_LINKED` / `TICKET_UNLINKED` (`ticket-link.ts:327`) | shipment | `journey.ts:573`, `support/context.ts:256`, `support-context-timeline.ts:43` | **Dual-write, gated on B1.** `entityType: 'shipment'` isn't in `NOTIFIABLE_ENTITY_TYPES` yet (B1's job) — add new keys `support.ticket.linked` / `support.ticket.unlinked` (matches this row's original "New keys" line) once B1 lands, dual-written alongside the untouched legacy pair. |
| `RECEIVING_LOOKUP_SCAN` (`unbox-lookup-scan.ts:152`) | receiving | none found | **Leave non-notifiable, on purpose.** No legacy reader to protect, but this is a "did we look this up" scan, not a milestone — matches the notification-fatigue default-to-silence principle already in the frontend doc. Don't invent a key just for completeness. |
| `e.action` (`apply-agent-mutation.ts:203`), `activation.${event}` (`activation-events.ts:52`) | `other` | — | Correctly out of scope — `other` is non-notifiable by design, unchanged. |

**Writer 2 — `recordEntitySignal()` (`src/lib/surfaces/record-entity-signal.ts`) — the bigger, previously
unnoticed gap.** Every entity-signal write emits `ops_events.event_type = 'signal_recorded'` **literally,
always** (`record-entity-signal.ts` writeSignal, the `ops_events` INSERT) — the real semantic kind
(`return_reason`, `warranty_denial`, `exception_why`, `triage_outcome`, `test_fail_reason`, …, per
`SIGNAL_KINDS` in `src/lib/surfaces/registry.ts`) lives one level down, in `payload.signalKind`. Every one
of `SURFACE_ENTITY_TYPES`' `opsEventEntityType` values (`receiving`, `receiving_line`, `serial_unit`,
`order`, `fba_shipment`, `repair`, `warranty_claim`) is **already** in `NOTIFIABLE_ENTITY_TYPES` — so this
whole surface (order / fba_shipment / repair / warranty_claim notifications, not just receiving) produces
**zero fan-out today**, silently, because `notifiableEvent('signal_recorded')` never matches anything. No
legacy reader depends on the literal string `'signal_recorded'` (grepped clean) — this is a **read-side
fix, not dual-write**: teach `processOutboxRow`/`notifiableEvent` (`fanout-worker.ts`) to special-case
`event_key === 'signal_recorded'`, read `payload.signalKind`, and resolve notifiability + label/family/
severity/collapseParent from a new signal-kind-keyed table alongside `NOTIFIABLE_EVENTS` — one code change
in the worker, zero new `ops_events` writes, and it is the single highest-leverage fix in B0: it turns on
notifications for four entity types (order/fba_shipment/repair/warranty_claim) that get none today.

**New keys for call sites that don't exist yet — no dual-write needed, just write them right from day one.**
`shipment.status.*` (B1's new `updateShipmentSummary` → `recordOpsEvent` call — doesn't call it today, so
there's no legacy key to protect), `marketplace.message.*` / `marketplace.feedback.*` (B7/B8's new ingest
code) — B0's job here is only to pre-register the `NOTIFIABLE_EVENTS` entries (label/family/severity) so
B1/B7/B8 have something to import; there's nothing to migrate.

**Follow-up, explicitly NOT in B0's scope (ask-first later):** the dual-write above is deliberately the
low-risk choice — fully additive, ships independently, trivially reversible (stop emitting the second
event) — at the cost of permanently running two event vocabularies side by side for these four keys.
A later cleanup ticket could migrate the ~14 legacy-string readers (`build-sql.ts`, its test fixture,
`unfound-queue/route.ts`, `journey.ts`, `support/context.ts`, `support-context-timeline.ts`,
`unbox-scan-opened.ts`) onto the dotted keys and retire the duplicate write — that requires a backfill
decision for historical rows and touches hot receiving-grid query paths, so it's a separate, larger,
explicitly-deferred change, not part of this plan.

**Answer to the phase's own "Validate" question:** *Does dual-write break receiving SQL that depends on
legacy event names?* **The question was inverted — dual-write is what PREVENTS breakage.** A straight
rename would have broken it, confirmed with exact file:line evidence above (the triage-queue gate and the
first/last-scanned columns both read the legacy literal directly). Dual-write is the only safe option for
those three keys.

### B1 — Pin tracking subscription

**Product:** Pin a tracking number → carrier webhook/poll status change → inbox/triage task for subscribers.

1. CHECK + STN parent-delete trigger for `shipment` on `staff_subscriptions` / `staff_inbox_items`
2. Emit `recordOpsEvent` on **meaningful** STN transitions from `updateShipmentSummary` waist (push **and** poll)
3. Extend `/api/subscriptions/toggle` for `entityType: 'shipment'`

**Validate:** Meaningful-transition rules (avoid notification spam on duplicate webhooks). Is STN the right pin target vs linked receiving/order?

### B2 — Fan-out completion

- Finish `match_sku` / platform in `fanout-worker.ts`
- Ably `inbox.updated` after INSERT/collapse

**Validate:** Permission dual-gate still correct for `shipment` + messaging events?

### B3 — Unified triage feed API — **RESOLVED 2026-08-01, see design below**

~~Extend `aggregateMyDayFeed` with `TriageTask` DTO + server filters (`urgent`, `assignee`, `category`, `state`).~~
The schema collision this line caused against `home-ops-tv-collab-surfaces-plan.md` (which also treats
`aggregateMyDayFeed` as canonical, for a completely different reason) is resolved below. **No new
`TriageTask` type, no new table, no breaking change to `MyDayFeed`.**

**Ground truth (`src/lib/my-day/`, read 2026-08-01):**
- `MyDayFeed` = `{ doNext: WorkOrderRow | null; assigned: WorkOrderRow[]; interrupts: MyDayInterrupt[]; queueCards: MyDayQueueCard[]; counts }` — already shipped, already consumed by `MyDayRail` (F0, frontend plan). **Do not change this shape's existing fields — only widen additively.**
- `MyDayInterrupt.kind` is a closed 3-value union (`return_pending_test | order_ready_ship | support_followup`), built from `listTechQueueItemsForStaff` + `listSupportFollowupsForStaff` — **zero involvement of `staff_subscriptions`/`staff_inbox_items` today.**
- **The "Inbox" home mode already exists, fully wired, separate from Today**: `GET /api/inbox` → `getInboxFeed()` reads `staff_inbox_items` directly, gated by `isHomeInbox` + `home.inbox.view`, with a real 4-state model (`unread | read | done | snoozed` — not the binary open/done B3 assumed) and filters `active|unread|done|snoozed`. `PATCH /api/inbox/[id]` already exists for read/done/snooze (confirms B4's "Inbox PATCH stays read/done/snooze" was already accurate). **This means B1/B2's job is populating `staff_inbox_items` correctly (pin tracking, messages, feedback → real rows) — the Inbox mode UI/API itself needs no new work from this plan.**

**The actual design decision this collision forced, and the resolution:**

Today (`?mode=today`) and Inbox (`?mode=inbox`) are not one feed pretending to be two — they read the same
underlying facts through **one shared query function**, filtered differently, matching the frontend plan's
own stated intent ("Inbox mode stays deep ledger; Today is the action board"):

1. **`aggregateMyDayFeed` gains one more parallel source call**, alongside its existing `listTechQueueItemsForStaff`/`listSupportFollowupsForStaff` calls: `getInboxFeed({ orgId, staffId, permissions, filter: 'active' })` — **the exact same library function `/api/inbox` already calls**, not a duplicate query. `'active'` excludes `done` and `snoozed` automatically — Today never needs to know those states exist.
2. **Map each returned `staff_inbox_items` row into the existing `MyDayInterrupt` shape** (it already has `id`/`kind`/`title`/`subtitle`/`href`/`createdAtMs` — no new type). Add one optional field, `inboxItemId?: number`, present only on inbox-sourced interrupts — its presence is what lets a UI "Mark done" action know to call `PATCH /api/inbox/[id]` instead of doing nothing (assignment-sourced interrupts have no natural "done" — the underlying work's own status is truth, and `isActionableRow` already drops DONE/CANCELED rows upstream).
3. **Widen `MyDayInterruptKind`** with new values derived from `staff_inbox_items.entity_type`/`event_key` (via the B0 vocabulary bridge, not a second lookup): `tracking_update | marketplace_message | marketplace_feedback | bad_feedback_ticket | inbox_other` (fallback so an unmapped `event_key` never silently drops a row). This is additive — old consumers of the 3-value union are unaffected because it's a union, not an enum with a fixed arity check anywhere in the render path.
4. **Fix the `my-day-href` bug as part of this widening, not separately**: `interruptHref()` (`src/lib/my-day/my-day-href.ts:17`) sets `params.set('ticketId', ...)` — change to `'ticket'`. While widening it to resolve inbox-sourced rows (`entity_type`/`entity_id`, not just the 3 hardcoded kinds it knows today), **route through `searchHitHref` (`src/lib/search/search-hit.ts`)** instead of hand-rolling a new branch per entity type — that's the house SoT for entity→href resolution and already covers `shipment`/`fba_shipment`/`repair`/`warranty_claim`.
5. **`queueCards` gains one more entry** — an "Inbox" card (`permission: 'home.inbox.view'`, `href: '/?mode=inbox'`, `count` = the same `active`-filtered inbox item count) — so Today always has a visible, honest link to the full ledger for anything that didn't clear the bar to appear as an interrupt.
6. **The categorized/filterable board (frontend F1) is a NEW, additive derivation — not a new fetch, not a new backend entity.** A pure helper (`deriveTriageRows(feed: MyDayFeed): TriageRow[]`, `src/lib/my-day/`) flattens `assigned` + `interrupts` into rows tagged with `category` (derived from `WorkOrderRow.entityType`/`queueKey` or `MyDayInterrupt.kind` — the `unbox|repair|pack|ship|support|fba|tracking|messaging|feedback|other` vocabulary maps cleanly onto both), `state` (`open` = not-done/not-cancelled/unread/read; `done` = WorkStatus DONE or inbox state `done`), and `urgent` (existing SLA/priority signals already on `WorkOrderRow`). **Renamed `TriageTask` → `TriageRow`** to avoid colliding with `ops_plan_tasks`/the home-ops-tv-collab "Tasks" mode, which is a completely unrelated concept (structured plan work, `?task=<uuid>&plan=<uuid>`) that this phase does not touch.
7. **`GET /api/my-day` stays backward compatible.** With no query params it returns exactly today's `MyDayFeed` (zero risk to already-shipped `MyDayRail`). `?urgent=&assignee=&category=&state=` are accepted as optional filters that, when present, additionally populate a new `tasks: TriageRow[]` field for `MyDayTriagePane` to render — old callers never see it.
8. **`?assignee=` only meaningfully filters assignment-sourced rows.** Inbox-sourced interrupts are inherently "mine" by construction (they only exist because I'm subscribed) — there's no unassigned/team-wide inbox row the way `WorkOrderRow.techId/packerId` can be null. State this explicitly in the UI so `?assignee=unassigned` doesn't silently hide all inbox rows.

**Answers to the phase's original "Validate" questions:**
- *One feed vs separate Today + Inbox APIs?* **Separate APIs, shared library function** (`getInboxFeed`) — see above.
- *Category list complete for dogfood?* The 10-value list maps cleanly onto the two existing sources (station queues → `unbox/repair/pack/ship/fba`; inbox → `tracking/messaging/feedback/support`; `other` catches the rest) — no change needed.

**Bug to fix:** `my-day-href.ts:17` — `ticketId` → `ticket` (see point 4).

### B4 — Urgency + assign

Ownership on entity (`work_assignments`, `support_ticket_assignments`, threads). After assign → notifiable event. Inbox PATCH stays read/done/snooze.

**Validate:** Default assignee for auto tickets — person vs role queue?

### B5 — Domain emitters

Unbox confirmed, support create/assign/update, priority ready-to-ship → same spine.

### B7 — Platform message replies

| Today | No marketplace message webhooks; `EbayClient.fetchUnreadMessages` dead stub; no `messaging` capability |
| Build | Add `messaging` capability; ingest SoT under `src/lib/integrations/messaging/`; first provider vertical slice (eBay poll **or** webhook); emit `marketplace.message.received`; subscribe on order; escalate via `createSupportTicket` |

**Validate:** First provider = eBay? Persist new table vs overload `entity_threads`? Outbound send deferred OK?

### B8 — Bad feedback → auto ticket → shared displays

| Settings (registry — no new settings table) | `support.autoTicketOnBadFeedback`, `support.badFeedbackThreshold`, `support.badFeedbackDefaultAssignee` |
| Ingest | Provider feedback webhook/poll → threshold check → idempotent `createSupportTicket` + links + assign |
| Shared | Support `?ticket=` · Home assignment interrupt · `ticket_links` chips on order/unbox |

**Validate:** Threshold shape (stars vs Negative enum)? Distinct from stub `receiving.autoTicket` (QA/unfound)? Which marketplace feedback APIs are available for dogfood?

### B6 — Verify

Unit + QA: pin STN → status → inbox; message → triage row; bad feedback → ticket on Home + Support. `npm run verify` + route-auth emit.

---

## Open questions (fill during validation)

1. ~~First messaging provider and ingest mode (poll vs webhook)?~~ **Answered below — eBay, webhook-capable.**
2. ~~Bad-feedback threshold UX and which platforms provide ratings for USAV dogfood?~~ **Answered below — no single numeric threshold works across providers.**
3. Pin target: STN only, or also "watch this order's trackings"?
4. Should create-without-assign ever appear on Home, or assignment-only forever?
5. Ship B0–B2+B1 before B7–B8, or one vertical slice including bad-feedback?

---

## Validation findings — 2026-08-01 automated pass (repo audit + external API research)

Repo claims checked against current code (file:line evidence held by the reviewing agent, summarized here); eBay/Amazon feedback+messaging APIs checked against current vendor docs. **Net: the plan's shape (waist, phase order) holds up. Several phases understate scope, and B8's "threshold" framing doesn't survive contact with the actual provider APIs.**

**B0 — worse than "bridge a mismatch."** `NOTIFIABLE_EVENTS` (`src/lib/notifications/event-vocabulary.ts`) only defines dotted keys; every live `recordOpsEvent` emitter in production uses SCREAMING_SNAKE. Zero production emitters use a dotted key today, so `fanout-worker.ts`'s `notifiableEvent()` currently drops **every** real event — the pipe is fully inert, not partially aliased. `shipment`/`other` are confirmed non-notifiable (`NON_NOTIFIABLE_ENTITY_TYPES`).
>
> **Correction, 2026-08-01:** `ADJUSTED`/`SHIPPED`/`PICKED`/`ALLOCATED`/`PUTAWAY` above were misattributed — those live in the unrelated `inventory_events` state-machine log (`transition()`), not `ops_events`; they have nothing to do with this pipe. And **"treat B0 as build the mapping, not add aliases" was partly wrong** — a grounded pass (see the resolved B0 phase section below) found three legacy keys with live SQL dependents where a straight rename would cause real regressions (lines falling back into the triage queue, receiving-grid columns breaking). Dual-write, not renaming, is required for those three. A fourth, much bigger gap was also found: `recordEntitySignal()` always writes the literal event type `'signal_recorded'`, so the entire signal surface (order/fba_shipment/repair/warranty_claim) produces zero notifications today — that needs a read-side fix in the worker, not a write-side alias at all. Full resolved design in the B0 phase section.

**B1 — reverses a documented decision; do so explicitly.** `staff_subscriptions`/`staff_inbox_items`'s entity-type CHECKs (`2026-07-28c/d` migrations) deliberately excluded `'shipment'` because "there is no shipments parent table" — but `shipping_tracking_numbers` is a real parent table (`updateShipmentSummary` writes to it). Adding `shipment` is legitimate pattern evolution, but the migration should say it's reversing that specific prior call, not just extending. Also: `event-vocabulary.test.ts` regex-pins `NOTIFIABLE_ENTITY_TYPES` against the migration's literal CHECK text — must update in lockstep or the test breaks on a correct change. `updateShipmentSummary` fires on both push and poll paths and currently never calls `recordOpsEvent` — confirmed gap, straightforward to close.

**B2 — the aspirational columns already exist and are dead.** `match_sku`/`match_platform`/`match_severity_min` columns + a partial index already exist on `staff_subscriptions`; `resolveRecipients()` in `fanout-worker.ts` never references them. This is "wire up dead columns," not "add columns." The Ably channel shape (`org:{org}:inbox:{staff}`) is already named in the `2026-07-28d` migration's own header comment — B2 implements a documented target, it doesn't need to invent one.

**B3 — closer to a new DTO than an extension.** `aggregateMyDayFeed` takes no filter params today; `MyDayInterruptKind` is a closed 3-value union, nowhere near the plan's 10-category list. Budget B3 as a new aggregation path, not a parameter add. The `my-day-href` bug is **confirmed real**: `interruptHref()` sets `ticketId`; Support reads `?ticket=` — the link silently opens Support with nothing selected.

**B3 collision with `home-ops-tv-collab-surfaces-plan.md` — RESOLVED 2026-08-01.** That plan also treats `aggregateMyDayFeed` as canonical for its `today` mode, using a different data model (`ops_plan_tasks`/work-orders vs. this plan's `staff_subscriptions`-born rows). Full resolved design now lives in the B3 phase section above: `MyDayFeed`/`MyDayInterrupt` are widened additively (never replaced), the already-shipped `/api/inbox` (`staff_inbox_items`, 4-state model, `PATCH` read/done/snooze — B1/B2's job is populating it, not building it) stays the deep ledger, Today gets a curated `active`-filtered slice via the same shared `getInboxFeed()` call, and the new categorized-board type is named `TriageRow` (not `TriageTask`) specifically to avoid colliding with that plan's unrelated `ops_plan_tasks`/"Tasks" mode concept. Neither plan needs to change its own scope — they compose.

**B7 — correct "dead stub" to "dead code."** `EbayClient.fetchUnreadMessages` is a complete, working implementation against eBay's Commerce Message API with zero call sites — resurrecting it is cheaper than the plan implies. **External finding:** eBay's Notification API ([overview](https://developer.ebay.com/api-docs/commerce/notification/overview.html), [topics](https://developer.ebay.com/develop/api/buy/notification_events)) has a live `NEW_MESSAGE` topic — eBay-first with a real **webhook** subscription is viable, not poll-only as the plan's phrasing ("poll **or** webhook") leaves open. Recommend webhook.

**B8 — `createSupportTicket` is a sibling, not the sole path; and "threshold" doesn't hold across providers.** At least 7 other call sites create tickets directly (`zendesk/tickets/route.ts`, `photo-ticket/route.ts`, `receiving/zendesk-claim/route.ts`, `unfound-queue/.../push-to-zendesk/route.ts`, `threads/escalate.ts`, `support/ticket-outbox.ts`, `receiving/claims-escalation.ts`) — B8 should name which existing path it parallels, since "never invent a second create path" is already unenforced today. **External finding, answers open question #2:** eBay feedback ([Trading API FeedbackInfoType](https://developer.ebay.com/devzone/xml/docs/reference/ebay/types/FeedbackInfoType.html)) is **categorical** — `CommentType` = Positive/Neutral/Negative, no numeric star score for basic feedback (a separate `FeedbackRatingStar` exists only for detailed seller ratings, a different metric). eBay also exposes a real webhook topic, `FEEDBACK_RECEIVED`. Amazon's `GET_SELLER_FEEDBACK_DATA` report is the opposite shape: **poll-only** (a report, no webhook) and is **pre-filtered server-side to 1–3 star / negative+neutral feedback only** — Amazon does the "bad" filtering for you but on a pull cadence. **Conclusion: there is no single numeric "threshold" setting that works across providers** — `support.badFeedbackThreshold` needs a per-provider-shape adapter (eBay: enum ≤ Neutral vs ≤ Negative; Amazon: report ingest is already bad-only, so the "threshold" is really just on/off) rather than one number in the settings registry.

**Minor, pre-existing, not blocking:** `support_ticket_assignments` is a real, actively-used table but isn't modeled in Drizzle (a pre-existing `polymorphic-tables.md` rule-8 gap, unrelated to this plan).

Sources: [eBay Notification API overview](https://developer.ebay.com/api-docs/commerce/notification/overview.html) · [eBay Notification Topics](https://developer.ebay.com/develop/api/buy/notification_events) · [eBay FeedbackInfoType](https://developer.ebay.com/devzone/xml/docs/reference/ebay/types/FeedbackInfoType.html) · [Amazon SP-API Performance Reports (GET_SELLER_FEEDBACK_DATA)](https://developer-docs.amazon.com/sp-api/docs/report-type-values-performance) · [Amazon SP-API Notifications API](https://developer-docs.amazon.com/sp-api/docs/notifications-api)

---

## Validation log

| Date | Who | Result |
|---|---|---|
| 2026-08-01 | Claude (schema-collision resolution) | Resolved the `aggregateMyDayFeed` collision with `home-ops-tv-collab-surfaces-plan.md`: widen `MyDayFeed`/`MyDayInterrupt` additively (no new table, no breaking change to shipped `MyDayRail`); reuse the already-shipped `getInboxFeed()`/`staff_inbox_items`/`/api/inbox` pipeline as Today's subscription-sourced source, filtered to `active`; rename the frontend's proposed `TriageTask` to `TriageRow` to stay clear of that plan's unrelated `ops_plan_tasks` "Tasks" mode. See B3 phase section for the full design (source calls, field names, href-resolver fix via `searchHitHref`, category/state/assignee derivation rules). |
| 2026-08-01 | Claude (B0 design resolution) | Resolved B0's "aliases/dual-write" vagueness with a per-key table grounded in actual call sites (only 8 `recordOpsEvent` production callers, not ~20 — the earlier `ADJUSTED`/`SHIPPED`/`PICKED` examples were misattributed from the unrelated `inventory_events` log). Confirmed with file:line evidence that `UNBOX_CONFIRMED`/`TRACKING_SCANNED`/`UNBOX_SCAN_OPENED` have live SQL dependents (`build-sql.ts`, `unfound-queue/route.ts`, `journey.ts`, `support/context.ts`) that a rename would break — dual-write onto already-existing `receiving.carton.received`/`.arrived`/`.opened` keys is required for those three, not optional. Found a fourth, larger, previously-unnoticed gap: `recordEntitySignal()` always writes `event_type='signal_recorded'`, so order/fba_shipment/repair/warranty_claim signals produce zero notifications today — needs a read-side fix in `fanout-worker.ts`, not a write-side alias. See B0 phase section for the full table and the walked-back correction to the earlier "build the mapping, not aliases" framing. |
| 2026-08-01 | Claude (automated repo + external API pass) | Shape holds; B0/B2/B3 understate scope (pipe is inert / columns already dead / feed needs new DTO); B1 quietly reverses a documented prior exclusion; B8's single numeric threshold doesn't survive eBay (categorical) vs Amazon (pre-filtered report) — see findings above. Not a substitute for floor-lead / support sign-off. |

---

## Deferred

General email→ticket SMTP · SLA cron · auto-subscribe · outbound carrier subscribe crons · multi-provider messaging beyond slice · `triage_tasks` table · wiring `receiving.autoTicket` QA path
