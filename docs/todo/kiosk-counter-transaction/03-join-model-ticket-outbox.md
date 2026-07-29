# Phase 03 — join model + ticket outbox

**Lane:** `kiosk-join` · `topic/kiosk-join` · port 3160
**Wave:** A — dispatch immediately, parallel with 01 and 02
**Depends on:** nothing
**Blocks:** Phase 04 (the orchestrator writes the table this phase creates)
**Parent:** [`../kiosk-counter-transaction-PLAN.md`](../kiosk-counter-transaction-PLAN.md) §3 + §5 Phase 3 · [`00-INDEX.md`](./00-INDEX.md)

---

## Goal

Land the `counter_transactions` join table, make a repair a first-class ticket anchor, and stop losing helpdesk tickets when Zendesk is down.

## Why two records, not one order

Locked decision (parent §1 D1): a counter visit produces a `counter_transactions` **header** joining a `square_transactions` receipt and a `repair_service` work record — never one mixed-line order. `repair_service` is a long-lived state machine (5-business-day SLA via `addBusinessDays`, work assignment, tech verdicts, signed agreement); a Square order is a financial snapshot. Overloading a financial line with a 10-day hardware lifecycle fights `transition()`.

## Scope

### 1. `counter_transactions`

Migration `2026-07-29c_counter_transactions.sql`. **The DDL is already written — copy it from parent plan §3 verbatim** and follow `.claude/rules/polymorphic-tables.md`: named CHECK on `status`, org-led indexes, `organization_id UUID NOT NULL` with no DEFAULT, `enforce_tenant_isolation('counter_transactions')` in this same migration, Drizzle model in this same PR.

Two details that are load-bearing, not stylistic:

- **`client_event_id` + `ux_counter_transactions_client_event`** is the idempotency anchor for the *whole* transaction. The kiosk already mints a `safeRandomUUID()` per submission and re-sends it on retry (`src/app/kiosk/page.tsx`); house precedent is `UNIQUE(client_event_id)` on `inventory_events`. A counter transaction charges money — this must hold across every sub-write, not just the Zendesk call.
- **`ON DELETE SET NULL` on both child links, never CASCADE.** A signed intake agreement must survive deletion of its transaction header. Deleting a header must never delete the legal record of what the customer signed.

### 2. Extend the ticket anchor union

`src/lib/support/ticket-link.ts` — `TicketLinkAnchorInput` is currently:

```ts
| { type: 'receiving'; receivingId: number; lineId?: number | null }
| { type: 'tracking'; trackingNumber: string }
| { type: 'shipment'; shipmentId: number }
| { type: 'order'; orderId: number }
```

Add `repair`. Note `ticket_links.entity_type` is deliberately **unconstrained free text** and its schema comment already lists `'REPAIR'` among eleven live values — the value is representable today, just unreachable through the typed API. So this is a typed-surface extension, not a data change.

Repair is the **anchor** (one per ticket, `ux_ticket_links_ticket_primary`); the sale and prior order are **references**. Helpdesk owns communication; the internal DB owns status.

### 3. Ticket outbox

`src/lib/repair/submit-repair-intake.ts:256` wraps the Zendesk call in `try/catch` that logs and continues. A helpdesk outage produces a repair with `ticket_number = NULL` and **no retry, no reconciliation surface**. Not blocking the counter is correct; having no compensating mechanism is not.

Build a transactional outbox on the existing precedent — read `src/lib/search/search-outbox-worker.ts` and `entity_search_outbox` and follow that shape. **Do not add a message bus or a new queue service.**

Cover: create-a-ticket, attach-an-existing-ticket, and post-a-reply. Replies go through the helpdesk capability facade (`getHelpdeskProvider`), never a direct Zendesk import in product code.

### 4. Land the contract types FIRST — unblocks Phase 05

**Do this in your first commit, before the migration.** Export `CounterTransactionInput` / `CounterTransactionResult` from a types module. Phase 04 implements them; Phase 05's form builds against them in parallel instead of waiting two waves. Report the moment they land so 05 can be dispatched early.

## File ownership

**Yours:** the migration, `src/lib/support/ticket-link.ts`, the new outbox module, the new contract-types module, and **a NEW appended `counterTransactions` block** in `src/lib/drizzle/schema.ts`.

**Phase 02 is editing the `skuCatalog` and `platformListings` blocks in that same file.** Append only — touch **no existing line** — and the merge is clean.

## Do NOT

- Edit `src/lib/repair/submit-repair-intake.ts`. Phase 04 *composes* it. It is read-only in every phase — that helper exists so the staff and device paths cannot drift.
- Write `ticket_links` rows directly from product code; go through `ticket-link.ts`.
- Build the route or the orchestrator — that is Phase 04.
- Touch `square_transactions` beyond adding the nullable `counter_transaction_id` FK column.

## Acceptance

- [ ] `counter_transactions` exists per parent §3, tenant-from-birth, modeled in Drizzle
- [ ] `ON DELETE SET NULL` on both child FKs
- [ ] Idempotency unique index present
- [ ] `TicketLinkAnchorInput` accepts `repair`
- [ ] Outbox handles create / attach / reply with retry; helpdesk failure never blocks
- [ ] Contract types exported and reported early
- [ ] `npm run verify` green

## Verify

```bash
npm run verify
```

DB-free `Deps`-injection unit tests for the outbox (fake helpdesk that fails, then succeeds on sweep). **Applying the migration is ask-first.**
