# Cycle Forge — agent instructions

Portable hard rules for every coding agent. **This file is the constitution.**
Depth for a job: run `node scripts/sot-lookup.mjs "<job>"` before writing new UI —
do not invent a page-local twin.

## Product

**Cycle Forge** is multi-tenant reseller-ops SaaS. This repo is the app; USAV is
the dogfood tenant. Vendor integrations are tenant connectors behind capability
facades — never the product face in operator copy.

## Region contracts (live hosts)

Regions are I/O contracts (`MotionRegion`: `station` · `workbench` · `monitor` ·
`canvas`). Compose the named host — never a layout skin twin.

| Region | Job | SoT |
|---|---|---|
| Station | Scan pane + Displays push | `StationScanPaneHost` · `src/components/station/workbench/StationScanPaneHost.tsx` |
| Station | Column shell | `StationWorkbench` · `src/components/station/workbench/` |
| Station | Displays column | `StationDisplaysPushColumn` · `src/components/station/displays/` |
| Station | Entity identity | `CartonContextCard` · `src/components/station/entity-context/` |
| Station | Terminal dock | `StationTerminalDock` · `src/components/station/terminal/` |
| Workbench | Sheet shell (Bands 1–3) | `WorkbenchSheetView` · `src/components/dashboard/WorkbenchSheetView.tsx` |
| Workbench | Band-1 chrome | `WorkbenchChromeHeader` · `src/components/dashboard/workbench-shell.tsx` |
| Workbench | Band-2 KPI (snap) | `WorkbenchKpiBand` · `src/components/dashboard/workbench-kpi-collapse.tsx` |
| Workbench | Spreadsheet mount | `NonlinearTableHost` · `src/components/tables/NonlinearTableHost.tsx` |
| Workbench | Table registry | `TABLE_DEFINITIONS` · `src/components/tables/table-definition-registry.ts` |
| Workbench | Band-3 Views | `WorkbenchViewsMenu` · `src/components/saved-views/WorkbenchViewsMenu.tsx` |
| Workbench | Right inspector | `RightRailHost` · `src/components/right-rail/RightRailHost.tsx` |
| Workbench | Ingest picker (Add / Import methods) | `DeskInspectorIndexShell` · `src/components/right-rail/DeskInspectorIndexShell.tsx` |
| Monitor | Page shell | `MonitorPageShell` · `src/design-system/components/monitor/MonitorPageShell.tsx` |
| Monitor | KPI / blocks | `OpsKpiBand` · `src/design-system/components/monitor/` |
| Canvas | Studio shell | `StudioShell` · `src/components/studio/` |
| Shared | Frame budgets | `MIN_WORK_SURFACE_PX` · `src/lib/right-rail/frame.ts` |
| Shared | Left context rail | `ContextPanelLayout` · `src/components/sidebar/ContextPanelLayout.tsx` |
| Shared | Route panes | `RouteShell` · `src/design-system/components/RouteShell.tsx` |

## Design-system & identity SoTs

| Job | SoT |
|---|---|
| Buttons / panels / fields | `Button` · `Panel` · `src/design-system/primitives/` |
| Grid engine | `LedgerGridSurface` · `src/design-system/components/grid/` |
| Grid column align | `resolveGridColumnAlign` · `src/design-system/components/grid/` |
| Motion roles | `motionRole` · `src/design-system/motion/` |
| Tokens (color · type · radius · z · focus) | `cornerClass` · `src/design-system/tokens/` |
| Copy / order / PO / tracking chips | `CopyChip` · `src/components/ui/CopyChip.tsx` |
| Platform face | `PlatformMark` · `src/lib/source-platform.ts` |
| Stacked row identity | `StackedRowIdentity` · `src/components/ui/StackedRowIdentity.tsx` |
| Compact activity row | `CompactActivityRow` · `src/components/ui/CompactActivityRow.tsx` |
| Tooltips (no native title attr) | `HoverTooltip` · `src/components/ui/HoverTooltip.tsx` |

## Hard laws (active in code)

- **Never commit `.env`**, and never bypass hooks in `.claude/settings.json`.
- **Never start, restart, or kill a dev server.** Attach to the user's on `:3050`.
- **The user manages commits.** Never `git stash`; stage only your files; commit/push only when asked.
- **Stay on the checkout's branch.** The worktree is the branch.
- **Compose from the named SoT first; grow it when wrong.** Never fork a page-local twin. Lookup: `node scripts/sot-lookup.mjs "<job>"`.
- **Frame budgets** live in `src/lib/right-rail/frame.ts` — desk center ≥ `MIN_WORK_SURFACE_PX` (784); station Displays keep center ≥ `STATION_PUSH_CENTER_FLOOR_PX` (720); gutters `0`. Right edge **pushes** via `RightRailHost` (`modal={false}`); never a floating card over the work.
- **Workbench ingest pickers** (Add / Import methods) open as `RightRailHost` index→leaf via `DeskInspectorIndexShell` (Unbox `DisplaysIndexLeafStage` waist) — never a Band-1 dropdown of workspaces.
- **Ops chrome is flush-square** — `WORKBENCH_CHROME_PILL_CLASS` = `cornerClass('flush')` in `workbench-shell.tsx`.
- **Workbench spreadsheets** mount via the table definition registry + `NonlinearTableHost` over `LedgerGridSurface` — never a new `*GridView` twin.
- **Motion** only via `@/design-system/motion` + `motionRole.*`. Only `src/design-system/motion/framer.ts` may import `motion/react` or `framer-motion`.
- **Color, spacing, type, elevation, focus, and named z-index tokens** come from `@/design-system/tokens` — no page-local hex; no ad-hoc numeric stacking.
- **Platform / order identity** resolves from `source-platform.ts` + chip family (`OrderIdChip` / `PoChip` / `TrackingChip` / `PlatformMark`) — never prose platform names as the channel face.
- **Mount-gated URL opens** paint via `useOptimisticUrlParam` / `resolveOptimisticParam` (`src/hooks/useOptimisticUrlParam.ts`, `src/lib/routing/optimistic-url-param.ts`).
- **Status changes only via `transition()`** (`src/lib/inventory/state-machine.ts`) — never a raw status UPDATE outside the state machine.
- **`orgId` comes from `ctx`**, never the body; org-scoped writes go through `withTenantTransaction` (`src/lib/tenancy/db.ts`).
- **Cross-entity urgency** resolves only in `promoteUrgency()` (`src/lib/urgency/`).
- **Never build a second search engine, audit API, or status transition** outside the SoT modules.
- **`npm run verify` before done** — lint · typecheck · unit · knip · route-auth · schema drift. Never raise a ratchet baseline to pass.
- **E2E asserts against the QA org**, not the dogfood tenant.

## Workflow

Live law is this file + `.claude/settings.json` hooks. Do not restore deleted
rule files into the always-on prompt — grow a one-line hard law here instead.
