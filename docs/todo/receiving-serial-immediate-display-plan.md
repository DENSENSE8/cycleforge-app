# Receiving unbox — immediate serial-number display (no loading, no skeleton)

**Goal:** when the operator opens a receiving/unbox line, the serial number(s) render **on the
first frame** — same as SKU, price, and condition today — with **no spinner, no skeleton, no
visible populate**. The loading skeleton shipped in the prior pass is a *fallback of last resort*;
after this plan it should essentially never appear because the serial data is already in the
client's hands at paint time.

Status: **PLAN** (2026‑07‑13). Supersedes the "skeleton is the answer" framing — a skeleton is
still a *loading* affordance; the requirement is *no load at all*.

---

## 1. Root cause — why serials lag while SKU/price/condition are instant

The active line paints instantly from a **placeholder row** (`placeholderActiveRow={row}` →
`usePoLinesData` `placeholderData`). That row is a **rail / table list row**, and the list read
model carries `sku`, `unit_price`, `condition_grade`, `item_name` **as columns** — but **not
serials**. Serials are never part of the list SELECT.

- **List SELECT** (`src/lib/receiving/lines/build-sql.ts` — `buildReceivingLinesListSql`,
  `buildReceivingLinesByReceivingIdSql`) is `SELECT rl.* + rlt/rz facts joins`. **No serial columns.**
- Serials are bolted on **only** when `?include=serials` via `fetchSerialsForLines`
  (`src/app/api/receiving-lines/route.ts:50-112`) — a **two-round-trip** resolution:
  1. `DISTINCT` join over `serial_units` + `v_serial_unit_origins` + `serial_unit_provenance` +
     an `EXISTS` on `inventory_events`, then
  2. `resolveCurrentReceivingLineIds(...)` (a second sequential DB call).

### The two open paths behave differently

| Open path | Serials known at paint? | Why |
|---|---|---|
| **Scan → open** (`src/components/sidebar/receiving/scan-apply.ts`) | **Yes (instant)** | It `seedReceivingSiblingsCache(...)` from lookup‑po **and** `queryClient.fetchQuery(['receiving-siblings', id])` with `include=serials`, so the accordion mounts from a warm cache. |
| **Row‑click → open** (rail / History table row) | **No (delayed)** | `selectedLine` is set from a list row with `serials: undefined`; `useReceivingLineNavigation` (`useReceivingLineNavigation.ts:37-70`) then **lazily** fetches `?receiving_id=…&include=serials`. That fetch is the visible lag. |

So the fix target is unambiguous: **make the row‑click (and deep‑link / arrow‑nav) paths carry
serials the way the scan path already does** — i.e. serials present in the row/cache *before* the
workspace opens.

### Consumers that read `row.serials` (the contract we must preserve)

`row.serials` on the `['receiving-siblings', receivingId]` cache is the single SoT for:
`PoLineRow` chips, `cartonUnitIds` (LPN "Add to box"), `useLineSerials` optimistic
add/remove/replace, `useUnboxLineController` serial prefill, `useZohoLinePrefill`, the progress
stepper's serial count. **Any solution must keep serials landing on that same shape** — we hydrate
it *earlier*, we do not move it.

---

## 2. Strategy — pre‑seed the row, keep authoritative reconcile

Two complementary tiers. Ship Tier A immediately (no migration, low risk, big perceived win),
then land Tier B as the durable "always instant, always correct" read‑model.

Both keep the existing authoritative `?include=serials` hydration (the parallel query added in the
prior pass, `usePoLinesData`) as the **background reconcile** — correctness never depends on the
denorm/seed; it only makes the *first frame* correct.

---

## Tier A — eager batch seed of visible rows (interim, no schema change)

**Idea:** the scan path already proves seeding works. Generalize it: whenever a receiving **feed**
(rail or History table) resolves, do **one** batched serial fetch for the visible cartons and seed
each `['receiving-siblings', receivingId]` cache **and** patch `row.serials` onto the feed rows.
Then a row‑click is a warm‑cache open = instant, identical to the scan path.

### A1. Batch serials endpoint

Extend `GET /api/receiving-lines` (or add `GET /api/receiving-lines/serials`) to accept
`?receiving_ids=1,2,3&include=serials` and return `{ serialsByLine: Record<lineId, LineSerial[]> }`
(or `receiving_lines[]` grouped). Reuse `fetchSerialsForLines` — it already takes a `lineIds[]`, so
batching N cartons is one call, not N.

- Route: `src/app/api/receiving-lines/route.ts` (new `receiving_ids` branch in
  `handleReceivingLinesGet`, before the single/paginated branches).
- Cap the batch (e.g. ≤ 50 cartons) and org‑scope exactly as today.

### A2. Feed → seed hook

Add `useHydrateVisibleSerials(queryClient, rows)`:
- Collect distinct `receiving_id`s from the currently‑cached rail/table rows that **don't already**
  have serials in their `['receiving-siblings', id]` cache.
- Debounced single batch fetch (A1), then for each carton:
  `seedReceivingSiblingsCache(queryClient, id, rows)` / overlay serials onto the metadata cache
  using the **same in‑flight‑optimistic guard** already in `usePoLinesData`'s overlay effect
  (never clobber an `_optimistic:'adding'` serial).
- Also patch `serials` onto the rail/table row caches (`['receiving-lines-table', …]`) so
  `placeholderActiveRow` itself carries serials → the accordion's `placeholderData` is complete on
  frame 1.

Wire it in the rail (`ReceivingFeedRail.tsx`) and the History/Incoming table so it runs once per
feed load and on feed refresh.

### A3. Prefetch‑on‑intent (optional polish)

On row **hover / focus** (before click), `queryClient.prefetchQuery(['receiving-siblings', id],
…include=serials)`. Cheap insurance for the case where a carton scrolled in after the batch seed.

**Tier A cost/risk:** one extra batched request per feed load; no schema change; fully reversible;
reuses the proven scan‑path seeding. The skeleton stops appearing on warm rails.

---

## Tier B — denormalized serial projection on the read model (durable, always instant)

Tier A is warm‑cache dependent (cold deep‑link, or a carton not yet batched, still fetches). Tier B
makes serials a **native column of the line read model**, so **every** path — cold deep‑link,
first paint, arrow‑nav — carries serials with **zero** extra query.

### Chosen shape — B2: maintained denorm column (read‑model, house pattern)

Add to `receiving_line_testing` (the per‑line 1:1 facts table — `rlt`) a compact serial projection,
maintained by the serial writer. `rlt` is already LEFT JOINed in every list SELECT, so surfacing
it is free.

**Column:** `serial_projection jsonb` — array of `{ id, serial_number, condition_grade }`
(the exact `LineSerial` display shape). A `jsonb` array keeps it one column, ordered, and directly
renderable — no join, no `array_agg` at read time.

> Rationale for a maintained column over a read‑time `LATERAL` (B1): the correct "current line" of a
> serial requires the provenance / `inventory_events` resolution (`resolveCurrentReceivingLineIds`)
> — too heavy to inline on a paginated list. A projection written **once at attach/detach time** is
> O(1) to read and always reflects the current line. This mirrors the existing station / shipped
> read‑model pattern (see memory: *station read models*, *shipped‑table read model*).

### B‑steps

1. **Migration** `src/lib/migrations/2026-07-13_receiving_line_serial_projection.sql`
   - `ALTER TABLE receiving_line_testing ADD COLUMN IF NOT EXISTS serial_projection jsonb NOT NULL
     DEFAULT '[]'::jsonb;` (guarded `DO $$` block, idempotent — house migration rules).
   - Tenant‑from‑birth already satisfied (rlt is org‑scoped); no new table, so no
     `enforce_tenant_isolation` call needed.
   - Model in Drizzle (`src/lib/drizzle/schema.ts`, the `receiving_line_testing` pgTable) in the
     same PR (schema‑SoT rule).

2. **Writer** — the projection is (re)computed whenever a serial attaches/detaches/re‑grades.
   Single helper `refreshLineSerialProjection(orgId, lineId, deps)` in
   `src/lib/receiving/facts/narrow.ts` (or a new `serial-projection.ts`), called inside the same
   transaction as:
   - `POST /api/receiving/scan-serial` (attach) — `route.ts:71`.
   - `DELETE /api/receiving/scan-serial` (detach) — `route.ts:372`.
   - `POST /api/serial-units/[id]/grade` (re‑grade — updates `condition_grade`).
   - The `PATCH /api/receiving-lines` "For Parts" auto‑sort that moves serials out
     (`route.ts:738`).
   Compute from the same authoritative query `fetchSerialsForLines([lineId])` (single line → cheap),
   write the array to `rlt.serial_projection`. Reuse the existing `invalidateCacheTags` /
   `publishReceivingLogChanged` that already fire on those paths.

   > **Current‑line moves:** when a re‑received serial's current line changes, refresh **both** the
   > old and new line's projection (the mutation knows both ids). This is the one correctness edge a
   > naive origin‑join (B1) would miss.

3. **Backfill** (same migration or a follow‑up script): populate `serial_projection` for existing
   lines from `fetchSerialsForLines` grouped by current line. ~1.4k lines (per the unbox‑stepper
   memory) → a one‑shot batched backfill, mirror the `label_printed_at` backfill precedent
   (2026‑07‑12).

4. **Read** — surface it in the list builders as `serials`:
   - In `build-sql.ts`, add `COALESCE(rlt.serial_projection, '[]'::jsonb) AS serials` to
     `buildReceivingLinesListSql` **and** `buildReceivingLinesByReceivingIdSql` (and the single‑row
     builder). Then **every** row arrives with `serials` populated — no `include=serials` needed for
     display.
   - `normalizeRow` passes `serials` through unchanged (already handles the field when present).
   - Keep `?include=serials` as the **authoritative** path (returns the live `fetchSerialsForLines`
     result) so reconcile still corrects any projection drift; the projection is the *fast default*.

5. **Client** — because rows now natively carry `serials`, `placeholderActiveRow` is complete and
   `usePoLinesData`'s metadata query already returns serials. The parallel `include=serials`
   hydration becomes a pure background reconcile (unchanged). `serialsLoading` is now false on the
   first frame in the common case → skeleton never shows.

### Alternative B1 (rejected as the primary, kept as a fast‑ship fallback)

Read‑time `LEFT JOIN LATERAL (SELECT jsonb_agg(jsonb_build_object('id',su.id,'serial_number',
su.serial_number,'condition_grade',su.condition_grade) ORDER BY su.created_at)
FROM serial_units su WHERE su.origin_receiving_line_id = rl.id AND su.organization_id =
rl.organization_id) sp ON true`, surfaced as `serials`.
- **Pro:** no writer wiring, no backfill, no migration to a column — one join edit.
- **Con:** keys on **origin** line, so a re‑received serial that moved to a different current line
  displays on the wrong line until reconcile; and it adds a per‑row subquery to every paginated list
  (cost on large History pages). Acceptable for the unbox/PO‑siblings view (origin ≈ current there),
  **not** for the global History list. Use only if B2's writer wiring must be deferred.

---

## 3. Recommended sequencing

1. **Now (client, done):** parallel serials query + no‑clobber overlay + skeleton fallback
   (`usePoLinesData`, `PoLineRow`, `SerialChipSkeleton`). Keep — it's the reconcile + last‑resort UI.
2. **Ship 1 — Tier A** (batch seed of visible rows): instant on warm rails/tables, no migration.
3. **Ship 2 — Tier B2** (maintained `serial_projection` read‑model): instant on **all** paths incl.
   cold deep‑link; retire reliance on Tier A's prefetch. Flag‑gate the read (`serials` from
   projection vs. `include=serials`) during rollout, then default on.
4. **Server cleanup (from the earlier plan's step 4):** collapse `fetchSerialsForLines`' two
   sequential round‑trips into one CTE/LATERAL — benefits the reconcile path and the backfill.

---

## 4. Files touched

**Tier A**
- `src/app/api/receiving-lines/route.ts` — `receiving_ids` batch branch.
- `src/components/sidebar/receiving/` — new `useHydrateVisibleSerials`, wired in
  `ReceivingFeedRail.tsx` + History/Incoming table.
- `src/lib/queries/receiving-queries.ts` — seed/overlay helpers (reuse `seedReceivingSiblingsCache`).

**Tier B2**
- `src/lib/migrations/2026-07-13_receiving_line_serial_projection.sql` (+ Drizzle model).
- `src/lib/receiving/facts/narrow.ts` (or `serial-projection.ts`) — `refreshLineSerialProjection`.
- `src/app/api/receiving/scan-serial/route.ts` (POST + DELETE), `src/app/api/serial-units/[id]/grade/route.ts`,
  `src/app/api/receiving-lines/route.ts` (PATCH parts‑sort).
- `src/lib/receiving/lines/build-sql.ts` — surface `serials` from `rlt.serial_projection`.
- Backfill script.

**Both** — no change required to `PoLineRow` / `usePoLinesData` beyond what's shipped; they simply
receive serials earlier.

---

## 5. Tests

- **Unit (Deps‑injected):** `refreshLineSerialProjection` writes the expected jsonb from a faked
  `fetchSerialsForLines`; attach/detach/re‑grade each refresh the right line(s); a current‑line move
  refreshes both old + new.
- **SQL builder:** `build-sql.test.ts` — assert `serials` (from `rlt.serial_projection`) is present
  and byte‑stable in both list builders.
- **Route:** batch `receiving_ids` returns grouped serials, org‑scoped, capped.
- **Client:** extend `po-lines-accordion-meta-order.test.ts` — a row that already carries `serials`
  renders chips with **no** `SerialChipSkeleton` in the tree (assert immediate paint).
- **Regression:** optimistic add/remove still wins over a concurrent projection refresh (in‑flight
  guard).

## 6. Risks & mitigations

- **Projection drift** (writer misses a path) → the authoritative `include=serials` reconcile on
  open self‑heals the display; projection is never the sole source. Add the writer to *every*
  serial‑mutating route (enumerated above) and cover with unit tests.
- **List query cost** (B2) → reading a `jsonb` column is free (already joining `rlt`); no new join.
  (B1 would add cost — that's why B2 is primary.)
- **Backfill load** → batched, one‑shot, mirrors the `label_printed_at` precedent.
- **Cross‑tenant leakage** → projection lives on org‑scoped `rlt`; batch endpoint org‑scopes like
  every other branch.

## 7. Acceptance criteria

- Row‑click, deep‑link, and arrow‑nav opens all show serial chips on the **first painted frame**
  (no skeleton, no populate flash) for lines that have serials.
- `SerialChipSkeleton` appears only in the genuine cold‑miss window (Tier A not yet seeded and
  projection unavailable) — effectively never once Tier B2 ships.
- Optimistic scan add/remove is never clobbered by a projection refresh.
- No cross‑tenant serial exposure; no regression in `build-sql.test.ts` /
  `po-lines-accordion-meta-order.test.ts`.
