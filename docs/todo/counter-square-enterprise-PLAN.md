# Counter × Square — enterprise integration for sales AND repair, on the POS stand

**Status:** plan, nothing built · **Created:** 2026-08-21
**Builds on:** [`kiosk-desk-session-channel-PLAN.md`](./kiosk-desk-session-channel-PLAN.md) (the shared session, P0–P8 shipped) ·
[`kiosk-counter-transaction-PLAN.md`](./kiosk-counter-transaction-PLAN.md) (D1 two linked records, D4 stage-never-charge).

---

## 0. What already exists (verified 2026-08-21, not assumed)

More than the ask implies. **This is an integration to FINISH, not to start.**

| Piece | State |
|---|---|
| Per-org Square credentials | **Live.** `squareFetchForOrg(orgId, …)` resolves a Nango-managed token per tenant, env as fallback. Multi-tenant-ready. |
| Square **Terminal** (the POS stand) | **Live but orphaned.** `/api/walk-in/terminal/devices` + `/api/walk-in/terminal/checkout` already speak the Terminal API. |
| Order staging | **Live.** `stageOrder()` creates a Square Order from cart lines (catalog line by `catalog_object_id`, manual line by name + amount). Stages, never charges (D4). |
| Payment webhook | **Live.** `payment.completed` → writes a `square_transactions` row. |
| Repair payment | **Live but different.** `/api/repair/square-payment-link` — a payment LINK, not the stand. |
| One visit → both records | **Live.** `submitCounterTransaction` writes `repair` *and* `sale` under one `counter_transactions` header. |

## 1. The four gaps that make it not enterprise-grade

**G1 — the reconciliation loop is open. A paid counter visit never links back to its header.**
`counter_transactions.staged_square_order_id` exists precisely so the webhook can find the header (its own migration comment says so). **Nothing reads it** — the only references are the writer and its tests. So the webhook writes a `square_transactions` row keyed by `square_order_id`, `square_transactions.counter_transaction_id` stays NULL, and the visit is never marked paid. This is the highest-value fix in the plan and the most self-contained.

**G2 — the Terminal is unreachable from a counter session.** The two Terminal routes are `/walk-in`, gated `withAuth` + admin-origin, and take a raw `order_id`. Nothing connects them to a session, so `kioskSessionStore.awaitingCardSinceMs` — the "waiting for card" state the customer face already renders — is driven by nothing.

**G3 — the device id is a global env var.** `SQUARE_TERMINAL_DEVICE_ID` / `SQUARE_DEVICE_ID`. One counter per deployment. A tenant with two lanes, or two tenants on one deploy, cannot work — and the kiosk already has a per-org device table (`kiosk_devices`) that is the obvious home for a paired Terminal.

**G4 — two payment UX for one visit.** Retail stages an Order for the stand; a repair sends a payment link. A customer buying a cable and dropping off headphones pays twice, two different ways.

Plus the open edge from the session plan: **a second REPAIR line is silently dropped** (`extraRepairCount` has no consumer). One visit, one repair record, no warning.

## 2. Phases

### SQ1 · Close the reconciliation loop (G1)

**Status: DONE 2026-08-21 — 12 tests green.** Built: `src/lib/counter/reconcile-payment.ts` (+ tests), wired
into `/api/webhooks/square` after the `square_transactions` insert.

`counter_transaction_id` **already existed** on `square_transactions` — the column was provisioned and never
written. So this was a missing reader, not a schema change.

**Two rules carry it:**

- **A settled visit never walks backwards.** Square redelivers, and it can deliver a partial payment's event
  *after* the one that completed the sale. A naive "set status from this payment's amount" would move a paid
  visit to `partially_paid` on redelivery. `status === 'paid'` short-circuits before any write.
- **An unknown order is a normal outcome, not a failure.** A sale rung up directly on the Square stand has no
  counter visit; it must still keep its `square_transactions` row. That is `no_staged_header`, returned — never
  thrown. The webhook call is additionally wrapped so a reconciliation fault cannot cost the sale record or the
  realtime publish.

**The link runs on every delivery, deliberately** — the UPDATE is a no-op when it already points at the header,
and it repairs rows written before this reader existed. Settlement uses `>=`, not `===`: tips and
terminal-collected tax make `paid > staged` routine.

`statusForPayment()` is exported and pure because it is the rule people will argue about later, and an argument
is easier to settle against a test than against a SQL statement.

### SQ2 · Terminal checkout as a counter-session verb (G2)

**Status: DONE 2026-08-21 — 104 tests green.** Built: migration `2026-08-21a_counter_sessions_terminal.sql`
(+ Drizzle) · `terminal-checkout.ts` · `startTerminalCheckout` / `resolveTerminalCheckout` ·
`session.payment_changed` on the bridge · `POST …/{id}/checkout` · `terminal.checkout.updated` in the webhook ·
the tablet mirror now feeds `awaitingCardSinceMs`.

**Sequenced AFTER submit, and that is the load-bearing decision.** The kiosk stages an order and never charges
(D4), so the Square order a Terminal checkout collects for does not exist until `submitSession` has run.
Prompting the stand first would mean inventing a second, unstaged order and charging for something no record
describes. `NOT_SUBMITTED` is the refusal.

**`approved` is the DEVICE's answer, not the money's.** A Terminal approval and a settled payment arrive on two
different webhooks; only `payment.completed` moves `counter_transactions.status` (SQ1). Keeping them apart is
what stops a visit reading as paid because a stand said OK — a session can sit `approved` but not yet `paid`,
and that is correct, not a bug.

**Refusals that matter:** a second prompt while one is live (`ALREADY_AWAITING_CARD` — that is how a card gets
charged twice), a repair-only visit with nothing staged (`NO_STAGED_ORDER`), a device principal trying to
summon a prompt (`DEVICE_FORBIDDEN`), and Square saying no (`TERMINAL_REFUSED`, 502 — the request was fine,
the provider refused it). A refused checkout writes nothing and does not move the version.

**An unknown Terminal status holds at `awaiting_card`** rather than guessing `declined`, which would put the
cart back in front of a customer whose card may well have gone through. Outcomes are final: a redelivered
`awaiting_card` never reopens a settled prompt.

**`terminalCheckoutId` is deliberately NOT in the device projection** — it is a handle into the tenant's Square
account and the tablet has no use for it. Pinned by the D6 allowlist test.

**Still env-global (G3):** `SQUARE_TERMINAL_DEVICE_ID` is read in the ROUTE and nowhere else, so SQ3 deletes
one fallback rather than hunting env reads through the domain.

### SQ3 · Per-org, per-lane Terminal pairing (G3)

**Status: DONE 2026-08-21 — 110 tests green.** Built: migration `2026-08-21b_kiosk_devices_terminal.sql`
(+ Drizzle) · `terminal-device.ts` (the one resolver) · `setKioskDeviceTerminal` ·
`PATCH /api/kiosk/devices/terminal` · a Card-reader column in Settings → Kiosk devices.

**Which reader sits at which counter is TENANT data, not deployment config.** `SQUARE_TERMINAL_DEVICE_ID` meant
one stand per deployment: a shop with two counters could not run both, and two tenants on one deploy would send
each other's customers a card prompt. It now lives on `kiosk_devices`, beside the tablet facing the customer
across the same counter — one iPad, one reader, one lane.

**Resolution order, and why the env is last:** an explicit override (staff at the counter naming a reader —
that outranks configuration) → the lane's paired stand → the deployment env, kept only for single-counter shops
that never opened the pairing UI. Nothing anywhere → the route answers `NO_TERMINAL_PAIRED` (422).

**A cleared pairing is a decision, not an unset.** A cash-only lane must NOT inherit the deployment's reader, or
it starts prompting a card at another counter. That is why clearing is representable and why the fallback is
consulted only when the lane never had one.

**SQ2 paid off here:** it read the env in the route and nowhere else, so this phase deleted one fallback
instead of hunting env reads through the domain. The resolver also reports its `source`, so the checkout audit
records *which* reader took the card and whether it came from the lane or the fallback.

Not a foreign key: the id is Square's, for a device this database has no row for.

### SQ4 · One payment for a mixed visit (G4)
A repair line joins the staged Order as a line item (deposit or full — **product decision, see §3**), so one card presentation settles the whole visit and the repair's own payment link is reserved for pay-later.

### SQ5 · The detail surface, ported from Unbox
"View the exact details and process it better" = compose the station SoTs rather than a new twin: `EntityStationPane` with `stance: 'preview'` for the read view, `CartonContextCard` as the identity header, `StationDisplaysPushColumn` for the leaves. `pattern-evolution.md` §5 is explicit that a read surface composes the SAME assembly in a declared stance — the `/search` 1001-line hand-rolled twin is the anti-pattern this avoids.

### SQ6 · Multi-repair (the silent drop)

**Status: DONE 2026-08-21 — full `npm run verify` green (6,322 unit tests).** No migration was needed:
`repair_service.counter_transaction_id` is a **many→one** link and `counter_transactions` has no repair column,
so N repairs per visit was always schema-supported. The 1:1 lived only in the mapper and the orchestrator.

`service` → `services[]` end to end: types, mapper, orchestrator loop, wire contract, session-store, ledger,
intake form, repair pane, and every test. The singular field was **removed, not aliased** — an alias is a silent
opt-out every unvisited call site takes (`backend-patterns.md`), and removal made the compiler name all six
sites, including the desk lane that lost a device with no warning at all.

**Three defects found and fixed that were NOT the reported one:**

1. **`KioskRepairPane` overwrote device #1.** Selecting a second product fell back to `repairs[0]`, so the first
   device's serial, issues and signature were destroyed *before submit ever ran* — a worse loss than the
   mapper's, because it discarded data the customer had already given. A different model is now a new line.
2. **`visit-triage` blocked the visit** ("Only one repair per visit — remove N extra"). That cap existed only
   because submit dropped the extras; refusing the visit was the least-bad option. Removed — each device still
   raises its own per-line blockers, so nothing is under-checked.
3. **The wire rename silently stripped the old key.** `BodySchema` was a plain `z.object`, which *discards*
   unknown keys: a tablet on the old build posting `serviceLine` parsed to `{}` and staged a retail sale with
   the customer's device recorded **nowhere**, behind a success screen. Now `.strict()`, with a distinguishable
   `STALE_CLIENT` answer so the operator is told to reload rather than seeing "Transaction failed".

**Validation was hoisted above the first write.** Validating inside the loop made the outcome depend on cart
ORDER: `[invalid, valid]` threw *after* `insertHeader`, so an orphan header owned the visit's `client_event_id`
forever and the retry short-circuited — the valid device was never recorded. `[valid, invalid]` returned 200
with the error downgraded to a warning. Both are gone; the rule itself is **imported** from
`submitRepairIntake` (`missingRepairIntakeFields`) rather than copied, so the two cannot drift.

**Per-device idempotency:** the repair key is `${clientEventId}:${index}` and the outbox key
`${clientEventId}:${repair.id}` — a shared visit key would collapse a two-device drop-off onto one helpdesk
ticket. Replay safety is unchanged and rests on one ordering: `findHeaderByClientEvent` → early return →
`insertHeader` → the loop. **Never move staging or the loop above `insertHeader`.**

**Partial failure:** device 2 failing leaves device 1 logged and names which device failed, rather than
reporting the whole visit as failed while the customer's property sits in the system.

## 3. Decisions I cannot make for you

1. **Does a repair get charged at drop-off?** Full price, a deposit, or nothing until pickup? This decides SQ4 entirely, and it is a business rule, not an implementation detail.
2. **Two repairs in one visit** — block, or model N repairs per header (a real schema change)?
3. **Terminal pairing granularity** — one Terminal per kiosk device, or a lane picker at checkout?
