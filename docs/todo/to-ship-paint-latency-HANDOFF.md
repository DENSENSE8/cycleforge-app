# Handoff — `/shipping/orders` paint latency

**Goal:** Lighthouse **performance ≥ 92** on the To-ship desk.
**Today:** ~60 s to paint on the dogfood tenant. `/dashboard` — the closest
sibling — baselines at **performance 67, LCP 12.2 s**
(`lighthouse-baseline.json`). `/shipping/orders` is **not in the Lighthouse
manifest at all**; only `/shipping` (tier 2) is.

**Status:** root cause found and *measured against the live DB*. Nothing fixed.

---

## 1. The answer in one line

Two correlated `EXISTS` subqueries over `station_activity_logs.metadata->>` run
**once per candidate order**, with no index that can serve them — and the RSC
pays them **twice, serially**, before it emits a byte of HTML.

`EXPLAIN ANALYZE` against the live dogfood DB:

| Query | Wall | The hot node |
|---|---|---|
| `/api/orders` (list, 148 rows) | **13.2 / 17.7 / 25.9 s** over three runs | `SubPlan 13`: `loops=1010`, 23.4 ms each ≈ **23.6 s**, `Rows Removed by Filter: 29852` *per loop* |
| `/api/orders/queue-counts` | **18.9 s cold / 14.0 s warm** | `Buffers: shared hit=1306560`, of which **97 %** is those two subplans |

**The control that settles it:** the same queue-counts query with the two
order-grain predicates swapped for the index-supported shipment-grain form
(`sal.shipment_id = o.shipment_id`, hitting `idx_station_activity_logs_shipment_id`)
returns the same answer in **106 ms**. That is **12 553 ms → 106 ms, ~118×**,
and the only thing that changed is the predicate.

Combined serial server-side DB time on one cold render: **~25–45 s of the 60.**

### Why it is not a dev-server artifact

Every number above came from a standalone Node script talking to Neon directly —
no Next.js, no Turbopack, no React. Runs 2 and 3 were *slower*, not faster, so it
is not cold-cache warmup. And `.env` carries **`REDIS_CACHE_DISABLED=true`**, so
`getCachedJson('api:orders', …)` and the queue-counts cache never hit: **every
load pays both queries in full.** Turbopack on-demand compile is real and
additive on a first visit, but it cannot explain a cost that lives entirely
outside the compiler and repeats on every load.

---

## 2. Where it lives

[`src/lib/orders/order-grain-sql.ts:68`](../../src/lib/orders/order-grain-sql.ts)
(`sqlOrderHasPackScan`) and `:30` (`sqlOrderHasTechScan`) are each a disjunction:

```sql
(EXISTS (…) OR (SQL_SHIPMENT_IS_SOLE_ORDER AND EXISTS (…)))
```

Postgres only pulls an `EXISTS` sublink up into a semi/anti-join when it is a
top-level `AND` conjunct. Under `OR` the correlated branch stays a `SubPlan` and
re-executes per outer row. The planner *did* hash the uncorrelated
shipment-grain branches — those are cheap. Only the genuinely correlated
`metadata->>` branches stay per-row, and those are exactly the expensive ones.

Call sites:

| File | Line | Role |
|---|---|---|
| `src/app/api/orders/route.ts` | 619 | `AND NOT …HasPackScan` — the `fulfillmentScope` filter, per candidate row |
| `src/app/api/orders/route.ts` | 504 | `…HasTechScan AS has_tech_scan` — a SELECT-list sublink (always a subplan) |
| `src/app/api/orders/route.ts` | 650/652 | `?stage=` adds a second textually identical copy; PG does not CSE across WHERE and SELECT |
| `src/app/api/orders/queue-counts/route.ts` | 95 | both fragments again, with `HasTechScan` as a **GROUP BY key** over the whole candidate set — cannot be limited |

**No index supports them.** `station_activity_logs` has
`(station, staff_id, created_at)`, `(shipment_id) WHERE NOT NULL`,
`(organization_id, created_at)` and some partials — but nothing on
`activity_type`, and no expression index on `metadata->>'order_row_id'` or
`metadata->>'order_id'`. `src/lib/drizzle/schema.ts:1143` declares the table with
no index block, so the migrations are the whole story. Best available path is a
full org scan: **29 852 rows discarded on every one of 1 010 loops.** A
`NOT EXISTS` — the common case, the order is *not* packed — cannot short-circuit,
so it pays the full scan every time.

Scale today: 31 347 SAL rows / 15 MB; 4 132 orders, 3 927 in `fulfillmentScope`,
1 010 reaching the `NOT EXISTS`. **This grows with lifetime scan history even if
the visible queue never changes.**

---

## 3. Fix order

### Step 1 — kill the per-row subplans *(this is the minute)*

Make the correlated branch index-supported, or precompute it. Options, cheapest
first:

1. **Expression + composite indexes** on `station_activity_logs`:
   `(organization_id, activity_type)` and expression indexes on
   `metadata->>'order_row_id'` / `metadata->>'order_id'`. Cheapest change;
   verify with `EXPLAIN` that the `SubPlan` loops collapse.
2. **Restructure so the sublink can be pulled up** — split the `OR` into a
   `UNION`/`LATERAL` or a precomputed join, so PG can plan a semi/anti-join once
   instead of a subplan per row.
3. **Denormalise the fact.** The 106 ms control works because
   `shipment_id` is a real indexed column. If pack/tech state can live on the
   order row (or a narrow join table) written by the state machine, the predicate
   becomes a column read.

Follow the repo's law here: any status/lifecycle fact must be written through
`transition()` / `transitionReceivingLine()`, never a raw `UPDATE`, and a new
column lands **expand → code → contract** (migration first, readers second).

### Step 2 — stop paying it twice, serially

[`unshipped-queue-seed.server.ts:83`](../../src/lib/queries/unshipped-queue-seed.server.ts)

```ts
rows   = await fetchUnshippedRows();    // serverSelfFetch('/api/orders?limit=200')
counts = await fetchUnshippedCounts();  // serverSelfFetch('/api/orders/queue-counts')
```

Independent, but sequential — and each is a real HTTP round trip back into the
app's own origin (`cache: 'no-store'`, cookie forwarding, full `withAuth`
re-authentication) to reach a function in the same process. `Promise.all` them,
then delete the self-HTTP hop by importing the query directly. Keep the
per-call soft-failure semantics — the client re-fetches on failure.

**This was my first diagnosis and it is NOT the main cost.** It roughly doubles
step 1's cost; it does not create it. Do step 1 first.

### Step 3 — the duplicate and unbounded callers

- `queue-counts` is fetched **twice** on the desktop desk under two keys
  ([`OutboundSidebarFilterMap.tsx:62`](../../src/components/unshipped/OutboundSidebarFilterMap.tsx)),
  and again per `PackBenchRefineFacet` mount.
- [`dashboard-warm.ts:30`](../../src/lib/queries/dashboard-warm.ts) prefetches a
  cache key **nothing renders**, with **no `limit`** — an unbounded duplicate
  `/api/orders` on every desk mount and every settled search keystroke.
- [`dashboard-table-data.ts:145`](../../src/lib/dashboard-table-data.ts) — search
  runs the heaviest variant: unbounded, full-shape, cache-bypassed, per keystroke.
- `limit` caps *payload*, not *work* — `LIMIT` is appended after every CTE, join,
  subplan and sort (`route.ts:810`).
- Keyset pagination is dead code; "Load more" re-runs the whole query and clamps
  at 500 (`UnshippedTable.tsx:397`).

### Step 4 — bundle, for the Lighthouse number

Root causes are static imports of branches that never render on this route:

| File | Cost |
|---|---|
| `OutboundOrdersDesk.tsx:28` — `SupportOrdersFocusHost`, only under `?context=support` | 197 modules, ~1.04 MB source |
| `shipping/layout.tsx:6` — `OutboundSidebarPanel`, defeating the `next/dynamic` split `SidebarContextPanel` already applies | 107 modules, ~625 KB |
| `OutboundSidebarPanel.tsx:5` — dispatcher statically importing all four branches | 67 modules, ~285 KB |
| `SurfaceGate.tsx:17` — imports `SurfaceRenderer → StationSlot` for a branch its own docblock calls a no-op | 19 modules, ~136 KB |

**Measure in a production build.** Dev chunk counts are not the production
number.

### Step 5 — render cost (TBT)

- [`UnshippedTable.tsx:315`](../../src/components/unshipped/UnshippedTable.tsx) —
  re-filters and re-derives the **entire grouped row model on every render**, no
  memo on `records`.
- [`OrdersQueueTableRow.tsx:361`](../../src/components/dashboard/orders-queue/OrdersQueueTableRow.tsx) —
  computes the whole FLAT-layout cell payload per row per render, but To-ship
  mounts the **COMPOUND** model, so none of it can render.
- [`useCatalog.ts:218`](../../src/hooks/useCatalog.ts) — `useOrderChannelLabel()`
  runs **per row**: two react-query observers each, ~60 subscriptions per window.
- Every row is a `motion.div` though To-ship disables presence *and* layout
  animation (`:822`).

**Two correctness bugs found in passing** — worth fixing regardless of perf:
the row `memo` comparator omits fields the compound cells read, so **live patches
do not repaint** (`:1002`); and `renderLeaf`'s dep array omits `columnDisplay`
(`useOrdersSpreadsheet.tsx:315`).

---

## 4. Measure

```bash
npx playwright test tests/e2e/toship-perf.spec.ts --project=qa-desktop --reporter=list
```

**Use `--project=qa-desktop`.** The `desktop` project is unauthenticated in this
checkout — it 401s and silently measures the *sign-in* page, reporting a fast,
healthy load that hides the entire problem. I made that mistake first.

Note the QA org has ~1 order, so it will **not** show the SQL cost — it measures
shell/bundle/render only. For the SQL, `EXPLAIN ANALYZE` against dogfood is the
instrument.

For scoring, add `/shipping/orders` to the manifest in
[`scripts/lighthouse-audit.mjs:34`](../../scripts/lighthouse-audit.mjs) as
tier 1, then:

```bash
node scripts/lighthouse-mint-session.mjs      # prints LH_COOKIE=…
LH_COOKIE=… pnpm lighthouse:audit --routes /shipping/orders
```

Lighthouse runs against a local **production** server, never dev.

---

## 5. Two cautions

- **92 deserves a sanity check before it is committed to.** No tier-1 route is
  near it; `/dashboard` sits at 67 with a 12.2 s LCP. Step 1 should be dramatic
  (a 118× control is not subtle), but the score also depends on bundle and TBT,
  so measure after each step rather than assuming step 1 lands it.
- **This tree has several sessions writing to it.** Check `git status` before
  attributing anything you find to your own change.

---

*Evidence: 45-agent parallel investigation with adversarial verification;
the SQL findings were confirmed by `EXPLAIN ANALYZE` against the live dogfood DB
via a plain `pg` client, including the 106 ms control rewrite.*
