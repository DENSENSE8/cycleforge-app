---
name: request-shape
description: Audit and cut the network requests a route fires — measure the four axes (depth, width, redundancy, poll-vs-push) with `npm run perf:requests`, then apply the fix catalog (shared query key, count_only, push-over-poll, staleTime, RSC seed). Use when a page feels network-heavy, fires duplicate fetches, or has a slow LCP behind a post-hydration waterfall. Not for bundle weight — that hunt is closed.
allowed-tools: Read, Grep, Glob, Edit, Bash
---

# Request shape

Cut the **number and critical-path weight** of the requests a route fires,
without regressing correctness. This is about request *shape*, not query cost
and not bundle size — see "Out of scope" below, because mixing them up is how
these audits go wrong.

Proven on `/unbox` and `/triage` (2026-08-24): cold load 49→46 and 42→40
requests, and a window-focus regain 26 req/104KB → 3 req/12KB.
Worked example, with the misses written down as plainly as the wins:
[`docs/performance/REQUEST-SHAPE-RECEIVING-UNBOX.md`](../../../docs/performance/REQUEST-SHAPE-RECEIVING-UNBOX.md).

## Don't reinvent — the harness exists

```bash
NEXT_DIST_DIR=.next-perf pnpm build
AUTH_PINLESS_SIGNIN=true NEXT_DIST_DIR=.next-perf npx next start -p 3100
npm run perf:requests -- --route=/unbox --route=/triage
```

Writes `docs/performance/request-shape/<route>.json` plus a table on stdout.
**Re-run after the change and diff the JSON — that diff is the claim.** A number
you did not measure twice is a guess.

Flags: `--base=` (default `http://localhost:3100`), `--settle=` ms before
capture, `--no-focus` to skip the warm pass, `--allow-dev` (don't).

**Keep the flags identical across a before/after pair.** Viewport and settle
time decide which components mount, so the harness and a hand-driven DevTools
capture will disagree on the count and both be right. Same lesson
`LIGHTHOUSE.md` teaches about `formFactor`: change the profile, void the
baseline.

## Measure a PRODUCTION build. This is not a nicety.

Dev does not report a slower shape, it reports a **different** shape. React
StrictMode double-invokes effects, so every raw `fetch`-in-`useEffect` appears
twice and the redundancy column is fiction. The script detects a dev server
(`<nextjs-portal>` / `TURBOPACK_CHUNK_UPDATE_LISTENERS`, both verified against
this app's dev server and its live production build) and refuses.

Two standing rules, both from `AGENTS.md`:

- **Never start, restart or kill the dev server on `:3050`.** It is the
  operator's. Build to an isolated `NEXT_DIST_DIR` on a free port — `next dev`
  owns `.next` and a plain `pnpm build` will clobber it.
- Stop your perf server when you are done. Leave `:3050` untouched.

## Step 1 — capture, then classify against four axes

A consolidation that only wins on one axis can lose overall. For every
suspicious request, name the axis *before* proposing a fix — the fix shape
differs completely.

| Axis | What it costs | The script's column |
|---|---|---|
| **Depth** | LCP/TTI. B cannot start until A resolves | `DEPTH?` (B starts ≤75ms after A ends) |
| **Width** | server round trips, cache entries, client CPU. HTTP/2 multiplexes, so this is the *cheap* one | `peak concurrency` |
| **Redundancy** | pure waste | `REDUNDANCY` (identical URL ≥2×) and `REDUNDANCY?` (one endpoint, several param shapes) |
| **Poll-vs-push** | every alt-tab, scanner focus bounce and print-popup return | the two `focus cycle` lines |

`DEPTH?` carries a question mark on purpose: from outside the app, co-timing is
indistinguishable from causation. Each pair is a shortlist entry to confirm in
code, never a finding on its own.

**Totals are noisy; the duplicate columns are not.** Across back-to-back runs of
the same build I saw `/unbox` report 43 and then 51 requests (143KB / 311KB) —
image loading and mount timing move the total a lot. What stayed identical was
`REDUNDANCY`, `REDUNDANCY?` and `COUNT PROBES`. So: quote the duplicate counts
as findings, and treat the headline total as an order-of-magnitude reading, not
a metric to claim a percentage on. If you need a trustworthy total, run three
times and take the median.

**Read cycle 2 first.** It runs seconds after cycle 1, so anything that fires in
both is ignoring its own `staleTime` — that is the highest-value, lowest-risk
finding on almost any page, and it costs the operator on every single refocus.

## Step 2 — attribute each finding to a file:line, and verify the attribution

Grep the endpoint, then check *which* caller actually fires:

```bash
grep -rn "/api/<endpoint>" src --include=*.ts --include=*.tsx | grep -v '\.test\.'
```

**A caller that exists is not a caller that fired.** On the receiving audit I
attributed a duplicate to `useSourcePlatform` and shipped a fix that removed
nothing, because that hook only fetches when the row carries no platform — it
was never one of the two. Confirm by re-running the capture and watching the
count move. If it does not move, say so.

## Step 3 — pick from the catalog, and rule the others out with reasons

- **Shared query key / selector** — two React Query keys over one endpoint. The
  most common real finding. Fix: one query, `select` for each shape. If a cache
  entry is `setQueryData`-written by other surfaces, do **not** widen its value;
  park the sibling field in its own key from the shared `queryFn` (side-car).
- **Raw `fetch` beside a hook** — a `useEffect` fetch next to a perfectly good
  React Query hook over the same endpoint. Route it through the hook. Note the
  raw one never entered the cache, so it never deduped and never will.
- **`count_only`** — a badge fetching `?limit=1` to read `total`. On
  `/api/receiving-lines` this still runs the full list SQL with ~15 display
  laterals. Add a count-only arm to the route; do not build a second endpoint.
  **Expect ~half the time, not all of it** — the gating WHERE is usually the
  other half. The payload win is near-total.
- **Push over poll** — a fetch that exists to catch what an Ably event already
  delivers. Check the channel handler covers the case before deleting the fetch.
- **`staleTime` / `refetchOnWindowFocus`** — cheap, high-value, chronically
  under-used. `'always'` bypasses `staleTime` entirely; `true` respects it.
- **Parallelise a serial pair** — B awaits A but does not need A's result.
- **RSC/server seed** — move the first screen's rows into the server payload.
  **Gated**: see below. Most routes fail the gate.

Cache invalidation coupling is a real cost of merging endpoints. Before merging,
check whether the current flow patches client-side without a refetch — if it
does, that is the better shape and merging trades it away.

## Step 4 — the RSC-seed gate (most routes fail it)

A seed **blocks TTFB**. It is only ever a win when it is cheap by construction.
`seedUnboxStation` earns its keep by ranking on an indexed column
(`receiving_unbox.opened_at`, 0.32ms) then hydrating just those ids.

Before writing one, answer both:

1. **Is there a cheap ranking column?** If the ORDER BY is a computed expression
   across joined tables, there is nothing to rank on. (`sort=priority` is a CASE
   over `receiving_carton.*` plus `receiving_triage.priority_lane` — no.)
2. **Is there anything to narrow?** Compare `limit=1` against `limit=50`. If
   they cost the same, the answer set *is* the candidate set and pre-limiting
   buys nothing. (`view=scanned` returns 15 rows and both cost ~1.8s.)

If either fails, **stop and say so**. A blocking 3.6s seed is strictly worse
than a non-blocking 3.6s fetch. Reporting the failed gate *is* completing the
item.

## Step 5 — verify, then re-measure

```bash
npm run verify        # lint · typecheck · unit — the whole gate set
npm run perf:requests -- --route=<route>   # against a FRESH prod build
```

Report before/after from the two JSON files. If a fix under-delivered, lead with
that. If it removed nothing, say it removed nothing.

## Already ruled out — do not re-litigate

Checked directly on this codebase; re-deriving these wastes a session:

- **Ably channel count** — one shared `Ably.Realtime` for the whole app
  (`src/contexts/AblyContext.tsx`), SDK import deferred to idle. One
  `/api/realtime/token` per load however many channels subscribe. Not a finding.
- **`usePlatformMeta` / catalog hooks** — stable keys, 5-min `staleTime`, one
  request across ~16 consumers. The dedup works.
- **Bundle weight** — cut 61–68% in the 2026-07 initiative and no longer the
  constraint. `AGENTS.md` says do not re-run that hunt.
- **`useHydrateVisibleSerials`** — fires zero requests; the
  `serial_projection` read-model retired it. Dormant fallback, not an N+1.

## Out of scope — name it and hand it back

Request shape is not query cost. When the capture shows a single request taking
seconds, that is a **query** problem and belongs in an EXPLAIN pass, not here.
The receiving audit ended with exactly this: `view=scanned&sort=priority` takes
1.8–3.6s to return **15 rows**. No amount of request consolidation fixes that.
Say which it is rather than consolidating around a slow query.

Two related traps worth checking whenever you touch a `total`:

- A route returning `total: rows.length` is reporting the **page** size. The
  triage Unfound badge read exactly that and displayed `1` for any non-empty
  queue.
- A route that pre-limits its candidate set (`maybePreLimitUnboxOpened`) makes
  `?limit=N` count *inside* the window, so the total is the page size again.
