# Lighthouse performance runbook

How to measure, what the targets are, and how the ratchet works. The audit
tooling lives in `scripts/lighthouse-audit.mjs` + `scripts/lighthouse-mint-session.mjs`;
the committed floor is `lighthouse-baseline.json`.

## Targets

**The goal is Performance ≥ 92 on every route** (operator ruling 2026-08-27,
raised from 90), **and ≥ 90 in every other category.** As of the 2026-07 audit
only Performance is short — Accessibility 93–95, Best Practices 96, SEO 91,
CLS ~0 and TBT 22–158 ms already clear it everywhere.

| Category | Target | Status (2026-07) |
|---|---|---|
| Performance | ≥ 92 | **67–78** — the whole gap |
| Accessibility | ≥ 90 | 93–95 ✅ |
| Best Practices | ≥ 90 | 96 ✅ |
| SEO | ≥ 90 public routes (`/signin`, `/signup`, `/share/photos/*`) | 91 ✅ |
| LCP | ≤ 2.5 s | **5.9–12.3 s** — the whole of Performance |
| TBT | ≤ 600 ms | 22–158 ms ✅ |
| CLS | ≤ 0.1 | ~0 ✅ |

So "Lighthouse 90" is not a hundred small fixes. It is **one** problem: the
data-heavy workbenches (`/dashboard`, `/unbox`, `/triage`, `/search`, `/test`)
render a shell, hydrate, and only *then* fetch their first collection, so LCP
waits on a post-hydration round trip. Streaming that first payload server-side
is the single lever that moves all five. Bundle weight was already cut 61–68% in
the 2026-07 initiative and is no longer the constraint.

### Form factor is a deployment claim, not a preference

Every route pins `formFactor` in the `ROUTES` manifest, and it drives **viewport
and throttling together**. This is a warehouse management system: the dense
sheet/grid workbenches run on workstations on the warehouse LAN, `/m/*` is the
handheld tree, `/kiosk*` is a mounted landscape tablet. Scoring a desk workbench
as a budget phone on simulated slow-4G measures a scenario that never happens.

Two bugs here were fixed on 2026-08-22, and both had been quietly distorting
every number:

- `lhOptions` set `formFactor: 'desktop'` without setting `throttling`.
  Lighthouse derives only `screenEmulation` from form factor — throttling
  defaults to `mobileSlow4G` regardless. So `/unbox`, `/test` and `/kiosk*` were
  measured at desktop viewport on a phone's cellular link and 4× CPU slowdown.
- The other five desk workbenches were never repinned at all.

Because scores are only comparable within one profile, `lighthouse-baseline.json`
now records `formFactor` per route and `--check` **fails loudly** when a floor was
measured under a different profile, instead of silently passing.

Route tiers are declared in the `ROUTES` manifest inside `scripts/lighthouse-audit.mjs`.
Tier 1 = operator-critical floors (`/signin`, `/dashboard`, `/receiving`, `/triage`,
`/packer`, `/tech`, `/search`, `/m/receive`, `/m/scan`, `/m/home`). Tier 2 = daily ops.
Tier 3 (Studio / graph / canvas) is best-effort — don't chase scores there at the
expense of Tier-1 floors, and never strip Kinetic Ledger density to inflate a score.

## Running an audit

Always audit the **production build** — dev/Turbopack numbers are not representative.

```bash
# 1. Build + serve (pinless signin lets the mint script work).
#    If a `next dev` server is running in this checkout it owns `.next` and
#    will clobber the production build — build/serve from an isolated distDir
#    and a free port instead:
NEXT_DIST_DIR=.next-perf pnpm build
AUTH_PINLESS_SIGNIN=true NEXT_DIST_DIR=.next-perf npx next start -p 3100
export LH_BASE_URL=http://localhost:3100
# (no dev server running? plain `pnpm build` + `AUTH_PINLESS_SIGNIN=true pnpm start` works too)

# 2. Mint a session cookie (authenticated routes redirect to /signin without it)
export LH_COOKIE="$(node scripts/lighthouse-mint-session.mjs)"

# 2b. Tablet POS (`/kiosk`, `/kiosk/v2`) is a device principal. Staff `cf_sid`
#     measures the pair screen — discard those runs. Mint `cf_kiosk` instead:
export LH_KIOSK_COOKIE="$(node scripts/lighthouse-mint-kiosk.mjs)"
# or, for a kiosk-only run:  export LH_COOKIE="$(node scripts/lighthouse-mint-kiosk.mjs)"

# 3. Audit
pnpm lighthouse:audit                     # every manifest route, mobile, median of 3
pnpm lighthouse:audit -- --tier 1         # Tier-1 only
pnpm lighthouse:audit -- --routes /signin,/dashboard --runs 1   # quick spot check
pnpm lighthouse:audit -- --desktop        # desktop preset instead of mobile
pnpm lighthouse:audit -- --routes /kiosk,/kiosk/v2 --desktop --runs 3
```

Output: `lighthouse/<route>.json` (full LHR of the last run per route) and
`lighthouse/summary.md` (median score table). The `lighthouse/` directory is
generated output — only `summary.md` snapshots belong in review discussion, the
JSON blobs are scratch.

Chrome is resolved automatically: `CHROME_PATH` if you set it (and it exists),
otherwise the highest-numbered `~/.cache/ms-playwright/chromium-*` build. You do
not need to export it, and a stale hand-copied path from an old handoff is
recovered from with a warning rather than an error about a missing browser.

### The audit refuses to run on a busy host

`throttlingMethod: 'simulate'` runs the page at full speed and models the slow
device afterwards — so it models **this host's** trace. A host fighting other
work produces a slower one, and nothing in the output says so: the run completes,
the JSON looks identical, the score is just lower. That is the same failure shape
as everything else on this page, applied to the measurement itself.

So the audit checks 1-minute load average per core before it starts, and exits
non-zero above 50%:

```
Host load is 15.9 across 16 cores (99% — ceiling 50%). Simulated throttling
models THIS host's trace, so these scores will read low and nothing in the
output would tell you.
  Wait for the box to quiet down, or pass --ignore-load to measure anyway.
```

- `--ignore-load` — measure anyway. For a diagnostic reading, **never for a
  floor**.
- `LH_LOAD_CEILING` — move the ceiling (default `0.5`).
- Every baseline entry records the `hostLoad` it was measured at, so a floor
  pinned at 0.9 is not mistaken for one taken on an idle box.

This machine runs several `next dev` servers and often more than one agent
session, so a clean window is short and unpredictable — measured 0.36 → 2.33 per
core inside one session. Poll for one rather than assuming:

```bash
until [ "$(node -e "const o=require('os');console.log(o.loadavg()[0]/o.cpus().length<0.42?1:0)")" = 1 ]; do sleep 30; done
node scripts/lighthouse-audit.mjs --tier 1 --runs 3 --update-baseline
```

Worked example of why it matters: the same Tier-1 sweep run at 40–100% load and
then twice clean differed by +1 to +4 on the desktop routes (and +11 on `/test`,
almost all of it an `about:blank` run), while `/m/*` moved −5 to +2 between the
busy run and the first clean one. So the mobile shortfall is not the box.

The same three sweeps also show what the guard does *not* fix: on an idle host
the desktop routes repeat to ±2, but `/m/home` measured 50, 55 and 64 on three
medians-of-3. Load control makes a number honest, not precise. For the mobile
profile here, use `--runs 5` before quoting a delta.

### A route the harness could not measure FAILS

Three ways a run can measure something other than the route it names, all of
them flagged in `summary.md` and all of them non-zero under `--check`:

| Flag | Means | Fix |
|---|---|---|
| `⚠ redirected to /signin` | the cookie was missing or expired, so the numbers describe the sign-in page | re-mint `LH_COOKIE`, re-run |
| `⚠ redirected — pair screen` | `/kiosk*` got a staff `cf_sid` instead of a device `cf_kiosk` | mint with `lighthouse-mint-kiosk.mjs` |
| `⚠ measured <path>` | the route 308s to a different surface — the row names an alias | point the row at the surface (below) |
| `⚠ a run never loaded (about:blank)` | Chrome gave up on one of the three runs, and that run still fed a score into the median | re-run the route |

None of these write a baseline, and **none of them are skipped**. `--check` used
to `continue` past a redirected route, which is how `/dashboard` gated nothing
for months: the cookie was dropped across the redirect, the run landed on
`/signin`, the harness flagged it — and the flag then excused the route from its
own ratchet. The failure deleted its own alarm.

### Name the surface, never the alias

A manifest row must be a path that renders itself. `src/proxy.ts` 308s a family
of legacy paths onto real desks, and a row pointed at one of those measures a
page it does not name — plus a redirect hop — and pins a SECOND floor on a
surface that already has one, free to drift from the first on noise alone.

Removed from the manifest on 2026-08-30 for exactly that reason:

| Alias | Renders | Manifest row now |
|---|---|---|
| `/dashboard` | `/shipping/orders` | `/shipping/orders` (kept) |
| `/receiving` | `/unbox` | `/unbox` (kept) |
| `/packer` | `/pack` | `/pack` (added — the station had no row of its own) |
| `/shipping` | `/shipping/labels` | `/shipping/labels` |

A redirect is a proxy rule with no render. It is not a surface and it does not
need a Lighthouse floor.

### Auth notes

- **Public routes are audited signed-OUT, always.** A route declared
  `auth: false` in the `ROUTES` manifest gets no cookie even when `LH_COOKIE` is
  exported (`cookieFor`), and its baseline records `scenario: "signed-out"`.
  `--check` treats a scenario change exactly like a `formFactor` change: it
  fails with `STALE BASELINE` until you re-seed.

  This is not a nicety. `app/layout.tsx` gates public chrome on `!initialUser`,
  so auditing `/signin` *with* a session cookie renders the whole warehouse
  client on the sign-in page — the LHR showed `/api/staff`, `/api/inbox/support`,
  `/api/staff-preferences` and a live Ably connection on the public login page.
  Every `/signin` figure recorded before 2026-08-29 was that signed-in variant,
  which no visitor is ever in. Measured both ways on one build: signed-in 72,
  signed-out 78 (SI 2931→1608 ms, TBT 425→297 ms).
- The mint script needs the server started with `AUTH_PINLESS_SIGNIN=true`
  (env-driven, works on production builds) or `LH_STAFF_PIN` set.
- Mint requests must carry `x-tenant-slug` (default `usav`) because `localhost`
  resolves no tenant; the script handles this. The resulting `cf_sid` cookie is
  org-bound, so audits themselves need no tenant header.
- `LH_BASE_URL` / `LH_TENANT_SLUG` / `LH_STAFF_NAME` override the defaults.
- `/kiosk` and `/kiosk/v2` are Tier-2 desktop (tablet landscape). Use
  `LH_KIOSK_COOKIE` from `scripts/lighthouse-mint-kiosk.mjs`. A pair-screen
  landing is flagged `⚠ redirected` and excluded from baseline writes.
  `POST /api/kiosk/dev-autopair` 404s in production — do not rely on it here.
- **The session lives in Chrome's cookie jar, not just a header** (fixed
  2026-08-29). `extraHeaders` becomes `Network.setExtraHTTPHeaders`, and that
  `Cookie` is NOT re-applied when Chrome follows a cross-document redirect —
  the browser recomputes `Cookie` from the jar, which was empty. So every
  redirecting route arrived signed out. `/dashboard` is path-redirected to
  `/shipping/orders` (identical with and without a cookie), whose second hop
  then bounced to `/signin`, and the audit scored the sign-in page as
  `/dashboard`: Perf 99, LCP 987 ms, and `⚠ redirected`. Because `--check`
  skips redirected routes, that Tier-1 entry gated nothing for months. `curl`
  followed the same chain to a 200, which is what made it look like an expired
  mint. `seedCookieJar` now seeds the jar over CDP (`Storage.setCookies`)
  before each run, and the header injection remains only as a fallback.
  Re-seeded on the real page, `/dashboard` measures Perf 90-96 / LCP ~1.2-1.8 s.
- **SEO is only gated on public routes**, matching the target table above.
  `robots.txt` is `Disallow: /` (a private WMS — being uncrawlable is the
  intent), so `is-crawlable` scores 0 and SEO reads ~63 on every signed-in
  surface. It read 91 before the jar fix only because `robots.txt` is itself
  behind auth, so Lighthouse's unauthenticated fetch was redirected to
  `/signin` and it never saw the file. `--check` now enforces `seo` only for
  `scenario: "signed-out"` routes; the stale `seo: 91` floors on authenticated
  entries are informational until those routes are re-seeded.
- **`/dashboard` Accessibility 89 → 94** (fixed 2026-08-30; `/signin` 94 → 100).
  It was hidden while the route was scoring the sign-in page. Two causes, both
  app-wide rather than dashboard-specific:

  1. `meta-viewport` — the root layout pinned `maximum-scale=1`, disabling
     pinch-zoom on EVERY route (WCAG 1.4.4, 10 points). It guarded against iOS
     auto-zooming on input focus, but the `pointer: coarse` 16px font floor in
     `globals.css` already does that properly, so the lock was redundant. The
     floor was extended to `email` / `password` / `tel` / `number` / `url`,
     which it had been missing — `/signin` is built from email + password, and
     those were only safe while the viewport lock masked them.
  2. `aria-required-children` — grouped grid rows never received a `rowIndex`,
     and `OrdersQueueTableRow` derives `inTable` from `rowIndex != null`, so
     every row claimed `role="checkbox"` instead of `role="row"`: a
     `role="table"` with no rows at all. `LedgerGridSurface` was dropping the
     index `VirtualGroupedSections` already computed; it is now threaded
     through `renderGroup` (DataTable → LedgerGrid → Surface → QueueGroupRow),
     which also makes `aria-rowindex` correct for grouped rows.

- **Still open: rows own their widgets directly.** `aria-required-children`
  still fails on the row (not the table): a `role="row"` may only own
  cell-family roles, and the grid's cells are unroled `div`s, so the gutter
  checkbox and the row's buttons are owned by the row. Fixing it means giving
  every track a `role="cell"`, and it is NOT a blind sweep — `cell` requires a
  `row` parent, so any grid mounting the shared compound cells WITHOUT table
  semantics would start failing `aria-required-parent` instead. The cell role
  has to be conditional on the same `inTable` the row already computes. Worth
  ~6 points on the desks; do it as its own pass with cross-table checks.

## Auditing a Vercel preview (and why you should)

**Local numbers are not the app's numbers.** On a developer machine the database
is remote — measured from this checkout, a trivial authenticated API call costs
~1.3s and a receiving-lines read 1.9–2.5s — so every route's server time swamps
the metric the audit is trying to read. `/test` measured a 5.0s TTFB locally and
1.4s the next request; `/unbox` swung 92 → 79 between runs of the SAME build on
DB latency alone. A preview deployment has the database next to the server and
is the honest environment for anything LCP-shaped.

```bash
# 1. Deploy a preview (never --prod)
npx vercel deploy --yes

# 2. Deployment Protection: Project Settings → Deployment Protection →
#    "Protection Bypass for Automation" → Add Secret. Then:
export LH_BYPASS_SECRET="<the project's automation bypass secret>"
export LH_BASE_URL=https://<deployment>.vercel.app

# 3. Authenticated routes need AUTH_PINLESS_SIGNIN=true in the PREVIEW env
#    (`vercel env add AUTH_PINLESS_SIGNIN preview`) and a redeploy, then:
export LH_COOKIE="$(node scripts/lighthouse-mint-session.mjs)"
npm run lighthouse:audit -- --tier 1 --runs 3
```

Three traps, all of which produce numbers that look fine and mean nothing:

- **Protection blocks the server from itself.** `serverSelfFetch` is how the
  shell seeds (`/unbox`, `/test`, `/m/*`) load their first collection, and on a
  protected deployment those same-origin calls hit the SSO gate, so every seed
  degrades to `null` **silently** — the page renders, the client fetches, and the
  seeded content is simply missing from the first HTML. `/m/home` measured LCP
  ~9s that way while the identical code seeded correctly on localhost. The helper
  now forwards `VERCEL_AUTOMATION_BYPASS_SECRET` when the deployment has one.
- **Do not send `x-vercel-set-bypass-cookie`.** Once Chrome's cookie jar holds an
  entry for the origin it wins over the `Cookie` header Lighthouse injects, so
  the minted `cf_sid` stops being sent and every authenticated route lands on
  `/signin` — while `curl` with the same cookie returns 200. The bypass header
  alone is applied to every request, subresources included.
- **SEO scores ~54 on a preview and that is not a regression.** Vercel serves
  previews with `X-Robots-Tag: noindex`, which Lighthouse scores as "page blocked
  from indexing". **Never `--update-baseline` from a preview run** — it would
  write that artifact in as a floor.

## Simulated LCP is not observed LCP

`throttlingMethod: 'simulate'` records an UNTHROTTLED trace and has Lantern
predict the throttled result. The two can differ by 3x, and on the mobile profile
this app they systematically do: `/m/home` reports a simulated LCP of ~6.7s while
the same page under REAL 4x-CPU / 1.6Mbps throttling paints its largest element
at 2.1s (verified with a Playwright probe reading `largest-contentful-paint`
entries directly).

The gap is not noise, and chasing it with data-layer work is wasted effort.
Lantern charges the LCP paint against the script graph that ran before it, so on
these routes simulated LCP tracks **time-to-interactive**, which tracks total
JavaScript. `/m/*` ships ~848KB across ~60 chunks; until that number moves, the
mobile routes cannot score above the low 70s no matter how early the HTML
arrives. Confirm which element is actually painting, and when, before treating a
simulated LCP as a data problem.

## The ratchet

`lighthouse-baseline.json` records the accepted per-route category floors
(`min`) plus the last measured medians. Checking:

```bash
pnpm lighthouse:check          # Tier-1 medians vs baseline (tolerance ±3)
```

A route failing `min - tolerance` exits non-zero. After a genuine improvement,
re-run with `--update-baseline` to raise the floors. A route with no baseline
entry now fails too: an unpinned surface is a coverage hole, not a pass. So does
a route the harness could not measure — see *A route the harness could not
measure FAILS* above.

**Floors only move up, and as of 2026-08-30 that is enforced rather than
described.** `--update-baseline` used to overwrite `min` with whatever had just
been measured, so re-seeding after a regression silently re-seeded the
regression — the ratchet did not ratchet, and the only record of a lost win was
a diff in a JSON blob nobody reads. It now keeps the higher floor and prints
`WOULD LOWER <route> <category>: measured X < floor Y`. `--check` then fails
that route, which is the point.

Two ways past it, both deliberate:

- `--allow-lower` — accept the drop. Record why beside it; "Done when" for this
  work is *no floor lowered without the reason written down*.
- Change the route's `formFactor` or `scenario`. That voids the old floor
  automatically (it measured a different thing), and the new median is adopted
  outright. This is also why you cannot repin a route to make a number move —
  `--check` fails the profile mismatch until you re-seed on purpose.

`--update-baseline` also **prunes** floors for paths that have left the `ROUTES`
manifest. An entry that outlives its route is never measured and never checked,
but still reads as coverage.

It is deliberately **not** in `npm run verify` — Lighthouse needs a running
production server and a browser, and the whole manifest is 30–60 min.

## Is the seed actually landing? (`perf:seeds`)

Every point above ~85 on the data-heavy desks comes from a **server seed** — the
page dehydrates the first screen's rows into the RSC payload so LCP does not wait
on a post-hydration round trip. And every one of those seeds is written to
soft-fail:

```ts
} catch (error) {
  console.error('… failed; client will fetch', error);
  return null;   // the page still renders. just slower.
}
```

That is right for availability and blind for observability. A broken seed throws
no error, fails no test, and shows up only as a score that drifts back down
months later. It had already happened twice: `/triage`'s seed was **deleted**
(2026-08-27) once someone measured that it blocked TTFB to warm a table Arrival
never paints, and `/search`'s +12-point seed was confirmed by hand exactly once.

```bash
npm run perf:seeds                  # check every seeded route against seed-budget.json
npm run perf:seeds -- --report      # print what landed, never fail
npm run perf:seeds -- --route=/search
npm run perf:seeds:update           # re-pin the row floors
```

Needs the same production server as the audit (`SEED_BASE_URL`, default
`http://localhost:3100`) and mints its own cookie if `LH_COOKIE` is unset.

It asserts on the **query key**, not on row-shaped bytes being present, because
the nastiest failure looks like success: the rows dehydrate fine but under a key
the client never reads, so the client refetches and the seed paid TTFB for
nothing. That is the bug `mobile-feed-query-key.ts` and `rail-query-key.ts` exist
to prevent — this is the check that proves they still do.

It reads the page properly rather than grepping it. Next streams the RSC payload
as a series of `self.__next_f.push([1, "<chunk>"])` calls and a chunk boundary
can land in the middle of a JSON string, so a substring grep for a key is a coin
flip on payload size. The script rebuilds the stream from the pushed literals,
then does one string-aware pass for every balanced object owning a `queryKey`.

Floors live in `seed-budget.json` with a `tolerance` (default 2 rows) — the
regression worth catching is *zero rows / missing key*, not a queue that is three
orders shorter today. Each entry also records the **full observed key** beside
the floor, so a drift that the (deliberately short) match prefix tolerates is
still a visible diff in review.

Before adding a route here, check it against the **RSC-seed gate** — a seed
blocks TTFB, so most routes fail it and a seed that misses the gate is worse than
no seed. Criteria and worked examples:
[`.claude/skills/request-shape/SKILL.md`](../../.claude/skills/request-shape/SKILL.md).

## There is no CI gate. Every ratchet here is run by hand.

`.github/workflows/performance.yml` described a two-tier gate — `bundle-budget`
on every PR, `lighthouse` nightly at 08:00 UTC — and this section described it
as live for eight days after it stopped existing. **All GitHub Actions workflows
were deleted on 2026-08-22** (`2f6dcd784`, 588 lines across four files). Nothing
has run either job since.

That is worth stating in the same words as the rest of this initiative: a gate
that does not run produces no output, and no output is indistinguishable from a
passing gate. It is the same failure shape as `--check` skipping a redirected
route, and the same shape as a seed that soft-fails to `null`.

So, today, these are the whole gate set for performance, and a human has to type
them:

```bash
NEXT_DIST_DIR=.next-perf npm run build 2>&1 | tee build.log
npm run perf:budget            # First Load JS vs bundle-budget.json (ceilings only move DOWN)
npm run perf:budget:update     # re-seed
# …then serve, and against that server:
npm run perf:seeds             # seeds reach the first HTML (see above)
npm run lighthouse:check       # Tier-1 medians vs lighthouse-baseline.json
```

Budgets come from Next's printed route table, not `.next/app-build-manifest.json`
— this repo builds with Turbopack, which does not emit that manifest.

If the workflows come back, the Lighthouse job needs a seeded database
(`PERF_DATABASE_URL`); without one every authenticated route redirects to
`/signin` and the numbers are meaningless. Note the old workflows were written to
**skip with a warning** when that secret was absent — which would have meant a
green check over a job that measured nothing. Do not reproduce that.

## Method

- Per-route profile, from the `formFactor` pin (see *Form factor* above):
  - `mobile` — 412×823 @1.75, 1.6 Mbps / 150 ms RTT / 4× CPU. Handhelds (`/m/*`)
    and `/signin`.
  - `desktop` — 1350×940 @1, 10 Mbps / 40 ms RTT / no CPU slowdown. Workstation
    workbenches and the mounted kiosk tablet.
- `throttlingMethod: 'simulate'`; median of 3 runs per route (single runs swing
  ±10 points).
- Categories: Performance, Accessibility, Best Practices, SEO.
- Always audit a **production build** — dev/Turbopack numbers are not
  representative.

## What moved the numbers (history)

- **2026-08-30 — the harness, not the app.** Nothing here changed a score; it
  changed which scores were real. Four alias rows (`/dashboard`, `/receiving`,
  `/packer`, `/shipping`) were measuring surfaces they did not name; `--check`
  was excusing every route it failed to measure; `--update-baseline` moved floors
  down as happily as up; `CHROME_PATH` was a stale hand-copied constant; the CI
  that ran all of it had not existed since 2026-08-22; and a busy host silently
  produced low numbers. Also `perf:seeds`, and `/incoming`'s seed deleted (it
  could never beat its own 400ms timeout against a 2.9s endpoint). Clean Tier-1
  medians after: `/search` 97, `/triage` 92, `/pack` 91, `/shipping/orders` 90,
  `/unbox` 82, `/signin` 81, `/test` 74, and the `/m/*` tree at 64–65 against
  floors of 71–77 — the one real regression the repaired gate now reports, and
  the only three failures in the run.

- **2026-07 initiative** — root-shell provider diet (deferred CommandBar /
  scanner / assistant dock chunks, idle-deferred inbox + staff-colors fetches),
  `loading.tsx` skeletons on Tier-1 routes, hot-path `<img>` → `next/image`.
  Baseline established; see `lighthouse-baseline.json` history in git.
