# `/unbox` immediate paint — HANDOFF

**Goal (operator):** `/unbox` must paint content immediately. Lighthouse performance
**≥ 90**. Hard refresh lands on the most-recently-unboxed carton, already selected in
the left recents rail. Photo-peek images may be lower resolution.

**Status: NOT met.** Last measured Lighthouse `/unbox` = **perf 62, LCP ~8.0s**
(TBT 47ms, CLS 0). Two root causes are fixed and verified; a third change is
**built but unmeasured** and is the next thing to do (§Next step).

Everything below is uncommitted work in the `main` checkout.

---

## Paint order (ruled by the operator 2026-08-12 — this REVERSES prior SoT)

1. **Selected rail row** — the carton you were last on, already selected.
2. **Middle** — a **skeleton**, never a partially-rendered carton.
3. **Right edge.**
4. **The rest of the rail.**

The prior design painted the MRU carton's identity + line titles as an LCP stand-in.
At the bench that read as a *broken* station: a lone "Return carton" heading with a
tracking number and nothing operable, held on screen until the workspace hydrated.
`UnboxStationFirstPaint` now takes **no data props** and this is guarded.

Prose SoT still says the old thing in two places and **needs updating**:
`.claude/rules/source-of-truth.md` → *Paint content order*, and
`.claude/rules/display/unbox-station.md`. (`AGENTS.md` links both.)

---

## Root causes found (measured, prod build)

### 1. The whole app shipped ZERO server-rendered content — FIXED

`ResponsiveLayout` returned `<div aria-hidden />` whenever
`!mounted && !onMobileRoute && isMobileAllowedPath(pathname)`. `mounted` starts
`false` on the server, and `/unbox` `/receiving` `/triage` `/pack` `/test` … are all in
`MOBILE_ALLOWED_PREFIXES` — so **every station blanked its entire SSR tree**.

Measured on `/unbox`: **285KB of flight payload over 544 bytes of empty DOM.** Every
SSR stand-in built downstream of that gate was dead on arrival, which is why the
earlier station-first work could not have moved LCP.

The gate existed only to hide a desktop→mobile *in-place* flip. Operator ruling:
**mobile is `/m/*` ROUTING, not a viewport-width flip.** So the branch is now keyed on
the route (`if (!onMobileRoute)`) and the gate is deleted.

Result: real server-rendered DOM **544 B → 44.5 KB**.

### 2. `view=unbox_opened` sorts on a JOINED column, so LIMIT applies last — FIXED

Sort key is `COALESCE(ru.opened_at, …)` on `receiving_unbox`. Postgres therefore runs
~15 display laterals over the **whole** candidate set, sorts, and only then limits.

| query | time | shared buffers |
|---|---|---|
| list, `limit=50` (baseline) | 2,215 ms | **274,539** |
| count (same shape) | 1,907 ms | — |
| list, `limit=1` | 5,445 ms* | — |
| **rank ids only** (`receiving_unbox.opened_at`, top-50) | **0.32 ms** | **39** |
| **hydrate those 50** (`?receiving_id_in=`) | **54.6 ms** | **9,032** |

\* the full HTTP call; window size is not what costs. Note the route also **ignores
`limit`** for this view — `limit=1` returned 51 rows (the placeholder merge appends up
to 50 more).

Fix = **pre-limit-then-hydrate**, done additively: new optional `?receiving_id_in=` →
`query.receivingIdIn` → one extra `rl.receiving_id = ANY($n::int[])` condition. The
condition is omitted when the array is empty, so **all 87 `build-sql` tests including
the byte-identical `legacy-route-sql.fixture.ts` still pass**.

---

## Next step (do this first)

**The client was still issuing the slow query.** Seeding the server left the browser
re-fetching `/api/receiving-lines?limit=50&offset=0&view=unbox_opened` unrestricted on
hydration (seen twice in the trace: `reqid=318`, `reqid=373`). That ~6.3s refetch
re-renders the rail and is the most likely owner of the ~8s LCP.

So the pre-limit was moved **into the route** (`maybePreLimitUnboxOpened` in
`src/app/api/receiving-lines/route.ts`) so every caller gets it. This is
**built and typechecks and the fixture passes, but has NOT been measured.**

```bash
# 1. build + serve in an isolated distDir (never touch the user's :3050 dev server)
NEXT_DIST_DIR=.next-perf pnpm build
AUTH_PINLESS_SIGNIN=true NEXT_DIST_DIR=.next-perf npx next start -p 3100

# 2. session cookie
export LH_BASE_URL=http://localhost:3100
export LH_COOKIE="$(node scripts/lighthouse-mint-session.mjs)"

# 3. confirm the rail API is now fast for the CLIENT shape (this is the check)
curl -s -o /dev/null -w "%{time_total}s\n" -H "Cookie: $LH_COOKIE" \
  "http://localhost:3100/api/receiving-lines?limit=50&offset=0&view=unbox_opened"
#   expect ~0.3-0.6s, NOT 6.3s

# 4. Lighthouse (the goal metric)
pnpm lighthouse:audit -- --routes /unbox --runs 3
```

Verify `maybePreLimitUnboxOpened` actually fires — it deliberately **skips** when a
search / staff / priority filter is set, when `offset > 0`, or when the caller named
its own ids (pre-ranking before a filter would silently drop matching cartons).

---

## Remaining LCP gap — what the trace says

From a real-browser trace (`chrome-devtools` MCP, desktop, no throttling):

```
LCP 7,633 ms  =  TTFB 762 ms  +  render delay 6,871 ms
CLS 0.00      TBT 47 ms       (main thread is IDLE — this is data-wait, not CPU)
```

In-page marks: **rail rows visible at 151 ms**, middle skeleton at 1,959 ms,
skeleton→carton at 4,279 ms, final LCP element (31,831 px²) at 8,812 ms.

Levers still on the table, roughly in expected-value order:

1. **The client rail refetch** — §Next step. Highest confidence.
2. **Double RSC round-trip on auto-open.** The trace shows
   `/unbox?openReceivingId=51385&_rsc=…` fetched **twice**. Each one re-runs the page
   server component — including `seedUnboxStation` — so the auto-open costs two extra
   full page renders. Look at `useReceivingWorkspacePane` (`wantMruAutoOpen`) and
   whether the URL write can be a replace that does not re-trigger the RSC fetch, or
   whether the seed can be skipped when `openReceivingId` is already present.
3. **Duplicate carton fetches.** Same trace: `receiving_id=51385` fetched 4× and
   `receiving-photos` 4× on one load. Probably several components mounting the same
   query with different keys / `staleTime: 0`.
4. **The rail can't SSR its rows, structurally.** The rail lives in the *layout*
   (`ContextPanelLayout` → `SidebarContextPanel`), which React renders **before** the
   page's `HydrationBoundary` — so the seeded cache is not populated yet when the rail
   renders on the server. Rows fill at hydration instead (hence 151ms, not 0ms). To
   get rows into the SSR HTML the seed would have to hydrate above the layout, or the
   rail would need the rows passed as props. `SidebarContextPanel` already lost its
   `ssr: false` so the rail **chrome** does SSR now (`dynamic()` still code-splits, so
   the bundle-altitude rule in `build-gotchas.md` is intact).

---

## Files changed (all uncommitted)

| File | Change |
|---|---|
| `src/components/layout/ResponsiveLayout.tsx` | Deleted the pre-hydration blank gate; desktop branch keyed on route not width; removed the now-unreachable `mobileRouteRestricted` blank |
| `src/components/sidebar/ContextPanelLayout.tsx` | Dropped `ssr: false` from `SidebarContextPanel` (kept `dynamic()`) |
| `src/lib/receiving/lines/query.ts` | New `receivingIdIn` + `?receiving_id_in=` parse (capped 500, deduped) |
| `src/lib/receiving/lines/build-sql.ts` | Optional `rl.receiving_id = ANY(...)` in the list; same filter in `buildUnboxOpenedPlaceholdersSql` (param pushed **last** so `$2`/`$3` numbering holds) |
| `src/app/api/receiving-lines/route.ts` | `maybePreLimitUnboxOpened()`; `query` is now `let` |
| `src/lib/queries/unbox-spine-seed.server.ts` | `rankUnboxMruReceivingIds` + pre-limited `seedUnboxRecentRail`; rail + carton lines seeded in `Promise.all`; returns `mruReceivingId` only |
| `src/components/receiving/unbox/UnboxStationFirstPaint.tsx` | Rewritten as a **static skeleton**, no data props |
| `src/components/receiving/unbox/UnboxBrowseShell.tsx` | Dropped the carton props; covers the middle only |
| `src/app/unbox/page.tsx` | Removed the `sr-only` duplicate stand-in |
| `src/app/api/receiving-photos/route.ts` | Returns `thumbUrl` beside `photoUrl` |
| `…/line-edit/photo-peek-pending.ts` | `PeekCard.fullUrl` |
| `…/line-edit/ReceivingPhotoPeek.tsx` | Tiles take the thumb; `fullUrl` carries full-res |
| `…/line-edit/PhotoPeekFan.tsx` | Viewer uses `fullUrl \|\| imgUrl` (zoom/pan must not inherit the downscale) |
| `…/unbox/unbox-browse-first-paint.guard.test.ts` | Rewritten for the new ruling + `readCode()` (comment-stripping) |
| `src/lib/queries/unbox-recent-rail-seed.guard.test.ts` | Matches the new `seedUnboxRecentRail` arity |

Verified: `npx tsc --noEmit` clean tree-wide; `build-sql` 87/87; `query` 27/27; unbox
guards 23/23; eslint clean on every changed file. **`npm run verify` has NOT been run.**

---

## Schema gotchas (cost real time — do not re-derive)

- **`receiving.unbox_opened_at` does NOT exist** in this database, despite
  `2026-06-30_receiving_unbox_opened_at.sql`. The live SoT is
  **`receiving_unbox.opened_at`** (street-tables cutover).
- **`receiving` has no `tracking_number`** either. Check `information_schema` before
  writing identity SQL; use `/api/receiving/[id]` for carton identity.
- `receiving_unbox` has **no index** on `(organization_id, opened_at)` and does not
  need one at 684 opened rows — the top-N seq scan is 0.32ms. Don't add DDL for this.
- The MRU on the dogfood org is a **lineless unfound placeholder** (`receiving_id`
  51385, rail row id `-51385`, title `Unfound PO` from `UNMATCHED_EMPTY_LINE_LABEL`).
  Its siblings fetch returns `[]`. Any "carton identity" path must handle that.
- Test files that import server-guarded modules need
  `NODE_OPTIONS='--conditions=react-server'`.

---

## Open decision — image resolution (needs the user)

Photo peek is done (tiles = thumb, viewer = full). The user also asked for **Zoho SKU
images low-res on load, upgrading to high-res once loaded**. Blocked on a choice:

- **Add `sharp` as a dependency** and resize in `/api/zoho/items/[id]/image?w=`.
  `sharp` is on disk but only as an **undeclared transitive dep of Next** — building on
  it is fragile (a lockfile change can remove it). This is a new install.
- **Use `next/image`** on the same-origin proxy — no new dep, but the `sc.image_url`
  catalog fallback points at external hosts needing `remotePatterns` entries.

Also flag when implementing: a low→high **upgrade on the peek tiles** downloads both
variants, which spends the bytes the thumb just saved unless the operator zooms. The
viewer already pulls full-res on demand.

---

## Hard constraints

- **Never start/stop/kill the user's dev server on `:3050`.** Perf work uses an
  isolated `NEXT_DIST_DIR=.next-perf` on a free port.
- **Never raise a ratchet/guard baseline** to make something pass.
- Lighthouse must run against a **production build** — dev/Turbopack numbers are not
  representative. `/unbox` is pinned `formFactor: 'desktop'` in the manifest; the audit
  script's progress line mislabels it "mobile" (cosmetic bug in `lighthouse-audit.mjs`
  line 219 — it prints the global flag, while line 120 correctly passes the route's).
