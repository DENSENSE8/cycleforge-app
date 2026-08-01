# Plan D — Canvas station procedure (the static process + data map)

**Lane:** D · independent of A/B/C (different surface, zero file overlap)
**Surface:** `/studio` canvas — a lens + a drill depth, not a new page
**Date:** 2026-07-31 · `main` @ `1c226847d`
**Pilot:** Unbox only · **Mode:** draft → publish

---

## 0. This is already specified — read it before designing anything

`docs/operations-studio/Full Code Base Upgrade/04-DATA-FLOW-OBSERVABILITY.md` specs exactly this ask, including the owner's own words: *"see all the different pieces of everything and all the different flows of data — in real time AND in a static 'this is where the data will flow' state."*

It already decides:

- **Static map** (definitions + registries, always true, no runtime data) vs **Live overlay** (event stream, right now) — *"two render layers over **one** canvas, not two pages."*
- The static map renders **sources → transforms → sinks**, and per node at L2/L3: data sources (`DataSourceDefinition.endpoint`), actions (`ActionDefinition.endpoint` + `permission`), realtime channels, **and "Tables touched — from the route → query → table mapping."**
- Build order (§5): **static map lens first**, because it *"ships value with zero new backend and is correct even before any unit moves."*
- Named selector: `buildStaticFlowGraph(definitions, registries)`.
- Acceptance criteria (§5) — reuse them verbatim.

**This plan does not redesign that. It scopes it to station procedure, pilots it on Unbox, and closes the one gap the spec left open (§2).**

---

## 1. "Lens vs drill" in plain terms

The canvas already has **two zoom levels** and **five lenses**:

- **Zoom = how close you are.** L0 = department cards (the whole company). L1 = process nodes (the steps). Double-click dives in.
- **Lens = what color you paint it.** Like switching a map between roads and satellite: *the map doesn't move, only the paint changes.* Today: `live · flow · people · gaps · static`. Studio law: **lenses repaint, they never navigate or re-lay-out.**

Your ask is therefore **not a new page**. It is:

1. A **Procedure lens** — paints each station node with its steps and the data each step touches.
2. A new **L2 drill** — double-click a station node to go *inside it* and see its step sequence.

Nothing else on the canvas changes. Because you said the canvas is *"primarily focused on only the stations procedure"*, **Procedure becomes the default lens** for the station-scoped view; `people` / `gaps` stay available but secondary.

---

## 2. The one real gap — table lineage (answering "what's the best long-term update")

Everything the spec needs exists **except** the table mapping. `DataSourceDefinition` declares an `endpoint` (a GET route); nothing anywhere maps a route to the tables it reads and writes.

**Recommendation: declare it on the registry, and guard-test the declaration against reality.** Not pure derivation, not bare declaration.

**Why not pure derivation (route → SQL → tables).** Queries here are built with Drizzle *and* raw SQL *and* `withTenantTransaction`, and the schema's source of truth is hand-written migrations. A static analyzer would be wrong often enough to be untrusted — and **an untrusted lineage map is worse than no lineage map**, because people act on it.

**Why not bare declaration.** It drifts the first time someone adds a join and forgets the descriptor. A map that silently goes stale is the same failure as being wrong.

**Why declared + guarded is the long-term answer:**

- `DataSourceDefinition` / `ActionDefinition` are **already the declaration point** for endpoint, permission, and realtime channel. Adding `reads: TableRef[]` / `writes: TableRef[]` extends a registry rather than forking a new one — the house law (`pattern-evolution.md`: compose, then grow the SoT).
- It matches an established repo pattern: `route-permission-manifest.test.ts` pins route→permission, and `lookup-scan-wiring.guard.test.ts` parses call sites to catch a missing argument. A `data-lineage.guard.test.ts` that parses each declared route's module for table identifiers and fails when a table is touched but undeclared gives you **derivation's honesty with declaration's tractability**.
- It degrades safely: a *missing* declaration is a loud CI failure, not a quietly wrong diagram.
- It is incrementally adoptable — declare Unbox's sources first, expand per station, and the guard only enforces what is declared plus what it can see.

`.claude/rules/backend-patterns.md` already states the governing principle: *a classification that decides what a write may claim is a REQUIRED parameter, never a defaulted one — pair it with a guard that walks the call sites.*

---

## 3. Draft → publish

You confirmed draft→publish. Note what that means precisely here, because the spec splits it:

- **The procedure display is a projection.** It reads `workflow_definitions` / `workflow_nodes` / `station_definitions.config` — all of which **already have draft→publish and `version` + `is_active`** (`schema.ts:3989-4043`). Editing is gated at ST4 behind `studio.manage`.
- So the lens does **not** invent a publishing model. It renders the active (or `?v=`-pinned) definition, and edits flow through the existing draft→publish path (`/api/studio/definitions/[id]/publish`, `/discard`, `/graph`).
- **Do not add a second versioning mechanism.** `02-URL-VERSIONING-AND-ADDRESSING.md` already rules that out: URLs stay semantic, versions pin with `?v=`.

---

## 4. Scope — Unbox pilot

Model **one** station end-to-end: its step sequence, and per step the data sources, actions, channels, and tables. Prove the shape, then template it. This deliberately runs alongside lanes A/B/C on the same station in the same week — the shared understanding is the point.

**Out of scope:** the live overlay (§2 of the spec, ST2), edge animation, Flow² trends, and the other eight stations.

---

## 5. Research agenda (do this before designing the node annotation)

The node annotation vocabulary should borrow from an established standard rather than being invented. Answer these with citations:

1. **Which discipline owns "process step + the data it touches"?** Candidates: **Value Stream Mapping** (lean — its *information flow* layer is precisely this, with per-process data boxes), **BPMN 2.0** (OMG — pools/lanes/tasks/data objects/data stores), **SIPOC** (Six Sigma — Suppliers/Inputs/Process/Outputs/Customers), and **OpenLineage** (the open data-lineage standard — job→dataset edges). Which vocabulary should the node annotation adopt, and why?
2. **How do WMS vendors model a station's internal procedure?** SAP EWM **Process-Oriented Storage Control (POSC)** models external/internal process steps per warehouse process. Manhattan and Blue Yonder have equivalents. Is a station's step list a first-class configured object in those systems, or emergent from task types?
3. **Documented spec vs shop-floor practice** — how much of a warehouse's real procedure lives in the WMS config versus in a separate SOP document, and what does that split cost? This decides whether our canvas replaces the SOP or duplicates it.
4. **Lineage granularity in practice** — do teams that ship lineage (dbt, OpenLineage/Marquez, Atlan) find table-level sufficient, or does it always escalate to column-level? What is the maintenance cost curve?
5. **Scale check** — this is a one-warehouse, handful-of-operators tenant, not a 3PL. Flag any recommendation that assumes a process engineer on staff.

---

## 6. Verification

- Acceptance criteria from `04-DATA-FLOW-OBSERVABILITY.md` §5, verbatim — notably: *"Toggling Static↔Live↔Gaps never refetches the graph or re-lays-out nodes."*
- With **zero** traffic, the Procedure lens renders Unbox's complete step + data map. Correctness must not depend on a unit moving.
- `npm run verify` green; no ratchet baseline raised.
- **No polling.** `refetchInterval` is Studio law #4 and the `neon-cost-reviewer` agent flags it (Neon CU cost).
- Motion: `transform`/`opacity` only; `prefers-reduced-motion` honored; graph never re-lays-out on a lens change.
