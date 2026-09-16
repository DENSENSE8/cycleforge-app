# Packer KPI — set time-to-pack per item number, and make the packing report readable

**Status:** ready to execute. Nothing in this document is built yet.
**Raised:** 2026-09-16, operator, acting as data analyst.
**Predecessor increment:** `/reports?tab=packer` (the `report-packer-day`
registered family) and the Products-desk time-to-pack slider shipped
2026-09-16. This handoff fixes what that increment left unusable.

---

## 1. The operator's words

> "Currently the slot data table and the exact analytics is terrible — you're
> not able to view any of the information within the slot data table. And where
> would I set the time to pack per product per item ID? There is no way within
> the UI to set it."
>
> "Definition of done is I must be able to set a time per item number — time to
> pack per item number — so I can update the time to pack per item number and
> so it will reflect throughout all the different packers. And you would be
> able to see a packing report filtered by week and day, ensuring the calendar
> filter component is at the top row of the slot data table exactly like the
> calendar viewing within shipped in the shipping page. There must be a way to
> filter per staff. There must be a top-right CTA like a pie chart view for
> reports to view it in a different display method that's easier to see instead
> of a slot data table — like a pie chart similar to the monitor / operations
> analytics page."

---

## 2. DEFINITION OF DONE

Five clauses. All five, or the increment is not done.

1. **Set time-to-pack BY ITEM NUMBER.** An operator can type or scan an item
   number (e.g. `B07ZY7DWT6`), see its current time to pack, drag it, save, and
   the change applies to **every future pack of that item number by every
   packer**. It is reachable from the packing report itself, not only from a
   product record.
2. **The report is legible.** Every column the report claims is readable
   without horizontal scrolling at 1440px: who packed it, what it was, when,
   the time to pack, and whether that time was set by a human.
3. **Calendar filter in the table's own toolbar** — the `DataTable`
   `dateMenu` chip, exactly as `/shipping/shipped` mounts it — supporting a
   **day** and a **week** window. The current hand-rolled `‹ Earlier / Later ›`
   stepper above the table is deleted, not kept beside it.
4. **Filter per staff** from the same one filter control (`DataTable.filter`),
   with a packer facet. No second toolbar.
5. **A chart view behind a top-right CTA** — pie/donut of the same rows, using
   the Monitor chart primitives, toggling with the table. The chart reads the
   SAME feed as the table; it may not re-query or re-derive.

**Acceptance run:** extend `tests/e2e/packer-kpi.spec.ts` (`npm run
test:e2e:packer-kpi`). It already covers the Products-desk slider, the `/m`
report, the desk table and the parked lanes; add one test per clause above.

---

## 3. Why clause 1 is not a small change — read this before coding

`time to pack` is stored **per `sku_catalog.id`**, not per item number:

```
pack_profiles(id, organization_id, pack_tier, estimated_minutes, source)
pack_profile_links(organization_id, owner_type, owner_id, pack_profile_id)
  CONSTRAINT pack_profile_links_owner_type_check CHECK (owner_type IN ('SKU_CATALOG'))
```
— `src/lib/migrations/2026-07-08e_pack_profiles_polymorphic.sql:55`

The item number is a **listing/ASIN handle** (`orders.item_number`), and the
mapping to a catalog SKU is many-to-one and *not guaranteed to exist*. The
resolver already exists and already reports ambiguity:

- `listCatalogsForItemNumber()` / `resolveCatalogByItemNumber()` —
  `src/lib/packing/resolve-catalog-by-item-number.ts`

**Pick one of two designs and say which in the PR:**

| | A — resolve to the catalog SKU (recommended) | B — add `owner_type: 'ITEM_NUMBER'` |
|---|---|---|
| Write path | item number → `resolveCatalogByItemNumber` → existing `upsertSkuPackProfileLink` | new link row keyed by the item-number string |
| Migration | none | `CHECK` constraint + `owner_id` becomes text, or a second column |
| Ambiguity | must be surfaced: one item number can hit several catalog rows | none |
| Unlinked item numbers | **cannot be set** until paired — must say so | can be set before pairing |
| Reads | works today; the KPI query already prefers the SKU link | every reader needs a second lookup arm |

A is recommended because the read path already exists and one standard per
physical SKU is the truthful model — two listings of the same box take the same
time to pack. **But A has a hard edge the UI must state:** on 2026-09-15,
**49 of 51 packs had no catalog SKU at all** (`tierSource: 'default'`), so for
most of today's rows there is nothing to attach a standard to. If you choose A,
the "set it" affordance on an unpaired row must route to pairing
(`/review?mode=catalog-link`), not silently fail.

Do not paper over this. The operator's "it will reflect throughout all the
different packers" is satisfied by either design — what must not happen is a
control that appears to save and does not.

---

## 4. What exists (use it; do not fork it)

### Data
| Thing | Where |
|---|---|
| Per-pack rows (one row per pack scan) | `GET /api/packing/reports/export?format=json&day=YYYY-MM-DD&packerId=N` → `src/lib/packing/packing-report.ts` |
| Row shape | `PackingReportRow` — `src/lib/packing/packing-report-shared.ts` (carries `orderNumber`, `platform`, `packerStaffId`, `itemNumber`, `sku`, `estimatedMinutes`, `tierSource`) |
| Per-packer day summary | `GET /api/packing/kpi?day=` → `getPackingKpisForDay` |
| **Period rollup, already written** | `getPackingKpisForLastFilledDays(orgId, n)` + `listRecentFilledPackDays()` → `src/lib/packing/packer-kpi-queries.ts`. `PackingKpiPeriodSummary` is the week shape — **it has no HTTP route yet.** Adding `?days=` or `?from=&to=` to `/api/packing/kpi` is the week window. |
| Standard-time stops + tier derivation | `src/lib/packing/pack-standard-stops.ts` (`PACK_STANDARD_MINUTE_STOPS`, `tierForMinutes`) |
| The ONE client writer | `savePackStandardMinutes()` — `src/lib/packing/pack-profile-client.ts`. Extend this; do not add a second PATCH caller. |

### UI
| Thing | Where |
|---|---|
| The slider | `PackTimeSlider` — `src/components/packing/PackTimeSlider.tsx` |
| Dialog wrapper (keyed by `skuCatalogId`) | `PackProfileEditor` — `src/components/packing/PackProfileEditor.tsx` |
| Products-desk card | `ProductPackTimeCard` — `src/components/products/ProductPackTimeCard.tsx` |
| The report family | `src/components/reports/report-packer-day-grid/*` + `src/lib/tables/field-catalog/report-packer-day*.ts` |
| Report page host | `src/app/reports/page.tsx` (`?tab=packer`) |
| Phone twin | `src/components/mobile/reports/MobilePackerDayReport.tsx` + `MobilePackerItemsSheet.tsx` |

### The calendar you must copy — do not invent one
`/shipping/shipped` mounts the house quick-date chip by passing DATA to
`DataTable`, not by drawing a toolbar:

```tsx
<DataTable
  {...sheet}
  search={{ value, onChange, placeholder: 'Filter shipped…' }}
  filter={shippedFilter}   // the ONE filter control — facets as data
  dateMenu={dateMenu}      // the quick-date chip — { range, onRangeChange }
  exportFilename="shipped.csv"
/>
```
— `src/components/shipped/DashboardShippedTable.tsx:325-331`; the `dateMenu`
and `filter` contracts are documented on `src/components/tables/DataTable.tsx`
(`DataTableFilterOption` :180, quick-date :160/:289).

Shipped also supplies a **`period:week` preset** inside `filter.options`
(`DashboardShippedTable.tsx:235-239`) and a free range via `dateMenu`. That
combination IS clause 3 — a week preset plus an arbitrary range, one control
each, no stepper.

**Law:** `DataTable` has exactly one filter control and one quick-date chip, and
they live in its own toolbar. A second chrome row above the table is the fork
the single toolbar exists to end (operator ruling 2026-08-31, quoted at
`DashboardShippedTable.tsx:183-195`). The `ReportDayStepper` in
`src/app/reports/page.tsx` violates this for BOTH day-scoped tabs — remove it
from Packer day, and say in the PR whether Staff day keeps it or follows.

### The chart primitives — already in the repo, already themed for packing
| Thing | Where |
|---|---|
| Donut / pie | `GaugeDonut` — `src/features/operations/workspace/charts/GaugeDonut.tsx` |
| Distribution rows | `DistributionTable` — same dir |
| **Pack tier colours** | `PACK_TIER_TONES` (SMALL/MEDIUM/LARGE teal/amber/violet) + `PACK_CAPACITY_TONES` — `src/features/operations/workspace/charts/chart-theme.ts` |
| Card / KPI shells | `SectionCard`, `KpiStrip`, `KpiTile`, `KpiChartCard` — `src/design-system/components/monitor` |
| Top-right desk CTA slot | `DeskActionSlotRegistrar` + `DeskHeaderAction` — `src/design-system/components/DeskActionSlot`; `/reports` already mounts one ("Refresh") at `src/app/reports/page.tsx` |

**The segment math is written and unit-tested** — it was deleted with the
Analytics mode on 2026-09-16 and is in git history, not on disk:
`packing-kpi-chart-segments.ts` + `.test.ts` (`packingBoxesByTierSegments`,
`packingMinutesByTierSegments`, `packingCapacitySegments`,
`tierMinutesFromCounts`). Recover them from
`git show HEAD:src/features/operations/workspace/packing-kpi-chart-segments.ts`
rather than rewriting the weighting. Put them in `src/lib/packing/` this time
so both surfaces can import them (`/m` may not import `features/**`).

---

## 5. Why clause 2 exists — the observed defect

Screenshot evidence, `/reports?tab=packer`, 50 rows, 1440×900:

- `Product` is truncated mid-word ("Bose Wave Music System III Certified (Re…").
- `Item #`, `SKU` and `Time to pack` are pushed to the right edge; **Time to
  pack — the entire point of the report — is off-screen.**
- 49 of 50 rows read `Not paired to a SKU` / `—` / `—`, so the table is mostly
  empty cells.
- There is no per-packer or per-day TOTAL anywhere in the grid; the only
  aggregate is the footnote sentence under it.

Root causes to fix, in order:
1. **Too many default columns for the width.** The product layout binds four
   status tracks (`packer`, `item_number`, `sku`, `minutes`) on top of five
   chrome tracks. `MAX_DEFAULT_VISIBLE_TRACKS` is 10
   (`src/lib/tables/table-definition.ts:300`) and the family is at the edge.
   Consider `tier: 'optional'` on `sku` (the item number is the operator's
   handle; the SKU is derivable) — the Fields menu still offers it.
2. **The aggregate belongs in the toolbar or a KPI strip**, not a footnote.
   Clause 5's chart view is where "50 packs · 259 standard minutes" should
   live.
3. **The unpaired majority is the real finding, not noise.** Sorting by `Basis`
   already groups them (`report-packer-day-grid-layout.ts` — the `state` track
   sorts by `report-packer-day.basis`). A `Basis: Default` facet in
   `filter.options` turns the report into the pairing work queue.

---

## 6. Suggested build order

1. **Week window on the read.** Add `from`/`to` (or `days`) to
   `/api/packing/reports/export` and `/api/packing/kpi`; wire
   `getPackingKpisForLastFilledDays` to the latter. Pure server; no UI.
2. **Toolbar cutover.** Replace `ReportDayStepper` on the Packer tab with
   `DataTable`'s `dateMenu` + a `period:week` preset, mirroring
   `DashboardShippedTable`. Add the packer facet and a `Basis` facet to
   `filter.options`. Clauses 3 + 4.
3. **Column legibility.** Re-balance the default layout (clause 2), keeping the
   engine's materialization — never a hand column array
   (`HAND_HTML_TABLE_ALLOW` in `src/lib/tables/table-engine-law.ts` is not for
   this family).
4. **Chart view.** Restore the segment module into `src/lib/packing/`, add the
   top-right `DeskHeaderAction` toggle, render `GaugeDonut` +
   `DistributionTable` with `PACK_TIER_TONES` off the same rows.
5. **Set-by-item-number.** Decide A or B from §3. Add an item-number-keyed
   entry point: a row action on the report (`Set time to pack`) and a
   scan/type box on the chart/summary view. Route through
   `savePackStandardMinutes`.
6. **Extend the acceptance spec** — one test per DoD clause.

---

## 7. Guard rails — the gates this must pass

- `ds_contract` / `ds_tokens` / `ds_critique` before any `src/**/*.tsx` write.
  Project hooks deny UI writes without a fresh design-mcp session stamp.
- `pnpm run eval:cohort slot-table` — the family is registered peer #48. It
  caught a missing `SLOT_LAYOUT_TABLES` entry on the first pass
  (`layout-registry-gap:report-packer-day`); it will catch the next one.
- `pnpm run eval:discover` before deleting any `*_COLUMNS` symbol.
- `node "$GARISEK_OS_ROOT/tools/eval-engineering/cursor-eval.mjs" --root . --fast`
  — Lint · Typecheck · Boundary · Nav names · Mobile-first · Action bar ·
  Id header · Identity purity · Ground · Sku identity.
- **Adapter parity:** `src/components/tables/compound/compound-row-view-parity.ts`
  + `report-packer-day-row-view.test.ts`. If you add a fact to
  `PackingReportRow`, feed it to the shared cells or declare the absence with a
  reason. This law exists because the family shipped with every packer avatar
  the same colour and no channel dot on the order number — a projection two
  columns short, passed through as `null`, with every structural gate green.
- **Mobile-first:** `/m/reports` → Packing is the phone twin and must keep
  parity with whatever lands here. A week window and a staff filter on the desk
  with no phone equivalent is the split IA `docs/mobile-first/SURFACE_LAW.md`
  refuses. State explicitly in the PR what the phone gets.
- Verify at **`http://localhost:3050`** only — never a lane port. Lane is
  `systemctl --user restart cycleforge-lane@prod`.

---

## 8. What is NOT in scope

- **Measured pack time.** Every minute on this report is `count × standard`.
  There is no pack-START event — `PACK_SCAN` is the non-ORDERS *completion*
  (`src/app/api/packerlogs/route.ts:103`), so each pack carries exactly one
  timestamp. Observed handling time needs a `PACK_STARTED` activity type (no
  migration: `station_activity_logs.activity_type` is free-text VARCHAR, see
  `src/lib/station-activity.ts:13-16`) and is its own increment. **Do not let
  the chart view imply a measured pace** — the current footnote wording is the
  standard to keep.
- Sub-minute standards. `pack_profiles.estimated_minutes` is `integer` minutes;
  seconds is a migration and its own increment.
- A `packer_day_kpi` snapshot table. History still moves when a standard is
  re-based; that is known and deferred.
- Re-opening `/operations?mode=analytics`. It was retired 2026-09-16 and the
  Monitor lane is parked (`LANE_MOBILE_FIRST.monitor = 'hidden'`). Reuse its
  chart primitives; do not resurrect its page.
