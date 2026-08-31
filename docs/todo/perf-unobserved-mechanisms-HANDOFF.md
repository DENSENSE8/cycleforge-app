# Handoff — hunt the unobserved mechanisms (Lighthouse ≥ 92 initiative)

Continuation of the 2026-08-29/30 work in
[`docs/performance/HANDOFF-lcp-streaming.md`](../performance/HANDOFF-lcp-streaming.md)
and [`LIGHTHOUSE.md`](../performance/LIGHTHOUSE.md).

**Operator goal in force:** Performance ≥ 92 on every route, ≥ 90 every other
category, and the desks must stay fast to triage through.

**Status 2026-08-30 (session 2):** Attacks 1 and 2 are done. Attack 3 (barrel
altitude) is untouched, and is still the lowest-value thing on this page.

**Start here next session, in this order:**

1. **The `/m/*` tree fails its floors on every run** (50–65 against 71–77),
   confirmed across three sweeps, two of them on an idle box. Its LCP is
   7.5–10.3s and barely moves with load — that is the whole remaining gap to
   ≥ 92, and `perf:seeds` shows all three mobile seeds landing 20 rows, so it is
   not the first payload. Take `--runs 5` on the `/m/*` rows first: the mobile
   profile swings ±14 here and the regression's SIZE is not yet established.
2. **`/unbox` at 83 with a 501KB document and a 50-row seed** — the cheapest
   desktop win, and the mobile over-seed lesson is already written down.
3. **`/test` at 76 and `/signin` at 78** are the other two desk routes under the
   bar. `/test` seeds six keys, two of which are not first-paint content.

---

## The thesis — what you are actually hunting

Every defect found on 2026-08-29/30 had one shape:

> **A mechanism that is documented as working, isn't, and whose failure mode is
> silence rather than an error.**

That thesis held. Session 2 hunted with it and found seven more, listed below.
The search rule stands: **find where success and "not checked" are
indistinguishable.**

---

## What session 2 found and fixed

All of these are load-independent facts — they do not depend on the flaky score
measurements discussed further down.

### 1. Three Tier-1 rows were measuring a page they did not name

`/dashboard` was the known case. It was not the only one. Every one of these
308s in `src/proxy.ts` to a different surface:

| Manifest row | Actually rendered | Was that surface also a row? |
|---|---|---|
| `/dashboard` | `/shipping/orders` | yes — measured twice, once under a false name |
| `/receiving` | `/unbox` | yes — same |
| `/packer` | `/pack` | **no** — the packing station had no row of its own |
| `/shipping` (t2) | `/shipping/labels` | no |

So `/packer`'s floor of 77 was `/pack` plus a redirect hop, and `/pack` itself
was never gated. Fixed: the manifest now names surfaces, never aliases, with the
policy written above `ROUTES` in `scripts/lighthouse-audit.mjs`. `/pack` and
`/shipping/labels` are new rows; the four alias rows are gone.

### 2. `--check` excused every route it failed to measure

This is the one that mattered most. `checkBaseline` opened with
`if (r.redirected) continue;` — so a route that landed on `/signin` was flagged
AND exempted. The failure deleted its own alarm, which is exactly why
`/dashboard` gated nothing for months.

Now every un-measured route **fails**: `/signin` landings, kiosk pair screens,
a final URL that is not the requested path, and (new) a run that ended on
`about:blank`. That last one is real, not theoretical — `/test` hit it on the
first sweep, and a run that never loaded still contributes a score to the median.

### 3. The ratchet did not ratchet

`LIGHTHOUSE.md` said "floors only move up". `writeBaseline` set
`min = <whatever was just measured>`, unconditionally. Re-seeding after a
regression silently re-seeded the regression, and the only record was a diff in a
JSON blob nobody reads.

Now floors are kept when a measurement comes in lower, with
`WOULD LOWER <route> <category>` printed and `--check` left failing. `--allow-lower`
is the explicit escape hatch. A `formFactor`/`scenario` change still voids the
old floor automatically — that is a different measurement, not a lower one.

### 4. The CI that gates all of this does not exist

`LIGHTHOUSE.md` documented `.github/workflows/performance.yml` — `bundle-budget`
on every PR, `lighthouse` nightly — in the present tense. **All GitHub Actions
workflows were deleted on 2026-08-22** (`2f6dcd784`, 588 lines, four files).
Nothing has run either job since. Every ratchet in this initiative is manual and
always has been.

Note the deleted workflows were written to *skip with a warning* when
`PERF_DATABASE_URL` was absent — a green check over a job that measured nothing.
If they come back, do not reproduce that.

The doc now says this plainly instead of describing a gate that isn't there.

### 5. `CHROME_PATH` was a hand-copied constant that had already gone stale

Every runbook and handoff carried
`~/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`. On disk it is
`chromium-1223`. The audit dies on route 1 with an error that names Chrome, so
the reader goes hunting for a broken browser.

`lighthouse-audit.mjs` now resolves it: explicit `CHROME_PATH` if it exists, else
the highest-numbered Playwright build, else chrome-launcher's own detection. A
stale value warns and recovers instead of failing.

### 6. `/incoming`'s seed could never land, and had never landed — DELETED

`seedIncomingLines` prefetched the `full` phase behind a 400ms
`AbortSignal.timeout`. Measured against a production build:

```
/api/receiving-lines?view=incoming&limit=50&include=serials
  → 2.9s, 4.1s, 4.8s, 3.1s, 2.9s      (bound: 400ms)
/api/receiving-lines?view=incoming&limit=1
  → 2.45s, 2.52s, 2.60s
```

It aborted every request, every time. Observable cost: an empty `dehydrate()` in
the payload, a cancelled DB query per page load, a `console.error` nobody read,
and 400ms of delay before the surface streamed — bought with nothing.

It also fails the RSC-seed gate on its own terms: `limit=1` costs 2.45s against
`limit=50`'s 2.9s, so the answer set *is* the candidate set and pre-limiting buys
nothing. Same verdict and same reason as the `/triage` seed deleted 2026-08-27.
`src/lib/queries/incoming-seed.server.ts` is gone and `src/app/incoming/page.tsx`
records why. If Incoming's first paint is worth server work later, the
prerequisite is a cheap ranking column — not a shorter timeout.

### 7. There was an eighth seed nobody had inventoried

The handoff counted seven seed modules. `/pack` has one too —
`PackerSurfacePage.tsx` prefetches `['packer-logs', packerId, week]` inline
rather than through a `*-seed.server.ts` module, which is exactly why a grep for
`-seed.server` missed it. It is in the observer now.

---

## Attack 2 delivered: `perf:seeds`

`scripts/seed-observer.mjs` + `seed-budget.json`, wired as
`npm run perf:seeds` / `perf:seeds:update`. Runbook section:
[`LIGHTHOUSE.md` → *Is the seed actually landing?*](../performance/LIGHTHOUSE.md).

It asserts on the **query key**, not on row-shaped bytes, because the nastiest
failure looks like success: rows dehydrate fine under a key the client never
reads, so the client refetches and the seed paid TTFB for nothing.

It reads the page properly rather than grepping it. Next streams the RSC payload
as `self.__next_f.push([1, "<chunk>"])` calls and a chunk boundary can land
mid-string, so a substring grep for a key is a coin flip on payload size. The
script rebuilds the stream from the pushed literals, then does one string-aware
pass for every balanced object owning a `queryKey`.

Current state — all eight routes land, verified against a production build:

```
  20 rows  /search            Recently-searched rail
  50 rows  /unbox             Unbox recents rail
   1 rows  /unbox             Selected carton lines
  82 rows  /test              Ready-to-pack queue
   2 rows  /test              Queue counts
   4 rows  /test              Pack placement (orders)
  82 rows  /shipping/orders   To-ship unshipped queue
   2 rows  /shipping/orders   Queue counts
   0 rows  /pack              Packer week logs      ← empty week, presence-only floor
  20 rows  /m/home            Mobile Unbox feed
  20 rows  /m/triage          Mobile Arrival feed
  20 rows  /m/receive         Mobile Arrival feed
```

**The gate was proven to fail, not just to pass.** Pointed at the (now deleted)
`/incoming` seed it reported
`SEED MISSING /incoming · Incoming full list: no dehydrated query under
["receiving-lines-table","incoming"] in the first HTML` and exited 1.

### Still open on the seed layer

- **`/unbox` seeds 50 rows** and ships a 501KB document — the largest of any
  route. `mobile-feed-query-key.ts` documents the opposite lesson for the phone
  (seeding 100 instead of 20 pushed `/m/home` from 40KB to 74KB and server time
  from 0.7s to 4.1s). Nobody has checked whether the desktop rail paints more
  than ~20 rows above the fold. If it does not, this is the same over-seed,
  unapplied on desktop, and it is the cheapest LCP win left.
- **`/test` seeds six keys**, including `staff-preferences` and `ops-roi`, which
  are not first-paint content. `ready-to-pack-shell-seed.server.ts` warns in its
  own header not to grow into "seed whatever the shell might want". It grew.
- Neither is measurable until the host problem below is solved.

---

## The measurement itself is unreliable — read before quoting any score

**This is the blocker.** `throttlingMethod: 'simulate'` runs the page at full
speed and models the slow device afterwards, so it models *this host's* trace. A
host fighting other work produces a slower one, and nothing in the output says
so: the run completes, the JSON looks identical, the score is just lower.

On 2026-08-30 this machine carried six `next dev` servers, three concurrent agent
sessions, clickhouse, and another session's `tsc --noEmit` at 158% CPU. Load
average ranged 6–16 on 16 cores **during the sweep**. A second session also
`next build`-ed into `.next-perf` mid-run and wiped it, and ports 3100, 3101,
3102 and 3110 were all taken (3110 was claimed in the ~60s between probing it
free and binding it).

`lighthouse-audit.mjs` now **refuses to run above 50% load** (`LH_LOAD_CEILING`,
`--ignore-load` to override) and records `hostLoad` beside every measurement. It
earned its keep within a minute of being written: the re-run refused at 99%.

The fix let clean sweeps happen: a watcher polled load and fired the moment it
dropped. Three full Tier-1 sweeps were taken — one contaminated, two clean — which
is the only way to separate the harness's noise from the app's behaviour.

| Route | busy (0.4–1.0) | clean (0.39) | clean (0.33) | floor | |
|---|---|---|---|---|---|
| `/signin` (mobile) | 79 | 78 | 81 | 72 | ✅ |
| `/shipping/orders` | 89 | 91 | 90 | 90 | ✅ |
| `/unbox` | 82 | 83 | 82 | 83 | ✅ |
| `/triage` | 89 | 93 | 92 | 92 | ✅ |
| `/pack` | 88 | 90 | 91 | 91 | ✅ |
| `/test` | 62 ⚠ | 73 | 74 | 76 | ✅ |
| `/search` | 96 | 96 | 97 | 92 | ✅ |
| `/m/receive` (mobile) | 52 | 54 | **64** | 77 | ❌ |
| `/m/scan` (mobile) | 61 | 63 | **65** | 76 | ❌ |
| `/m/home` (mobile) | 55 | 50 | **64** | 71 | ❌ |

**Desktop is stable to ±2. Mobile is not — it swings ±14.** `/m/home` measured
50, 55 and 64 on three medians-of-3, with TBT 1152ms, 440ms and 353ms. So two
claims need stating carefully:

- **The regression is real.** Every run of all three mobile routes is below its
  floor, on both busy and idle boxes. It is not contention: the busy→clean delta
  is +2 and −5 while desktop moved +1 to +4 in the same pair.
- **Its size is not established.** It is somewhere between ~7 and ~20 points, not
  the flat "20" a single run would suggest. Do not quote a number off one sweep;
  the mobile profile on this host needs more than three runs to have a median
  worth arguing from. `--runs 5` on just the `/m/*` rows is the cheap next step
  and it costs about four minutes.

What is not ambiguous:

- **`/m/*` LCP is 7.5–10.3s across every run**, against desktop's 0.9–2.1s, and
  it barely moves with load. That is the stable, load-independent signal, and it
  is where the remaining gap to ≥ 92 lives. `perf:seeds` confirms all three
  mobile seeds land 20 rows, so the first payload is not the problem.
- **A11y is 100 on every route but two** (was 93–95 across the board). The
  `maximum-scale` and `rowIndex` fixes landed app-wide. `/shipping/orders` at 94
  and `/test` at 95 are the known-open `aria-required-children` on grid rows.
- **`/unbox` is the worst desktop route** at 82–83, and ships the largest
  document in the manifest (501KB) behind a 50-row seed.

### What this means for the ≥ 92 goal

Every optimization claim from here needs a clean window, and windows on this box
are short and unpredictable — over one session load ranged 0.36 → 2.33 per core.
The re-seed below was blocked twice by exactly that. The durable fix is finding 4:
**bring a CI job back on a machine that is only doing this.** Until then, budget
for a watcher loop rather than assuming you can measure on demand:

```bash
# poll, then measure the moment the box is free
until [ "$(node -e "const o=require('os');console.log(o.loadavg()[0]/o.cpus().length<0.42?1:0)")" = 1 ]; do sleep 30; done
node scripts/lighthouse-audit.mjs --tier 1 --runs 3 --update-baseline
```

`--ignore-load` is not the answer — that flag exists to let you take a diagnostic
reading, never to pin a floor.

---

## Baseline state — every Tier-1 floor is pinned, and the gate is red on purpose

`_stale` is **deleted**. It was a free-text key in `lighthouse-baseline.json`
that no code has ever read — a comment pretending to be a mechanism. What it
described is now actually enforced by the `formFactor`/`scenario` mismatch check.
The orphaned `/dashboard`, `/receiving` and `/packer` floors are pruned, and
`--update-baseline` now prunes any floor whose path has left the manifest (a
floor that outlives its route is never measured, never checked, and still reads
as coverage).

**`/m/receive`, `/m/scan` and `/m/home` were stamped `formFactor: mobile` /
`scenario: authenticated` by hand, keeping their July floors** (77 / 76 / 71).
That is deliberate and it is the one judgement call in this session worth
disagreeing with if you disagree: those entries were missing the `formFactor`
KEY, but they were measured on the mobile profile in July and are measured on the
mobile profile now, so the floor is comparable and the drop to 54 / 63 / 50 is a
real `RATCHET FAIL`. Re-seeding them instead would have used the tool's
profile-void escape hatch to erase a 20-point regression — the exact hole finding
3 closed. `/test` is the opposite case: it genuinely was repinned mobile→desktop
on 2026-08-22, so its floor of 69 IS void and it gets a fresh one.

The four floors that were missing or void are now **pinned**, measured at 0.22–0.35
host load (the cleanest window of the session):

| Route | Perf | A11y | Why it needed one |
|---|---|---|---|
| `/shipping/orders` | 90 | 94 | never had a floor |
| `/unbox` | 83 | 100 | never had a floor |
| `/pack` | 91 | 100 | new row (was the alias `/packer`) |
| `/test` | 76 | 95 | July floor of 69 void — repinned mobile→desktop |

Every Tier-1 row now carries `formFactor`, `scenario`, and (for the four above)
the `hostLoad` it was measured at. Full state:

| Route | ff | Perf floor | Measured | |
|---|---|---|---|---|
| `/signin` | mobile | 72 | 78 | ✅ |
| `/shipping/orders` | desktop | 90 | 90 | ✅ |
| `/unbox` | desktop | 83 | 83 | ✅ |
| `/triage` | desktop | 92 | 93 | ✅ |
| `/pack` | desktop | 91 | 91 | ✅ |
| `/test` | desktop | 76 | 76 | ✅ |
| `/search` | desktop | 92 | 96 | ✅ |
| `/m/receive` | mobile | 77 | 54 | ❌ RATCHET FAIL |
| `/m/scan` | mobile | 76 | 63 | ❌ RATCHET FAIL |
| `/m/home` | mobile | 71 | 50 | ❌ RATCHET FAIL |

**`lighthouse:check` is red, and that is the correct state.** The three failures
are the real mobile regression, not missing metadata — which is the whole
difference between this baseline and the one that opened the session. Do not
re-seed them to green.

Only `/search` (96) currently clears the operator's ≥ 92 bar with room; `/triage`
(93) clears it; `/pack` (91) and `/shipping/orders` (90) are within noise of it;
`/unbox` (83), `/signin` (78), `/test` (76) and the `/m/*` tree are not.

To re-pin a floor after a genuine fix:

```bash
export LH_BASE_URL=http://localhost:3187   # your own port; 3100-3110 are contended
export LH_COOKIE="$(node scripts/lighthouse-mint-session.mjs)"
node scripts/lighthouse-audit.mjs --routes /m/home --runs 3 --update-baseline
```

`CHROME_PATH` no longer needs exporting. Do not reach for `--allow-lower` on the
`/m/*` rows — lowering those floors is how a 20-point regression becomes the new
normal.

---

## Attack 3 — barrel altitude on the desks (untouched, still lowest priority)

`@/design-system/primitives` re-exports seven motion-engine primitives, and a
LOCAL barrel is not covered by `optimizePackageImports`. Measured static graphs:

| Route | modules | engine importers |
|---|---|---|
| `/test` | 1344 | 203 |
| `/triage` | 1096 | 143 |
| `/packer` | 929 | 146 |
| `/search` | 772 | 114 |
| `/signin` (after fix) | 28 | 0 |

**Carry the caveat.** On `/signin` the barrel cut removed 78 modules from the
graph and moved the score **zero**; the win only appeared after fixing the actual
shell split. Treat this as bundle hygiene with an unproven scoring effect. And
now there is a second reason to wait: you cannot demonstrate a before/after on a
host whose noise is ±20 points.

The graph scanner used for those numbers is not committed. Rebuild it as ~40
lines: walk `import`/`export … from` specifiers from a page entry, resolve `@/`
against `src/`, and flag any path under `@/design-system/motion`. Two traps that
cost real time: you must follow `export … from` re-exports (a barrel is invisible
otherwise), and you must NOT follow `dynamic(() => import(...))` when you are
asking "what ships on first load."

---

## Environment and traps — read before running anything

- **Never touch `:3050`** (the operator's dev server) and never delete `.next`.
- **Build and serve somewhere only you own.** `.next-perf` and ports 3100–3110
  are contended by concurrent sessions; a rebuild under a live serve corrupts it,
  and another session's rebuild will corrupt yours. Use a private distDir
  (`.next-perf-lh` is gitignored) and an uncommon port:
  ```bash
  NEXT_DIST_DIR=.next-perf-lh npm run build
  AUTH_PINLESS_SIGNIN=true NEXT_DIST_DIR=.next-perf-lh npx next start -p 3187
  ```
  Verify the listener is yours with `ss -tlnp` before trusting any number — a
  `next start` that fails EADDRINUSE while `curl` returns 200 means you are about
  to measure someone else's build.
- **`pnpm` is not on PATH in background shells** — `npm run build` works.
- **`pkill -f "next start -p 3100"` matches its own shell.** Kill by PID.
- **`cmd | tail` reports tail's exit code**, not the command's.
- **The Bash cwd drifts** back to the repo root mid-session. Absolute paths.
- **`LH_BASE_URL` must be exported for the mint script.**
- **Lighthouse single runs swing ±10 points** even on an idle box; medians of 3,
  which `--check` enforces.
- **The shared dev DB flakes under parallel load.** `npm run verify`'s
  `src/lib/tenancy/idor-regression.test.ts` failed 1 then 5 of 9 assertions
  (`same-org read works` → `null`) during this session and passed 9/9 in
  isolation both times. Lint and typecheck were green throughout. Re-run the file
  alone before believing a tenancy failure:
  ```bash
  node --test --import ./scripts/register-server-only-shim.cjs --import tsx src/lib/tenancy/idor-regression.test.ts
  ```
- **The tree is shared and dirty.** Never `git add -A`, never `git stash`, never
  create a branch. The operator manages commits.
- **Vercel preview is blocked**: the CLI token is expired and `vercel login` is
  interactive. Do not enable `AUTH_PINLESS_SIGNIN` on a preview env — previews
  point at the **shared production database**.
- Run app libs against the dev DB with the server-only shim:
  `npx tsx --env-file=.env --import ./scripts/register-server-only-shim.cjs <script>.ts`.
  USAV org is `00000000-0000-0000-0000-000000000001`.

---

## Done when

1. ~~Every Tier-1 route's `finalDisplayedUrl` is confirmed to be the surface its
   name claims, and every floor carries `formFactor` + `scenario`~~ — **done**,
   and now enforced rather than eyeballed. ~~`_stale` deleted~~ — done.
   ~~`/shipping/orders` either has a baseline or is removed~~ — done, it is a
   Tier-1 row with a floor of 90. All ten Tier-1 floors are pinned.
2. ~~A landed seed is a gated, observable fact~~ — **done** (`perf:seeds`), and
   ~~every existing seed re-justified or removed~~ — done: eight kept and pinned,
   `/incoming` removed with measurements. Two over-seed suspicions (`/unbox` 50
   rows, `/test` six keys) are written up but not measured.
3. Any barrel work is backed by a before/after measurement — **not started**. It
   is also the wrong next move: the measured gap is `/m/*` main-thread time
   (TBT 1152ms on `/m/home`), which a local barrel does not touch.
4. ~~`npm run verify` green~~ — **done**: lint ✅ typecheck ✅ unit ✅ on a quiet
   box. It went red twice mid-session on `idor-regression.test.ts` under parallel
   load; that is the shared-DB flake documented in *Environment and traps*, and
   it passed 9/9 in isolation both times and 9/9 in the final full run.
   `npm run perf:seeds` ✅. `npm run lighthouse:check` ❌ — three `RATCHET FAIL`
   lines on `/m/*`, and no others. **No baseline floor was lowered**; the tool
   now refuses to lower one without `--allow-lower`.
