# PLAN — Outbound desk as a Vercel-style 3-pane (Sidebar · Feed · InspectDrawer)

Written 2026-09-26. Desktop desk surface (Class C, `SURFACE_LAW.md` §3). The platform is
**AI-first** (operator ruling 2026-09-26 — `00-endgame.md` §4 D2, §5; `LAWS.md` T15, T28).
This plan builds the **foundation only**: layout, routing, component hierarchy. AI features
land on top of it afterward (§8), under the approval-first + per-automation auto-approve model.

## 0 · Ground truth (scouted)

| Fact | Where |
|---|---|
| Desk routes | `src/app/shipping/(desk)/{exceptions,shortage,orders,shipped}/page.tsx`, layout `src/app/shipping/(desk)/layout.tsx` → `DeskPageLayout` → `DeskPageChrome` (title, tabs, action slot) |
| Left pane host already exists | `DesktopRouteShell` → `ContextPanelLayout` (resizable, ⌘B collapse) → `SidebarContextPanel` routes `routeKey === 'outbound'` → `OutboundSidebarPanel` (70 lines, today unreachable) |
| Why no left pane today | `outbound` page declares `railless: true` (`src/lib/sidebar-navigation.ts:1657`), read by `useIsRaillessSurface()` in `ContextPanelLayout.tsx:119-121` |
| Right pane hosts | `RightRailHost` + `DetailStackRailRegistrar` (push, resizable, singleton ✕) — used by `InventoryInspectorRail`, `FbaBoardDetailPanel`; `DeskRecordPlane` (in-place / split) is today's order detail |
| Order detail body | `src/components/outbound/orders/OrderRecordView.tsx`; shipped: `src/components/shipped/ledger/ShipmentRecordView.tsx` |
| Toolbar clutter to strip | `OutboundOrdersLedger.tsx` `data-testid="data-table-toolbar"` (SearchField, `DataTableFilterMenu`, `DataTableSortMenu`, `WorkbenchViewsMenu`, page size, Edit platforms, zoom, density, fullscreen); `ShippedLedgerToolbar.tsx` (search, date range, type/carrier/status, exceptions toggle); `OrderExceptionsWorkbench` category `<nav>`; `DeskPageChrome` action slot (Add/Sync/Import, Past imports, Paperwork, Export CSV, Resolve) |
| Filter state | URL: `q`, `late`, `attention`, `ustatus`, `cage`, `stage`, `aging`, `staff`, `sort`/`dir`, `category`, `shipped`, `carrier`, `statusCategory`, `exceptionsOnly`, `start`/`end`; record: `openOrderId` (orders/shortage), `order` (exceptions), `shipment` (shipped). Chrome resolver `src/components/unshipped/useToShipChrome.ts`; search `useDashboardSearchController` |
| Batch actions | `useDashboardBulkSelection` (assign pick/pack via `StageStaffAssignPopover`, ship-by, condition, qty, flags, CSV export, listing rules); selection `useTableSelection` scopes `dashboard-orders` / `order-exceptions` |
| PO pairing data | `order_line_shortages` ⋈ `shortage_inbound_links` (`source_kind` `po_line` / `receiving_line`) — `src/lib/orders/shortage-inbound.ts` |
| Pick data | `/api/picking/board`, `allocation_facts` (`allocated_unit_count`, `picked_unit_count`), `sqlOrderHasTechScan` |
| Motion | `motion@12.42.2` **and** `framer-motion@12.42.2` both in `package.json`; `motion-plus` = `@motionplus/core@2.12.0` (licensed, installed). Boundary: feature code imports `@/design-system/motion` only; Motion+ only via `@/design-system/motion/plus` (today exports `AnimateNumber` only). Guard: `src/design-system/foundations/motion-major.guard.test.ts`. Tokens: `motion/tokens.ts` (`springSnappy`…), `foundations/motion-framer.ts` |
| React | 19.2.1 — `<Activity>` available (needed by Motion+ `AnimateActivity`); React `ViewTransition` is not (Motion+ `AnimateView` needs ≥19.3 → excluded) |

## 1 · Target tree

```
DesktopRouteShell
└─ ContextPanelLayout                         (railless retired for outbound)
   ├─ DeskSidebar            ← LEFT  (OutboundSidebarPanel rewritten)
   │   ├─ DeskSidebarSearch  top-left anchor, autofocus on route entry, "/" refocuses
   │   ├─ DeskViewNav        5 views (§3), AnimateNumber counts, layoutId active pill
   │   ├─ DeskViewFilters    AnimateActivity per view — facets for the active view only
   │   └─ DeskViewActions    Export/Import, Batch assign, Sync, Paperwork, Resolve (per view)
   ├─ DeskFeed               ← CENTER (children: ledger rows only, fixed max width)
   └─ RightRailHost
       └─ DeskInspectDrawer  ← RIGHT (DetailStackRailRegistrar push; OrderRecordView / ShipmentRecordView)
```

New files (desktop-only dir, per ARCHITECTURE "Component split (binding)"):
`src/components/outbound/desk-shell/{DeskSidebar,DeskSidebarSearch,DeskViewNav,DeskViewFilters,DeskViewActions,DeskFeed,DeskInspectDrawer}.tsx`,
view registry `src/lib/outbound/desk-views.ts` (pure, shared by sidebar, feed, tests).

`DeskPageChrome` tabs + action slot are removed from the outbound desk (the sidebar owns both);
`DeskRecordPlane` in-place/split is retired for outbound in favour of the drawer. Other desks keep
`DeskPageChrome` untouched.

## 2 · Routing contract (step 4 gate: "routing state reflects sidebar selections")

One registry, `DESK_VIEWS`, each entry `{ id, label, pathname, fixedParams, facets, actions, recordParam, countQuery }`.
Every sidebar selection is a URL write (`router.replace`, `scroll:false`, via `useOptimisticUrlParam`);
nothing lives only in React state except the in-flight search draft.

| View | URL | Fixed params | Record param |
|---|---|---|---|
| Exceptions Queue | `/shipping/exceptions` | — (`category` facet) | `order` → **unify to `open`** |
| Pending · PO Paired | `/shipping/shortage?pair=po` | `pair=po` | `openOrderId` → `open` |
| Pending · Pick List | `/shipping/shortage?pair=pick` | `pair=pick` | `open` |
| Triageable Action List | `/shipping/orders` | — (`staff`, `stage`, `aging`, `attention`, `late`, `route`) | `open` |
| Shipped (All-in-One) | `/shipping/shipped` | — (`q`, `start`/`end`, `shipped`, `carrier`, `statusCategory`, `exceptionsOnly`) | `shipment` → `open` |

- Record param unifies to **`open`** across the four desks (clean cutover: `useDashboardSelectedOrder`,
  `OrderExceptionsWorkbench`, `ShippedLedger`, every deep-link builder and test migrate; no alias).
- `/shipping/shortage` without `pair` redirects to `pair=po` (default view), server-side in the page.
- New predicates in `GET /api/orders`:
  - `pair=po`: `blockedOnly` rows with `EXISTS (order_line_shortages ⋈ shortage_inbound_links WHERE source_kind IN ('po_line','receiving_line'))`.
  - `pair=pick`: not shipped, no pack scan, `allocated_unit_count > picked_unit_count`, ordered by sync time desc.
- `route` facet (workflow routing) = listing auto-assign state from `/api/automations/listing-assign`
  (`ruled` / `unruled` / `mismatch`).
- Counts: one `GET /api/orders/desk-counts` returning `{exceptions, po, pick, triage, shippedToday}`
  (single round trip — `request-shape` skill before merge).

**Gate before advancing past Phase 3:** Playwright at `:3050` walks every view + facet and asserts
`location.search` equals the registry's expected params, back/forward restores sidebar state, and a
cold load of each URL paints the matching sidebar selection.

## 3 · Sidebar spec (the main deliverable)

Permanent visibility: search + view nav never collapse behind a toggle. ⌘B collapse of
`ContextPanelLayout` is **disabled for the outbound desk** (strip mode would hide search);
width stays drag-resizable, min 248px.

1. **Search (top-left anchor).** `SearchField` bound to `useDashboardSearchController` (orders views)
   or `q` (shipped). Autofocus on desk entry and on view switch; `/` focuses from anywhere.
   Scope label under it names the active view ("Search exceptions").
2. **View nav.** Five rows (§2 table) — parent/child names never repeat (NAV NAME law: sidebar
   heading "Outbound", rows as named above; "Pending" is a group label over PO Paired / Pick List).
   Count per row from `desk-counts`.
3. **Contextual filters** — only the active view's facets render:
   - Exceptions: category list (`unpaired_sku`, `bad_address`, `buyer_hold`, `customs`, `inventory_sync`, `fraud`, `carrier_exception`) with counts.
   - PO Paired: link status (`reserved` / received), vendor, ship-by `aging`.
   - Pick List: `aging`, platform, picker (`staff`).
   - Triageable: **Staff** (`AssigneeCombobox`, pick vs pack role), **Stage**, **Needs attention** (`late`/`urgent`/`blocked`/`awaiting_customer`/`cage`), **Routing** (`route`), sort, saved views (`WorkbenchViewsMenu` moved here).
   - Shipped: `DateRangePickerField variant="compact"`, type, carrier, status, exceptions-only.
   Ported from `useToShipChrome` (`buildFilterGroups`) and `ShippedLedgerToolbar` — same URL keys, no second filter model.
4. **Contextual actions** (per view, from registry):
   - Triageable: Add order ▾ (manual / Sync / Import CSV / sample / test), Batch assign pick, Batch assign pack, Ship-by, Paperwork, Export CSV, Past imports.
   - Exceptions: Resolve (top exception), Export CSV.
   - PO Paired / Pick List: Batch assign picker, Export CSV.
   - Shipped: Export CSV.
   Batch actions enable from the live selection (`useTableSelection` scope) and show the selected count.
   Row-level density/zoom/page-size/fullscreen controls move to a single `⋯ Display` menu at the sidebar
   foot (one primary CTA rule, SURFACE_LAW §6).

## 4 · Motion (motion.dev only — `motion/react` + Motion+ `motion-plus`)

Phase 0 of the motion work: **uninstall `framer-motion`** (`pnpm remove framer-motion`; guard already
bans the import, so zero call sites) and add Motion+ exports to the boundary
`src/design-system/motion/plus.ts`: `AnimateNumber`, `Typewriter`, `ScrambleText`, `Cursor`,
`useMagneticPull` from `motion-plus/react`, and `AnimateActivity` from `motion-plus/animate-activity`.
`plus.ts` stays off the main barrel (bundle altitude). Desktop-desk wrappers in
`src/design-system/components/` keep the "feature code never imports motion-plus" rule.

| Sidebar moment | API | Settings |
|---|---|---|
| View counts tick on refetch / realtime | **Motion+ `AnimateNumber`** (via `AnimatedStat`), `trend` so rising queues spin up | `springSnappy`, tabular-nums |
| Active view pill glides between rows | `motion.div layoutId="desk-view-pill"` in `LayoutGroup` | `springArmedTrack`, no bounce |
| Facet block swaps per view, state preserved when you come back | **Motion+ `AnimateActivity`** (`mode` = visible/hidden per view, `layoutMode="pop"`) over React 19.2 `<Activity>` — filters of an inactive view keep their draft/combobox state | enter fade + 8px rise, exit fade |
| Active-view heading on switch | **Motion+ `ScrambleText`** on the view title only (one line, ≤250ms) | disabled under reduced motion |
| Search placeholder cycles example queries ("orders stuck > 2 days", "unpaired eBay SKUs") | **Motion+ `Typewriter`** in the placeholder layer, pauses on focus / any input | `speed="fast"` |
| Action buttons pull toward the pointer | **Motion+ `useMagneticPull`** on sidebar action buttons only (not rows — dense list must not wobble) | pull 0.15 |
| Filter chips add/remove | `AnimatePresence mode="popLayout"` + `layout` | `fadeInstant` |
| Saved views reorder | `Reorder.Group` / `Reorder.Item` | `springSnappy` |
| Drawer open/close | `AnimatePresence` + `motion.aside` `transform` translateX (WAAPI path) | `framerTransition.detailStackOverlayMount` |

Excluded, with reason: Motion+ `AnimateView` (needs React ViewTransition ≥19.3; repo is 19.2.1),
`Cursor` replacement pointer (hides the system cursor on a dense data desk), `Carousel`/`Ticker`
(no content fit). Every animation respects `ReducedMotionProvider`. `ds_critique` +
Motion audit (MotionScore) on each new file before merge.

Note: the Motion+ MCP (`search-motion-source`) is not connected in this session; example source for
the paid demos (number-trend, typewriter-change-content, cursor-magnetic) needs it signed in. The
package APIs above are verified from `node_modules/motion-plus/dist/*.d.ts`.

## 5 · Phases (each ends green on `pnpm verify:fast`)

1. **Shell.** Retire `railless` for `outbound` (`sidebar-navigation.ts:1657` + comment block 598-627);
   `DeskSidebar`/`DeskFeed`/`DeskInspectDrawer` scaffolds mounted; outbound opts out of ⌘B strip.
   `desk-views.ts` registry + unit tests (URL ↔ view ↔ params round trip).
2. **Strip.** Remove `data-table-toolbar` from `OutboundOrdersLedger`, `ShippedLedgerToolbar` mount,
   exceptions category `<nav>`, `DeskPageChrome` tabs/action slot for outbound, `DeskRecordPlane` usage.
   Delete what becomes dead (`OutboundSidebarPanel` old body, `ShippingSidebarPanel`/
   `DashboardOrdersContextPanel` if unrouted — confirm with LSP references first).
   `desk-surface-guard` (in `verify:fast`) pins the desk law and debt counters (rail 11 · record-plane 0);
   update its law with this change — a left rail on the outbound desk is the new rule, not new debt.
3. **Port.** Search, facets, sort, saved views, display menu, actions into the sidebar sections.
   `open` record param cutover. `pair=po|pick` predicates + `desk-counts` route (`new-route` skill).
4. **Routing gate.** Playwright spec at `:3050` per §2; do not start Phase 5 until green.
5. **Drawer.** `DeskInspectDrawer` via `DetailStackRailRegistrar id="outbound:record" push`,
   J/K walk, Esc close, reads `open`.
6. **Motion.** §4 table, framer-motion removal, `plus.ts` exports, MotionScore audit.
7. **Proof.** Screenshots of all five views at `:3050`, `pnpm verify`, `ds_critique` per new file.

## 6 · Assistant in the main worktree (`~/Projects/cycleforge-app`) — acknowledged, fix after the desk

Symptom: engaging the assistant slides it to the left edge and the composer to the bottom-left.
Cause (scouted):
- `src/components/session/use-focus-wake.ts:59-75` — any 24px pointer travel, click, key or wheel
  flips calm → focus.
- `SessionSurface.tsx:108-114` — on wake the chat column goes `shrink-0` at 520px
  (`cf.session.chat-pane.width`) and `MissionPane` mounts `flex-1` on the right → column jumps left.
- `AgentSessionPanel.tsx:689-697` — composer dock drops `mx-auto my-auto` and has `layout` +
  `springConcierge` → Motion tweens it to the bottom-left.
- "Does everything at once": wake fires `useOperatorPulse` → `/api/home-board` running 6 tools
  sequentially, `TriageLedger`, `MissionPane` Ably feed, clipboard CSV sniffing; 63 tools wired.

Fix (per reinstated T15 / D2): composer stays **fixed centre** in both states (no `layout` on the
dock; centre column keeps `mx-auto` at a prose clamp); wake only on explicit engagement (focus in
composer / ⌘J), not pointer travel; transcript grows above the fixed composer; `MissionPane` becomes
an on-demand right detail, not an auto-mount; home-board tools load lazily per tile, parallelised.

## 7 · AI-first rule migration (done in this change, docs)

Rewritten to approval-first + per-automation auto-approve: `00-endgame.md` D2 (AI-centre reinstated),
D7, §5 verb table (refunds, listing edits, location moves, sends all AI verbs); `LAWS.md` T15, T28;
`00-endgame-contradictions.md`; `07-configurability.md` three commitments;
`ai-automation-opportunities-plan.md` §6; `design-system/BRIEF.md` + `NEXT-PROMPTS.md`;
`warehouse-os/HANDOFF-*` supersession notes. (`docs/todo/` is deleted in the working tree; not restored.)

Code that still encodes the old leash (next change, after the desk):
- `src/lib/surfaces/registry.ts:254` `MutationTrustClass` — add org setting
  `assistant.autoApprove.<mutationKind>` (settings registry) read in
  `applyAgentMutation`; `review` kinds apply immediately when enabled; ledger keeps `actor_kind:'agent'`.
- Register the new kinds: `order.refund`, `listing.edit`, `location.move`, `customer.message.send`,
  `price.change` (approval-first default).
- Settings UI: per-automation Auto-approve toggles with `getMutationTrustStats` acceptance rate beside each.
- `SupportTicketDetail.tsx:65,253` "no AI panel" on embedded rails → render the assistant panel.
- `industrial-translation-law.ts:306` purple exception text → drop the "not a generic AI decoration" clause.
- `ai-column-mapping.test.ts:69` "never overrides a deterministic mapping" → AI suggestion may
  override, surfaced approval-first in the mapping panel.
- D10 in DDL: release notes (`src/data/release-notes.json:381`) record `location_scan_source`
  CHECK-limited to scanner/camera on the unit↔location spine. That migration is not in this lane;
  when it lands, a follow-up migration (`db-migration-author`) adds `agent` so approved AI location
  moves can write.
- Stale descriptions of that enforcement: `warehouse-os/HANDOFF-ux-overhaul.md:94`,
  `HANDOFF-orders-first.md:111` ("D10-enforced three deep") — update when the code gate changes.
- Kept, and why: synchronous compiled scan runtime (`compile-grammar.ts`, p95 <150ms test) — latency,
  not policy; the AI authors the grammar. `eslint.config.mjs:189-198` single AI env reader — it routes
  AI through `resolveOrgAiConfig`, it does not limit it.

## 8 · After the foundation (AI features, postponed)

Sidebar "Ask about this view" composer row (StationComposerHost, dumb-station config) under search;
AI-proposed batch assignments as approval-first proposals in the Triageable view; `Typewriter` for
streamed drawer summaries.
