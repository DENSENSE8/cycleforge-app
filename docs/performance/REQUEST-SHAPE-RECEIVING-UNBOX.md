# Request-shape audit — `/unbox` and `/triage`

**Status: shipped 2026-08-24 — items 1, 2, 4, 5, 7, 8, 9 landed; 3 blocked by its
own gate; 6 deferred.** `npm run verify` green throughout. Every number below is
re-measured on a fresh production build, not projected.

## What shipped, and what it actually bought

| | before | after |
|---|---|---|
| cold `/unbox` | 49 req | **46 req** |
| cold `/triage` | 42 req · 124,378 B | **40 req · 115,501 B** |
| `/triage` focus regain #1 | 26 req · 104,340 B | **11 req · 69,807 B** |
| `/triage` focus regain #2 | 26 req · 104,652 B | **3 req · 12,149 B** |

Per item:

- **1 · focus-refetch default** — `'always'` → `true`. The big one, and it
  over-delivered: repeated alt-tabs went from re-firing the whole page to
  near-silence. Cold load byte-identical.
- **2 · badge count probes** — `?count_only=1` on both routes. Payload
  3606 B + 3514 B → **369 B + 370 B**. Time was a **partial** win, not the
  elimination I projected: 3513 ms → 3262 ms and 5767 ms → 3999 ms. The count
  query is itself expensive because the gating WHERE is (measured standalone:
  count 826–916 ms vs full list 1785–1939 ms), so removing the list SQL removes
  roughly half the cost, not all of it. **It also fixed a real bug** — see below.
- **3 · seed `/triage` server-side** — **does not ship.** Gate failed; evidence
  in the item.
- **4 · spine/full drift** — instrumentation landed, flag-gated, default off
  (`RECEIVING_SERIAL_PROJECTION_DRIFT_PROBE`). The probe lives where the route
  already holds both serial sets, so it costs no extra query.
- **5 · `/api/locations`** — 2 → **1** on cold `/triage`, −8165 B, and gone from
  the focus storm.
- **7 · `/api/inbox/support`** — 2 → **1** on both routes.
- **8 · `/api/staff-preferences`** — 2 → **1** on cold `/unbox`.
- **9 · carton lines** — landed, but **no measured effect**. My attribution was
  wrong: `useSourcePlatform` only fetches when the row carries no platform, so
  it was never one of the duplicate callers. The change is still correct (it now
  reads the shared siblings cache when warm), but the remaining duplicate is
  `useCartonPoTotal`, which is deliberate. See the item.
- **6 · carton photos** — **deferred.** On inspection this is not a two-caller
  dedup: `/api/receiving-photos` has ~15 independent callers across the photo
  capture, studio, compare and step surfaces, most of them raw fetches with
  their own params, alongside a proper shared hook (`useScopedReceivingPhotos`).
  Consolidating them is a photo-subsystem refactor with real risk to the capture
  and delete flows, not a request-shape tweak. Left for its own change.

### A bug the count work uncovered

`GET /api/receiving/unfound-queue` returned `total: result.rows.length` — the
**page** size, not the collection size. Measured: `limit=1` → total 1,
`limit=5` → total 5, `limit=200` → total 151. The triage Unfound badge fetched
`?limit=1` and read `total`, so **it displayed `1` for any non-empty queue**.
Fixed by the same `?count_only=1` arm; the badge now reads 151.

A second, smaller divergence is recorded in
`src/app/api/receiving-lines/route.ts`: on `view=unbox_opened`, `?limit=N`
reports the page size rather than the collection size, because
`maybePreLimitUnboxOpened` narrows the counted set. `count_only` reports the
true total there and deliberately disagrees. No shipped caller reads that total,
so nothing changed behaviourally — but it is the same class of bug and worth its
own fix.

---

Measured against a **production build** on an isolated distDir and port
(`NEXT_DIST_DIR=.next-perf pnpm build` → `next start -p 3100`), per
[`LIGHTHOUSE.md`](LIGHTHOUSE.md). The operator's `:3050` dev server was never
touched. Dev numbers were discarded: React StrictMode double-invokes effects, so
every raw `fetch`-in-`useEffect` appears twice and the duplicate counts are
fiction.

`/receiving?mode=triage` redirects to `/triage`; that is the surface measured.

## Baseline

| | cold `/unbox` | cold `/triage` |
|---|---|---|
| TTFB | 1866 ms | 1881 ms |
| API requests | **49** | **42** |
| API bytes (transfer) | — | **124.4 KB** |

**Warm pass — one window-focus regain on `/triage`: 26 requests, 104.3 KB.**
A second focus cycle seconds later fired the identical 26 requests / 104.7 KB.

## The four axes, as they actually stand

- **Depth** is real but small and mostly deliberate: spine→full (#4),
  staff-messages→support (#7), photos list→photo content.
- **Width** is the dominant cold-load shape — 42–49 requests, nearly all fired
  in one burst at hydration. HTTP/2 multiplexes them, so the cost is server
  round-trips and DB time, not connection setup.
- **Redundancy** is the largest single category: same payload, more than one
  caller, because the second caller never entered React Query.
- **Poll-vs-push** is where the biggest number is (#1).

---

## 1. `refetchOnWindowFocus: 'always'` re-fires the whole page on every focus regain

> **LANDED 2026-08-24.** `src/components/Providers.tsx` now sets
> `refetchOnWindowFocus: true`. Two comments that justified themselves by naming
> the old `'always'` default were restated (`usePoLinesData.ts`,
> `PhotoLibraryWorkspaceHeader.tsx`); the `false` override in `usePoLinesData`
> stays and is still load-bearing. `npm run verify` green (6280 unit tests).
>
> **Re-measured on a fresh production build, cold `/triage`:**
>
> | | before | after |
> |---|---|---|
> | cold load | 42 req · 124,378 B | **42 req · 124,377 B** (unchanged) |
> | focus regain #1 | 26 req · 104,340 B | **11 req · 70,196 B** |
> | focus regain #2, seconds later | 26 req · 104,652 B | **1 req · 312 B** |
>
> Cycle #1 still refetches the queries whose own `staleTime` (20 s) had already
> elapsed since the cold load — that is the intended behaviour, not a miss.
> Cycle #2 is the operator-facing win: repeated alt-tabs now cost essentially
> nothing. `/api/catalog/*`, `/api/staff-preferences`, `/api/locations`,
> `/api/nav` and `/api/settings` dropped out of the storm entirely. The one
> survivor on cycle #2 is `/api/receiving/pending-work`, which opts into focus
> refetch deliberately (`usePendingWork.ts:57`).

**Today (before the change)** — [`src/components/Providers.tsx:34`](../../src/components/Providers.tsx)
sets `refetchOnWindowFocus: 'always'` as the global QueryClient default.
`'always'` **ignores `staleTime` entirely.**

Measured on `/triage`: one blur→focus cycle fires **26 requests / 104.3 KB** —
62% of the cold-load request count and 84% of its bytes. A second cycle *seconds
later* fired the same 26 / 104.7 KB, including:

| endpoint | staleTime | bytes | refetched anyway |
|---|---|---|---|
| `/api/catalog/platforms` | 5 min | 2632 | yes |
| `/api/catalog/types` | 5 min | 1999 | yes |
| `/api/catalog/priorities` | 5 min | 332 | yes |
| `/api/staff-preferences` | 10 min | 1943 | yes |
| `/api/locations` ×2 | — | 16330 | yes |
| `/api/receiving-lines?view=scanned&sort=priority` | 20 s | 43781 | yes (3758 ms) |

This fires on every alt-tab, every scanner focus bounce, and every
print-popup return.

**Should become** — staleTime tuning (§4). `'always'` → `true`, so `staleTime`
is honored. Queries that genuinely need focus freshness opt in per-query.

**Removed** — predicted "at minimum 8 requests ≈25 KB"; measured **15 requests
and 34 KB off the first focus regain, and 25 requests / 104 KB off every
subsequent one**. 0 ms off cold LCP — this is entirely a warm-pass win, and it
is the largest one on the page.

**Must not break**
- [`usePoLinesData`](../../src/components/receiving/workspace/hooks/usePoLinesData.ts)
  already overrides to `refetchOnWindowFocus: false` because the Pass+Print
  popup bounces focus and a refetch wipes the operator's optimistic verdict.
  That override is load-bearing *because* the global is `'always'`; it stays.
- [`useSidebarRail.ts:77`](../../src/components/sidebar/rail-shell/useSidebarRail.ts)
  already sets `refetchOnWindowFocus: true` explicitly (= respect staleTime), so
  no rail behaviour changes.
- Mutations already reconcile via Ably + the `app-refresh-data` refresh bus, so
  focus is not the freshness mechanism.

**Risk** — low. No tenancy, no dismiss/undo contract, no snapshot continuity.
**Migration** — none.

---

## 2. Tab-badge counts run the full display-lateral list query for one integer

**Today**
- [`UnboxWorkspaceHeader.tsx:388`](../../src/components/receiving/unbox/UnboxWorkspaceHeader.tsx) —
  `['unbox-queue-badge']` → `GET /api/receiving-lines?limit=1&offset=0&view=scanned&sort=priority`
- [`UnboxWorkspaceHeader.tsx:417`](../../src/components/receiving/unbox/UnboxWorkspaceHeader.tsx) —
  `['unbox-recent-badge']` → `GET /api/receiving-lines?limit=1&offset=0&view=viewed`
- [`TriageWorkspaceHeader.tsx:62`](../../src/components/receiving/triage/TriageWorkspaceHeader.tsx) —
  `['triage-unfound-badge']` → `GET /api/receiving/unfound-queue?limit=1&offset=0`

Each reads exactly one field: `body.total`.

Measured on cold `/unbox`:

| request | duration | bytes |
|---|---|---|
| `?limit=1&view=scanned&sort=priority` | **3513 ms** | 3606 |
| `?limit=1&view=viewed` | **5767 ms** | 3514 |

The second is the **longest request on the page**.

`limit=1` does not make the query cheap. The route always runs the list SQL and
the count SQL in parallel
([`route.ts:300`](../../src/app/api/receiving-lines/route.ts)), and the list's
`ORDER BY` key lives on a joined table, so Postgres runs ~15 display laterals
over the whole candidate set before it can sort and limit. That is already
written down twice in this repo —
[`route.ts:270`](../../src/app/api/receiving-lines/route.ts) and
[`unbox-spine-seed.server.ts:88`](../../src/lib/queries/unbox-spine-seed.server.ts)
("a `limit=1` request still took 5.4s, because the window size is not what
costs"). The `maybePreLimitUnboxOpened` fix only covers `view=unbox_opened`.

**Should become** — a `?count_only=1` param on the same route that skips
`built.list` entirely and returns `{ success, total }`. No new endpoint, no new
permission surface, no migration.

Rejected alternative: read `total` off the spine query's payload. The unbox
queue badge's filter set matches the spine fetch *only when no `ustage`/`ulane`
facet is set, and the badge is documented as needing to match the filtered
total, so it would silently go wrong under a facet.

**Removes** — 0 requests, but ≈3.5 s and ≈5.8 s of DB time off two background
queries and ~7 KB off the wire per cold load. On `/triage` the unfound badge is
only 543 ms but is a second read of a queue already fetched at `limit=200`
seven seconds earlier.

**Must not break** — `total` is not just `built.count`. The route adds the
unmatched-placeholder count ([`route.ts:325`](../../src/app/api/receiving-lines/route.ts))
and the unbox-opened placeholder count ([`route.ts:377`](../../src/app/api/receiving-lines/route.ts)),
and overrides it wholesale for the `WRONG_DESTINATION` filter
([`route.ts:419`](../../src/app/api/receiving-lines/route.ts)). `count_only`
must run those arms too. Pin it with a route test asserting
`count_only=1` `total` ≡ `limit=1` `total` across `scanned` / `viewed` /
`unbox_opened` / `activity`.

**Risk** — low-medium. Touches the hottest route in the app; the correctness
question is entirely "did I reproduce every arm that adjusts `total`".
**Migration** — none.

---

## 3. `/triage` has no server seed — BLOCKED, does not ship

> **GATE FAILED 2026-08-24.** The item's own precondition was "check the ranking
> column first; if there is no cheap one, stop and say so." There is not, and
> pre-limiting would not help even if there were.
>
> **1 · No cheap ranking column.** `sort=priority` orders by
> `RECEIVING_PRIORITY_RANK_SQL` — a CASE expression over
> `receiving_carton.priority_tier / is_priority / source / source_platform` —
> then `RECEIVING_LANE_RANK_SQL` over `receiving_triage.priority_lane`, then
> `rt.door_received_at`. That spans two lateral-joined tables and is computed at
> read time by design (so re-tagging a carton re-prioritises it immediately).
> There is no indexed column to rank on, unlike `receiving_unbox.opened_at`
> which is what makes `seedUnboxStation` cheap.
>
> **2 · Pre-limiting has nothing to narrow.** `view=scanned` returns **15 rows
> total** on the dogfood org, and `limit=1` costs the same as `limit=50`:
>
> | | run 1 | run 2 | run 3 |
> |---|---|---|---|
> | `count_only=1` | 826 ms | 899 ms | 916 ms |
> | `limit=1` | 1785 ms | 1939 ms | 1816 ms |
> | `limit=50` | 1813 ms | 1839 ms | 1929 ms |
>
> The answer set *is* the candidate set. Window size is irrelevant; the cost is
> the gating WHERE (~0.9 s, visible in the `count_only` row) plus the per-row
> display laterals.
>
> **3 · Therefore a seed makes it worse.** It would move ~1.8 s (dev) / ~3.6 s
> (prod) in front of the shell as blocking TTFB, replacing a non-blocking fetch.
> `seedUnboxStation` is only defensible because it costs 0.32 ms + ~55 ms.
>
> **The real successor item is not a seed.** It is that
> `view=scanned&sort=priority` takes 1.8–3.6 s to return **15 rows**. That is a
> query-cost problem, not a request-shape one, and it is the single biggest
> remaining number on `/triage`. It needs an EXPLAIN pass over the gating WHERE
> and the display laterals — out of this audit's mandate.

## 4. The `full` tier refetches the same 50 rows for a 291-byte delta

**Today** — [`useReceivingLinesQuery.ts:78-91`](../../src/components/station/useReceivingLinesQuery.ts)
runs a two-tier fetch: `spine` (`?phase=spine`, serial chips from the
`serial_projection` read-model) paints first, then `full` (`?include=serials`,
the authoritative resolve) is gated on `spineQuery.isFetched` — deliberately
serialized "so the two list queries never race the DB".

Measured on cold `/unbox`:

| request | window | bytes |
|---|---|---|
| `?limit=50&view=scanned&sort=priority&phase=spine` | 6974→10836 (3862 ms) | 43781 |
| `?limit=50&include=serials&view=scanned&sort=priority` | 10841→**13671** (2830 ms) | 44072 |

The second starts 5 ms after the first ends. **6697 ms strictly serial, 87.9 KB,
for the same 50 rows twice.**

I diffed the two payloads directly against the dogfood org: for all 15
`view=scanned` rows the spine serials are **identical** to the authoritative
resolve, and `units` is not added either. The `full` tier is currently buying
nothing measurable on this view.

**Should become** — retire `full` for views where the projection is
authoritative, which is the "retire reliance on Tier A's prefetch" step the
serial plan already sequences.

**Removes** — 1 request, 44 KB, ~2830 ms off the tail of `/unbox`.

**Must not break** — one org at one moment is not proof the projection never
drifts. **Instrument before deleting**: have the route compare projection
serials against the authoritative resolve behind the existing feature flag and
log the divergence rate for a week. Ship the removal only if it is zero. The
carry-forward in
[`usePoLinesData.ts:126-165`](../../src/components/receiving/workspace/hooks/usePoLinesData.ts)
(`shouldPreserveCachedSerials` — an empty `[]` from an unpopulated projection is
*not* authoritative) exists precisely because drift was real once.

**Risk** — medium: it is serial-chip correctness, which the operator reads at a
bench. Hence instrument-first.
**Migration** — none.

---

## 5. `/api/locations` is fetched twice, uncached, 8.2 KB each

**Today** — three call sites, only one of them in React Query:
- [`useTriageStaging.ts:31`](../../src/components/receiving/triage/useTriageStaging.ts) — raw `fetch('/api/locations', { cache: 'no-store' })`
- [`line-location-port.ts:44`](../../src/components/receiving/line-location-port.ts) — raw `fetch('/api/locations', { cache: 'no-store' })`
- [`useLocations.ts:52`](../../src/hooks/useLocations.ts) — the same fetcher, behind a query

Cold `/triage`: 9680→10452 and 9688→11248, **8165 bytes each**. Both also appear
in the focus-regain storm, so this is 16.3 KB per cold load *and* 16.3 KB per
alt-tab.

**Should become** — React Query dedup (§4). Route both raw callers through
`useLocations`.

**Removes** — 1 request, 8165 B cold, 8165 B per focus regain.

**Must not break** — check whether `line-location-port` is called imperatively
from outside a React tree (the name suggests a port/adapter); if so it needs
`queryClient.fetchQuery` on the shared key rather than the hook.

**Risk** — low. **Migration** — none.

---

## 6. The same carton's photos are fetched three times

**Today** — cold `/unbox` fires
`GET /api/receiving-photos?receivingId=51971&photoIntent=carton` **twice**
(2659, 2667) plus `?receivingId=51971` once (2669) — all three **6629 bytes**,
i.e. `photoIntent` is not narrowing the response at all. That is 19.9 KB for one
carton's photo list, which then fans out to 5 dependent
`/api/photos/<id>/content` requests (6318→11379).

**Should become** — React Query dedup on a `['receiving-photos', receivingId]`
key with `select` for the intent filter, since the server returns the same rows
regardless.

**Removes** — 2 requests, 13.3 KB.

**Must not break** — confirm `photoIntent` really is a no-op server-side before
folding it into a selector; identical byte counts are strong evidence but not
proof (it could be filtering rows that happen to compress out).

**Risk** — low-medium. **Migration** — none.

---

## 7. `/api/inbox/support` is fetched twice, the second serially behind staff-messages

**Today** — [`ActivityInboxContext.tsx:356`](../../src/contexts/ActivityInboxContext.tsx)
ends `refreshStaffMessages` with `if (!inboxSuppressedRef.current) void refreshSupportFollowups();`,
racing the independent idle effect at
[`:296`](../../src/contexts/ActivityInboxContext.tsx) that already fetched it.

Confirmed on both routes — the second call starts within 6 ms of
`/api/staff-messages`'s `responseEnd` (unbox 6258→6264; triage 5936→5937).

**Should become** — push over poll (§4). The file's own comment at `:268` says
support is refetched "when a `support_assignment` staff_message push lands", so
the chain is a second belt for a push that already exists. Drop the tail call.

**Removes** — 1 request, 322 B, and one serial hop off the inbox chain.

**Must not break** — the chain exists because `refreshStaffMessages` filters
`m.kind !== 'support_assignment'` ([`:341`](../../src/contexts/ActivityInboxContext.tsx)):
staff-messages deliberately excludes those and support owns them. Verify the
Ably handler covers a `support_assignment` arriving in the same batch as an
ordinary message before deleting the chain — if it does not, the fix is to make
the push handler fan in, not to keep the fetch.

**Risk** — low. **Migration** — none.

---

## 8. `/api/staff-preferences` is fetched twice under two query keys

**Today** — [`useStaffPreferences.ts:44`](../../src/hooks/useStaffPreferences.ts)
(key `QUERY_KEY`) and [`useUnboxDefaultPins.ts:24`](../../src/hooks/useUnboxDefaultPins.ts)
(key `['unbox-default-pins']`) both `GET /api/staff-preferences` and both parse
the same 1943-byte payload. Two React Query cache entries for one response — the
exact fragmented-key case §4 names.

**Should become** — React Query dedup. `useUnboxDefaultPins` becomes a `select`
over `useStaffPreferences`.

**Removes** — 1 request, 1943 B, cold *and* on every focus regain.

**Risk** — low; the only care needed is that both keep their 10-minute
staleTime. **Migration** — none.

---

## 9. One carton's lines are fetched 2–4× per open

**Today** — cold `/unbox`: `?receiving_id=51971` ×2 (533 B each). Cold
`/triage`: `?receiving_id=51764` ×2 (3672 B each) plus `&include=serials` ×1
(3815 B) = **11.2 KB** for one carton.

Callers:
- [`usePoLinesData`](../../src/components/receiving/workspace/hooks/usePoLinesData.ts) — React Query, `['receiving-siblings', id]`, plus a **parallel** `include=serials` twin on `['receiving-siblings-serials', id]`. Deliberate and documented; parallel, so no depth cost.
- [`useCartonPoTotal.ts:57`](../../src/components/receiving/workspace/line-edit/hooks/useCartonPoTotal.ts) — React Query on its **own** key, unconditionally. The file documents why two rounds of "is the shared cache usable yet" heuristics both failed.
- [`useSourcePlatform.ts:45`](../../src/components/receiving/workspace/line-edit/hooks/useSourcePlatform.ts) — raw `fetch`, gated on an empty `row.source_platform`.
- [`usePoContext.ts:76`](../../src/components/sidebar/receiving/usePoContext.ts) — raw `fetch`, event-driven.

**Should become** — take the cheap half only. `useSourcePlatform` needs one
field that `usePoLinesData`'s payload already carries (`receiving_package.source_platform`);
read it off the shared cache with the fetch as fallback. Leave `useCartonPoTotal`
alone for now — it is the one place in this audit where the redundancy was
introduced *on purpose* after two failed attempts to remove it, and the payoff
(3.7 KB) does not justify re-opening it.

**Removes** — 1 request, 0.5–3.7 KB.

**Must not break** — the carry-forward at
[`usePoLinesData.ts:126-165`](../../src/components/receiving/workspace/hooks/usePoLinesData.ts):
a metadata refetch must never blank serials/units that optimistic scans or
hydration already put on the cache.

**Risk** — medium (this is the file with two documented failed attempts).
**Migration** — none.

---

## Suspects from the handoff that do not reproduce

These were checked directly and are **not** findings. Do not spend time on them.

**Serial-hydration N+1 (`useHydrateVisibleSerials`) — fires zero requests.**
No `?receiving_ids=` request appears on either route, cold or warm.
`view=scanned` returns 15/15 rows already carrying `serials` arrays.
`view=unbox_opened` returns 7 of 50 rows with `serials == null`, but all 7 have
**negative ids** (lineless unfound placeholders), and
[`rowsNeedingSerials`](../../src/components/sidebar/receiving/useHydrateVisibleSerials.ts)
excludes them via `r.id > 0`. Tier B2's projection already retired this hook, exactly
as its own docstring predicted. It is a dormant fallback, not an N+1.

**Ably channel count — one shared connection.**
[`AblyContext.tsx`](../../src/contexts/AblyContext.tsx) mounts exactly one
`Ably.Realtime` for the whole app and defers the ~177 KB SDK import past `load`
to `requestIdleCallback`. Exactly one `/api/realtime/token` per load
(unbox 5236 ms, triage 12227 ms). Multiple channel subscriptions ride that one
client. Nothing to fix.

**`usePlatformMeta` cache fragmentation — none.**
It resolves to `platformsQuery()` → the stable key `catalogKeys.platforms(false)`
with a 5-minute staleTime. Exactly one `/api/catalog/platforms` per load despite
~16 consumers. The dedup works.

**"Unbox mounts 6–8 rail requests from concurrent feeds" — it mounts one rail.**
[`ReceivingRailBody.tsx:79`](../../src/components/sidebar/receiving/ReceivingRailBody.tsx)
renders a single `unboxRecent` rail. `/triage` does mount two `ReceivingFeedRail`
instances of the same `triageCombined` feed (sidebar + right-pane workbench,
both defaulting to `triview=triage`), but they share a query key so React Query
dedupes the rows fetch, and the right pane mounts ~3.5 s later, by which time
`data` is an array and the snapshot effect short-circuits at
[`useSidebarRail.ts:143`](../../src/components/sidebar/rail-shell/useSidebarRail.ts).
Real rail cost is 4 requests on `/triage`, 1 on `/unbox`.

**Rail snapshot GET firing alongside the live fetch — not on `/unbox`.**
Zero snapshot GETs on cold `/unbox`; the RSC seed short-circuits the seed
effect. On `/triage` there is exactly one, it resolved 2.3 s *before* the
primary, and it is doing its job when it hits (it returned 341 B — a miss — on
my capture, because the TTL is 60 s). Two POSTs per load (seed settle, then
authoritative settle) — correct by design, 654 B total, not worth touching.

**Do not build the composite rows+exclusions+snapshot endpoint.** It would merge
one request that has already been eliminated on `/unbox` (snapshot), one that
should be eliminated by the seed instead (#3), and one that is a display filter
off the critical path (exclusions). It would also couple cache invalidation for
the dismiss flow, whose optimistic contract —
`RAIL_LINE_RESTORED_EVENT` / `RAIL_ENTRY_RESTORED_EVENT` in
[`rail-dismiss.ts`](../../src/components/sidebar/receiving/rail-dismiss.ts),
consumed by `useRailRowDismiss`'s undo toast — currently patches client-side
with no refetch at all. That is the better shape; do not trade it away.

## Suggested order

**No item here needs a schema migration**, so there is no expand→code→contract
sequence to run except possibly a supporting index for #3.

1. ~~**#1**~~ **landed**. Then **#8, #5, #7** — three independent low-risk
   changes, no shared files. Together: ~2 requests and ~10 KB off cold load, and
   they also shrink what is left of the focus regain.
2. **#2** — the single biggest DB-time win; needs a route test before it lands.
3. **#3** — start with the ranking-column check. If there is no cheap ranking
   column, stop and say so; do not ship a blocking seed.
4. **#4** — instrument first, delete a week later.
5. **#6, #9** — cleanup once the above are stable.

## Reproducing the measurements

```
NEXT_DIST_DIR=.next-perf pnpm build
AUTH_PINLESS_SIGNIN=true NEXT_DIST_DIR=.next-perf npx next start -p 3100
```

Sign in via the pinless staff-picker flow (same one
`scripts/lighthouse-mint-session.mjs` uses), then read
`performance.getEntriesByType('resource')` filtered to `/api/`. For the warm
pass, toggle `document.visibilityState` and dispatch `visibilitychange` **on
`window`** — TanStack Query v5's focus manager listens there, not on `document`.
