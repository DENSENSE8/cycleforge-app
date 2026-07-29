# Nav / routing refactor — finish prompt

**Self-contained.** A new session needs only this file. Paste:

> Read `docs/todo/nav-routing-refactor-FINISH-PROMPT.md` and execute item 1.

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

---

## 3. What is left, in priority order

### 3.1 The isolation tier is NOT finished — 8 surfaces still leak

> **Corrected 2026-07-29.** This section previously read "They are already
> isolated. The remaining benefit is … not correctness." **That was wrong**, and
> it is the most expensive error in this file, because it retires the highest-
> value work left. Do not restore it.

`fba`, `inventory`, `packer`, `review`, `sourcing`, `tech`, `walk-in`,
`warehouse` still switch mode by `?mode=` **and none of them has a param spec.**
`applyModeTarget` only constructs when `routeParamsFor(target.pathname)` resolves;
with no spec it falls through to the legacy copy-forward, so the whole query
string still rides along. Check before assuming otherwise:

```bash
npx tsx -e "import {routeParamsFor} from './src/lib/routing/registry';
for (const p of ['/fba','/inventory','/packer','/review','/sourcing','/tech','/walk-in','/warehouse'])
  console.log(p, routeParamsFor(p)?.route ?? 'NO SPEC — still copy-forward')"
```

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

### 3.3 Blocker for the `/dashboard` migration — presence flags die at the boundary

`DASHBOARD_ROUTE_PARAMS` declares `unshipped` / `shipped` / `pending` / `fba` /
`warranty` as `paramText`, but the app writes them as **valueless presence
flags** (`?shipped`, `params: { unshipped: '' }`) and reads them with `.has()`.
`paramText` requires `min(1)`, so the boundary parse drops every one of them:

```bash
npx tsx -e "import {routeParamsFor} from './src/lib/routing/registry';
import {parseRouteParams} from './src/lib/routing/route-params';
const s = routeParamsFor('/dashboard');
console.log(JSON.stringify(parseRouteParams(s, new URLSearchParams('shipped')).toString()))"  # => ""
```

Latent today only because `/dashboard` does not mount `useSurfaceParamHygiene()`.
**§2 step 6 adds exactly that**, at which point a pasted `/dashboard?shipped`
silently lands on Unshipped. Add a presence-flag schema that accepts `''` (and
decide whether the canonical written form becomes `?shipped=1`) **before**
graduating the dashboard, not after.

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
