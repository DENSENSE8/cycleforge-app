# Media Library (`/ops/photos`) — the display SoT

The exact viewing + display format for the photo-**evidence** archive. Authored
2026-08-09 with S1.5 (the facet rail deleted, its scopes ported to the top
chrome), because that change reverses a live ruling and inverts a house band
order — both need a written home or the next sweep undoes them.

**Region contract:** Workbench (pointer-driven pick + edit, durable URL
selection). **Branch:** `ops-queue`-**shaped** — Band-1 tabs, a right inspector,
selection cardinality as the mode switch — but the primary surface is a **media
stream**, not a `LedgerGrid`.

> **The stream is NOT a LedgerGrid, and porting it is deferred, not pending.**
> Table-engine fan-out dogfoods Unbox History first
> ([`../source-of-truth.md`](../source-of-truth.md) → Table engine fan-out). The
> hand-rolled `PhotoListView` stays. Do not read "ops-queue-shaped" as licence to
> migrate it.

Inherits: [`workbench.md`](workbench.md) · [`workbench-ops-queue.md`](workbench-ops-queue.md)
· [`right-rail-inspector.md`](right-rail-inspector.md). This file adds only what
is specific to this surface.

---

## Rail-less (Pattern E) — and the mechanism matters

`/ops/photos` reserves **no** left context column. The left-edge law says the
column is EARNED ([`../source-of-truth.md`](../source-of-truth.md) → Left-edge
occupant); this surface holds nothing a left column could say that the chrome
cannot:

| The rail held | Where it lives now |
|---|---|
| Lifecycle source scopes | **Band-1 tabs** (`PhotoLibraryScopeBand`) |
| The org's custom media types | **Band-1 leading cube** — same component, same writer |
| Outbound's document sub-filter | **Band-2 in-field refine** (it narrows rows) |
| Capture-day tree + counts | **Band-2 in-field refine**, "Capture days" |

**The mechanism is `CONTEXT_PANEL_ROUTE_KEYS`** (`sidebar-navigation.ts`) — drop
the key and `useHasSidebarContext()` collapses the column, exactly as `/search`
and `/reports` already do.

**Never widen `isRaillessOrderFeedSurface` to cover photos.** That predicate is
named for the To-ship **order feed**, its docblock is entirely outbound lifecycle
/ KPI / Views, and `outbound-rail-dedup.guard.test.ts` asserts order-feed
semantics on it. Widening it would make the name a lie and put a media concern
inside an outbound guard.

**The payoff is width, and it does not arrive for free.** Deleting the rail
reclaims the column, but `PhotoLibraryPage`'s `RightPaneOverlayHost` is a flex
ITEM: without `min-w-0 flex-1` it sizes to `max-content` and measured **721px
inside a 1440 viewport** — below `MIN_WORK_SURFACE_PX` (784), and the number the
S1 report had blamed on the rail. Pinned by `photos-railless-frame.spec.ts`.

---

## The three bands, and the divergence they ratify

```
┌─ Band 1 ── WorkbenchChromeHeader density="band" ─────────────────────────────┐
│ [▤] │ All · Unboxing · Pickups · Packing · Repair · Claims · Outbound        │
│  cube abuts the rail (gap-0)                            trailing: none¹      │
├─ Band 2 ── WorkbenchTriageBand ──────────────────────────────────────────────┤
│ 🔍 PO, order, tracking, serial…            ▽ refine    ↕ Newest   ▥ inspector│
├─ Band 3 ── PhotoLibraryHeader (the path strip) ──────────────────────────────┤
│ ▤ All dates › Aug › Aug 9   PHOTOS 48 · …        [density][⟳][✎][▦ ▤]        │
└──────────────────────────────────────────────────────────────────────────────┘
  ── sheet plane: day-banded photo stream ──                    → right: inspector
```

¹ Band-1 trailing is **empty** — this surface has no import / add /
return-to-scan CTA. Honest absence; do not invent one.

All three stack in ONE `WORKBENCH_SHEET_CHROME` host with `flex flex-col gap-0`
(Sheets flush mount recipe). **One hairline per seam, upper band owns it:** Band 1
`border-b` (from its own `border` minus `-l-0 -t-0`), Band 2 an explicit
`border-b` (`WorkbenchTriageBand` ships `border-r` only, because on its home
surface the sheet below carries `border-t` — Band 3 here is a path strip, not a
sheet), Band 3 `border-b` against the plane. Contiguity is measured, not assumed
(`photos-railless-frame.spec.ts`).

### Why Band 2 = search and Band 3 = breadcrumb (the inversion)

House grammar is Band 2 = KPI, Band 3 = the lean find row
([`workbench-ops-queue.md`](workbench-ops-queue.md)). **This surface inverts the
lower two.** Three facts, not taste:

1. **There is no KPI band here.** Nothing to collapse, so Band 2 is *free*
   rather than displaced. (There is correspondingly no `kpiToggle`.)
2. **Search is the entry path, not a refinement** — already an approved house-law
   exception (2026-07-28, [`../ui-design-system.md`](../ui-design-system.md) →
   Scoped search chrome). `/ops/photos` is a photo-EVIDENCE archive whose #1 job
   is exact-identifier retrieval (PO / serial / claim ticket) to settle a damage
   or carrier dispute. A control that IS the job earns its own band; it does not
   share one with layout toggles.
3. **The breadcrumb row is a context readout, not a find row.** A path answers
   *where am I in the archive* — the altitude a KPI strip occupies on a queue —
   so it sits where a KPI band would, under the primary control and above the
   plane.

Band 3 therefore keeps the breadcrumb + its display controls (density · refresh ·
select · icons/list). It does **not** grow a second find field.

### Band-1 tabs carry a paired glyph

Scoped divergence from *"lifecycle tabs are text-only"*, recorded rather than
silent. That clause is about lifecycle **stages of one collection** (Queue ·
Viewed · History), where a glyph is decoration. These are **source scopes**, each
naming a physical station the operator already knows by its glyph, and
`scope-icons.ts` was authored for exactly this pairing so the Unboxing facet and
the Unbox bench read as the same thing. Icons stay paired with text
([`../ui-design-system.md`](../ui-design-system.md) → Icons: structural and
paired), and the rail is `scrollable` so seven of them cannot clip the row.

---

## One writer per param

| Param | Owner | Notes |
|---|---|---|
| `sourceScope` · `imageType` | **`PhotoLibraryScopeBand`** (Band 1) — tabs **and** cube, one file | Mutually exclusive: a custom type clears the lifecycle tab and vice versa |
| `poFinder` / `q` / `ticketId` (the finder) | the Band-2 find field | Claims scope routes a typed ticket # to the ticket leaf |
| `dateFrom` / `dateTo` | the Band-3 breadcrumb, **and** the Band-2 Capture-days facet | Same patch shape, one meaning — a day is a leaf, so both clear `poRef`/`ticketId`/`receivingId` |
| `documentType` / `outboundMedia` | Band-2 refine, outbound only | The scope that turns it on is the tab above it |
| `view` / `page` | Band-3 display controls | Display params, never filters |
| `photoId` | **selection** | Display param; written from selection, cleared with it (the eviction rule — S1) |

**"Exactly one writer" is the law; "the writer must be a rail" never was.** The
2026-07-29 ruling put the scope control in the rail and forbade one in the
chrome, because a chrome media-type dropdown had shipped whose built-in rows were
byte-for-byte the rail's source scopes — two controls, one param, able to
disagree. S1.5 keeps the invariant and swaps the survivor. **Deleting the rail
BEFORE porting the tabs** is what made the two-writer state unreachable instead
of temporary. Guard: `media-library-chrome.guard.test.ts`.

The tabs and the cube live in **one component** for the same reason: split across
two files they would be two writers of one param sitting one import apart, which
is the 2026-07-29 shape again. One `selectSection` serves both groups.

---

## Planes — which surface owns which gesture

| Gesture | Opens | Never |
|---|---|---|
| **Tile click** | the fullscreen **viewer** (`PhotoViewerModal`) | the inspector — operator ruling 2026-08-09; a click on a photo means *show me the photo* |
| **Select 1** | the desk **inspector** (`detail:photo`, push, `modal={false}`) | — |
| **Select ≥2** (and select-0 entry state) | the **batch rail** (`PhotoBatchInspectorPanel`, `detail:photo-batch`, push) | both at once — cardinality is the mode switch, and there is no third state |
| **Select 0** | neither | — |

Operator copy is **Show / Hide inspector** — never "Open displays", which is the
Station scan push column ([`../source-of-truth.md`](../source-of-truth.md) →
Displays vs inspector). Desk park stays `⌘\` + bare `]`; `⌘]` is the station
chord and must not be bound here.

### The bulk verbs are RAIL ROWS, not a chrome toolbar (2026-08-09)

`PhotoLibraryToolbar` — a chrome band that swapped itself in **over Bands 1–3**
whenever a selection existed — is **deleted**. Three costs, and the third is the
one that made it wrong rather than merely dense:

1. **It hid the chrome it replaced.** Ticking two photos took away the lifecycle
   tabs, the search field and the breadcrumb: the operator lost their place in
   the archive to read a row of icons.
2. **Icon-only, at the top, with tooltips.** Six unlabelled glyphs is six things
   to parse before finding one verb; the same verbs as rows name themselves in
   words and cost no chrome height at all.
3. **The right edge already owns "what can I do to the picked record."** n = 1
   opens the inspector there, so putting n ≥ 2 somewhere else made cardinality
   change the *place* as well as the content.

The rail's rows compose the house armed-verb waist — **`useArmedCursorList` +
`armed-cursor-face` tokens**, the **hook**, never `StationArmedVerbList`: that
component hardwires `useNavRegion({ id: 'right' })` / `isKeyboardRegion('right')`,
which are Station keyboard-region concerns, and `⌘;` region arm on this surface
is **ask-first** (A3 → C-NAV). Occupant id is the stable `detail:photo-batch` —
a per-selection id would play exit → empty → enter on every tick.

**Delete is the flush trailing child of the bottom `InspectorActionFloor`, never
a verb row** (2026-08-10). A destructive verb does not sit in the list beside its
peers, and park stays on `DeskRailChromeRow` so a dismiss never sits beside a
delete ([`right-rail-inspector.md`](right-rail-inspector.md) → *Workbench
inspector action floor*). It is the floor's **only** peer — every other bulk verb
is a set operation that reads better as a named row, so Delete is there because
it is destructive, not because floors are where verbs go (same shape as
`BinDetailFlyout` · `SkuDetailView` · `RepairDetailsPanel`). Desk floor, **not**
`StationDisplaysActionFloor` — that is the Station half of the same display
method (C2). The floor stays **mounted and disabled** at zero selected rather
than unmounting, so the row above never shifts mid-tick.

### The surface runs NO motion

One predictable DS: nothing under `src/components/photos/` imports the motion
barrel, and nothing uses `layoutId`. `PhotoThumb` was the only consumer and is a
plain `div` now. Three reasons, recorded so nobody re-adds them:

- **`layoutId` for list → detail is banned** ([`motion-crossfade.md`](motion-crossfade.md)):
  opening the viewer is a *replace*, not a *move*, and shared-layout there is a
  morphing artifact rather than continuity.
- **It leaked geometry into three unrelated files.** The morph's projected box
  overshot the tile's grid cell, so `PhotoThumb` raised `z-index` for the
  duration, `PhotoCard` had to refuse `overflow-hidden`, and the sheet plane had
  to refuse `TABLE_SURFACE_SHEET_CLASS` — three files carrying a constraint for
  one animation.
- **A 500ms fade on a contact sheet is 48 fades.** At library density the stagger
  reads as the page failing to settle.

Two things deliberately stayed, and removing them is the fork: `Loader2
animate-spin` (the house async SoT is *spinner + text*; without it there is no
loading affordance at all) and `transition-colors` on hover (*hover is
`transition-colors` and nothing else* — the house answer, not a flourish).

**The armed rows carry no marker pulse.** Unbox's own list pulses `>` + track via
`ARMED_CURSOR_MARKER_PULSE_CLASS`; this rail composes the same tokens **without**
it (operator-confirmed 2026-08-10). It is a recorded divergence from the golden,
not an oversight: the pulse would be the last moving thing on a surface whose
whole pass was removing motion. Guard: `media-library-chrome.guard.test.ts`.

`PhotoViewerModal` (`shipped/photo-gallery/**`, ~18 consumers) is untouched — hard
ban. Its `heroLayoutId` is now a lone `layoutId` with no partner, which is inert.

---

## Always / Never

**Always**

- Create inline with a DS input (`MediaSavedViewsSection` is the shape) — media
  types, photo labels, saved views.
- Answer the three empty states separately on the Capture-days facet: a query
  that has **failed at least once** (`isError || failureCount > 0`) is an error;
  settled-and-empty is "No photos in view"; unsettled is a spinner.
  `refetchOnWindowFocus: 'always'` makes `failureCount` load-bearing, not
  belt-and-braces.
- Derive the day tree from the LOADED stream (`buildPhotoDateTree`) — it
  describes what is in view, never a full-archive index the infinite-scroll query
  has not fetched.

**Never**

- A left context column on this route, or `isRaillessOrderFeedSurface` widened to
  reach it.
- A second control that writes `sourceScope` / `imageType`.
- A find field on Band 3, or a KPI band invented to make Band 2 look
  house-standard.
- `window.prompt` (unstyleable, untestable, steals keyboard-wedge focus).
- Porting the stream to `LedgerGrid` (deferred — History dogfoods first).
- Touching `MediaLibraryPicker*`, `shipped/photo-gallery/**`, or the lightbox
  from this surface's chrome work.

---

## Modules

| Concern | Module |
|---|---|
| Band 1 (tabs + media-type cube; the scope writer) | `src/components/photos/PhotoLibraryScopeBand.tsx` |
| Band 2 (search + in-field refine + sort + inspector toggle) | `src/components/photos/PhotoLibraryWorkspaceHeader.tsx` |
| Band 3 (path strip) | `src/components/photos/PhotoLibraryHeader.tsx` |
| Chrome host + planes | `src/components/photos/PhotoLibraryPage.tsx` |
| Scope vocabulary + patches | `src/lib/photos/library-filter-state.ts` |
| Scope glyphs | `src/lib/photos/scope-icons.ts` |
| Capture-day tree | `src/lib/photos/date-tree.ts` |
| Desk inspector (n = 1) | `src/components/photos/photo-inspector/PhotoInspectorPanel.tsx` |
| Batch rail (n ≠ 1) + Delete floor | `src/components/photos/photo-inspector/PhotoBatchInspectorPanel.tsx` |
| Armed-row waist | `@/components/station/displays/useArmedCursorList` + `armed-cursor-face` |

**Guards:** `media-library-chrome.guard.test.ts` (rail-less · one writer · band
order · no native prompt · **no motion** · Delete on the floor · pulse off) ·
`inspector-action-floor.guard.test.ts` + `right-rail-inspector-header.guard.test.ts`
(the batch rail is a desk floor + `DeskRailChromeRow` consumer) ·
`tests/e2e/photos-railless-frame.spec.ts` (the frame + band geometry + the batch
rail's floor geometry and ↑↓ walk) · `photos-library-deep-link.spec.ts` (filter
params) · `photos-inspector-walk.spec.ts` (the record param).

**Plan:** [`../../../docs/todo/media-library-desk-inspector-A3-PLAN.md`](../../../docs/todo/media-library-desk-inspector-A3-PLAN.md).

---

Indexed by [`../contextual-display.md`](../contextual-display.md)
