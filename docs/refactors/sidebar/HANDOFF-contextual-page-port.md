# HANDOFF — Port a page onto the contextual sidebar (page agnostic)

**Paste everything below the rule into a fresh session pointed at
`/home/michaelgarisek/Projects/cycleforge-lanes/prod`, and set `PAGE` to one page id.**
Written 2026-09-27, after Shipping (`outbound` + `fba`) became the reference page.
Next in line: `incoming` (Inbound), `inventory`, `sales`, `reports`, one at a time.

Related:
- `HANDOFF-sidebar-navigation-predictability.md`: the contract P1–P10 every page must hold.
- `HANDOFF-outbound-sidebar-verify.md`: the per-page check matrix. Add rows for your page; don't fork it.
- `AGENTS.md`: probe only `:3050`.

---

Port **`PAGE`** onto the contextual left sidebar. When you're done it must behave exactly like
Shipping, and nothing you write may mention `PAGE` outside its declaration.

## 0. Read first

- `node tools/design-mcp/ds.mjs contract "<intent>"` for `ContextualSidebar`, `NavModeSwitcher`,
  `NavSwitcherMenu`, `NavGoKeys`, `NavFilters`, `KeyboardKey`. The source is
  `src/design-system/pinned.json`. Laws beat code; ask the operator before changing a law.
- `git status --short` before you start. Other sessions work in this tree (search, auth, orders).
  Never edit their files, and list them separately when you report.

## 1. The model: a page is DATA; one host paints every page

| Piece | Where | What the page contributes |
|---|---|---|
| Page registry | `SIDEBAR_PAGE_NAV` in `src/lib/sidebar-navigation.ts` (the SECOND list, around line 846, not `APP_SIDEBAR_NAV`) | label, href, `icon`, `tone` (icon ink when it is a lane MODE), `requires`, `children` = its views |
| Page declaration | `NAV_PAGE_DECLS` in `src/lib/nav/context/pages.ts` | `search`, `savedViews`, `actions`, `controls`, `recents`, `scanInput`, `viewKeys: true`, and per-view overrides under `items` |
| View glyphs | `NAV_VIEW_ICONS` in `src/components/sidebar/contextual/nav-view-icons.ts`, keyed `<pageId>.<viewId>` | one icon + tone per view (a view without an entry paints no glyph) |
| Go letter | `NAV_GO_KEYS[<lane>]` in `src/lib/nav/go-keys.ts`, keyed by letter per lane (letters never leak across lanes; two lanes may reuse one) | only if the page is a lane MODE that deserves `G` + letter |
| Resolver | `buildNavContext` → `resolveNavContext` (`src/lib/nav/context/`) | nothing: it turns the URL into page, views, lit item, hrefs, `viewKeys` |
| Parity gate | `src/lib/nav/context/parity.ts` (`parityGaps(PAGE)`) | one row per thing the old UI did, until the gap list is empty |
| Rollout | `NAV_CONTEXT_ROLLOUT` in `rollout.ts`, plus the per-staff override `nav.contextual.<pageId>` | the switch |
| Sidebar host | `ContextualSidebar` | nothing: it paints mode card, view block, filters, recents from the context |
| Desk header | `DeskPageLayout bare` → `useNavDeskHeader` (`NavKeyStrip.tsx`) | nothing: title = active view; with `viewKeys` the title gets `›` and hover-to-unfold pills; the key strip shows the `G` step |

Behaviour the page inherits for free (do not re-implement):
- **Parent tier (mode) card:** coloured icon. Hover teaches `[G] then [S]…`. Click hangs an overlay
  welded to the card by one hairline, listing only the OTHER modes. Esc from anywhere closes it,
  and so does a press outside.
- **Child tier (view block):** hover teaches the digits. Click hangs an overlay welded to the
  block, listing only the OTHER views with counts. Bare `1`–`9` work when `viewKeys` is declared.
- **Header:** the title is the active view. Hovering `Title ›` unfolds the view pills right beside
  it; they stay until Esc, a press outside, or a choice. While `G` is armed the strip shows the
  next keys (top-middle); nothing shades or outlines the list.
- **Keyboard:** list keys are owned while focus is in a switcher (`data-list-key-owner`), so a
  desk's record cursor stands down. Digits are ignored while an overlay (record, popover) is open.

## 2. Steps for `PAGE`

1. **Snapshot the facts.** `GET /api/nav/context?path=<PAGE href>` (cookie from `POST /api/auth/signin`,
   `x-tenant-slug: usav`, `{staffId, deviceKind:'personal'}`) → note `scope`, `rollout`, `sections`.
   Run `parityGaps('PAGE')`:
   `node --import tsx -e "import('./src/lib/nav/context/parity.ts').then(m=>console.log(m.parityGaps('PAGE')))"`.
2. **Views are routes.** Every view must be a `children` entry of the page in `SIDEBAR_PAGE_NAV`
   whose href round-trips (resolving it lights exactly that view). If the page draws its own tab
   row (Reports passes `tabs={TABS}`; Sales and Inventory use `DeskPageLayout` without `bare`),
   those tabs become the view children, and their state moves into the URL (P1).
3. **Declare.** In `NAV_PAGE_DECLS[PAGE]`, add search / actions / controls / savedViews per view
   under `items`. Add `viewKeys: true` only after proving no other bare `1`–`9` handler is live on
   the page. Grep for `/^[1-9]$/` and `key === '1'`; the known owner is `EvidenceDecisionBar`
   (1–4 on record pages). A painted key that does nothing is the worst outcome.
4. **Glyphs and colour.** Add `NAV_VIEW_ICONS['PAGE.<view>']` for each view. If `PAGE` is a lane
   mode (it appears in some `<lane>.modes` section), give its `SIDEBAR_PAGE_NAV` entry a `tone`,
   reusing the colour the page already wears elsewhere (FBA = `text-purple-600`, from
   `source-dot.ts` / the chart theme). Add a letter under its lane in `NAV_GO_KEYS` only if it is a mode.
5. **Mount the frame.** The page's desk renders `<DeskPageLayout bare …>`, and nothing else in the
   header. If the page has declared verbs, render `<NavPageActions actions={nav?.actions} />` inside
   it, as `src/app/shipping/(desk)/layout.tsx` does. A page with its own header action component
   (Incoming's `IncomingDeskAddAction`) keeps it. Delete the page's old tab row and old context panel
   in the SAME change (clean cutover, no second path).
6. **Flip it.** Dogfood with `nav.contextual.PAGE = contextual` for your staffer first. Set
   `NAV_CONTEXT_ROLLOUT[PAGE] = 'contextual'` only when parity is gap-free and the probes pass.
7. **Record the law.** Add the page's specifics to its `pinned.json` entry only if they differ
   from the shared law; add its rows to `HANDOFF-outbound-sidebar-verify.md`.

## 3. Known traps (each one bit Shipping)

- **Hydration.** The nav context paints from a localStorage snapshot the server can't see. Never
  read `useNavContext` data into server-rendered markup without the hydration gate
  `useNavDeskHeader` uses (`useSyncExternalStore(subscribeNever, () => true, () => false)`).
- **Two registries named alike.** `tone` / `requires` / `children` belong on `SIDEBAR_PAGE_NAV`,
  which is what `getSidebarPageNav` reads. `APP_SIDEBAR_NAV` is the master-nav list.
- **`bare` means views live in the sidebar.** The header paints views and keys only for a
  contextual panel (`rollout: 'contextual'`, `scope: 'section'`), the same test the sidebar host
  uses. A `bare` desk on a `legacy` page shows its page label and no keys (FBA was the
  example until it flipped on 2026-09-27). Flip the page (or its staff override) before
  judging its header.
- **Pages outside the desk group get no header strip** (Label intake is `src/app/shipping/label-intake/`,
  outside `(desk)`). `G` then falls back to the key card beside the sidebar. Either move the page
  into its desk group or accept the fallback explicitly.
- **Wire schema is strict.** `NavContextSchema` is `.strict()` and shared with `/api/nav/context`.
  A new context field goes into the schema, `build.ts` and a resolver test together.
- **Probes on a dev server:** wait for `[data-nav-switcher="view"]` (hydration), not `networkidle`.
  Leave ≥30ms between `G` and its letter (the scanner-burst guard refuses faster pairs).
  Don't click inside the list to "focus the page": it opens a record. Click the header title.

## 4. Proof (report each, don't summarise)

- `node --import tsx --import ./scripts/register-server-only-shim.cjs --test src/lib/nav/context/resolve.test.ts`:
  all pass. It already checks round-trips, parity, permissions, and that `viewKeys` binds only on
  a declared page panel.
- `node scripts/probe-sidebar-contract.mjs` against `:3050`: no FAIL for `PAGE`.
- A Playwright probe on `:3050` (use `@playwright/test` from `node_modules`, script in `/tmp`,
  delete it after) recording for every view:
  - header title;
  - `[data-nav-view-title]` present iff `viewKeys`;
  - pills `[data-nav-key-strip-view]` beside the title that stick after hover-off and fold on Esc;
  - the view block's hover card `[data-nav-key-hint="child"]` (digits iff `viewKeys`);
  - the click overlay `[data-nav-switcher-list="child"]`: gap to the block exactly 1px, the
    current view absent, the block's and the body's y unchanged;
  - digits land on the right URL, and are ignored where undeclared;
  - Esc from `body` closes each overlay;
  - reload and back/forward change nothing (P1);
  - no `Hydration failed` on a second load of the same URL.
- Screenshot the sidebar (x 0–300) and the header row for each view.
- `pnpm verify:fast`. Report foreign failures separately, with `git status --short <file>` proof.
