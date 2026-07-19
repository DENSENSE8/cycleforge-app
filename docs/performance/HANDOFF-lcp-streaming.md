# Handoff — Tier-1 LCP: kill the hydrate-then-fetch waterfall

Continuation of the 2026-07-19 Lighthouse initiative (see `results-2026-07-19.md`).
Bundle weight is done; this is the remaining architectural lever.

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
