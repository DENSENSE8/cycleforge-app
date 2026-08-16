# Scan-station immediate-paint port — Arrival first

**Scope: PAINT only.** This is the port of the `/unbox` first-paint work to the
sibling scan stations. It is **not** the display-anatomy port — that is
[`station-port-from-unbox.md`](../../.claude/rules/display/station-port-from-unbox.md),
and Arrival already completed it (certified 2026-08-10).

**Order: Arrival (`/triage`) → Testing (`/test`) → Pack (`/packer`) → Shipping.**
One station per change. Never port N in one pass.

Source of the patterns: [`unbox-immediate-paint-HANDOFF.md`](unbox-immediate-paint-HANDOFF.md)
(measurements, traps, and six reverted experiments).

---

## Why this is worth doing (measured on Unbox)

| | before | after |
|---|---|---|
| Lighthouse perf | 36 | 83 local · **88 production** |
| LCP | 15,177ms | 2,448ms local · **1,709ms production** |
| FCP | 1,654ms | 404ms |
| TBT | 294ms | **0** |
| CLS | 0.227 | **0** |

TTFB local 1,420ms vs production 50ms — the local ceiling is `tenantQuery`'s
four round trips × ~90ms to remote Neon, **not** application code. Judge a port
on the production number, or on the sub-scores (FCP/TBT/CLS), never on the local
perf total.

---

## STEP 0 — Fix the measurement before touching code

**Do this first or every number you collect is from the wrong page.**

`/unbox` sat at "62" for months because the audit measured the **mobile** surface:
on a mobile UA the proxy rewrites the desktop route to its `/m/*` twin, and the
audit pinned neither UA nor throttling.

`/triage` has the identical exposure **today**:

```js
// scripts/lighthouse-audit.mjs — ROUTES
{ path: '/unbox',  tier: 1, auth: true, formFactor: 'desktop' },  // pinned
{ path: '/triage', tier: 1, auth: true },                          // NOT pinned
{ path: '/m/triage', tier: 2, auth: true },                        // the twin it rewrites to
```

Pin the station route to `formFactor: 'desktop'`, exactly as `/unbox` is. Same
for `/test` and `/packer` when their turn comes. Verify from the LHR, never the
console line:

```bash
node -e "console.log(require('./lighthouse/triage.json').configSettings.formFactor)"
```

The progress line prints the **global** form factor ("3x mobile") even for a
desktop-pinned route — a cosmetic label bug (task #6). `configSettings.formFactor`
is authoritative.

---

## The eight patterns

Each links the Unbox implementation to copy.

### 1. The declared LCP surface must never be `ssr: false`

The single biggest win. `ReceivingLineWorkspace` was behind
`dynamic(..., { ssr: false })`, so the middle could not paint until hydration —
~7.6s of blank. Removing it is most of 36 → 83.

- Do: `dynamic(..., { loading: () => <Skeleton /> })` — keep the chunk split, drop the SSR opt-out.
- Keep `ssr: false` on the **desk tables** (`UnboxWorkspaceView`), which are P1-deferred.
- SoT: `source-of-truth.md` → Paint content order. Guard: `tier1-paint-order.guard.test.ts`.

### 2. Seed above the app shell, not in the page

`src/lib/queries/unbox-shell-seed.server.ts` + `ShellQuerySeed` in
`src/app/layout.tsx`. Seeding in the page means the shell renders first and the
station's caches arrive a beat late.

**Arrival is not wired to this.** The gate is literally one route:

```ts
// unbox-shell-seed.server.ts
if (pathname !== UNBOX_SURFACE_ROUTE) return null;
```

`TRIAGE_SURFACE_ROUTE` already exists in `src/lib/receiving/surface-path.ts`, so
generalize the gate to a set rather than adding a second seed module.

**Start the seed BEFORE awaiting auth** so they overlap — auth is ~403ms and is
*not* on the critical path once parallel:

```tsx
const seedPromise = maybeSeedShell(pathname);   // start
const initialUser = await getInitialAuthUser(); // overlap
const seed = await seedPromise;                 // join
```

### 3. Station-first cold land (never a table, never blank)

Bare `/unbox` opens the MRU carton or an empty scan bench; tables only behind
`?unboxdesk=1` (Back to list). Helpers: `src/lib/receiving/unbox-selection-url.ts`
(`shouldAutoOpenUnboxMru`, `applyUnboxDeskParam`).

**Open question for Arrival — decide, do not guess.** Unbox ranks MRU from
`receiving_unbox.opened_at` (`view=unbox_opened`). Arrival is a *door* station:
its "most recent" is a scan/identify event, not an unbox. Pick the honest column
before writing the query. If Arrival has no resumable single record, ship the
empty-scan-bench branch and **skip the auto-open** — honest absence beats
inventing a working set (same rule the return-to-scan CTA follows).

### 4. The rail must render its seeded rows during SSR

`useSidebarRail` only read `localRows`, which is populated in an effect — so the
server rendered zero rows over a fully-seeded cache:

```ts
const mirroredRows = localRows ?? (Array.isArray(data) ? sortRowsByActivity(data) : null);
```

Arrival shares `ReceivingSurfacePage`, so **this one is already inherited** —
verify, don't re-implement.

### 5. Derive the open record during RENDER, not only in an effect

`seededWorkspace` in `useReceivingWorkspacePane` — an effect-only derivation
cannot exist on the server pass, so the middle is blank in the SSR HTML no matter
how good the seed is. Also: `window.history.replaceState` over `router.replace`
for the URL sync (a router call re-runs the RSC pass).

### 6. No `opacity: 0` in the SSR HTML

`RouteShell`'s desktop branch shipped `style="opacity:0;transform:translateY(16px)"`,
so the middle was invisible to FCP/LCP however early the server produced it.
Desktop uses `initial={false}` (motion SoT: `initial={false}` on first mount).
Check every station wrapper for an entrance animation on the LCP element.

### 7. Thumbnails, not full-resolution sources

Peek/launcher tiles took `url` (the full source): five photos ≈ 1MB and the LCP
element. Fixes: `thumbUrl ?? url` on tiles; thumbs resolve **before** any storage
lookup (`resolve-access-url.ts`); the content route normalizes every thumb through
`generateThumbnail` with a bounded in-process memo; `loading="eager"` +
`fetchPriority="high"` on the **first** tile only.

### 8. CLS — don't let the right edge evict the rail on cold load

The Displays cockpit auto-opened, parking the left rail and shifting the surface
328px seconds after paint (CLS 0.227). Gate:

```ts
if (cartonChanged && !showDisplays && stationDisplaysOpenWouldParkRail()) return;
```

`stationDisplaysOpenWouldParkRail()` (`src/lib/right-rail/frame.ts`) reads the
**frame store**. An earlier version read `window.innerWidth` against the rail
*min* and reported "fits" at 1350px while the real content row was 1318px against
a 360px rail — CLS did not move at all. Any station that auto-opens a cockpit
leaf on record change inherits this.

---

## Traps that cost real time

- **`pg` returns `timestamptz` as `Date`.** The HTTP path stringifies via
  `NextResponse.json`; **RSC serialization preserves `Date`**, so a seeded row
  crashes client code doing `(row.x || '').trim()`. Seed through the same wire
  shape as the route — `toWireRows` (JSON round-trip) in `unbox-spine-seed.server.ts`.
  This shipped a runtime crash to the operator.
- **Use the record's dedicated query builder.** A generic list builder for one
  carton took **6.1s**; `buildReceivingLinesByReceivingIdSql` takes ~120ms.
- **Share the normalizer.** `normalize-row.ts` and `receiving-photo-row.ts` were
  extracted so seed and route cannot drift. Extract, never copy.
- **Fold queries into one transaction where you can.** Ranking was its own
  `tenantQuery` — 4 round trips for a 0.3ms read, in series ahead of everything.
- **Instrument the server render early.** One `[SSR-DBG]` line proving
  `seeded: true, railRows: 44` eliminated the whole upstream chain in one build,
  after several wasted guess-cycles.
- **Migrate guards, never weaken them.** Two broke on renames; both were
  re-pointed (e.g. asserting the SQL shape `FROM receiving_unbox ru` instead of a
  helper name). Never raise a baseline to land a port.

---

## Dead ends — do not retry (all measured, all reverted)

1. Truncating the largest text node — LCP got **worse** (15,024 → 16,376ms).
2. A data-rich stand-in instead of SSR-ing the real workspace — blocked by guard, and #1 is the real fix.
3. `UnboxBrowseShell` skipping the skeleton — blank middle, twice.
4. CLS predicate on `window.innerWidth` + rail min — CLS unchanged at 0.227.
5. Single-tile data-URI inline — LCP 2,411 → 2,624ms (promotes the next tile).
6. All-tiles inline — TTFB 1.6 → 2.05s, payload 76 → 118KB.

---

## Testing (`/test`) — landed 2026-08-12

Ported out of order (ahead of Arrival) on request. Ready to Pack is the bare
`/test` landing, so that is the surface this measured.

| | before | after |
|---|---|---|
| LCP **element render delay** | 13,412ms | **797ms** |
| LCP (median of 3, local) | 2,799ms | 2,415ms |
| TBT | 31ms | 15ms |
| Speed Index | 3,229ms | 2,735ms |
| CLS | 0.03 | **0.0001** (score 1.00) |
| API calls gating the middle | 5 | **0** |
| TTFB (warm, local) | 0.78s | ~1.1s |

The whole 13.4s was one request: `/api/orders?listShape=queue&limit=200` took
**13.0s** under this surface's ~17 concurrent shell fetches (uncontended it is
0.4–1.7s). The grid painted a skeleton for the entire time.

**What was done.** Nothing was `ssr: false` and the rail already inherited the
`mirroredRows` fix, so this station needed exactly one thing: the shell seed.
`maybeSeedShell` now dispatches per station and warms six keys for `/test` —
the unshipped list + counts, order and unit pack-placement, the ROI rollup, and
the staffer's preferences — all issued together (`seedReadyToPackStation`).

**Four findings the next station will hit:**

1. **A page-level `HydrationBoundary` is too late for any key the RAIL mounts.**
   Seeded from `TechSurfacePage`, the grid rows appeared in SSR but the KPI band
   still rendered its skeleton, because `ShippingScanBand` (left rail, a sibling
   of `children`) had already created the `packPlacementQuery` entry — and
   `HydrationBoundary` hydrates immediately only for keys the cache does *not*
   hold; an existing key goes to its deferred effect, which never runs during
   SSR. Nesting two boundaries does not help. **Seed above the shell.**
2. **Seeding the grid can *expose* a CLS the empty grid was hiding.** With rows
   on screen, the KPI band's skeleton→tiles swap (data-sized: four lifecycle
   tiles plus one per bench, plus a units strip that renders `null` while
   pending) moved every row. A taller skeleton cannot fix it — the loaded height
   depends on the org's bench count — so the band's own queries are seeded too.
   Expect the same shape on any station whose Band 2 is data-sized.
3. **The root layout has no `searchParams`,** and a station whose tabs live in
   the URL must not pay for a seed the mounted tab will not read. The proxy now
   forwards `x-search` beside `x-pathname`; the gate is
   `shouldSeedReadyToPackQueue` (unit-tested). `?view=testing` (Quality Control)
   measures 0.76s TTFB — unchanged from baseline.

4. **A saved column width is a layout shift waiting for a seeded grid — and it
   is the fourth key you have to warm.** Seeding the rows took CLS from 0.03 to
   **0.118**, all of it one shift. `staff_preferences.tableColumns.orders.widths.title`
   is `654px` for the dogfood operator, while the SoT track is a hard
   `minmax(12rem, 12rem)` (192px) with the trailing `_fill` absorbing the slack.
   The server has no preferences, so it renders 192px + a 486px filler; the
   client loads `/api/staff-preferences`, applies the saved width, and **every
   cell in every row moves 462px sideways** while the filler collapses to 24px.
   Seeding `['staff-preferences']` (as `{ prefs }` unwrapped, matching
   `useStaffPreferences`) puts `--cf-col-title: 654px` in the SSR HTML and the
   shift disappears: **0.118 → 0.0001**, CLS score **1.00**.

   Any station whose grid the operator has ever resized inherits this, and it is
   invisible until the rows paint early. It is also invisible on a fast local
   load — reproduce under **4× CPU / Slow 4G** and read `LayoutShift.sources`
   (`previousRect` → `currentRect`) rather than guessing from the element
   selector; that is what turned "the grid engine is measuring something" into
   the actual answer in one pass.

**Not met — rail rows in SSR HTML.** `ShippingStaffScanHistoryRail` builds its
`SidebarRecentRailBase` key from client-derived state (a `recordsVersion` string
hashed off `useTechLogs` data) and its `fetchFn` just returns the already-filtered
client array. There is no stable key to seed, so the rail server-renders its
4-row skeleton no matter what the cache holds — the `mirroredRows` fix cannot
help a key that does not exist yet on the server. Seeding `useTechLogs` itself
would only move its 69KB onto TTFB while the rail still could not render (dead
end #6: a 42KB payload growth cost 0.45s of TTFB), so it was left alone. Fixing
this properly means giving `SidebarRecentRailBase` a stable key for derived
rails — shared by every station rail, so ask first.

**Not fixed here — a lane-wide paint regression.** LCP on `/test` reads
**~12.3s** in the current lane, and it is not the seed: the unseeded variants
measure the same (`?view=testing` 12,149ms, `?ship=history` 12,736ms), `/unbox`
in the same lane reads 8,630ms against the 2,448ms its own handoff documents,
and FCP moved 404ms → 1,653ms with TBT 15ms → 385ms. No request lands after
6.9s, so it is main-thread, not network — long tasks at 10.2s and 13.0s in
`de6209af…js` / `07e943b5…js`. That belongs to whatever else is in flight in
this lane; judge the port on the LCP **breakdown** (TTFB 799ms + element render
delay 823ms) rather than the metric total until it is chased down.

---

## Acceptance per station

- [ ] Route pinned `formFactor: 'desktop'`; confirmed via `configSettings.formFactor`
- [ ] Declared LCP surface is SSR (no `ssr: false`); registered in `TIER1_PAINT_ORDER`
- [ ] Shell seed covers the route; seed started before awaiting auth
- [ ] Cold land opens the MRU record **or** an honest empty bench — never a table, never blank
- [ ] Rail rows present in SSR HTML (`curl` the route and grep a row marker)
- [ ] No `opacity:0` on the LCP element in SSR HTML
- [ ] Tiles use `thumbUrl`; first tile eager + high priority
- [ ] Cockpit auto-open gated so it cannot park the rail on cold load
- [ ] FCP / TBT / CLS all score 1.00; judge LCP on production
- [ ] `npm run verify` green; no baseline raised

---

## Commands

Local (expect a depressed perf total — TTFB ~1.4s is the remote DB):

```bash
NEXT_DIST_DIR=.next-perf pnpm build && pnpm lighthouse:audit -- --routes /triage
```

Production / co-located (the number that counts). Pinless mint works on
`app.cycleforge.ai`; no credential needed:

```bash
LH_BASE_URL=https://app.cycleforge.ai node scripts/lighthouse-mint-session.mjs
```

```bash
LH_BASE_URL=https://app.cycleforge.ai LH_COOKIE='cf_sid=…' pnpm lighthouse:audit -- --routes /triage
```

Proof the deployed build actually contains the work (this is how the stale
deployment was caught — production scored 88 on the OLD build):

```bash
curl -s -H "Cookie: cf_sid=…" https://app.cycleforge.ai/triage | grep -c 'data-capture-row'
```

**Never** start/stop/kill the dev server on `:3050` — perf builds use an isolated
`NEXT_DIST_DIR=.next-perf` on a free port.
