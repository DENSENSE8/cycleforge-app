# Contextual display rules — master index

House identity is **Kinetic Ledger** (`AGENTS.md`, `ui-design-system.md`, `src/design-system/DESIGN_SYSTEM.md`).
This file is the **entry point** for **region contracts** and **data-driven surfaces**.

**Contracts are not layout skins.** Station / Workbench / Monitor / Canvas answer *what may scan, select, edit, or observe* — not “must be sidebar + right pane” or “no grids.”

Pick in this order:

1. **Region contract** (`pickArchetype` Q1→Q4)
2. **Data shape → primary surface**
3. **Density** (`floor` | `ops` | `rollup` | `studio`)
4. **Compose / grow** named shells; resolve presentation kinds via SoTs

Mixing two **contracts** in one region — a browse list inside a station, edit controls bolted onto a pure observe surface — is the single most common way surfaces feel wrong.

The discriminator, in one line: **does the region react to a *scanner*, an *observer*, a *graph*, or a *pointer*?**

Child recipes: [display/](display/) (see [index](#index-of-child-docs)).

---

## Step A — Pick the region contract

A mechanical procedure — run it **per region**, not per page. A page with N jobs is N regions; each region gets exactly one contract.

### Discriminator questions — run in order, first **yes** wins

- **Q1 — INPUT (scanner?):** Does this region react to a **scanner / keyboard-wedge / barcode / camera scan**?
  → **Station.** Scanner-driven always short-circuits; it is the single most decisive question.
- **Q2 — JOB (observe-only?):** Is the user **observing** a live/historical stream or rollup, with **no intent to edit**
  and **no durable selection** (read-only, filters are throwaway URL params)? → **Monitor.**
- **Q3 — TOPOLOGY (node-graph?):** Is the primary surface a **spatial node-graph** the user **pans / zooms / focuses**
  (semantic-zoom depths, overlay lenses, an inspector as secondary detail)? → **Canvas.**
- **Q4 — DEFAULT (pick + edit):** Otherwise the user **picks a record and edits it** (durable,
  URL-addressable selection, CRUD). → **Workbench.** Workbench is the fallthrough.
- **Q5 — CARDINALITY sanity check:** one transient entity at a time → Station; many records you navigate+edit →
  Workbench; an append-only event stream you read → Monitor; a graph of nodes+edges → Canvas. If cardinality contradicts
  Q1–Q4, **re-read the JOB** — the job wins, never the feature area.
- **Q6 — RISK / PERSISTENCE:** act-and-clear (no undo trail in URL) → Station; edit-and-keep (persists via CRUD route) →
  Workbench; nothing persists (pure read) → Monitor; draft→publish of a definition → Canvas.

### `pickArchetype()` — the decision table as code

```ts
function pickArchetype(region) {
  // region = { job, inputModel, dataShape, navigation, selection, persistence }
  if (region.inputModel === 'scanner') return 'station';        // Q1 — scanner wins
  if (region.job === 'observe' && region.persistence === 'none'
      && region.selection === 'ephemeral-or-none')
    return 'monitor';                                            // Q2 — read-only stream/rollup
  if (region.dataShape === 'node-graph' && region.navigation === 'pan-zoom-focus')
    return 'canvas';                                             // Q3 — spatial graph
  return 'workbench';                                            // Q4 — default: pick → edit
}
// A page with N jobs => split into N regions, run per region; never blend two contracts in one region.
// On ambiguity, the JOB (observe vs edit vs act-and-clear vs reshape) decides — not the feature area or route.
```

> **Code home.** Implemented in `src/lib/stations/archetype.ts` (`pickArchetype()` — explicit hint wins, else Q1→Q4).
> First-class surfaces declare contracts in `SURFACE_REGISTRY` (`src/lib/stations/surface-keys.ts`).
> Composed render path: `SurfaceRenderer` / `StationSlot` when `surface_composed_render` is on.
> See `docs/todo/studio-driven-operator-surfaces-refactor-plan.md`.

---

## Step B — Data shape → primary surface

**After** the contract, choose the primary surface from data — not from habit.

| Data shape | Primary surface | Secondary (optional) |
|---|---|---|
| Singleton transient | Station active card | HUD / offline |
| Singleton durable | Fact stack + actions | Timeline / related tools |
| Many records + pick | List **or** table **or** board | Inspector / fact stack / drawer |
| Event stream | Timeline / feed | Filter band only |
| Rollup metrics | KPI strip + SectionCards | Drill filters |
| Definition graph | Canvas | Inspector |

**Context rail / right pane / detail drawer = optional secondary.** It is a common Workbench *recipe*, not Workbench identity.

Density defaults: Station → `floor`; Workbench collection edit → `ops`; Monitor → `rollup`; Canvas → `studio`.

---

## At a glance (contracts)

| | **Station** | **Workbench** | **Monitor** | **Canvas** |
|---|---|---|---|---|
| Driven by | scanner | pointer | stream / poll | pan / zoom / focus |
| Job | act-and-clear | pick + edit | observe | reshape definition |
| Selection | ephemeral | durable URL | none (filters only) | durable focus URL |
| What may crossfade | **active card** | **focus detail region** (pane/drawer/stack) — never the collection map | drill/detail only — never the stream | overlay repaint — never the graph |
| Common primary surfaces | scan card | list / table / board / master–detail | timeline / KPI rollup | React Flow graph |
| Persistence | act-and-clear | CRUD | none | draft → publish |
| Empty / error | station-down first-class | teaching empty + degrade-not-fail | empty range teaching | empty graph / failed version |
| Density default | `floor` | `ops` | `rollup` | `studio` |
| Reference modules | `StationScanBar`, `StationPacking`, `PackChecklist`, `OfflineBanner` | `ProductsWorkspace`, `SidebarRailShell`, boards/tables in feature folders | `MonitorPageShell`, `SectionCard`, `KpiStrip`, `EventTimeline` | `StudioShell`, `StudioCanvas`, `StudioInspector` |
| Deep dive | [station.md](display/station.md) | [workbench.md](display/workbench.md) | [monitor-and-canvas.md](display/monitor-and-canvas.md) · [monitor-rollup-blocks.md](display/monitor-rollup-blocks.md) | [monitor-and-canvas.md](display/monitor-and-canvas.md) |

---

## The four contracts in brief

### Station — `scan → crossfade → display`

**Scanner-driven.** Focus-locked scan bar + single active-entity card that *replaces* on each scan. Selection is **ephemeral** — never URL. Station-down is first-class (`OfflineBanner`). Density **`floor`**. Presentation of the active unit is a **fact stack** resolved via SoTs.

> Screen serves the scan, not the pointer. No competing browse grids. → [display/station.md](display/station.md).

### Workbench — `select → edit → persist`

**Pointer-driven pick+edit** with **durable, URL-addressable selection** and CRUD. That is the contract.

**Common recipes** (data shape picks one):

1. **Master–detail** — sidebar picker (`SidebarShell` / `SidebarRailShell`) + right-pane workspace (Products, many receiving flows).
2. **Table or board + optional inspector** — collection is primary (orders queue, FBA board); context opens on selection.
3. **Fact stack / form** — single durable record focused without a heavy dual pane.

Do **not** force recipe (1) when the data is a board or wide table. When using a sidebar picker, **compose the rail, never fork**; mode rail lives with the picker; related/similar is progressive disclosure below the map, never an inverted sidebar.

References: `ProductsWorkspace.tsx`, `QcChecklistWorkspace.tsx`, `SidebarRailShell.tsx`, `ReceivingRightPane.tsx`, FBA/order boards.

→ [display/workbench.md](display/workbench.md).

### Monitor — `filter → stream → read`

**Observe-only.** No durable selection, no edit. Filters are ephemeral URL params. Primary surfaces: event stream, KPI rollup (`MonitorPageShell` + blocks). Density **`rollup`**. Org-scoped inventory events only for analytics.

> Watches and never edits. Row gains durable selection or save → split into Workbench region.  
→ [display/monitor-and-canvas.md](display/monitor-and-canvas.md).

### Canvas — `graph → zoom/lens → focus → inspect`

**Spatial** definition graph. Graph is the map; inspector is secondary. Lenses repaint overlays; never re-layout/crossfade the graph.

→ [display/monitor-and-canvas.md](display/monitor-and-canvas.md).

---

## Full procedure (new surface)

1. **Name the JOB and INPUT MODEL in one sentence** — ignore the route and feature area.
2. **Run Q1→Q4** — first yes wins the **contract** for this region.
3. **Split multi-job pages into regions** — one contract each; never blend.
4. **Resolve data shape → primary surface + density** (Step B table).
5. **Open the child doc** for the contract and instantiate **recipes** from named reference modules; compose rails/blocks, never fork them for the same job.
6. **Apply Kinetic Ledger inside** (`ui-design-system.md`) — tokens, one-row anatomy, presentation kinds, `HoverTooltip`, paired icons.
7. **Wire motion** from [display/motion-crossfade.md](display/motion-crossfade.md): crossfade only the singular **focus surface** (active card / detail region / overlay), through `useMotionTransition` / `useMotionPresence`.
8. **Wire backend** from `backend-patterns.md`.
9. **Re-check anti-mix rules.** If any fires, go back to step 2.

---

## Update / lifecycle algorithms

### Station — `scan → resolve → set-active → re-focus → act → clear`

1. **MOUNT:** scan bar auto-focuses (last-registered scan target wins F2, `src/lib/scan-hotkey/store.ts`). Active-card empty; HUD ambient.
2. **SCAN:** wedge/camera → Enter → classify (`station-scan-routing.ts`) → domain handler.
3. **RESOLVE → SET ACTIVE:** active card mounts via `AnimatePresence mode="wait"` keyed on entity id — opacity + small-y. Previous exits first.
4. **RE-FOCUS:** clear + re-focus; watchdog on blur/visibilitychange.
5. **ACT:** scan-to-confirm; optimistic UI; `clientEventId` idempotency; 409 → big pass/fail, not a quiet toast.
6. **CLEAR:** ephemeral — never URL selection.
7. **STATION-DOWN:** `OfflineBanner`; degrade-not-block.

### Workbench — `mount → select → fetch → focus-crossfade → edit → persist`

1. **MOUNT:** collection map (list / table / board / sidebar picker) renders. Teaching empty for no selection.
2. **SELECT:** write durable selection to URL. **The collection map does not animate.**
3. **FETCH:** detail gated on valid id; each sub-resource degrades alone — never 500 the whole record.
4. **RENDER → CROSSFADE:** only the **focus detail region** (pane, drawer, or stack) crossfades on selection id — not the map.
5. **EDIT → PERSIST:** house CRUD route; optimistic with rollback; deletes confirm-then-commit; `clientEventId`.
6. **STATE:** mode-scoped params clear on mode change. Prefer URL for filters/sort/search (partial today).

**Master–detail recipe notes:** compose `SidebarShell` / `SidebarRailShell`; mode rail in sidebar header; `ReceivingRightPane` is a reference for pane crossfade with cache-preserving `display:none`.

**Monitor / Canvas** lifecycles: [display/monitor-and-canvas.md](display/monitor-and-canvas.md).

### Shared lifecycle rules

- One contract per region.
- Selection durability matches the contract (Station ephemeral; Workbench/Canvas URL; Monitor filters only).
- Crossfade target is singular and is the **focus surface**, never the list/map/graph.
- Backend half is shared (`backend-patterns.md`). Display never reimplements status machines.

---

## Choosing & not mixing

- **Decide the contract before the layout.** Run Q1→Q4 first, then data shape.
- **Don't put a browsing list in a Station** — competes with scan focus.
- **Don't make a Station react to hover/click as the primary path** — scans win.
- **Don't invert a sidebar picker** to hold related/similar instead of the map (when using master–detail recipe).
- **Don't crossfade a collection map, Monitor stream, or Canvas graph** — only the focus surface.
- **Don't bolt edit affordances onto a pure Monitor** — durable selection or save ⇒ Workbench region; split it.
- **Don't force dual-pane** when data is a board, wide table, or single fact stack.
- **A page may host several contracts** — each region obeys exactly one.

---

## Shared foundation

All contracts inherit `ui-design-system.md` — **do not restate it here**. Load-bearing:

- Kinetic Ledger tokens, density modes, presentation kinds (SoTs).
- One-row anatomy; selection = ring + background only.
- Compose rails/shells for picker infrastructure; grow SoT when wrong.
- Empty/error teach and degrade.
- Backend: `transition()` / `applyTransition`, `clientEventId`, tenant GUC, `recordAudit`.

### The motion law

One engine: `src/design-system/foundations/motion-framer.ts`. **Opacity + transform only**, `mode="wait"`,
`initial={false}` on first mount, **stable keys** (entity id, never array index). **Never animate layout**
(width/height/padding — height via `grid-template-rows`). Crossfade **target** is the singular focus surface.
Route every preset through `useMotionTransition`/`useMotionPresence` so reduced motion collapses to opacity.
Full recipe: [display/motion-crossfade.md](display/motion-crossfade.md). Auth steps: [display/auth-step-panel.md](display/auth-step-panel.md).

- Library: **Motion** (`motion/react` v12 and legacy `framer-motion` v11 — one import path per file).
- Prefer the `/motion` skill before inventing animation APIs.
- Springs for gesture/physical; ease-out tween sub-300ms for discrete focus swaps.
- `layoutId` only for genuine shared-element continuity — never list→detail *replace*.

---

## Index of child docs

- **[`display/station.md`](display/station.md)** — Station contract + floor density recipes.
- **[`display/workbench.md`](display/workbench.md)** — Workbench contract; master–detail **and** table/board recipes.
- **[`display/monitor-and-canvas.md`](display/monitor-and-canvas.md)** — Monitor observe + Canvas graph.
- **[`display/monitor-rollup-blocks.md`](display/monitor-rollup-blocks.md)** — Rollup block registry (`rollup` density).
- **[`display/motion-crossfade.md`](display/motion-crossfade.md)** — Motion / singular focus crossfade.
- **[`display/auth-step-panel.md`](display/auth-step-panel.md)** — Compact multi-step auth panels.
- **[`display/reference-timeline.md`](display/reference-timeline.md)** — Event-stream primary or secondary surface.

---

## Open questions / known gaps

- **Reduced-motion residual raw consumers** — station cards / `StationPacking` still consume some presets raw; prefer hook bridge everywhere.
- **cmd-K shipped FBA fallback** — shipped shipments may not open on FBA board shape.
- **URL-as-state partial in Workbench** — filters/sort/search often in-memory.
- **Studio publish gate** — should publish validate contracts + Kinetic Ledger token rules?
- **Monitor↔Workbench boundary** — insights chat and clickable rows must not grow silent durable edit.
- **`AuditTimeline` vs `EventTimeline`** — still a deliberate fork?
- **Block registry** — Monitor Phase-1 done; promote Station/Workbench fact-stack / row blocks next.
- **Presentation-kind registry** — SoTs exist; a single typed registry module is an emerging promote target (document first, code when 2+ consumers need it).
