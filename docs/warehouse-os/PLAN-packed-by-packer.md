# PLAN — Boxes packed by packer (daily count)

**Written 2026-08-27, revised the same day after `main` restored the Operations
master page.** Plan of record for putting the daily packer box-count **into
Operations**. **No UI ships from this file.**

The premature Warehouse OS beam **Packed** button (`ad4c2fa1d`) is **reverted**
in the same change-set as this plan. Do not put this count on
`src/components/layout/GlobalHeader` (nav · scan · goal · inbox · assistant).

Paste this whole file into a fresh session when the operator says to build it.

---

## 1 · Why this exists

The operator asked the same question three days in a row from chat:

> how many boxes were packed by each packer on &lt;day&gt;

Then: **a button in Operations** that displays **exactly that table** — packer,
count, total — not packing KPI (tiers, weighted minutes, FBA fill).

Example of the grain already proven against production:

| Packer | Boxes packed |
|---|---|
| Tuan | 29 |
| Thuy | 1 |
| **Total** | **30** |

---

## 2 · Where it lives in the product (this is the UX)

Operations is `/operations` (`src/app/operations/page.tsx` →
`OperationsWorkspace`). L2 modes are the GlobalHeader **page-child switcher**
(`SIDEBAR_PAGE_NAV` operations children) plus `?mode=` as the single source of
truth (`parseOperationsMode`).

**Ship a new Operations mode: `packed`.**

| Surface | What to add |
|---|---|
| Header L2 (the “button”) | Child next to **Checks**: label **Packed**, icon `Boxes` (already used in `PackingKpiSection`). Target `/operations?mode=packed`. This is the control the operator asked for — one click from Operations. |
| Right pane | `OperationsPackedView` — clone the **Checks** day-strip pattern (`OperationsChecksView`): prev / civil-day title / next, `?date=YYYY-MM-DD` in the URL, Monitor page shell. Body is **only** the two-column table + total. |
| Live dashboard | Optional later: a compact **Packed today** card that **navigates** to `?mode=packed` (does not duplicate the table on Live). Not required for v1 if the L2 child is obvious. |
| Analytics → Packer productivity | Leave it. That is the KPI (tiers, capacity, by-item). This mode is the chat-parity count. |

**Do not:**

- Add Packed to `GlobalHeaderActions`.
- Rebuild this as a Warehouse OS canvas tile / launcher row (that shell is not
  the current `/operations` product).
- Hide this inside Analytics tabs (the operator has to hunt; they asked for a
  button).
- Override another mode’s pane (Checks stays Checks).

URL: `/operations?mode=packed` today; `/operations?mode=packed&date=2026-08-24`
for Monday. Switching away from `packed` clears `date` (sidebar-mode law: mode
owns its params).

---

## 3 · The report contract (do not invent a second grain)

One table row = one completed pack for that staffer on that warehouse civil day.

| Axis | Rule |
|---|---|
| Fact | `station_activity_logs` where `station = 'PACK'` and `activity_type = 'PACK_COMPLETED'` |
| Day | `(timezone('America/Los_Angeles', created_at))::date` — same as `getCurrentPSTDateKey()` |
| Packer | `staff.name` via `sal.staff_id`; missing staff → `'(unassigned)'` |
| Count | `COUNT(*)` of those rows — not distinct orders, not `packer_logs` alone |
| Org | `tenantQuery` + `ctx.organizationId` |
| Sort | boxes desc, then packer name asc |
| Total | sum of per-packer counts |

**Do not** use packing KPI as the display grain. `getPackingKpisForDay` drops
`staff_id IS NULL` and adds tier/capacity/FBA. Keep KPI for Analytics.

SQL (domain helper, not the route):

```sql
SELECT
  COALESCE(s.name, '(unassigned)') AS packer,
  COUNT(*)::int AS boxes_packed
FROM station_activity_logs sal
LEFT JOIN staff s ON s.id = sal.staff_id
WHERE sal.station = 'PACK'
  AND sal.activity_type = 'PACK_COMPLETED'
  AND sal.organization_id = $1
  AND (timezone('America/Los_Angeles', sal.created_at))::date = $2::date
GROUP BY 1
ORDER BY 2 DESC, 1 ASC
```

---

## 4 · What already exists (copy the Checks pattern)

| Piece | Path | Role |
|---|---|---|
| Mode router | `OperationsWorkspace.tsx` | `if (mode === 'packed') return <OperationsPackedView />` |
| Checks view (clone chrome) | `OperationsChecksView.tsx` | Day pager, `MonitorPageShell`, `?date=` |
| Mode SoT | `src/lib/operations/operations-sidebar-shared.ts` **and** `src/components/sidebar/operations/operations-sidebar-shared.ts` | Add `'packed'` to `OperationsMode`, `OPERATIONS_MODES`, `parseOperationsMode`, `parseOperationsModeWire`. Keep both files in lockstep (or delete the duplicate in the same PR if already planned). |
| Header L2 | `src/lib/sidebar-navigation.ts` operations `children` + `resolveChild` | `{ id: 'packed', label: 'Packed', … params: { mode: 'packed' } }` |
| Route param hygiene | `src/lib/routing/query-mode-routes.ts` | Already round-trips `parseOperationsModeWire` — extending the mode union is enough if that helper is the SoT. |
| Sidebar panel | `OperationsSidebarPanel.tsx` | Empty or a one-line “today’s total” list; Checks has a small sidebar — match that density, do not invent a second table. |
| Packing KPI | `GET /api/packing/kpi`, `PackingKpiSection` | Do **not** power this table. |
| Line-item export | `GET /api/packing/reports/export` | Optional later: click a packer → that day’s rows. Not v1. |
| Civil day | `src/utils/date.ts` | `isDateKey`, `addDaysToDateKey`, `getCurrentPSTDateKey`, `formatDateKeyMedium` / `formatDateKeyShort` |
| Permission | `operations.view` | Same as KPI and packing export. |
| Checks e2e | `tests/e2e/operations-daily-checks.spec.ts` | Clone: heading visible, table `data-testid="packed-by-packer"`. |

Reverted leftover on some `main` histories: `GET /api/packing/box-counts` +
`packer-box-counts.ts`. If those files are present when building, **reuse the
query**; do not leave an orphan API without a view. If absent, recreate them
as Step A.

---

## 5 · UI spec (the pane)

`MonitorPageShell`.

1. **Eyebrow** `Boxes packed` (uppercase / `text-role-eyebrow`, same as Checks’
   “Daily checks”).
2. **Title** today → `Today` or weekday+date via `formatDateKeyMedium`; past →
   that civil label.
3. **Prev / next** — next disabled on today. Writes `?mode=packed&date=`.
4. **Table** — Packer (left) · Boxes (right, mono). Footer **Total**.
5. Empty: `No boxes packed this day.` Loading: same spinner row as Checks.
   Error: same dashed rose panel pattern as Checks.
6. **No layout animation** (M1). Instant day swap.

That is the whole view. No gauges, no small/medium/large, no FBA fill.

---

## 6 · Implementation sequence

### Step A — Domain + GET

1. `assemblePackerBoxCountReport` (pure, unit test) + `getPackerBoxCountsForDay`.
2. `GET /api/packing/box-counts?day=` — `withAuth` / `operations.view`; default
   day = `getCurrentPSTDateKey()`; invalid day 400.
3. Body `{ ok, day, rows: [{ packer, boxesPacked }], total }`.
4. Update `docs/security/route-permissions.json` counts by hand.

### Step B — Operations mode (the button + pane)

1. Extend mode types in **both** sidebar-shared modules.
2. `OperationsPackedView.tsx` + `usePackerBoxCounts(day)` (react-query, mirror
   `useDailyChecks` / `usePackingKpi`).
3. Wire `OperationsWorkspace`, `sidebar-navigation` child + `resolveChild`,
   `OperationsSidebarPanel`, assistant `page-skills` URL list.
4. Playwright: `/operations?mode=packed` shows the heading and testid table
   (desktop project; skip mobile like Checks).

### Step C — Verify

Operator-owned `:3050`. Click **Operations → Packed**. Confirm counts vs SQL
for today and a past day. Header child stays selected. Analytics packing
section still loads.

`npm run verify`.

---

## 7 · Acceptance

- [ ] Header L2 **Packed** is visible whenever Operations is the current page.
- [ ] Table matches SQL `PACK_COMPLETED` grouped by packer, including
      `(unassigned)`.
- [ ] Total = sum of rows.
- [ ] Next is disabled on today; `date` omitted from the URL on today.
- [ ] GlobalHeader actions rail is unchanged (no Packed icon there).
- [ ] `operations.view` required on the GET.
- [ ] Checks / Analytics / Live still work.
- [ ] Clicked through on the running app, not screenshot-only.

---

## 8 · Open questions (ask before coding)

1. **Packers see only themselves?** Default: **all packers** for anyone with
   `operations.view` (the operator asked for the floor total).
2. **Live poll while the pane is open?** v1: fetch on mount / date change only.
3. **Live dashboard card?** Only if the L2 child is not findable enough after
   one week of use.

---

## 9 · Out of scope

- Packing KPI redesign.
- Changing how pack station writes `PACK_COMPLETED`.
- Colour-as-ranking vs a daily target on this table (that belongs in Analytics
  KPI, not this fact view).
- Warehouse OS tiles / beam verbs.
