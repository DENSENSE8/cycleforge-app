# PLAN — Boxes packed by packer (daily count)

**Written 2026-08-27.** Plan of record for putting the daily packer box-count
into Warehouse OS. **No UI ships from this file.** The premature surface that
landed on `main` as `ad4c2fa1d` (header **Packed** button, launcher row, tile,
`GET /api/packing/box-counts`) is **reverted in the same commit as this plan.**

Paste this whole file into a fresh session when the operator says to build it.

---

## 1 · Why this exists

The operator asked the same question three days in a row from chat:

> how many boxes were packed by each packer on &lt;day&gt;

The answer they want is a **two-column table plus a total**, not packing KPI
(tiers, weighted minutes, FBA fill). Example of the grain that was already
proven against production:

| Packer | Boxes packed |
|---|---|
| Tuan | 29 |
| Thuy | 1 |
| **Total** | **30** |

They then asked for **a button in Operations**. That request is real. The first
implementation was wrong: it bolted a **Packed** verb onto the beam. That
violates beam law **B2** (the beam reports identity, never verbs) and **B23**
(top-right `⋯` is the tools door). This plan puts the count where Warehouse OS
puts data: **a tile**, opened from the launcher (and, later, from a packing
session), not as permanent header chrome.

The old `/operations` page (modes: live / checks / analytics / …) is **dead**.
Do not rebuild it as a URL. Nav strings that still say `/operations` are
legacy. The product surface is the Electron / shell canvas (`00-endgame` D2 / D4).

---

## 2 · The report contract (do not invent a second grain)

One row in the table = one completed pack for that staffer on that warehouse
civil day.

| Axis | Rule |
|---|---|
| Fact | `station_activity_logs` where `station = 'PACK'` and `activity_type = 'PACK_COMPLETED'` |
| Day | `(timezone('America/Los_Angeles', created_at))::date` — same as `getCurrentPSTDateKey()` / packing KPI |
| Packer | `staff.name` via `sal.staff_id`; missing staff → `'(unassigned)'` |
| Count | `COUNT(*)` of those rows, not distinct orders, not `packer_logs` alone |
| Org | `sal.organization_id = ctx.organizationId` through `tenantQuery` |
| Sort | boxes desc, then packer name asc |
| Total | sum of the per-packer counts |

**Do not** substitute `packer_logs` as the primary grain unless the operator
re-rules. The chat reports and `buildPackingReportRows` already treat
`PACK_COMPLETED` as the box.

**Do not** hide unassigned packs. KPI (`getPackingKpisForDay`) currently drops
`staff_id IS NULL`. This report must not.

SQL shape (domain helper, not the route):

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

## 3 · What already exists (reuse, do not fork)

| Piece | Path | Use it? |
|---|---|---|
| Packing KPI (tiers + capacity + FBA) | `src/lib/packing/packer-kpi-queries.ts`, `GET /api/packing/kpi` | **No** for this table. Heavier query, drops unassigned, extra columns the operator did not ask for. Keep KPI as the manager capacity view. |
| Line-item packing export | `src/lib/packing/packing-report.ts`, `GET /api/packing/reports/export` | Optional drill-down later (click a packer → CSV/JSON of that day's rows). Not v1 of this tile. |
| Civil-day helpers | `src/utils/date.ts` (`isDateKey`, `addDaysToDateKey`, `getCurrentPSTDateKey`, `formatDateKeyMedium`) | **Yes.** Never parse `YYYY-MM-DD` as host-local midnight. |
| Tile host pattern | `OrdersQueueTile` / `SessionsWeekTile` + `TileBody` adapter | **Yes.** Host-agnostic tile, shell only maps `ref`. |
| Launcher | `src/shell/Launcher.tsx` | **Yes.** This is the open door (T11). |
| Permission | `operations.view` already gates `/api/packing/kpi` and packing export | **Yes.** Same gate. Do not invent `packing.boxes.view`. |

Reverted (do not resurrect as-is): `GET /api/packing/box-counts`,
`src/lib/packing/packer-box-counts.ts`, `PackedTodayTile`, beam **Packed**
button, `openPackedTodayTile`. The **query and table layout** in those files
were correct; the **placement** was not. Copy the grain from §2, not the chrome.

---

## 4 · Target UX (Warehouse OS)

### 4.1 What the operator sees

A **table tile** (not a modal, not a popover, not a page). Title: **Packed**.
Type chip: `table`.

Body:

1. Day strip: previous · civil-day label (`formatDateKeyMedium` with weekday +
   year) · next. Next is disabled when `day === getCurrentPSTDateKey()`.
2. If viewing a past day, a **Today** outline button (instant swap, M1 — no
   tween).
3. Table: **Packer** | **Boxes**. Footer row **Total**.
4. Empty: `No boxes packed this day.` Loading / error copy, no skeleton
   geometry animation.

Same numbers they got from chat. Day paging exists so they stop asking an
agent to re-run Monday vs Tuesday vs Wednesday.

### 4.2 How they open it (ordered)

1. **Launcher (required).** Tables group: **Boxes packed** — meta: today's
   count by packer. `Ctrl+K` / scan-field launcher. This is the Operations
   “button”: the OS index, not a second header verb.
2. **Packing session tool (required once packing sessions are real).**
   `scope: 'session'`, `appliesTo: ['packing']`. Right rail + beam `⋯` only
   while a packing session is armed (T5/T6/B23). Label: **Boxes packed**.
   Opens the same tile (`ref` stable — C8: re-open focuses the existing tile).
3. **Composer / assistant (later, not blocking).** A read tool that returns
   the same JSON and, on operator confirm, `openTile('packed-today', …)`.
   Do not auto-open tiles from chat without a commit.

### 4.3 What must not happen

- Do **not** put **Packed** on the beam next to identity / entity readout.
- Do **not** restore `/operations?mode=…` as the home for this.
- Do **not** override the orders queue tile with this table (C8).
- Do **not** animate height/width of the table or day strip (M1).
- Do **not** use native `title=` on new controls (tooltip / `aria-label`).
- Do **not** start, restart, or kill `:3050` / `:3051` to “verify.” Attach.

### 4.4 Layout on the canvas

Default: open as a **narrow table tile** beside whatever is focused (Hyprland
grammar already on the shell). The operator can grow it. Show-mode (one
maximised tile) is allowed; this report is a natural “show the floor the
count” surface.

---

## 5 · Implementation sequence (when building)

Do these in order. Each step is shippable alone.

### Step A — Domain + GET (no UI)

1. `src/lib/packing/packer-box-counts.ts`
   - `assemblePackerBoxCountReport(day, rows)` — pure sort + total (unit test).
   - `getPackerBoxCountsForDay(orgId, day)` — `tenantQuery`, SQL from §2.
2. `GET /api/packing/box-counts?day=YYYY-MM-DD`
   - `withAuth` + `permission: 'operations.view'`.
   - `day` optional → `getCurrentPSTDateKey()`.
   - Invalid day → 400 (`isDateKey`).
   - Body: `{ ok: true, day, rows: [{ packer, boxesPacked }], total }`.
3. `docs/security/route-permissions.json` — add the route, bump
   `totalRoutes` / `permissionGated` (emit script is gone; edit by hand).
4. `npm run verify`.

### Step B — Tile (no chrome on the beam)

1. `src/components/tiles/packing/packed-today-tile-data.ts` — fetch only.
2. `src/components/tiles/packing/PackedTodayTile.tsx` — host-agnostic, shadcn
   `Button` + table. Day state local to the tile.
3. `TileBody`: `if (tile.ref === 'packed-today') return <PackedTodayTile />`.
4. `useShell.openPackedTodayTile` → `openTile('packed-today', 'Packed', 'table')`
   (dedupe by `ref` already in `openTile`).

### Step C — Open doors (still no beam verb)

1. Launcher Tables item as in §4.2.1.
2. Register a packing-session tool in `src/shell/model.ts` `TOOLS` that calls
   `openPackedTodayTile` (not `toggleTool` for a panel — this is a **tile**,
   not a pushing tool body). If the tool registry cannot open tiles yet,
   add a one-line `run: 'open-tile'` kind rather than stuffing a fake tool
   panel with a nested table.

### Step D — Verify in the running app

Operator-owned server. Exercise: sign in → launcher → Boxes packed → table
matches a live SQL check for today → previous day → Today. Armed packing
session → `⋯` / right rail shows the tool → opens/focuses the same tile.

---

## 6 · Acceptance

- [ ] For a known warehouse day, the tile matches a direct SQL count of
      `PACK_COMPLETED` grouped by packer (including unassigned).
- [ ] Total equals the sum of rows.
- [ ] Future days cannot be selected via Next.
- [ ] Second open does not stack a duplicate tile.
- [ ] Beam has no Packed button.
- [ ] `operations.view` required; unauthenticated → 401.
- [ ] `npm run verify` green.
- [ ] Clicked through on the operator's running shell (not a screenshot-only
      check).

---

## 7 · Open questions (do not guess)

1. **Should a packer see only their own row?** Default in this plan: **everyone
   with `operations.view` sees all packers**, because the operator asked for
   the floor total. If packers must be scoped to self, that is a second
   permission or a client filter — ask before coding.
2. **Live refresh while the tile is open?** v1: fetch on day change / mount
   only. Polling is a later request-shape decision (`perf:requests`).
3. **Row click → that packer's line-item export** (`/api/packing/reports/export`)?
   Useful, not required for the chat-parity table.

---

## 8 · Out of scope

- Restoring Operations Live / Analytics / Checks as Next routes.
- Packing KPI dashboard (already has an API; different question).
- Changing how `PACK_COMPLETED` is written at the pack station.
- Leaderboards, colour-as-verdict on counts (B10: ranking is not HUD chrome
  on the person being ranked). This table is a fact display, not a scoreboard
  with red/green vs target.
