## Progress log — 2026-08-29 (/search 80 → 92-94; two measurement bugs found)

**Shipped: `/search` shell seed. 80 → 94, then 92 on a re-run — both clear the
92 target.** SI 3529→1533-1671ms, LCP 2275→1319-1518ms. Floor ratcheted to 92.

`seedSearchRecentRail` (`src/lib/queries/search-recent-shell-seed.server.ts`),
dispatched from `maybeSeedShell`. Bare `/search` painted nothing data-shaped
until a **two-hop** client chain landed: hydrate → fetch the `searchRecent` rail
→ auto-select `rows[0]` (writes `?sel=`) → fetch the record → paint. The rail is
a SHELL sibling of the page, so a page-level `HydrationBoundary` can never reach
it — same ordering fact that put `/unbox` on this path.

Passes both RSC-seed gate clauses: ranks on `receiving_line_views`
(`idx_receiving_line_views_staff_recent`, a single index probe) and then
pre-limits the display laterals via `receiving_id_in`. Verified landing, not
assumed: the served `/search` HTML carries the dehydrated
`['receiving-lines-table','rail','search-recent',…]` key with **20 rows**.
The centre pane is deliberately NOT seeded — `/api/receiving/[id]` is a
300-line route-inline SELECT with no extracted builder, so seeding it would
mean a `serverSelfFetch` on TTFB, the trade the removed `/triage` seed lost.

---

### Measurement bug 1 — the `/signin` baseline measures the wrong page

`scripts/lighthouse-audit.mjs` exports one `LH_COOKIE` for the whole run, so
`/signin` is audited **signed in**. `layout.tsx` gates public chrome on
`!initialUser`, so with a cookie the sign-in page renders the entire warehouse
client: the LHR shows `/api/staff`, `/api/staff-messages`, `/api/inbox/support`,
`/api/staff-preferences`, `/api/realtime/token` and a live **Ably** connection
on the public login page. Every `/signin` figure in `lighthouse-baseline.json`
(73-78 since July) describes a scenario a real visitor never hits.

Measured both ways on the same build: **signed-in 72, signed-out 78**
(SI 2931→1608ms, TBT 425→297ms).

**Fixed 2026-08-29.** `cookieFor` now honours the manifest's `auth: false`, so a
public route is audited without a cookie even when `LH_COOKIE` is exported. The
scenario is recorded per route in the baseline (`scenario: "signed-out"`) and
`--check` enforces it exactly like `formFactor` — a mismatch prints
`STALE BASELINE` and exits 1 (verified by flipping the field: it failed, then
passed once re-seeded). `/signin`'s floor was re-seeded through the tool against
the correct scenario: measured 78, floor 75 (the lowest of four median-of-3 runs
— 75/77/78/78 — so the nightly gate catches a real regression like the 72
signed-in variant without flagging run-to-run noise).

### Measurement bug 3 — the cookie header did not survive redirects

`extraHeaders` becomes `Network.setExtraHTTPHeaders`, which Chrome does NOT
re-apply when it follows a cross-document redirect: it recomputes `Cookie` from
the jar, and the jar was empty. Every redirecting route therefore arrived signed
out. `/dashboard` path-redirects to `/shipping/orders`, whose next hop bounced to
`/signin?next=%2Fshipping%2Forders`, so the audit scored the SIGN-IN PAGE as
`/dashboard` — Perf 99, LCP 987ms — and `--check` skips routes flagged
redirected, so this Tier-1 entry gated nothing. `curl` with the same cookie
followed the same chain to a 200, which is exactly why it read as an expired
mint rather than a harness bug.

Fixed with `seedCookieJar`: before each run the session is written into Chrome's
jar over CDP (`Storage.setCookies`, no new dependency — Node's global
`WebSocket`), so it is sent on every hop like a real browser. Header injection
stays as a fallback, and is skipped when seeding succeeds so the two cannot
conflict. `/dashboard` now resolves `307 → /shipping/orders → 200` and was
re-seeded on the real page: **Perf 90-96, LCP 1.2-1.8s, SI ~1.3s** (the old
entry claimed Perf 67 / LCP 12182ms and described a different page).

Two things this surfaced, both real rather than artifacts:

- **`/dashboard` Accessibility is 89**, under the ≥90 floor. Invisible while the
  route was scoring the sign-in page (94). Needs a fix on the To-ship desk.
- **SEO on signed-in routes is ~63, not 91.** `robots.txt` is `Disallow: /` —
  correct for a private WMS — but it is itself behind auth, so Lighthouse's
  unauthenticated fetch used to be redirected and it never read the file. With
  the jar seeded it does. `--check` now enforces `seo` only for
  `scenario: "signed-out"` routes, which is what the runbook's target table
  said all along; the `seo: 91` floors on authenticated entries are stale
  informational values until those routes are re-seeded.

### Measurement bug 2 — `next/dynamic` in a Server Component does not split (Turbopack)

`app/layout.tsx` documented `WarehouseShell` as code-split, and it was not.
The public branch rendered correctly (sign-in card in the HTML, no `MasterNav`,
no `InstallPrompt`) while the page still shipped
`<script src=".../db436df3b2340e81.js">` — the warehouse chunk — and the framer
runtime with it. **155KB gz of `/signin`'s 518KB (29%) was operator client it
never renders.**

Fixed by moving the branch into a client component (`AppShellSwitch`), where
`dynamic()` is the ordinary supported lazy case. No `ssr: false` anywhere; the
warehouse branch still server-renders. Result: **518 → 365KB gz, 36 → 25
chunks.**

**It did not move the score** (LCP 4520 → 4519ms). Recording that plainly: on
the mobile profile Lantern charges simulated LCP against the script graph, and
365KB is still far past the point where that dominates — consistent with the
"Simulated LCP is not observed LCP" section of `LIGHTHOUSE.md`. The bytes are
genuinely gone for real signed-out visitors; the *score* needs either a much
deeper JS cut or an honest environment (preview deploy — operator's call, it
ships the dirty tree).

### Barrel altitude — `@/design-system/primitives` carries the motion engine

The barrel re-exports seven engine-importing primitives (`CardShell`,
`StaggerReveal`, `ChevronToggle`, `SlicedActionDock`, `Popover`,
`OmnichannelComposerDock`, `ProgressBar`), and a LOCAL barrel is not covered by
`optimizePackageImports`. So `import { Button } from '@/design-system/primitives'`
put the whole engine on the importer's graph. Switched to deep paths on the
public-chrome family + `StepUpModal` (root layout, so it taxed every route):
signin page graph 106 → 28 modules, root layout 240 → 172, engine importers
14 → 0. Deep imports are already the house shape (108 pre-existing call sites).

Also: `Button` (989 call sites, every route) statically imported the engine for
one `whileTap` scale. Now CSS `enabled:active:scale-[0.96]`, compositor-only.
`ReducedMotionProvider` moved out of the root layout into `WarehouseShell`,
which creates the invariant **public-chrome routes may not use framer** —
import primitives by deep path there.

**Next lever for `/signin`** (in order): fix the harness cookie scoping; then
the remaining 365KB — 68KB react-dom, ~59KB engine still arriving via lazily
loaded components that pull the top-level `@/design-system` barrel, 32KB of the
`motion-framer` preset catalog, 29KB server actions.

---

## Progress log — 2026-08-11 (Unbox LCP = MRU middle carton)

**Shipped:** LCP stand-in is the **MRU carton middle** (identity + PO lines from
`seed.mruLines`), not Browse lists / restore pulse skeleton.

- Hold `UnboxStationFirstPaint` until `ReceivingLineWorkspace` mounts (or
  settled empty). Never release onto `showRestoreSkeleton`.
- Paint order (CWV + WMS ops): P1 above-fold primary work in SSR HTML → P2
  context rail → P3 Displays bodies stay `dynamic()`. Target Perf ≥ 90 once
  measured; do **not** ratchet baseline until a real win.

---

## Progress log — 2026-08-11 (Unbox station-first cold load)

**Shipped:** bare `/unbox` is **station-first**, not browse-first.

- RSC `seedUnboxStation` — Unboxed rail (`view=unbox_opened`) + MRU carton
  siblings; **no** Queue spine on cold land.
- LCP stand-in: `UnboxStationFirstPaint` (MRU identity or empty scan copy).
- Client auto-opens MRU when `shouldAutoOpenUnboxMru` (no `openReceivingId`,
  no `unboxdesk`). Back to list / Browse lists → `?unboxdesk=1` (tables only
  then). Opening a carton clears desk.
- `UnboxLineWorkspace` does **not** keep-alive `UnboxWorkspaceView` under the
  carton; desk sheet is `dynamic()` gated on `unboxdesk`.
- Guards + SoT Paint updated. **Do not** ratchet `lighthouse-baseline.json`
  until a measured win.

---

## Progress log — 2026-08-10 (Unbox Phase 1 — kill skeleton-as-LCP)

**Phase 1 shipped (verified corrections to Gemini D9):**

- `UnboxBrowseFirstPaint` empty seed → hard text
  (`Queue empty — scan Ticket · Tracking · PO`) — **no** `animate-pulse` bars.
- `UnboxWorkbenchSkeleton` flush (`cornerClass('flush')` / `!rounded-none`);
  stripped `rounded-lg` / `rounded-full` / `shadow-sm`; table skeleton pad gone.
- `UnboxWorkspaceView` **static** import of `ReceivingLinesTable` (dropped
  `dynamic` + `UnboxTableCardSkeleton` loading flash). RightPane already
  static-imported the same module — Gemini’s “dual dynamic” claim was stale.
- **Kept** `UnboxBrowseShell` `opacity-0` handoff (To-ship
  `OutboundOrdersDeskShell` parity) — deleting it while children can paint a
  skeleton body would cover FirstPaint and worsen LCP.
- Guard: `unbox-browse-first-paint.guard.test.ts`. SoT Paint: skeletons are
  geometry, not LCP. **Do not** ratchet `lighthouse-baseline.json` until a
  measured win.
  *(Superseded for cold `/unbox` LCP by 2026-08-11 station-first — Queue
  stand-in is desk-only.)*

---

## Progress log — 2026-08-06 (paint content order + To-ship / Unbox seeds)

**SoT law shipped:** P0 shell → P1 primary → P2 context → P3 trailing in
`.claude/rules/source-of-truth.md` + `AGENTS.md`. Registry:
`src/lib/observability/tier1-paint-order.ts`. Guard:
`tier1-paint-order.guard.test.ts`.

**To-ship (`/shipping/orders`, `/dashboard` alias):** Packer-style
`HydrationBoundary` + `seedUnshippedQueue` + `OrdersQueueFirstPaint` LCP
stand-in. Dropped `ssr: false` on `DashboardShippedTable`. Filter URL writes
use `startTransition`; Unshipped search uses `useDeferredValue`.

**Unbox / Arrival:** RSC `seedUnboxQueue` dehydrates **Queue** spine (bare
`/unbox` default tab) into the same key `useReceivingLinesQuery` mounts with,
and streams `UnboxBrowseFirstPaint` as the LCP stand-in (To-ship
`OrdersQueueFirstPaint` dual-mount: page `sr-only` + `UnboxBrowseShell`
opacity handoff). Arrival still warms History via `seedUnboxSpine`. Displays
P3 bodies (Ticket / Photos / Timeline / Support) are `dynamic()` in
`unbox-tabs` and Testing `build-testing-displays`.

**Progress — 2026-08-10 (Unbox SSR row stand-in):** Seed retargeted History →
Queue; `{ state, rows }` + `UnboxBrowseFirstPaint` + `UnboxBrowseShell`. Measure
`/unbox` with the workflow below before ratcheting `lighthouse-baseline.json`.

**Search:** `GlobalHeaderSearch` + `SearchBrowseShell` are LCP (marks
`search:chrome` / `search:primary`). No locked-width stage field.

Measure with the workflow below and ratchet only after a genuine LCP win.

---

# Handoff — Tier-1 LCP: kill the hydrate-then-fetch waterfall

Continuation of the 2026-07-19 Lighthouse initiative (see `results-2026-07-19.md`).
Bundle weight is done; this is the remaining architectural lever.

---

## Progress log — 2026-07-20 (step 1 shipped, step 2 disproven on /dashboard)

**Shipped: step 1 — soften the `mounted` gate (kept).** `ResponsiveLayout.tsx`'s
blank-until-hydrated gate now only blanks **mobile-allowed** non-`/m` routes (which
still flip to a content-only mobile branch after device detection and would flash).
**Desktop-only routes** (not in `MOBILE_ALLOWED_PREFIXES` — `/dashboard`, `/operations`,
`/support`, `/products`, `/settings`, …; a phone bounces them to `/m/home`, so there
is no in-place mobile branch to flash) now paint their **server-rendered shell**
pre-hydration. Build-verified across all 502 pages (desktop shell had never SSR'd
before — `GlobalHeader` et al. are SSR-safe). Measured on `/dashboard` (mobile,
slow-4G, median of 3):

| | Perf | LCP | TBT | CLS |
|---|---|---|---|---|
| Baseline | 67 | 12182ms | 69 | 0 |
| **+ step 1 (shell SSR)** | **68** | **9768ms** | 80 | 0 |

→ **LCP −2.4 s (−20%), no CLS/TBT regression.** This is a genuine win and is the
change left in the tree. It lifts first paint on *every* desktop-only route, not
just `/dashboard` (only `/dashboard` was measured — a full `--tier 1` run should
confirm the others and then ratchet `lighthouse-baseline.json`).

**Disproven & reverted: step 2 — server-seed the first collection (`/dashboard`).**
Built the full RSC `HydrationBoundary` seed: extracted the pure order transforms +
a shared query-key builder (no drift), a `server-only` seed helper that self-fetches
`/api/orders` (auth cookie forwarded) and dehydrates the exact `unshipped` key the
table mounts with, and a `Suspense`-streamed `page.tsx`. **Verified the seed streams**
(75 `order_id` rows + `HydrationBoundary` in the initial HTML). **But it did not move
LCP:**

| | Perf | LCP | TBT |
|---|---|---|---|
| step 1 only | 68 | 9768ms | 40–80 |
| step 1 + seed | 66 | 9635ms | 40 |

**Root cause (important for the next agent):** on `/dashboard` the LCP element is the
orders table, and `DashboardOrdersView` is `dynamic(..., { ssr: false })`
(`DashboardOrdersView.tsx:~29`). So the table paints **only after its JS chunk
downloads + hydrates** — LCP is **JS/hydration-bound, not fetch-bound.** Seeding
removed a network fetch that already overlapped JS download while adding ~74 KB of
inline HTML + a server self-fetch → net neutral-to-slightly-negative. **Data-seeding
cannot help LCP while the LCP element is behind `ssr: false`.** Reverted; step-1 kept.

**Corrected next lever (was step 2):** make the workbench's first meaningful paint
not depend on the heavy `ssr: false` client table. Options, riskiest last:
1. Render a **server-side static first-paint of the rows** (a lightweight RSC list of
   the seeded rows shown until the interactive table hydrates over it) — this makes an
   SSR'd element the LCP, so a seed *would* pay off. Needs a dumb server row renderer.
2. **Drop `ssr: false`** on `DashboardOrdersView` so it SSRs (then a `HydrationBoundary`
   seed paints server-side). Higher risk — the table has never SSR'd; audit for
   render-time browser globals first.
3. Split/shrink the table chunk so hydration is cheaper (bundle lever, not covered here).

The reverted step-2 scaffolding (transform extraction + `dashboard-query-keys.ts` +
`dashboard-seed.server.ts`) is straightforward to reconstruct from git history if
option 1/2 is taken — it was correct, just aimed at the wrong bottleneck.

---

## Mission

Raise the five sub-70 Tier-1 routes to Performance ≥ 70 (mobile, slow-4G, median of 3)
by making meaningful content paint without waiting for **JS download → hydrate →
client fetch → render**:

| Route | Perf | LCP | Initial JS (gz) |
|---|---|---|---|
| /dashboard | 67 | 12.2s | 633 KB |
| /unbox (old /receiving, 307s here) | 68 | 11.6s | 971 KB |
| /triage | 69 | 12.3s | 964 KB |
| /test (old /tech) | 69 | 10.3s | 1030 KB |
| /search | 68 | 11.9s | 494 KB |

Already passing (do not regress): /signin 78, /packer 77, /m/receive 77, /m/scan 76, /m/home 71.
TBT is 22–158 ms and CLS ≈ 0 everywhere — protect both; LCP is the only lever left.

## Diagnosis (verified)

- FCP is ~1.7 s (shell paints fast); LCP element is the route's data content,
  painted only after client-side TanStack Query fetches that start post-hydration.
- `ResponsiveLayout` (`src/components/layout/ResponsiveLayout.tsx`) returns a
  **blank div until a client `mounted` flag flips** (line ~197) — so nothing the
  server rendered ever paints for desktop routes. The whole shell is client-gated.
- Pages are `'use client'` monoliths; root layout (`src/app/layout.tsx`) does
  `await getInitialAuthUser()` (React `cache()`d) then renders the provider tree.
- `loading.tsx` files exist on Tier-1 routes (shared `RouteLoading` primitive) but
  can't move LCP — LCP is the *final largest* paint.

## Attack order (measure after each)

1. **Cheapest: soften the `mounted` gate.** The blank-until-mounted return exists
   for device-mode flip-flash. If desktop SSR HTML (header + sidebar shell +
   loading body) can paint pre-hydration without a mobile/desktop flash, first
   paint gets richer and perceived/SI improves. Careful: `useUIMode`'s device
   detection is client-only; `/m/*` already bypasses the gate deterministically.
   Consider CSS-only responsive rendering for the gate frame instead of JS state.
2. **Seed the first collection payload server-side.** Options, in house-pattern
   order — pick per route after reading the page's data hooks:
   - RSC parent fetches the first page of the route's primary collection (org
     from `getInitialAuthUser()`; reuse the existing domain query helpers, never
     raw SQL) and passes it as `initialData` / `HydrationBoundary` into the
     existing TanStack hooks. Keys must match exactly (`src/queries/keys.ts`).
   - Or `<link rel="preload" as="fetch">` for the first API call so the fetch
     overlaps JS download instead of following hydration.
   - `/search` likely just needs its empty-state/recents to be the LCP rather
     than waiting on a fetch.
3. **Re-audit, ratchet, document.** Update `lighthouse-baseline.json` via
   `--update-baseline` only after a genuine improvement.

## Measurement workflow (working, use as-is)

```bash
# A dev server usually occupies :3000 and OWNS .next — always build isolated:
NEXT_DIST_DIR=.next-perf pnpm build
AUTH_PINLESS_SIGNIN=true NEXT_DIST_DIR=.next-perf npx next start -p 3200   # background
export LH_BASE_URL=http://localhost:3200
export LH_COOKIE="$(node scripts/lighthouse-mint-session.mjs)"
node scripts/lighthouse-audit.mjs --routes /dashboard,/unbox --runs 3       # spot check
node scripts/lighthouse-audit.mjs --tier 1 --runs 3                         # full round
```

- Runbook: `docs/performance/LIGHTHOUSE.md`. Manifest lives in
  `scripts/lighthouse-audit.mjs` (`/test` + `/unbox` are the real routes).
- Rebuilds while the perf server runs corrupt the serve — kill the :3200
  listener first, rebuild, restart. Never touch the dev server on :3000.
- JS payload per route: grep `<script src=` tags from the served HTML and
  gzip-sum the chunks from `.next-perf` (see results doc for the one-liner).

## Hard constraints (unchanged)

- `AGENTS.md` is law: `npm run verify` green before done; no DS-ratchet baseline
  increases; no `--no-verify`; user manages commits (never stash — other agents
  share main with uncommitted work); org scoping via existing domain helpers.
- `src/lib/db.ts` is `import 'server-only'` — a client path to it is a build
  error naming the chain. Fix altitude (split a light module); never drop the guard.
- Do not re-add: static feature-panel imports in `SidebarContextPanel`, static
  `printLabel`/`labelCommands`/bwip imports (all lazy now), barrel re-exports of
  `tenancy/db` modules (`lib/stations/index.ts`, `lib/channel-allocation/index.ts`).
  Rules recap: `.claude/rules/build-gotchas.md` → "Bundle altitude".
- Scan flows and station behavior are safety-critical; verify /unbox and /test
  still scan-and-render after changes (dev server + real interaction, or e2e).

## Deferred (ask first, out of scope here)

Station-graph splitting via the block registry; theme-palette CSS split;
blocking Lighthouse CI. Log a "Compound opportunities" note when done and append
a worklog entry (`pnpm worklog "…" --result success`).
