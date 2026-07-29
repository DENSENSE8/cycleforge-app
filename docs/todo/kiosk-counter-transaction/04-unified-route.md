# Phase 04 — the unified write path

**Lane:** `kiosk-join` (reuse) · `topic/kiosk-join` · port 3160
**Wave:** B — **do not dispatch until Phase 03 is merged**
**Depends on:** 03 (needs `counter_transactions` + the contract types). 01 must also be merged before any sales write **ships**.
**Blocks:** Phase 05
**Parent:** [`../kiosk-counter-transaction-PLAN.md`](../kiosk-counter-transaction-PLAN.md) §2 + §5 Phase 4 · [`00-INDEX.md`](./00-INDEX.md)

---

## Goal

One device-authed write path that stages a counter transaction: identity → header → repair (optional) → staged sale (optional) → ticket work.

## The one rule that matters most

**`submitCounterTransaction` MUST compose `submitRepairIntake`, never re-inline it.**

`src/lib/repair/submit-repair-intake.ts` was extracted specifically so the staff route (`/api/repair/submit`, `withAuth` + `repair.intake`) and the device route (`/api/kiosk/repair/submit`, `withKioskAuth`) share **one** principal-agnostic, org-scoped create path and can never drift. Copying its logic into the orchestrator recreates the exact fork it exists to prevent. Read its header before writing a line.

The orchestrator is itself principal-agnostic and org-scoped — a staff caller and a device caller invoke the identical helper.

## Target shape

```
POST /api/kiosk/intake            ← the ONE device-authed write path
  └── submitCounterTransaction(input, orgId)     ← new, principal-agnostic
        ├── resolveCounterCustomer()             ← deterministic identity (below)
        ├── counter_transactions INSERT          ← header + idempotency anchor
        ├── submitRepairIntake(...)              ← COMPOSED, unmodified
        ├── stageSquareOrder(...)                ← Square /orders — STAGED, never charged
        └── enqueueTicketWork(...)               ← Phase 03's outbox
```

## Scope

### 1. Grow the existing route, don't replace it

`src/app/api/kiosk/intake/route.ts` is an audit-only stub today and **its own header declares the seam**: *"SEAM (doc 03): the real intake persistence + Square/Zoho/Ecwid capability-facade calls replace the audit-only body below."*

**Keep** its Zod body, its `resolveKioskStepUp` PIN step-up, and its device-as-`via` audit contract (`actorStaffIdOverride` = stepped-up staff or null; the device is always the `via`). Replace only the audit-only body. That auth contract is proven and is the strong part of this system.

### 2. Identity — deterministic only

Phone unlocks create-or-match via the existing `findOrCreateRepairCustomer`. Prior orders reveal **only** on Order # + phone match, resolved through `GET /api/ecwid/order-search`.

**No searchable customer list on the kiosk.** The device principal is unattended-capable: every readable field is readable by a stranger, which is why `kioskMode` already suppresses customer search. Persist the resolved public order number to `counter_transactions.prior_order_ref`.

Known hazard, do not make it worse: `findOrCreateRepairCustomer` matches phone → **name** → create. A bare name match merges two different "John Smith"s. Do not extend name matching here; if you need a stronger key, report it rather than widening the match.

### 3. Staged sale — never charge

Create the Square order via `squareFetchForOrg(orgId)` and **stop**. Payment completes on a physical Terminal or behind a staff PIN step-up (Phase 05). Never enter or accept card data in-app, under any framing.

### 4. Idempotency across every sub-write

Thread the client's `Idempotency-Key` into `counter_transactions.client_event_id`; the unique index from Phase 03 is the guard. A replayed submit must not double-charge, double-ticket, or double-repair.

### 5. Partial failure

| Case | Required behavior |
|---|---|
| Repair declined, retail bought | Header carries no `repair_service` link |
| Payment ok, repair insert fails | Header stays `partially_paid`, reconcilable |
| Helpdesk down | Outbox absorbs it; counter is never blocked |
| Any sub-write fails | Signed agreement survives (`ON DELETE SET NULL`) |

### 6. Retire the sibling route — in THREE steps, not one

`/api/kiosk/repair/submit` is the **only live kiosk write path** today. Deleting it in the same change that builds its replacement takes repair intake down before the new path is proven.

1. Unified route live and passing.
2. `src/app/kiosk/page.tsx` repointed (Phase 05).
3. *Then* delete `src/app/api/kiosk/repair/submit/route.ts`.

Steps 1–2 land here and in 05. **Step 3 is the last commit of Phase 05, not this phase.**

## Do NOT

- Edit `src/lib/repair/submit-repair-intake.ts`.
- Delete `/api/kiosk/repair/submit` in this phase.
- Charge a card, mint a payment link, or collect card data.
- Import Zendesk/Square/Ecwid modules directly — capability facades only.
- Ship a sales write before Phase 01 is merged.

## Acceptance

- [ ] `submitCounterTransaction` composes `submitRepairIntake` unmodified
- [ ] `/api/kiosk/intake` keeps device principal + PIN step-up + `via` audit
- [ ] Repair-only, retail-only, and combined transactions all persist correctly
- [ ] Replayed `Idempotency-Key` is a no-op
- [ ] Prior order attaches only on Order # + phone
- [ ] Sale is staged, never charged
- [ ] `/api/kiosk/repair/submit` still works
- [ ] `npm run verify` green

## Verify

```bash
npm run verify
```

DB-free `Deps`-injection unit tests for the orchestrator covering all four partial-failure rows and the idempotent replay. E2E asserts against the **QA org** (`qa-desktop`), never the dogfood tenant.
