# Lighthouse performance runbook

How to measure, what the targets are, and how the ratchet works. The audit
tooling lives in `scripts/lighthouse-audit.mjs` + `scripts/lighthouse-mint-session.mjs`;
the committed floor is `lighthouse-baseline.json`.

## Targets

**The goal is 90 in every category on every route.** As of the 2026-07 audit only
Performance is short — Accessibility 93–95, Best Practices 96, SEO 91, CLS ~0 and
TBT 22–158 ms already clear it everywhere.

| Category | Target | Status (2026-07) |
|---|---|---|
| Performance | ≥ 90 | **67–78** — the whole gap |
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

Routes whose median run ended on `/signin` are flagged `⚠ redirected` — that means
the cookie was missing/expired and the numbers are for the signin page, not the
route. Re-mint and re-run; redirected rows are excluded from baseline writes.

### Auth notes

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
re-run with `--update-baseline` to raise the floors — floors only move up. A route
with no baseline entry now fails too: an unpinned surface is a coverage hole, not
a pass.

It is deliberately **not** in `npm run verify` — Lighthouse needs a running
production server and a browser, and the whole manifest is 30–60 min.

## CI (`.github/workflows/performance.yml`)

Two tiers, because they cost very different amounts:

| Job | Runs on | Cost | Gates |
|---|---|---|---|
| `bundle-budget` | every PR + push to main | one build | per-route First Load JS vs `bundle-budget.json` |
| `lighthouse` | nightly 08:00 UTC + `workflow_dispatch` | build + browser, 30–60 min | Tier-1 medians vs `lighthouse-baseline.json` |

Payload weight is deterministic, needs no browser, and is the input to most of
what Lighthouse then measures — so it is the part worth gating continuously.

```bash
npx next build 2>&1 | tee build.log
npm run perf:budget            # ratchet check
npm run perf:budget:update     # re-seed (ceilings only move DOWN)
```

Budgets come from Next's printed route table, not `.next/app-build-manifest.json`
— this repo builds with Turbopack, which does not emit that manifest.

Both jobs **skip with a warning** rather than fail when their secrets are absent,
so an unconfigured repo does not carry a permanently red check. To turn them on,
set the `PERF_DATABASE_URL` repository secret (the Lighthouse job needs a seeded
database — without one, every authenticated route redirects to `/signin` and the
numbers are meaningless). Re-seed either ratchet by dispatching the workflow with
`update_baseline: true`, then committing the updated JSON.

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

- **2026-07 initiative** — root-shell provider diet (deferred CommandBar /
  scanner / assistant dock chunks, idle-deferred inbox + staff-colors fetches),
  `loading.tsx` skeletons on Tier-1 routes, hot-path `<img>` → `next/image`.
  Baseline established; see `lighthouse-baseline.json` history in git.
