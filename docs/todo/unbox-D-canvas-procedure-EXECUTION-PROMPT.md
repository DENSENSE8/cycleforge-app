# EXECUTION PROMPT — Lane D · Canvas station procedure

> Paste below the line into a fresh session at `/Users/icecube/repos/cycleforge-app`.
> **Plan SoT:** [`docs/todo/unbox-D-canvas-procedure-PLAN.md`](./unbox-D-canvas-procedure-PLAN.md) — the plan wins on conflict.
> **Parallel lane:** D. Zero file overlap with lanes A/B/C — they own `/unbox`, you own `/studio`.

---

# Cycle Forge — Lane D: the Procedure lens

You are Claude Code in the Cycle Forge monorepo. **This is a two-pass run: research first, then build.** Do not write component code before Pass 1 is reported and accepted.

## Mission

Give `/studio` a **Procedure lens** and an **L2 station drill** that show, for one station (Unbox), its step sequence and — per step — the data sources, actions, realtime channels, and **database tables** each step touches. Static and correct with zero traffic.

## Read first, in this order — most of this is already specified

1. **`docs/operations-studio/Full Code Base Upgrade/04-DATA-FLOW-OBSERVABILITY.md`** — **the spec for this lane.** §1 static map, §4 visual language, §5 build order + acceptance. Do not redesign it.
2. `docs/todo/unbox-D-canvas-procedure-PLAN.md` — scoping, the lineage decision, the research agenda.
3. **Invoke the `ops-studio` skill and obey its laws** before touching `/studio`.
4. `docs/operations-studio/Full Code Base Upgrade/00-CODEBASE-MAP.md` — grounded current state.
5. `docs/operations-studio/Full Code Base Upgrade/02-URL-VERSIONING-AND-ADDRESSING.md` — versions pin with `?v=`; do **not** invent a second versioning model.
6. `src/lib/stations/contract.ts` + `data-sources.ts` + `actions.ts` — the registries you extend.
7. `.claude/rules/contextual-display.md` → Canvas contract; `display/monitor-and-canvas.md`.

---

## PASS 1 — research (report before building)

Answer Plan §5 with **citations**, distinguishing *documented spec* from *observed practice*:

1. Which discipline owns "process step + the data it touches" — **Value Stream Mapping** (information-flow layer, per-process data boxes), **BPMN 2.0** (data objects / data stores), **SIPOC**, or **OpenLineage** (job→dataset)? Recommend the vocabulary our node annotation adopts, and say why the others lose.
2. How do WMS vendors model a station's internal procedure — SAP EWM **POSC** (external/internal process steps), Manhattan, Blue Yonder? Is the step list a configured first-class object or emergent from task types?
3. How much real procedure lives in WMS config vs a separate SOP document, and what does that split cost? Decides whether we replace or duplicate the SOP.
4. Does table-level lineage hold in practice (dbt, OpenLineage/Marquez, Atlan), or does it always escalate to column-level? What is the maintenance curve?
5. **Scale check:** one warehouse, a handful of operators, no process engineer on staff. Flag anything that assumes otherwise.

Also complete the codebase half: read `StudioCanvas.tsx`, `canvas/studio-canvas-graph.ts`, `studio-workspace/useStudioLensState.ts`, `useStudioGraphData.ts`, and `studio-types.ts`, and report **exactly** how a lens is added today and where L2 would attach.

**Report Pass 1 and stop.** State anything in the spec or plan you believe is wrong.

---

## PASS 2 — build (only after Pass 1 is accepted)

### Step 1 — extend the registries with lineage

Add `reads: TableRef[]` / `writes: TableRef[]` to `DataSourceDefinition` / `ActionDefinition` (`src/lib/stations/contract.ts`). Declare them for **Unbox's** sources and actions only.

**Then write `data-lineage.guard.test.ts`** that parses each declared route's module for table identifiers and **fails when a table is touched but not declared**. Model it on `route-permission-manifest.test.ts` and `lookup-scan-wiring.guard.test.ts`. Register it in `test:ds-guards`.

The guard is not optional polish. An undeclared table must be a **loud CI failure**, never a quietly incomplete diagram — a lineage map people can't trust is worse than none.

### Step 2 — the pure selector

`buildStaticFlowGraph(definitions, registries)` — the name the spec gives it. **Pure: no fetch, no React, no side effects.** Unit-test it directly; it is the piece that must stay correct with zero traffic.

### Step 3 — the lens + drill

- Register **Procedure** as a lens alongside `live · flow · people · gaps · static`, and make it the **default** for the station-scoped view (the canvas is *"primarily focused on only the stations procedure"*).
- Add the **L2 drill**: double-click a station node → its step sequence with per-step data annotations.
- **Lenses repaint; they never navigate or re-lay-out.** Toggling must not refetch the graph or move a node. This is the spec's own acceptance criterion.

### Step 4 — visual language

Follow `04` §4 and `03-DESIGN-LANGUAGE-2026.md`. Kinetic Ledger tokens only. `transform`/`opacity` only, `prefers-reduced-motion` honored.

---

## Hard rules

- **No new backend for v1.** The static map is a projection of definitions you already serve (`04` §1).
- **No polling.** `refetchInterval` is Studio law #4; the `neon-cost-reviewer` agent flags it.
- **No second versioning model.** Read the active definition or the `?v=`-pinned one; edits flow through the existing draft→publish routes (`/api/studio/definitions/[id]/publish` / `/discard` / `/graph`).
- **Do not crossfade or re-lay-out the graph** on a lens change (`display/monitor-and-canvas.md`).
- **Unbox only.** Do not model the other eight stations.
- **Out of scope:** live overlay, edge animation, Flow² trends.
- Do not touch `/unbox` files — lanes A/B/C own those.
- Never raise a ratchet baseline. Dev server on **`:3050`** — attach; never start, restart, or kill it.

## Done when

- Procedure lens renders Unbox's full step + data map **with zero traffic**.
- `data-lineage.guard.test.ts` passes and fails correctly when a declaration is removed (prove both directions).
- Lens toggle causes no refetch and no re-layout.
- `npm run verify` green, no baseline raised.
- `04` §5 acceptance criteria met.

## Report back

1. Pass 1 findings with citations, and your recommended annotation vocabulary.
2. The `TableRef` shape you chose, and the guard's true-positive + true-negative proof.
3. Where L2 attaches and how the lens registers.
4. Anything in the spec or plan you believe is wrong.

Commit only when asked. Stage only files you changed.
