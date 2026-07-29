# Phase 01 — `square_transactions` tenancy contract (THE GATE)

**Lane:** `kiosk-tenancy` · `topic/kiosk-tenancy` · port 3140
**Wave:** A — dispatch immediately, parallel with 02 and 03
**Depends on:** nothing
**Blocks:** shipping any kiosk sales write (Phase 05's `sales: 'live'` flip)
**Parent:** [`../kiosk-counter-transaction-PLAN.md`](../kiosk-counter-transaction-PLAN.md) §5 Phase 1 · [`00-INDEX.md`](./00-INDEX.md)

---

## Goal

Make `square_transactions` genuinely tenant-isolated so a kiosk sales write cannot leak across orgs.

## Start here — a correction that changes the work

**`square_transactions.organization_id` ALREADY EXISTS.** It was added by `src/lib/migrations/2026-06-14_org_id_phase_b_needs_col.sql` (a `DO $$` loop over `needs_col_tables` containing `square_transactions`, running `ALTER TABLE %I ADD COLUMN organization_id uuid`, then backfilling to USAV and setting a GUC default).

**The comment at `src/lib/neon/square-transaction-queries.ts:5-10` says the column does not exist. That comment is stale and wrong.** Do not act on it. Deleting it is part of this phase.

Read the header of `2026-06-14_org_id_phase_b_needs_col.sql` — it lists the exact four follow-ups this phase implements.

## The four follow-ups

### 1. Thread `orgId` through the session-less webhook writer

`src/app/api/webhooks/square/route.ts` calls `insertSquareTransaction` with no session, so the GUC is unset and the column defaults to NULL. The route **already resolves the org** via `resolveWebhookOrgForSquareMerchant` — pass that through to the insert.

### 2. `SET NOT NULL`

Migration `2026-07-29a_square_transactions_tenant_contract.sql`. Backfill any residual NULLs to the USAV org first (`00000000-0000-0000-0000-000000000001`), then `ALTER COLUMN organization_id SET NOT NULL`. Idempotent + guarded per `.claude/rules/polymorphic-tables.md`.

**Order matters:** step 1 must be deployed before this constraint lands, or the webhook starts loud-failing on every Square event.

### 3. Explicit predicate + stamp in the query module

`src/lib/neon/square-transaction-queries.ts` — add `AND organization_id = $n` to reads and stamp the column on INSERT. Make `orgId` **required**, not optional, on every exported function (a defaulted safety classification is a silent opt-out — `.claude/rules/backend-patterns.md`). Fix the two out-of-fileset callers the module comment names: `src/app/api/walk-in/receipt/[id]/route.tsx` and the webhook.

**Delete the stale 17-line comment at the top of the file.**

### 4. Composite conflict target

Swap the global `ON CONFLICT (square_order_id)` → `(organization_id, square_order_id)`. This needs the matching unique index — add it in the same migration **alongside** the existing global unique (expand), and leave the drop to a separate `.gated` contract migration. Follow the two-phase pattern in `2026-06-28j_sku_catalog_add_composite_unique.sql` exactly; read that file first.

## Bonus fix in scope

`src/app/api/walk-in/terminal/checkout/route.ts` calls env-global `getSquareConfig()` while every sibling route calls `resolveSquareConfig(ctx.organizationId)` / `squareFetchForOrg(orgId)`. It is the one Square call that ignores the tenant's own connection. Switch it to the org-resolved config.

## Do NOT

- Add `organization_id` — it exists. Verify with `information_schema` before writing DDL.
- Call `enforce_tenant_isolation('square_transactions')` in this phase. RLS arming for this table is a separate lane (see `2026-06-22g`); this phase makes the column trustworthy, not the policy live.
- Touch `src/lib/drizzle/schema.ts` — owned by 02 and 03.
- Touch anything under `src/app/api/kiosk/**`.

## Acceptance

- [ ] `organization_id` is `NOT NULL` on `square_transactions`
- [ ] The webhook stamps a real org on insert (not a GUC default)
- [ ] Every exported fn in `square-transaction-queries.ts` takes a **required** `orgId` and filters on it
- [ ] Composite unique exists; upserts conflict on `(organization_id, square_order_id)`
- [ ] The stale module comment is gone
- [ ] Terminal checkout uses the org-resolved Square config
- [ ] `npm run verify` green

## Verify

```bash
npm run verify
```

Migration applies cleanly and is re-runnable. Confirm the column state directly rather than trusting any comment:

```sql
SELECT column_name, is_nullable FROM information_schema.columns
WHERE table_name = 'square_transactions' AND column_name = 'organization_id';
```

**Applying the migration to a live DB is ask-first** — write it, verify it parses, hand it off.
