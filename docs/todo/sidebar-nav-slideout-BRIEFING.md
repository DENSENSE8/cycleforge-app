# Briefing — Sidebar navigation & recents rail: kill the "push" layout, adopt overlay + floating card

> **Status: SHIPPED, and the shape changed twice on the way.** §1–§4 are the
> historical record of the problem and the first direction. **§5b is the
> authoritative description of what is actually in the code** — read that first;
> where it disagrees with §4, §5b wins.

**Audience:** Gemini 2.5/3 Pro (external design/architecture review)
**Repo:** `cycleforge-app` (Next.js 16 App Router, React, Tailwind, framer-motion/`motion`, TypeScript)
**Product:** Cycle Forge — multi-tenant reseller-ops SaaS. Warehouse operators work at scan stations
(Unbox / Triage / Testing / Shipping) with a barcode wedge; the left sidebar is their navigator + recent-activity feed.
**Design language:** "Kinetic Ledger" — dense, data-first, state-colored ops UI. Linear-grade calm chrome, not document whitespace.

---

## 0. What we want out of you

1. **Diagnose** the current desktop sidebar architecture (below) — specifically the *layout-push* interaction between the
   nav menu and the recents rail on station routes.
2. Tell us **the 2026 industry-standard fix**: what a mature ops product (Linear, Notion, Figma, Height, Retool,
   Superhuman, Shopify Admin, Vercel dashboard) would do here, and *why* — with the accessibility/motion/perf
   implications named, not just the aesthetic.
3. **Evaluate the direction we already want** (stated in §4) and either endorse it with a concrete component/token plan
   or argue us out of it with something better:
   - the **page navigation becomes a true slide-out overlay** anchored to the left sidebar (a layer, not a resident block), and
   - the **recents list becomes a fully floating, rounded, shadowed card** — not the current "bookmark tab flush against the
     bottom of the viewport".
4. Give us a **staged implementation plan** with explicit risks (scan-focus loss, reduced-motion, z-index band collisions,
   virtualized rail scroll preservation, mobile drawer parity).

Please answer with: (a) verdict, (b) the canonical pattern + named precedents, (c) component/props/token design,
(d) motion + a11y contract, (e) phased plan, (f) what you would *not* do.

---

## 1. The frame — how the desktop shell is assembled

```
ResponsiveLayout (src/components/layout/ResponsiveLayout.tsx)
├── GlobalHeader            ← fixed top band; owns the sidebar collapse toggle
└── row
    ├── DashboardSidebar    ← permanent, w-[360px], desktop only (dynamic import, ssr:false)
    │     └── SidebarShell  (src/components/sidebar/SidebarShell.tsx)
    └── main content (appContentShellClass — flat, square top-left, no border)
```

- Sidebar width is a hardcoded `w-[360px]` in three places (`ResponsiveLayout.tsx:32`, `:78`, `DashboardSidebar`).
- **Mobile** uses a real slide-out drawer already: `drawerVariants { x: '-100%' → 0 }` + spring
  (`ResponsiveLayout.tsx` ~line 110) with a scrim and `useBodyScrollLock`. Desktop has no equivalent.
- Z-index is tokenized (`src/design-system/tokens/z-index.mjs`): `sticky:30, header:40, dropdown:50, panel:100,
  panelBackdrop:99, panelPopover:120, panelOverlay:130, detailStack:160, modal:200 …`. **Raw `z-[NNN]` is banned**
  by house rule; any new overlay must land on a named band.

`SidebarShell` branches on route (`src/components/sidebar/SidebarShell.tsx:57`):

| Branch | Condition | Shape |
|---|---|---|
| **Station column** | `isStationSurfaceRoute(pathname)` && !inDrawer | **two stacked cards** on a gray backdrop |
| **Classic panel** | everything else | one flat panel; nav menus *float* over the body |
| **Mobile drawer** | `inDrawer` | always classic panel |

---

## 2. The nav itself

`src/components/sidebar/master-nav/` — a "master nav" that replaced per-page pill rows.

- `MasterNav.tsx` — container. Reads active page/mode from URL (`useActiveSidebarMode`), navigates via
  `useSidebarModeNav`, tracks MRU jumps (`useRecentModes`, max 3), prefetches route data on row hover
  (`prefetchNavData`).
- `MasterNavHeader.tsx` — the **closed trigger**, a 40px band: `[chevron ▾ | hairline | mode-icon + "name of now" ▾ | MRU chips]`.
  Two independent click targets: left chevron = *all pages* (L1), the label = *this page's modes* (L2).
- `MasterNavDropdown.tsx` — the L1 menu. Groups `Main / Stations / More`, each row expandable to its L2 modes
  (`height: 0 → auto` spring per row). `max-h-[340px] overflow-y-auto`. Has a `flat` prop that strips the card chrome
  (border/radius/fill/shadow) — used only by the docked layout.
- `MasterNavView.tsx` — presentational composite, and **the crux of this briefing**. It has three render paths:

```ts
// MasterNavView.tsx
layout?: 'floating' | 'docked'          // :158
```

  - **`floating` + `renderContext`** (classic panel, non-station routes): the dropdown is
    `absolute inset-x-1 top-[40px] bottom-1 z-dropdown` — it floats *over* the context panel body, inside the sidebar's
    own width. Correct-ish, but scoped to the sidebar rectangle and clipped by it.
  - **`floating`, no context** (design showroom): menu absolutely positioned under the header.
  - **`docked`** (`:273`): the menus render **in normal flow** inside an `AnimatePresence` with
    `initial={{height:0}} → animate={{height:'auto'}}`, wrapped in `overflow-hidden`. **This is the "push".**

---

## 3. The station column — the actual complaint

`src/components/sidebar/station-column.ts` documents the intent verbatim:

```
┌───────────────────────┐  ← flush to top, rounded BOTTOM corners
│  nav (expands down)   │
├───────────────────────┤
│                       │  gray backdrop shows between them
│  recents + scan bar   │
│  (pushed down as nav  │
│   expands)            │
└───────────────────────┘  ← flush to bottom, rounded TOP corners
```

Tokens:

```ts
STATION_COLUMN_CLASS        = 'flex h-full w-full flex-col gap-1 overflow-hidden px-2' + appCanvasClass
STATION_COLUMN_CARD_TOP     = base + 'shrink-0 rounded-b-2xl border-t-0'     // nav card
STATION_COLUMN_CARD_BOTTOM  = base + 'min-h-0 flex-1 rounded-t-2xl border-b-0' // recents + scan bar
// base: border border-border-soft bg-surface-card elevationClass('overlay')
```

Consumed at `SidebarShell.tsx:59-79` with `<MasterNav layout="docked" />` in the top card and
`<SidebarContextPanel />` (the per-route panel — for `/receiving` that's `ReceivingSidebarPanel`) in the bottom card.

### The three problems, stated precisely

1. **Opening navigation reflows the work surface.** Nav menu open → top card grows (`height: auto`) → the bottom card,
   a flex sibling with `flex-1 min-h-0`, **shrinks and is pushed down**. The operator's recent-activity rail and the
   focus-locked scan bar physically move while they are mid-task. Closing pushes everything back. This is a
   **layout animation on the primary work surface** — the exact thing our own motion law bans everywhere else
   (`.claude/rules/display/motion-crossfade.md`: opacity + transform only; never animate layout on a work surface).
   It survives here only because `height:auto` is the sanctioned exception for *low-frequency* collapse — but a nav
   menu on a station bench is not low-frequency, and the thing being resized is not the thing being expanded.
2. **The recents card reads as a bottom bookmark, not a panel.** `rounded-t-2xl border-b-0` flush to the viewport bottom.
   It has `elevationClass('overlay')` shadow but is visually welded to the frame edge, so the shadow does nothing on the
   one edge that's on screen. It looks like a tab clipped by the window, not a floating surface.
3. **Two competing menu grammars.** `floating` (non-station routes: menu overlays the panel body) vs `docked`
   (station routes: menu pushes). Same nav, two spatial models, two mental models — plus a third on mobile (real drawer).
   `MasterNavDropdown` carries a `flat` prop that exists *only* to make the docked variant not look like nested cards.

### Related: the mode toggle inside the sidebar body

Below the nav, receiving-family panels also carry mode/sub-view pill rows:
`ReceivingModeSwitcher.tsx` (`HorizontalButtonSlider variant="segmented"` in `sidebarHeaderPillRowClass`) and
`SidebarNavOverlaySlider.tsx` (`sticky top-0 z-10`, transparent band so active-pill shadows aren't clipped).
`ReceivingModeSwitcher` is **suppressed** when master nav is enabled (`useMasterNavEnabled()`), because the master nav
owns L2. So on station routes there can be up to **three** nav affordances competing: master-nav L1 chevron,
master-nav L2 label dropdown, and a sticky in-body sub-view slider. Worth an opinion on the information architecture,
not just the animation.

### Rail internals (do not break these)

`SidebarRailShell.tsx` / `rail-shell/useSidebarRail.ts` / `receiving/RecentActivityRailBase.tsx` own: fetch + react-query
key, optimistic update/delete listeners, pinning, `topCount` vs `limit`, collapse grouping, keyboard nav over
`visibleIndices`, hover-preview popover (portal-positioned), stagger reveal. Any reshaping must keep the rail
**mounted** (house rule: display-toggle, never unmount — cache + scroll + first-mount effects).

---

## 4. The direction we want (validate or replace)

1. **Navigation becomes a proper slide-out overlay from the left sidebar.**
   Not an in-flow block that grows. A layer that slides/fades in over (or beside) the sidebar column, dismissed by
   Escape / outside click / navigation, leaving the recents rail and scan bar **completely static underneath**.
   Open questions for you: does it overlay *within* the 360px column (like today's `floating` path) or does it
   **push out over the content area** as a wider panel (Linear-style command surface / Notion sidebar flyout)?
   Should it be `role="dialog"` with focus trap, or a `role="menu"` popover? What about the scan-focus watchdog — the
   station scan bar auto-refocuses and owns an F2 global hotkey; a focus-trapping overlay must return focus cleanly.
2. **The recents list becomes a genuinely floating card** — all four corners rounded, real gutter on every side
   (including the bottom), full ambient+key shadow, sitting on the canvas backdrop. Kill `rounded-t-2xl border-b-0`
   flush-to-bottom "bookmark" geometry.
3. **One nav grammar** across station routes, non-station routes, and the mobile drawer — i.e. delete the
   `layout: 'docked'` path and the `flat` prop it forced onto `MasterNavDropdown`, if you agree.

Constraints we will not relax:
- Color/spacing/elevation/z-index/focus only from design-system tokens (`design-system/tokens/*`); no page-local hex,
  no raw `z-[NNN]`, no arbitrary px spacing.
- Motion routes through `useMotionTransition` / `useMotionPresence` so `prefers-reduced-motion` collapses to opacity.
- The scan bar is the operator's primary input; it must never move, never lose focus, and never be covered while a
  scan session is active.
- The rail stays mounted (react-query cache + scroll position + optimistic listeners).

---

## 5. Questions we specifically want answered

1. **Overlay vs. push vs. resize** — for a persistent-navigator ops app in 2026, what is the canonical treatment when
   navigation is invoked from inside a permanent sidebar? Name the precedents and the rule (e.g. "navigation is a
   transient layer; only the content region may resize, and only on an explicit collapse action").
2. Should the L1 page menu and the L2 mode menu be **the same surface** (one slide-out with two levels) or stay two
   distinct affordances in the 40px header band? Is the MRU chip cluster earning its keep?
3. **Geometry of a floating rail card** — gutters, radius, elevation role, and how it should behave against the
   viewport bottom on short screens (does it scroll-clip, or does the card own its own scrollport with the shadow
   pinned?).
4. **Motion spec** — enter/exit for a left slide-out over a dense ops surface: transform-only? scrim or no scrim
   (there is real state behind it)? duration? and the reduced-motion fallback.
5. **Accessibility** — modal vs non-modal overlay; where focus goes on open and on close; how this coexists with a
   focus-locked barcode input and an F2 hotkey that force-refocuses the scan bar.
6. **Anything you'd flag as a latent bug** in the current architecture (e.g. `MasterNavView`'s `absolute inset-x-1
   top-[40px] bottom-1` dropdown depending on the sidebar being the offset parent; two `sticky` layers in one
   scrollport; `overflow-hidden` on `STATION_COLUMN_CLASS` clipping any overlay that tries to escape the column).

---

## 5b. What actually shipped (2026-07-28)

The work ran in three waves. The first two followed the review's plan; the third
replaced it, because the plan solved the wrong half of the problem.

### Wave 1 — float the rail, portal the menus (plan Phases 1–4)

One correction to the review: **Phases 2 and 3 were not separable.** Switching
`docked` → `floating` alone regressed station routes, because the nav lived in a
`shrink-0 overflow-hidden` 40px card and an in-panel absolute menu was clipped to
the band. Unifying the grammar *required* the portal.

- Rail card floated (`rounded-2xl`, full border, even gutter).
- Both menus moved to `AnchoredLayer` (portal to `<body>`, `panelPopover`/120),
  deleting `layout="docked"`, the `flat` prop and the bespoke `mousedown` handler.
- Scan-focus watchdog: `SCAN_FOCUS_REQUESTED_EVENT` from
  `lib/scan-hotkey/store.ts`. Worse than the review assumed — the scan bar sits at
  the **top** of the station card, exactly where the menu dropped, so the hotkey
  would have focused an input hidden behind an open menu.
- Then a **wide flyout** variant: `bottom-start` at `w-[28rem]`, overhanging the
  canvas ~97px.

### Wave 2 — the architecture was wrong, not the menu

The flyout was a good answer to a bad question. The real problem was that the
sidebar held **nav + a context panel + the bench**, so the nav had nowhere to
live and had to become a transient layer. Fixing the container removed the need
for the layer:

| | Before | Now |
|---|---|---|
| Station sidebar | nav + context panel, always shown | **nav only**, hidden by default |
| Nav chrome | floating card, radius + elevation | flat: one right hairline, `radius: 0`, `shadow: none`, `x: 0` |
| Reveal | flyout over content | GlobalHeader toggle, **pushes** content (flex sibling) |
| Scan bar + rail | in the sidebar | in the **content region**, beside the workspace |
| Nav list | behind a trigger | rendered **in flow** (`MasterNavView variant="inline"`) |

Mechanism: `ResponsiveLayout` mounts the station panel inside `<main>`, so all
six station routes convert with **zero page-component changes**. The nav-hidden
default is route-aware (`isStationSurfaceRoute`) and re-applies only when
crossing between surface kinds, so a manual toggle survives navigation.

Three details that were not obvious until it was on screen:

- **Ground plane.** The panel is `bg-surface-card` (white). On a white host its
  elevation had nothing to cast against. `STATION_PANEL_HOST_CLASS` carries
  `appCanvasClass` — depth needs a step below card white (`tokens/shadows.ts`).
- **Gutter is the panel's own margin, not host padding.** Host padding also inset
  the workspace, and the carton bookmark bar must dock **flush** under the
  GlobalHeader (measured: 0px).
- **Directional light.** A panel pinned to the left of a wide frame reads wrong
  under a straight-down cast — its left edge is the one seen against the canvas.
  New SoT: `elevationCastClass('left')` + `--ds-elev-overlay-left`, ambient layer
  preserved, key + cast gain a negative x. The app now reads as lit from the
  centre of the screen.

### Wave 3 — nav behaviour

- **The row is the disclosure.** In the inline sidebar a page row with modes
  **expands** on click rather than navigating. The modes are the real
  destinations; jumping to a default the operator did not pick is a worse guess
  than showing the choice. Modeless rows still navigate, and every row in the
  transient flyout still navigates — a fast jump is that surface's whole point.
- **Open where you are.** Revealing the sidebar pre-expands the active page's
  modes, so one look shows both position and reachable siblings.

### Mobile drawer — resolved

The investigation found one genuinely dead chain and one narrow-band survivor.

**Deleted:** `MobileSidebarOverlay` + `MobileSidebarOverlayProps`,
`useMobileSidebar`, `MobileSidebarState`, `MOBILE_SIDEBAR_MIN_WIDTH`, and
`MobileBoxedNavButton` (all four of its exports had zero consumers). Nothing ever
called `open()` — the trigger had been deleted ("now handled by header nav
buttons") and the overlay was orphaned, so `isOpen` was permanently `false`.

**Kept:** `ResponsiveLayout`'s `drawerOverlay`. It is mounted only in the desktop
branch, so it needs `isMobile === false` *and* CSS width < 768px — a resized
desktop window. Real phones take the mobile branch and never see it.

**Left alone, flagged:** `src/app/m/(shell)/receiving/history/page.tsx` still
renders a header button wired to `open-mobile-drawer`, which is a no-op on an
`/m` route (mobile branch, nothing listening). Deleting a visible control from a
mobile page is a product call, not cleanup.

### Coverage

`tests/e2e/sidebar-nav-overlay.spec.ts` — **18/18 desktop**. Asserts: nav hidden
by default with the bench still on screen across all six station routes; classic
routes still lead with their panel; the toggle pushes rather than covers; the nav
column is flat chrome; the page list renders in flow; no mode strip on the bench;
pre-expansion of the active page; row-click expands without navigating.

### Still open

- **The mobile drawer is untested.** The `panelPopover` band choice (menu must
  paint above the drawer's `panel`/100) is correct by construction but
  unverified, and the drawer is only reachable in a resized desktop window.
- **Menus have no exit animation.** `AnchoredLayer` returns `null` when closed.
  Matches all ~10 existing consumers; growing the primitive is an ask-first change.
- **Nav-hidden state does not persist.** Route-kind defaults only; a manual
  toggle resets when crossing between station and non-station surfaces. Persisting
  per staff (`staff_preferences`, like the column prefs) is the obvious next step.
- **~18 non-station routes still hold their context panel in the sidebar.** The
  scope call was "station routes first"; app-wide conversion is untouched.

## 6. File index (for citation in your answer)

| Concern | Path |
|---|---|
| Shell / desktop frame / mobile drawer | `src/components/layout/ResponsiveLayout.tsx` |
| Sidebar branch (station vs classic) | `src/components/sidebar/SidebarShell.tsx` |
| Two-card station column tokens | `src/components/sidebar/station-column.ts` |
| Nav container (router-wired) | `src/components/sidebar/master-nav/MasterNav.tsx` |
| Nav presentation + `floating`/`docked` | `src/components/sidebar/master-nav/MasterNavView.tsx` |
| Closed trigger band + MRU chips | `src/components/sidebar/master-nav/MasterNavHeader.tsx` |
| L1 menu (groups, expandable modes) | `src/components/sidebar/master-nav/MasterNavDropdown.tsx` |
| Per-route panel dispatcher (code-split) | `src/components/sidebar/SidebarContextPanel.tsx` |
| Receiving/Unbox sidebar composition | `src/components/sidebar/ReceivingSidebarPanel.tsx` |
| Unbox/Triage rail selection | `src/components/sidebar/receiving/ReceivingRailBody.tsx` |
| Rail engine (fetch/select/keyboard) | `src/components/sidebar/SidebarRailShell.tsx`, `src/components/sidebar/rail-shell/*` |
| Recent-activity rail base | `src/components/sidebar/receiving/RecentActivityRailBase.tsx` |
| In-body mode pills | `src/components/sidebar/receiving/ReceivingModeSwitcher.tsx`, `src/components/sidebar/SidebarNavOverlaySlider.tsx` |
| Chrome tokens (bands, gutters, MRU) | `src/components/layout/header-shell.ts` |
| Elevation / z-index / spacing tokens | `src/design-system/tokens/shadows.ts`, `tokens/z-index.mjs`, `tokens/spacing.mjs` |
| Motion presets + reduced-motion hooks | `src/design-system/foundations/motion-framer.ts`, `motion-framer-hooks.ts` |
| House rules (region contracts, motion law) | `.claude/rules/display/workbench.md`, `display/station.md`, `display/motion-crossfade.md` |
