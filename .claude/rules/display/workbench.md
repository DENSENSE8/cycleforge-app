# Workbench display — select → edit → persist

The **pick+edit region contract**: pointer-driven navigation of records that are **not** scan-driven, with
**durable, URL-addressable selection** and CRUD. This is the **default contract** — if a region isn't a scanner Station,
a read-only Monitor, or a node-graph Canvas, it's a Workbench.

Workbench is **not** “sidebar + right pane forever.” That is one **common recipe**. Data shape chooses primary surface
(list / table / board / master–detail / fact stack). Density default: **`ops`**.

**Inherits:** ../ui-design-system.md (Kinetic Ledger, density, presentation kinds, one-row anatomy, chips, tokens).
This doc only details what's *specific* to the Workbench contract.

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
- A page may **host** a Workbench beside another contract (scan bench + inspector), but each *region* obeys exactly one.

---

## Recipes (data shape chooses)

| Recipe | Primary map | Focus surface | When |
|---|---|---|---|
| **Master–detail** | Sidebar picker (`SidebarShell` / rail) | Right pane workspace | Mode-scoped catalogs, multi-mode pages (Products, many receiving modes) |
| **Table / queue + context** | Dense table | Drawer / side panel / stack | Wide rows, multi-column ops (orders, shipments) |
| **Board + detail** | Swimlanes / cards on lanes | Board detail panel | Pipeline states (FBA board) |
| **Fact stack / form** | Optional thin list or none | Full-width record body | Single durable entity already selected |

**Detail pane / right pane = optional secondary** in table/board recipes. Do not invent a dual pane to satisfy an old template when the collection is already the job.

---

## Anatomy — master–detail recipe (common)

When using the sidebar map, three structural slots, in this order:

| Slot | Owns | Reference |
|---|---|---|
| **Sidebar picker** (the stable map) | searchable master list + mode rail | `ProductsSidebarPanel.tsx` via `src/components/layout/SidebarShell.tsx` |
| **Mode rail** | `?view=`/`?mode=` switcher pinned in the sidebar header | `HorizontalButtonSlider` `variant="nav"` `dense` |
| **Right pane** (the workspace) | the selected record's detail/editor; crossfades on selection change | `QcChecklistWorkspace.tsx`, `KitPartsWorkspace.tsx` |

- **Compose `src/components/layout/SidebarShell.tsx`; never hand-position search.** It owns the outer
  `flex h-full flex-col overflow-hidden` column, renders `<SidebarSearchBar>` itself from the `search` prop (the
  `sidebar-search-bar.guard.test.ts` guard keeps `SidebarSearchBar` out of other components — migration in progress),
  and stacks `headerAbove` (mode rail) → search →
  `headerRows[]` (sub-tabs) → `children` (the single `flex-1 overflow-y-auto` body). The panel supplies slots, not
  layout — that's what kept the 40px search band from drifting per page.
- **The mode rail lives with the map** (sidebar header), not buried in the detail surface. `ProductsSidebarPanel.tsx` passes the view slider
  as `headerAbove` and conditional sub-tab/sort rows (`labelsView`, `pairingSort`) as `headerRows`. Each is a
  `HorizontalButtonSlider` `variant="nav" dense` (32px pill in a 40px band).
- **Anti-mix — never invert the sidebar.** Related/similar is progressive disclosure *below* the picker, never replacing the map.
- **Responsive fallback is list-OR-detail, not both.** On a narrow viewport, show the picker *or* the detail, never a
  cramped two-up. (M3 list-detail / WinUI List/Details patterns.)

---

## Compose the rail, never fork it

- **The picker wraps shared infrastructure; it never re-implements list mechanics.** Two reuse tiers exist:
  - **`src/components/layout/SidebarShell.tsx`** — the layout shell (header/search/rows/scroll-body). Every Workbench sidebar uses it.
  - **`SidebarRailShell.tsx`** — the *recent-activity rail* engine (`useSidebarRail`): fetch + `queryKey`, optimistic
    `updateEvent`/`deleteEvent`/`deleteGroupEvent` patching, query invalidation, top-N + pinned selection, package
    grouping, keyboard nav, hover-preview popover positioning, stagger reveal. The domain wrapper supplies only
    renderers.
- **`RecentActivityRailBase.tsx` is the reference wrapper** — it passes `renderRowMain`, `renderPopover`,
  `getStatusDot`, `getStatusDotLabel`, and hoists its callbacks (`getRowId`, `getRowActivityAt`) to module scope so
  the shell's listener effect subscribes once instead of tearing down on every parent re-render.
- **A simple catalog picker may be a plain list** (e.g. `QcSidebarPicker`/`KitPartsPicker` inside
  `ProductsSidebarPanel.tsx` render a `divide-y` `<ul>` over `useSkuCatalogSearch`) — but it still **composes
  `SidebarShell`** for the header/search band, and it still obeys the one-row anatomy and `bg-blue-50` selection rule.
  Fork the *rows*, never the *shell*.

> Rule of thumb: new picker → wrap `SidebarShell` (+ `SidebarRailShell` if it's an activity rail) and supply
> renderers. If you're writing fetch/selection/keyboard-nav code, you've forked something you should have composed.

---

## URL-as-state

- **Selection and mode live in `searchParams`, not React state.** That's what makes every view deep-linkable and
  reload-safe. The picker writes selection with `router.replace` (`?skuId=` in QC/Kit, `?sku=` in Pairing, `?id=` in
  Manuals, `?historyId=` in Labels) and the right-pane workspace reads the *same* params — so no prop-drilling, no
  context: `ProductsSidebarPanel` and `ProductsWorkspace` are coupled only through the URL. This is the nuqs
  "search params as state" model (https://github.com/47ng/nuqs).
- **Mode is a param too; the default mode drops out of the URL.** `parseView`/`handleViewChange` in
  `ProductsSidebarPanel.tsx` set `?view=qc` but `updateParams({ view: null })` for the default (Manuals), keeping deep
  links clean. Sub-views follow the same rule (`labelsView`, `pairingSort` drop their defaults).
- **Mode-scoped params clear on mode change.** Switching the Labels sub-tab clears the stale unit selection
  (`updateParams({ labelsView: …, historyId: null })`); `useReceivingMode.ts` `updateMode`/`updateUnboxView` clears
  History params and fires `receiving-clear-line` so a new list starts at its own empty state instead of carrying a
  dead selection. **A selection from mode A must never bleed into mode B.**
- **Gap to close: filters/sort/search are only *partially* in the URL.** Today `?q=` and `?sort=` are URL-backed in
  Products, but most filter/field state still lives in component `useState`. Push **all** durable filter/sort/search
  state into `searchParams` so a shared link reproduces the exact view. (This is the cross-cutting "URL is the state
  SoT for durable views" rule.)

---

## Selection lifecycle

The collection map is stable; only the **focus surface** moves.

1. **Row click → `router.replace`.** Write the selection id to the URL. Active row uses house selection ring only.
2. **URL change → id-gated re-fetch.** Detail hooks gate on validity so empty selection never fires; teaching empty instead.
3. **Crossfade the focus surface** (right pane, drawer, or stack), keyed on the selection id.
4. **The map never animates.** Selection is `bg-blue-50 ring-1 ring-inset ring-blue-400` only — never a size/height shift.

---

## Sticky docking — one sticky layer per scroll port

**Never stack two `sticky top-*` bands inside the same scroll port.** The lower band has to know the upper band's height to dock beneath it, and a hardcoded offset (`top-[var(--x,72px)]`, a guessed px) drifts the moment the upper band's real height differs — the seam/overlap bug. z-index orders *front-to-back*; it says nothing about *vertical docking*, so a second sticky band is never made safe by a higher `z-`.

**House pattern (the fix): pinned chrome OUTSIDE the scroll port.** The single always-visible top bar (lifecycle tabs + filters) renders in a non-scrolling slot **above** the `overflow-y-auto` body; the body then has exactly one sticky layer — the day-band `DateGroupHeader`s at `top-0` — which docks directly under the chrome with **no offset math**.

- Reference: `DashboardScrollShell`'s `chrome` prop (`src/components/dashboard/DashboardScrollShell.tsx`) — the chrome slot owns the `z-header` band as a non-scrolling sibling; `DashboardOrdersView` / `ShippingWorkspaceView` pass the workspace header there and keep the KPI strip **inside** the body so it scrolls away.
- Anything that must scroll away (KPI strips, banners) belongs in the body, never the chrome.
- Only reach for a **measured** offset (ResizeObserver → CSS var per layer) if a port genuinely needs 3+ dynamic-height sticky bars — the two-zone shell removes the need in every current surface. A fixed px offset is never the answer.
- z bands stay from the SoT (`src/design-system/tokens/z-index.ts`): chrome/top bar = `z-header`, in-body pins = `z-raised`/`z-sticky`. Never hardcode `z-[NNN]`.

## Teaching empty + typed states

- **Branch the empty/error copy by *type*, not one generic "Nothing here."** Four distinct states, each with its own
  copy and CTA (NN/g empty-state guidance: https://www.nngroup.com/articles/empty-state-interface-design/):
  - **No selection (first-use prompt)** — teach the next action. `QcChecklistWorkspace` with no `skuId` renders a
    centered icon tile + "Select a product from the sidebar to view and manage its QC checklist." `KitPartsWorkspace`
    mirrors it.
  - **Loaded-but-empty (no results)** — distinguish *no data yet* from *no matches*: `QcSidebarPicker` shows
    `trimmedQuery ? 'No matches with a QC checklist.' : 'No products have a QC checklist yet.'` A no-results state with
    an active filter should offer a **Clear filters** action; a first-use empty should offer the primary create action
    inline, never a bare line.
  - **Loading** — spinner + text: `<Loader2 className="h-4 w-4 animate-spin" /> Loading…` (the shared async rule).
  - **Errored** — a **distinct, retryable** state, visually separate from empty (rose, not gray).
- **The right pane's empty state is keyed to the mode.** `ReceivingRightPane.tsx`'s `RECEIVING_EMPTY_STATE` map keys
  copy by `?mode=` so triage's "pick from the Unfound/Prioritize list" prompt never shows in Unbox — empty copy is
  structurally tied to the mode that owns it.

---

## Degrade-not-fail (per-sub-resource isolation)

- **Each right-pane sub-resource fetches in its own `try/catch` + error boundary; a failing sub-fetch renders empty,
  it never 500s the whole record.** The SoT to mirror is `src/app/api/get-title-by-sku/route.ts`, which wraps the QC
  and kit-parts lookups in independent `try/catch` blocks (the QC fetch failing returns empty checks, the title still
  resolves) — a sub-resource is allowed to fail without taking down the record.
- **On the client, the same law: a sibling fetch error degrades to empty, not a thrown pane.** `QcChecklistWorkspace`
  loads its sibling kit-parts count via `useSkuKitParts(skuId)` but only renders `kit?.parts.length ?? 0` — if that
  sibling query errors, the QC pane still fully renders; the cross-link chip just shows `0`. The *primary* resource
  errors to the retryable error state; *secondary* resources degrade silently.
- This is graceful degradation / mitigating interaction failure (AWS Well-Architected REL:
  https://docs.aws.amazon.com/wellarchitected/latest/reliability-pillar/rel_mitigate_interaction_failure_graceful_degradation.html).

---

## Focus-surface crossfade (right pane recipe)

- **Crossfade the focus surface on selection change; keep the collection map mounted and still.** For master–detail, that surface is the right pane. `AnimatePresence mode="wait"`
  keyed on the selection id, **opacity + small-y only**, `prefers-reduced-motion` honored. `ReceivingRightPane.tsx` is
  the reference: the focused workspace is a `motion.div key={`workspace-${workspace.row.id}`}` with
  `initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 6 }}` →
  `animate={{ opacity: 1, y: 0 }}` → `exit … { opacity: 0, y: 4 }`, `transition={{ duration: 0.18, ease: motionBezier.easeOut }}`.
- **Keep the table/list mounted, `display:none`, to preserve its cache + scroll.** `ReceivingRightPane.tsx` holds
  `ReceivingLinesTable` `style={{ display: isTableOnlyMode ? 'block' : 'none' }}` (not unmounted) so its react-query
  cache, in-flight search, and scroll position survive a tab flip — and so first-mount auto-select effects don't
  re-fire on every close.
- **Route motion through the reduced-motion wrappers.** Prefer `useMotionTransition` / `useMotionPresence`
  (`src/design-system/foundations/motion-framer-hooks.ts`) so reduced motion automatically collapses y→0 and shrinks
  the duration to ~0 — that's the "replace slides with crossfades" accessibility default, not "no motion." Pull
  easings from `motionBezier` / `framerTransition` in `motion-framer.ts`; never hardcode a cubic-bezier. **Never
  animate width/height/padding** — for height use `grid-template-rows`.

---

## Optimistic CRUD

- **Edits persist through the house CRUD route pattern** (../backend-patterns.md): `withAuth(handler, { permission })`
  → validate → domain helper → map 404/409/200 → `recordAudit()` → `after()` side-effects. The
  `/api/sku-catalog/[id]/qc-checks` and `/api/sku-catalog/[id]/kit-parts` routes are the reference; the view stays
  thin and dumb.
- **Optimistic update, then reconcile.** The TanStack Query contract is `onMutate` (snapshot + apply) → `onError`
  (rollback to snapshot) → `onSettled` (`invalidateQueries`) — https://tanstack.com/query/v4/docs/react/guides/optimistic-updates.
  Thread a `clientEventId` so a retry on a flaky network is an idempotent no-op
  (`UNIQUE(client_event_id)`, ../backend-patterns.md).
- **Deletes are confirm-then-commit, never optimistic.** A removed row that resurrects on rollback is worse than a
  half-second confirm.
- **Gap to close: today's CRUD sections are refresh-after-mutation, not truly optimistic.** `QcChecklistSection`
  (`handleRemove` / `togglePublish` / save) and `KitPartsSection` `await fetch(...)` then call `onRefresh()` (which
  `invalidateQueries(['sku-qc-checks', skuId])`). Correct and safe, but it shows a spinner gap instead of an instant
  edit. Migrating these to `onMutate`/rollback is the improvement; keep `onSettled → invalidate` either way.

---

## Progressive disclosure of related / similar

- **Siblings appear *below* the picker once a record is selected — they augment the map, never replace it.** Surface
  related/similar (e.g. `/api/sku-catalog/[id]/similar`) as a "Similar" group that materializes under the picker on
  selection, or a slim footer rail under the editor. This is textbook progressive disclosure
  (https://www.interaction-design.org/literature/topics/progressive-disclosure) — the picker stays the primary
  navigator; siblings are secondary, revealed only when there's a record to be similar *to*.
- **Cross-links are inline, not a replacement.** `QcChecklistWorkspace` ↔ `KitPartsWorkspace` link to each other with
  a header chip (`router.replace('/products?view=kit&skuId=…')`) showing the sibling's count — a contextual jump, not
  an inverted sidebar.

---

## Action planes — where an action lives

Every operator action on a collection surface belongs to exactly **one primary plane**:

| Plane | Mechanism | For |
|---|---|---|
| **In-cell** | cell-anchored editor / popover (`LedgerCellEditor`, house `Popover`) | single-value, highly-typed fields — qty, date, grade, short text |
| **Row-scoped** | hover controls + the single-selected row info menu | one-click record affordances (notes, out-of-stock, open) |
| **Multi-select** | `ContextualSelectionBar` + `SelectionAction[]` | anything meaningful on N records at once |
| **Record** | the detail inspector / full record page | relational, multi-step, or side-effectful work |

- **Plane redundancy is REQUIRED where the primary plane is conditionally unavailable.** In-cell editing on the
  outbound grid is gated `gridSkin && !isMobile`, and the inspector body is shared with `/o/[orderId]`, so the
  record plane must stay a **complete superset** of editable fields. Ship-by and condition appearing both in-cell
  and in the inspector is the contract, **not** duplication to clean up. Only make a field plane-exclusive when its
  plane is *unconditionally* available.
- **Actions diverge by lifecycle stage; column layout and grid components diverge only by data domain.** All four
  outbound tabs (Pending · Tested · Packed · Shipped) render one grid with one persisted column layout, but
  "assign a tester" is meaningless on Shipped and "print a shipping label" is meaningless on Pending. Scope each
  action with `SelectionAction.enabled` / `minSelected` / `maxSelected` — `ContextualSelectionBar` drops actions
  that cannot fire, so lifecycle scoping needs no new chrome and never renders a dead button.
- **A surface gets real selection OR a collapsed gutter — never an inert one** that consumes the 2rem track with
  nothing wired to it.
- **Bulk ≠ a batch-edit panel.** For per-record judgement over a set, compose the existing
  `WorkOrderAssignmentCard` carousel (prev/next + confirm→advance). Reserve a true single-write bulk mutation
  (one date onto N orders) for values that genuinely are identical across the set.

## Keyboard ownership — the innermost overlay wins

A collection surface usually has three live keyboard owners: a capture-phase queue listener, the detail
inspector, and whatever popover is open. Capture beats bubble, and `stopPropagation()` in capture stops the
bubble listeners from ever running — so an ambient owner can silently swallow Escape from the overlay that
should have handled it.

- **The innermost open editor or overlay owns Escape.** Not "any input" — a text editor holds focus so a
  typing-target test hides the bug, but button/menu popovers do not.
- Overlays register with `src/lib/overlay-stack/store.ts` (`useRegisterOverlay`, called by `AnchoredLayer`, so
  every house Popover / DropdownMenu / ContextMenu / Calendar participates for free). Ambient owners stand down
  while `hasOpenOverlay()` / `useAnyOverlayOpen()`.
- **A capture-phase listener must not claim a key the focused element already handles.** Grid rows are
  `tabIndex={0}` and handle Enter/Space for *their own* record; a queue-level Enter branch that only knows how to
  open `records[0]` has to bail when the event target is inside a row.

---

## Gap notes (to close)

- **Add a cmd-K launcher** that fuzzy-jumps to `?skuId=` and fires CRUD actions (command-palette pattern:
  https://uxpatterns.dev/patterns/advanced/command-palette). **It must not collide with the F2 scan hotkey**
  (`src/lib/scan-hotkey/store.ts`, default F2, claimed by the last-registered scan target) — bind cmd-K / ctrl-K only,
  and never grab a function key the Station archetype owns.
- **Push filters/sort/search fully into the URL** (see URL-as-state) so deep links survive a reload.
- **Migrate CRUD sections from refresh-after to optimistic `onMutate`/rollback** (see Optimistic CRUD).

---

## Do / Don't

| Do | Don't |
|---|---|
| Compose `SidebarShell` / `SidebarRailShell`; supply only renderers | Fork a new list component or hand-position the search band |
| Write selection + mode to `searchParams` (`router.replace`) | Hold selection in local `useState` (breaks deep-link + reload) |
| Crossfade the right pane keyed on selection id (opacity + small-y) | Crossfade the list/map — keep it mounted and still |
| Keep the table mounted `display:none` to preserve cache + scroll | Unmount the list on selection (loses scroll + re-fires effects) |
| Branch empty copy by type (first-use / no-results / loading / error) | Ship a bare "Nothing here" empty state |
| Isolate each sub-resource in its own try/catch; degrade to empty | Let a failing sibling fetch 500 the whole record |
| Surface similar/related *below* the picker on selection | Invert the sidebar to put related items where the picker belongs |
| Confirm-then-commit deletes; optimistic for add/edit | Optimistically delete a row (resurrects on rollback) |
| Route motion through `useMotionTransition`/`useMotionPresence` | Hardcode a cubic-bezier or animate width/height/padding |

---

Indexed by ../contextual-display.md
