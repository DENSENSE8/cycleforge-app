# IMPLEMENTATION PROMPT — Desk page chrome (in-page tabs + fixed width)

**Paste everything below the horizontal rule into a fresh agent session.**  
Repo: `cycleforge-app` on **`main`**.  
Plan of record: [`desk-page-chrome-fixed-width-PLAN.md`](./desk-page-chrome-fixed-width-PLAN.md).

This prompt is **only** nav→page tabs and fixed-width desk stages.  
**Do not** implement caged/released, Add forms, or documents here.

---

You are implementing **DeskPageChrome** for Cycle Forge: non-scan desks get **in-page tabs** and a **fixed-width guttered stage**; **scan stations stay edge-to-edge**.

## Done when (To-ship)

1. Spine **To-ship** is a **flat L1** — no child dropdown for Orders/FBA.  
2. Desk shows **page tabs** Orders | FBA (URL deep-linkable).  
3. Default stage is **fixed max width + gutters** — not edge-to-edge.  
4. **Fullscreen** control top-right expands/collapses stage width (recommended; ship with Phase 1).  
5. Scan stations (Unbox, Testing, Packing, Scan out, …) **unchanged** and still edge-to-edge.  
6. `npm run verify` green.

## Non-goals

- Add CTA, triage form, caged→released (other plan)  
- Slot-column work  
- Opting in every desk in one PR  
- Weakening scan-station edge-measure guards  
- Reusing `STATION_WORKBENCH_LOCK_PX` as desk max-width  
- Branches off `main`; commit only if asked; do not restart `:3050` / `usav-dev`

## Read first

1. `docs/todo/desk-page-chrome-fixed-width-PLAN.md`  
2. `AGENTS.md`  
3. `src/lib/sidebar-navigation.ts` — To-ship / outbound / sales children to flatten  
4. To-ship mount: outbound/dashboard unshipped shells (`OutboundOrdersDeskShell`, etc.)  
5. FBA board entry to embed as a tab body  
6. `src/lib/station/workbench-layout.ts` + scan edge-measure config — **leave alone**  
7. `WarehouseShell` / content column — where the stage sits

## Build

**Method (locked):** extract shared `DeskPageChrome` → dogfood on To-ship (wrap existing Orders/FBA bodies as tab children) → flatten spine → port other desks later.  
**Do not** delete other desks and merge their UIs into the To-ship page. Delete only duplicate **chrome** (extra max-w wrappers / nav children that mirror tabs). Scan stations untouched.

1. `DESK_STAGE_MAX_PX` (one Mac-class constant) + `DeskPageChrome` (tabs, stage, fullscreen).  
2. Mount on **To-ship only** — pass existing grids/boards as children.  
3. Flatten spine children → tab config; URL SoT for active tab.  
4. Orders tab = existing To-ship grid; FBA tab = existing FBA surface.  
5. Prove no `DeskPageChrome` on scan stations.  
6. `npm run verify`.

## Report back

Paths changed · `DESK_STAGE_MAX_PX` · URL tab shape · scan-station proof · verify result · desks left for later ports.
