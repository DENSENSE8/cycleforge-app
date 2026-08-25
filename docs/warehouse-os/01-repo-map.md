# 01 — Repo map

Measured 2026-08-21 by an 11-agent survey. Every number came from a command, not
an estimate. This is the honest starting position, including the parts that
contradict the plan.

## Scale

| | |
|---|---|
| Source files (`src/**.ts,.tsx`) | **6,000** — 873,535 LOC |
| Page routes (`page.tsx`) | **142** — 14,994 LOC (90 server / 52 client) |
| API routes (`route.ts`) | **969** |
| DB tables (migrations ∪ Drizzle) | **312** — from 475 migrations, 37,281 SQL LOC |
| Unit tests | 812 files |
| E2E specs | 183 |
| React app shells | **5** (+ Electron wrapper) |

## The three things already built that nobody uses

This is the single most important finding. The plan's hardest-sounding pieces are
partly done and sitting at **zero adoption** — which means they can be widened with
no migration cost.

| Built | Adoption | Path |
|---|---|---|
| `GlobalScanDock` — universal header scan bar, survives navigation, policy-driven | **0 publishers**; renders `null` on every page. 11–14 surfaces still mount their own `StationScanBar` | `src/lib/scan-dock/`, `src/components/layout/GlobalScanDock` |
| `HeaderContext.panelContent` — the header's "live context" middle zone | **0 producers** app-wide. Renders `null` on every route | `src/contexts/HeaderContext.tsx` (30 LOC) |
| Station composition engine — `station_definitions` + block registry + `SurfaceGate` | **Dormant.** 3 blocks registered; per-org flag `surface_composed_render` defaults OFF; every surface renders `'legacy'` | `src/lib/stations/` |

A refactor that declares a *new* universal scan bar or a *new* composition engine
without first adopting these will have built the fourth of each.

## What exists per subsystem

### Shell & header — reusable, thin, well-factored
`src/app/layout.tsx` (180 LOC) is an async server component wrapping 11 providers
around `ResponsiveLayout` (478 LOC). App Router **already preserves the shell across
soft navigation** — `CommandBar`, `ClipboardHistoryHost`, `ThrowTaskHost`,
`RightRailHost` and the wedge scanner already survive every route change. The only
thing that unmounts is one `children` slot at `ResponsiveLayout.tsx:425`.

`GlobalHeader` is 107 LOC and already declares the target's four zones as separate
`data-header-zone` children: **nav | scan | context | actions**. Geometry is one
token module (`header-shell.ts`, `TOP_CHROME_ROW_PX = 40`).

- ✅ **The always-mounted shell is not a thing to build. It exists.**
- ❌ The header learns identity **only from the URL** — `usePathname` + a 1,611-LOC
  hand-written prefix matcher (`src/lib/sidebar-navigation.ts`). Route *is* identity.
- ❌ 5 shells, not 1: desktop, `/m/(shell)`, `/m/(immersive)`, kiosk, Electron.
- ❌ 0 parallel routes, 0 `template.tsx`, 0 `default.tsx`, 0 intercepting routes.

### Left rail — two columns, three dispatchers, no tab model
Two separate left surfaces: a 240px nav **spine** and a 360px route **context rail**.
32 `*SidebarPanel.tsx` (6,754 LOC) selected by a **19-branch `if` cascade** over a
34-prefix route matcher, plus a 9-case admin switch, plus panel-internal dispatch.

- ✅ The cascade is a one-to-one `key → dynamic()` map — mechanically convertible to
  a `PANEL_REGISTRY`. Highest-leverage single cut in the area.
- ✅ `RouteParamsSpec` (`src/lib/routing/registry.ts`) already declares param
  ownership **as data** for 26 route entries — this is what makes per-tab state possible.
- ❌ **0 files** match `openTabs|TabStrip|WindowManager|tabStore`. Net-new architecture.
- ⚠️ The 32 panels are *not* near-identical: measured 63 duplicate 6-line windows,
  58 of them one `SearchBar + setParam` block in the 9 admin panels. Budget this as
  ~260 lines of real duplication, not "collapse 32 clones."
- ⚠️ `favorites/**` is **not** nav pinning — it is SKU quick-pick templates. Real page
  pinning is `src/lib/quick-access/**`, and it renders in the *header*, not the rail.

### Right rail — a singleton slot, not a palette
`src/lib/right-rail/store.ts` keeps a `Map` of claims but `recomputeTop()` collapses
it to **exactly one** occupant. 43 registration sites, 2 priority tiers
(`assistant: 10`, `detail: 100`) — 42 of 43 register at the same rank and simply steal
the slot.

- ✅ `useRegisterRightPanel` / `DetailStackRailRegistrar` is a genuine chokepoint:
  43 of 43 go through one of two functions.
- ✅ `closeRightPanel()` is already the single closer with veto → draft-cache →
  teardown. Reusable wholesale.
- ❌ **An occupant is a live `ReactNode` supplied by a mounted component** — not a
  descriptor, not a factory. A tool structurally *cannot* open from a page that
  doesn't already mount it. This is the core blocker for "tools available anywhere."
- ❌ No title, icon, category, or serializable state on a registration. Pinning,
  keybinding and drag-out have nothing to hang on.
- ❌ Three owners of the right edge: `RightRailHost`, `StationDisplaysPushColumn`
  (24 files / 4,388 LOC, labelled a "forked mechanism" in code), `RightPaneOverlay`
  (29 mounts).

### Sessions — the biggest gap
There is **no warehouse work-session table.** Five tables named "session", no two
alike:

| Table | Reality |
|---|---|
| `counter_sessions` + lines | Kiosk POS. **The only correct one** — org-scoped, `version` optimistic counter, claim lease, soft-void lines, `client_event_id`. Use as the template |
| `station_scan_sessions` | 4 kinds, 12h expiry, 3 callers, **no `organization_id`** |
| `picking_sessions` | Picking only, **no `organization_id`** |
| `staff_sessions` | Auth, unrelated |
| `ai_chat_sessions` | LLM chat, unrelated |

Warehouse work is reconstructed *after the fact* — `src/lib/operations/journey.ts`
spends 699 LOC hand-unioning **13 tables** to answer "who did what, when."

- ✅ `SURFACE_REGISTRY` (`src/lib/stations/surface-keys.ts`) is a **closed, compile-
  enforced 10-key registry** already carrying archetype, scan policy, permission and
  workflow-node binding. This is a session-type registry in all but name.
- ✅ `createWedgeKeyListener` + `useGlobalWedgeScanner` is a strong asset: mounted
  once at root, native capture keydown, yield-before-React, with a 5-step priority
  cascade already routing commands → page claimers → preview → sink → navigate.
- ❌ 7 competing "what surface is this" vocabularies; 3 mutually contradictory CHECK
  sets for station names.
- ❌ 6 of 10 surfaces share one `pageKey` (`receiving`) — Unbox/Inbound/Arrival/
  Pickup/Repair/History are branches inside `ReceivingSidebarPanel` (675 LOC) wired
  by `window.dispatchEvent` CustomEvents. They cannot be ported one at a time.

### Tables — engine is ready, inventory is not
`LedgerGridSurface` → `LedgerGrid` → `VirtualGroupedSections`, always virtualized.
Across 107 non-test files in the table/grid tree, exactly **3 import `next/navigation`**
and none are in the engine — the definitions carry no route and no fetch.

- ✅ **The engine is already route-independent.** `NonlinearTableHost`'s
  binding/instance boundary *is* the tab boundary, already drawn and documented.
- ✅ `TableRecordPlane` is a discriminated union declaring, as data, what opening a
  row does. Adding a `{kind:'session'}` arm makes the compiler name every binding.
- ❌ **Only 6 tables are registered**, not 37. Every other collection grid was
  deleted 2026-08-20 — **28 files render `TableRebuildPlaceholder`** (1,102 LOC of stubs).
- ❌ Per-staff grid prefs key on a single global `TableId`. **Two tabs of "Orders"
  would share column widths, visibility, order and density.**
- ❌ Saved views are literally URL query strings (`filters.query = '<urlencoded>'`),
  applied by `router.replace`. Detaching tables from routes invalidates all of them.
- ❌ The table's *mode* is computed from `pathname`. One 1,006-LOC component serves
  Unbox, Incoming, History and Testing by reading the URL.
- ✅ **RESOLVED 2026-08-21.** The tiling prototype was forked twice —
  `unbox-compare-layout.ts` and `orders-compare-layout.ts` implemented the same
  `clayout`/`c0..c3` model in two vocabularies. Both modules and both hosts are
  DELETED (-1,556 LOC), so the canvas work starts from one tiling system, not
  three. Nothing left in the tree reads `clayout` or `c0..c3`.

### Composers — the largest single consolidation win
| | |
|---|---|
| Files rendering free text entry | **51** |
| Dedicated composer components | **24** (4,321 LOC) |
| Competing design-system entry faces | **4** + 1 page-local |
| Note-like columns in the DB | **62 across 52 tables** |
| Ways to pick internal-vs-public | **5** |

- ✅ **A real polymorphic store already exists**: `entity_threads` + `thread_messages`
  — tenant-from-birth, 7-value anchor CHECK, `ops_events` emission, idempotency,
  soft delete, 1,638 LOC domain layer, 10 API routes.
- ✅ `postThreadMessage` is the single write waist. **Migrate composers store-first**
  (change what they *write*), not component-first.
- ❌ It is **40% adopted** — 3 of 7 legal anchors have a mounted panel. RECEIVING,
  RECEIVING_LINE, FBA_SHIPMENT and REPAIR have DB rows, RLS and routes but no UI.
- ❌ `OmnichannelComposerDock`'s own docblock claims to be "ONE shell, every 'type a
  message here' job" — it has **5 mounts against 51 text-entry files.** The SoT
  already exists and is already being routed around.
- ❌ The order record ships the exact anti-pattern the refactor must end: two live
  composers (`order_notes` and `thread_messages`) on one entity, with the boundary
  written only in two docblocks.
- ⚠️ `entity_threads.entity_id` is `BIGINT`. Any entity with a UUID PK cannot join it.
- ⚠️ Support ticket bodies live in Zendesk, live-fetched. "One composer" still fans
  out to an external provider for tickets.

### AI — much stronger than expected
`src/lib/assistant/agent-loop.ts` runs a real tool-use loop: **28 permission-gated
server read tools + 2 write tools**, SSE streaming, and **5 client UI tools**
(`navigate`, `highlight`, `focus_node`, `set_lens`, `set_zoom`) executed in the
browser. **The AI can already drive the app's view state.**

Writes go through one chokepoint (`applyAgentMutation`) with 19 `MUTATION_KINDS`,
three trust classes, **captured inverse descriptors and a working `revert_mutation`**.
The same registry is re-exposed over MCP, proving the second-transport seam holds.

- ✅ `UI_TOOLS` + `runUiTool` (a ~30-line switch) is the *only* place a model command
  touches the DOM. Adding `open_tool` / `start_session` / `set_layout` is additive.
- ✅ **Reversibility already exists — for the AI.** `agent_mutations` is the only
  invertible write path in the repo.
- ❌ Operator actions have **no inverse**: `transition()` and `inventory_events` are
  append-only; `recordAudit` is fire-and-forget that never throws.
- ❌ Three parallel AI stacks with three provider resolutions and three tool formats.

### Interaction primitives — mostly absent
| Need | Installed |
|---|---|
| Tiling / docking / resizable panels | **none** — one hand-rolled 530-LOC horizontal-only hook |
| Hotkey / keybinding library | **none** — 51 files hand-roll `window.addEventListener('keydown')`; **1** key in the whole app is user-remappable |
| Global state library | **none** — 19 hand-written `useSyncExternalStore` module stores + 424 react-query sites |
| Drag & drop | ✅ `@dnd-kit` (18 files) — but **0 drag sources in the rails** |
| Command palette | ✅ `cmdk` |
| Virtualization | ✅ `@tanstack/react-virtual` |

### Personalization — one good substrate, several strays
✅ `staff_preferences` — per (org, staff), JSONB `prefs`, Zod-gated, RLS from birth,
already carrying pinned pages (max 30, ⌘1–9), per-table column layouts, KPI collapse,
theme, accent, and the one configurable hotkey. **Adding `pinnedTools`, `bentoLayouts`,
`keybindings`, `openTabs` needs no migration.**

❌ Caveats: the bag is a **shallow merge** (concurrent writes to sibling keys are
last-write-wins); the localStorage cache key `cf.quickAccess` **contains no staffId or
orgId**; rail widths and recents are device-local only; and mobile has a **second,
independent** personalization system (`mobile_display_config` over `roles.mobile_defaults`).

## Route inventory — 142 pages, ~24 real destinations

| Bucket | Pages | LOC | Fate |
|---|---|---|---|
| TABLE | 37 | 4,630 | → ~8 table tabs |
| MOBILE | 30 | 2,940 | separate shell, out of scope |
| DEAD | 21 | 568 | **only 14 truly retired — see warning** |
| SESSION | 18 | 2,128 | → ~12 session types |
| ADMIN/SETTINGS | 15 | 1,641 | stay pinned panes |
| TOOL | 12 | 632 | → right-rail tools |
| MARKETING/AUTH | 7 | 2,019 | stay routes |
| KIOSK | 2 | 436 | separate shell |

- **123 of 142 pages have no nav entry.** The sidebar resolves 19 pathnames.
- The real destination count is carried by **42 distinct `?mode=` tokens**, not files.
- 21 pages are redirect-only shells; 8 `/inventory/*` pages mount the identical
  component; 7 receiving pages already compose one host through `SurfaceGate`.

> ⚠️ **Do not delete the "dead" numeric routes.** `/01/[gtin]`, `/01/[gtin]/21/[serial]`,
> `/414/[gln]/254/[code]`, `/l/[ref]`, `/p/[tracking]`, `/s/[sku]` are **live GS1
> Digital Link resolvers printed onto physical stickers.** Deleting them bricks
> labels already on boxes in the warehouse. They must stay real, chromeless,
> publicly-reachable routes outside the shell forever.

## Cross-cutting facts the plan must respect

- **Sign-in is clock-in.** `shift-clock.ts` opens a `time_punches` row on
  authentication. A session boundary in this app is a **payroll event**.
- **Auth is pathname-shaped in six places**, including 24 pages calling a *server*
  `requirePermission()` that `redirect()`s. A tile cannot redirect.
- **Label printing is WebUSB/Web Serial**, origin-bound, requires a real user gesture,
  and profiles are per-workstation. A hotkey- or AI-opened printer tool that
  auto-calls `requestDevice()` throws.
- **Electron overlays a native `WebContentsView`** at absolute pixel bounds. It cannot
  be clipped by `overflow:hidden` or z-indexed under a tile.
- **A committed service worker caches every non-auth API GET for 24h**, keyed by URL
  only — no staff, no org. Nothing purges it.
- **Ably's client is created once and never re-keyed**; staff switching does not
  reload. Today only a hard navigation resets it.
- **42 Vercel crons + an out-of-repo PM2 fleet** (inference server, agent gateway,
  pipeline orchestrator, a pg LISTEN/NOTIFY relay) speak the Ably channel contract
  and are invisible to `tsc`.
- **Nothing enforces anything.** `npm run verify` is lint + typecheck + unit. Zero
  `*.guard.test.ts`. A refactor this size will be green while forking a twin,
  orphaning dead code, or naming a column the DB does not have.
