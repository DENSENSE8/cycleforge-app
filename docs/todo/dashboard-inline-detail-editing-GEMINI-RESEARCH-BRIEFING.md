# Research briefing — table → detail interaction model: overlay+scrim vs. contextual push/squeeze inline editing (Dashboard only)

**For:** Gemini Pro (deep research)
**From:** Cycle Forge engineering
**Date:** 2026-07-28
**Scope:** `/dashboard` only. Do not generalize to station benches, `/o/[orderId]`, or the receiving Unbox workspace except where noted as a precedent.
**Deliverable:** (a) the 2026 industry standard for how a dense ops data-grid opens and edits one record — modal slide-over vs. non-modal push/squeeze inspector vs. resizable split vs. in-row expansion — benchmarked against named products with citations; (b) a reconciled, implementable target for *this* codebase given §2–§7; (c) a **per-table action matrix** answering "what actions can I put on each dashboard table," placed across the four action planes defined in §5.

---

## 0. How to use this brief

You do **not** have the codebase. Everything needed is measured and embedded here: current geometry, motion, a11y semantics, the editing that already exists inside the table, the mutation surface available, and the arithmetic that decides whether a push layout even fits.

Answer **three separate questions** — do not merge them:

1. **What is industry standard in 2026?** How do comparable products transition from a dense row grid to editing one record? Named examples, cited sources, explicit "dominant pattern" calls. Include the modality question (does a scrim belong here at all?) and what has changed recently.
2. **What is right for *this* codebase?** Reconcile against §2–§7. Where the standard collides with a house law or with the width arithmetic in §6, name the collision and pick a side. A defended deviation beats a generic answer.
3. **What actions belong on each dashboard table, in which plane?** §5 gives the current action inventory and the full mutation surface that exists but is unwired. Produce a matrix, not a wish list.

Assume the reader is the engineer implementing it this week, alone.

---

## 1. Product context

**Cycle Forge** is multi-tenant reseller-operations SaaS for used-goods resellers (electronics refurb/resale is the dogfood tenant). Inventory is **serialized** — individual physical units with serials, condition grades, test verdicts, photo evidence — sold across eBay, Amazon/FBA, walk-in/local pickup and others.

UI identity is **Kinetic Ledger**: data-first, dense, state-colored, scan-aware. Stated bias: **legible throughput over document calm** — Linear/Carbon/Stripe-Dashboard chrome discipline, not a whitespace-heavy document product.

Every UI region is classified into one of four **region contracts** (enforced house law). **Please use this vocabulary:**

| Contract | Driven by | Job | Selection model | Density |
|---|---|---|---|---|
| **Station** | barcode scanner | act-and-clear | ephemeral, never in URL | `floor` |
| **Workbench** | pointer | pick a record → edit → persist | durable, URL-addressable | `ops` |
| **Monitor** | filters over a stream | observe only, no edit | none (filters only) | `rollup` |
| **Canvas** | pan/zoom/focus | reshape a definition (draft→publish) | durable focus in URL | `studio` |

`/dashboard` is a **Workbench** region with a **Monitor** sub-region (the KPI strip). Existing Workbench law already says: *the collection map does not animate; only the focus surface crossfades.* That law was written for a right pane that **overlays**. This brief asks whether the focus surface should instead **displace** the map.

**The complaint driving this brief, in the user's words:** the details panel currently opens from the right and darkens the background. Would it be better as a *contextual* display — slide in and **push the layout over** — so the operator edits in place, in context with the table selection, rather than under a scrim? And per table, what contextual actions should exist?

---

## 2. Current implementation — measured

### 2.1 The desktop shell

```
ResponsiveLayout (desktop branch)
└── row (flex, overflow-hidden)
    ├── DashboardSidebar   ← permanent aside, hardcoded w-[360px], collapsible
    │                        (collapse toggle in GlobalHeader; left-edge hover
    │                         peek re-opens after ~2s when collapsed)
    └── content column
        ├── GlobalHeader   ← 40px band
        └── <main>         ← appContentShellClass: flex min-h-0 min-w-0 flex-1
                             flex-col overflow-hidden  (square, borderless)
```

Inside `<main>`, the dashboard body is:

```
DashboardScrollShell
├── chrome slot        ← NON-scrolling sibling at z-header(40): lifecycle tabs
│                        + filters. Deliberately outside the scroll port so the
│                        only sticky layer inside the port is the grid header.
└── scroll body (overflow-y-auto, overflow-x-clip)
    └── WORKBENCH_BODY_COLUMN = mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8
        ├── OutboundKpiStrip   (scrolls away)
        └── the framed ops grid (TABLE_SURFACE_CLIP_CLASS: rounded-xl, raised,
            overflow-hidden; virtualized against the shell's scroll ref)
```

### 2.2 The details panel — geometry, modality, motion

The dashboard page renders `<DashboardOrderDetails>`, which mounts either `UnshippedDetailsPanel` (queue context) or `ShippedDetailsPanel` — both code-split, `ssr: false`, loaded on first row click. Neither owns geometry. Each registers itself as an occupant of **one global slot**:

- **`RightRailHost`** is documented as "the ONE owner of the right-edge slot." Panels register a node + priority in a module store (`RIGHT_RAIL_PRIORITY.detail = 100` beats `assistant = 10`); the host renders exactly the top occupant inside one `AnimatePresence mode="wait"` keyed on occupant id.
- **Why it exists (verbatim rationale in code):** the assistant dock and every `open<Kind>Id` slide-over were each an independent `fixed right-0 w-[420px] z-panel` element; at equal z-index paint order decided the winner, so the globally-mounted assistant always covered a detail panel the page had just opened. The store made the right rail *one region*.

Measured geometry and behavior of that slot:

| Property | Value |
|---|---|
| Positioning | `position: fixed` |
| Width | `min(420px, calc(100vw - 24px))` |
| Insets | 12px top/right/bottom — a floating inset card, **above** the 40px global header, not below it |
| Surface | `rounded-2xl border border-border-soft bg-surface-card shadow-2xl shadow-scrim/40` |
| a11y | `role="dialog"` **`aria-modal="true"`** |
| Scroll | `useBodyScrollLock(true)` while open (non-assistant occupants) |
| Dismiss | `useEscapeClose` + backdrop click |
| Backdrop | `bg-scrim/55 backdrop-blur-[2px]` at `z-panelBackdrop(99)`; elevated variant `bg-scrim/70 backdrop-blur-md` at `z-detailStackBackdrop(150)` |
| Bands | `panel:100` / `detailStack:160`; raw `z-[NNN]` is banned by house law |
| Motion | `framerPresence.detailStackOverlay` = opacity + `x: 48` in/out; `0.4s`, `motionBezier.layout`; routed through `useMotionPresence`/`useMotionTransition` so reduced motion collapses to opacity |

So today the panel is **modal in every technical sense**: it declares `aria-modal`, locks page scroll, dims and blurs the whole app including the header and the sidebar, and traps dismissal on Escape.

### 2.3 Who else occupies the same slot

Not a dashboard-local decision. Current registrants: assistant dock (⌘J, full-height flush variant, no backdrop), shipped/unshipped order details, FBA board detail, repair details, SKU detail, incoming details (elevated), receiving box + manifest workbench panels, unfound-queue details, support context detail, new-order entry overlay, plus a URL-driven yield claim that suppresses the assistant whenever any `open<Kind>Id` param is present. **Any change to modality or positioning is a change to a shared host with ~11 occupants mid-strangler-migration.**

### 2.4 Selection + open semantics

- **Selection gutter is always on.** `useTableSelectMode` owns a checked-id set under scope `dashboard-orders`, with shift-click range extension and a header select-all. The "select mode" flag only gates visible pencil chrome — checkboxes are live regardless.
- **Row-body click opens the detail** (`useOrdersQueueSelection`); clicking the same row again **closes** it. Selection (checkbox) and open-detail (row click) are therefore two independent, simultaneous states on the same row.
- **Durable selection is `?openOrderId=<id>`** written with `router.replace`, plus a `sessionStorage` snapshot (`dashboard:selected-order:v2`) so a reload can repaint the panel before the fetch lands. The hook carries three separate race guards (pending-id ref, ignored-close ref, cancelled-fetch flag) documented as fixes for "panel opens, closes, reopens" jitter.
- **Cross-pane events**: `open-shipped-details` / `close-shipped-details` / `navigate-shipped-details` (up/down through the displayed rows) on `window`.
- **A second display mode is already half-modeled:** `localStorage` key `dashboard:details-open-behavior` with values `'auto' | 'side_panel'`. In `side_panel` mode the hook *suppresses* automatic queue-click expansion. There is no UI to set it and no second layout to switch to.

### 2.5 What the panel contains

`ShippedDetailsPanel` = header + tab-dispatched body + footer editor dock.

- **Header:** package badge, click-to-copy order #, up/down stack navigation, "open full page" (`/o/[id]`), and a quick-action bar in a fixed canonical order: **urgent → notes → out of stock → mark shipped**.
- **Sections (tabs):** `shipping · product · timeline · customer · documents · warranty · conversation`. In the slide-over, `customer` and `warranty` are dropped and replaced by quick-link rows; the full page keeps them.
- **Editable in-panel:** order number, item number, tracking number, ship-by date (blur-commit), notes, out-of-stock, mark-shipped form, urgent toggle, tester/packer assignment card, delete.
- All of it commits through the same `useOrderAssignment` mutation waist the table cells use.

---

## 3. The tables in scope

`/dashboard` has three modes (`?mode=`) and, within outbound, five lifecycle tabs (`?view=`):

| Mode / tab | Component | Grid family | Selection | Detail target |
|---|---|---|---|---|
| `shipping` › **Pending** (default) | `UnshippedTable` → `OrdersGridView` | virtualized `LedgerGrid` | always-on | order panel (queue context) |
| `shipping` › **Tested** | same, `fulfillmentLane='tested'` — swaps to tester + tested-at column set | same | always-on | order panel |
| `shipping` › **Packed** | `PackedOrdersTable` | same | always-on | order panel (shipped context) |
| `shipping` › **Shipped** | `DashboardShippedTable` | same | always-on | order panel (shipped context) |
| `shipping` › **FBA** | `FbaShipmentsTable` | own board | **opts out** | FBA board detail panel |
| `inbound` › **Triage / Unbox** | `ReceivingLinesTable` | virtualized, own selection mechanism | gated edit-mode | incoming details (elevated band) |
| `search` | `DashboardSearchView` | results list | none | separate read-only detail shell |

Pending / Tested / Packed / Shipped all render **one shared grid component** and share **one persisted column layout** under `tableId='orders'`. So a per-table action answer must say explicitly whether "per table" means per lifecycle tab (four surfaces, one component) or per grid family.

---

## 4. Contextual editing already exists **inside** the table

This matters: the request is partly for something already half-built. Do not recommend it as new.

The Pending grid row (`gridSkin`, desktop, non-mobile) already implements a Sheets-style in-cell editing contract:

- **Editable fields today:** `title | qty | date | condition | note | link` (product title, quantity, ship-by date, condition grade, note, listing link).
- **Editors:** `LedgerCellEditor` for title/qty; a `Calendar` popover for ship-by; a condition-grade popover; `CellTextEditPopover` for note and listing link. All portal to `document.body` through the house `Popover` (never clipped by the virtualized scrollport), and all swallow clicks so the row underneath doesn't open the panel.
- **Keyboard contract (documented in-file):** Enter commits (Shift+Enter newline in multiline), Esc cancels and reverts, outside-click/blur commits — "never silently drop a draft." Type-to-replace seeds the editor with the keystroke.
- **Row hover controls:** edit-listing-link, open-order (expand) affordances.
- **Single-selected row info menu:** appears when exactly one row is checked — **Notes · Out of stock · Details**, anchored to a chevron that stays in the DOM at all times so geometry never shifts with selection.
- **Lane-specific cell action:** `AddTrackingPopover` in the labels lane's tracking cell.
- **All commits route through one waist:** `useOrderAssignment` (optimistic patch + cache bust). Editors never add their own mutation hooks.

So the table already supports: click → edit → commit, without opening the panel, for six fields. The open question is not *whether* contextual editing exists, but **where the boundary is** between the in-cell plane and the record plane — and whether the record plane should stop being modal.

---

## 5. The four action planes + the current action inventory

Any answer to "what actions per table" must place each action in one of four planes:

| Plane | Mechanism today | Currently used for |
|---|---|---|
| **(i) In-cell** | cell-anchored popover / inline editor | title, qty, ship-by, condition, note, listing link, add-tracking (labels lane) |
| **(ii) Row-scoped** | hover controls + single-selected info menu | edit link, open order, notes, out-of-stock, details |
| **(iii) Multi-select** | `ContextualSelectionBar` (scope `dashboard-orders`, `pinToViewport`) | see below |
| **(iv) Record** | the details panel / `/o/[id]` | urgent, notes, OOS, mark shipped, tracking, item number, ship-by, assignment, delete, docs, timeline, warranty, conversation |

**There is no right-click context menu anywhere in the dashboard grid family.** Zero `ContextMenu` usage in `src/components/dashboard`, the grid design-system folder, or unshipped. The primitive exists in the design system and is unused here.

**Current multi-select bar contents (plane iii), verbatim:**

| Action | State |
|---|---|
| Copy details | real (clipboard, order/SKU/tracking/serial) |
| Print labels | real (lazy-loads the barcode engine) |
| Send to staff | **stub** — `toast('Send to staff — coming next')` |
| Send to phone | **stub** — `toast('Send to phone — coming next')` |
| Delete | real, confirm-then-commit; branches order vs. packer-log row |

Two of five are placeholders. Selection is cleared on every lifecycle-tab flip.

**Mutation surface that exists and is NOT exposed in any plane.** This is the raw material for the matrix:

- `useOrderAssignment` payload accepts: `testerId`, `packerId`, `testerName`, `packerName`, `shipByDate`, `outOfStock` / `isOutOfStock`, `notes`, `isUrgent`, `shippingTrackingNumber`, `itemNumber`, `condition`, `quantity`, `productTitle`, `sku`, `skuCatalogId`, `performedByStaffId` — and accepts `orderIds[]`, i.e. **it is already a bulk-capable endpoint**.
- Routes under `/api/orders`: `assign`, `batch`, `delete`, `verify`, `start`, `skip`, `set-item-number`, `import-csv`, `missing-parts`, `integrity-check`, `queue-counts`, `check-shipped`, `next`, `recent`, `lookup/[orderId]`, `backfill/ebay`, `backfill/ecwid`.
- Per-order: `[id]` (PATCH), `[id]/tracking`, `[id]/allocate`, `[id]/release`, `[id]/substitute`, `[id]/pick-tasks`, `[id]/pack-checklist`, `[id]/packing-checks`, `[id]/amendments`, `[id]/documents` (+ `/fetch`), `[id]/timeline`, `[id]/amazon-refresh`.

So actions like *assign tester/packer to N rows*, *set urgent on N rows*, *set ship-by on N rows*, *allocate/release units*, *substitute*, *re-import from channel*, *print packing slip*, *open documents* are all **API-available and UI-absent**.

---

## 6. The arithmetic — does a push layout fit? (the central constraint)

The grid is not a `<table>`. Geometry is a CSS-var-driven `grid-template-columns` of per-column `minmax()` strings; the scrollport min content width is the **sum of column tracks**, and horizontal scroll activates below it.

**Pending (default) column set:** `select 2rem + title minmax(12rem,1fr) + ship-by 4.5 + age 3 + qty 2.75 + cond 5.5 + order 3.75 + tracking 3.75` = **37.25rem ≈ 596px** minimum.

**Tested lane column set:** adds `tester 6rem` + `tested-at 10rem` = **53.25rem ≈ 852px** minimum.

There is also a **viewport priority collapse** (ephemeral, never persisted) keyed on the *scrollport* width: below **720px** hide Ship-by; below **640px** also hide Qty; below **560px** also hide Cond.

Now the push math. Content width = `viewport − sidebar(360) − gutters(64 at lg)`. A pushed panel takes 420px + a 12px gap = 432px.

| Viewport | Sidebar | Table scrollport today | After a 432px push | Result |
|---|---|---|---|---|
| 1440 | open (360) | 1016px | **584px** | below the 596px Pending minimum → **h-scroll**, and *all three* collapse breakpoints fire (Ship-by, Qty, Cond hidden). Tested lane (852) is far past h-scroll. |
| 1440 | collapsed | 1376px | 944px | Pending fine; Tested fits (944 > 852) with ~92px of slack |
| 1920 | open (360) | 1496px | 1064px | both fit |
| 1280 | open (360) | 856px | 424px | unusable — below every breakpoint |

**Conclusion to react to, not to accept uncritically:** at the single most common operator viewport (1440 with the sidebar open) a naive 420px push **degrades the table below its own minimum**, silently hides three columns via the collapse rule, and turns the grid into a horizontally-scrolling strip. Any push recommendation must state what gives way: sidebar auto-collapse, a narrower inspector, a resizable inspector with a persisted width, column collapse as an accepted trade, or a breakpoint below which push falls back to overlay.

---

## 7. Constraints, conflicts, and precedents your answer must reconcile

### 7.1 House laws (ratified; overturn only explicitly and with reasoning)

1. **One owner of the right-edge slot.** `RightRailHost` renders exactly one occupant. A second, in-flow, non-modal region would either be a second slot owner (violating the law that produced the store) or a new mode of the same host.
2. **Motion law: opacity + transform only; never animate layout (`width` / `height` / `padding`).** Height changes go through `grid-template-rows`. **A push/squeeze animation is by definition a layout animation of the content column's width.** This is a direct, first-class conflict — name how you resolve it (transform-based translate of a fixed-width content column? `grid-template-columns` transition? no animation at all, just an instant reflow? animate the panel in and let the table reflow un-animated?).
3. **Crossfade only the focus surface; the collection map never animates.** A squeeze *does* move the map.
4. **One sticky layer per scroll port.** The chrome band is deliberately a non-scrolling sibling so day-band headers dock at `top-0` with no offset math. A push inspector must not reintroduce offset math.
5. **No raw `z-[NNN]`** — named bands only. **No page-local hex** — semantic tokens only. **No page-local fork of a shared primitive** — compose, or grow the primitive.
6. **Degrade-not-fail:** a failing sub-resource renders empty, never 500s the record.
7. **`prefers-reduced-motion` is mandatory**, routed through the motion hooks.
8. **Presentation kinds resolve via SoT modules** (dates, condition labels/tones, platform labels, typed identifier chips). Views stay dumb.
9. **Multi-tenant:** every query org-scoped; vendor names only as runtime provider labels or deep links.

### 7.2 The in-house contradiction you must address

One day before this brief, a sibling briefing (`docs/todo/sidebar-nav-slideout-BRIEFING.md`, 2026-07-27) asked for the **opposite move on the left**: *"kill the 'push' layout, adopt overlay + floating card"* for the sidebar navigation and recents rail. Its complaint was that a resident nav block pushing the recents rail reflows the operator's context.

So the product is simultaneously being asked to (a) remove a push interaction on the left and (b) add one on the right. Either that is inconsistent, or there is a principle that distinguishes them (e.g. *navigators overlay, inspectors displace*; or *transient overlays, durable pushes*). **State the principle explicitly or tell us one of the two requests is wrong.**

### 7.3 In-repo precedents (reuse or reject, with reasons)

| Precedent | Shape | Relevance |
|---|---|---|
| `ZohoSplitPane` | `fixed right-0` aside, draggable **left edge**, width persisted to `localStorage` via `useHorizontalEdgeResize`, min 320 / default 560 | proves the resize + persist mechanics exist; still overlays rather than pushes |
| `RightPaneOverlay` / `DocumentSlideOver` | resizable right pane with `anchor: 'pane' \| 'viewport'` and an **optional** backdrop | proves the house already has a non-modal, pane-anchored, resizable slide-over primitive |
| `ReceivingRightPane` | keeps the collection table **mounted at `display:none`** and crossfades a workspace over it (preserving react-query cache, in-flight search, scroll position, and not re-firing first-mount effects) | the house full-swap master-detail recipe; the alternative to both overlay and push |
| Station Workbench | identity bar above a 720px column with a terminal dock | the house "full-focus record editing" shape, for comparison |

### 7.4 Technical risks specific to a squeeze

- **Virtualization re-measure.** The grid virtualizes against the page scroll ref, publishes its header height via `ResizeObserver` as a CSS var, has a split-x mode that syncs a horizontal offset var, and computes sticky `left` offsets for frozen columns. Animating the container width re-measures all of that every frame.
- **Modality unwind.** Dropping `aria-modal`, the body scroll lock, and the backdrop changes the focus contract: the table stays focusable and scrollable while the inspector is open. Escape currently closes the panel — but Escape *inside a cell editor* reverts a draft. Two Escape owners, one key.
- **Sidebar interaction.** The sidebar already has a collapse toggle plus a left-edge hover-peek that re-opens it after ~2s. If push auto-collapses the sidebar, the peek can re-open it and re-squeeze the table.
- **E2E surface.** Four specs reference `openOrderId` / the panel (`order-full-page`, `order-tracking-edit`, `dashboard-search-exact-open`, `dashboard-search-order-detail`).
- **Shared-host blast radius.** §2.3 — ~11 occupants.

---

## 8. Honest diagnosis (ours, for you to challenge)

1. **The panel is modal but the job is not.** Reading and lightly editing one order while scanning a queue is a non-modal, comparison-friendly task. `aria-modal` + scroll lock + full-app blur is the semantics of a decision dialog, not an inspector.
2. **The scrim actively fights the job.** The operator's context — the other rows, the KPI strip, the lifecycle tabs — is exactly what gets dimmed and blurred.
3. **Two editing planes already exist and their boundary is undocumented.** Ship-by, notes, condition, qty, title, link are editable *both* in-cell *and* in the panel. Tracking is editable in the panel and (in one lane only) in a cell. Nothing states which plane owns which field.
4. **The record plane is over-loaded.** Seven tabs including conversation and warranty ride in a 420px inset card that also claims the whole viewport's attention.
5. **The multi-select plane is under-loaded and partly fake.** Five actions, two of them toasts, on top of a mutation waist that already accepts `orderIds[]` and could do assignment, urgency, ship-by, and OOS in bulk.
6. **A push layout does not fit at 1440 with the sidebar open** (§6). Any "yes, push it" answer that ignores that arithmetic is not implementable.
7. **The open/close state machine is fragile.** Three race guards exist purely to stop the panel flickering; adding a second layout mode multiplies those paths unless the state model is simplified first.

---

## 9. Questions to answer

### A. Industry standard (2026), with citations

1. **The four candidate models.** For a dense operator grid, what is the 2026 dominant pattern: (i) modal slide-over + scrim, (ii) non-modal push/squeeze inspector, (iii) resizable split pane with persisted width, (iv) in-row expansion (detail row / accordion), (v) route to a full record page? Benchmark named products and say what each actually does **and whether it dims**: Airtable expanded record, Notion database peek/side-peek/center-peek, Linear issue view, Height, Asana task pane, Monday, Jira, Retool table+drawer, Shopify admin, Stripe Dashboard, Salesforce/ServiceNow console, Smartsheet, Excel/Sheets side panes, ShipStation, NetSuite.
2. **When is a scrim correct?** Give the decision rule for modal vs. non-modal inspectors, with the ARIA consequence: `role="dialog" aria-modal="true"` + focus trap + scroll lock vs. a non-modal `complementary`/`region` with no trap. What do WAI-ARIA APG and the mature products actually do for a record inspector? Is a scrim over a *sibling* region ever justified?
3. **Notion's three peek modes** (side peek / center peek / full page) and Airtable's expand-record are the two most-copied conventions. Which one generalizes to an ops queue at `ops` density, and why? Is a user-selectable peek mode a real standard or a symptom of an undecided design?
4. **In-cell vs. inspector: the division of labor.** What is the 2026 convention for which fields are edited in the grid and which require the record surface? Is there a principle (single-value/typed → cell; relational, multi-step, or side-effectful → record)? Cite Airtable/Smartsheet/Notion/AG Grid conventions.
5. **In-row expansion.** Is an expanding detail row still a legitimate pattern for dense ops grids in 2026, or has it lost to side panels? What breaks it (virtualization, keyboard, comparison across rows)?
6. **Selection-driven contextual action bars.** Standard placement (floating bottom bar vs. toolbar transform vs. sticky header), contents, count semantics, undo-vs-confirm for destructive actions, and keyboard access. Where do leaders draw the line between bulk-edit-in-bar and bulk-edit-in-panel?
7. **What does an inspector show for N > 1 selected?** Is a batch-edit inspector (Airtable-ish / Figma-properties-ish "mixed" values) standard in ops software, or do leaders keep the inspector strictly single-record and push multi-record work into the bar?
8. **Right-click context menus in web data grids.** Expected in 2026 or not? If yes, what belongs in one, what must never be *only* there, and what is the required keyboard/AT equivalent?
9. **Space economics.** Minimum comfortable inspector width for a record with ~7 information domains. Do the leaders resize and persist? Do any of them *hide table columns* when a panel opens (and is that considered acceptable or a defect)? What is the standard responsive fallback below which a side inspector becomes a full-screen sheet?
10. **Optimistic edits in a virtualized grid.** 2026 standard for commit semantics (blur-commit vs. explicit save), error recovery, undo toasts, and keeping a row's identity stable when an optimistic edit re-sorts it out from under the cursor.

### B. Recommendation for this codebase

11. **The verdict.** Given §6's arithmetic and §7's laws: keep the overlay (fix its modality instead), adopt push/squeeze, adopt a resizable split, adopt in-row expansion, or a hybrid with an explicit breakpoint? Pick one primary. If the answer is "keep the overlay but drop `aria-modal`, the scroll lock, and the scrim," say so plainly — that is a legitimate answer and it is cheap.
12. **Slot architecture.** If the inspector becomes in-flow, who owns the width — the dashboard page, `DashboardScrollShell`, or a new mode of `RightRailHost`? How does that coexist with the single-owner law (§7.1.1), the assistant dock, and the ~11 other occupants? Is the right answer a *second contract* ("in-flow inspector") that the shared host explicitly does not serve?
13. **Resolve the motion conflict** (§7.1.2) concretely: what animates, what doesn't, and what the reduced-motion form is.
14. **The field boundary.** Draw the line for *this* product: which of `title, qty, ship-by, condition, note, listing link, tracking, item number, order number, urgent, out-of-stock, tester, packer, mark-shipped, delete` belongs in-cell, which row-scoped, which inspector-only. Say what should be **removed** from a plane it currently occupies.
15. **What leaves the inspector.** Of `shipping · product · timeline · customer · documents · warranty · conversation` in a 420px card: what stays in a contextual inspector, what belongs only on `/o/[id]`, and what should be reachable from the table directly?
16. **The per-table action matrix — the main deliverable of part C.** For each surface in §3 (Pending, Tested, Packed, Shipped, FBA, Receiving Triage, Receiving Unbox), give the action set across the four planes of §5, each entry marked:
    - **(a)** buildable today with an existing endpoint (name it from §5),
    - **(b)** needs small wiring,
    - **(c)** blocked (say on what).
    Include lifecycle-appropriateness: an action valid on Pending (assign tester, set ship-by) may be wrong on Shipped. State whether "per table" should mean per lifecycle tab or per grid family, given all four outbound tabs share one component and one persisted column layout.
17. **The two stubs.** "Send to staff" / "Send to phone" — build, rename, or delete? If build, what is the minimum credible version?
18. **Keyboard map.** The station scan hotkey is **F2** (globally claimed by the most recently mounted scan bar) and ⌘K is the global command bar. The grid already owns Enter / Esc / type-to-edit inside cells, and up/down navigate events across rows. Propose the full keymap for open-inspector, close-inspector, next/prev record, commit, revert — with the Escape-ownership conflict (§7.4) resolved.
19. **Phasing.** Order the work so an operator feels the difference in week one, one engineer. Distinguish cheap semantic fixes (drop `aria-modal` / scroll lock / scrim; keep everything else) from structural work (in-flow inspector, resize + persistence, batch inspector, context menus).
20. **What not to do.** An explicit "do not build this yet" list, including anything in this brief you think is a bad idea.

---

## 10. Deliverable format

1. **Industry-standard findings** — organized by question, named products, cited sources, explicit dominant-pattern calls rather than hedged surveys. Where a product's behavior is version-dependent, say which version you checked.
2. **A verdict section** — one primary model chosen for `/dashboard`, with the modality decision (scrim / no scrim, modal / non-modal) stated as a one-line contract.
3. **ASCII wireframes** at `ops` density for the recommended model at 1440 (sidebar open **and** collapsed) and at 1280, showing which columns survive.
4. **The plane-boundary table** — every field from §14 assigned to exactly one primary plane.
5. **The per-table action matrix** (§16) — surface × plane, with a/b/c build tiers and the endpoint named.
6. **A resolution list for §7** — one line per house law you compose with, bend, or overturn, and why.
7. **Phased plan** — week-one wins first, structural work after, with the explicit "not yet" list.
8. **Explicit disagreements** — anywhere the industry standard conflicts with §6's arithmetic or §7's laws, name the conflict and pick a side. Include a straight answer on the left-push/right-push contradiction in §7.2.
