# HANDOFF — Warehouse OS phases 4–9

Paste everything below the line into a fresh Claude Code session pointed at this worktree.

Another session is running phases 1–3 **right now** in this same worktree. The file lanes
below are chosen to be disjoint from it. Do not widen them.

---

You are building **phases 4–9 of the Warehouse OS refactor** in
`/home/michaelgarisek/Projects/cycleforge-app/.claude/worktrees/warehouse-os-refactor-8f2dc3`
(git worktree, branch `claude/warehouse-os-refactor-8f2dc3`).

Read `docs/warehouse-os/` first — README, 01-repo-map, 02-target-architecture,
03-decisions, 04-roadmap. That is the plan of record and it is accurate; it was built from
a measured 11-agent survey of the repo, not from assumptions.

## Run this as ONE workflow, six components in parallel, then a stitch phase

The operator's instruction: **build phases 4–9 as separate components, in parallel, and
stitch them together at the very end.** Use the Workflow tool. Do not run a verify gate —
this is a WIP worktree and the operator has explicitly declined gate ceremony. The stitch
phase is where things get wired together, and it is the only phase that may cross lanes.

## Standing context

Cycle Forge is being rebuilt from a page-oriented SaaS into an always-mounted HUD shell.
Work is **sessions**, data is **tabs**, utilities are **tools**, arranged on a tiling
canvas. 6,000 source files, 142 pages, 969 API routes, 312 DB tables.

The old constitution (`AGENTS.md` hard laws, `.claude/rules/**`, `docs/rules/**`, the SoT
manifest, the design-law lint rules, every `*.guard.test.ts`) was **deleted on 2026-08-21**
because it described the architecture being replaced. **Do not reconstruct it. Do not add
guards.** Enforcement in this refactor is the compiler — required props with no default,
so every unmigrated call site is a type error.

### Operator rulings — law, do not relitigate

- **Sessions are `kind: 'scan' | 'task'`.** A scan session carries a `scanType`. **Exactly
  one scan session is armed app-wide at a time.** That is how scan ownership resolves —
  there is no per-tile scan focus model and tiles never compete for a scan.
- **Sessions and sign-ins are persistent.** No absolute timeout ends a mounted shell.
- **No per-tile permission architecture.** Dogfood tenant. The 969 API routes stay gated
  by `withAuth`; that is the real boundary. Tab / session / tool descriptors carry **no**
  permission field.
- **Recents stay completely separate from the window manager.** "Where have I been" is a
  history; "what is open" is a set of live objects with lifecycles. Never merge them.
- **Simplification is the deliverable.** Deleting code that does not fit is the goal, not
  a side effect.

## Contracts — code against these, they may not exist on disk yet

Phases 1–3 are landing in parallel. Do **not** wait for them and do **not** edit their
files. Code against these interfaces; the stitch phase reconciles them with what actually
shipped.

```ts
// src/lib/workspace/  — owned by the phase-1-3 session
type TabKind = 'session' | 'table' | 'tool';
interface TabDescriptor { id: string; kind: TabKind; ref: string; params: Record<string, string>; }
interface WorkspaceStore {
  subscribe(fn: () => void): () => void;
  getSnapshot(): { openTabs: TabDescriptor[]; pinnedTabs: string[]; focusedTabId: string | null };
  openTab(d: Omit<TabDescriptor, 'id'>): string;
  closeTab(id: string): void;
  focusTab(id: string): void;
}

// src/lib/sessions/  — owned by the phase-1-3 session
type Session =
  | { id: string; kind: 'scan'; scanType: string; armed: boolean; entityRef?: string }
  | { id: string; kind: 'task'; taskType: string; entityRef?: string };

// src/lib/session-context/  — owned by the phase-1-3 session
interface SessionContextStore {
  subscribe(fn: () => void): () => void;
  getSnapshot(): { active: Session | null };
}
```

House state pattern, used 19 times in this repo: a **module singleton + `useSyncExternalStore`**.
No state library is installed (zustand is only a transitive dep of `@xyflow/react`). Read
`src/lib/right-rail/store.ts` for the exact shape and copy it. Do not add a state library.

## The six components

Each owns a disjoint file lane. New directories are yours to create. **Never edit a file
outside your lane** — report needed cross-lane edits instead, and let the stitch phase apply them.

### 1 · Window manager — the left rail (roadmap Phase 4)
**Lane:** `src/components/workspace/rail/**` (new) · `src/components/sidebar/ContextPanelLayout.tsx`

Chrome-style tab strip for open sessions and tables, shrinking as they crowd. Pinned
necessities at the bottom. A **"+"** opening a searchable master index grouped by category.

- `ContextPanelLayout` is the **only** mount point for every route rail and already owns
  width, collapse, the expand strip, the hotkey and frame-cost publication. Make it the
  **tab host** — then no panel file has to change to become tab-hosted.
- The "+" index is a **new mount of existing code**, not new code: `buildCommandBarNavGroups`
  and `searchNav` already power both the in-spine find bar and ⌘K. Extend the destination
  type with a launch `kind` so tools and tables can join pages.
- **Reveal is click-toggle plus hotkey — NOT hover.** Four verifications killed hover:
  warehouse tablets get the *desktop* shell (`proxy.ts` deliberately excludes iPad/Android
  from the mobile rewrite, and iPadOS reports a macOS UA), so `(hover: none)` means a
  hover-only rail is unreachable; the hover engine opens at 0ms and evicts whatever is
  open; during a scan there is no pointer at all; and the previous slide-over rail was
  deleted for exactly this. Optional mouse-primary opt-in is fine.
- **Recents are not tabs.** Same rail real estate, nothing else shared.

### 2 · Tool palette — the right rail (roadmap Phase 5)
**Lane:** `src/lib/tools/**` (new) · `src/components/workspace/tools/**` (new) ·
`src/lib/right-rail/**` · `src/components/right-rail/**`

**This is the unlock for the whole tool concept.** Today a registration stores a *live
React element owned by a mounted page* — so a tool structurally cannot open from a page
that does not already mount it. 43 registration sites, 2 priority tiers, 42 of 43 at the
same rank simply stealing the slot.

```ts
// today: a tool exists only while its owning page is mounted
useRegisterRightPanel({ id, priority, node: <PhotoInspectorPanel/> })

// target: a tool is DATA; the host mounts it lazily from anywhere
registerTool({ toolKey, title, icon, group, load: () => import('...'), dragPayload?, keybinding? })
```

- Replace `recomputeTop()`'s single `topSnapshot` with an **ordered list**; keep
  `getRightRailTop()` as a shim. Change `closeRightPanel()` from implicit-top to
  `closeRightPanel(instanceId)`.
- Add a **required `toolKey` with no default** to `DetailStackRailRegistrar` — the compiler
  then names all 39 mount sites that have not answered "which tool am I."
- `RightRailHost` reads occupancy through exactly **four** imported functions. Build the
  N-tile host against that same read API and flag which host mounts — **zero of the 43
  registrants need to change.**
- Extract a `ToolHost` primitive from `ClipboardHistoryHost` / `ThrowTaskHost` — they are
  already the exact target pattern (mounted once, own a chord, opened by a window event).
- Build a **keybinding registry**. There is none: 51 files hand-roll `window` keydown
  listeners and exactly one key in the app is user-remappable.
- ⚠️ The printer tool's pairing UI must be reachable through a **real click** — WebUSB's
  `requestDevice()` throws without transient user activation, so a hotkey- or AI-opened
  tool cannot auto-pair.

### 3 · Tiling canvas (roadmap Phase 6)
**Lane:** `src/lib/canvas/**` (new) · `src/components/workspace/canvas/**` (new) ·
`src/lib/right-rail/frame.ts` · `src/hooks/useHorizontalEdgeResize.ts`

- `resolveRightRailFrame` is a **pure** function with 22 existing unit tests. Generalize it
  to an N-pane constraint solver **in isolation, tested with zero React**, then swap the
  store's call.
- `useHorizontalEdgeResize` already separates pure drag math (`widthFromEdgeDrag`,
  `edgeResizeWidthCap`) from the React hook. Add the vertical twin beside the pure
  functions; the 8 existing consumers keep importing the horizontal hook.
- One inset-radius **token** for the HUD frame, in `header-shell.ts`.
- ⚠️ **Geometry does not fit and the operator must choose.** Floors today:
  `MIN_WORK_SURFACE_PX = 784`, spine 240, right rail 420. Two tiles at 784 is **1,568px
  before any rail**; with the spine, 1,808px. **Playwright runs at 1440×900 and the
  Electron window opens at 1600×1000.** Recommendation on file: keep 784 as the *session*
  floor, add a smaller table-tile floor (~520 — a table degrades gracefully, a scan bench
  does not), gate session-beside-session to ≥1920. Confirm with the operator before
  hardcoding.
- ⚠️ Electron overlays a **native `WebContentsView`** at absolute pixel bounds. It cannot
  be clipped by `overflow:hidden` or z-indexed under a tile; every layout change must
  re-issue `setVendorViewBounds`, or the canvas reserves a region for it.

### 4 · One composer (roadmap Phase 7)
**Lane:** `src/design-system/primitives/composer/**` (new) ·
`src/design-system/primitives/OmnichannelComposerDock.tsx` · `src/lib/threads/**` ·
`src/components/threads/**`

51 files render free-text entry. 24 are dedicated composers (4,321 LOC). There are **four
competing design-system entry faces** plus a page-local fifth. `OmnichannelComposerDock`'s
own docblock already claims to be "ONE shell, every 'type a message here' job" — **it has
5 mounts against 51 files.** The SoT exists and is being routed around.

- **Migrate store-first, not component-first.** Change what a composer *writes* before
  changing how it looks — `postThreadMessage` is the single write waist and gives
  idempotency, `ops_events` emission and tenancy for free.
- `target: { entityType, entityId, buffer }` **required with no default.** Every fork then
  collapses to a different `target`, and the compiler names every unanswered site.
- Absorb the competitors as **modes**, deleting each as its mode lands: `chrome='flush'`
  absorbs `DenseComposeFields`; `mode='cell'` absorbs `LedgerCellEditor`'s
  commit-on-unmount contract; `expandable` absorbs `ExpandableComposerField`.
- One `VisibilityToggle` — there are 5 forks, and the failure mode is emailing a customer
  a note meant to be private.
- ⚠️ **Resolve the order record first.** It already ships two live composers on one entity
  (`order_notes` and `thread_messages`), with the boundary written only in two docblocks.
  Introduce a unified composer without settling that and it becomes the third.
- ⚠️ `entity_threads.entity_id` is `BIGINT`. Any entity with a UUID PK cannot join it —
  that is exactly why `order_notes` exists as a separate table.
- ⚠️ Support ticket bodies live in Zendesk and are live-fetched; there is no local table.
  "One composer" still fans out to an external provider for tickets.
- The 62 note columns across 52 tables do **not** collapse with the UI, and that is fine —
  the one composer carries a per-mount write target.

### 5 · Reversibility — the Process tool (roadmap Phase 8)
**Lane:** `src/lib/reversibility/**` (new) · `src/lib/migrations/2026-08-23*.sql` (new —
**use the 23rd, the 22nd is taken by the session-model lane**) · `src/lib/assistant/mutations*`

**The spine exists and is AI-only.** `applyAgentMutation` has 19 trust-classed
`MUTATION_KINDS`, captured inverse descriptors and a working `revert_mutation` — the only
invertible write path in the repo.

- Route **operator** (non-AI) session actions through that same chokepoint so the Process
  tool reads one ledger instead of a parallel undo stack.
- Define inverse descriptors for the session-scoped action kinds.
- Build the Process tool: list this session's actions, undo/delete.
- ⚠️ This is the honest hard part. `transition()` and `transitionReceivingLine()` are
  append-only with no inverse; `inventory_events` has no `reverses_event_id`; `recordAudit`
  is fire-and-forget that never throws, so it is explicitly **not** a replay log.
- Manager reporting: add nullable `session_id` + `session_type` to **`ops_events`** (the
  only event table already shaped polymorphically), then redirect writers one domain at a
  time. **`journey.ts`'s union branch count is the progress bar** — it starts at 13
  sources; reporting is done when it reads `ops_events` alone.
- ⚠️ `audit_logs` has **no `organization_id`**. Do not build reporting on it without
  fixing that first.

### 6 · AI orchestration (roadmap Phase 9)
**Lane:** `src/lib/assistant/workspace-tools.ts` (new) · `src/lib/assistant/agent-loop.ts` ·
`src/hooks/useAssistantChat.ts`

The agent loop already runs a real tool-use loop — 28 permission-gated server read tools,
2 write tools, and **5 client UI tools** (`navigate`, `highlight`, `focus_node`, `set_lens`,
`set_zoom`) executed in the browser. **The AI can already drive the app's view state.**

- Add OS verbs to the existing `UI_TOOLS` array: `open_tool`, `pin_tool`, `close_tool`,
  `start_session`, `focus_session`, `set_layout`, `split_pane`. Nothing else in the loop
  changes, and they appear over MCP for free.
- Replace `runUiTool`'s ~30-line switch body with a **dispatch into the workspace store**,
  so every AI-driven workspace action goes through one function that can be logged,
  permission-checked and undone.
- ⚠️ The loop's system prompt currently tells the model "all state is in the URL". That
  stops being true. Update it.

## Stitch phase — the last agent, the only one allowed to cross lanes

1. `git status` and read what phases 1–3 actually shipped in `src/lib/workspace/`,
   `src/lib/sessions/`, `src/lib/session-context/`. **Reconcile the contracts above with
   reality** — where they diverged, the real code wins; adapt the components.
2. Apply every `needsOutsideLane` edit the six components reported.
3. Wire it up: rail tabs read the workspace store · tools register into the palette ·
   the canvas hosts tiles from `openTabs` · the composer mounts inside tiles · AI verbs
   dispatch into the store.
4. Run `npx tsc --noEmit -p tsconfig.json` **once** and fix the seam breaks. This is the
   only full typecheck in the run — six agents at 6GB each would thrash the machine, and
   each would see the others' half-finished work as errors and "fix" it.
5. Report what is wired, what is stubbed, and what the operator should click at
   `http://localhost:3050`.

## Hazards that will cost you a day if you miss them

- **Never delete `/01/**`, `/414/**`, `/l/**`, `/p/**`, `/s/**`, `/q/**`.** They look like
  dead numeric redirect stubs. They are **live GS1 Digital Link and short-URL resolvers
  printed onto stickers already on boxes in the warehouse.** Deleting one bricks physical
  labels.
- **Never start, restart or kill a dev server.** The operator owns `:3050`. Attach only.
  A broken dev server is a report, not a repair.
- **Never `git stash`**, never `git add -A` (concurrent sessions share this tree), never
  commit unless asked.
- **Migrations land before readers** (expand → code → contract), one `YYYY-MM-DD<letter>`
  slot per file. Two files in one slot are ordered by *description*, alphabetically —
  which has already inverted an expand/contract pair once in this repo's history.
  **Write migrations; do not apply them.** The operator applies.
- **Nothing in CI will catch a mistake.** `npm run verify` is lint + typecheck + unit.
  Zero structural guards. `next.config.ts` sets `typescript: { ignoreBuildErrors: true }`,
  so a production build does not typecheck either.
- **59 surviving tests use `readFileSync` + regex against source paths** and cluster
  exactly where this refactor lands. They will fail mechanically the moment files move.
  **Fix them in the same change — do not delete them.** They are the last thing standing
  between this refactor and a silently re-forked closer or a second scan bar.
- `node_modules` is absent in this worktree; `npx` resolves up to the parent repo, which
  works fine.
