# Workbench recipe `master-detail` — sidebar map + right workspace

Pointer-driven **catalog / mode-scoped** Workbench: a stable sidebar picker and a right-pane
editor that crossfades on selection. Products (QC / Kit Parts / Manuals / …) are the reference.

**Inherits:** [`workbench.md`](workbench.md). Spine / MasterNav detail that used to live in the
Workbench megadoc stays here as L2/nav context for picker pages — nav membership SoT remains
`sidebar-navigation.ts` + `source-of-truth.md`.

---

## Anatomy — master–detail recipe (common)

When using the sidebar map, three structural slots, in this order:

| Slot | Owns | Reference |
|---|---|---|
| **Sidebar picker** (the stable map) | searchable master list (filters / sub-tabs as needed) | `ProductsSidebarPanel.tsx` via `src/components/layout/SidebarShell.tsx` |
| **L2 Mode + Recents** | page mode switcher + cross-page MRU | `GlobalHeader` → `HeaderModeSwitcher` / `HeaderRecentsSwitcher` (data = `SIDEBAR_PAGE_NAV` via `useSidebarModeNav`); pins = `HeaderPinsSwitcher` / `useQuickAccess` |
| **Right pane** (the workspace) | the selected record's detail/editor; crossfades on selection change | `QcChecklistWorkspace.tsx`, `KitPartsWorkspace.tsx` |

- **Compose `src/components/layout/SidebarShell.tsx`; never hand-position search.** It owns the outer
  `flex h-full flex-col overflow-hidden` column, renders `<SidebarSearchBar>` itself from the `search` prop (the
  `sidebar-search-bar.guard.test.ts` guard keeps `SidebarSearchBar` out of other components — migration in progress),
  and stacks `headerAbove` → search →
  `headerRows[]` (sub-tabs / facet filters) → `children` (the single `flex-1 overflow-y-auto` body). The panel supplies slots, not
  layout — that's what kept the 40px search band from drifting per page.
- **L2 Mode lives in GlobalHeader, not the sidebar.** Closed = active-mode icon (32px);
  open = `AnchoredLayer` listing that page's `SIDEBAR_PAGE_NAV` modes. Recents is the adjacent
  History icon (collapsed by default) over `useRecentModes`. **Never** remount a full-width
  `HorizontalButtonSlider` mode rail as a twin of the header control. Nested / secondary sliders
  (pairing sort, sourcing status, FBA plan/combine, inventory triage filters) may stay in the
  sidebar — those are not page L2. **Header pins** (`HeaderPinsSwitcher`) sit to the right of
  Recents (hairline separator): pin-current + sortable icon stations from `useQuickAccess` /
  `cf.quickAccess` — never a pin list in a staff / Quick Access menu. The desktop
  `GlobalHeaderActions` rail is **search · notifications · AI far-right** (three, one per
  kind: find · be told · ask) — Sparkles opens the assistant right-rail at the edge it
  owns (mirror of MasterNav collapse far-left). Session/setup actions (clipboard, phone QR,
  kiosk preview) live in the `StaffAccountFooter` ⋯ overflow, not on the rail —
  frequency earns a persistent icon. **No staff avatar on desktop**. Spine top band is
  `OrgWorkspaceControl` (current workspace + switch when multi-org) — not a “name of
  now” page label (selection is the body row). No MRU chips in the org band; column open
  lives on `SidebarNavColumn`. Global search stays in GlobalHeader (`GlobalHeaderSearch`)
  — never pin a search **control** twin in the spine. **Home** (house glyph + label) then
  Search + Media + **Chat** **page** rows are top-pinned (`kind: 'top'`) above section
  drills — same pin grammar as the footer band (`kind: 'bottom'`), which reads
  **Workflow Studio · Admin · Settings** in `APP_SIDEBAR_NAV` array order. Studio joined it
  2026-08-02 (it was a root drill): defining the operation is a standing-back act, not one of
  the places browsed through in a shift. **A pinned row never draws children**
  (`showModes = !pinned && …`), so `/studio/catalog` rides as an L2 mode in
  `SIDEBAR_PAGE_NAV` — ⌘K, the spine's flat search and the header Mode switcher still name it,
  but it left the spine surface. Below
  Settings/Admin: `StaffAccountFooter` (avatar · name · role · more · sign-out). When the
  spine collapses to 0 width, org + staff are unreachable (open via header toggle / edge
  peek) — intentional, same as Admin/Settings. **Both ends of the spine wear the
  same circular mark** — `IdentityMark` (org) / `StaffAvatar` (staff) from
  `@/components/identity`, at the same `sm` density — and the org control is
  **always** a dropdown trigger, single-org included. **Identity menus (org switch +
  staff ⋯) are a child of the trigger/row** — dense `SIDEBAR_SPINE_MENU_*` chrome +
  `AnchoredLayer` `*-stretch` (inset by band pad); never a wider magic
  `w-[Npx]` or a chunkier twin. Menu type = caption/micro (org trigger stays
  `text-role-body`). Never hand-roll a
  `rounded-full` initials span or a local `initials()`; SoT:
  `source-of-truth.md` → Identity mark · Staff profile photo · MasterNav spine type ladder.
  Guard: `header-mode.guard.test.ts`.
- **Section drills (spine L1).** Root shows **Analytics Monitor · Scan Stations · Inbound ·
  Catalog · Inventory · Fulfillment · Sales · Support** as **drill buttons**
  with leading icons (`SPINE_SECTIONS` in `sidebar-navigation.ts` — compose from
  `MAIN_GROUPS` + `STATION_GROUPS` + `DOMAIN_GROUPS`; never twin labels). Drill replaces the
  scroll body with centered back title + that section's pages. A footer-pinned
  `TechRailSearchBar` (same band as station rails) sits above Settings/Admin (+ staff footer
  below) and always filters the visible map — root sections (label or any child page/mode)
  when at the root, pages inside the open drill when drilled. Membership: `mainGroup` /
  `stationGroup` / `domainGroup` via `spineSectionIdForPage`.
  **Declare membership identically in BOTH `APP_SIDEBAR_NAV` and `SIDEBAR_PAGE_NAV`**.

  **The axis is deliberately mixed, and that is the ruling** (2026-08-01,
  `docs/todo/desk-domain-spine-split-CLAUDE-CODE-PROMPT.md`): Monitor is an
  ALTITUDE (observe), Scan Stations is an INPUT MODEL, and the six after it are
  BUSINESS DOMAINS. Insisting on one uniform axis is what produced `Triage Desk` — "not a
  scanner, not a graph" is a leftover, not a place, and it collected seven unrelated pages
  behind a label no operator could predict. `Print Stations` failed the same way from the
  other side: printing is a task every domain performs, so its rows were aliases of URLs the
  canonical pages already owned. Both are dead labels and must not return under a new name.

  Members: Scan Stations (`floor`) = Receiving subgroup + Testing / Packing / Scan out —
  **never** relocated into Inbound or Fulfillment; Inbound = Incoming + Receiving Board;
  Catalog = Manage Products (Reference · Manuals · Labels · Pairing · Catalog link · QC ·
  Kit Parts); Inventory = Inventory + Sourcing + Locations (ex-Warehouse, incl. the bin/rack
  label printer); Fulfillment = Manage Shipping (Orders · Labels · Ready · FBA · Packing
  Review) — **carrier postage stays here and never folds into a label workspace**; Sales =
  Sales Board + Local Pickup History; Support = the 6 support modes; Analytics Monitor =
  Operations only. Section icons come from
  `MAIN_GROUPS` / `STATION_GROUPS` / `DOMAIN_GROUPS`. Accents: `spineAccentFor` /
  `SPINE_SECTION_ACCENTS` (sky / amber / teal / emerald / cyan / indigo / green / orange;
  top+footer neutral blue). **A section with no visible page renders nothing**, and a
  page whose every mode was permission-filtered is dropped by `isSidebarPageReachable` —
  hollow is forbidden at both altitudes. Auto-enters on cross-section navigation; manual Back
  returns to the root map.
  Swap uses `framerPresence.spineDrill` / `framerTransition.spineDrill` (opacity-only)
  plus the named active-wash preset. **Page rows and mode rows share ONE
  cascade** — `spineRowStagger*`, 15ms/row, keyed on the SECTION (never the filter);
  the root map mounts instantly. Hover/press travel is CSS on the 14px glyph
  (`SPINE_ICON_LIFT_CLASS`) — never `whileHover`, never a row `scale` or weight shift.
  Active rows are a fill **plus** an inset hairline. Detail:
  `motion-crossfade.md` → ONE MasterNav row cascade; `source-of-truth.md` → MasterNav
  section accents / row hover-press travel. Modes stay always expanded; L2 Mode
  also lives in GlobalHeader.
  Guards: `main-nav-groups.guard.test.ts`, `station-nav-groups.guard.test.ts`.
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

---

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

### The four settled states — a collection has more than "data or not"

"Loading vs empty" is two states for what is really four, and collapsing them is how a
surface tells the operator something false. Every collection surface answers:

| State | Means | Renders |
|---|---|---|
| **Loading** | not settled yet | skeleton at the **real geometry** — never a spinner over a table |
| **Empty — absence** | settled, nothing exists yet | teaching box + the create/next action |
| **Empty — no match** | settled, a filter excluded everything | teaching box + **clear the filter** |
| **Degraded** | a source failed | the surface still renders; the failed part shows empty, it never 500s the record |

- **Reserve the geometry while loading, and gate on ALL sources together.** A band fed by two
  queries that each render as they settle **reflows under the operator's cursor**.
  `OutboundKpiStrip` holds one combined `isPending` gate for exactly this reason;
  `LedgerGridSurface` renders `SkeletonList count={12} type="row"` inside the framed shell.
- **Absence and no-match are different answers.** "No cartons yet" invites the create action;
  "no cartons match" invites clearing the filter. Showing the first when the second is true
  tells the operator their data is gone. Compose `LedgerGrid`'s `emptyState` /
  `searchEmptyState` / `isSearching`, or `LedgerGridSurface`'s `emptyMessage` /
  `searchEmptyMessage` / `isSearching`. *(The surface collapsed these to one message until
  2026-07-29 — every descriptor-driven grid answered both questions identically.)*
- **Settled-with-nothing can be a POSITIVE answer.** On a queue whose job is "what needs me",
  zero is an all-clear, not an absence — say so in copy (e.g. "Nothing needs you right now").
  Reserve the dashed teaching box for absence.
- **Degraded is not empty.** A failed sibling fetch renders its own region empty and leaves the
  rest of the surface working — see *Degrade-not-fail* above. Only the **primary** resource
  earns the retryable rose error state.

---

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

---

Indexed by [`workbench.md`](workbench.md) · ../contextual-display.md
