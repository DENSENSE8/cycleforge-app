# HANDOFF — Contextual sidebar foundations: one root per concern, then FBM

**Paste everything below the rule into a fresh session pointed at
`/home/michaelgarisek/Projects/cycleforge-lanes/prod`.** Written 2026-09-27.
Related: `HANDOFF-outbound-sidebar-verify.md` (per-page checklist) and
`HANDOFF-paste-a-list.md` (batch identify).

---

You are hardening the contextual left sidebar into **foundations that every
page inherits**, then applying four operator decisions to Outbound. The rule of
this session: **upgrade the root, then every page follows.** A page may only
DECLARE data. It never gets its own sidebar component, filter renderer or
styles.

Do not edit the data table or page header (`src/components/outbound/**`,
`src/components/unshipped/**`, `src/components/tables/**`); another session
owns them. Probe only `http://localhost:3050` (see `AGENTS.md`). Sign-in and
Playwright probe recipe: `HANDOFF-outbound-sidebar-verify.md` → "Read first" §4.

## 0. Verified: "FBM covers every platform, not only Amazon"

**The claim is correct for this codebase, with one fix required.**

- **The term.** FBM (Fulfilled by Merchant, which Amazon also calls MFN) means
  the seller stores, packs and ships the order itself. It is the opposite of FBA,
  where Amazon does it ([Amazon: Fulfilled by Merchant](https://sell.amazon.com/programs/fulfilled-by-merchant),
  [Openbridge on MFN](https://blog.openbridge.com/understanding-amazon-mfn-merchant-fulfilled-network-288817b32995)).
  The acronym is Amazon's, but the *model* covers any channel you ship yourself.
- **What the Shipping desk holds.** The To ship list mixes channels: AMZ, eBay
  and ECW rows were on screen on 2026-09-27. The platform registry
  `SOURCE_PLATFORMS` in `src/lib/source-platform.ts` lists:
  - `ebay`, `amazon`, `fba`, `aliexpress`, `walmart`, `goodwill`, `ecwid`,
    `square`, `shopify`, `zoho`, `mercari`, `other`
  - so the mode is multi-channel self-fulfilment, i.e. FBM in the general sense.
- **The fix.** The Shipped view is **not** pure FBM today. Its list includes FBA
  prep shipments unless the Type filter excludes them. The predicate is in
  `src/lib/neon/orders-queries.ts` (`shippedFilter === 'fba'` ⇒
  `account_source = 'fba' OR order_id ILIKE 'FBA%'`), and the FBA page already
  has its own `shipped` child. **So under FBM, Shipped must default to
  `shippedFilter=orders`**, which drops the FBA rows, and FBA's shipped rows stay
  in the FBA mode.
- **Label.** Use `FBM` in the mode switcher, with the secondary line
  "Fulfilled by merchant · all channels" in the dropdown so non-Amazon staff read
  it correctly.

## 1. The roots

Each concern has exactly one root. Upgrading it upgrades every contextual page.

### Backend (the contract; Tauri gets the same answers)

| Concern | Root | A page does |
|---|---|---|
| Sidebar shape per URL | `src/lib/nav/context/schema.ts` (`NavContextSchema`) + `build.ts` (`buildNavContext`) served by `GET /api/nav/context` | nothing (derived) |
| Per-page surfaces (search, actions, controls, saved views, recents) | `NAV_PAGE_DECLS` in `src/lib/nav/context/pages.ts` | declares one entry |
| Filters and counts | `NAV_FACET_GROUPS` + `NAV_FACET_PERMISSION` in `src/lib/nav/facets/contexts.ts`; predicates in `src/lib/nav/facets/{outbound,shipped,pickup}.ts`; served by `GET /api/nav/facets` | declares its groups; its predicate MUST be the list's predicate |
| URL params (hygiene keeps only declared keys) | `src/lib/routing/*-routes.ts` (`TO_SHIP_QUEUE_FACET_PARAMS` in `to-ship-queue-params.ts`) | declares every param a filter writes |
| Page map, lanes, modes | `LANE_DOORS` in `src/lib/nav/lanes.ts`; page labels and children in `src/lib/sidebar-navigation.ts`; Shipping view order `DESK_VIEW_ORDER` in `src/lib/outbound/desk-views.ts` | nothing, or one lane entry |
| Platform vocabulary | `SOURCE_PLATFORMS` in `src/lib/source-platform.ts` | nothing |
| Rollout | `NAV_CONTEXT_ROLLOUT` in `src/lib/nav/context/rollout.ts`, clamped by `parityGaps` | flips one line when parity is empty |

### Frontend (the renderer; every page shares it)

| Concern | Root |
|---|---|
| Host layout (pinned head, body, footer) | `src/components/sidebar/contextual/ContextualSidebar.tsx` |
| Pressable block (rest / hover lift / press sink) | `nav-block.ts` → `NAV_BLOCK_CLASS`, `NAV_BLOCK_PLATE_CLASS` |
| Corners | `SIDEBAR_CONTROL_CORNER`, `SIDEBAR_CHIP_CORNER` in `src/design-system/tokens/radius.ts` |
| Search field (one field: page scope `F`, everywhere ⌘K) | `NavFind.tsx` (`NavFind`), `FindField` (`scope`, `escalate`) |
| Views, counts, 1–9 keys, hairlines | `NavSectionList.tsx` (`useViewCounts`, `useViewHotkeys`) |
| View glyphs | `nav-view-icons.ts` (`<pageId>.<viewId>`) |
| Modes | `NavModeSwitcher.tsx` |
| Filters, zero options, presets | `NavFilters.tsx` |
| Lane-door memory | `useLaneDoorHref.ts` |
| Laws | `src/design-system/pinned.json` → `ContextualSidebar`, `NavFind`, `NavSectionList`, `NavModeSwitcher`, `KeyboardKey`. Query: `node tools/design-mcp/ds.mjs contract "<intent>"` |

### Guards to add (they make the roots enforceable)

Add each to `src/lib/nav/context/resolve.test.ts` unless noted:

1. **One control per param.** For every page, no URL param is written by two
   sidebar controls (a facet group and `controls.*`).
2. **Declared params.** Every `filters.groups[].param` and every `controls.*`
   param is in that page's `params` list, so it survives route hygiene.
3. **Same predicate.** For each facet context, the facet `total` equals the list
   endpoint's count for the same params. Extend the existing test in
   `src/lib/nav/facets/outbound.test.ts`.
4. **No page-local sidebar code.** Grep test: nothing outside
   `src/components/sidebar/contextual/` imports `NAV_BLOCK_CLASS` to build its own
   sidebar rows.

## 2. Decisions to build (operator 2026-09-27)

### 2.1 Views become a dropdown; filters take the body

- **New `NavViewSwitcher.tsx`**, pinned in the head directly under the mode
  switcher. It uses the same block as `NavModeSwitcher`.
  - The trigger reads `[glyph] [digit] <current view> … [count] ▾`. It carries an
    **amber dot when Exceptions > 0** and you are not on Exceptions.
  - The menu lists every view as `glyph · digit · label · count`, with the current
    one checked.
  - Bare keys `1`–`9` still switch views without opening the menu. Move
    `useViewHotkeys` out of `NavSectionList` into the switcher.
- **The body is filters and presets only** on a page panel. `NavSectionList`
  keeps rendering the page map, with the lane door, hairlines and block rows.
- **Batch the counts (latency).** Today there are 5 `/api/nav/facets` calls per
  load. Add `GET /api/nav/facets?contexts=a,b,c&totals=1`, which returns
  `{ totals: Record<context, number> }` from one server pass, and move
  `useViewCounts` onto it.
- **Contract.** No `NavContext` change: the views are the page's
  `sections` minus the `.modes` section. Update the `NavSectionList` and
  `ContextualSidebar` laws in `pinned.json`: "page panel views render as a
  dropdown in the head".

### 2.2 Platform filter (all channels)

- **Facet.** Add a `platform` group to `outbound.triage`, `outbound.pick`,
  `outbound.po` and `outbound.shipped` in `NAV_FACET_GROUPS`. Options come from
  `SOURCE_PLATFORMS` labels, and counts from the SAME predicate the list uses:
  - the platform column is `account_source`;
  - normalise through `sourcePlatformMeta`;
  - `fba` never appears under FBM (see §0).
- **Param.** Declare `platform` (comma list, multi-select) in
  `TO_SHIP_QUEUE_FACET_PARAMS` and on the shipped route. Make the To ship list
  query and the shipped query read it.
  - The list side (`src/lib/neon/orders-queries.ts`, the `/api/orders` handler) is
    in shared lib, not the table UI, so it is in scope.
  - Write the predicate ONCE, e.g. `platformPredicate(params)` in
    `src/lib/orders/`, and call it from both the list query and the facet.
- **UI.** Nothing new: `NavFilters` renders it as a closed row with a value chip,
  with zero-count platforms dimmed and last.

### 2.3 Date filter on To ship, Pick list and PO paired

- **Default: ship-by date range.**
  - Shipped already has order-shipped dates via `controls.dateRange`
    (`dateFrom`/`dateTo`).
  - The To ship family filters by ship-by. The existing `aging` buckets are
    overdue / today / upcoming.
  - Confirm with the operator if order date was meant instead.
- **Params.** Add `controls.dateRange` to the `triage`, `pick` and `po` decls in
  `pages.ts` with new params `shipByFrom` / `shipByTo`. Declare them in
  `TO_SHIP_QUEUE_FACET_PARAMS`, and apply them in the list query and the facet
  predicate (same function rule as 2.2).
- **Overlap with `aging`.** When a range is set, clear `aging` via `clearParams`,
  so the two never both narrow.
- **UI.** The existing `DateRow` in `NavFilters` (range picker with presets). It
  sits at the top of the filter body, directly under the view switcher.

### 2.4 Back row stays left, styled as a title

- `‹ Outbound` keeps its left alignment. Make it read as the panel title:
  `text-role-body font-semibold`, chevron `text-text-muted`, same
  `NAV_BLOCK_CLASS` hover and press. No centring.

### 2.5 FBM naming (from §0) — **built 2026-09-28**

Validated against the tree on 2026-09-28 before building:

| Plan claim | Evidence | Verdict |
|---|---|---|
| FBM = every channel we ship, not only Amazon | `SOURCE_PLATFORMS` (`src/lib/source-platform.ts:57`) still lists eBay, Amazon, Ecwid, Walmart, Shopify, Square… | holds |
| Shipped mixes in FBA unless the Type filter excludes it | `orders-queries.ts:581-584` (list) and `:975-978` (count): `orders` = `account_source != 'fba' AND order_id NOT ILIKE 'FBA%'`; `useShippedTableFilters` defaults to the saved preference, else `all` | holds — fixed below |
| FBA has its own Shipped | `SIDEBAR_PAGE_NAV` `fba` child `shipped` (`sidebar-navigation.ts`) | holds |
| `NavItemSchema` has no `description` | `schema.ts` had `id · label · href · active · kind · badge` only | holds — added |
| Lane name in the head (`‹ Outbound`, §2.4/§3) | the lane is now **Fulfillment** (owner 2026-09-28: order-agnostic names; Inbound → Receiving) | stale — read `‹ Fulfillment` |
| "Shipped count under FBM excludes FBA" (§4.6) | the view badge is `shippedToday` = today's `PACK` station events (`sqlShippedTodayCount`, `desk-view-sql.ts:372`), not the Shipped list's predicate | **gap** — the badge does not read `shippedFilter`; the list and its facet counts do |

Built:

- `outbound` page label `'FBM'` in both `APP_SIDEBAR_NAV` and `SIDEBAR_PAGE_NAV`
  (`src/lib/sidebar-navigation.ts`), plus `sidebar-titles`, `search-scope-labels`,
  `settings/registry` desk list and `stations/surface-keys`. Page id and routes unchanged.
- `description?: string` on `SidebarNavItemFields` and `NavItemSchema`; the resolver's
  `laneModeRows` carries it; `NavModeSwitcher` paints it as a second line. FBM →
  "Fulfilled by merchant · all channels", FBA → "Fulfilled by Amazon" (the split).
- FBM › Shipped view params `{ shippedFilter: 'orders' }` (`src/lib/outbound/desk-views.ts`).
- ⌘K: the page's catalog `keywords` (`shipping`, `mfn`, `fulfilled by merchant`, `to ship`,
  `allocate`) and the lanes' former names (`DOMAIN_GROUPS[].keywords`: `inbound`, `outbound`)
  feed `buildNavDestinations`; "shipping" ranks FBM first.
- Tests: `resolve.test.ts` (modes + descriptions, allowed keys), `nav-destinations.test.ts`,
  `sidebar-navigation.test.ts`.

## 3. Head and body after this session

```
Pinned head
  [collapse] [🔍 Ctrl K Search]            ← global, every page
  [🔍 F Find orders to ship]               ← this list only
  ‹ Outbound                               ← title, left
  [FBM ▾]                                  ← mode (Fulfilled by merchant · all channels)
  [🚚 4 To ship            38 ▾] •         ← view; amber dot if Exceptions > 0
Body
  Date   Sep 21 – Sep 27                   ← first filter row
  Platform   All
  Staff      All
  › Stage  › Ship by  › Must ship  › Urgent  › Stock
  ─── presets (Save view appears when filtered)
```

## 4. Acceptance

1. **Roots.** Each §1 guard exists and fails when you break it on purpose, then
   passes. Show both runs.
2. **Views dropdown.**
   - On `:3050`, check each of the 5 views: the trigger shows the right label,
     count and glyph.
   - Keys 1–5 switch views.
   - The amber dot shows on a non-Exceptions view while Exceptions > 0.
   - The body contains no view rows.
3. **Counts, batched.** One `/api/nav/facets?contexts=…&totals=1` request per
   load, visible in the network log. Its totals equal the old per-context totals
   (on 2026-09-27: exceptions 397, po 0, pick 30, triage 38, shipped 73).
4. **Platform.** Pick eBay: the list shrinks to eBay rows, the facet count equals
   the list count, and the param survives a reload. Multi-select eBay + Amazon
   works.
5. **Date.** Set a ship-by range on To ship: the list narrows, `aging` clears,
   and a reload keeps the range. On Shipped, the Date row still behaves as
   before.
6. **FBM.**
   - The mode switcher reads FBM with its subtitle.
   - The Shipped count under FBM excludes FBA rows: compare
     `shippedFilter=orders` with `all`.
   - ⌘K finds "FBM", and the old name "Shipping" also resolves (add it as a
     `keywords` entry on the page).
7. **Back row.** Left-aligned and title-weight, with the hover lift and press
   sink.
8. **Checks and laws.**
   - `npx tsc --noEmit -p . ; echo exit=$?` reports 0.
   - The node tests for resolve, spine-slots, sidebar-navigation, facets and
     nav-name-collisions are green.
   - `pnpm verify:fast` passes.
   - `pinned.json` is valid JSON, and `ds.mjs contract "view dropdown platform
     filter"` returns the updated laws.
9. **Report.** Per decision: the files changed, probe evidence (API numbers
   next to painted numbers) and screenshots of each view's sidebar.
