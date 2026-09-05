# In-store channel exchange — Claude implementation plan

**Status:** Plan locked 2026-09-04 · **not started** (no product code for this visit type)  
**Created:** 2026-09-04  
**Slug:** `counter.channel_exchange`  
**Product name:** In-store channel exchange  
**Staff command:** Exchange  
**Customer copy:** Return & replace  
**First connector:** Ecwid (`channelReturn` capability — do not put “Ecwid” on customer-facing chrome)

**Related (compose, do not fork):**

- [`kiosk-counter-transaction-PLAN.md`](./kiosk-counter-transaction-PLAN.md) — D1 two records, D4 kiosk never charges, D7 two-key prior order
- [`kiosk-desk-session-channel-PLAN.md`](./kiosk-desk-session-channel-PLAN.md) — shared `/counter` ↔ tablet cart
- [`counter-square-enterprise-PLAN.md`](./counter-square-enterprise-PLAN.md) — Terminal after submit, SQ1 reconcile
- [`counter-visit-detail-surface-HANDOFF.md`](./counter-visit-detail-surface-HANDOFF.md) — visit read surface is **out of scope** (Sales Board + receipt API is enough for v1)

---

## Paste this into a Claude Code / Cursor session

```
Implement docs/todo/counter-channel-exchange-PLAN.md.

Product: in-store channel exchange. Customer bought on the online store
(Ecwid), walks in, returns that product, buys a replacement at the counter.
One visit: identify the channel order, upsert customers from the order,
refund/return on the channel API, sell replacement on Square, print the
CycleForge visit receipt.

DO
- One session, two faces: staff /counter?session= and tablet /kiosk|/kiosk/v2.
- Grow submitCounterTransaction. Do not invent a second intake orchestrator.
- Grow src/lib/ecwid/client.ts for get-order + refund/return. No raw
  app.ecwid.com fetches from product UI.
- Identity: order # + the identity phone (confirmOrderNumberForPhone). After
  confirm, fetch the full order and upsert customers (phone then email).
- Money: Ecwid refunds original tender. Square charges replacement RETAIL
  lines. Never refund an Ecwid charge through Square. Never use BUYBACK for
  a channel return (buyback = we purchase their device).
- Receipt: extend buildVisitReceipt with a Returned (online) section. Reuse
  GET /api/counter/visit/[id]/receipt. Do not invent a PDF pipeline.
- UI: add kiosk command exchange (KIOSK_SERVICES + KioskCommandId + session
  CHECK). Staff confirmation of refund is PIN / desk. Tablet collects
  order # + phone and shows a matched summary after step-up or on the desk.
- Migration: JSONB channel_return on counter_transactions (+ Drizzle in the
  same PR). enforce_tenant_isolation in the birth migration.
- Tests: unit tests on the Ecwid mapper, refund idempotency, customer upsert,
  receipt section. Domain tests: .claude/skills/domain-unit-test/SKILL.md.
- Graph: find_symbol → impact_analysis on submitCounterTransaction,
  confirmOrderNumberForPhone, buildVisitReceipt, createRepairCustomer before
  shared edits. CLI if MCP empty.
- UI: ds_contract + ds_tokens + ds_critique before any tsx write. Session
  stamp required. Mouth naming: not this feature. Center Lock: stay on the
  counter stage; no RightRailHost detail:ecwid; no Dialog as the visit plane.
- Before done: node $GARISEK_OS_ROOT/tools/eval-engineering/cursor-eval.mjs
  --root . --fast. Do not claim done on red.

DO NOT
- New pages /exchange, /ecwid-return, /customers CRM, /counter/visits/[id].
- Use /walk-in, /repair, /pickup, RMA, Unbox, receiving as the door.
- FilterRefinementBar, hunt tiles, new *GridRow / *_GRID_COLUMNS /
  *_SHEET_COLUMNS.
- Fold Queue/Viewed/History into any funnel. Delete overlay visibility /
  zIndex.panel. Invent Operator verdict.
- Searchable Ecwid customer directory on the unattended tablet.
- Require ecwidSync / transfer-orders as a synchronous stand prerequisite.
- Vendor nouns in customer copy. Standing keycaps. Cheat sheet from staff ?.
- Status-only PUT to REFUNDED if Slice 0 proved that does not move money —
  then outbox + honest “refund pending / mark in Ecwid admin” is required;
  do not lie that the card was refunded.
- Implement CX5 (serialized inventory returns) in the same PR as CX1–CX4
  unless the operator asks.

Ship CX0 → CX1 → CX2 → CX3 → CX4 in order. One PR can cover CX0+CX1;
refund write (CX2) must not land without the Slice 0 fixture proof.
```

---

## 0. The visit (one sentence)

A walk-in returns a product they bought on the **online store**, CycleForge **refunds that channel order through the connected API**, **hydrates the buyer into `customers`**, sells a **replacement on the counter (Square)**, and **prints the local visit receipt**.

Industry shorthand: **BORIS + exchange** (buy online, return in store, buy replacement). Not RMA, not POS-only return, not even-exchange-without-money unless Slice 0 forces it.

---

## 1. Verified against the tree (2026-09-04) — do not re-discover as if empty

| Piece | Path | What it already does | Gap for this use case |
|---|---|---|---|
| Staff door | `src/app/counter/page.tsx` — Sales → Counter, `walk_in.view`, `?session=` | Shared cart with tablet | No Exchange command; prior order is not loaded |
| Tablet door | `/kiosk`, `/kiosk/v2` | Commands: repair, retail, buyback, pickup | No `exchange` in `KIOSK_SERVICES` / `KioskCommandId` |
| Sales history | `/dashboard?mode=sales` | Front-desk history | Enough for v1 after submit |
| Walk-in URL | `/walk-in` | **Redirect shell** | Do not revive |
| Prior-order confirm | `confirmOrderNumberForPhone` in `src/lib/ecwid/client.ts` | Two-key match; returns public # only | Does not fetch person/lines; by design for kiosk |
| Staff order search | `GET /api/ecwid/order-search` | Rich **candidates** | **Forbidden on unattended tablet** |
| Order ingest | `mapEcwidOrdersToCanonicalLines` + `ecwidSync` | Batch → `orders` | Not on-demand at the stand |
| Customer match | `submitCounterTransaction` phone create-or-match via `createRepairCustomer` | Phone; typed name wins | Does not pull Ecwid person / `channel_refs.ecwid` |
| Visit write | `submitCounterTransaction` | Header + repairs + staged Square | `prior_order_ref` is a string; no refund |
| Receipt | `buildVisitReceipt` + `GET /api/counter/visit/[id]/receipt` | Retail + buyback + repair | No “Returned (online)” section |
| Invoice PDF | `fetchInvoicePdf` | Original Ecwid packing slip | Optional attach; **not** the in-store receipt |
| Cart lines | `KIOSK_LINE_TYPES`: RETAIL \| REPAIR \| BUYBACK | Pickup is a **command**, not a line | Do **not** add a fourth chargeable line type for the return |
| Connector settings | `/settings/integrations/ecwid` | Token in vault | Must have `update_orders` (and whatever Slice 0 proves for money) |
| Customers page | — | **None.** `GET /api/customers/[id]` + repair/walk-in search | Do not add `/customers` in this plan |

---

## 2. Pages Claude must use (IA)

**Do the work**

| Who | Route | Job |
|---|---|---|
| Staff | `/counter?session={id}` | Confirm match, pick returned SKUs, add replacement RETAIL, step-up refund, submit, print receipt |
| Customer tablet | `/kiosk` or `/kiosk/v2` | Command **Exchange**: order # + phone; show cart; never charge; never list search hits |
| After | `/dashboard?mode=sales` | Find the visit |
| Admin | `/settings/integrations/ecwid` | Connector |

**Do not add:** `/exchange`, `/ecwid-return`, `/counter/exchange`, `/customers`.  
**Do not use as the door:** `/walk-in`, `/repair`, `/pickup`, `/dashboard?mode=pickup|repairs`, warehouse RMA/Unbox.

Deep link after create: existing `/counter?session=` is enough.

---

## 3. Decisions locked

| # | Decision | Rationale |
|---|---|---|
| **X1** | **Visit type on the existing counter session**, not a new app. Command `exchange`. Same `submitCounterTransaction`. | Two write paths = fork (parent D5). |
| **X2** | **Two money movements.** Channel refunds original tender. Square charges replacement RETAIL. | Original card lives on Ecwid. Square cannot refund it. |
| **X3** | **Channel return is visit metadata, not a cart line.** Replacement SKUs are RETAIL. Do not use BUYBACK. Do not add `CHANNEL_RETURN` to `KIOSK_LINE_TYPES` / session line CHECK. | A fourth line type becomes a Square line or a silent total bug. Pickup is already a command-not-line precedent. |
| **X4** | **Identity: two-key confirm, then hydrate.** Reuse `confirmOrderNumberForPhone` with the **identity phone**. Then `getEcwidOrder`. Upsert `customers`: last-10 phone (org), else email, else create. Write `channel_refs.ecwid`. Typed counter name still wins if present. | Parent D7. Search list stays staff-only. |
| **X5** | **Ecwid writes only through `src/lib/ecwid/`.** Idempotent `refundAndReturnOrder({ orgId, orderRef, items, amountCents, reason, clientEventId })`. Persist result on `counter_transactions.channel_return`. Suffix idempotency `{clientEventId}-ecwid-refund`. | Replay must not double-refund. |
| **X6** | **Refund is staff-attended.** Tablet may collect keys; **desk or PIN step-up** fires the API. Same as D4 (kiosk never charges). | Money is privileged. |
| **X7** | **Local `orders` is not the refund SoT.** After refund, patch snapshot if a row exists **or** wait for next sync. Visit stores Ecwid internal id + public # + refund ids so desk does not depend on ingest lag. | Stand must work if transfer job is stale. |
| **X8** | **Outbox if Ecwid is down.** Visit may still stage Square replacement. Receipt must say refund pending until `channel_return.status = 'refunded'`. Never silent. | Parent already uses outbox for helpdesk. |
| **X9** | **Inventory (serial) is CX5, optional.** Compose `src/lib/inventory/returns.ts` only when a serial is scanned and `resolvePriorOutbound` hits. Commodity accessories skip serial. Do not block v1 on missing serial. | Warehouse RMA is a different job. |
| **X10** | **Customer-facing copy never says Ecwid.** “Online order”, “store order”, channel label from `sourcePlatformMeta` if a chip is needed. | Multi-tenant; Ecwid is the first connector. |

---

## 4. Ecwid money — Slice 0 is a gate, not optional research

Public REST v3 **lists no `POST /orders/{id}/refund`**. Refunds appear as a **read** array on GET order. Writes go through **`PUT /api/v3/{storeId}/orders/{orderId}`** (`update_orders`): `paymentStatus` (`REFUNDED` / `PARTIALLY_REFUNDED`), `fulfillmentStatus` (`RETURNED`), and possibly appending `refunds[]` (`source: API`, `amount`, `reason`).

**Whether PUT actually moves money depends on the payment module** (Ecwid Payments vs PayPal vs offline). Slice 0 must run against the **dogfood vault store** and record in the PR:

| Outcome | Product behavior |
|---|---|
| PUT (or documented refund call) returns money to the original tender | CX2 automates it |
| PUT only changes admin status | CX2 still writes status + fulfillment RETURNED, outbox a **staff task** “complete refund in payment processor”, receipt says **status updated — card refund may be manual** |
| Token lacks `update_orders` | Hard fail with settings CTA; do not fake success |

Do **not** implement CX2 until this matrix is in a test fixture + a short comment on the client function. Guessing a POST refund URL is forbidden.

Fulfillment: set returned / reduce line qty per what Slice 0 observes on GET after PUT. Partial line return is in scope (amount + item ids). Already-refunded / cancelled / unpaid → typed refusals: `NOT_REFUNDABLE`, `ALREADY_REFUNDED`, `PARTIAL_ONLY`.

---

## 5. Target architecture

```
Tablet /kiosk command=exchange          Desk /counter?session=
  order # + phone                         confirm + pick return lines
  (no candidate list)                     + replacement RETAIL cart
                \                         /
                 \                       /
              counter_sessions (draft)
                 prior_order_ref
                 channel_return (draft JSON)
                 customer phone/name/email
                 RETAIL lines = replacement only
                          |
                          v  staff submit (existing session submit)
              submitCounterTransaction(input, orgId)
                 1. confirmPriorOrder (existing)
                 2. getEcwidOrder + upsertCustomerFromChannelOrder  [NEW]
                 3. insertHeader + channel_return JSONB             [NEW col]
                 4. refundAndReturnOrder (idempotent) or outbox     [NEW]
                 5. stageSquareOrder(replacement RETAIL)            [EXISTING]
                          |
                          v
              GET /api/counter/visit/{id}/receipt
                 Returned (online) + replacement lines + Square tender
```

Principal-agnostic orchestrator stays one function. New deps on the existing `SubmitCounterTransactionDeps` fake in tests — do not hide network in the orchestrator body.

---

## 6. Schema

Birth migration (new file under `src/lib/migrations/`). `organization_id` already on the table. **Do not** default org in DDL.

```sql
ALTER TABLE counter_transactions
  ADD COLUMN IF NOT EXISTS channel_return jsonb NOT NULL DEFAULT '{}'::jsonb;
```

Shape (document in the migration header; validate in TS, not a dozen columns):

```ts
type ChannelReturnRecord = {
  provider: 'ecwid';           // discriminator for a later shopify
  ecwidOrderId: string;        // internal id
  publicOrderNumber: string;
  itemIds: string[];           // returned line ids
  amountCents: number;
  reason: string;
  status: 'none' | 'pending' | 'refunded' | 'failed' | 'manual_required';
  refundIds?: string[];        // processor / Ecwid refund ids if present
  error?: string;
  updatedAt: string;           // ISO
};
```

`'{}'` means no channel return (retail-only visit). Drizzle: same PR. Session draft: put the **working copy** on `counter_sessions` as `channel_return jsonb` **or** a versioned `session.channel_return_changed` event — pick **one**. Prefer a column on `counter_sessions` mirroring the header so the tablet and desk share it the same way they share customer phone (not a line row).

CHECK on `counter_sessions.active_command`: add `exchange`. Update Drizzle comment + `KioskCommandId` + `COUNTER_SESSION` check in lockstep (same PR).

---

## 7. Phases (implement in order)

### CX0 — Connector proof (no product UI)

**Files:** `src/lib/ecwid/client.ts` (+ tests), fixtures from a real GET order JSON (redact PII).

- `getEcwidOrder(orgId, orderRef)` → items, qty, totals, payment/fulfillment, billing/shipping person, email, phones, refunds[], internal id.
- Attempt refund/return write; record which call actually changed `refundedAmount` / processor.
- Typed errors. No UI.

**Done when:** unit tests cover map + refusal statuses; PR comment states the money matrix.

### CX1 — Hydrate identity (read path + desk confirm)

**Files:** ecwid client; `createRepairCustomer` / customer upsert (extend, don’t fork `customerRepository` if the counter path already uses `createRepairCustomer` — one helper `upsertCustomerFromChannelOrder`); `submitCounterTransaction` after successful confirm; Counter workspace + kiosk Exchange pane (collect keys + show **matched summary on desk**).

- After two-key confirm, fetch full order.
- Upsert `customers`, set `channel_refs`.
- Fill session customer name/email/phone from the order when the tablet fields are empty.
- Optional: if a local `orders` row exists, link `orders.customer_id`; do **not** block if missing.

**Done when:** staff can type order # + phone on `/counter` (or Exchange on kiosk → desk) and see buyer name/email/address without running transfer-orders. Receipt still v1 (cite `prior_order_ref` only) until CX3.

**UI law:** `ds_contract "counter exchange identify online order"`. Compact fields, DS `TextField`/`Button`. No native date. No FilterRefinementBar.

### CX2 — Channel refund write

**Depends on CX0.** Staff confirm of returned item ids + amount.

- `refundAndReturnOrder` + persist `channel_return`.
- Outbox + `manual_required` path.
- Step-up / desk-only route: e.g. `POST /api/counter/session/[id]/channel-return` **or** fold into session submit with `channelReturn` on `CounterTransactionInput`. Prefer **submit-time** so money and header share `clientEventId`. A pre-submit “preview refund” GET is fine; the write is submit.

**Done when:** tests prove replay does not double-call; failed Ecwid does not roll back a staged Square order if X8 says so (document the order of operations: **refund first, then stage Square**, or **stage then refund** — lock **refund first** so we do not charge replacement when we cannot accept the return. If refund `manual_required`, still allow replacement sale with receipt warning).

**Locked order:** confirm return → refund/status write → stage Square replacement. If refund hard-fails (`NOT_REFUNDABLE`), do not submit the visit.

### CX3 — Receipt

**Files:** `visit-receipt.ts`, `visit-receipt-html.ts`, tests.

- New section: Returned (online): public order #, titles/qty, refunded amount, status (refunded vs pending vs manual).
- Replacement RETAIL as today.
- Do not print voided lines (existing rule).
- Do not print BUYBACK for this.

Optional: link/embed original Ecwid invoice via `fetchInvoicePdf` as a **second** document, labeled original online receipt — not mixed into the Square tender block.

### CX4 — Front door

- `KIOSK_SERVICES` id `exchange`, `status: 'live'`, `welcome: true` (or false if portrait isn’t ready — then v2-only like buyback was; **prefer welcome true** so floor staff see it).
- `KioskCommandId` + session CHECK + `serviceIdToCommand`.
- `KioskExchangePane` composing existing catalog/retail add for **replacement** (clone Retail pane patterns, do not fork a second cart store).
- Desk: Exchange fields on `CounterWorkspace` / intake — order # already exists on kiosk counter pane; **desk must show matched lines + refund CTA**.
- Center Lock: overlays stay on the desk stage if you need a confirm list — `DeskStageOverlay` `fill="stage"`, not Dialog-as-record-plane.

### CX5 — Serial inventory (later PR)

Compose `returns` intake when serial scanned. Out of the first shippable slice.

---

## 8. API surface (add / grow)

| Method | Route | Notes |
|---|---|---|
| (grow) | existing counter session + submit | Carry `channelReturn` draft on session; submit runs CX2 |
| GET | `/api/counter/session/[id]/channel-order` **or** `/api/ecwid/orders/[ref]` | Staff-auth. Full order after two-key check. Pass order # + phone. Do **not** expose `/api/ecwid/order-search` to device principal |
| GET | existing `/api/counter/visit/[id]/receipt` | CX3 |
| POST | existing submit | CX2 inside orchestrator |

Device principal: may POST session customer + prior order keys; **must not** GET full order PII without staff session claim / step-up. Desk claimed session can fetch.

---

## 9. Files (expected)

| Area | Paths |
|---|---|
| Ecwid | `src/lib/ecwid/client.ts`, `client.test.ts`, new `channel-return.ts` if client.ts grows too far |
| Counter domain | `counter-transaction-types.ts`, `submit-counter-transaction.ts` + test, `visit-receipt.ts` + html + test, `session-events.ts` / `session-store.ts` if session column |
| Customer | `src/lib/neon/customer-queries.ts` or small `upsert-from-channel-order.ts` |
| Migration + Drizzle | `src/lib/migrations/2026-09-04*_counter_channel_return.sql`, `schema.ts` |
| Kiosk | `src/lib/kiosk/services.ts`, `kiosk-session-store.ts`, `KioskModeSpine` (data-driven off `KIOSK_SERVICES` — follow that), new `KioskExchangePane.tsx`, wire in `kiosk/page.tsx` + `KioskShell` |
| Desk | `CounterWorkspace.tsx` / `CounterIntakeForm.tsx` |
| Session CHECK | migration altering `counter_sessions_active_command_chk` |

Do **not** touch slot-table engine, UnshippedTable, DataTableFilterMenu, or PRODUCT_TABLES unless a desk table is required (it is not).

---

## 10. Tests

- `confirmOrderNumberForPhone` unchanged contract (null on mismatch; no extra PII).
- `getEcwidOrder` mapper: person, items, refunds.
- `refundAndReturnOrder` idempotency + each refusal.
- `upsertCustomerFromChannelOrder`: phone hit, email hit, create, `channel_refs` merge not clobber.
- `submitCounterTransaction`: channel_return persisted; Square lines exclude return qty; refund-first abort.
- `buildVisitReceipt`: returned section present/absent; pending copy.
- Session command `exchange` accepted by CHECK (migration test or store test).

No screenshot baselines. No e2e as the **gate** for CX0–CX1; optional Playwright later for desk confirm.

Eval: `cursor-eval.mjs --root . --fast`. Full verify before merge to main. **Not** `eval:cohort slot-table` unless you violate §9. **Not** `eval:cohort shortcuts` unless you add `?` / TableStatusBar hotkeys (don’t; no standing keycaps on Exchange).

---

## 11. Graph + design (hooks will deny otherwise)

**Graph (before shared edits):**

- `submitCounterTransaction`
- `confirmOrderNumberForPhone`
- `buildVisitReceipt`
- `createRepairCustomer`
- `KIOSK_SERVICES` / `KioskCommandId`

**Design (before tsx):**

- `ds_contract "counter exchange identify online order"`
- `ds_contract "staff reaction on the composer"` — **do not** use; this is not a scan mouth. Feedback on desk = existing counter submit result + receipt, not `WeldedFeedbackPanel` unless you are on `StationComposerHost` (you are not).
- `ds_tokens` radius + color (surface) for any new pane.
- `ds_critique` on every edited tsx.

---

## 12. Permissions

- UI: `walk_in.view` (same as `/counter`).
- Channel write: staff session + existing counter submit auth. Do not grant device principal `integrations.ecwid` as a fishing surface.
- Settings token: `integrations.ecwid` for connecting the store.

---

## 13. Out of scope (explicit)

- Shopify / Square Online as a second `provider` (discriminator is ready; no adapter).
- Store credit instead of original-tender refund.
- Even exchange with $0 Square when prices match (nice follow-up; v1 still charges replacement and refunds original unless operator later asks to net).
- `/customers` CRM, visit detail EntityStationPane (SQ5).
- RMA / warranty / repair drop-off.
- Lowering Lighthouse floors.

---

## 14. Acceptance (v1 shippable)

1. Staff on `/counter` (with or without paired tablet) completes: match Ecwid order by # + phone → customer row exists with email/phone/name from Ecwid → returned lines recorded → channel refund **or** honest `manual_required` → replacement RETAIL charged on Square Terminal path → receipt shows both halves.
2. Unattended tablet never receives an order candidate list.
3. Double-submit does not double-refund.
4. `verify:fast` green. No new GRID/SHEET arrays. No new top-level route except APIs listed in §8.
