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

### B0 — Event vocabulary bridge

| Problem | Live emitters use `TRACKING_SCANNED` / `UNBOX_CONFIRMED`; `NOTIFIABLE_EVENTS` expects dotted keys; `shipment` is non-notifiable |
| Fix | Aliases/dual-write + tests in `event-vocabulary.ts` |
| New keys | `shipment.status.*`, `support.ticket.*`, `marketplace.message.*`, `marketplace.feedback.*` |
| Entity | Allow `shipment` = STN id; messages/feedback prefer `order` (then ticket) |

**Validate:** Does dual-write break receiving SQL that depends on legacy event names?

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

### B3 — Unified triage feed API

Extend `aggregateMyDayFeed` with `TriageTask` DTO + server filters (`urgent`, `assignee`, `category`, `state`).

Categories: `unbox | repair | pack | ship | support | fba | tracking | messaging | feedback | other`

**Bug to fix:** `my-day-href` uses `/support?ticketId=`; Support reads `?ticket=`.

**Validate:** One feed vs separate Today + Inbox APIs? Category list complete for dogfood?

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

**B0 — worse than "bridge a mismatch."** `NOTIFIABLE_EVENTS` (`src/lib/notifications/event-vocabulary.ts`) only defines dotted keys; every live `recordOpsEvent` emitter in production uses SCREAMING_SNAKE (`UNBOX_CONFIRMED`, `TRACKING_SCANNED`, `ADJUSTED`, `SHIPPED`, …). Zero production emitters use a dotted key today, so `fanout-worker.ts`'s `notifiableEvent()` currently drops **every** real event — the pipe is fully inert, not partially aliased. Treat B0 as "build the mapping," not "add aliases." `shipment`/`other` are confirmed non-notifiable (`NON_NOTIFIABLE_ENTITY_TYPES`).

**B1 — reverses a documented decision; do so explicitly.** `staff_subscriptions`/`staff_inbox_items`'s entity-type CHECKs (`2026-07-28c/d` migrations) deliberately excluded `'shipment'` because "there is no shipments parent table" — but `shipping_tracking_numbers` is a real parent table (`updateShipmentSummary` writes to it). Adding `shipment` is legitimate pattern evolution, but the migration should say it's reversing that specific prior call, not just extending. Also: `event-vocabulary.test.ts` regex-pins `NOTIFIABLE_ENTITY_TYPES` against the migration's literal CHECK text — must update in lockstep or the test breaks on a correct change. `updateShipmentSummary` fires on both push and poll paths and currently never calls `recordOpsEvent` — confirmed gap, straightforward to close.

**B2 — the aspirational columns already exist and are dead.** `match_sku`/`match_platform`/`match_severity_min` columns + a partial index already exist on `staff_subscriptions`; `resolveRecipients()` in `fanout-worker.ts` never references them. This is "wire up dead columns," not "add columns." The Ably channel shape (`org:{org}:inbox:{staff}`) is already named in the `2026-07-28d` migration's own header comment — B2 implements a documented target, it doesn't need to invent one.

**B3 — closer to a new DTO than an extension.** `aggregateMyDayFeed` takes no filter params today; `MyDayInterruptKind` is a closed 3-value union, nowhere near the plan's 10-category list. Budget B3 as a new aggregation path, not a parameter add. The `my-day-href` bug is **confirmed real**: `interruptHref()` sets `ticketId`; Support reads `?ticket=` — the link silently opens Support with nothing selected.

**B7 — correct "dead stub" to "dead code."** `EbayClient.fetchUnreadMessages` is a complete, working implementation against eBay's Commerce Message API with zero call sites — resurrecting it is cheaper than the plan implies. **External finding:** eBay's Notification API ([overview](https://developer.ebay.com/api-docs/commerce/notification/overview.html), [topics](https://developer.ebay.com/develop/api/buy/notification_events)) has a live `NEW_MESSAGE` topic — eBay-first with a real **webhook** subscription is viable, not poll-only as the plan's phrasing ("poll **or** webhook") leaves open. Recommend webhook.

**B8 — `createSupportTicket` is a sibling, not the sole path; and "threshold" doesn't hold across providers.** At least 7 other call sites create tickets directly (`zendesk/tickets/route.ts`, `photo-ticket/route.ts`, `receiving/zendesk-claim/route.ts`, `unfound-queue/.../push-to-zendesk/route.ts`, `threads/escalate.ts`, `support/ticket-outbox.ts`, `receiving/claims-escalation.ts`) — B8 should name which existing path it parallels, since "never invent a second create path" is already unenforced today. **External finding, answers open question #2:** eBay feedback ([Trading API FeedbackInfoType](https://developer.ebay.com/devzone/xml/docs/reference/ebay/types/FeedbackInfoType.html)) is **categorical** — `CommentType` = Positive/Neutral/Negative, no numeric star score for basic feedback (a separate `FeedbackRatingStar` exists only for detailed seller ratings, a different metric). eBay also exposes a real webhook topic, `FEEDBACK_RECEIVED`. Amazon's `GET_SELLER_FEEDBACK_DATA` report is the opposite shape: **poll-only** (a report, no webhook) and is **pre-filtered server-side to 1–3 star / negative+neutral feedback only** — Amazon does the "bad" filtering for you but on a pull cadence. **Conclusion: there is no single numeric "threshold" setting that works across providers** — `support.badFeedbackThreshold` needs a per-provider-shape adapter (eBay: enum ≤ Neutral vs ≤ Negative; Amazon: report ingest is already bad-only, so the "threshold" is really just on/off) rather than one number in the settings registry.

**Minor, pre-existing, not blocking:** `support_ticket_assignments` is a real, actively-used table but isn't modeled in Drizzle (a pre-existing `polymorphic-tables.md` rule-8 gap, unrelated to this plan).

Sources: [eBay Notification API overview](https://developer.ebay.com/api-docs/commerce/notification/overview.html) · [eBay Notification Topics](https://developer.ebay.com/develop/api/buy/notification_events) · [eBay FeedbackInfoType](https://developer.ebay.com/devzone/xml/docs/reference/ebay/types/FeedbackInfoType.html) · [Amazon SP-API Performance Reports (GET_SELLER_FEEDBACK_DATA)](https://developer-docs.amazon.com/sp-api/docs/report-type-values-performance) · [Amazon SP-API Notifications API](https://developer-docs.amazon.com/sp-api/docs/notifications-api)

---

## Validation log

| Date | Who | Result |
|---|---|---|
| 2026-08-01 | Claude (automated repo + external API pass) | Shape holds; B0/B2/B3 understate scope (pipe is inert / columns already dead / feed needs new DTO); B1 quietly reverses a documented prior exclusion; B8's single numeric threshold doesn't survive eBay (categorical) vs Amazon (pre-filtered report) — see findings above. Not a substitute for floor-lead / support sign-off. |

---

## Deferred

General email→ticket SMTP · SLA cron · auto-subscribe · outbound carrier subscribe crons · multi-provider messaging beyond slice · `triage_tasks` table · wiring `receiving.autoTicket` QA path
