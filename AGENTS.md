# Cycle Forge — agent instructions

Portable hard rules for every coding agent. **This file is the constitution.**

**Depth is ON-DEMAND — go get it.** This file plus `.claude/rules/*.md` is
everything loaded for you, and it is deliberately small. The rest lives in
[`docs/rules/`](docs/rules/) and is **not** in your context:

1. `node scripts/sot-lookup.mjs "<job>"` — the SoT for a job, before writing new
   UI. Do not invent a page-local twin.
2. Empty result? It indexes this file + code symbols, **not** the prose tables —
   fall back to [`docs/rules/source-of-truth.md`](docs/rules/source-of-truth.md).
3. Building a surface? Read the one recipe that governs it —
   [`docs/rules/README.md`](docs/rules/README.md) routes you in one hop.

Reading the depth for the surface you are touching is not optional diligence; it
is how you avoid forking a twin of something that already exists.

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
| Workbench | Right inspector lifecycle | `usePanelStore` · `src/lib/right-rail/panel-store.ts` |
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
| Order warranty card | `OrderWarrantySummary` · `src/components/order-record/OrderWarrantySummary.tsx` |
| Label-builder numeric step | `NumericStep` · `src/components/barcode/bin-label-printer/NumericStep.tsx` |
| Station carton Macro host | `StationDisplaysActionFloor` · `src/components/station/displays/StationDisplaysActionFloor.tsx` |
| Station carton Macro verbs | `CartonDisplaysActionFloor` · `src/components/station/displays/CartonDisplaysActionFloor.tsx` |
| Staff PIN numpad theme | `THEME_NUMPAD` · `src/components/auth/theme-numpad.ts` |
| Tooltips (no native title attr) | `HoverTooltip` · `src/components/ui/HoverTooltip.tsx` |
| Conversation message card | `ConversationMessageCard` · `src/design-system/primitives/ConversationMessageCard.tsx` |
| Conversation chrome tokens | `conversation-chrome` · `src/design-system/primitives/conversation-chrome.ts` |
| Conversation header actions | `ConversationHeaderActionButton` · `src/design-system/primitives/ConversationHeaderActionButton.tsx` |
| Chat / note composer shell | `OmnichannelComposerDock` · `src/design-system/primitives/OmnichannelComposerDock.tsx` |
| HID barcode wedge | `createWedgeKeyListener` · `src/lib/keyboard/wedge-scan-listener.ts` |
| Kiosk v2 session cart | `kioskSessionStore` · `src/lib/kiosk/kiosk-session-store.ts` |
| Kiosk v2 cart ledger | `KioskCartLedger` · `src/app/kiosk/v2/KioskCartLedger.tsx` |
| Main-thread yield (INP) | `yieldToInput` · `src/lib/perf/yield-to-input.ts` |
| NDJSON / Ably paint budget | `streamNdjson` · `applyStreamBudget` · `src/lib/orders-sync/client.ts` · `src/lib/perf/stream-apply.ts` |
| Grid first-paint window | `LEDGER_GRID_OVERSCAN` · `LEDGER_GRID_ROW_CONTAIN` · `src/design-system/components/grid/` |

## Hard laws (active in code)

- **Never commit `.env`**, and never bypass hooks in `.claude/settings.json`.
- **Never start, restart, or kill a dev server.** Attach to the user's on `:3050`.
- **The user manages commits.** Never `git stash`; stage only your files; commit/push only when asked.
- **Never create a git branch. Always work on `main`.** No `git branch` / `git checkout -b` / `git switch -c`, ever — not to "isolate" work, not to "keep main clean". If you need an isolated lane, it is a separate **worktree** (its own directory), never a new branch on this checkout. Every session commits and pushes to `main`. Verify with `git branch --show-current` before committing; if it is not `main`, stop and switch back.
- **Stay on `main`.** The worktree is the lane; the branch is always `main`.
- **Compose from the named SoT first; grow it when wrong.** Never fork a page-local twin. Lookup: `node scripts/sot-lookup.mjs "<job>"`. New AST-similar copies fail `jscpd` within an interaction contract; station-vs-support clones are filtered, not merged. Feature routes import the assembly (`WorkbenchSheetView`, `StationScanPaneHost`, `StationPanelRoot`) not its internals (`DashboardScrollShell`, `ScanStationUtilityRail`, `StationAmbientWash`).
- **Do not paint over primitives.** `<Button>` fills and `<Panel>` radii resolve through semantic variants (`variant`, `radius`) — never `className` hue/radius overrides. Grow `button-variants.ts` instead.
- **New feature assemblies declare `@domain-job`.** Plus `@hardware-target` (`Station` · `Workbench` · `Monitor` · `Canvas`), `@density` (`floor` · `ops` · `monitor` · `studio`), and `@justification` (why the named host cannot be reused).
- **Frame budgets** live in `src/lib/right-rail/frame.ts` — desk center ≥ `MIN_WORK_SURFACE_PX` (784); station Displays keep center ≥ `STATION_PUSH_CENTER_FLOOR_PX` (720); gutters `0`. Right edge **pushes** via `RightRailHost` (`modal={false}`); never a floating card over the work.
- **Right-rail dismiss is host-owned, ONE control, ONE closer.** `RightRailHost` paints the single `X` (top-RIGHT); `closeRightPanel` (`lib/right-rail/close.ts`) unmounts the occupant, caches `draftData`, toasts Resume, **and** runs the occupant's own `onClose` teardown. Child views never mount a second close — not a header twin, not a footer `→|` beside a submit CTA. Esc and Mod+Shift+R live in `handlePanelStoreKeydown`.
- **Ops chrome is flush-square** — `WORKBENCH_CHROME_PILL_CLASS` = `cornerClass('flush')` in `workbench-shell.tsx`.
- **Workbench spreadsheets** mount via the table definition registry + `NonlinearTableHost` over `LedgerGridSurface` — never a new `*GridView` twin.
- **Motion** only via `@/design-system/motion` + `motionRole.*`. Only `src/design-system/motion/framer.ts` may import `motion/react` or `framer-motion`.
- **Color, spacing, type, elevation, focus, and named z-index tokens** come from `@/design-system/tokens` — no page-local hex; no ad-hoc numeric stacking.
- **Platform / order identity** resolves from `source-platform.ts` + chip family (`OrderIdChip` / `PoChip` / `TrackingChip` / `PlatformMark`) — never prose platform names as the channel face.
- **Mount-gated URL opens** paint via `useOptimisticUrlParam` / `resolveOptimisticParam` (`src/hooks/useOptimisticUrlParam.ts`, `src/lib/routing/optimistic-url-param.ts`).
- **Status changes only via `transition`** (`src/lib/inventory/state-machine.ts`) — never a raw status UPDATE outside the state machine.
- **`orgId` comes from `ctx`**, never the body; org-scoped writes go through `withTenantTransaction` (`src/lib/tenancy/db.ts`).
- **Cross-entity urgency** resolves only in `promoteUrgency` (`src/lib/urgency/`).
- **Never build a second search engine, audit API, or status transition** outside the SoT modules.
- **Conversation bubbles / chat cards** compose `ConversationMessageCard` + `conversation-chrome` (`src/design-system/primitives/`) — never a page-local bubble twin, 75% chat bubble, or Lock-icon internal chip. Helpdesk tickets and entity threads share that face.
- **HID wedge scans** attach via `createWedgeKeyListener` (native capture `keydown`, yield-before-React). Never a React synthetic `onKeyDown` for scanner input; never drop focus; never run scan side-effects on the keydown stack.
- **Kiosk v2 session root is the cart** (`kioskSessionStore`) — Repair / Retail / Buyback / Pickup are commands that swap the center only and never clear lines. Mount wedge via `useWedgeScanner` + `classifyKioskScan` (not warehouse `scan-resolver`). Customer face strips void / discount / cost-basis; no Station chrome / RightRailHost on the kiosk.
- **Live NDJSON / Ably paints** apply through `applyStreamBudget` / `createFrameCoalescer` — never `setState` per stream line or per Ably message during a burst. Orthogonal exception dimensions (SCANNED + PROBLEM) stay on the row payload.
- **`npm run verify` before done** — lint · typecheck · unit · knip · jscpd · depcruise · route-auth · schema drift. Never raise a ratchet baseline to pass. Inner loop: `npm run verify:fast`. Tenant click-through: `npm run verify:dogfood` (lint · tsc · route-auth enforce · schema). Pre-push to non-`main` runs dogfood; push to `main` and “done” still require full verify.
- **E2E asserts against the QA org**, not the dogfood tenant.


## What actually enforces these rules

**Most of this file is convention, not a machine check. Know which is which.**

| Layer | What it is | Runs in `npm run verify`? |
|---|---|---|
| **13 gates** | lint · typecheck · unit · knip · route-permission drift · route-auth enforce · integration manifest · tenancy (advisory) · schema drift · schema model parity · jscpd clones · depcruise · doc catalog | **Yes** — this is the whole automated surface |
| **~757 unit tests** | any `*.test.ts` under `src/`, auto-discovered by `scripts/run-unit-tests.mjs` | **Yes**, inside the unit gate |
| **~182 E2E specs** | Playwright under `tests/e2e`; `qa-desktop` runs against the QA org | **No** — run them deliberately |
| **Structural guards** | `*.guard.test.ts` | **One** on disk (`carton-chrome-type-unity`, 7 tests) — auto-discovered, so it runs. **17 exist in HEAD**; 16 are deleted only in an *uncommitted* working-tree change |

**124 `*.guard.test.ts` citations were pruned from these rules on 2026-08-19.**
123 of them named files absent from HEAD as well as from the tree — prose asserting
enforcement deleted commits ago. The 124th (`domain-job`) is alive in HEAD and was
restored. **Check HEAD, not just the working tree, before removing a citation:** 16
guard files are currently deleted in an uncommitted change, and reverting it brings
them back. **Never add a citation for a file you have not confirmed exists.**

A rule with no gate behind it is still the house law — it is just enforced by
review, not by CI. Say which one you mean when you write a new rule.

The machinery is intact: `run-unit-tests.mjs` picks up any `*.guard.test.ts`
automatically, so adding a guard file back is enough to enforce it.

## Guard authoring

When asked to "add a guard", never write `readFileSync` + regex on source.
Match the invariant to its layer: (1) import/module boundary → `.dependency-cruiser.cjs`;
(2) syntax/prop ban → ESLint AST in `eslint.config.mjs`; (3) layout/geometry →
constrain TS props / a cell that owns height; (4) rendered behavior → a mounted
DOM test, not file text. Load `.claude/skills/add-guard/SKILL.md` before creating
any test file. There are no structural guards in the tree today (see above), so a
new one is a genuine addition — not a change to an existing family.

## Workflow

Lanes, ports, secrets, and commit discipline: live law is this file +
`.claude/settings.json` hooks.
