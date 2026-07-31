# Nav / routing refactor — finish prompt

**Self-contained.** A new session needs only this file. Paste:

> Read `docs/todo/nav-routing-refactor-FINISH-PROMPT.md` and execute item 1.

**Picking up mid-refactor?** [`url-isolation-session-HANDOFF.md`](url-isolation-session-HANDOFF.md) is
the entry point for the 2026-07-29/30 session: what shipped uncommitted, the decisions owed, and the
three traps that each cost a wrong conclusion. This file stays the method + backlog.

**Supersedes `nav-routing-refactor-EXECUTION-PROMPT.md`.** That file planned Slices
1–5; Slices 1–4 and Slice 5's isolation tier have landed, and several of its
remaining items were disproved by the code. Do not work from it — §4 below records
exactly which of its instructions are now wrong and why, so the disproof is not
re-derived a third time.

---

## 0. The one thing to internalise

**Isolation is the param spec plus construct-don't-copy. It is NOT route
segments.** Next.js strips nothing; `router.push('/unbox')` carries no query
string because nobody wrote one. Two external research passes both asserted the
opposite, and the plan inherited it.

The proof is in the shipped code: Support, Dashboard, Operations and Home are
fully isolated and **still switch mode via `?mode=`**. Not one of them moved to a
segment.

Segments buy layout ownership, server-side gating and remount identity. They have
never bought isolation. Never write that they do.

---

## 1. What is already done — do not redo

| Landed | Commit |
|---|---|
| Receiving param isolation (Slice 1) | `90a94c37c` |
| Typed refresh domains, both broadcasts retired (Slice 2) | in `7768f6c05` |
| `/shipping` route segments (Slice 3) | in `c77ec0d1c` |
| `applyModeTarget` constructs instead of copying | `8240762da` |
| Last denylists deleted; Support/Dashboard/Operations/Home construct (Slices 4–5 isolation tier) | `3e42e8462` |
| `/products` isolation tier + D2 detail-route move | uncommitted |
| Isolation tier for `/sourcing` `/test` `/walk-in` `/inventory` `/review` `/pack` `/warehouse`; `pane` + station-table params ambient; `SurfaceParamHygiene`; `surface-param-isolation.spec.ts` | uncommitted |
| `/dashboard` boundary parse (`SurfaceParamHygiene` + shipped/unshipped filter band declared) | uncommitted |

**Nine denylists, ~86 enumerated keys, all gone.** `MODE_SCOPED_PARAMS` (17),
`OUTBOUND_MODE_SCOPED_PARAMS` (16), `SUPPORT_MODE_CLEAR_PARAMS` (20),
`SUPPORT_MODE_SCOPED_PARAMS`, `OPERATIONS_MODE_SCOPED_PARAMS` (26),
`HOME_MODE_SCOPED_PARAMS` (7), the dashboard per-target null-maps,
`clearReceivingHistoryUrlParams`, and the receiving half of
`stripCrossSurfaceParams`. There are zero denylist declarations in `src/`.

**The waist:** `src/lib/routing/` — `route-params.ts` (schemas + `parseRouteParams`
+ `buildRouteUrl`), `registry.ts` (`routeParamsFor`, the ONE resolver),
`receiving-routes.ts`, `outbound-routes.ts`, `query-mode-routes.ts`.

**The guards** (all under `npm run verify`): `param-ownership.guard.test.ts`,
`route-mode-registry.guard.test.ts`, `route-params.test.ts`,
`refresh-domains.guard.test.ts`. Plus e2e `receiving-param-isolation.spec.ts` and
`shipping-mode-segments.spec.ts`.

---

## 2. The method that works — use it for every remaining surface

Migrating a surface has a repeatable shape. Follow it in this order; step 1 is
not optional.

1. **Add the surface's directories to `OWNED_TREES`** in
   `src/lib/routing/param-ownership.guard.test.ts` (line ~39) and run it. The
   guard lists every `?param=` that surface actually reads. **Do not guess the
   param list** — guessing is how a live param gets silently dropped, which is a
   worse bug than the leak being fixed. This guard has already caught real
   omissions on three of the four surfaces migrated so far (Support alone hid
   `createTicket`, `tq`, `tstatus`).
2. **Write the spec** from that enumeration. Compose existing vocabulary SoTs via
   `paramRoundTrip(parseRepairTab)` rather than re-typing value lists.
3. **Register it** in `src/lib/routing/registry.ts`.
4. **Declare genuine cross-route keys** in `SHARED_OWNED_KEYS` with a one-line
   reason. A key owned by two routes is normal (`sort`, `q`, `open`); a key owned
   by two routes *and undeclared* is a build failure.
5. **Rewrite that surface's `updateMode`** to `buildRouteUrl(spec, { … })` and
   delete its denylist. Carry `staff` only.
6. **Mount `useSurfaceParamHygiene()`** on the surface so a pasted link is parsed
   at the boundary.
7. **Update the specs that assert the old URLs in the same change** — never leave
   one asserting a dead contract.

**Step 6 has a placement rule: mount the hygiene hook in the surface's
`layout.tsx`.** Two wrong homes, both found by the e2e probe rather than review:

- **A sidebar panel is the wrong host, and the failure is MOBILE-ONLY.** On
  desktop `SidebarContextPanel` mounts the panel by route key, so the parse runs
  and everything looks fine. On mobile the panel rides `RouteShell`'s `actions`
  slot and mobile renders one pane at a time, defaulting to `history` — so the
  panel never mounts and the parse never runs. **Confirmed live on `/products`**:
  a probe param survived every mobile load. `/products` and all six receiving
  routes were moved to route level 2026-07-29 and the panel hooks deleted.
  (`/sourcing` looked like the same bug but was actually PARKED — the stand-in
  replaces the panel too. Two different causes, one symptom.)
- **A root `page.tsx` covers only that one path.** A spec governs its sub-routes
  by prefix, so `/inventory`'s hook in `app/inventory/page.tsx` left all twelve
  siblings (`graph`, `triage`, `pulse`, `bins`, `units`, …) unparsed.
  `/inventory/graph` kept an undeclared param.

A `layout.tsx` is the one host always mounted for every path under the surface.
`src/app/shipping/layout.tsx` was the precedent; `app/inventory/layout.tsx`,
`app/warehouse/layout.tsx`, `app/products/layout.tsx` and `app/receiving/layout.tsx`
now match it. **If the spec's route has children, the hook goes in the layout**;
a leaf route (`/review`, `/walk-in`, the graduated scan pages) mounts it on the
page. Always via **`@/components/routing/SurfaceParamHygiene`**, which handles the
`Suspense` boundary and works from an async server-component page — its docblock
is the placement SoT.

**Measure the parse with a POLL, never a fixed sleep.** An ad-hoc probe with
`waitForTimeout(2200)` reported `/triage`, `/incoming` and `/repair` as unparsed;
at 20s of polling all three were fine. Dev-mode first compile is slow enough to
fake a failure, which nearly sent a second round of "fixes" after code that was
already correct.

**Step 7 needs a settle PROBE, or the e2e lies.** A "this param survived" test
asserted right after `goto` passes vacuously: the param is still on the URL only
because the hook's effect has not fired. "Poll until the URL stops changing" is
*also* wrong — two consecutive reads match before the effect runs. Attach a key no
spec declares (`__isolation_probe`), poll until it disappears, and only then
assert: its removal is proof the parse ran. That mistake cost a full debugging
cycle chasing two "failures" that were the harness, not the code.

**Step 1.5 — the hand-off sweep.** Before writing the spec, ask what the surface
reads *without rendering*: a redirect hook, a proxy rule, an outgoing href
builder. `/walk-in` reads `openRepair` / `new` / `search` purely to forward them,
and the ownership guard was green while the spec dropped all three (`/repair`
declares them, so nothing looked undeclared). **A param a surface only hands off
still has to be declared**, or the hygiene hook strips it before the hand-off
runs. Grep the surface's hooks for `searchParams.get` even when the page body has
none.

---

## 3. What is left, in priority order

### 3.1 The isolation tier — **COMPLETE** (2026-07-30)

> **Corrected 2026-07-29.** This section previously read "They are already
> isolated. The remaining benefit is … not correctness." **That was wrong**, and
> it is the most expensive error in this file, because it retires the highest-
> value work left. Do not restore it.

**All eight surfaces are resolved.** Seven have specs; `/fba` correctly has none —
it is a server-side `redirect()`, not a surface, so it gets the alias treatment
(`/tech`, `/packer`). **Do not "finish the tier" by giving it one.** What a
redirect needs instead is the hand-off guarantee, now pinned by
`fba-modes.test.ts`: every key it forwards must be declared by `/shipping/fba`. `applyModeTarget` only
constructs when `routeParamsFor(target.pathname)` resolves; with no spec it falls
through to the legacy copy-forward, so the whole query string still rides along.
Check before assuming otherwise:

```bash
npx tsx -e "import {routeParamsFor} from './src/lib/routing/registry';
for (const p of ['/fba','/pack','/review','/warehouse','/inventory','/walk-in','/test','/sourcing'])
  console.log(p, routeParamsFor(p)?.route ?? 'NO SPEC — still copy-forward')"
```

**Seven surfaces DONE (2026-07-29), uncommitted:** `sourcing` · `test` · `walk-in` ·
`inventory` · `review` · `pack` · `warehouse`. `/packer` and `/tech` correctly stay
NO SPEC — they are legacy aliases the proxy normalizes, and giving an alias its own
spec would double-own its keys for a route that only redirects. Notes worth carrying:

- **`/sourcing`** had a clear list in *two* places — `SourcingSidebarPanel.goMode`
  and the nav targets — and **both forgot `by` and `range`**, so Scout's field
  toggle and the Analytics window leaked into every sibling mode. Two lists to
  keep in sync, both wrong the same way. Nav nulls removed after proving the five
  mode URLs byte-identical.
  **Caveat, found only by running the e2e:** `/sourcing` is in
  `PARKED_SURFACE_KEYS`, so the route renders the `ParkedSurface` stand-in and
  `SourcingPage` never mounts. The leak was real in code but **not
  operator-reachable**, and the boundary parse is unobservable until the surface
  unparks — so its two e2e cases are `test.skip`ped with that reason rather than
  asserting something impossible. A spec on a parked surface is still correct
  groundwork (parked `/operations` and `/` have had one since Slice 5), just do
  not describe it as a live fix. **`/fba` is parked too** — factor that in before
  spending a pass on it.
- **`/tech` is not the route — `/test` is** (`TECH = '/test'`;
  `src/app/tech/page.tsx` is a legacy alias the proxy redirects). The spec is on
  `/test`, and `/tech` deliberately has **no** spec: a second one would
  double-own `ship`/`testTab` and force two new `SHARED_OWNED_KEYS` entries for a
  route that only redirects. `TechSidebarPanel.updateTopMode` therefore uses
  `parseRouteParams(TEST_ROUTE_PARAMS, delta)` + `basePath` rather than
  `buildRouteUrl`, which would rewrite the legacy path.
- That pass is also where the **constant-keyed blind spot** and the two live
  defects it hid (`?pane=`, and the station-table `?layout=`/`?density=`/
  `?weekOffset=` that broke saved views) were found — see §2's note. The station
  ones were **pre-existing on receiving**, fixed in the same change because the
  fix is one ambient declaration each.
- **`/walk-in` is the case that proves the read guard's limit.** It reads
  `openRepair`, `new` and `search` *only* to forward a legacy deep-link on to
  `/pickup?job=repair` (`useWalkInTaskRedirect`) — it never renders them. The
  ownership guard stayed **green** while the spec omitted all three, because
  `/repair` already declares them, so nothing looked undeclared. Mounting the
  hygiene hook with that spec would have turned every `?new=true` link into a
  plain history page. **When a surface only reads a param to hand it off, it
  still has to declare it.** Also: `?category=` is deliberately NOT declared (it
  is proxy-only, read server-side then deleted, with no client reader), and `?job=`
  needed nothing because its only readers hang off `WalkInSurfacePage.tsx`, a dead
  file in `knip-baseline.json`. `?tab=` needed a `SHARED_OWNED_KEYS` entry — the
  proxy intentionally preserves it across the `/walk-in` → `/repair` hop, so the
  shared key is a designed hand-off, not a collision.

- **`/inventory` needed five `SHARED_OWNED_KEYS` entries** (`state`, `section`,
  `unit`, `sku`, `filter`) — ratified by the user 2026-07-29 on the grounds that
  each is the same question over a per-route vocabulary, the rationale the other
  19 entries already use. Renaming instead would have broken live bookmarks. Its
  in-app mode switch also **disagreed with the nav rail**: `applyModeTarget`
  constructed and carried only `staff`, while `setSidebarUrl({ mode })` cleared
  four keys and let `sku`/`bin`/`unit`/`state`/`condition` through. Both now
  construct, so a mode switch opens clean either way — that was a real behaviour
  change, deliberately taken to remove two shapes for one job.

- **`/warehouse` had the most instructive clear list of the whole refactor.**
  `setTab` stripped `status`/`q`/`room` when leaving Bins and `code` when leaving
  Racks — a *conditional* denylist — but never `serial`, `showEmpty`, `view`,
  `new` or `edit`. So a scanned serial and the Map toggles rode every tab switch,
  and each filter added to any tab was one more leak nobody would remember. It is
  the clearest argument in the codebase for construct-don't-copy.
- **`/pack` closed a `UNDECLARED_PARAM_CONSTANTS` excuse.** `packview` was excused
  only because `/pack` had no spec; declaring it let the entry go, so that
  allowlist shrank as designed. `focusShippedSearch` is the only entry left, and it
  is not a param anything reads back.
- **`/review` needed no new shared keys** (`packerLogId`/`orderId`/`choreId` are
  unique to it); `/warehouse` needed exactly one, `serial`. Total ratified shared
  additions across the pass: `tab`, `openRepair`, `state`, `section`, `unit`,
  `sku`, `filter`, `serial`.
- **Mount the parse via `@/components/routing/SurfaceParamHygiene`**, not the raw
  hook — it handles the Suspense boundary and works from an async server-component
  page. Its docblock is the placement SoT.

`/products` was the ninth and is now done — it is the worked example. Its leak
was real and reproducible: QC → Catalog carried `skuId`, `q`, `historyId` and
`sort`, because `ProductsSidebarPanel.handleViewChange` patched `?view=` onto a
copy of the whole query string. It never had a denylist to delete; it had never
been given one, which is why the "delete the denylists" sweep passed it by.

**Do the isolation tier (§2's seven steps) for each remaining surface — that is
correctness.** Segment migration is the separate, optional, structural tier:
layout ownership, route-level code-splitting, server-side gating. Do those
**one surface per change**, only where a surface actually wants a layout. A
surface with no layout need is fine left as a query-mode surface forever; that
is a legitimate end state, not debt.

Two traps the `/products` pass turned up, both worth checking on the next surface:

- **`OWNED_TREES` used to silently skip single files.** `walk()` swallowed the
  `readdirSync` throw, so a file entry enumerated nothing — and every sidebar
  panel is a top-level file in `components/sidebar/`, i.e. exactly the component
  that writes the mode URL. It now accepts a file or a directory and throws on a
  stale path. **Add the surface's `SidebarPanel.tsx` explicitly**, not just its
  component directory.
- **The guard only reports params NO spec declares.** It will not tell you that
  the surface reads `q` / `sort` / `view`, because some other route already owns
  them — and your spec still has to declare them or the boundary parse drops
  them. Enumerate the full set separately:
  ```bash
  grep -rhno "\.get('[a-zA-Z_][a-zA-Z0-9_]*')" <surface dirs> | sed "s/.*\.get('//;s/')//" | sort -u
  ```
- **That grep — and the guard's own regex — are blind to CONSTANT-keyed reads,
  and this is the trap that has cost the most.** A param read as
  `searchParams.get(SOME_CONSTANT)` matches no literal pattern, and the modules
  that do it (`@/utils/*-workspace-state`, `@/lib/station/table-url-params`,
  `@/design-system/components/RouteShell`) sit **outside every surface tree**, so
  no `OWNED_TREES` entry reaches them either. The `/test` pass (2026-07-29) found
  **four live drops** this way, all invisible to a green guard:
  - `?ship=` / `?testTab=` — the Testing/Shipping workspace tabs.
  - `?pane=` — `RouteShell`'s MOBILE pane toggle. Already broken on `/test` and
    the receiving surfaces: tapping "Actions" wrote the param and the hygiene
    hook stripped it, so the pane snapped back to History.
  - `?layout=` / `?density=` / `?weekOffset=` — the station-table contract.
    `SAVED_VIEW_PARAM_KEYS` captures these for four station surfaces, so
    **applying a saved view on `/receiving/history`, `/incoming` or `/test`
    reverted instantly**. Pre-existing, not introduced by that pass.

  Always run the constant sweep too, and resolve each hit to a route:
  ```bash
  grep -rnE "^\s*(export )?const [A-Z][A-Z0-9_]*_PARAM(S)? *(:[^=]*)?= *'[a-zA-Z_][a-zA-Z0-9_]*'" src --include="*.ts" --include="*.tsx" | grep -vE "\.test\.|\.spec\."
  ```
  `param-ownership.guard.test.ts` now asserts every `*_PARAM` constant's key is
  declared by some spec (or excused in `UNDECLARED_PARAM_CONSTANTS` with a
  reason), which closes the class. **Read its "Known limit" note** — it checks
  *some* spec, not *the reading route's* spec, so a key owned by one route and
  read on another spec-backed route still slips through.
- **A shared shell's param is usually AMBIENT, not owned.** `pane`, `layout`,
  `density`, `weekOffset` joined `staff`/`colsort`/`coldir` in `AMBIENT_PARAMS`
  because a design-system component asks the identical question on every surface.
  Declaring such a key per-route would need a `SHARED_OWNED_KEYS` entry per
  owner, and that list is supposed to shrink.

Reference implementation: `/shipping` (Slice 3). Note what it taught —
`SidebarContextPanel` mounts the panel by route key, so a segment's `page.tsx`
owns only its workspace. `RouteShell`'s `actions` slot is the MOBILE tab.

### 3.2 D2 — `/products/[sku]` → `/products/sku/[sku]` — **DONE**

Page moved to `src/app/products/sku/[sku]/page.tsx`; both producers now compose
`productDetailHref()` from `@/components/products/products-view` instead of
building the path inline (`lib/gs1/resolver.ts`, `ProductsCatalogWorkspace`).

**The regex this file previously recommended was broken — do not restore it.**

```ts
// WRONG — shipped an infinite redirect
'/products/:sku((?!sku$|catalog$|manuals$|labels$|pairing$|qc$|kit$).*)'
```

`sku$` exempts only the bare `/products/sku`. `/products/sku/CABLE-001` — the
redirect's own destination — still matches, because `.*` happily swallows
`sku/CABLE-001` and the lookahead only fires when the remainder is *exactly*
`sku`. Every hop prepends another `sku/`: `ERR_TOO_MANY_REDIRECTS`, product
detail unreachable. Anchor each alternative on **segment end, not path end**:

```ts
{ source: '/products/:sku((?!(?:sku|catalog|manuals|labels|pairing|qc|kit)(?:$|/)).*)',
  destination: '/products/sku/:sku', permanent: false },
```

`src/lib/routing/products-detail-redirect.guard.test.ts` **compiles** the pattern
out of `next.config.ts` and runs real paths through it — a list check passes the
broken draft, which is exactly how it got recommended twice. It also pins the
lookahead to `PRODUCTS_VIEWS` and holds the 307 until D3.

Products segments are now unblocked. Inventory / dashboard were never blocked by
this.

### 3.3 `/dashboard` — boundary parse **COMPLETE** (2026-07-30)

`SurfaceParamHygiene` mounts on the leaf [`app/dashboard/page.tsx`](../../src/app/dashboard/page.tsx).
The presence-flag schemas (`paramPresence`) and hand-off keys (`fba` / `wstatus` /
`wexp` / `warranty`) were already declared; the pre-mount sweeps found the live
filter band the ownership guard could not see (`shippedFilter`,
`shippedSearchField`, `shippedWeekOffset`, `ostatus`, `exceptions`, `carrier`,
`statusCategory`, `packedBy`, `testedBy`, `dateFrom`/`dateTo`, `stage`, `late`,
`new`, plus inbound `rh_*`) because those readers live under `components/shipped`
and `components/unshipped`. Those trees are now in `OWNED_TREES`.

Pinned by `tests/e2e/surface-param-isolation.spec.ts` (`/dashboard` cases) and the
existing `dashboard-search-state.test.ts` hand-off assertion.

### 3.4 D3 — the 307 → 308 sunset

Live today: 6 × `permanent: false` in `next.config.ts`, no middleware. **Correct
for now** — a 308 is cached by browsers permanently and cannot be withdrawn.

At sunset, do these together in one change:
- flip the `/shipping` mode redirects to `permanent: true`
- flip the `/products/:sku` detail redirect (§3.2) — its guard asserts the 307,
  so that assertion flips in the same change or the gate fails
- delete the two dual-read shims that exist for the same legacy links:
  `modeFromParam` in `useReceivingMode.ts`, and the `?? parseOutboundMode(...)`
  fallback in `useOutboundUrlState.ts`

Gate on evidence, not a date: no legacy `?mode=` hits in logs for a full cycle.

### 3.5 V9c — server-side permission gating *(ASK FIRST)*

The original plan wanted the permission gate moved into each segment's
`layout.tsx`. **Not done deliberately.** `shipping.view` is enforced per API route
and by nav filtering; adding a page gate is a change to the security model, not
to routing, and `AGENTS.md` puts security in Ask-first. A subtly wrong gate is a
lockout. Raise it as its own proposal or leave it.

---

## 4. Instructions from the old prompt that are now WRONG

Recorded so they are not re-derived. Each was checked against the code.

- **"The 8 remaining surfaces are already isolated" — from an earlier revision of
  THIS file (§3.1).** False: none of them had a param spec, so `applyModeTarget`
  never reached its construct branch for them. Corrected in place above. The
  lesson generalises — **"isolated" is a property of the registry, not of the
  refactor's reputation.** Resolve the spec before claiming a surface is done.
- **The D2 redirect regex this file recommended (§3.2).** `sku$` did not exempt
  `/products/sku/<sku>`, so the rule matched its own destination and looped.
  Corrected above; the guard now compiles the pattern rather than reading it.

- **"Namespaced mode ids (§4)."** Unnecessary. The plan lists eleven collisions;
  two survive (`labels` across outbound/warehouse/products, `pairing` across
  review/products) and both are harmless — every lookup is page-scoped
  (`activePage.modes.find(...)`) and `useRecentModes` keys entries as
  `` `${pageId}:${modeId}` ``. There is no global mode-id namespace to collide in.
  Renaming would touch 13 pages and every panel comparing a mode id, to fix
  nothing.
- **"Collapse `getSidebarRouteKey` (V9b) — the biggest deletion available."**
  Inverted by the `ContextPanelLayout` refactor, which dispatches every route's
  panel *by route key*. 17 call sites including `SidebarContextPanel`,
  `useHasSidebarContext`, `useSidebarModeNav`. It is load-bearing infrastructure.
- **"Fix `warmActiveView` (V9a)."** It reads `window.location.search` because the
  Dashboard genuinely is a query-mode surface; its spec declares `mode`. Nothing
  is broken until the Dashboard takes segments. Changing it now is the wrong
  order.
- **"D1 — persistent mode rail vs MasterNav dropdown."** Answered outside this
  plan by the sidebar spine + accordion + spline work. The plan's V7 warning about
  horizontal pills overflowing at 6 modes is moot; the spine went vertical.
- **"Slice 2: convert `receiving-package-updated` / `receiving-scan-resolved` /
  `sku-pairing-updated` to mutation `onSuccess`."** All three blocked on the same
  unstated precondition — their consumers are not on react-query.
  `receiving-package-updated` carries a payload used for optimistic `setState`
  patching, so converting it would *remove* optimistic patching. Left in place.
- **"Delete `receiving-clear-line` once Slice 1 makes it redundant."** Slice 1 did
  not. Two of its three emitters are in-surface tab switches
  (`useUnboxWorkspaceTab`, `useTriageWorkspaceTab`) that legitimately keep
  `recvId`. Left in place.
- **"38 `app-refresh-data` emit sites."** The real total was ~70 across five
  mechanisms: `dispatchEvent(new CustomEvent(…))`, bare `new Event(…)`,
  `emitAppEvent(APP_REFRESH_DATA)`, declarative name arrays consumed by
  `useSidebarRail` / `useMobileFeed`, and `useEventBridge` handler maps. Grep all
  five before estimating any bus migration.

---

## 5. Hard constraints

- **Never state that route segments strip query params.** Isolation is no-copy +
  schema (§0).
- **Never raise a `verify` ratchet baseline** to land a change. Baselines only
  shrink. `UNDECLARED_READS` in the ownership guard is currently **empty** — an
  addition to it is a claim that a param is read but owned by nobody.
- **Do not touch the six API routes that read `?mode=`** (`support/tickets/link`,
  `fba/logs/summary`, `repair/ecwid-products`, `kiosk/repair/ecwid-products`, two
  Zoho crons). Unrelated domain params.
- **Do not restyle.** No new visual language, tokens or geometry.
- **Do not swap the router.** Next.js App Router stays.
- Preserve `SidebarShell`, `SidebarRailShell` / `useSidebarRail`, route-level
  code-splitting, the permission model, and the Station/Workbench/Monitor/Canvas
  region contracts.
- Mobile (`/m/*`) stays a parallel tree. Not in scope.
- `npm run verify` green before each change lands. Commits only when asked.

---

## 6. Known-unrelated failures in this tree

Do not chase these as regressions:

- **`/api/shipping/ready-queue` returns 500** — `invalid input value for enum
  fba_shipment_status_enum: ""`. Pre-existing; that is why `/shipping/ready` shows
  its error box. Has its own task chip.
- **`sidebar-nav-column.spec.ts` fails on every route** asserting the spine
  *pushes* rather than covers. That spec is ahead of its implementation — nothing
  pushes content on `navOpen` yet, and `SidebarSlideOver.tsx` was deleted
  mid-refactor.
- **`tests/.auth/qa-admin.json`** — if the `qa-desktop` Playwright project skips,
  run `pnpm provision:qa-org`. The QA sandbox has 2 orders / 3 SKUs, so specs
  written against dogfood data volume may legitimately fail there.
- **The dev server cycles during long e2e runs.** A crashed worker produces a
  cascade of ~180ms "failures" that look like real breakage. Check the server is
  up before reading them.
