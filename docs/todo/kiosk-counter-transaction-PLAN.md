# Kiosk counter transaction — unified Sales + Repair intake

**Status:** Plan locked 2026-07-29 · **not started** (no code written)
**Created:** 2026-07-29
**Source:** Gemini Pro deep-research run against [`kiosk-sales-intake-GEMINI-RESEARCH-BRIEFING.md`](./kiosk-sales-intake-GEMINI-RESEARCH-BRIEFING.md) — that briefing is the **question**, this doc is the **answer and the SoT**.
**Related:** [`foh-boh-surface-split/06-walk-in-kiosk-auth.md`](./foh-boh-surface-split/06-walk-in-kiosk-auth.md) (auth model — built, unchanged) · [`foh-boh-surface-split/03-sales-main-history.md`](./foh-boh-surface-split/03-sales-main-history.md) (the seam this fills) · [`order-ingest-simplification-GEMINI-RESEARCH-BRIEFING.md`](./order-ingest-simplification-GEMINI-RESEARCH-BRIEFING.md)

One counter visit can contain **retail line items** and **service line items**, may reference **a prior order** and **an existing support ticket**, and on submit must create the right records, update the ticket, and post a reply.

---

## 0. Corrections to the research run — treat these as established facts

The research run marked seven claims "High (Verified)". **Two are wrong and two cite the briefing rather than the code.** Verified against the migration set 2026-07-29; do not rebuild on the original claims.

| Run claim | Actual | Impact |
|---|---|---|
| "`square_transactions` lacks `organization_id`" — cited `square-transaction-queries.ts:5-10` | **The column EXISTS.** `2026-06-14_org_id_phase_b_needs_col.sql` adds it (`ALTER TABLE %I ADD COLUMN organization_id uuid` over a `needs_col_tables` array containing `square_transactions`), backfills to USAV, and sets a GUC default. It is **NULLABLE**, RLS is **inert**, `ON CONFLICT (square_order_id)` is still **global**, and the webhook writer is **unthreaded**. The cited comment is **stale prose**. | **Phase 1 action changes.** Not "add the column" — it is the four follow-ups the migration header itself lists. |
| "`platform_listings.listing_price_cents` exists but is empty" — evidence *"comment review via prompt"* | True, but the citation is circular (it cites the briefing, not the repo). Confirmed independently: `src/lib/drizzle/schema.ts` → `platformListings` schema comment declares it *"intentional scaffolding … currently 0 rows / 0 writers by design"*. | Claim stands. Evidence hygiene noted. |
| "Kiosk repair sets a hardcoded price of '130'" — evidence *"from brief §4.4"* | True. `buildInitialFormData` in `src/components/repair/repair-intake-logic.ts`: `price: initialData?.price \|\| '130'`. | Claim stands. Evidence hygiene noted. |
| *(implicit)* `sku_catalog` is a viable price home | **`sku_catalog` IS org-scoped** — `organization_id NOT NULL`, plus a per-org composite unique `sku_catalog_org_sku_key UNIQUE (organization_id, sku)` (`2026-06-28j`), coexisting with the legacy global `UNIQUE(sku)` until the `.gated` phase-2 drop. **The Drizzle model is STALE** — `schema.ts:2316` still shows `sku: text('sku').notNull().unique()` and carries no `orgIdCol()`. | Tenancy objection to `sku_catalog` **withdrawn**. The model staleness is a new defect — fix in the same PR (house rule: model it in Drizzle). |

**Two plan revisions follow from the above, plus three from sequencing review — see §5.**

---

## 1. Decisions locked

| # | Decision | Rationale |
|---|---|---|
| **D1** | **Two linked records**, not one mixed-line order. A `counter_transactions` header joins a `square_transactions` receipt and a `repair_service` work record. | `repair_service` is a long-lived state machine (5-business-day SLA via `addBusinessDays`, work assignment, tech verdicts, signed agreement). A Square order is a financial snapshot. Overloading a financial line with a 10-day hardware lifecycle fights `transition()` (`.claude/rules/backend-patterns.md`). Industry consensus for high-value physical service = split financial receipt from operational work order. |
| **D2** | **Local priced projection**, not a live vendor read. | The kiosk cannot total a mixed cart without offline prices. Cold Ecwid catalog walk is ~16s (documented in `ecwid-repair-catalog.ts`). A consumer-facing form cannot own that latency. |
| **D3** | **Price home = `platform_listings`**, not `sku_catalog`. | *Revised — see §5.R2.* Sell price is **per-channel**, and `platform_listings` already carries `organizationId` + `listingPriceCents` + `platform` + `externalRefId` and is the declared forward-prep home for exactly this. `sku_catalog` stays product **identity**; putting a channel-specific sell price on the identity hub is the fork. |
| **D4** | **Kiosk stages, it never charges.** Payment completes on a physical Square Terminal or behind a staff PIN step-up. | House safety rule: no card data is ever entered in-app. Matches doc 06's attended-blend (device principal for base intake, PIN step-up for privileged actions). Taking payment **is** privileged. |
| **D5** | **`/api/kiosk/intake` becomes the real unified write path**, growing its declared seam. `/api/kiosk/repair/submit` is retired — **but only after** the client is migrated (§5.R3). | The route's own header declares the seam. Two device-authed write paths for one counter visit is the fork. |
| **D6** | **Repair is the ticket anchor.** Extend `TicketLinkAnchorInput` with `repair`. Helpdesk owns communication; the internal DB owns status. | `ticket_links.entity_type` free text already carries `'REPAIR'` from other writers — the value is representable, just unreachable through the typed API. |
| **D7** | **Identity: deterministic only.** Phone unlocks create-or-match. Prior orders reveal **only** on Order # + phone match. No searchable customer list on the kiosk. | The device principal is unattended-capable — every readable field is readable by a stranger. `kioskMode` already suppresses customer search for this reason. |

---

## 2. Target architecture

```
/kiosk (device principal, cf_kiosk token)
  └── unified intake form (4 steps — §4)
        └── POST /api/kiosk/intake        ← the ONE device-authed write path
              └── submitCounterTransaction(input, orgId)   ← new orchestrator, principal-agnostic
                    ├── resolveCounterCustomer()           ← deterministic identity
                    ├── counter_transactions INSERT        ← the header + idempotency anchor
                    ├── submitRepairIntake(...)            ← EXISTING helper, COMPOSED not re-inlined
                    ├── stageSquareOrder(...)              ← Square /orders, staged not charged
                    └── enqueueTicketWork(...)             ← outbox: attach/create + reply
```

**The orchestrator is principal-agnostic and org-scoped**, exactly like `submitRepairIntake` — so the staff route and the device route call the identical helper and can never drift. This is the single most important structural constraint in the plan.

**Facades only.** Payments/catalog via the Square capability facade (`squareFetchForOrg`), helpdesk via `getHelpdeskProvider`. No vendor imports in product code, no vendor nouns in customer copy (`capabilityNoun` / `connectedProviderLabel`).

---

## 3. Schema

Per `.claude/rules/polymorphic-tables.md` — named CHECK discriminator, org-led indexes, `enforce_tenant_isolation()` in the **birth** migration, Drizzle model in the **same PR**.

```sql
BEGIN;

CREATE TABLE IF NOT EXISTS counter_transactions (
  id                 BIGSERIAL PRIMARY KEY,
  organization_id    UUID NOT NULL,                 -- NO default; enforce_tenant_isolation installs it
  customer_id        INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  kiosk_device_id    BIGINT,                        -- the `via` principal, for audit
  prior_order_ref    TEXT,                          -- resolved Ecwid public order number, nullable
  support_ticket_id  BIGINT,                        -- FK support_tickets; nullable until the outbox lands it
  subtotal_cents     INTEGER NOT NULL DEFAULT 0,
  total_cents        INTEGER NOT NULL DEFAULT 0,
  status             TEXT NOT NULL DEFAULT 'staged',
  client_event_id    UUID,                          -- idempotency anchor for the WHOLE transaction
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE counter_transactions ADD CONSTRAINT counter_transactions_status_chk
    CHECK (status IN ('staged','paid','partially_paid','abandoned','voided'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS ux_counter_transactions_client_event
  ON counter_transactions (organization_id, client_event_id)
  WHERE client_event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_counter_transactions_org_created
  ON counter_transactions (organization_id, created_at DESC);

ALTER TABLE repair_service
  ADD COLUMN IF NOT EXISTS counter_transaction_id BIGINT
    REFERENCES counter_transactions(id) ON DELETE SET NULL;
ALTER TABLE square_transactions
  ADD COLUMN IF NOT EXISTS counter_transaction_id BIGINT
    REFERENCES counter_transactions(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'enforce_tenant_isolation') THEN
    PERFORM enforce_tenant_isolation('counter_transactions');
  ELSE
    RAISE NOTICE 'enforce_tenant_isolation absent — counter_transactions left without FORCE RLS';
  END IF;
END $$;

COMMIT;
```

`ON DELETE SET NULL` on both child links, not CASCADE: **a signed agreement must survive its transaction header.** Deleting a counter transaction must never delete the legal record of what the customer signed.

---

## 4. Form IA

| Step | Content | Notes |
|---|---|---|
| 1 · Identity | Phone → create-or-match. Optional "Have an order number?" | Deterministic only (D7). No customer list. |
| 2 · Cart | Repair service + retail items from the **one** projected catalog | Composes `ProductSelector` (already `apiBasePath`-parameterized) + `salesCartStore` |
| 3 · Review & sign | Receipt preview; **signature only if a service line is present** | Motion per `.claude/rules/display/auth-step-panel.md` — a form, never a Station (`display/station.md` Q1: no scanner) |
| 4 · Payment hand-off | Stage → Terminal, or PIN step-up | Never charges in-app (D4) |

---

## 5. Phase plan

> **Split for parallel execution 2026-07-29 → [`kiosk-counter-transaction/`](./kiosk-counter-transaction/).**
> Per-phase agent docs live there; [`00-INDEX.md`](./kiosk-counter-transaction/00-INDEX.md) owns wave order,
> lane assignments, and the file-collision map. **Phases 1–3 are parallel; 4 and 5 are chained.**
> The summaries below stay as the SoT rationale — the child docs are the executable form.

Each phase ships independently and leaves `npm run verify` green. **Ask-first items are marked** — migrations, payment, tenancy, status machine.

### Phase 1 — Tenancy gate **[ask-first: migration]**

*Revised — R1.* The column exists; these are the four follow-ups from `2026-06-14_org_id_phase_b_needs_col.sql`'s own header:

1. Thread `orgId` through the session-less writer `src/app/api/webhooks/square/route.ts` (`insertSquareTransaction`).
2. `ALTER TABLE square_transactions ALTER COLUMN organization_id SET NOT NULL`.
3. Add the explicit `organization_id` predicate + INSERT stamp in `src/lib/neon/square-transaction-queries.ts`, and **delete the now-false module comment**.
4. Swap the global `ON CONFLICT (square_order_id)` → `(organization_id, square_order_id)`.

Also: fix `/api/walk-in/terminal/checkout` to use `resolveSquareConfig(ctx.organizationId)` instead of env-global `getSquareConfig()` — it is the one Square call that ignores the tenant's own connection.

**Gate:** no kiosk sales write lands before this phase is green.

### Phase 2 — Catalog projection **[ask-first: migration]**

*Revised — R2, R4.*

- Price + **category tree** land in `platform_listings` (D3). **The projection must carry categories, not only price** — `ProductSelector` drills a category hierarchy, so a price-only projection leaves the live Ecwid walk in place and the phase delivers nothing.
- Writer: extend the existing `src/lib/ecwid-square/sync.ts` + a webhook/cron refresh. One writer, not a new service.
- Fix the **stale `skuCatalog` Drizzle model** (`schema.ts:2316` — missing `organizationId`, wrong `.unique()` on `sku`) in this PR.
- **Deletes:** the live-Ecwid cold path in `ecwid-repair-catalog.ts` and its two-tier cache workaround.

### Phase 3 — Join model + ticket outbox **[ask-first: migration]**

- `counter_transactions` per §3, Drizzle model in the same PR.
- Extend `TicketLinkAnchorInput` in `src/lib/support/ticket-link.ts` with `repair` (D6).
- Transactional outbox for helpdesk work, on the `entity_search_outbox` + `search-outbox-worker.ts` precedent. Fixes the silently-swallowed Zendesk failure at `submit-repair-intake.ts:256`.

### Phase 4 — The unified route

*Revised — R3, R5.*

- Implement `submitCounterTransaction` as a **principal-agnostic domain helper** that **composes `submitRepairIntake`** — never re-inlines it. Re-inlining forks the staff path and is the exact failure `submit-repair-intake.ts` was extracted to prevent.
- Grow `/api/kiosk/intake`: keep its existing Zod body + PIN step-up + device-as-`via` audit contract, replace the audit-only body.
- **Retire `/api/kiosk/repair/submit` in three steps, not one:** (a) unified route live and passing; (b) `src/app/kiosk/page.tsx` repointed; (c) *then* delete. A same-phase delete takes the only live kiosk write path down before its replacement is proven.

### Phase 5 — Kiosk UI

- 4-step form per §4; compose `salesCartStore` — no second cart.
- Add the kiosk-scoped sales permission (none exists today; registry has only `walk_in.{view,intake,enroll_kiosk}`), with the matching `route-permission-manifest.test.ts` row.
- Flip `SERVICES` `sales: 'wip'` → `'live'` in `src/app/kiosk/page.tsx` — the one-line flip the array was built for.

---

## 6. Risk register

| Risk | Mitigation |
|---|---|
| Helpdesk down at intake | Outbox + sweeper (Phase 3). Never blocks the counter. |
| Payment succeeds, repair insert fails | `counter_transactions` is the idempotency anchor; the transaction stays `partially_paid` and is reconcilable. Signature survives via `ON DELETE SET NULL`. |
| Customer buys, declines repair | Header simply carries no `repair_service` link. Signature step does not render. |
| Catalog price drift vs Square | Local projection is authoritative for **display**; the terminal charge is authoritative for **money**. A rejected charge triggers a background refresh. |
| Cross-tenant sales leak | Phase 1 is a hard gate on Phase 5. |
| PII fishing on an unattended tablet | D7 — deterministic Order # + phone, no list, no search. |
| Forked write path | The orchestrator composes `submitRepairIntake`; Phase 4 retires the sibling route. |

---

## 7. Open / ask-first

- Deposit vs full payment on a repair line — does one Square order support both, or does the repair line stage a separate deposit? Unresolved; blocks Phase 5 payment wiring.
- Whether the auto-posted ticket reply is **public** (customer-visible) or **internal**. Recommend internal for the first cut.
- `2026-07-17_kiosk_devices.sql` application state on the live DB — **[verify before Phase 4]**.
- Phase-2 `.gated` drop of the legacy global `UNIQUE(sku)` on `sku_catalog` is a separate lane; do not bundle.

## 8. Verify

`npm run verify` per phase. New domain helpers get DB-free `Deps`-injection unit tests (`node:test` + `tsx`). E2E asserts against the **QA org**, never the dogfood tenant (`.claude/rules/verify.md`).
