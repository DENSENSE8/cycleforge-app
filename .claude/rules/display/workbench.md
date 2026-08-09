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
| **`ops-queue`** | Dense `LedgerGrid` — **rail-less** (Pattern E); saved views + scope in a Band-1 Views menu | Right-rail inspector (push) | [`workbench-ops-queue.md`](workbench-ops-queue.md) |
| **`master-detail`** | Sidebar picker (`SidebarShell` / rail) | Right pane workspace | [`workbench-master-detail.md`](workbench-master-detail.md) |
| **`board`** | Swimlanes / cards | Board detail panel | FBA board — compose board patterns; no separate law file yet |
| **`fact-stack`** | Optional thin list or none | Full-width record body | Single durable entity already selected |
| **`service-workspace`** | Durable ticket/case queue — **stays mounted** | Thread + composer; context pushes right | [`workbench-service.md`](workbench-service.md) |

**Detail pane / right rail = optional secondary** in table/board recipes. Do not invent a dual pane to satisfy an old template when the collection is already the job.

**Left edge is earned, not default.** A pointer-driven triage queue (`ops-queue`) is **rail-less** — the table rows are the picker, so a left column would only restate the tabs / KPI / Views menu. A left rail is right only when it holds something they cannot: a scan station's **recents/resume rail**, or a `master-detail` **record picker**. Full law: [`source-of-truth.md`](../source-of-truth.md) → Left-edge occupant.

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
`trailing` → `WorkbenchTrailingCluster` **`actions`** — **at or above the KPI display, never below it**
(`WORKBENCH_CHROME_COLUMN` / `WORKBENCH_BODY_COLUMN`). Never in the GlobalHeader, never in the scan
column, never below the KPI tiles, never as a quiet icon in `right` filters. The default shape below
has the KPI strip in the body (scrolling, below the pinned chrome); Unbox is a **documented exception**
that pins the KPI cluster inline in the same chrome row as the CTA instead — same "never below" rule,
different row. Detail: [`workbench-ops-queue.md`](workbench-ops-queue.md) → Sticky docking.

```text
┌─ WorkbenchChromeHeader (pinned) ──────────────────────────────┐
│  [Recent] [Queue] [History]   …search…filters… │ Sort │ CTA   │
└───────────────────────────────────────────────────────────────┘
┌─ KPI strip (scrolls with body; Unbox pins this inline in chrome instead — see above) ─┐
│  UNFINISHED · VIEWED TODAY · …                                  │
└───────────────────────────────────────────────────────────────┘
┌─ Band 3 triage ─ find · filter · week ────────────[▦]──┐ ← column display
┌─ Data table / collection map ────────────────────────────┐   portals into Band-3
│  column header band                                      │   or View cluster;
├──────────────────────────────────────────────────────────┤   no host ⇒ no ▦)
```

**Column display belongs to the GRID** (2026-08-02; Band-3 portal norm 2026-08-06).
Chrome Fields is retired: a control that mutates the column set of a card does
not belong on page chrome floating above that card. It does not get a permanent
`w-9` header track / `pr-9` on the card either — that covered `TRACKING`.

**Norm:** every table with a `WorkbenchTriageBand` portals ▦ into the band's
`controlsSlotRef` (`columnTriggerPortalTarget` → `GridColumnGutter`
`triggerPortalTarget`) so it sits resident beside filter / staff / week / sort.
**No host ⇒ no ▦ (2026-08-08).** A table with neither a Band-3 controls slot nor
an inspector View cluster paints no trigger at all, and its columns stay at the
descriptor default. The card-corner hover-reveal float that used to cover this
case is **deleted** — give the surface a host rather than re-adding a float.
Surfaces knowingly left dark are recorded in the shrink-only
`NO_COLUMN_DISPLAY_HOST` ledger (`workbench-trailing-cluster.guard.test.ts`).

### Return-to-scan contract (every scan station)

Hybrid Station+Workbench pages **must** expose a solid primary CTA that rejoins Station scan actions:

| Rule | Detail |
|---|---|
| **Where** | `WorkbenchTrailingCluster.actions` (trailing cluster, after Sort) |
| **When** | On **every** strip tab (not honest-absence on the bench tab) |
| **Look** | Solid `Button` `variant="primary"` + leading station glyph + short uppercase verb (Unbox: **“Unbox”**) + `WORKBENCH_CHROME_PILL_CLASS` (same soft radius as the band History tab on all sides — never `rounded-*-none` against the trailing hairline). Law: `source-of-truth.md` → Workbench chrome pill |
| **Click** | **It RESUMES** (ruled 2026-08-03): (1) Resolve the station’s **MRU record** · (2) Switch to the **bench tab** (strip-first / working set — Unbox: Recent) **without clearing the pick** — `clearLine: false`, because `setUnboxView` dispatches `receiving-clear-line` by default · (3) **Open** that record (`receiving-select-line`, which on a rail that takes a selected id also marks the left sidebar — one signal, never a second parked-cursor field) · (4) Focus the **station scan bar** (`receiving-focus-scan` / surface equivalent) |
| **Why not land a table** | The button sits in the station’s **own** chrome, so “go to Unbox” is not available as a meaning — the operator is already there. The close-overlay-first version also *silently failed*: the MRU comes from `view=unbox_opened` while Recent is `view=viewed` (two memberships, and since 2026-08-01 a browse click no longer stamps a view), and `useReceivingRowSelection` nulls a highlight absent from its rows — so the row pulse routinely could not fire, and the click read as a tab change. Opening the record has no such failure mode. |
| **Never** | Close an open record on this path — including when the MRU lookup throws. “I could not find your last carton” is not a reason to discard the one on screen. |
| **Honest absence** | A station whose bench holds no single resumable record (a per-staff *history* rail, or no MRU feed at all — Labels) ships the CTA **without** the resume step. Do not mint a working-set rail, and do not give a history rail a selection it never had, just to earn step 3. |
| **Reference** | `UnboxWorkspaceHeader` — compose the same altitude on Testing / Pack / Shipping with their own labels |
| **Ports** | [`docs/todo/return-to-scan-PORTS.md`](../../../docs/todo/return-to-scan-PORTS.md) — **read this before porting.** Per-surface registry (which rails mark a resumed record and which cannot), the copy-this handler recipe, the two traps, and the guard to grow. Symptom it exists to prevent: *“the Unbox button just goes to the Recents tab.”* |

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
| **Multi-select** | gutter hit-plane (`GridRowCheckbox`) + right-rail selection plane (`RailSelectionBand` / `RailActionRegion` via `useOrderRailSelection` / `useReceivingLineRailSelection` / `useRepairRailSelection`) + `SelectionAction[]` — **Incoming click-select:** plain row click toggles bulk; select track shows decorative full-cell `GridClickSelectFace` when selected; double-click / Enter opens the inspector. **Unbox History:** left-click opens `detail:history` **push** triage rail (`HistoryCartonTriagePanel`, `modal={false}` — never float); gutter checkbox owns bulk; double-click / Enter / “Open in Unbox” opens `LineEditPanel` | N records at once |
| **Record** | detail inspector / full record page | relational, multi-step, side-effectful |

Identity columns are collection-map read-only (`GRID_IDENTITY_COLUMN_KEYS`). Plane redundancy is required where the
primary plane is conditionally unavailable. Full decision table + keyboard ownership (innermost overlay wins Escape):
see historical depth in git / grow here when a second consumer needs it — Escape SoT is `src/lib/overlay-stack/store.ts`.

---

## Receiving spreadsheet agent waist (Unbox / History / Testing)

Unbox hosts **two** tables. Agents must not load both for a single cell edit. When editing workbench spreadsheet
display, open only: `RECEIVING_GRID_COLUMNS`, the specific cell under `receiving-grid/cells/`, align helpers,
`grid-cells.tsx`, `LedgerGridColumnHeader`. Skill: `.claude/skills/receiving-grid-cell/SKILL.md`.

**Status column:** Unbox History (and Unbox / Testing) renders lifecycle state through
`ReceivingStatusCell` → `GridStatusCellValue` + `workflowStageBadge` from `workflow-stages.ts` —
never a page-local pill or full-cell status fill.

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
