# Serial-unit relationship audit — 24 FK families

> Generated 2026-08-21 by an 18-agent audit workflow (8 domain clusters, each
> adversarially verified; 9 verifier corrections applied). Run id
> `wf_8da859be-d04`.
>
> **Purpose:** decide the Displays leaf set for a unit preview surface at
> `/search?sel=unit:`. It also surfaced live tenant-isolation defects — see §5,
> which is a security surface, not a design note.

« # Serial-unit relationship families — audit map

## 1. Headline

**8 of 24 families are leaf-ready today.** 9 are partial, 4 absent, 3 dead.

- **Ready (8)** — a unit-keyed read API exists and returns the rows: `inventory_events`, `label_print_jobs`, `order_unit_allocations`*, `serial_unit_condition_history`, `serial_unit_provenance`, `tech_serial_numbers`, `unit_failure_tags`, `unit_repairs`.
- **Partial (9)** — data is live, but every read is keyed by line / org / SKU / manifest / claim, not by unit: `item_workflow_state`, `label_manifest_items`, `receiving_line_unit`, `sku_stock_ledger`, `testing_results`, `unit_pack_placements`, `unit_quality_scores`, `warranty_claims`, `workflow_runs`.
- **Absent (4)** — write path live, zero read path anywhere: `unit_pack_placement_events`; or FK never populated: `fba_shipment_item_units`, `repair_service`, `warranty_repair_attempts`.
- **Dead (3)** — no writer stamps the FK, or the table is retired: `part_acquisitions`, `sku`, `workflow_tap_outbox`.

**Six of 24 FK relationships are not live at all** (`part_acquisitions`, `fba_shipment_item_units`, `repair_service`, `warranty_repair_attempts`, `sku`, `workflow_tap_outbox`) — the tables may be busy, the *unit* edge is not.

\* `order_unit_allocations` is ready for `state` only. The unit-keyed SELECT at `src/app/api/serial-units/[id]/route.ts:193` omits `returned_at` / `returned_reason`, so a RETURNED unit renders with no timestamp. One-line read extension + `AllocationRow` (`src/components/inventory/types.ts:164-172`).

---

## 2. The map

| Family | What it records | Live? | Unit-keyed read | Tenant scoping | Leaf readiness |
|---|---|---|---|---|---|
| `inventory_events` | Lifecycle/audit event timeline | yes | `GET /api/serial-units/[id]`, `/api/inventory-events?serial_unit_id=` | **mixed** — reads *and* writes | ready |
| `label_print_jobs` | One row per physical label print | yes | `GET /api/serial-units/[id]/print-history` | tenantQuery + RLS | ready |
| `order_unit_allocations` | Order reservation + ladder state | yes | `?include=full` → `allocations` | **mixed** — live cross-tenant write | ready (state); needs `returned_at` added |
| `serial_unit_condition_history` | Grade-change timeline | yes | `?include=full` → `conditions` | withTenantTransaction | ready |
| `serial_unit_provenance` | Typed origin edge (where unit came from) | yes | `GET /api/serial-units/[id]` (via `v_serial_unit_origins`) | mixed (one raw-pool read) | ready |
| `tech_serial_numbers` | Legacy per-scan serial capture ledger | yes | `?include=full` → `tsn_links` | **mixed** — USAV-fallback stamping | ready |
| `unit_failure_tags` | Open/resolved defect tags | yes | `GET /api/serial-units/[id]/failure-tags` | mixed (parent-scoped) | ready |
| `unit_repairs` | Internal repair attempts | yes | `GET /api/serial-units/[id]/repairs` | mixed (dormant no-org branch) | ready |
| `item_workflow_state` | Current engine node position | yes | none (assistant tool only) | **mixed** — unscoped owner-conn read | partial |
| `label_manifest_items` | Current kit-manifest membership | yes | none (manifest-keyed only) | withTenantTransaction | partial |
| `receiving_line_unit` | Expected slot, no-serial waiver, grade | yes | none (line-keyed only) | withTenantTransaction | partial |
| `sku_stock_ledger` | SKU qty delta caused by this unit | yes | none (SKU-keyed only) | **mixed** — cross-tenant admin read | partial |
| `testing_results` | Per-verdict test log | yes | none (org-keyed only) | mixed | partial |
| `unit_pack_placements` | Current pack-bench staging row | yes | none (location-keyed only) | withTenantTransaction | partial |
| `unit_quality_scores` | Derived 0-100 quality projection | yes | only a **recomputing** GET (writes on read) | mixed | partial |
| `warranty_claims` | Customer warranty claim | yes | none (FK written, never projected) | **mixed** — cross-tenant cron write | partial |
| `workflow_runs` | Engine node-execution log | yes | none (aggregate-only reads) | withTenantTransaction | partial |
| `fba_shipment_item_units` | FBA shipment-item linkage | **no** | none (shipment-keyed) | withTenantTransaction | absent |
| `repair_service` | Walk-in/RMA repair ticket | **no** | none | mixed (raw-pool script writer) | absent |
| `unit_pack_placement_events` | Bench place/move/clear ledger | yes | **none anywhere** | withTenantTransaction | absent |
| `warranty_repair_attempts` | Tech attempt on a warranty claim | **no** | none (claim-keyed) | mixed | absent |
| `part_acquisitions` | What was paid, from which supplier | **no** | one read, structurally always empty | mixed | dead |
| `sku` | Archive→unit back-pointer (retired table) | **no** | none | mixed | dead |
| `workflow_tap_outbox` | Tap intent (PENDING/LANDED/FAILED) | **no** | none | mixed (deliberate cross-org) | dead |

---

## 3. Grouped for the Displays Root Index

**18 live families → 8 leaves, not 24.** A leaf answers an *operator question*, not a table. Five families are all facets of "how did it test"; two are "where is it on the bench"; two are "what came out of the printer". Splitting them is how you get 24 leaves nobody opens.

### verification — 1 leaf

**Leaf A · Condition & QA** — merge `testing_results` + `unit_failure_tags` + `unit_quality_scores` + `unit_repairs` + `serial_unit_condition_history`.
These are one question: *how did it test, what was wrong, what was done, what grade is it now.* The existing `QualityResp` payload (`src/components/labels/unit-detail/UnitQualityPanel.tsx:20-58`) already aggregates quality + failure_tags + repairs into one response — the merge is the shipped shape, not a new idea. Add the grade timeline (`serial_unit_condition_history`, already in `?include=full`) and the verdict log (`testing_results`, needs a read). Compose/grow `UnitQualityPanel`; do not fork.

### assets — 2 leaves

**Leaf B · Labels & kit** — merge `label_print_jobs` + `label_manifest_items`.
Both answer *what physical label artifact represents this unit*. Kit membership is at most one row (`ux_label_manifest_items_one_live`); print history is the durable trace. Compose `src/components/receiving/UnitPrintHistory.tsx` (its own docblock already invites reuse behind a serial chip).

**Leaf C · Bench placement** — merge `unit_pack_placements` + `unit_pack_placement_events`.
Current bench + the move ledger are one question. The events table is strictly more informative (it survives the placement row's DELETE on ship), so it is the primary; the placement row is the "now" band. Branch on `source==='clear'` — a clear row has `from == to`.

### context — 5 leaves

**Leaf D · Origin & arrival** — merge `serial_unit_provenance` + `receiving_line_unit`.
*Where did it come from, and which slot on which line did it land in.* Label the provenance line **origin**, never "PO" — it never advances on re-receipt (`src/app/api/serial-units/[id]/route.ts:99`).

**Leaf E · Lifecycle timeline** — `inventory_events` primary, with `tech_serial_numbers` as a scan-capture band and `sku_stock_ledger` as an optional stock-delta band.
One chronological spine. Use `/api/inventory-events?serial_unit_id=&limit=` (DESC, paged) — not `?include=full`, which returns the whole history plus six other families unlimited.

**Leaf F · Order allocation** — `order_unit_allocations` alone. Distinct question (*is it spoken for*), distinct lifecycle, already its own array.

**Leaf G · Engine** — merge `item_workflow_state` + `workflow_runs`. Current node + node-execution history are one question; `workflow_runs` is the better-shaped half. Both need a read.

**Leaf H · Warranty** — `warranty_claims` alone. Flag-gated (`WARRANTY_LOGGER`, defaults true), permission `warranty.view` + feature `repair`.

**Right leaf count: 8.** Six families are not eligible at all (dead relationships, §4).

---

## 4. Dead or suspicious

**`sku.serial_unit_id` does not mean what its name suggests.** It is not a unit→SKU relation. The legacy `sku` table was retired 2026-04-15 (`src/lib/migrations/2026-04-15_retire_sku_table.sql`), which installed `trg_block_sku_inserts` and left UPDATE permitted only so this FK could be backfilled. Direction is **archive row → master unit**. The only writer, `syncSkuToSerialUnit` (`src/lib/neon/serial-units-queries.ts:1009`), has zero call sites repo-wide — an orphaned export. Nothing reads the column. If a surface ever needs "came from legacy sku row N", the honest source is `serial_unit_provenance` / `v_serial_unit_origins`. **Delete the helper; do not build on this.**

**`part_acquisitions` — the FK is never written.** `importCandidate`'s INSERT column list (`src/lib/neon/sourcing-queries.ts:568`) omits `serial_unit_id`, and there is no `UPDATE part_acquisitions` anywhere in `src/` or `scripts/`. Consequence: the one unit-keyed read (`src/lib/neon/quality-queries.ts:102`) is structurally guaranteed to return zero rows, so the `acquisition` input to every quality score is permanently absent. No index on `serial_unit_id` either. Needs a writer before it is a family.

**`repair_service` — heavily written table, dead unit edge.** `createRepair`'s column list omits it (`repair-service-queries.ts:656-676`), `updateRepairField`'s allowlist excludes it (`:561-579`), and `REPAIR_LINK_FIELDS` pairs on the serial *string*. The only writer that ever ran was the one-time backfill inside `2026-07-03s`, which found 1 of 72 rows resolving. The migration header warns this is optional enrichment, **not** a consolidation onto `unit_repairs`. Do not present it as "this unit's repairs" — `unit_repairs` is that family, and the live bridge is `unit_repairs.repair_service_id`.

**`warranty_repair_attempts` — migration promised a writer that never shipped.** `2026-07-03t`'s header says `serial_unit_id` / `start_event_id` / `done_event_id` are "populated at WRITE time by the domain helper (house pattern)"; `logRepairAttempt`'s INSERT (`src/lib/warranty/mutations.ts:711-719`) omits all three. Table recorded empty at 2026-07-03. Join through `warranty_claims.serial_unit_id` instead — it *is* populated.

**`fba_shipment_item_units` — HTTP-reachable, zero callers.** `POST /api/fba/items/[id]/link-unit` is a real gated route, but `rg 'link-unit'` across `src/`, `tests/`, `scripts/` finds no fetch, hook, or component. Same for `ship-units`. Check live row counts before designing anything.

**`unit_pack_placement_events` — write-only.** Rows are appended on every place and clear; nothing in non-test `src/` ever SELECTs the table. Live data, zero read path, zero UI.

**`workflow_tap_outbox` — inert behind three gates.** Flag `WORKFLOW_TAP_OUTBOX` has no default-true and appears in neither `.env` nor `.env.example` (`src/lib/feature-flags.ts:262`); the reconcile cron is deliberately absent from `vercel.json`; and both the migration header and `src/lib/workflow/tap-outbox.ts:19` say the table may not be applied. Engine plumbing, not an operator fact.

**Stale-comment trap (not dead, but wrong docs).** Every docblock for `unit_failure_tags` / `unit_quality_scores` says "no organization_id" (`failure-modes-queries.ts:18`, `quality-queries.ts:149`, `src/lib/drizzle/schema.ts:3736`, `:3790`) — but `2026-06-14_org_id_phase_b_needs_col_2.sql` added it and `2026-06-22c` attempts NOT NULL + FORCE RLS. `2026-06-22c` is per-table fault-isolated (`EXCEPTION WHEN OTHERS … 'left as-is'`), so the repo cannot prove it landed. Verify against the live DB. Same class: `src/lib/drizzle/schema.ts:3845` `orderUnitAllocations` is missing `organizationId`, `returnedAt`, `returnedReason`; `:2136-2162` `repairService` is missing `organizationId`.

---

## 5. Tenant-isolation findings

Security surface. Stated plainly, no softening.

**Status as of 2026-08-21.** Seven of nine closed. The two that remain are open
because each is a documented *design decision*, not an oversight. Neither should
be changed drive-by.

| # | Table | Status | Where |
|---|---|---|---|
| 1 | `order_unit_allocations` | **FIXED** | `f6181b725` + permission alignment |
| 2 | `warranty_claims` (cron) | **OPEN — decision** | deliberate global reconcile |
| 3 | `warranty_claims` (GUC substitution) | **FIXED** | `2e614df4d` |
| 4 | `tech_serial_numbers` | **FIXED** | `2e614df4d` |
| 5 | `inventory_events` (state machine) | **FIXED** | `975215d31` |
| 6 | `sku_stock_ledger` | **FIXED** | fixed independently; finding was stale |
| 7 | `inventory_events` (idempotency) | **FIXED** | `2e614df4d` |
| 8 | `item_workflow_state` | **OPEN — decision** | documented as intentional |
| 9 | `serial_unit_provenance` | **FIXED** | `2e614df4d` |

**The pattern across all six fixes:** every one of these boundaries is an
explicit `organization_id` predicate, never RLS. `tenantPool` still aliases the
BYPASSRLS owner role, so the GUC is a forward-looking backstop and the predicate
is the live control. Where the defect was a *defaulted* org rather than a
missing filter (findings 1, 3), the fix was to make the parameter **required and
un-defaulted** so the compiler names every unvisited call site — not to add a
better default.

### Live cross-tenant WRITES

**1. `order_unit_allocations` — cross-tenant write from an unguarded Server Action.** — **FIXED** (commit `f6181b725`, plus the permission alignment below).
`src/app/admin/inventory/returns/page.tsx:56-57` declares `intakeAction` with `'use server'` — independently POST-able — and calls `processReturnsIntake` at **`page.tsx:89`** with **no `organizationId`**. With org absent, `src/lib/inventory/returns.ts:92` sets `orgId = null`, so `:229-231` takes the raw-pool `transaction(run)` branch: no `withTenantTransaction`, no `app.current_org`, on the BYPASSRLS owner pool. Both org predicates then collapse — the unit resolver at `returns.ts:106-112` matches **any tenant's** `serial_units` row by serial string, and `returns.ts:149-153` runs `UPDATE order_unit_allocations SET state='RETURNED' … WHERE serial_unit_id=$1 AND state='SHIPPED'` unpredicated. Aggravating: `intakeAction` never calls `requirePermission`; the only guard is at `page.tsx:118`, inside the page component, which does not gate action invocation. Compare `src/app/admin/inventory/bulk-allocate/page.tsx:90-91`, which does it correctly.

> **Fix landed.** `ReturnsIntakeInput.organizationId` is now a **required, un-defaulted** field (`src/lib/inventory/returns.ts:61`) — the org-less raw-pool branch is gone entirely, `withTenantTransaction` is unconditional (`:236`), and both collapsed predicates are back: the serial resolver (`:117`) and the `order_unit_allocations` SHIPPED→RETURNED flip (`:159`). `intakeAction` now calls `requirePermission` *inside* the action, and `loadRecentReturns` runs through `tenantQuery`.
>
> **Follow-up applied 2026-08-21:** that guard used the PAGE's permission (`admin.view`), while the twin entrypoint `POST /api/returns/intake` enforces `receiving.mark_received` for the identical write. `admin.view` is an ordinary registry permission — a non-admin role or a per-staff `permissions_added` grant can carry it without `receiving.mark_received` — so the form was the weaker of two doors onto one code path. The action now gates on the mutation's permission. Same correction applied to `holds/page.tsx` (`sku_stock.adjust`, matching `/api/serial-units/[id]/{hold,release}`).
>
> **The generalizable rule:** a Server Action is its own POST entrypoint, so it gates itself — and it gates on the permission its WRITE requires, which is the twin API route's, not the permission that gates rendering the page it lives on.
>
> **`bulk-allocate/page.tsx` — the fourth instance, fixed 2026-08-21.** The audit cited it at `:90-91` as the page that "does it correctly", which was true only of the org thread into `allocateOrder`. Three separate defects remained: (a) `loadCandidates` was fully unscoped `queryRaw` over `orders` / `order_unit_allocations` / `serial_units`, listing every tenant's unallocated orders with an Allocate button on each — the write itself is org-safe, so a cross-tenant click failed to match rather than allocating, but the order ids, SKUs, quantities and conditions were already on screen, and `available_stocked` counted other tenants' STOCKED units so the eligibility flag was wrong for one's own orders too; (b) `requirePermission` sat INSIDE the action's `try`, and since it signals denial by throwing `NEXT_REDIRECT`, the catch swallowed it and logged it as an allocation failure — a broken guard, not an open one (the throw still skipped the write); (c) it gated `admin.view` while the twin route `POST /api/orders/[id]/allocate` gates `orders.view`, and its own docblock claimed "orders.view (matches the API)", matching neither. All three fixed; the guard is now hoisted above the try.
>
> **Second generalizable rule:** a guard that signals by throwing must sit OUTSIDE the handler's `catch`. Same defect the returns dock fixed for its 404 redirect; `bulk-allocate` had it for the permission redirect.

**2. `warranty_claims` — hourly cron mutates every tenant's claims on the raw pool.** — **OPEN, deliberate.**
`src/lib/warranty/clock-sweep.ts` imports `pool from '@/lib/db'` (`:23`) and runs both passes with no `organization_id` predicate anywhere: cross-org candidate select (`:65`, `:85-89`) then `UPDATE warranty_claims AS wc … WHERE wc.id = v.id` (**`:149`**); cross-org select (`:210-218`) then `UPDATE warranty_claims SET status='EXPIRED' … WHERE id = ANY($1)` (**`:228`**). Reached in production from `src/app/api/cron/shipping/reconcile-delivered/route.ts:64`. Documented as a deliberate "Phase D category B global reconcile" with a Phase E follow-up — a design decision, not an accident, but it mutates claim **status** and the warranty clock for every tenant.

> **Left open on purpose.** This is the one finding in the WRITES list that is a *design*, not a slip: the file documents it as a Phase D category B global reconcile with a Phase E follow-up. Closing it means restructuring a production cron into per-org iteration, which changes its failure surface (a per-org loop fails partially; a global sweep fails whole) and its Neon CU profile. That is an operator call, and it should be made against the tenancy execution plan rather than in a sweep.

**3. `warranty_claims` — wrong-tenant GUC substitution.** — **FIXED** (commit `2e614df4d`). `src/lib/warranty/linkage.ts:165, :244, :303, :412, :457` do `const txOrg: OrgId = orgId ?? DOGFOOD_ORG_ID`, then run unpredicated `UPDATE warranty_claims SET rma_id = $2 … WHERE id = $1` (`:211, :256, :354, :423, :477`) inside that transaction. All five call sites thread `ctx.organizationId` today, so unreachable — but it is a strictly worse failure mode than a missing filter: it writes under another tenant's identity.

> **Fix landed.** `orgId` is now **required and non-nullable** on all five exports (`issueRmaForClaim`, `linkRmaByNumber`, `handoffToRepair`, `unlinkRma`, `detachRepairHandoff`) and on both internal helpers (`loadClaimCore`, `unitAlreadyReturned`). All five `?? DOGFOOD_ORG_ID` substitutions are deleted, as is the `DOGFOOD_ORG_ID` import. Every call site already threaded `ctx.organizationId`, so the compiler proved the migration rather than a reviewer having to.
>
> **The seven now-dead `orgId ? scopedSQL : unscopedSQL` ternaries were collapsed, not left unreachable** — `linkage.ts` no longer contains an unscoped `warranty_claims` or `serial_units` statement at all. Leaving them would have satisfied the finding while keeping a working unscoped path one `if` away from a future caller (`pattern-evolution.md` §6: a retirement is not done until the old path is deleted).
>
> **Why this one deserved the required-parameter treatment and not just a filter:** the failure mode here is not "reads nothing", it is "writes as the dogfood tenant". A default on a parameter that decides *whose data a write claims* is a silent opt-out taken by every call site the author did not visit — the same rule `backend-patterns.md` states for `scanKind` / `intakeSurface`.

**4. `tech_serial_numbers` — every non-dogfood tenant's test-verdict row is stamped USAV.** — **FIXED** (commit `2e614df4d`).
`src/lib/tech/recordTestVerdict.ts:258` calls `attachTechSerial({…})` with no executor and no `orgId` **even though `orgId` is in scope at `:157`**. `attachTechSerial` then takes the legacy raw-pool branch (`src/lib/inventory/tech-serial.ts:136-139`), so `organization_id` falls to the column default `COALESCE(NULLIF(current_setting('app.current_org',true),'')::uuid, '00000000-0000-0000-0000-000000000001')` (`src/lib/migrations/2026-05-21_org_id_transitional_default.sql:50`). `tsn_links` is therefore not tenant-complete.

> **Fix landed.** `recordTestVerdict.ts` now binds `organizationId: orgId ?? undefined` on the `attachTechSerial` input. `?? undefined` and never `?? null` is load-bearing: `attachTechSerial` binds the column only when the value is not `undefined`, and `organization_id` is NOT NULL — passing `null` would trade a silent mis-stamp for a hard insert failure.
>
> **Bound via the input field rather than the third `orgId` parameter, deliberately.** That parameter additionally routes the write through `withTenantTransaction`, i.e. a fresh connection checkout per verdict. `receive-line.ts:475-478` records that `pool.query` under concurrent load at `poolMax=3` was the source of the "Query read timeout" errors on `mark-received-po`. Explicit column binding fixes the stamping — which is the whole finding — without adding a connection to the test bench's hot path. `serial-attach.ts:210` already used this shape.

**5. `inventory_events` — silent USAV fallback in the state machine.** — **FIXED** (commit `975215d31`). `src/lib/inventory/state-machine.ts:332` `orgId ?? DOGFOOD_ORG_ID`; same at `src/lib/workflow/applyTransition.ts:111`. `orgId` is an optional third arg on `recordInventoryEvent` (`src/lib/inventory/events.ts:122`) with a documented legacy no-org path at `:181-201`. The table is FORCE-RLS but with a USAV fallback default (`2026-06-22e_enforce_tenant_isolation_core_usav_fallback.sql:34`), so a GUC-less write **stamps the dogfood org rather than failing**.

> **Fix landed.** `orgId` is required on `transition()` and on `ApplyTransitionArgs`; both `?? DOGFOOD_ORG_ID` substitutions are deleted. The org-less raw-pool branch inside `transition()` is gone entirely — there are two modes now (GUC-wrapped, or executor-pattern on a caller's client) and no third — and `runTransition`'s `orgId ? scoped : unscoped` SQL ternaries are collapsed to the scoped form, so the unscoped `serial_units` lock and UPDATE no longer exist in the file.
>
> **The scale in this finding was wrong, and the way it was wrong is worth recording.** "~102 call sites" came from grepping `transition(`, which also matches `transitionReceivingLine`, `applyTransition`, `runTransition` and prose in docblocks. The number that actually failed to compile once the parameter was required was **13**. Making the parameter required *is* the census — it is the only count that cannot be off, and it costs one `tsc` run. Do not size a migration of this shape by grep again.
>
> **The cascade the compiler found, each layer made required in turn:** `holdUnit` / `releaseUnit` (which also had unscoped `serial_units` locks and an unscoped HELD-event lookup of their own — closed here too), `allocateOrder` (legacy raw-pool `transaction` path deleted), `confirmPick`, `recordShortPick`, `openRepair`, `updateRepair`, `recordDisposition` (including its own two `?? DOGFOOD_ORG_ID` substitutions and an unscoped `UPDATE serial_units SET current_location` on the ACCEPT restock), `recordTestVerdict`, `mirrorLegacyPackToAllocations`. `parts-sort`'s `(unit.organization_id) ?? DOGFOOD_ORG_ID` turned out to be a default on a NOT NULL column — impossible to fire unless the row shape lied, and a silent cross-tenant parts-sort if it ever did; it is now a data-integrity no-op check.
>
> **Two call sites were cross-tenant in their own right, found only because the compiler stopped at them:** the `phase2-smoke-allocate` script's candidate query had no org predicate anywhere (it now carries the order's own org through), and the RMA restock's `current_location` UPDATE was keyed on `id` alone.
>
> **Still open, and deliberately not bundled here:** `transitionReceivingLine` (`src/lib/receiving/state-machine.ts:272`) carries the identical `orgId ?? DOGFOOD_ORG_ID` for receiving lines. Same defect class, different chokepoint, ~14 call sites. It wants its own pass — and its own compiler census, not a grep.

### Live cross-tenant READS

**6. `sku_stock_ledger` — an authed admin in org A sees org B's ledger.** — **FIXED 2026-08-21.**
`src/app/admin/inventory/sku/[sku]/page.tsx:186-199` `loadLedger()` runs `queryRaw(… FROM sku_stock_ledger l … WHERE l.sku = $1 …)` with **no `organization_id` predicate and no GUC** — `queryRaw` is a bare owner-pool call (`src/lib/neon-client.ts:102-113`), not `tenantQuery`. Called unconditionally at `page.tsx:257`. The page is only `requirePermission`-gated. SKU strings collide across orgs (`src/app/api/audit/sku/[sku]/route.ts:28-30` says so). Leaked columns include `ref_serial_unit_id` — precisely the key a unit leaf would use. *(The previously-cited `src/lib/audit-log/entity-history.ts:308` fallback is unreachable — its route caller always threads the org.)*

> **Fix landed.** All **eight** loaders on that page had the same shape, not just `loadLedger` — `sku_catalog`, `sku_stock`, `bin_contents`/`locations`, `serial_units` (x2), `order_unit_allocations`, `sku_stock_ledger`, `inventory_events`. Each now runs through `tenantQuery(orgId, …)` with an explicit `organization_id` predicate (joined `staff` / `locations` / `serial_units` scoped in their `ON` clauses), `orgId` from `requirePermission` → `user.organizationId`, never the route param.
>
> **Tooling gap this exposes:** `scripts/tenancy-route-audit.mjs` scans `src/app/api/**/route.ts` only, so a Server Component `page.tsx` doing raw-pool reads is invisible to `npm run tenancy:routes`. **Nothing in `npm run verify` or the tenancy audit can see this class of defect** — it is review-only.
>
> **Three siblings had the identical defect and were fixed the same day:** `src/app/admin/inventory/events/page.tsx` (both loaders; the org predicate seeds the dynamic filter list as `$1`), `…/throughput/page.tsx` (all four aggregate loaders — every tenant's events were being summed into one tenant's throughput KPIs), and `…/holds/page.tsx` (the held-units read plus both server actions).
>
> **`holds/page.tsx` also carried finding 1's aggravating factor** — its `holdAction` / `releaseAction` are independently POST-able server actions that the page's render-time `requirePermission` does not gate, and its docblock asserted the opposite ("the action enforces implicitly by being in this admin-only page"). Both now call `requirePermission('sku_stock.adjust')` inside the action — the permission the twin routes `/api/serial-units/[id]/{hold,release}` enforce — and resolve the operator's ref to an org-owned `serial_units.id` before the write, since `holdUnit` / `releaseUnit` still take no `orgId` (`src/lib/inventory/hold.ts:29-30`, tracked). **Finding 1's `returns/page.tsx` is the same shape and is still open.**

**7. `inventory_events` — unscoped idempotency read on the BYPASSRLS owner connection.** — **FIXED** (commit `2e614df4d`).
`src/lib/repositories/inventory/inventoryEvents.ts:104` and `:140`: `db.select().from(inventoryEvents).where(eq(inventoryEvents.clientEventId, …)).limit(1)` — keyed on `client_event_id` **only**, no org predicate, no GUC, and the row is **returned to the caller**. `db` is the owner Drizzle client (`:13` → `src/lib/drizzle/db.ts:10-11`), which bypasses RLS (`src/lib/migrations/2026-06-23_enforce_tenant_isolation_engine.sql:8-11`). Live: `src/lib/tech/recordTestVerdict.ts:277` and `src/lib/tech/recordDataWipe.ts:26, :82`, both threading `client_event_id` straight from the request body. **Do not read "inventory_events reads are correctly scoped" anywhere — that claim is false.**

> **Fix landed.** Both lookups in `appendInventoryEvent` (the pre-read and the post-conflict re-read) now match on `(client_event_id, organization_id)` whenever the caller supplies an org. An org-less legacy caller keeps the unscoped lookup byte-identical.
>
> **Scoping the read exposed a case the unscoped version silently absorbed.** `client_event_id` is UNIQUE **globally**, so there is now a reachable state where the INSERT is swallowed by the constraint yet no row is visible under this org — which means the key belongs to a different tenant. The old code answered exactly that state by returning the other tenant's event row; it now throws. Worth stating plainly because it is a behavior change, not just a filter: a cross-tenant idempotency-key collision is a hard error, and it should be.
>
> **`recordTestVerdict:277` and `recordDataWipe:26,:82` both thread `organizationId` already**, so the live callers named in this finding are covered by the scoped path rather than the legacy one.

**8. `item_workflow_state` — intentional cross-org read whose result drives writes.** — **OPEN, deliberate — but closer to closable than it reads.**
`src/lib/workflow/tap.ts:431` … `:446` `.where(eq(itemWorkflowState.serialUnitId, serialUnitId))` on the owner connection — no GUC, no org predicate — and it returns the row *including its `organizationId`*, which then drives the subsequent writes. The file admits it at `tap.ts:390-393`. RLS is not a backstop: the engine migration states the app role has BYPASSRLS. Live — three call sites pass `orgId ?? null`: `src/lib/neon/repairs-queries.ts:386`, `src/lib/inventory/returns.ts:246`, `src/lib/tech/recordTestVerdict.ts:524`.

> **Left open on purpose.** `tap.ts:385-393` declares this fallback intentional: when a caller does not know the org, it discovers the owning org from the globally-unique `serial_unit_id`, and that discovered org then drives the writes. Removing it changes engine behavior, so it is a decision.
>
> **The path to closing it is shorter than the finding implies.** There are 11 `tapWorkflow` call sites; only three passed `orgId: … ?? null`, and `returns.ts:246` is no longer one of them — finding 1's fix made `organizationId` required upstream, so that site now always passes a real org. Two remain: `src/lib/neon/repairs-queries.ts:386` and `src/lib/tech/recordTestVerdict.ts:534`. Thread those two and the fallback branch in `loadTapState` becomes unreachable and deletable — which is also the precondition `tap.ts` itself names for FORCE-enforcing `item_workflow_state`.

**9. `serial_unit_provenance` — raw-pool read of a `security_invoker` view.** — **FIXED** (commit `2e614df4d`). `src/lib/photos/queries/unit-timeline-photos.ts:89` uses `pool.query` with no GUC, relying only on a caller-supplied literal predicate. `v_serial_unit_origins` is `WITH (security_invoker = true)`, so a raw-pool read inherits the pool role's privileges, not tenant RLS.

> **Fix landed.** `listUnitTimelinePhotos` moved from `pool.query` to `tenantQuery(organizationId, …)`, so the read carries `app.current_org` in addition to the predicates.
>
> **Exposure was lower than this finding reads.** `organizationId` was already a *required first parameter* and every arm of the query already carried `organization_id = $1`; both callers (`/api/serial-units/[id]/timeline-photos`, `/api/orders/[id]/timeline`) thread it from `ctx`. The GUC still matters for the `serial_unit_provenance` arm specifically, because `v_serial_unit_origins` is `WITH (security_invoker = true)` — that family inherits the reading role's privileges, and the pool role is the BYPASSRLS owner. The file's docblock advertised the raw-`pool` convention as intentional and has been corrected.

### Dormant but present (do not add a caller)

- `src/lib/picking/sessions.ts:479-483` — `UPDATE order_unit_allocations SET state='PICKED' WHERE id = $1`, no org.
- `src/lib/inventory/allocate.ts:190` — INSERT without `organization_id`. `src/lib/inventory/sync-legacy-pack.ts:205`.
- `src/lib/neon/quality-queries.ts:49` — no-orgId raw-pool read of `part_acquisitions`, no org predicate.
- `src/lib/neon/repairs-queries.ts:83, :212, :288` — orgId-optional raw-pool branches on `unit_repairs`.
- `src/lib/warranty/claims.ts` — `getClaim` / `listEvents` / `listRepairAttempts` raw-pool fallbacks (`:303` scoped branch, bare `pool.query` otherwise).
- `src/lib/neon/serial-units-queries.ts:1046` — bare `pool.query` UPDATE of `sku` when org absent.
- `scripts/sync-ecwid-incoming-repairs.js:240` — writes `repair_service` on a raw pool, entirely outside the tenancy SoT.
- `src/lib/workflow/tap-outbox.ts:62, :71, :111` — unpredicated `WHERE id = $1` UPDATEs and a deliberate cross-org `claimStaleTapIntents` scan on the owner pool (documented, flag-off).

---

## 6. Build order

### Tier 1 — zero new backend (build the leaf, compose existing readers)

| Leaf | Uses | Endpoint |
|---|---|---|
| D · Origin (provenance half) | `serial_unit_provenance` | `GET /api/serial-units/[id]` |
| E · Lifecycle timeline | `inventory_events`, `tech_serial_numbers` | `/api/inventory-events?serial_unit_id=`, `?include=full` |
| A · Condition & QA (partial) | `unit_failure_tags`, `unit_repairs`, `serial_unit_condition_history` | `/failure-tags`, `/repairs`, `?include=full` |
| B · Labels (print half) | `label_print_jobs` | `/print-history` — compose `UnitPrintHistory.tsx` |
| F · Order allocation | `order_unit_allocations` | `?include=full` |

Caveats to render, not to fix later: `?include=full` orders `conditions` and `tsn_links` **ASC** while `allocations` is **DESC**; `tech_serial_numbers` has five live DELETE sites and nullable FK, so absence is not evidence; a MANIFEST print row has `serial_unit_id` NULL and will not appear.

### Tier 2 — needs a unit-keyed read added (index already exists in every case)

| Add | Query | Index |
|---|---|---|
| `receiving_line_unit` reverse read | `WHERE serial_unit_id = $1` | `ux_receiving_line_unit_serial` |
| `testing_results` | `WHERE serial_unit_id = $1 ORDER BY created_at DESC` | `idx_testing_results_unit` |
| `unit_quality_scores` **read-only route** | mount `getUnitQuality` (`quality-queries.ts:199`, zero callers) | PK |
| `workflow_runs` + `item_workflow_state` | join `workflow_nodes` on `current_node_id` | `idx_workflow_runs_def_unit_created` |
| `unit_pack_placement_events` (+ current row) | `WHERE org, unit ORDER BY created_at DESC` | `idx_unit_pack_placement_events_org_unit` |
| `label_manifest_items` | join `label_manifests`, 0-or-1 row | `ux_label_manifest_items_one_live` |
| `warranty_claims` | add `serialUnitId` to `ListClaimsInput` + `LIST_COLUMNS` (`claims.ts:37-61`) | `idx_warranty_claims_serial_unit` |
| `sku_stock_ledger` | `WHERE ref_serial_unit_id = $1` | `idx_sku_stock_ledger_ref_serial_unit` |
| `order_unit_allocations` (extension) | add `a.returned_at, a.returned_reason` to `route.ts:191-194` + `AllocationRow` | — |

**Do not reuse `GET /api/serial-units/[id]/quality` on a preview surface** — it calls `recomputeUnitQuality` (`route.ts:43`), which runs an unconditional upsert (`quality-queries.ts:154-164`) on every GET. A read surface must not write.

**Do not expose `unit_repairs` writes on a preview leaf** — opening a repair drives `transition()` to `IN_REPAIR`.

Coverage caveats to render as empty states, not assume away: `sku_stock_ledger` is blind to the whole PACKED/BOXED→SHIPPED/BOXED lane (`src/lib/neon/stock-ledger-helpers.ts:48` via `src/lib/shipping/repository.ts:320`; `src/app/api/packing-logs/update/route.ts:290`; `src/lib/inventory/cycle-count.ts:206, :317`) plus bin adjustments — none stamp `ref_serial_unit_id`. `workflow_runs` / `item_workflow_state` are empty for every un-enrolled and pre-rollout unit (`src/lib/workflow/tap.ts:178`). `receiving_line_unit` materialises lazily — render "no slot recorded", never assume a row.

### Tier 3 — decision required before any build

| Family | Decision |
|---|---|
| `part_acquisitions` | Make a writer stamp `serial_unit_id` (and index it), or accept that the acquisition input to every quality score is permanently null. |
| `warranty_repair_attempts` | Either write the FK as `2026-07-03t` intended (needs a backfill), or join through `warranty_claims.serial_unit_id`, which works today with no migration. |
| `repair_service` | Needs both a writer and a read — and a product ruling, since presenting it as "this unit's repairs" contradicts the migration header. Default: don't. |
| `fba_shipment_item_units` | Check live row counts first. The only writing route has zero callers. |
| `workflow_tap_outbox` | Owner decision on the flag and the cron; verify the migration is even applied. Engine telemetry, not an operator fact — recommend never. |
| `sku` | Delete `syncSkuToSerialUnit` (`serial-units-queries.ts:1009`). Not a leaf. |

### Tier 0 — before any of the above

**Cleared 2026-08-21.** Findings 1, 6, 7 and 9 — the four live cross-tenant paths on tables this index will actually surface (`order_unit_allocations`, `sku_stock_ledger`, `inventory_events`, `serial_unit_provenance`) — are fixed, so no Tier 1 or Tier 2 leaf is blocked on tenancy any more. What remains is finding 8 (`item_workflow_state`, the deliberate cross-org read), which touches the `item_workflow_state` leaf only, and finding 2, which touches a table this index reads but does not write. Build the leaves; the three open items are tracked in §5 with the decision each one needs.

---

## Completeness critic — what this audit missed

## Gaps

### 1. The universe is wrong — the map is missing 4 live FK tables
`grep -niE "references +serial_units" src/lib/migrations/*.sql` returns **29 declarations across ~28 tables**, not 24. Absent from the map, all with live writers:

| Missing table | FK column | Writer | Read path |
|---|---|---|---|
| `serial_unit_listings` | `serial_unit_id` NOT NULL | `src/lib/inventory/markUnitListed.ts:98` (org-explicit UPSERT) | **none repo-wide** — write-only |
| `listing_photos` | `serial_unit_id` | `src/lib/photos/listing-photos.ts:117` | **live + unit-keyed + tenant-safe** (see §3) |
| `order_unit_amendments` | `original_unit_id`, `substitute_unit_id` | `src/lib/fulfillment/substitution.ts:285,:475` | order-keyed only (`/api/orders/[id]/amendments`) |
| `return_dispositions` | `serial_unit_id` | `src/lib/rma/authorizations.ts:489` | unit-keyed SELECTs exist at `src/lib/photos/queries/library.ts:655`, `authorizations.ts:692` |

**Do:** re-run the sweep keyed on `REFERENCES serial_units`, not on the column name. `order_unit_amendments` names neither FK `serial_unit_id`, and `unit_pack_placements` uses `unit_id` — a column-name sweep silently drops them. Then redo the headline arithmetic; "8 of 24" is over a universe that does not exist.

- `serial_unit_listings` belongs in **Absent** — it is the exact `unit_pack_placement_events` class (live writes, zero readers).
- `return_dispositions` is the missing half of Leaf F/H: *what happened when it came back*. Org is GUC-stamped-nullable by deliberate ruling (`2026-07-09a_drop_usav_fallback_org_defaults.sql:49`) — not a new security finding, but render NULL-org rows as absent.

### 2. Non-FK relations the sweep structurally could not see
- **`photo_entity_links` (`entity_type='SERIAL_UNIT'`, `entity_id`=unit id)** — a polymorphic link table, no FK. This is the real 25th family. The audit inherited "photos" from the prompt as a baseline blob and never treated it as a family with its own scoping and its own leaf.
- **Outbound edges are entirely absent.** `serial_units.handling_unit_id` → `handling_units` (`2026-06-08_handling_units_lpn.sql:82`) is a live "which LPN box is it in" fact and a direct competitor to Leaf C · Bench placement. `current_location` → `locations` and `sku` → `sku_stock` are already returned by `?include=full` as `location_detail` / `stock` (`route.ts:134`, `:146`) and appear nowhere in §6 Tier 1. **Do:** add an outbound-edge row set, or state explicitly that the map is inbound-only.
- **`entity_search_docs.serial_number` / `unit_uid`** (`2026-07-17d`, trigger at `2026-07-03d:205`) — a search projection, not a leaf, but it is what resolves `?sel=unit:<id>` in the first place. One line to dismiss it, not silence.
- No table relates to a unit by serial **string** as its only edge — `warranty_claims.serial_number` is a denormalized copy beside a real FK. That axis is clean.

### 3. Photo/media dimension — two live unit-keyed surfaces the audit never names
- **`GET /api/photos/listing-gallery?targetKind=unit&targetId=<id>`** — `withAuth`, `permission: 'photos.view'`, `getListingGallery` → **`tenantQuery`** with an explicit `organization_id = $1` predicate (`listing-photos.ts:77-83`). Live, reachable, tenant-safe, unit-keyed. **This is a 9th Tier-1 leaf requiring zero new backend, and the audit missed it.** Note it is a *curated listing gallery* (cover flag, sort_order), a different operator question from evidence photos — do not merge into the `photos` blob.
- **`GET /api/serial-units/[id]/timeline-photos`** → `listUnitTimelinePhotos` (`unit-timeline-photos.ts:85`) walks `serial_unit_provenance` → `receiving_line` → parent-carton PACKAGE shots. That is the **arrival-photo dimension of Leaf D**, and the audit cites this file only as security finding 9 without noticing it is a second unit-keyed read route.
- The baseline `?include=full` `photos` array comes from `listPhotosForEntity`, which is a bare **`pool.query`** (`service.ts:300`) with a literal org predicate — same class as finding 9, not `tenantQuery`. The audit's "known baseline, treat as done" framing hides that.

### 4. Load-bearing claims stated without evidence
- **"24 tables carry a FK"** — inherited from the brief, never verified, defines the whole universe, and is false (§1). Everything downstream ("8 of 24", "Right leaf count: 8", "Six of 24 FK relationships are not live") is arithmetic over it.
- **All four missing tables have zero entry in `src/lib/drizzle/schema.ts`** (`serialUnitListings`, `listingPhotos`, `orderUnitAmendments`, `returnDispositions` — 0 matches each). §4's stale-comment trap describes missing *columns* on three models; the actual shape is missing *tables*. Restate the caveat at that grain.
- §6's "index already exists in every case" is asserted for nine Tier-2 reads; I did not re-derive it, and it is load-bearing for effort estimates. Spot-check before committing to it.

### 5. Axes that hold
- The two security findings I re-derived are **accurate to the line**: `returns/page.tsx:89` does call `processReturnsIntake` from a `'use server'` action with no `organizationId` and no `requirePermission`; `sku/[sku]/page.tsx:186` does use bare `queryRaw` on `sku_stock_ledger` with no org predicate and leaks `ref_serial_unit_id`. Tier 0 stands as written.
- The serial-**string** relation axis is genuinely clean — no family relates by string alone.
