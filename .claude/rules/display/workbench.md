# Workbench display — select → edit → persist

The **pick+edit region contract**: pointer-driven navigation of records that are **not** scan-driven, with
**durable, URL-addressable selection** and CRUD. This is the **default contract** — if a region isn't a scanner Station,
a read-only Monitor, or a node-graph Canvas, it's a Workbench.

Workbench is **not** “sidebar + right pane forever.” That is one **recipe**. Data shape chooses primary surface.
Density default: **`ops`**.

**Inherits:** ../ui-design-system.md (Kinetic Ledger, density, presentation kinds, one-row anatomy, chips, tokens).
This doc only details what's *specific* to the Workbench **contract**. Recipes live in child files.

> Rule of thumb: if the user **picks a record and edits it**, keep a **stable collection map** and a **singular focus
> surface** for the selected record. Crossfade only the focus surface — never the map.

---

## When to choose Workbench (the fallthrough)

- **Workbench is the default; you arrive here by elimination, not affinity.** Run the discriminator in order:
  scanner → Station, read-only-observe → Monitor, pan/zoom node-graph → Canvas, **everything else → Workbench.** The
  job decides, not the feature area or the route.
- **The signature is durable, URL-addressable selection + CRUD.** If the user picks a record, edits it, and the edit
  persists through a route — and a reload should land them back on the same record — it's a Workbench.
- **Anti-mix:** never bolt Workbench edit onto a pure Monitor stream; never drop a browse list into a Station scan column.
- A page may **host** a Workbench beside another contract (scan bench + collection map), but each *region* obeys exactly one.
- **Code home:** `pickArchetype()` in `src/lib/stations/archetype.ts`; surface hints + **`workbenchBranch`** in
  `SURFACE_REGISTRY` (`src/lib/stations/surface-keys.ts`).

---

## Recipes / branches (data shape chooses)

Typed ids: `WORKBENCH_BRANCH_IDS` in `surface-keys.ts`. Every `archetype: 'workbench'` surface declares one;
Station / Monitor / Canvas keep `workbenchBranch: null`.

| Branch id | Primary map | Focus surface | Law |
|---|---|---|---|
| **`ops-queue`** | Saved views + dense `LedgerGrid` | Right-rail inspector (push) | [`workbench-ops-queue.md`](workbench-ops-queue.md) |
| **`master-detail`** | Sidebar picker (`SidebarShell` / rail) | Right pane workspace | [`workbench-master-detail.md`](workbench-master-detail.md) |
| **`board`** | Swimlanes / cards | Board detail panel | FBA board — compose board patterns; no separate law file yet |
| **`fact-stack`** | Optional thin list or none | Full-width record body | Single durable entity already selected |
| **`service-workspace`** | Durable ticket/case queue — **stays mounted** | Thread + composer; context pushes right | [`workbench-service.md`](workbench-service.md) |

**Detail pane / right rail = optional secondary** in table/board recipes. Do not invent a dual pane to satisfy an old template when the collection is already the job.

**A named BRANCH is a recipe that earned a law**, not a fifth contract. `service-workspace` (Support) is the only
branch with a dedicated entry test today. The bar to mint another: primary **data shape** must mandate a different
composition axis (e.g. thread vs ledger) **and** the surface must need persistent chrome unique to that axis
(SLA, presence, omnichannel). Different business *entities* buy an existing recipe. Sales / Fulfillment Desk /
Inbound Desk → **`ops-queue`**. Slope rule: [`workbench-service.md`](workbench-service.md).

**Naming — do not confuse with Station column shell.** `@/components/station/workbench` /
[`station-workbench.md`](station-workbench.md) is the **Station region** right-pane anatomy (Unbox-family column),
**not** this Layer A Workbench contract. Prefer “Station column shell” in prose.

---

## Multi-region pages (Station + Workbench siblings)

Contracts are chosen **per region**, not per page. Unbox / Testing / Pack host **two** regions:

| Region | Contract | Role |
|---|---|---|
| Scan dock / active focus | **Station** | Ephemeral selection; act-and-clear |
| Queue · Recent · History (collection map) | **Workbench** | Durable browse; chrome tabs; grid |

```text
Station focus ──Back to list──► Workbench map
Workbench map ──Return-to-scan CTA──► Station primary work
```

### Placement (mandatory)

The return-to-scan CTA lives at the **top-right of the workbench context bar** — `WorkbenchChromeHeader`
`trailing` → `WorkbenchTrailingCluster` **`actions`** — **above the KPI strip** (`WORKBENCH_CHROME_COLUMN` /
`WORKBENCH_BODY_COLUMN`). Never in the GlobalHeader, never in the scan column, never below the KPI tiles,
never as a quiet icon in `right` filters.

```text
┌─ WorkbenchChromeHeader (pinned) ──────────────────────────────┐
│  [Recent] [Queue] [History]   …search…filters… │ Fields │ CTA │
└───────────────────────────────────────────────────────────────┘
┌─ KPI strip (scrolls with body) ───────────────────────────────┐
│  UNFINISHED · VIEWED TODAY · …                                  │
└───────────────────────────────────────────────────────────────┘
┌─ Data table / collection map ─────────────────────────────────┐
```

### Return-to-scan contract (every scan station)

Hybrid Station+Workbench pages **must** expose a solid primary CTA that rejoins Station scan actions:

| Rule | Detail |
|---|---|
| **Where** | `WorkbenchTrailingCluster.actions` (trailing cluster, after Sort → Fields) |
| **When** | On **every** strip tab (not honest-absence on the bench tab) |
| **Look** | Solid `Button` `variant="primary"` + leading station glyph + short uppercase verb (Unbox: **“Unbox”**) |
| **Click** | (1) Close carton/line overlay so the **data table** is visible · (2) Switch to the **bench tab** (strip-first / working set — Unbox: Recent) · (3) Best-effort highlight of the station’s MRU row in that table (`receiving-highlight-line` — no `select-line`, which would re-open the overlay) · (4) Focus the **station scan bar** (`receiving-focus-scan` / surface equivalent) |
| **Reference** | `UnboxWorkspaceHeader` — compose the same altitude on Testing / Pack / Shipping with their own labels |

### Back to list (the other exit)

- **Back to list** — identity exit on the focused entity (`CartonContextCard` `onExitToList` /
  `dispatchReceivingWorkspaceClose`). Clears Station focus; map stays mounted (prefer `display:none` keep-alive —
  `ReceivingRightPane`).
- **Never** put the browse list inside the scan column. **Never** treat “Back to list” as Station physics —
  it is Workbench selection clear.

References: `UnboxWorkspaceView`, `ReceivingRightPane`, `TestingWorkspaceView`, `PackerRightPane`.

---

## URL-as-state

- **Selection and mode live in `searchParams`, not React state.** Picker writes selection with `router.replace`;
  focus surface reads the same params. nuqs model.
- **Mode is a param too; the default mode drops out of the URL.** Mode-scoped params clear on mode change —
  a selection from mode A must never bleed into mode B.
- **Gap:** filters/sort/search are only *partially* in the URL. Push durable filter/sort/search into `searchParams`.

---

## Selection lifecycle

The collection map is stable; only the **focus surface** moves.

1. **Row click → `router.replace`.** Write the selection id to the URL. Active row uses house selection ring only.
2. **URL change → id-gated re-fetch.** Detail hooks gate on validity so empty selection never fires; teaching empty instead.
3. **Crossfade the focus surface** (right pane, drawer, or stack), keyed on the selection id.
4. **The map never animates.** Selection never size/height-shifts. List/accordion maps use `QUEUE_ROW.selectedClass`;
   airtable LedgerGrid maps use `QUEUE_ROW.selectedLedgerClass` / `ledgerRowStateClass`.

---

## Teaching empty + degrade-not-fail

Four settled states for every collection: **Loading** (skeleton at real geometry) · **Empty — absence** ·
**Empty — no match** · **Degraded** (sibling fetch fails → empty region, never 500 the record). Compose
`LedgerGrid` / `LedgerGridSurface` empty + search-empty props. Primary resource errors → retryable rose; secondary
degrades silently. Detail: recipe files + `OutboundKpiStrip` combined `isPending` gate.

---

## Focus-surface crossfade

Crossfade only the focus surface on selection change (`AnimatePresence mode="wait"`, opacity + small-y,
`prefers-reduced-motion`). Keep the collection map mounted (`display:none` when overlaid) to preserve cache + scroll —
`ReceivingRightPane` is the reference. Route motion through `useMotionTransition` / `useMotionPresence`; never animate
width/height/padding. Full motion law: [`motion-crossfade.md`](motion-crossfade.md).

---

## Optimistic CRUD

House CRUD route pattern (`../backend-patterns.md`). Optimistic update with rollback for add/edit; deletes are
confirm-then-commit. Thread `clientEventId` for idempotency.

---

## Action planes — where an action lives

Every operator action on a collection surface belongs to exactly **one primary plane**:

| Plane | Mechanism | For |
|---|---|---|
| **In-cell** | cell-anchored editor / popover | single-value typed fields |
| **Row-scoped** | hover controls + single-selected row menu | one-click record affordances |
| **Multi-select** | `ContextualSelectionBar` + `SelectionAction[]` | N records at once |
| **Record** | detail inspector / full record page | relational, multi-step, side-effectful |

Identity columns are collection-map read-only (`GRID_IDENTITY_COLUMN_KEYS`). Plane redundancy is required where the
primary plane is conditionally unavailable. Full decision table + keyboard ownership (innermost overlay wins Escape):
see historical depth in git / grow here when a second consumer needs it — Escape SoT is `src/lib/overlay-stack/store.ts`.

---

## Receiving spreadsheet agent waist (Unbox / History / Testing)

Unbox hosts **two** tables. Agents must not load both for a single cell edit. When editing workbench spreadsheet
display, open only: `RECEIVING_GRID_COLUMNS`, the specific cell under `receiving-grid/cells/`, align helpers,
`grid-cells.tsx`, `LedgerGridColumnHeader`. Skill: `.claude/skills/receiving-grid-cell/SKILL.md`.

---

## Gap notes (to close)

- **cmd-K launcher** — must not collide with scan focus hotkey.
- **Push filters/sort/search fully into the URL.**
- **Migrate CRUD sections to optimistic `onMutate`/rollback** where still refresh-after.
- **Support `service-workspace` UI** — list keep-alive + shell; see support-service-workspace execution prompt.

---

## Do / Don't

| Do | Don't |
|---|---|
| Declare `workbenchBranch` on every Workbench surface | Invent a 5th archetype for chat / inbox / Support |
| Keep the collection map mounted on selection | Unmount the queue when opening focus (Support gap) |
| Crossfade only the focus surface | Crossfade / animate the map |
| Host Station + Workbench as sibling regions | Drop a browse list into the scan column |
| Expose Back to list **and** return-to-scan CTA on hybrid pages (CTA on every strip tab, trailing `actions`) | One-way exit only from focus → list; honest absence of the return CTA; CTA parked below KPIs or in GlobalHeader |
| Compose `SidebarShell` / `LedgerGrid` / `WorkbenchTrailingCluster` | Fork page-local twins for the same job |
| Write selection + mode to `searchParams` | Hold selection in local `useState` only |

---

Indexed by ../contextual-display.md
