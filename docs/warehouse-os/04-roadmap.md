# 04 — Roadmap

Nine phases. Each is shippable alone and reversible. The ordering is not arbitrary:
every phase either **adopts something already built** or **lands the model the next
phase needs**.

Legend — 🟢 grows existing code · 🟡 net-new but scoped · 🔴 net-new architecture

---

## Phase 0 · Decide (no code)

**Must-deliver:** written answers to all ten questions in [`03-decisions.md`](03-decisions.md).

D1 (routing), D3 (permissions), D4 (geometry), D6 (residency) and D7 (scan ownership)
each change the shape of code written in Phases 3–6. The rest can be answered by
Phase 2 without rework.

---

## Phase 1 · Adopt what is already built 🟢

Zero new tables, zero new models, no visual regression. This exists to prove the shell
carries live state before anything is detached.

**Must-deliver:**
1. Fix `useScanDock`'s effect dependency array — `onSubmit` (a function) and
   `rightContent` (a ReactNode) re-register the policy on **every render** of any
   natural call site. Split the stable half (`id`, `placeholder`, `staffId`) from the
   volatile half held in a ref. **Fix before the first adopter, not after.**
2. Adopt `GlobalScanDock` on `/unbox`. Delete that surface's `<ThemedStationScanBar>`.
   Adoption is additive and invisible until a surface opts in — the dock renders
   `null` until a policy publishes.
3. Become the **first producer** of `HeaderContext` — publish Unbox's live carton
   context into the header's middle zone. It renders `null` on every route today, so a
   first producer cannot regress anything.
4. Migrate the remaining 10–13 scan-bar mounts, one surface per commit.

**Done when:** the scan input and the work context survive a navigation, and
`rg '<ThemedStationScanBar|<StationScanBar' src` returns 0.

---

## Phase 2 · The session model 🟡

**Must-deliver:**
1. Migration: `work_sessions` modelled on `counter_sessions` — `organization_id UUID
   NOT NULL` with **no DDL default**, `enforce_tenant_isolation()` in the same
   migration, `version` optimistic counter, claim lease, `client_event_id`,
   `session_type` as a named CHECK.
2. Migration: nullable `session_id` + `session_type` on **`ops_events`** (expand
   first — safe to land ahead of readers).
3. `SURFACE_REGISTRY` gains a **required `sessionType`** field. The closed `Record`
   makes the compiler enumerate every unanswered surface. Fix the `outbound` entry
   (points at a redirect stub) and add the ~5 real sessions missing from it.
4. Widen `EntityStationPane`'s `stance` into the session discriminator.
5. Route `/unbox` through the registry so the page is a thin mount of a registry
   entry. Session pages are already route-free client trees (11–52 LOC) — this is
   re-parenting, not a rewrite.

**Done when:** starting an Unbox session writes a `work_sessions` row, and its scans
land on `ops_events` carrying `session_id`.

> ⚠️ Do **not** grow this from `station_scan_sessions` or `picking_sessions` — neither
> has an `organization_id`, and this becomes the root object of the entire app.

---

## Phase 3 · The workspace store and tab model 🔴

The load-bearing phase. **No visual change** — the store lands behind the existing UI.

**Must-deliver:**
1. `workspace-store.ts` — module singleton + `useSyncExternalStore` (the house
   pattern, 19 precedents). Holds `openTabs`, `pinnedTabs`, `focusedTabId` and each
   tab's own `params`.

   **Two items in this bullet were ruled out after it was written, and the shipped
   store (`src/lib/workspace/store.ts`, 2026-08-21) has neither.** There is no
   `scanFocusTileId` — D7 settled scan ownership as ONE armed session app-wide, read
   from `getArmedScanSession()`, so per-tile scan focus has nothing to point at. And a
   tab descriptor carries no `permission`: the 969 API routes stay gated by `withAuth`,
   which is the real boundary, so a client-side per-tile permission field would be
   duplicate bookkeeping that can only ever disagree with it.
2. Replace `SidebarContextPanel`'s 19-branch `if` cascade with `PANEL_REGISTRY` built
   from the same 19 `dynamic()` calls. Imports do not change — only the selector.
3. `RouteParamsSpec` → `tab.params`; `parseRouteParams` becomes the tab reader,
   `buildRouteUrl` becomes `setTabParams`. **The active tab projects to the address
   bar** (D2). Register param specs for the unregistered route families first.
4. Per-tab grid prefs: widen the prefs key from `TableId` to `${TableId}:${instanceId}`
   with the bare `TableId` as an inherited default. `staff_preferences.tableColumns` is
   already `z.record(z.string(), …)` — **no schema change needed**.
5. `staff_preferences.prefs.workspace` — `openTabs`, `pinnedTabs`, `pinnedTools`,
   `iconColors`, `bentoLayouts`, `keybindings`. **No migration.** Mount a
   `<WorkspaceSync/>` beside the existing `QuickAccessSync`. Fix the localStorage key
   to carry staff + org identity.
6. Tab **suspension** from day one (D6): unmount the subtree, preserve serialized
   state, restore on focus.

**Done when:** two tabs of "Orders" can hold different column widths, sorts and
filters, and the workspace restores after a reload.

---

## Phase 4 · Left rail as window manager 🟢🔴

> **Ruled 2026-08-22: recents stay separate from the window manager.** They are two
> different jobs — "where have I been" is a history, "what is open" is a set of live
> objects with lifecycles. Do not merge the recents store into the tab store; do not
> render recents as tabs. They may share the rail's real estate and nothing else.

**Must-deliver:** `ContextPanelLayout` becomes the **tab host** (it is already the only
mount point and already owns width, collapse, the expand strip and frame-cost
publication) · Chrome-style shrinking tab strip · pinned tabs at the bottom · recents
inline · the **"+"** index mounting `buildCommandBarNavGroups` + `searchNav` behind a
popover, extended with a launch `kind` for sessions/tables/tools · click-toggle +
hotkey reveal (D5).

Also fold in the second mount path — 6 files pass a `*SidebarPanel` straight into
`RouteShell`, so a registry that only replaces the desktop dispatcher leaves them behind.

---

## Phase 5 · Right rail as tool palette 🟢🔴

**Must-deliver:**
1. **Registration becomes a descriptor, not a `ReactNode`** — `{toolKey, title, icon,
   group, permission, load: () => import(...), dragPayload?, keybinding?}`. This is the
   change that makes "tools open from any page" possible at all.
2. Add required `toolKey` (no default) to `DetailStackRailRegistrar` → the compiler
   names all 39 mount sites.
3. `recomputeTop()` → ordered list; keep `getRightRailTop()` as a shim.
   `closeRightPanel()` → `closeRightPanel(instanceId)`.
4. Build the N-tile host against the same 4-function read API and **feature-flag which
   host `ResponsiveLayout` mounts** — zero of the 43 registrants need to change.
5. Extract the `ToolHost` primitive from `ClipboardHistoryHost` / `ThrowTaskHost` —
   already the exact target pattern (mounted once, owns a chord, opened by a window event).
6. A **keybinding registry** — there is none today; 51 files hand-roll keydown
   listeners and exactly one key in the app is remappable. Mirror bindings to the
   Electron main process or custom keys die when the window loses focus.
7. Lift the first tools: Photo Library, Manuals, Label Printer, Calculator.
   ⚠️ The printer tool's pairing UI must be reachable through a **real click** —
   WebUSB's `requestDevice()` throws without transient user activation, so a
   hotkey- or AI-opened tool cannot auto-pair.
8. Collapse `StationDisplaysPushColumn` and `RightPaneOverlay` into the one host.

---

## Phase 6 · Tiling canvas 🔴

**Must-deliver:** generalize the *pure* `resolveRightRailFrame` into an N-pane
constraint solver (test with zero React first — it has 22 existing unit tests) · add
the vertical twin to `useHorizontalEdgeResize`'s pure drag math · replace
`ResponsiveLayout.tsx:425`'s single `children` slot with the canvas host · the
inset-radius token in `header-shell.ts` · window-manipulation hotkeys.

`unbox-compare-layout.ts` and `orders-compare-layout.ts` were **deleted on 2026-08-21**
rather than absorbed as presets — there is no compare behaviour left to port, so the
canvas defines its own arrangement vocabulary from scratch.

⚠️ Electron's native `WebContentsView` overlay cannot be clipped by `overflow:hidden`
or z-indexed under a tile. Every layout change must re-issue `setVendorViewBounds`, or
the canvas reserves a region for it.

---

## Phase 7 · One composer 🟢

**Store-first.** Change what composers *write* before changing how they look.

**Must-deliver:** `target: {entityType, entityId, buffer}` required with no default ·
repoint the receiving-line, receiving-carton and order composers at `postThreadMessage`
· resolve the order record's two-live-composers anti-pattern · absorb
`DenseComposeFields`, `LedgerCellEditor` and `ExpandableComposerField` as **modes** on
the one dock, deleting each as its mode lands · one `VisibilityToggle` (5 forks today —
its failure mode is emailing a customer a note meant to be private) · mount threads on
the 4 legal-but-unmounted anchors · add `SESSION` to the anchor CHECK as a **full-union
redefine**, widening `entity_signals` / `feed_memberships` / `thread_links` in the same
migration.

> The 62 note columns across 52 tables do **not** collapse with the UI. The one
> composer carries a per-mount write target — that is fine, and it means this phase is
> ~4,300 LOC of frontend, not 52 tables of backfill.

---

## Phase 8 · Reversibility and manager reporting 🟡

**Must-deliver:** route operator (non-AI) session actions through `applyAgentMutation`
so the Process tool reads one ledger · define inverse descriptors for the session-scoped
action kinds · the Process tool itself (list this session's actions, undo/delete) ·
redirect event writers to `ops_events` one domain at a time, **deleting a `journey.ts`
union branch per domain** (7 → 1 is the progress bar) · tighten
`audit_logs.organization_id` to NOT NULL before building reporting on it (the column
already exists and is stamped; see `2026-08-23c` for the two preconditions).

---

## Phase 9 · AI orchestration 🟢

**Must-deliver:** add `open_tool`, `pin_tool`, `close_tool`, `start_session`,
`focus_session`, `set_layout`, `split_pane` to `UI_TOOLS` · replace `runUiTool`'s switch
body with a dispatch into the workspace store, so every AI workspace action is loggable,
permission-checked and undoable · consolidate the three AI stacks onto the assistant
loop (the only one with per-tool permissions and org-from-ctx).

---

## Cross-cutting, every phase

- **Required props with no default** are the enforcement mechanism (D10). `toolKey`,
  `sessionType`, `target`, `permission`, `stance` — each turns an unmigrated call site
  into a **type error**.
- **Expand → code → contract.** The migration lands first; a nullable `ADD COLUMN` is
  always safe to ship ahead of readers. Nothing checks this automatically.
- **Fix the 59 source-text tests in the same change that moves their files.** Do not
  delete them — they are the last protection against a re-forked closer.
- **Never delete the GS1/label routes.** `/01/**`, `/414/**`, `/l/**`, `/p/**`, `/s/**`
  are printed on stickers already on boxes.
- **Machine facts stay device-local.** Printer profiles, panel widths, silent-print.
  Person facts follow the staffer.
