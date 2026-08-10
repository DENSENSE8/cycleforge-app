# Band 3 lean row — Views placement + Photo Library port — HANDOFF

**Status:** open · **Lane:** main (dogfood) · **Opened:** 2026-08-08
**Predecessor (CLOSED):** [`band3-find-only-inspector-SOT-FINISH-HANDOFF.md`](./band3-find-only-inspector-SOT-FINISH-HANDOFF.md)

**Lane rules:** attach to `:3050`, never start/restart/kill the dev server. The user
manages commits. `npm run verify` before done; never raise a ratchet baseline.

> ⚠️ **A second session is live in this tree.** It added the `views` slot to
> `WorkbenchTriageBand` and mounted `WorkbenchViewsMenu` on six surfaces while the
> predecessor work was landing. Re-read every anchor below before editing — line
> numbers move under you. Check `git status` and file mtimes if a guard fails in a
> way this doc does not predict.

---

## The row, in one line

**Band 3 is four controls and their order is fixed:**

```text
[ 🔍 find ……………………………… ▽ refine ]     [ 🔖 Views ] [ ^ KPI ] [ ▥ inspector ]
   search bar (refine INSIDE it)            view        kpi        show inspector
```

Nothing else. No `right` refine cluster, no controls portal, no week pill, no
compare/zoom. Everything else lives **in the find field** (row-narrowing facets)
or **on the inspector's View cluster** (layout chrome).

Slot order in `WorkbenchTriageBand` must read: `search` → `views` → `kpiToggle` →
`trailing`.

---

## Task 1 — Move Views into the RIGHT cluster

**Today it is wrong.** `WorkbenchTriageBand` renders `views` inside the *left*
flex-1 group, flush-abutting the find field:

```tsx
<div className="flex min-w-0 flex-1 items-stretch gap-0">
  <div className="flex min-w-0 flex-1 items-stretch">{search}</div>
  {/* Views flush-abuts find — no L/R pad / gap (ops chrome density). */}
  {views ? <div className="flex shrink-0 items-stretch self-stretch">{views}</div> : null}
</div>
<div className="flex shrink-0 items-center gap-2 self-center">
  {right}
  {/* controls portal */}
  {kpiToggle}
  {trailing}
</div>
```

**Move `views` into the right cluster, immediately before `kpiToggle`** — so the
row reads search · Views · KPI · inspector. Views is a *control*, not part of the
find field; grouping it with KPI and the inspector makes the right cluster read as
one control cluster and leaves find owning the whole left.

- Anchor: `src/components/dashboard/workbench-shell.tsx` (the `WorkbenchTriageBand`
  render + the `views?: ReactNode` docblock, which currently says *"Renders
  immediately after find (trailing the search field), before refine / layout
  toggles"* — that sentence becomes false).
- Keep it `shrink-0`; drop the flush-abut wrapper and let it sit in the existing
  `gap-2` cluster with its peers.
- Six call sites mount it already (Pack · Testing · Shipping · Unbox · Incoming ·
  History, plus `OutboundViewsMenu` → To-ship). **No call site changes** — this is
  a pure slot-position move.

**Guard it**, or the next reorder is silent: assert in
`band3-find-only.guard.test.ts` that in `workbench-shell.tsx` the `{views}`
expression appears **after** the `justify-between` split and **before**
`{kpiToggle}`.

---

## Task 2 — Port Photo Library (`/ops/photos`) onto the lean row

> 🔴 **CHECK FIRST — this may already be in flight.** At the time of writing, a
> concurrent session had ~15 modified files under `src/components/photos/`, one
> deleted (`OutboundDocumentTypeFilters.tsx`), and was mid-edit on `PhotoThumb`
> and `PhotoBatchInspectorPanel` (both were failing typecheck / knip that minute).
> Someone is rebuilding this surface right now. **Talk to them or read
> `git status src/components/photos/` before you touch it** — the spec below is
> what the row must end up as, not a claim about where the code currently is.

Photo Library is the one desk-shaped surface that never adopted
`WorkbenchTriageBand`. It hand-rolls three bands:

| Band | Today | Component |
|---|---|---|
| 1 | lifecycle tabs + media-type cube | `PhotoLibraryScopeBand` |
| 2 | **the search band** (search owns a whole band) | `PhotoLibraryWorkspaceHeader` |
| 3 | breadcrumb path strip + display controls | `PhotoLibraryHeader` |

Anchor: `src/components/photos/PhotoLibraryPage.tsx` (~line 655, the band stack).

### What the port is

Band 2 becomes the **lean row**: `WorkbenchTriageBand` with the same four controls.

- **search** — the existing always-open `SearchField` moves into the `search`
  slot at `min-w-0 flex-1`. Its row-narrowing facets (`documentType` /
  `outboundMedia`, Capture-days) move into `trailingSuffix` as **one**
  `WorkbenchFilterPopover density="field"` Refine funnel — not one glyph per
  facet. Copy the Unbox pattern: labelled facet tabs, one option body at a time
  (`UnboxWorkspaceHeader` → `triageRefineFacets` / `triageRefineBody`).
- **views** — `WorkbenchViewsMenu` over the existing
  `useMediaLibrarySavedViews`. **Do not** route it through `useSavedViews`; Media
  Library keeps its own hook by ruling (three client hooks over ONE `saved_views`
  store — `source-of-truth.md` → Tabs vs. saved views).
- **kpiToggle** — **omit.** There is no KPI band on this surface. Honest absence.
- **trailing** — `WorkbenchInspectorToggle`. This surface **does** open a desk
  peek (`detail:photo`, select-1), so it earns the toggle. Wire `open` from
  `useRightRailOccupantOpen('detail:photo')`.

Band 3 (the breadcrumb path strip) **stays** — it is a context readout, not a
find row.

### This reverses a documented ruling — say so

`display/media-library.md` and `source-of-truth.md` both record Band 2 = search /
Band 3 = path strip as a **deliberate inversion** of the house order, on the
argument that *"a control that IS the job does not share a row with layout
toggles."*

The port does not discard that argument — it satisfies it. Search still owns the
dominant slot of its own band; what changes is that the band is now the shared
`WorkbenchTriageBand` with its three peer controls instead of a bespoke one. Update
both passages to say the surface adopted the house row and why, rather than
deleting the inversion note (a reader who finds the old sentence and no successor
will re-fork the band).

### Then it joins the guard

`band3-find-only.guard.test.ts` walks `<WorkbenchTriageBand` mounts, so Photo
Library enters the cohort automatically the moment it composes the band — and its
two allowlists demand a classification. Add
`src/components/photos/PhotoLibraryWorkspaceHeader.tsx` to
**`INSPECTOR_TOGGLE_SURFACES`** (it has a real peek). Existing guards to keep
green: `media-library-chrome.guard.test.ts` (the ONE-writer rule for
`sourceScope`/`imageType` is unaffected — do not touch Band 1) and
`tests/e2e/photos-railless-frame.spec.ts` (band geometry — it measures the three
bands and **will** need its Band-2 assertions retargeted).

---

## Task 3 — Finish the ▦ deletion fallout (4 dark surfaces)

The card-corner hover-reveal float was deleted 2026-08-08 (▦ is portal-or-nothing).
Four surfaces had no other host and now paint no column-display control at all.
They are recorded, with reasons, in the shrink-only **`NO_COLUMN_DISPLAY_HOST`**
ledger in `src/components/dashboard/workbench-trailing-cluster.guard.test.ts`.

**The ledger is a debt list, not an exemption — each row is a surface owing a host.**

| Surface | Fix | Cost |
|---|---|---|
| **Scan-out Staged** (`ScanOutWorkspace`) | plumbing already exists — `StagedQueueTable` threads `columnTriggerPortalTarget`, the workspace passes none. Give it a controls slot and pass the element. | smallest — do this first |
| **Tracking exceptions** (`/tracking-exceptions`) | bespoke `FilterBar`, not a `WorkbenchTriageBand`. Add a controls slot to that row and thread it. | small |
| **Warranty claims** (`/support?mode=warranty`) | no Band-3 at all. Give `WarrantyWorkspace` a `WorkbenchTriageBand` (already on the ops-queue "documented follow-ups" list) and thread `controlsSlotRef` → `WarrantyClaimsTable` → `WarrantyGridView`. | medium |
| **Unfound queue** (`/admin` → PO mailbox) | same shape as Warranty, on `PoMailboxAdminSection`. | medium |

**Removing a row from the ledger is the definition of done for that surface.** The
list is shrink-only: nothing may add to it without a stated reason.

Interim door if a Band-3 is genuinely out of scope for one: wire `columnMenu` on
that grid view (right-click → *Column details…*). `ReceivingGridView` is the only
precedent in `src/`. Undiscoverable, but not a total loss — and **leave the ledger
row in place** if you do, because a right-click is not a control.

---

## Task 4 — Port the nav-keys middle region past Unbox

`⌘;` → `m` → `f` (focus find) / `r` (open Refine) is live on Unbox Band 3 only.

- Declared map: `src/lib/receiving/unbox-band3-nav-keys.ts`
- Wiring: `UnboxWorkspaceHeader` (`useNavRegion`), gated by
  `navRegionId={lineWorkspaceOpen ? null : 'middle'}` from `UnboxWorkspaceView`
- Focus handle + keycap: `TechRailSearchBar` `inputRef` / `navKeyHint`
- Registered in `nav-key-uniqueness.guard.test.ts`

**To port:** give `WorkbenchTriageBand` an optional `navRegionId` so any band opts
in the same way `SidebarRailShell` does for `left`, rather than each header
re-wiring `useNavRegion`.

**The trap that will bite you:** `registerNavRegion` keys by region id
(`regions.set(handle.id, handle)`), so **two live `middle` registrations silently
fight over the same letters**. Every host that shares a region must pass
`id: null` while the other owns it. On a hybrid scan station the browse stays
MOUNTED (`visibility: hidden`) behind the bench, so "it isn't visible" is not the
same as "it isn't registered".

**Do not mint a new chord.** `⌘F` and bare `/` were both rejected on 2026-08-08:
`/` because a printed Digital Link (`https://{slug}…/m/r/{id}`) makes a **wedge
type it mid-scan**, and a second global binder because every chord has exactly one
owner. `band3-find-only.guard.test.ts` bans a page-local `⌘F` / `/` in any band.

---

## Task 5 (optional, the real win) — facet tokens in the find field

Find and refine are still **two stores** (`?rh_q=` vs `?staff=` / `?ustage=` /
`?ulane=`), so `⌘; m f` focuses a text box rather than "filtering".

The strong version is facet tokens in the query itself — `staff:me lane:hot` —
where the Refine funnel becomes a *builder* that writes tokens into the field.
One string, one URL param, the two doors cannot drift.

**One ordering rule if you build it:** the token parser runs **after** `routeScan`,
never before. A scanned tracking number can contain `:`, and a Digital Link
certainly does — parse facets first and a scan becomes a facet.

---

## Definition of done

- [ ] Views renders in the right cluster; row reads search · Views · KPI · inspector on every band that has all four
- [ ] `workbench-shell.tsx` `views` docblock matches the new position; guard pins the order
- [ ] `/ops/photos` composes `WorkbenchTriageBand`; its facets are ONE in-field funnel; Views wired to `useMediaLibrarySavedViews`; inspector toggle wired to `detail:photo`; no `kpiToggle`
- [ ] Photo Library added to `INSPECTOR_TOGGLE_SURFACES`; `media-library-chrome.guard.test.ts` + `photos-railless-frame.spec.ts` green
- [ ] `media-library.md` + `source-of-truth.md` record the adoption (not a silent deletion of the inversion note)
- [ ] `NO_COLUMN_DISPLAY_HOST` has shrunk — every row either has a host or a restated reason
- [ ] `npm run verify` green
- [ ] Visual check on `:3050`: `/ops/photos`, `/unbox?unboxview=history`, `/shipping/orders`

---

## Anchors

| Concern | File |
|---|---|
| Band + slots | `src/components/dashboard/workbench-shell.tsx` |
| Views menu | `src/components/saved-views/WorkbenchViewsMenu.tsx` |
| Inspector toggle | `src/components/dashboard/workbench-inspector-toggle.tsx` |
| Lean-row golden | `src/components/receiving/unbox/UnboxWorkspaceHeader.tsx` |
| Photo Library | `src/components/photos/PhotoLibraryPage.tsx` (+ `PhotoLibraryWorkspaceHeader.tsx`) |
| ▦ trigger (portal-or-nothing) | `src/design-system/components/grid/GridColumnDetailsTrigger.tsx` |
| ▦ debt ledger | `src/components/dashboard/workbench-trailing-cluster.guard.test.ts` |
| Nav keys | `src/lib/keyboard/nav-keys/` + `src/lib/receiving/unbox-band3-nav-keys.ts` |
| Primary guard | `src/components/dashboard/band3-find-only.guard.test.ts` |
| SoT | `.claude/rules/source-of-truth.md` → Find-only Band 3 · Grid column visibility · Nav keys |
| Recipe | `.claude/rules/display/workbench-ops-queue.md` · `.claude/rules/display/media-library.md` |

---

## Paste into a fresh session

```
Read docs/todo/band3-lean-row-PORTS-HANDOFF.md end-to-end before editing.

GOAL
Band 3 is exactly four controls, in this order:
  [ search (refine INSIDE the field) ] [ Views ] [ KPI ] [ Show inspector ]
Move Views into the RIGHT cluster (it currently abuts find on the left), port
/ops/photos onto WorkbenchTriageBand, and shrink the NO_COLUMN_DISPLAY_HOST
ledger.

HARD LAWS
- Refine rides in the find field as ONE funnel with facet tabs — never one glyph
  per facet, never a Band-3 right= icon row, never a raw <select>
- ▦ is portal-or-nothing: Band-3 controls slot or inspector View cluster. No
  card-corner float, no triggerPortalOnly prop. No host ⇒ no ▦ ⇒ ledger row
- Never mount an inspector toggle with no desk peek behind it (honest absence)
- No new global chord. Filtering is a nav TARGET on the ⌘; leader
- Attach to :3050; never start/restart/kill the dev server
- User owns commits; npm run verify before done; never raise a ratchet baseline

ORDER
1. Views → right cluster + guard the order
2. /ops/photos → WorkbenchTriageBand (one funnel, Views, inspector, no KPI)
3. NO_COLUMN_DISPLAY_HOST: Scan-out → Tracking-exceptions → Warranty → Unfound
4. WorkbenchTriageBand navRegionId so ⌘; m works past Unbox
5. (optional) facet tokens in the query — parser runs AFTER routeScan

WATCH OUT
- A second session is editing this tree; re-read anchors, check mtimes
- registerNavRegion keys by region id — two live 'middle' regions fight silently
- photos-railless-frame.spec.ts measures the bands and will need retargeting
```
