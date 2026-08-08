# Claude Code / Ultra — SoT page violation audit + migrate

**For:** Claude Code / Cursor Ultra / cloud-agent session that **finds** desk &
station pages violating Cycle Forge source-of-truth recipes, **classifies** each
surface to the correct region golden, then **migrates** ops-queue violators in
shrink-only waves.
**Status:** ready to execute — architecture locked; mechanical inventory below.
**Date:** 2026-08-08.
**Lane:** current checkout — stay on branch; attach to `:3050` (never
start/restart/kill). User owns commits.
**Product frame:** Cycle Forge multi-tenant reseller-ops SaaS. USAV is dogfood
only.

**Coordinates with (do not conflate / do not re-open as primary job):**

| Doc | Use |
|---|---|
| [`unbox-history-sheets-full-resweep-SWEEP-PROMPT.md`](./unbox-history-sheets-full-resweep-SWEEP-PROMPT.md) | Five-row Sheets chrome / `surface="sheet"` anatomy only — **closed residual waves**; cite, do not re-run as this initiative’s main job |
| [`sheets-flush-workbench-cohort-SWEEP-PROMPT.md`](./sheets-flush-workbench-cohort-SWEEP-PROMPT.md) | ⛔ Superseded 2026-08-05 — historical only |
| [`band3-find-only-inspector-SOT-FINISH-HANDOFF.md`](./band3-find-only-inspector-SOT-FINISH-HANDOFF.md) | Band 3 find-only + Show inspector — **CLOSED 2026-08-08**; grow its guard, do not renegotiate the golden |
| [`displays-vs-inspector-vocabulary-SWEEP-HANDOFF.md`](./displays-vs-inspector-vocabulary-SWEEP-HANDOFF.md) | Nouns only: **Open displays** ≠ **Show / Hide inspector** |
| [`desk-contract-unification-CLAUDE-CODE-PROMPT.md`](./desk-contract-unification-CLAUDE-CODE-PROMPT.md) | Earlier desk three-pane; Support → `service-workspace` carve-out still applies |
| [`inventory-displays-zoho-trust-FINISH-HANDOFF.md`](./inventory-displays-zoho-trust-FINISH-HANDOFF.md) | Station **Inventory Displays** Action leaf — **not** desk `/inventory` |
| [`right-rail-inspector-contract-CLAUDE-CODE-PROMPT.md`](./right-rail-inspector-contract-CLAUDE-CODE-PROMPT.md) | Non-modal push inspector contract |

**Binding reads (load before editing):**

- [`AGENTS.md`](../../AGENTS.md)
- [`.claude/rules/source-of-truth.md`](../../.claude/rules/source-of-truth.md)
- [`.claude/rules/pattern-evolution.md`](../../.claude/rules/pattern-evolution.md)
- [`.claude/rules/contextual-display.md`](../../.claude/rules/contextual-display.md)
- [`.claude/rules/display/workbench.md`](../../.claude/rules/display/workbench.md)
- [`.claude/rules/display/workbench-ops-queue.md`](../../.claude/rules/display/workbench-ops-queue.md)
- [`.claude/rules/display/workbench-master-detail.md`](../../.claude/rules/display/workbench-master-detail.md)
- [`.claude/rules/display/workbench-service.md`](../../.claude/rules/display/workbench-service.md)
- [`.claude/rules/display/station.md`](../../.claude/rules/display/station.md)
- [`.claude/rules/verify.md`](../../.claude/rules/verify.md)

---

## Paste this into a new Claude Code / Ultra session

```text
Read docs/todo/sot-page-violation-audit-migrate-CLAUDE-CODE-PROMPT.md end to end
before editing. Execute §1 region router → §3 inventory → §5 migrate waves.
Do not invent a fifth layout shell. Do not re-open closed Band 3 / sheets chrome
cohort waves as the primary job.

GOAL
1) Mechanically inventory every L1/L2 surface that violates its correct
   region SoT (not “everything must look like Unbox History”).
2) Fill the cohort table (§4). Rank by blast radius × operator minutes.
3) Migrate ops-queue violators one wave at a time against the Unbox History /
   To-ship golden (five-row Sheets + table registry + push inspector +
   saved views left). Document honest carve-outs for Station / Monitor /
   Canvas / service-workspace / admin CLIP / mobile.
4) Grow shrink-only guards. Full npm run verify before claiming done.

HARD LAWS
- AGENTS.md + source-of-truth.md + pattern-evolution.md
- Compose named SoT first; grow SoT when wrong; never fork a page-local twin
- Never start/restart/kill the user’s :3050 dev server — attach only
- Stay on the checkout’s branch; user owns commits; no git stash
- Never raise DS ratchet / knip baselines to pass
- Show/Hide inspector (desk Band 3) ≠ Open displays (Station Displays edge)
- Desk /inventory Ledger ≠ Unbox InventoryDisplayHost (Action plane)
- Do NOT force History Sheets onto Station Displays, Monitor, Canvas,
  Support service-workspace, admin CLIP DataTable, or mobile

GOLDENS (do not “improve”)
- Unbox History: UnboxWorkspaceView + UnboxWorkspaceHeader + ReceivingGridView
  + HistoryCartonTriagePanel
- To-ship twin: DashboardOrdersView + OutboundWorkspaceHeader / OutboundTriageBand
- Band 3 toggle SoT: workbench-inspector-toggle.tsx
- Table registry: src/lib/tables/table-definition.ts + receiving-table-definition.ts

Start at §3 Inventory. Prefer Wave 0 = /inventory Ledger if the cohort still
ranks it P0 (worked example in §6). npm run verify -- --fast while iterating;
full npm run verify before done.
```

---

## 0. One-sentence goal

**Find pages that skipped the named SoT, route each to the right region recipe,
then migrate ops-queue debt onto Unbox History’s Sheets stack — without
reskinning cards or forcing History onto Station / Monitor / Canvas.**

---

## 0.5 — Execution log (2026-08-08): starting selection + Wave 0 landed components

> Recorded here so this file is the single check-your-work surface. Deletion plan
> for the rest of the legacy tree: [`inventory-retirement-page-by-page-HANDOFF.md`](./inventory-retirement-page-by-page-HANDOFF.md).

### Best long-term selection to start with (the answer)

**`/inventory` → the `units` collection, mounted on the Unbox History / `warehouse.bins`
Sheets golden.** Grounded via §3 `rg`: `/inventory` is the **only** un-migrated desk L1
(12 other desk workspaces are already sheet-green); its `InventoryShell` hits every
violation code (V-SHELL V-REPLACE V-CARDS V-NOSHEET V-ENTITYTAB V-NOSAVED V-ACTIVITY
V-STATUS V-SOFT V-URL V-NODEF). Units specifically, because: `warehouse.bins` already
proves the pattern for a sibling collection; the `/api/inventory/units` feed already
exists; units is the serialized core (highest operator-minutes); and once units owns
Band-1 lifecycle the rest (SKUs/Alerts/Counts) collapse into thin secondary definitions.

### Page-by-page verification list — Wave 0 landed (`/inventory/units`)

Verify page by page: open `/inventory/units` on `:3050` → it renders the flush Sheets grid
(Serial · Product · Status · Condition · Location · Updated), not the legacy `PageHeader` +
`max-w-5xl` island. Row-click still opens the unit through the legacy shell (`/inventory?unit=`)
— that coupling is retired in Wave 1 (the push-inspector keystone).

| Component | Action | Path | Verify |
|---|---|---|---|
| `useUnitsOverview` | **compose** parallel session's feed (not forked) | `src/hooks/useUnitsOverview.ts` | returns `{rows, loading}` from `/api/inventory/units` |
| Units grid layout | create (frozen `serial`) | `src/components/inventory/units-grid/units-grid-layout.ts` | frozen pane = `serial`; Product flexes |
| Units grid descriptor | create (browse caps) | `src/components/inventory/units-grid/units-grid-descriptor.ts` | `multiSelect:false`, `fieldsMenu:true` |
| Units table definition | create (`inventory.units`, `surface:'sheet'`) | `src/components/inventory/units-grid/units-table-definition.ts` | id `inventory.units`, tableId `inventory-units` |
| Units grid cells | create (status via registry) | `src/components/inventory/units-grid/cells/index.tsx` | status = `GridStatusCellValue` + `unitStatusBadgeClass`/`unitStatusDotClass` |
| Units grid row/header/view | create | `src/components/inventory/units-grid/{UnitsGridRow,UnitsGridColumnHeader,UnitsGridView}.tsx` | mounts `NonlinearTableHost` w/ `UNITS_TABLE_BINDING` |
| Units workspace | create (flush sheet host) | `src/components/inventory/UnitsWorkspaceView.tsx` | `WORKBENCH_SHEET_CHROME`/`_HOST` Band 1; no `max-w-5xl`/`PageHeader` |
| Units route wire | update | `src/app/inventory/units/page.tsx` | mounts `UnitsWorkspaceView`, not `InventoryShell` |
| Registry binding | update | `src/components/tables/table-definition-registry.ts` | `UNITS_TABLE_BINDING.definition` registered |
| TableId + Fields spec | grow SoT | `src/lib/tables/table-columns.ts` | `'inventory-units'` union + `TABLE_COLUMNS` entry |
| Entity family | grow SoT | `src/lib/tables/table-definition.ts` | `'units'` in `TABLE_ENTITY_FAMILIES` |
| Capabilities bag/mount | grow SoT | `src/lib/tables/grid-surface-capabilities.guard.test.ts` | `units` bag + `UnitsGridView` mount + descriptor deepEqual |
| Unit-status dot | grow SoT (additive) | `src/lib/unit-status.ts` | `unitStatusDotClass` (dot half of the registry) |
| Units sheet guard | create (shrink-only) | `src/components/inventory/units-grid/units-grid-sheet.guard.test.ts` | pins `surface:'sheet'` + hosts + route |

**Verification run (2026-08-08):** `tsc` **0 errors** · `units-grid-sheet.guard` 5/5 ·
`grid-surface-capabilities.guard` 13/13 (incl. mount disk-walk) · `grid-column-tier.guard`
124/124 · `table-definition.test` 12/12 · `table-definition-registry.guard` 9/9 · parallel
`table-definition-registry.test` 1/1 (unbroken). No dead exports.

**Collision note:** a concurrent `inventory-displays-zoho-trust` session owns
`useUnitsOverview.ts` (built the feed), `useInventoryUrlState.ts`, `InventorySidebar.tsx`,
`InventoryTriageSidebar.tsx`, `InventoryPulseSidebar.tsx`. Wave 0 **composes** their feed and
touches none of the other four; those are quarantined to the teardown (Wave 8 in the handoff).

---

## 1. Region router (first gate — mandatory)

Classify **before** migrating. Wrong golden = false SoT “fix.”

| Region / branch | When | Golden | Force History five-row Sheets? |
|---|---|---|---|
| Workbench **`ops-queue`** | Pointer triage / dense ledger / desk collection map | Unbox History + To-ship | **Yes** |
| Workbench **`master-detail`** | Sidebar map + right workspace (Products-grade) | `workbench-master-detail.md` / Products catalog | **No** — still flush hosts, durable map, no replace-main detail |
| Workbench **`service-workspace`** | Conversation / ticket thread first | Support service recipe | **No** |
| **Station** + **Displays** | Scanner centre + right-edge Action leaves | Unbox centre + `StationDisplaysPushStack` | **No** |
| **Monitor** | Observe / timeline / TV altitude | Operations Monitor blocks | **No** |
| **Canvas** | Graph / zoom → inspect | Graph / studio | **No** |
| Admin CLIP `DataTable` / mobile | Explicit carve-outs | Admin / mobile recipes | **No** |

**Ops-queue predicate** (all three, or it is not ops-queue):

1. Owns a distinct **collection surface** (table / feed), not only a filter of a sibling.
2. Is **Workbench / Monitor browse** — pointer pick+edit or observe (not scanner-driven Station middle).
3. Has **no other home** that already owns that collection.

If the surface fails the predicate, document **honest absence** in the cohort
table — do not half-port History chrome onto it.

---

## 2. Ops-queue golden (Unbox History) — non-negotiable anatomy

Every surface classified **`ops-queue`** must read as this stack (or document
honest absence per band with a SoT/guard reason).

```text
┌─────────────────────────────────────────────────────────────────────────┐
│ LEFT (context rail)                                                     │
│   useSavedViews list (+ optional thin facets below)                     │
│   NEVER entity HorizontalButtonSlider / search-result cards as the map  │
├─────────────────────────────────────────────────────────────────────────┤
│ MIDDLE — WORKBENCH_SHEET_CHROME (gap-0, flush)                          │
│   Band 1 — lifecycle tabs (system) · solid CTAs only (trailing)         │
│            WorkbenchChromeHeader density="band" · cornerClass('flush')  │
│            NO search · NO filters · NO display sort on this row         │
│   Band 2 — WorkbenchKpiBand (snap-collapse) — honest absence OK         │
│   Band 3 — WorkbenchTriageBand: dominant find + in-field Refine         │
│            + WorkbenchInspectorToggle (Show/Hide inspector) when peek   │
│            Layout chrome (zoom · ▦ · paint) → inspector View topics     │
├───────────────────────────────── hairline ──────────────────────────────┤
│ MIDDLE — WORKBENCH_SHEET_HOST                                           │
│   LedgerGridColumnHeader (h-10)                                         │
│   NonlinearTableHost → LedgerGridSurface surface="sheet"                │
│   Zod TableDefinition owns shell recipe / prefs / columns               │
│   Status = GridStatusCellValue / lifecycle registry                     │
├─────────────────────────────────────────────────────────────────────────┤
│ RIGHT — RightRailHost modal={false} push inspector                      │
│   Map stays mounted · Band 3 parks/reopens · never replace-main pane    │
└─────────────────────────────────────────────────────────────────────────┘
```

### Cite — do not reinvent

| Piece | Path |
|---|---|
| Sheets flush law | `.claude/rules/source-of-truth.md` → Sheets flush mount recipe |
| Ops-queue recipe | `.claude/rules/display/workbench-ops-queue.md` |
| Hosts | `src/components/dashboard/workbench-shell.tsx` → `WORKBENCH_SHEET_CHROME` · `WORKBENCH_SHEET_HOST` · `WorkbenchTriageBand` |
| KPI | `src/components/dashboard/workbench-kpi-collapse.tsx` |
| Inspector toggle | `src/components/dashboard/workbench-inspector-toggle.tsx` |
| History golden | `src/components/receiving/unbox/UnboxWorkspaceView.tsx` · `UnboxWorkspaceHeader.tsx` |
| History peek | `src/components/receiving/history/HistoryCartonTriagePanel.tsx` |
| To-ship twin | `src/components/dashboard/OutboundWorkspaceHeader.tsx` · orders-queue grid |
| Table registry | `src/lib/tables/table-definition.ts` · `src/components/station/receiving-grid/receiving-table-definition.ts` |
| Saved views | `src/hooks/useSavedViews.ts` · `src/lib/saved-views/surfaces.ts` · `OutboundSavedViewsList` |
| Compact activity | `src/components/ui/CompactActivityRow.tsx` · `formatLaneAgeCompact` |
| Optimistic URL | `.claude/rules/source-of-truth.md` → Optimistic URL-param paint · `useOptimisticUrlParam` |
| Band 3 guard | `src/components/dashboard/band3-find-only.guard.test.ts` (shrink-only allowlists) |
| Sheet guards | `*-sheet.guard.test.ts` · `receiving-grid-sheet.guard.test.ts` · `dashboard-orders-sheet.guard.test.ts` |

### Tabs vs saved views (do not blur)

| | Hardcoded tabs (Band 1) | Saved views (left / table ⋮) |
|---|---|---|
| Defined by | the **system** | the **operator** |
| Represents | mutually exclusive **lifecycle** | named **facet** combo |
| Test | needs migration / status-machine change | different params the surface already reads |

Never ship entity-type pill bands (Bins · SKUs · Units · Alerts) as Band 1
lifecycle tabs — that is filters wearing tab chrome.

---

## 3. Mechanical inventory (`rg` playbook)

Run from repo root. Fill §4 cohort table. Re-run after each wave.

### 3.1 Violation fingerprints (ops-queue candidates)

Each code is a checklist id for the cohort table.

| Code | Fingerprint | Why it is debt on ops-queue |
|---|---|---|
| **V-SHELL** | `PageHeader` + `max-w-5xl` / centered scroll island | Not `WORKBENCH_SHEET_*` flush stack |
| **V-REPLACE** | `*DetailsOverlay` / full-pane swap on `?open=` / selection kills middle | Right edge must **push**; map stays mounted |
| **V-CARDS** | Collection map = result cards / hand `<ul>` / custom board | Middle must be `LedgerGrid` / `NonlinearTableHost` |
| **V-NOSHEET** | Missing `WORKBENCH_SHEET_CHROME` / `WorkbenchTriageBand` / `surface="sheet"` | Framed island or incomplete five-row stack |
| **V-ENTITYTAB** | `HorizontalButtonSlider` entity tabs as primary map axis | Tabs≠facets; soft pill band is ops chrome debt |
| **V-NOSAVED** | Pointer triage without `useSavedViews` left | Left slot law |
| **V-ACTIVITY** | Hand `relativeTime` / kind-glyph + tone-pill parade | Must be `CompactActivityRow` + `formatLaneAgeCompact` |
| **V-STATUS** | Ad-hoc status badges on grid/list identity cells | `GridStatusCellValue` / lifecycle registry |
| **V-SOFT** | Soft radius islands / pill bands on ops chrome | `cornerClass('flush')` |
| **V-URL** | Selection params soft-replace only; partial optimistic open | Mount-gated paint SoT |
| **V-NODEF** | No Zod `TableDefinition` / registry binding for the collection | Table engine SoT |

### 3.2 Commands (copy/adapt)

```bash
# Desk shells still on PageHeader / max-width islands
rg -n "PageHeader|max-w-5xl" src/components --glob '*.tsx' | rg -i 'inventory|products|warehouse|labels|support|sourcing|review|walk-in|operations' || true

# Replace-main detail overlays
rg -n "DetailsOverlay|hasOpenDetail|fills the main pane|replace.*main" src/components --glob '*.tsx'

# Sheet hosts present vs absent on candidate workspaces
rg -n "WORKBENCH_SHEET_CHROME|WORKBENCH_SHEET_HOST" src/components --glob '*Workspace*.tsx' -l
rg -n "WorkbenchTriageBand|WorkbenchInspectorToggle" src/components --glob '*.tsx' -l

# Collection without LedgerGrid / NonlinearTableHost
rg -n "LedgerGridSurface|NonlinearTableHost" src/components --glob '*.tsx' -l
rg -n "InventoryResultCard|HorizontalButtonSlider" src/components/inventory --glob '*.tsx'

# Table definitions
rg -n "parseTableDefinition|TableDefinition|surface:\\s*'sheet'" src/components src/lib/tables --glob '*.ts'

# Activity twins
rg -n "relativeTime|hrs ago|formatLaneAgeCompact|CompactActivityRow" src/components --glob '*.tsx'

# Soft chrome debt on ops surfaces
rg -n "HorizontalButtonSlider|rounded-xl|rounded-2xl" src/components/inventory src/components/products src/components/warehouse --glob '*.tsx'

# Optimistic URL coverage
rg -n "useOptimisticUrlParam|resolveOptimisticParam" src/components --glob '*.tsx' -l
```

### 3.3 Positive allowlist — do not “improve”

Do **not** restyle or rewrite these goldens unless a guard proves regression:

- Unbox History / Receiving browse (`UnboxWorkspaceView`, `ReceivingGridView`, sheet guards)
- To-ship (`DashboardOrdersView`, `OutboundTriageBand`, orders sheet guard)
- Surfaces already green on `band3-find-only.guard.test.ts` with honest absence reasons
- Station Displays leaves (`StationDisplaysPushStack`, `InventoryDisplayHost`) — different plane
- `/inventory/graph` cytoscape Canvas — not an ops-queue target
- Support `service-workspace` — execute its own prompt, not History Sheets

---

## 4. Cohort table template

Fill during §3. One row per L1/L2 surface (or per distinct collection).

| Path / surface | Region class | Violation codes | Blast (H/M/L) | Wave | Action |
|---|---|---|---|---|---|
| e.g. `/inventory` Ledger | ops-queue (candidate) | V-SHELL V-REPLACE V-CARDS V-NOSHEET V-ENTITYTAB V-NOSAVED V-ACTIVITY V-STATUS V-URL V-NODEF | H | 0 | Migrate |
| e.g. `/inventory/graph` | Canvas | — | — | — | Honest absence (Canvas) |
| e.g. Unbox Displays Inventory | Station Action | — | — | — | Out of scope (other handoff) |

**Action values:** `Migrate` · `Carve-out` (write reason into SoT/guard) · `Defer` (blocked on product decision — state the decision).

**Seed priority (2026-08-08 diagnosis — re-verify with §3 before coding):**

| Path / surface | Region class | Violation codes | Blast | Wave | Action |
|---|---|---|---|---|---|
| `/inventory` Ledger (`InventoryShell` default) | ops-queue | V-SHELL V-REPLACE V-CARDS V-NOSHEET V-ENTITYTAB V-NOSAVED V-ACTIVITY V-STATUS V-SOFT V-URL V-NODEF | H | **0** | Migrate |
| `/inventory/triage` | ops-queue or master-detail — classify | V-SHELL V-REPLACE (likely) | M | 1 | Migrate after Ledger golden |
| `/inventory/pulse` | Monitor candidate (not clean today) | V-ACTIVITY V-SHELL | M | 1+ | Migrate to Monitor recipe **or** fold into Ledger Band 2 / Operations — do not invent a third browse |
| `/inventory/graph` | Canvas | — | — | — | Carve-out |
| `/inventory/locations` | ops-queue (warehouse grids may already sheet) | Re-audit only | M | 2 | Align leftover debt to Locations sheet guards |
| `?section=replenish` | mode escape | — | L | later | Honest escape or saved-view — do not force History middle |
| Unbox `InventoryDisplayHost` | Station Action | — | — | — | Out of scope |
| `/admin/inventory/**` | admin CLIP | — | — | — | Carve-out (overlap noted; not desk golden) |

---

## 5. Per-surface migrate recipe (ops-queue)

One wave = one L1 surface **or** one entity collection. Order is fixed.

### Step 0 — Product cut (only if Band 1 entity is ambiguous)

Lock **one** primary collection for lifecycle tabs (e.g. units or bins). Entity
switches become saved-view facets or secondary `TableDefinition`s — never six
entity pill tabs. Write a one-liner into SoT / `workbench-ops-queue.md` if the
surface was previously undocumented. Prefer growing SoT over inventing a local
exemption.

### Step 1 — Shell

- Mount `DashboardScrollShell` (or existing page scroll host that already
  composes sheet chrome correctly).
- Chrome: `WORKBENCH_SHEET_CHROME` → Band 1 / 2 / 3.
- Body: `WORKBENCH_SHEET_HOST`.
- Delete `PageHeader` + `max-w-5xl` padded islands for the Ledger collection.
- Flush: `cornerClass('flush')` / `WORKBENCH_CHROME_BAND_FACE` — no soft pill bands.

### Step 2 — Table

- Author Zod `TableDefinition` (`surface: 'sheet'`, stable `id` like
  `inventory.units.browse`).
- Mount via `NonlinearTableHost` → `LedgerGridSurface` — page supplies feed +
  intents + cell renderers only.
- Status via `GridStatusCellValue` / lifecycle registry — no identity-cell status
  dots, no ad-hoc badge parade.
- Register capabilities / MOUNTS in existing grid guards (shrink-only allowlists).

### Step 3 — Inspector (stop killing the map)

- Replace replace-main overlays with `RightRailHost` `modal={false}` occupants.
- Wire Band 3 `WorkbenchInspectorToggle` (park/reopen). Honest absence only when
  the surface truly has no desk peek — document reason (see Band 3 handoff).
- Layout chrome (zoom · ▦ · compare · paint) on inspector **View** topics when
  the surface has sheet layouts — not a Band 3 icon parade (Band 3 closed golden).

### Step 4 — Left rail

- `useSavedViews` (+ extend `SAVED_VIEW_SURFACES` in lockstep with DB CHECK).
- Demote search-result **cards** as the primary collection map.
- Entity filters → facets / Refine / saved views — not `HorizontalButtonSlider`
  primary tabs.

### Step 5 — URL

- Mount-gated opens via `useOptimisticUrlParam` / `resolveOptimisticParam`.
- Collapse legacy viewport params (`?sku` / `?bin` / `?unit` etc.) into the
  open/selection contract with redirects.
- Sync-guard refs are a different job — do not invent a feature-local pending twin.

### Step 6 — Activity / secondary modes

- Ops feeds → `CompactActivityRow` + `formatLaneAgeCompact`.
- Pulse / Monitor modes: either true Monitor shell or fold — never a third
  unnamed browse recipe on the same L1.

### Step 7 — Guards + verify

- Extend or add `*-sheet.guard.test.ts` pinning `surface="sheet"` + sheet hosts.
- Grow `band3-find-only.guard.test.ts` only by **shrinking** allowlists / adding
  positive assertions for the new surface.
- Ban replace-main detail for the migrated surface (source assert).
- Inner loop: `npm run verify -- --fast`
- Before done: full `npm run verify` — fix every ✗ gate; never raise baselines.

### Failures to reject (any wave)

- CSS reskin of cards “to look like History”
- Half-port: Band 1 only, or grid without push inspector, or inspector without mounted map
- Forcing History onto Graph / Station Displays / Support service / admin
- Re-opening closed Band 3 / sheets chrome cohort waves as the main initiative
- Raising knip / DS ratchet baselines
- Starting or restarting `:3050`

---

## 6. Worked example — `/inventory` Ledger (validation)

**Not a migrate implementation checklist for this authoring doc** — the executing
session re-verifies with §3, then runs §5. This section exists so agents
recognize the pattern.

| SoT law | History golden | Inventory today | Codes |
|---|---|---|---|
| Ops-queue composition | Saved views · LedgerGrid · push rail | Sidebar search cards · pulse/list · replace-main detail | V-CARDS V-REPLACE V-NOSAVED |
| Five-row Sheets | `WORKBENCH_SHEET_*` Bands 1–3 | `PageHeader` + `max-w-5xl` island (`InventoryShell`) | V-SHELL V-NOSHEET |
| Band 1 lifecycle tabs | Inbound · Queue · Recent · History | Entity `HorizontalButtonSlider` (Activity·Bins·SKUs…) + Header Mode rail | V-ENTITYTAB V-SOFT |
| Band 3 find + inspector | `WorkbenchTriageBand` + toggle | Search in sidebar; no inspector toggle | V-NOSHEET |
| Table registry | `receiving.browse` + `NonlinearTableHost` | No inventory `TableDefinition` | V-NODEF |
| Row status | `GridStatusCellValue` | Ad-hoc badges in `EventRow` / cards | V-STATUS V-ACTIVITY |
| Right edge | `HistoryCartonTriagePanel` push | `InventoryDetailsOverlay` replaces middle | V-REPLACE |
| URL paint | Mount-gated selection stack | Optimistic mainly on `?open=`; legacy sku/bin/unit | V-URL |

**Carve-outs on the same L1 (do not History-port):**

- `/inventory/graph` → Canvas
- Unbox `InventoryDisplayHost` → Station Action (other handoff)
- `/admin/inventory/**` → admin CLIP

**Suggested Wave 0 cut:** primary collection = **units** (or bins if product
locks bins first) as Band 1 lifecycle owner; SKU/alert/count as saved views or
secondary definitions — lock in Step 0 before coding.

Key files today:

- `src/components/inventory/InventoryShell.tsx`
- `src/components/inventory/sidebar/InventorySidebar.tsx` · `InventorySidebarTabs.tsx` · `InventoryResultCard.tsx`
- `src/components/inventory/panels/InventoryDetailsOverlay.tsx`
- `src/components/inventory/PulseView.tsx` · `EventRow.tsx`
- `src/components/inventory/useInventoryUrlState.ts`

---

## 7. Wave board (executing session maintains)

> **Status (2026-08-08):** I0 + Wave-0 slice for the **units** collection is **DONE** —
> `/inventory/units` on `UnitsWorkspaceView` + `units-grid/*` (`surface:'sheet'`, registered),
> composing the parallel session's `useUnitsOverview` feed; verified green (see §0.5 for the
> per-component verification list). W2–W3 for units (table already done) fold into the
> deletion waves; the remaining L1 routes + legacy teardown are sequenced in
> [`inventory-retirement-page-by-page-HANDOFF.md`](./inventory-retirement-page-by-page-HANDOFF.md).

| Wave | Scope | Exit criteria |
|---|---|---|
| **I0** | Inventory §3 re-verify + Step 0 product cut + SoT one-liner | Cohort row confirmed; primary entity locked |
| **W0** | Inventory Ledger shell + Band 1–3 (temporary body OK) | V-SHELL cleared; no `max-w-5xl` island |
| **W1** | Inventory `TableDefinition` + `NonlinearTableHost` | V-NODEF V-CARDS V-STATUS cleared for primary collection |
| **W2** | Push inspector + Band 3 toggle | V-REPLACE cleared; map stays mounted |
| **W3** | Left `useSavedViews` + demote entity pills/cards | V-ENTITYTAB V-NOSAVED cleared |
| **W4** | URL collapse + activity face | V-URL V-ACTIVITY cleared |
| **W5** | Next cohort rows (Triage / Pulse honesty / Locations residue) | Per-row codes cleared or carved out |
| **Wn** | Long-tail ops-queue violators from fresh §3 | Cohort empty or all honest absences documented |

Chrome-only / Band 3-only debt already closed by prior sweeps: **do not** invent
new waves that re-port To-ship / Unbox History. If §3 finds residual on an
already-guarded surface, fix the regression and shrink the allowlist — do not
restart the 2026-08-05 resweep as written.

---

## 8. Hard laws + non-goals

### Hard laws

- Compose from named SoT / registry; grow SoT when incomplete; never freeze on a
  conservative reskin (`pattern-evolution.md`).
- Color, spacing, type, z-index, elevation, focus from tokens — no page-local hex /
  raw `z-[N]`.
- Motion from `@/design-system/motion` only.
- Right edge **pushes**; never floats over the work surface for desk inspectors.
- Depth = surface planes, not decorative outer gutters / centered marketing columns.
- `orgId` / tenant / `transition()` laws unchanged by UI migrate.
- E2E asserts against the QA org when touching E2E.

### Non-goals

- Implementing Inventory Phases as a silent side quest without §3 cohort proof
- Redesigning Unbox centre / Station Displays / Zoho Inventory Displays trust
- Second table engine or Orders `OrdersQueueColumnHeader` half-port
- Admin CLIP `DataTable` → sheet
- Mobile tables
- Raising DS / knip baselines
- Inventing KPIs or return-to-scan CTAs where honest absence is correct
- Re-executing closed sheets chrome Waves 0–7 or Band 3 finish as the main job

---

## 9. Done when

1. §4 cohort inventory is **empty**, or every leftover row has **Action =
   Carve-out** with a reason written into SoT and/or a shrink-only guard
   allowlist comment.
2. Unbox History + To-ship goldens unchanged (diff does not “improve” them).
3. New/extended guards green; allowlists only shrank or gained justified carve-outs.
4. Full `npm run verify` green.
5. If product code landed: one agent-log line under `docs/agent-log/entries/`
   (session that executes — not required for docs-only edits).

---

## 10. Session operating notes

- Prefer `npm run verify -- --fast` while iterating; full verify before “done.”
- Stage only files you touched; commit only when the user asks.
- If full verify fails on unrelated dirty-tree debt, fix only regressions caused
  by this wave — or stop and report blockers; do not mass-fix the tree.
- When SoT is wrong or weaker than a sibling, **grow the SoT** in the same wave
  as the first consumer — do not leave a page-local twin “until later.”
