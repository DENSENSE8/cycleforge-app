# HANDOFF — org custom columns: sort landed, grid-var P0 fixed, what's left

**Self-contained.** A fresh session can execute from this file alone.
**Lane:** `main` (dogfood checkout) · attach to the running dev server on **`:3050`**, never start one.
**Date:** 2026-08-09 · **Status:** work below is DONE and **uncommitted**; §5 is the remaining queue.

---

## 1. What shipped in this pass

### 1a. Gap #1 — custom columns are now SORTABLE (receiving family)

| Change | File |
|---|---|
| `isReceivingGridSortable` admits `custom:*` by key SHAPE | [`receiving-grid-layout.ts`](../../src/lib/receiving/receiving-grid-layout.ts) |
| `compareReceivingGridRows` custom branch — runtime-type dispatch, blanks-last, id tiebreak | [`receiving-grid-compare.ts`](../../src/lib/receiving/receiving-grid-compare.ts) |
| +9 comparator cases, +3 predicate cases | the two matching `*.test.ts` |

**Why the predicate is the whole fix:** three consumers read it — the descriptor's `isSortable`, the
column header's click-to-sort, and `useUrlColumnSort`'s `isColumn` guard. Admitting a key there makes
it clickable **and** durable in `?colsort=` as one unit. Custom columns merge in at RUNTIME from
`custom_field_defs`, so they can never appear in the static `RECEIVING_GRID_SORTABLE_KEYS` derivation.

**Comparator contract (deliberate, documented in-file):**

- Dispatches on the value's **runtime type**. `hydrateCustomFieldMaps` already emits typed JSON per
  def (`to_jsonb(value_number)` → number, date → ISO `YYYY-MM-DD`, boolean → boolean), verified in a
  live response as `jsType: 'number'`. So the comparator needs no def lookup and stays pure/sync.
- **Blanks sort LAST in BOTH directions**, escaping the sign — spreadsheet convention. This
  deliberately differs from `date`'s `+Infinity` (which floats undated rows to the TOP under `desc`):
  tolerable for a column every row fills, wrong for a custom column that is empty until backfilled.
- Stale `?colsort=custom:<archived>` degrades to all-blank ⇒ stable id order, never a throw.

### 1b. P0 found while testing — custom columns destroyed the ENTIRE grid layout

Not a sort bug. Pre-existing, shipped in `d7a02ef69`, unhit only because **no org had ever created a
custom field**.

`gridColVar('custom:qa_rack_slot')` emitted `--cf-col-custom:qa_rack_slot`. **A CSS custom-property
name may not contain a colon**, so `var(--cf-col-custom:…, 5rem)` is a parse error — which
invalidates the whole `grid-template-columns` declaration and drops **every track on the row**, not
just that one.

Measured in-browser on Unbox History before the fix:

```
inline grid-template-columns : ""            ← entire declaration dropped
computed                     : "1079px"      ← one implicit full-width track
custom cells                 : w=26/19/12px, h=0   ← content-sized, zero height
header                       : w=1079px      ← stretched across the row
probe: var(--cf-col-custom:x, 5rem)  → "(REJECTED — empty)"
probe: var(--cf-col-custom-x, 5rem)  → accepted
```

**Fix:** one sanitizer in `gridColVar` ([`grid-column-geometry.ts`](../../src/design-system/components/grid/grid-column-geometry.ts)) —
`key.replace(/[^A-Za-z0-9_-]/g, '-')`. Every existing key (`title`, `qty`, `last_counted`, `_fill`)
maps to itself, so it cannot move a shipped surface. New unit suite:
`src/design-system/components/grid/grid-col-var.test.ts`.

> **Land this independently of everything else if the rest stalls.** It is a latent grid-breaker for
> the first tenant who creates a field, and it is a 1-line change behind 4 mutation-proven tests.

### 1c. QA-org fixtures + E2E

- `QA_FIXTURE_CUSTOM_FIELD` in [`qa-org.ts`](../../src/lib/tenancy/qa-org.ts) — a `number` def
  (`qa_rack_slot` / "QA Rack Slot") plus values **2.25** and **2.5** on the two testing-feed lines.
- [`provision-qa-org.ts`](../../scripts/provision-qa-org.ts) seeds def + values **and** the QA
  admin's `staff_preferences` opt-in under **both** the `receiving` and `testing` buckets (the merged
  column is `tier: 'optional'`, so it is hidden until a staffer opts in; the two mounts of the same
  binding keep independent Fields deltas). Idempotent via `jsonb_agg(DISTINCT …)`.
- [`tests/e2e/custom-column-sort.spec.ts`](../../tests/e2e/custom-column-sort.spec.ts) — 4 tests.

**The decimal fixture is load-bearing, not arbitrary.** `2` vs `10` passes *even with the numeric
branch deleted*, because the string fallback's `numeric: true` collation handles whole numbers. That
collation treats `.` as a **separator**, so it reads `2.5` vs `2.25` as `5` vs `25` and **inverts
them**. Only decimals pin the numeric branch. Do not "simplify" these fixtures to round numbers.

---

## 2. Verification (all re-runnable)

```bash
# unit + guards — 301 tests
npx tsx --test \
  src/design-system/components/grid/grid-col-var.test.ts \
  src/design-system/components/grid/grid-frozen-left.guard.test.ts \
  src/design-system/components/grid/grid-column-applied-widths.test.ts \
  src/design-system/components/grid/grid-column-display.guard.test.ts \
  src/design-system/components/grid/grid-view-plumbing.guard.test.ts \
  src/lib/receiving/receiving-grid-compare.test.ts \
  src/lib/receiving/receiving-grid-layout.test.ts \
  src/lib/receiving/receiving-grid-fixed-columns.guard.test.ts \
  src/lib/custom-fields/custom-fields-history-first.guard.test.ts \
  src/lib/custom-fields/hydrate.test.ts \
  src/lib/tables/grid-surface-capabilities.guard.test.ts \
  src/lib/tables/grid-column-tier.guard.test.ts \
  src/lib/tables/table-definition.test.ts \
  src/components/tables/table-definition-registry.guard.test.ts \
  src/components/station/receiving-grid/receiving-grid-sheet.guard.test.ts

npx tsc --noEmit -p tsconfig.json          # 0 erroring files

pnpm provision:qa-org
npx playwright test tests/e2e/custom-column-sort.spec.ts --project=qa-desktop
```

Result at handoff: **301/301 guards · tsc 0 erroring files · 4/4 E2E**.

**Mutation-proven** (4 probes, each turns the suite red): sortable predicate · blanks-last sign ·
numeric branch · CSS sanitizer. A green run alone was NOT accepted as proof — see §4.

---

## 3. Uncommitted file set (stage by explicit path)

**Mine:**

```
M src/lib/receiving/receiving-grid-compare.ts
M src/lib/receiving/receiving-grid-compare.test.ts
M src/lib/receiving/receiving-grid-layout.ts
M src/lib/receiving/receiving-grid-layout.test.ts
M src/design-system/components/grid/grid-column-geometry.ts
M src/lib/tenancy/qa-org.ts
M scripts/provision-qa-org.ts
?? src/design-system/components/grid/grid-col-var.test.ts
?? tests/e2e/custom-column-sort.spec.ts
```

**NOT mine — another session's concurrent work, do not stage:**
`LedgerGrid.tsx` · `grid-column-type-track.ts` + `.test.ts` · `grid-sticky-x.guard.test.ts` ·
`grid/index.ts` · `receiving-grid-fixed-columns.guard.test.ts`.

`git commit -- <explicit paths>`. Never `git add -A`, never `git stash`, never `--no-verify`.

---

## 4. Traps this pass hit (read before repeating the work)

| Trap | What happened |
|---|---|
| **A green test proving nothing** | The first "sorts numerically" test passed with the numeric branch **deleted** — `numeric: true` collation masks whole numbers. Mutation-test every new assertion. |
| **Dev-server cold compile** | Playwright `global-setup` timed out at 30s on `/api/auth/account/signin` — a first-hit Next dev compile, not a broken server. Warm the route with `curl` first; **never restart the operator's server**. |
| **`CSS.escape` is a browser global** | Not defined in the Playwright runner process. An attribute selector needs no escaping — the value is already quoted. |
| **Titles are ambiguous on this grid** | The title track renders the resolved **catalog** title, so both QA Bose fixtures read identically. Assert on the custom cell VALUES. |
| **History's default lane** | `/receiving/history` opens on `?lane=docked&weekOffset=1` with **4 rows**, not the 50 the bare API returns. |
| **Rows fold by PO** | Under a column sort the host regroups via `groupRowsBy(sorted, poFoldKey)`. Assert relative order of valued rows, not absolute row index. |

---

## 5. Remaining queue (from → to → where)

| # | Gap | From | To | Where |
|---|---|---|---|---|
| **2** | Custom values invisible to global search | 0 refs to custom in the doc builder | values feed search docs on write | [`build-search-text.ts`](../../src/lib/search/build-search-text.ts) + `entity_search_outbox` triggers (**needs a migration**) |
| **3** | Only RECEIVING is live | `CUSTOM_FIELD_LIVE_ENTITY_TYPES = ['RECEIVING']` (storage already knows `ORDER`) | add ORDER **with host + row + list API in ONE change** | [`types.ts`](../../src/lib/custom-fields/types.ts) — the guard's `FROZEN_OFF_MOUNTS` names the exact 3 files |
| **4** | A new *entity* still needs a hand adapter | closed 17-value family union; no `/api/tables/[id]` | accept (house law) or build U3 | [`table-definition.ts`](../../src/lib/tables/table-definition.ts) |
| **5** | "6 arrived, 4 short" report (R1) | nothing | cross-grain report layer | **not** custom fields — PO-line vs carton grain |
| **6** | Saved views w/ custom cols + Locked tier (R2) | nothing | visibility × placement as two axes | existing `saved_views` |
| **7** | Custom columns are `resizable: false` | inert | decide: grip or not | [`column-model.ts`](../../src/lib/custom-fields/column-model.ts) |
| **8** | Sort tooltip says "A→Z" on a **number** column | cosmetic, pre-existing | numeric wording | grid header tip |

**Gap 3 warning:** this exact port was attempted and **reverted on 2026-08-09** — SoT records *"Orders
+ Receiving custom fields in one wave — Orders was reverted; History kept."* Orders has **no `cells/`
folder**; its renderer is a 1276-line hand-written `switch` in `OrdersQueueTableRow.tsx`. Materially
more work than Receiving's, and `custom-fields-history-first.guard.test.ts` flips those 3 files from
"must stay clean" to "must be wired" in the same change.

---

## 6. Doc debt created this pass — fix before trusting these two files

- [`universal-table-connector-and-custom-columns-GEMINI-RESEARCH-BRIEFING.md`](universal-table-connector-and-custom-columns-GEMINI-RESEARCH-BRIEFING.md)
  contains **two now-false claims**: that custom fields are "NOT started" (§1.3/§3f) and that
  `cellMapKey` is dead code (§1.2). Both were true when a subagent grepped and false by the time it
  was written — custom fields were already committed on `main`, and `cell-map-registry.ts` reads
  `cellMapKey`. **Correct or annotate before anyone acts on it.**
- The Gemini reply landed at `universal-table-connector-and-custom-columns-PLAN.md` recommends a
  **JSONB `field_data` blob** side-table. That **contradicts the shipped schema** (typed
  `value_text`/`value_number`/`value_date` columns, migration `2026-08-08f`), and the shipped choice
  is correct — JSON numbers sort lexically, which is exactly the defect §1c's decimal fixture guards.
  Gemini flagged it was answering from a truncated payload. **Do not act on that section.**

After editing docs: `pnpm portfolio:sot`.

---

## 7. Implementer prompt (≤30 lines — paste this)

```
Read docs/todo/custom-column-sort-and-grid-var-HANDOFF.md (this file). Work in the main checkout;
attach to the dev server already running on :3050 — never start, restart, or kill one.

STATE: org custom columns are sortable on the receiving family, and a P0 was fixed where a
`custom:` column key produced an invalid CSS custom-property name and dropped EVERY grid track on
the row. All of §1 is done and UNCOMMITTED. Verify with the §2 commands before changing anything
(expect 301/301 guards, tsc 0 erroring files, 4/4 E2E after `pnpm provision:qa-org`).

Pick up at §5. Default order: gap 2 (search) then gap 7 (resize) — both scoped to RECEIVING, no new
entity. Do NOT start gap 3 (Orders) without saying so first: it was attempted and reverted on
2026-08-09, Orders has no cells/ folder (1276-line switch), and the history-first guard requires
host + row + list API wired in ONE change.

RULES: stage only the §3 files by explicit path (`git commit -- <paths>`); several sibling grid
files are another session's concurrent work — never `git add -A`, never `git stash`, never
`--no-verify`, never raise a ratchet baseline. E2E asserts against the QA org
(`--project=qa-desktop`), never the dogfood tenant.

METHOD: mutation-test every new assertion — a green suite is not proof. This pass shipped a test
that passed with the branch it claimed to guard deleted (`numeric: true` collation masks whole
numbers; only decimals bite). Read §4 before writing an E2E — titles are ambiguous, History opens
on ?lane=docked&weekOffset=1 with 4 rows, and rows fold by PO under sort.

If you touch the two docs in §6, correct their stale claims rather than building on them.
```
