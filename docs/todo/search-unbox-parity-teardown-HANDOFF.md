# `/search` → Unbox parity teardown — handoff

> **Directive (operator, 2026-08-21):** tear down the `/search` page UI and rebuild it to mirror the
> Unbox scan station exactly. Authorized to delete any conflicting house rule, guard or SoT doc.
>
> **Status:** §2 below is VERIFIED against the live dogfood database and the files on disk.
> §3+ come from a 10-agent adversarial audit (run `wf_3351d510-a8a`) and are appended on completion.

## 1. Why the reported defects are not what they look like

The three rail defects were reported as rendering bugs. Two of them are **stale persisted data plus a
read path that never re-resolves it** — which matters, because "fix the component" would not have
fixed either one.

## 2. Rail defects — root cause, proven

### 2a. The double timestamp ("2w" AND "16d") — two independent age renders

There are literally two age columns on every `/search` rail row, fed by two different formatters:

| # | Site | Formatter | Renders |
|---|---|---|---|
| 1 | `src/components/sidebar/rail-shell/RailRow.tsx:203-204` — `activityAt` / `showAgeColumn`, driven by the `getActivityAt` prop | `formatLaneAgeCompact` (`src/utils/date.ts:481`) | `16d` |
| 2 | `src/components/sidebar/search/SearchSidebarPanel.tsx:195-199` — `RailRowBody` `vm.metaTrailing` | `formatRelativeTime` (`src/lib/search/search-recents.ts:287`) | `2w` |

`SearchSidebarPanel` passes **both** `getActivityAt={(row) => row.timestamp}` and a `metaTrailing`
age. `formatLaneAgeCompact` has no week/month/year band and tops out in days; `formatRelativeTime`
does have one. Same instant, two grammars, side by side.

**Live proof:** the newest `search_recents` rows for the dogfood org are 16–17 days old — exactly the
`16d` / `2w` pair reported.

**Fix:** delete the `metaTrailing` block (`SearchSidebarPanel.tsx:195-199`). Keep the shell's age
column — that is the one Unbox uses, and it is what produces the `1h` / `4h` / `26h` face in the
reference screenshot.

### 2b. The word "Search" under every row — a retired code path's data, still on disk

`searchRecentMeta` (`src/components/sidebar/search/search-recent-rail-vm.ts:48-53`) falls back to
`entry.scopeLabel`. That value is **read straight from the database and never re-resolved**:

```
src/lib/search/staff-recents.ts:40    scopeLabel: row.scope_label ?? undefined,
```

Live table state — every row, one bucket:

| scope | scope_label | rows |
|---|---|---|
| `dashboard` | `Search` | **89** |

Those rows were written by `GlobalFindCombobox`'s old `scope: isStage ? 'dashboard' : 'global'`
line — the `presentation="stage"` path, **deleted earlier today**. New rows now write
`scope: 'global'`, which `resolveSearchScopeLabel` maps to `Everywhere`
(`src/lib/search/search-scope-labels.ts:13`). There is no `search` key in `SURFACE_LABELS`, so had
the scope been `'search'` it would have title-cased to `Search` as well.

**Fix (two halves, do both):**
1. Stop rendering the scope as row meta — drop the `entry.scopeLabel` fallback at
   `search-recent-rail-vm.ts:52`. The Unbox rail's second line is quantity + tags, never a scope.
2. Re-resolve on read instead of trusting the column: `staff-recents.ts:40` →
   `resolveSearchScopeLabel(row.scope)`. Otherwise 89 stale rows keep their retired label anywhere
   else `scopeLabel` is consumed.

### 2c. The "Team note" input pinned bottom-left

| What | Where |
|---|---|
| Mount | `src/components/sidebar/search/SearchSidebarPanel.tsx:200` — `<SearchRailQuickNote sel={sel} />` |
| Component | `src/components/sidebar/search/SearchRailQuickNote.tsx` (86 lines) |
| Clearance that exists ONLY for it | `SearchSidebarPanel.tsx:158-162` — `bodyClassName="pb-16"` on `SidebarRailScrollport` |

Delete all three. **Note the reversal:** earlier today the operator chose "keep it, de-fork it", and
it was rewritten onto `ThreadNoteComposer variant="float"`. That de-fork makes this deletion clean —
nothing else depends on it. One consequence survives: `?sel=receiving:` loses its only note entry
(`CartonInspector` mounts no `ThreadPanel`). `?sel=unit:` no longer does — `SearchUnitCentre` now
mounts a real `SERIAL_UNIT` thread.

Also delete `bodyClassName="pb-16"` or the rail ends with 4rem of dead space.

## 3. Completion record — 2026-08-21

All three §2 defects are landed. `npm run verify` green (lint · typecheck · 6291 unit).

| Defect | Change | File |
|---|---|---|
| 2a double timestamp | deleted the `metaTrailing` block; the shell's `getActivityAt` age column is now the only age render | `src/components/sidebar/search/SearchSidebarPanel.tsx` |
| 2b "Search" under every row (render half) | `searchRecentMeta` returns `null` instead of falling back to `entry.scopeLabel` | `src/components/sidebar/search/search-recent-rail-vm.ts` |
| 2b stale label (data half) | `toEntry` maps `scope` through `resolveSearchScopeLabel` on every read — the column is no longer trusted | `src/lib/search/staff-recents.ts` |
| 2c floating team note | component deleted; mount, import and the `pb-16` clearance removed | `SearchRailQuickNote.tsx` (deleted) · `SearchSidebarPanel.tsx` |

**Guards written** (the teardown is only as durable as what fails when it regresses):

- `search-recent-rail-vm.test.ts` — *"the secondary line is never the scope label"*: a row carrying
  `scopeLabel: 'Search'` renders `null`, and a resolved row renders the typed query.
- `tests/e2e/search-station-layout.spec.ts` — the rail-stack test now asserts
  `boxes.length === 2` (renamed *"the rail stacks find → recents"*); a third child means a
  page-local dock crept back. Plus a new *"a recent row renders exactly one age"* spec that counts
  age-shaped leaf nodes in a row — the direct 2a regression.

**Docs re-cut:** `docs/rules/display/search-station.md` — the Zone-1 diagram and table lost the
floating note, the "bottom entry FLOATS" section is replaced by *"the rail is TWO bands"*, and two
new rulings are recorded: **one age render per row** and **a persisted label is re-resolved on read,
never trusted**.

**Deliberately not done:** `search_recents.scope_label` is still written and still SELECTed — the
column is now dead weight on the read path but dropping it is a migration, and the read-side
re-resolve already makes its contents inert. Backfilling or dropping it is a separate, ask-first
change.

## 4. Adversarial parity audit — 2026-08-21 (run `wf_d2fbc32f-a03`)

The §2 defects were the *reported* ones. This section is what §3 was reserved for:
the remaining gap against the directive's actual bar — "mirror the Unbox scan station
**exactly**".

**Method.** 14 agents. Two mapped the reference (the Unbox contract; `/search` as it
sits on disk after the teardown). Six finders swept one dimension each — rail, centre,
right edge, chrome/tokens/geometry, motion/paint, read-paths/persisted-value-trust.
Six adversarial verifiers then tried to **refute** every finding, instructed to default
to refuted when uncertain and to treat a *documented intentional* difference (preview
stance, no `editableShippingFields`, the thin unit identity bar, `sku:` deliberately not
a station) as **not** a gap.

**30 proposed → 20 confirmed, 10 refuted.** The verifiers also corrected 8 of the
surviving fixes; where they did, the corrected version is what landed.

### 4a. Landed

| # | Sev | Defect | Fix |
|---|---|---|---|
| 1 | **high** | **The "preview" centre committed writes.** `ProductDetailsSection`'s condition editor was gated on `isOrderShipped` **alone** — never on any capability — so any *unshipped* order could be re-graded straight from the find surface. `/search` expressed read-only-ness by *omitting* `editableShippingFields`, and nothing ever consulted it. | New **required, undefaulted** `canEditProduct` on `ProductDetailsSection` + `ShippedDetailsPanelContent`. The compiler named all 6 call sites; `/search` answers `false`, the five work surfaces `true` (behaviour unchanged). Also gates the Amazon-reimport POST. |
| 2 | **high** | **A shared query key with three different fetchers.** `useSearchOrderPhotos` parsed `['order-timeline', id]` down to `{unitPhotos}`. On `/search` it mounts *first* (the index row needs the photo count), so `OrderTimelineSection` and `OrderReturnsCard` read a cache entry missing their fields — **blank Activity trail, Returns card that never appears**, no error. Its own docblock had written the rule down while the code broke it. | New `src/lib/queries/order-timeline-query.ts` — one key, one full-payload fetcher. All three consumers spread it; the photo spine narrows with `select` (per-observer, cannot reshape the entry). |
| 3 | **high** | **The rail's feed had no writer.** `POST /api/search/recents` had **zero callers**; `pushStaffRecent` was reachable only from that orphaned route. The one live writer is `useSearchRecents` → *localStorage*. So the DB-backed rail could only ever paint rows a deleted code path left behind — the same 89 rows §2b tripped over — and an operator's own searches never entered their own rail. | New `staff-recents-client.ts` (fire-and-forget). The header's `onPushRecent` now writes **both** stores; the rail's own `commitQuery` records too. Both invalidate the rail key so an open rail wakes. |
| 4 | **high** | **The unit `photos` leaf counted a different query than it rendered.** Subtitle from `/api/serial-units/{id}?include=full`; body from `unitTimelinePhotosQuery` — a different route. The index could advertise "3 photos" and open a leaf that rendered *nothing* (`SerialUnitTimelineSection` returns null on empty, by a docblock written for a desk pane). | One query for both: the pane observes the leaf's own `unitTimelinePhotosQuery`. Body gates on the settled count and lands on the house `EmptyState`. |
| 5 | med | `units` Root Index row hardcoded `group: 'context'` where `defaultDisplayIndexGroup('units')` is `'assets'` — Units sat in a different band on `/search` than on every station taking the default. | `group: 'assets'`, plus a guard: **every** row's group must equal the shared default, so the next override has to state its reason. |
| 6 | med | The rail registered **no nav-keys region** — the leader armed Right on `/search` and Left was dead, so the rail could not be walked from the keyboard. | `navRegionId="left"`, the same opt-in `RecentActivityRailBase` makes. |
| 7 | med | `SearchUnitCentre` hand-rolled the unit status face as a dot + span pair, dropping the chip geometry (ring, inset, micro-caps, live-value morph) every other status face carries. | Composes `GridStatusCellValue`. `UnitLifecycleFace` was already that prop shape. |
| 8 | low | Dead `showSerialNumber` under `activeSection="product"`; and the by-tracking fetch ran on product-only mounts that can never render it. | Prop dropped; fetch guarded on `showShipping` **with `showShipping` in the deps** — without that, an operator switching product→shipping on a live mount would never fetch. |
| 9 | low | The order pane's centre docblock still named "Status & timeline", a block that left the centre, and implied `editableShippingFields`' absence made the centre read-only. | Rewritten to name the blocks it actually renders and to point at `canEditProduct` as what carries read-only-ness. |
| — | — | **Found independently, not by the audit:** `ThreadNoteComposer`'s `float` variant became consumerless the moment §2c deleted `SearchRailQuickNote` — a reachable-but-unreached fork. | Branch deleted; `onIsOnRecordChange` required again. `pattern-evolution.md` §6: a retirement is not done until the old path is deleted. |

`npm run verify` green after every step — lint · typecheck · **6332 unit tests**.

### 4b. Confirmed but NOT landed — each needs a decision that is yours

These survived adversarial verification. I did not land them because each either changes a
shared primitive with other call sites, or needs a browser I do not have.

| Sev | Finding | Why it is parked |
|---|---|---|
| high | `centre-flex-fill-inert` — the centre's flex-fill chain is inert, so the thread never gets the column and its composer rides the scrollport. | The fix is `bodyAlign="end"`, but `SupportOrdersFocusHost` mounts the same host at `stance="work"` with a plain block centre, which that would bottom-pin. Needs a stance-conditional decision. |
| high | `blank-pane-covers-painted-record` — the cover-replace swap *uncovers*: the entering opaque pane is EMPTY for the whole resolve. | Fix is to resolve **before** the `AnimatePresence` key advances — a restructure of `SearchDetailWorkspace`, and unverifiable without a running server. |
| high | `station-pane-runs-workbench-swap-role` — `EntityStationPane` runs a second presence inside the hard cut, under a role whose declared regions exclude Station. | The verifier explicitly says **do not** delete it: that `motion.div` *is* `SupportOrdersFocusHost`'s exit animator. Removing it breaks Support. |
| high | `tophit-href-as-selection-sot` — `searchRecentSelection` trusts a persisted **href** as the selection SoT, so no non-order recent can open its station. | Right diagnosis (carry durable `entityType` + id), but it needs both `GlobalFindCombobox` writers changed and a backfill story for existing rows. |
| high | `sku-branch-button-hue-override` + med `sku-branch-soft-radius-pills` — `?sel=sku:` overrides `<Button>` with raw hue classes and carries `rounded-xl`/`rounded-lg`/`shadow-sm` on ops chrome, across 4 files. | `search-station.md` already rules `sku:` **deliberately not a station** pending a required-`stance` threading through `useSkuDetailView` + its four cards. Landing DS fixes ahead of that port is the wrong order. |
| high | `carton-identity-overlay-geometry` — `?sel=receiving:` pins identity with an absolute-overlay host plus side gutters and a guessed `pt-7`. | `CartonInspectionPage` is shared with `/carton/[id]`; the verifier refuted the `radius` half of the claim. Geometry, so it needs the browser. |
| med | `warranty-leaf-second-log-claim-door` + `warranty-leaf-uses-rail-card-density` | Both need `OrderWarrantySummary` **grown** first — deleting the page-local Log-claim button would remove the *only* log door in the states where `CoverageVerdict` renders "View claim" instead. Shared primitive → ask first. |
| med | `find-bar-is-the-floor-band-face` — the find bar wears the column-**footer** band face at the head of the rail, and its `flush` prop is inert on that variant. | The fix switches to `variant="chrome"`, which is exactly the change that once took the full 860px rail height and squashed the recents to zero. The layout spec guards it (`find.h < 80`) — but E2E needs a dev server, and there is none. |

### 4c. Blocked on you

- **No dev server on `:3050`**, so nothing here is visually verified and no Playwright
  spec was run — including the two specs §3 added. House rule is attach-never-start, so
  this is a report, not a repair.
- **`.next/dev/types/routes.d.ts` is corrupt** (content interleaved mid-file). It typechecks
  clean via `npm run verify`, and it is a generated file I did not touch — another session
  is active in this tree (~20 unrelated files are dirty: kiosk, orders-queue, counter,
  `useCatalog`). Not deleting `.next` to "fix" a server I did not start.
- **Stage only these paths** — the rest of the dirty tree is not mine.
