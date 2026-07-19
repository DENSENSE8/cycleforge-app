# Lighthouse performance runbook

How to measure, what the targets are, and how the ratchet works. The audit
tooling lives in `scripts/lighthouse-audit.mjs` + `scripts/lighthouse-mint-session.mjs`;
the committed floor is `lighthouse-baseline.json`.

## Targets

| Category | Target |
|---|---|
| Performance | ≥ 70 Tier-1 · ≥ 50 Tier-2 heavy workspaces (Studio/canvas best-effort) |
| Accessibility | ≥ 90 everywhere |
| Best Practices | ≥ 90 everywhere |
| SEO | ≥ 80 public routes only (`/signin`, `/signup`, `/share/photos/*`) |
| LCP | ≤ 2.5 s Tier-1 (stretch ≤ 2.0 s on `/signin`, `/m/receive`) |
| TBT | ≤ 600 ms on every route |
| CLS | ≤ 0.1 (critical on scan-floor mobile UI) |

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

# 3. Audit
pnpm lighthouse:audit                     # every manifest route, mobile, median of 3
pnpm lighthouse:audit -- --tier 1         # Tier-1 only
pnpm lighthouse:audit -- --routes /signin,/dashboard --runs 1   # quick spot check
pnpm lighthouse:audit -- --desktop        # desktop preset instead of mobile
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

## The ratchet

`lighthouse-baseline.json` records the accepted per-route category floors
(`min`) plus the last measured medians. Checking:

```bash
pnpm lighthouse:check          # Tier-1 medians vs baseline (tolerance ±3)
```

A route failing `min - tolerance` exits non-zero. After a genuine improvement,
re-run with `--update-baseline` to raise the floors — floors only move up, the
same discipline as the DS ratchet guards. The check is a local/PR tool today
(not wired into `npm run verify`): Lighthouse needs a running production server,
which the verify pipeline doesn't have.

## Method

- Mobile emulation (412×823 @1.75), simulated slow-4G throttling — Lighthouse
  defaults, matching field-like conditions on floor devices.
- Median of 3 runs per route; single runs swing ±10 points.
- Categories: Performance, Accessibility, Best Practices, SEO.

## What moved the numbers (history)

- **2026-07 initiative** — root-shell provider diet (deferred CommandBar /
  scanner / assistant dock chunks, idle-deferred inbox + staff-colors fetches),
  `loading.tsx` skeletons on Tier-1 routes, hot-path `<img>` → `next/image`.
  Baseline established; see `lighthouse-baseline.json` history in git.
