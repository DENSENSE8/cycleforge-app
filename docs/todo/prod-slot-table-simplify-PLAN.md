# PLAN — Simplify prod's slot table, then port from main

**Status:** steps 1–3 done · **Lane:** `prod` · **Written:** 2026-09-09 · **Updated:** 2026-09-10
**Next agent:** `docs/todo/prod-slot-table-SOT-HANDOFF.md`
**Constitution:** `src/lib/tables/table-engine-law.ts`
**Map:** `docs/todo/slot-based-metadata-table-PLAN.md` · `docs/todo/one-table-engine-orders-host-PLAN.md`
**Delete-zone:** `docs/kill-list/07-slot-table-hand-models.md`
**Mode:** direct (no branch). `AGENTS.md` forbids branches; `pnpm lane land` is the operator's.

---

## 0. Ruling

Simplify **in prod**. Do **not** overlay main's `DataTable.tsx` or `table-engine-law.ts`.

Evidence (line counts, this morning):

| File | prod | main | Overlay? |
|---|---:|---:|---|
| `DataTable.tsx` | 1803 | 1659 | **No** — prod is ahead (slot grouping) |
| `table-engine-law.ts` | 365 | 320 | **No** — prod is ahead |
| `useOrdersSpreadsheet.tsx` | 629 | 691 | **No** — main is fatter |
| `UnshippedTable.tsx` | 988 | 1008 | **No** — main still has URL search |

Cherry-pick from main is **surgical**: already landed the local find-bar. Next deletions are on prod's own tree.

```
URL / lane  →  catalog + SlotLayout  →  materializeTracks  →  DataTable
UnshippedTable = query / Ably / rowLimit. Not a grid.
```

Acceptance (law): *Registering a new backend table adds zero new .tsx and zero lines to any existing component.*

---

## 1. What "unified" already is

To-ship already paints the engine:

```tsx
const chrome = useToShipChrome(...)
const sheet = useOrdersSpreadsheet({ searchValue: chrome.search.value, ... })
<DataTable {...sheet} {...chrome} />
```

Find-bar is session-local. `filterShippedOrdersByQuery` narrows painted rows. Shipped uses the same spreadsheet hook via `OrdersGridHost`.

The remaining fork is **glue**, not display: `OrdersGridHost` (110 lines) still wraps four outbound lanes.

---

## 2. Anti-patterns (adversarial)

| Move | Why it fails |
|---|---|
| `git checkout main -- src/components/tables/DataTable.tsx` | Drops 144 lines of prod grouping |
| Cherry-pick `UnshippedTable.tsx` from main | Reintroduces `?search=` + API refetch |
| New `UnshippedGridHost` | The host this plan deletes |
| `family === 'orders'` inside DataTable | Violates ENGINE_IS_MONOMORPHIC |
| Split UnshippedTable "to simplify" before killing the host | Moves feed code; the fork is the host |
| `eval:cohort overlay` | Does not exist. Display eval is `slot-table` only |
| Putting find-bar back on the URL "for deep links" | Soft-nav remount; operator already forbade it |

Rollback per step: the step's file list is the revert set. Cohort green is the gate; a red cohort does not land.

---

## 3. Steps (serial unless noted)

### Step 1 — Correct the search law in DataTable

**Context:** `DataTable.tsx:39` still says the URL is search state. To-ship and Shipped find-bars are local. Leaving the comment teaches the next agent to restore `?search=`.

**Do:**
- Rewrite rule 3: filters / tabs / sort may stay URL; **search is session-local** and filters painted rows.
- Point at `filterShippedOrdersByQuery` / `useCompoundSpreadsheet`'s `search.value` filter as the two engine paths.
- Do not change runtime.

**Verify:** `node --import tsx --test src/lib/tables/data-table-search-url.guard.test.ts`

**Exit:** the word `URL stays the state` is gone from `DataTable.tsx`. Guard still 6/6.

### Step 2 — Inline `OrdersGridHost` (the simplification)

**Context:** To-ship already inlined. Remaining mounts:

- `DashboardShippedTable.tsx`
- `StagedQueueTable.tsx`
- `ReviewPackingTable.tsx`
- `ReviewPairingTable.tsx`

The host only adds `totalCount` + copy-export shape. Both must survive on every paged lane (status bar must not read "200 of 200").

**Do:** copy UnshippedSheet's spread. Pass `totalCount` and `copyExport` into `DataTable` directly. Delete `OrdersGridHost.tsx`. Grep `src/` + `tests/` for the name.

**Verify:** `npx tsc -p tsconfig.json --noEmit` · `pnpm run eval:cohort slot-table`

**Exit:** zero TS/TSX imports of `OrdersGridHost`. Shipped / Staged / Review still paint, still copy, still show a real denominator.

**Do not parallelize** with Step 3 — same files.

### Step 3 — One find-bar waist (orders family only)

**Context:** four setters already local (`useDashboardSearchController`, `useShippedTableFilters`, `useOutboundUrlState`, `useWorkbenchSearchParam`). Review pairing may still write URL. Staged uses `setQ` (now local).

**Do:**
- Grep `params.set('search'` and `params.set('q'` under `src/components/{shipped,unshipped,outbound,features/review}`.
- Any remaining keystroke writer becomes `useState`.
- Keep `filterShippedOrdersByQuery` as the orders matcher (do not invent a second).

**Verify:** extend `data-table-search-url.guard.test.ts` only for files this step touches. Existing 6 tests stay green.

**Exit:** typing on To-ship, Shipped, Staged, Review packing/pairing never changes the query string.

### Step 4 — Do not grow UnshippedTable

**Context:** 988 lines is the feed (Ably, lane lock, paperwork walk, load-more). The plan of record says it stays.

**Do:** nothing, unless Step 2 leftover `searchValue=""` / dummy `onClearSearch` can be deleted from the UnshippedSheet props without a second mount path.

**Exit:** UnshippedTable still has no column array and no `<table>`.

### Step 5 — Main deltas worth reading, not copying

After Steps 1–3 are green, **diff these as patches**, accept only lines that delete forks:

- `src/lib/tables/slot-table-cohort.ts`
- `src/lib/tables/slot-table-header-sort.ts`
- `src/components/tables/compound/*`

Reject any hunk that:
- reintroduces URL search
- shrinks DataTable
- adds a host
- touches `docs/eval/**/LEDGER.md` (agent-unwritable)

**Verify:** `pnpm run eval:cohort slot-table` after each accepted hunk.

### Later (not this plan)

- `ReceivingGridHost` → same UnshippedSheet pattern (`one-table-engine-orders-host-PLAN.md` §9)
- HAND_HTML_TABLE_DEBT
- FBA board skipped the rebuild (`one-table-sot-teardown-FINISH.md` §7)

---

## 4. Dependency graph

```
Step 1 (comment law) ──► Step 2 (kill host) ──► Step 3 (find-bar grep)
                              │
                              └──► Step 4 (feed stays)
Step 5 only after 1–3 green.
```

No parallel file owners. One lane: prod.

---

## 5. Verification (every step)

```bash
cd ~/Projects/cycleforge-lanes/prod
npx tsc -p tsconfig.json --noEmit
node --import tsx --test src/lib/tables/data-table-search-url.guard.test.ts src/lib/tables/table-engine-law.test.ts
pnpm run eval:cohort slot-table
```

Never start `:3050`. Never `next dev`. Operator runs `pnpm lane verify prod`.

---

## 6. Stop condition

- `grep -r OrdersGridHost src tests` → zero TS/TSX imports
- Find-bar on To-ship **and** Shipped does not write the URL
- `pnpm run eval:cohort slot-table` ok
- No new `.tsx` for a family
- Main's DataTable / UnshippedTable were **not** copied over
