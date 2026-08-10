# Media Library → A3 desk inspector (index→leaf) — staged implementation plan

**Date:** 2026-08-09
**Surface:** `/ops/photos` — Media Library (Workbench pick+edit evidence DAM)
**Answers:** [`media-library-unbox-parity-ds-2026-GEMINI-RESEARCH-BRIEFING.md`](media-library-unbox-parity-ds-2026-GEMINI-RESEARCH-BRIEFING.md) → winner **A3**
**Supersedes:** [`media-library-rail-card-HANDOFF.md`](media-library-rail-card-HANDOFF.md) § *"Removed by the operator — do not reinstate"* (dated note required — see S0)
**Status:** PLAN — not started. Stages S0–S6, each independently checkable.

---

> ## ⚠️ Dated amendment — 2026-08-09/10: `PhotoLibraryToolbar` no longer exists
>
> Everything below that says *"n ≥ 2 hands the chrome slot to `PhotoLibraryToolbar`"* — C2's
> ruling that the toolbar *"is already correctly specialized and is left alone"*, the S1 stage
> map, the ASCII frame at §"the three columns", the S4 label-editor row, and the kill-list's
> *"do not touch `PhotoLibraryToolbar`"* — **described the tree correctly when written and is now
> false.** The original text is kept verbatim: it is the evidence for why the toolbar survived S1,
> and deleting it would delete the reasoning.
>
> What changed, and why it does not contradict C2:
>
> - The toolbar was **deleted**, not re-specialized. C2 was right that its actions were all
>   N-safe; the defect was never the action set but the toolbar's **placement** — a chrome band
>   that swapped itself in over Bands 1–3, so ticking two photos took away the lifecycle tabs,
>   the search field and the breadcrumb.
> - Its verbs are now armed ROWS in **`PhotoBatchInspectorPanel`** (`detail:photo-batch`, push) —
>   the n ≠ 1 face of the same right-edge slot the inspector owns at n = 1. Cardinality changes
>   the content, never the place. `showBulkToolbar` kept its predicate and its name became
>   `showBatchRail`, so the zero-selected entry state ("Select all 48") moved with the verbs.
> - **Delete is the flush trailing child of `InspectorActionFloor`**, never a verb row
>   (2026-08-10) — which the A3 ruling already required of the inspector and now applies at both
>   cardinalities.
> - The surface also **de-animated**: nothing under `src/components/photos/` imports the motion
>   barrel or uses `layoutId`, and the batch rail's armed face composes the shared tokens
>   **without** `ARMED_CURSOR_MARKER_PULSE_CLASS` (operator-confirmed divergence from Unbox).
>
> Live SoT: [`.claude/rules/display/media-library.md`](../../.claude/rules/display/media-library.md).
> Execution handoff: [`media-library-batch-rail-and-de-animation-HANDOFF.md`](media-library-batch-rail-and-de-animation-HANDOFF.md).

---

## 0. What the research report got right, and the four places it is wrong

The A3 ruling (desk inspector, index→leaf, `DeskInspectorIndexShell`, `RightRailHost` push,
`InspectorActionFloor`) is **adopted**. Four of its supporting claims did not survive repo
verification and are corrected here. Each correction changes what gets built.

### C1 — `PhotoContextPanel` is not the library's to delete

The report's backlog opens *"KILL: Delete `PhotoContextPanel` drawer."*

It lives at `src/components/shipped/photo-gallery/PhotoContextPanel.tsx` — inside the **shared
photo-gallery SoT**, not the library. It is mounted by exactly one thing,
`PhotoViewerModal.tsx:731`, and that modal is consumed by ~18 surfaces (carton read, Unbox
`PhotosActionsArmedList`, SKU detail, support ticket detail, `EventTimeline`, claim photo picker,
`CommandBar`, …). It is also read **as a source file** by a guard
(`src/lib/photos/client-capture-roundtrip.test.ts:311`), so deleting it fails CI on a test that
has nothing to do with the media library.

It is also not a "drawer" in the sense the report implies: it is a `motion.aside` **flex sibling
inside the fullscreen lightbox** that animates its own width `0 ⇄ 20rem` and is toggled by the
`i` key. Props are `{ photo, onCollapse }` — no id, no URL coupling.

> **Ruling:** the shared drawer is **not deleted and not modified**. It is the lightbox's own
> Details affordance and stays correct for its 17 other consumers. The library's consolidation
> target is the **context menu** (C2), not this panel. Revisit only if the library's own lightbox
> invocation later wants it suppressed — that is a prop on the invocation, never a deletion.

### C2 — There are no single-asset actions in the toolbar to strip

The report's second kill is *"Strip single-asset actions from the multi-select
`PhotoLibraryToolbar`."*

`PhotoLibraryToolbar.tsx` + its action set at `PhotoLibraryPage.tsx:430-568` contain **zero**
single-asset actions. Every one is written N-safe: `download` branches `ids.length >= 2 → ZIP`
else single file (`:534-550`); `copy-links` / `share-page` operate on the whole `selected` set
under a `maxSelected: 200` cap; `labels` opens the bulk-diff editor; `zendesk` attaches the set.

The genuine single-asset plane is **`PhotoContextMenu`** (right-click) —
`photoMenuItems(photo)` at `PhotoLibraryPage.tsx:322-396`: Open in new tab · Copy shareable link ·
Create share page · Attach to ticket · Edit labels · Download · Delete. Its own comment
(`:320-321`) calls it *"the 'drilling' menu … Mirrors the bulk toolbar for one photo."*

> **Ruling:** the toolbar is **already correctly specialized** and is left alone. The plane that
> the inspector replaces is the **right-click context menu**. This is the kill-list (S6).

### C3 — Deletion cannot ship before construction

The report orders the backlog KILL → KILL → BUILD. Killing the plane that owns a verb before the
plane that will inherit it exists leaves those verbs homeless for the length of a stage.

> **Ruling:** *deletion-ordered* means the backlog is **justified by what it deletes**, not that
> the deletes land first. Construction S1–S4, consolidation S5.

### C4 — `RightRailHost` is already mounted; there is no layout work

The report's agent prompt says *"Add `RightRailHost` adjacent to the grid."* It is already mounted
globally in `ResponsiveLayout.tsx:402` as an in-flow flex sibling inside `<main>`. `/ops/photos`
**inherits the host and has simply never filled it** — there is not one
`useRegisterRightPanel` / `DetailStackRailRegistrar` under `src/components/photos/`, and no photo
occupant id exists anywhere in `src/lib/right-rail/`.

> **Ruling:** S1 is a **registration**, not a layout change. Do not touch `ResponsiveLayout`.

---

## 1. The H4 deletion postmortem — answered from code, not memory

Framing rule C of the brief forbids reinstating `PhotoInspectorPanel` + `?photoId=` without
diagnosing why the deletion was rational and differing on that axis. The operator does not recall
the reason. **The code recorded it in three places**, and they agree:

| Evidence | What it says |
|---|---|
| `PhotoCard.tsx:53-62` | *"There is deliberately no second, quieter 'inspect' path competing for the same click."* |
| `src/data/release-notes.json:91` | *"Drop PhotoInspectorPanel + date-folder tree; tile click reopens fullscreen viewer"* |
| `library-filter-state.ts:526-537` | *"There is deliberately no `?photoId=` record selection here… re-adding a durable record param means re-answering what happens when a filter change evicts that photo from the result set."* |

**Diagnosis — two independent failures:**

1. **It competed with the lightbox for the tile click.** On a photo surface, a click means
   *show me the photo*. The prior inspector made the click ambiguous, and the resolution the
   operator chose was to give the click back to the viewer.
2. **`?photoId=` had no eviction answer.** A durable record param on a filtered stream must say
   what happens when a filter change removes that record. It never did.

**How A3 differs — the two axes, addressed:**

1. **The inspector never touches the tile click.** Click stays → lightbox
   (**operator ruling, 2026-08-09**, overriding the report's D2, which had click → inspector and
   double-click → lightbox). The inspector is the **n = 1 face of the selection plane**:
   select one photo → inspector; select two or more → the existing bulk toolbar. Same shape as
   Orders / History (`detail:order` n=1 vs `detail:order-batch`). Nothing is taken away from any
   existing gesture.
2. **Eviction is ruled explicitly** (S1): `?photoId=` is *written from selection and cleared with
   it*. A filter change that drops the photo from the loaded set clears the selection, which
   clears the param and closes the rail. One rule, no new concept, and it is a Stage-1
   acceptance check.

**The payoff that makes it worth rebuilding:** the prior panel was facts-only, which is why it read
as a redundant second Details. A3's value is **topic depth + an action floor + armed verb rows** —
it inherits the seven single-asset verbs currently reachable only by right-click, which is a
plane the prior inspector never replaced.

---

## 2. Target anatomy

```
┌─ left ContextPanel ─┬─ centre: Workbench sheet ────────────┬─ right: RightRailHost ──┐
│ PhotoLibrary        │ WorkspaceHeader (search/filter/sort) │ [>|] ……… [ 3/128 ][↑][↓]│ ← DeskRailChromeRow
│ SidebarPanel        │ PhotoLibraryHeader (path strip)      │─────────────────────────│
│  (sources · days)   │ — or PhotoLibraryToolbar when n≥2 —  │ DeskInspectorIndexShell │
│                     │                                      │  ▸ Identity             │
│                     │ PhotoFlatGrid — day bands            │  ▸ Evidence             │
│                     │  tiles now carry stage + Captured    │  ▸ Links                │
│                     │  vs Uploaded on the face (S3)        │  ▸ Activity             │
│                     │                                      │  ▸ Actions (armed rows) │
│                     │  click → lightbox (UNCHANGED)        │─────────────────────────│
│                     │  select 1 → this rail                │ InspectorActionFloor    │
│                     │  select 2+ → toolbar, rail yields    │ [Open][Ticket] …  [🗑]  │
└─────────────────────┴──────────────────────────────────────┴─────────────────────────┘
```

Selection cardinality is the mode switch. There is no third state.

---

## 3. Stages

Each stage is independently shippable and independently checkable. **Do not start a stage before
its predecessor's gate passes.**

### How to verify anything, given the tree is red

`npm run verify` is currently **red for reasons unrelated to this work**: 9 TS errors in
`src/components/layout/HeaderPinsSwitcher.tsx` (another session's in-flight rail-less pins /
saved-views work). Do not fix them and do not inherit them. Scoped checks per stage:

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep -v HeaderPinsSwitcher
```

```bash
npx tsx --test src/components/right-rail/desk-inspector-index.guard.test.ts src/components/right-rail/right-rail-inspector-header.guard.test.ts src/components/right-rail/inspector-action-floor.guard.test.ts src/components/right-rail/right-rail-push.guard.test.ts
```

Dogfood walks run against the **already-running** dev server on `http://localhost:3050`.
Never start, restart, or kill it.

---

### S0 — Ruling + scope lock (docs only)

**Goal:** make the reinstatement legal and the corrections durable before any code moves.

**Do**
- This plan file (done).
- Append a dated supersede note to `media-library-rail-card-HANDOFF.md` under *"Removed by the
  operator — do not reinstate"*: the ban is lifted **conditionally**, citing the two failure axes
  from §1 and the two conditions A3 meets. Do not delete the original paragraph — it is the
  evidence.
- Record the operator ruling that overrides the report's D2 (click stays on the lightbox).

**Gate — you can check this by reading**
- [ ] `media-library-rail-card-HANDOFF.md` carries a dated note that names both failure axes.
- [ ] Nothing under `src/` changed. `git status` shows docs only.

---

### S0.5 — E2E baseline (DONE 2026-08-09)

**Goal:** a green DAM routing spec *before* S1 touches the URL contract, so a
`?photoId=` regression is caught by a test that was already passing.

**What was actually wrong.** Playwright itself was fine — no `webServer` block, it
attaches to `:3050`, and `qa-admin.json` mints cleanly. Three separate defects sat
on top of it:

1. **The QA org had no photos.** `scripts/provision-qa-org.ts` seeded zero —
   `grep -c -i photo` returned 0 on 1120 lines. Every Media Library spec on
   `--project=qa-desktop` failed or `test.skip`ed itself with *"no photos seeded
   in this environment"*. **Fixed:** `QA_FIXTURE_PHOTOS` + `seedPhotoFixtures`
   (5 metadata-only rows spanning `arrival_package` · `unbox_carton` ·
   `unbox_item`, two capture days, mixed Captured/Uploaded).
2. **The specs asserted retired copy.** 10 sites across 4 specs asserted
   `"N photos in view"`; `PhotoLibraryPage.tsx:280` renders
   `Photos ${n} · ${subtitle}`. **Fixed**, and the selector is
   `/Photos \d+ ·/` — the trailing separator is load-bearing, because the grid
   footer renders a bare `Photos ${n}` and a plain `/Photos \d+/` trips
   Playwright strict mode whenever both are on screen.
3. **One spec tested a capability that does not exist.**
   `?entityType=SERIAL_UNIT&entityId=42` asserting "Entity" / "Entity ID"
   fields — neither param is in `parsePhotoLibraryFilters`, neither field
   exists. **Deleted**, replaced with the real `?serial=` / `?tracking=` params.
   The spec also hardcoded dogfood ids (`receivingId=1987`, `sku=WM-1023`)
   against the QA project; everything now resolves from `QA_FIXTURE_*`.

**Result:** `photos-library-deep-link.spec.ts` rewritten as the DAM routing
contract — landing stream · `sourceScope`+`stage` round-trip · honest-empty
branch · `sku` · `tracking` · `view` default-drops-out. **6/6 green in ~18s,
three consecutive runs.**

```bash
pnpm provision:qa-org && npx playwright test tests/e2e/photos-library-deep-link.spec.ts --project=qa-desktop
```

**Two gaps left open deliberately — neither blocks S1:**

- **The `desktop` (dogfood) project is unauthenticated.** `global-setup` reports
  `account signin failed (401): INVALID_CREDENTIALS`, so every spec on that
  project redirects to `/signin`. It needs real credentials in `.env`
  (`QA_ADMIN_PASSWORD` has a QA equivalent; the USAV one does not resolve).
  This is an environment fix, not a code fix.
- **Viewer specs need real image bytes.** `photos-library-context-panel.spec.ts`
  and `photo-viewer-dismiss.spec.ts` click a tile to open the lightbox, which
  waits on an image the metadata-only fixture will never serve — so they time
  out on the click rather than failing an assertion. A larger fixture of the
  same shape cannot fix this. See the limit note on `QA_FIXTURE_PHOTOS`.
- Also found, not fixed: `photo-library-folders.spec.ts` is **dead** — it reads
  testids (`folder-level`, `photo-folder`) that exist nowhere in `src/`, so its
  `test.skip` fires unconditionally on every run.

---

### Stage map (renumbered 2026-08-09)

Two stages were added at the operator's direction: a **chrome port** (flush-square,
host-vs-content pad) and an explicit **modals → rail** migration. The action floor
moved ahead of the modal migration because a modal needs a commit surface to land on.

| Now | Stage | Was |
|---|---|---|
| **S0** ✅ | Ruling + scope lock | S0 |
| **S0.5** ✅ | E2E baseline | S0.5 |
| **S1** ✅ | **Flush chrome port + the rail actually displays** | *new* — absorbs the old S1 shell work |
| **S1.5** ✅ | **Delete the left rail; tabs → top chrome (rail-less, 3-band)** | *new* — operator direction 2026-08-09 |
| **S2** | Index→leaf topics | S2 |
| **S3** | Action floor + armed verbs | S4 |
| **S4** | **Modals → rail leaves** | *new* |
| **S5** | Tile-face provenance | S3 |
| **S6** | Kill the context menu + plane map | S5 |
| **S7** | Guards + SoT rows | S6 |

**Why the modal moves are not literally first.** A modal cannot move into a rail
that has no topic container (S2) and no commit surface (S3) — doing it earlier
means building a page-local body that gets deleted two stages later, which is the
page-local twin the composition rules ban. What S1 *does* deliver first is the
part that is visible immediately: flush chrome, and the rail existing at all.
Every modal's destination is **ruled** in S1 (§3 of the handoff), so nothing is
discovered late.

---

### S1 — Flush chrome port + the rail actually displays

> **Handoff:** [`media-library-flush-chrome-and-rail-EXECUTION-PROMPT.md`](media-library-flush-chrome-and-rail-EXECUTION-PROMPT.md)
> — the implementer prompt, with the in-scope file list, the out-of-scope
> surfaces, the modal decision table, and acceptance.

**Goal:** `/ops/photos` reads as promoted-SoT ops chrome, and the desk inspector
is real — it opens, pushes, walks the stream, survives reload, and closes.

Three jobs:

1. **Flush chrome** — ~34 soft-radius sites on the library surface become
   `cornerClass('flush')`; host padding moves onto rows (`inset-field` /
   `inset-cozy`). `rounded-full` survives only on status dots · avatars · Switch
   tracks. **Out of scope:** `ListingPhotoGallery`, `PublicSharePhotosPage`, the
   `MediaLibraryPicker*` fork, and everything under `shipped/photo-gallery/`.
2. **The rail displays** — `RightRailHost` is already mounted globally, so this is
   a registration (`detail:photo`, stable id, `modal={false}`, push by default)
   plus `?photoId=` on display params via `useOptimisticUrlParam`, plus
   `DeskRailChromeRow`. Selection cardinality is the mode switch: 1 → rail,
   ≥2 → toolbar.
3. **Modal inventory ruled** — the decision table is authored now; the moves land
   in S4.

**Gate:** the handoff's §4. Load-bearing among them —
`photos-library-deep-link.spec.ts` must stay **6/6**: it was green before S1
started, so if it goes red you changed routing, not chrome.

#### S1 — the modal inventory, ruled (2026-08-09)

`PhotoLibraryPage` mounts five overlays. Every destination is decided **now**;
only the `sm:rounded-2xl` flush landed in S1. The moves are S4, because a modal
cannot move into a rail that has no topic container (S2) and no commit surface
(S3) — doing it earlier builds a page-local body that S2 deletes.

| Line | Overlay | Kind | Ruling | Lands |
|---|---|---|---|---|
| 678 | `ZendeskClaimModal` | `RightPaneOverlay` | **→ rail leaf.** It edits the selected photos, which is record work; the modal shape was only ever a placement. | S4 |
| 690 | `PhotoContextMenu` | cursor dropdown | **→ deleted.** Its 7 verbs become the rail's armed rows + action floor; right-click falls back to the browser's own menu, which already does "open image in new tab" better. | S6 |
| 699 | `PhotoLabelEditor` | centred `Dialog` | **→ rail leaf at n = 1.** The bulk-diff path for n ≥ 2 stays on `PhotoLibraryToolbar` — that is the cardinality split S1 established, not a second home for one job. | S4 |
| 706 | `MediaLibraryShortcutsModal` | `Dialog` (`?` help) | **STAYS a modal.** A keyboard cheat sheet is not a record surface and has no business in a record inspector. | — |
| — | `PhotoViewerModal` (lightbox) | immersive viewer | **STAYS.** Operator ruling 2026-08-09 — it owns the tile click. | — |
| — | A destructive confirm | `requestConfirm` | **STAYS modal.** House law reserves modal for surfaces that genuinely block until dismissed; Delete is a floor button that arms, not a leaf. | — |

**Not on this list, and not this surface's to move:** `MediaLibraryPicker*` (the
Zendesk-attach fork, live consumer) and everything under
`shipped/photo-gallery/` (the shared lightbox SoT, ~18 consumers, read as a
source file by `client-capture-roundtrip.test.ts`).

`RightPaneOverlayHost` (`:571`) is retired in S4 **iff** nothing else needs it
once the two movers leave. If something does, S4 says what and leaves it.

#### S1 — what actually shipped (2026-08-09)

- **Flush chrome.** All 22 in-scope files, plus two library-only files the
  original list missed (`PhotoLibraryTicketNasBackup`, `PhotoContextMenu`) —
  leaving either soft would have failed the surface's own "nothing soft remains"
  acceptance. `rounded-full` survives on exactly one element: `PhotoThumb`'s
  damage **status dot**.
- **`SelectionMark` / `GroupSelectionMark` flush.** They are `aria-pressed`
  toggle CONTROLS, and `rounded-full` survives only on status dots · avatars ·
  Switch tracks; a circle check on a flush-square tile also reads as leftover.
- **Chrome bands, not islands.** `PhotoLibraryHeader` (the path strip) moved OUT
  of the scroll body into `DashboardScrollShell`'s `chrome` slot as Band 2. That
  removed a second `sticky top-0` layer competing with the day bands' own — the
  one-sticky-layer-per-port rule — rather than offsetting it.
- **The rail.** `detail:photo` (stable id), `modal={false}`, push by default,
  `DeskRailChromeRow` + `N / M`. Cardinality is the mode switch: 1 → rail,
  ≥2 → bulk toolbar, 0 → neither, mutually exclusive by construction
  (`showBulkToolbar = selectionActive && inspectorPhoto === null`).
  *(2026-08-09: the ≥2 face is now the batch RAIL, same predicate renamed
  `showBatchRail` — see the dated amendment at the top.)*
- **Eviction, implemented.** `?photoId=` is a display param
  (`parsePhotoLibraryDisplayParams`), written from selection and cleared with
  it. A one-shot hydrate seeds the selection from the URL on mount so a reload
  restores the photo; a seed that is not in the loaded set stays unselected and
  the param clears — the same rule applied at load.
- **New net:** `tests/e2e/photos-inspector-walk.spec.ts` (6/6) pins all of the
  above beside the deep-link spec, which stayed 6/6.

**Open, deliberately not fixed in S1:** the filter-funnel and sort triggers are
`ToolbarButton` (shared DS, `rounded-lg`). House law already says quiet filter
icons on `ToolbarButton` flatten to flush; flushing it here would repaint every
workbench, so it is a DS-level follow-up, not a library change.

---

### ↳ Folded into S1 — the old "durable selection + empty push shell"

The old S1 (durable `?photoId=` + empty push shell) is now job 2 of S1 above —
"make the rail display" and "register the occupant" were the same work described
twice. Its acceptance walk survives verbatim in the handoff.

<details>
<summary>Original S1 detail, retained for reference</summary>

**Goal:** the rail opens, pushes, walks the stream, survives reload, and closes. No content yet.

**Do**
- `src/lib/photos/library-filter-state.ts` — add `photoId` to **display params**
  (`parsePhotoLibraryDisplayParams`, alongside `view` / `page`), **not** to filters. It must never
  reach `buildLibraryWhere`. Replace the "deliberately no `?photoId=`" comment block at
  `:526-537` with the eviction rule rather than deleting it.
- **Do not add `photoId` to `MediaViewPayload`** (`useMediaLibrarySavedViews.ts`). A saved view
  persists `{ filters, view }`; a saved view that reopened one photo would be a bug.
- `src/hooks/usePhotoInspectorParam.ts` — new, composing `useOptimisticUrlParam`
  (`shareKey: 'photos:photoId'`), modelled on `useLabelsHistoryIdParam.ts` (the cleanest existing
  consumer). Photos currently has **no** optimistic-param usage and **no** entry in
  `src/lib/routing/route-params.ts` — add one while here.
- `src/components/photos/photo-inspector/PhotoInspectorPanel.tsx` — new. Registers via
  `DetailStackRailRegistrar` with the **stable** id `detail:photo` (never `detail:photo:<id>` —
  a per-record id plays exit→empty→enter on every ↑↓ step), `modal={false}`. Leave `push`
  unset — it defaults `true`, which keeps the file off the `FLOAT_ONLY` allowlist.
- Chrome: `DeskRailChromeRow` — `onClose`, `onPrev`/`onNext` over the loaded stream, `cursor` =
  `N / M`. **`↑` is previous, `↓` is next.** No contextual icons on this row.
- Wire cardinality in `PhotoLibraryPage.tsx`: `selected.size === 1` → open + write `photoId`;
  `>= 2` → clear `photoId` and let `PhotoLibraryToolbar` own the chrome slot; `0` → closed.
- Body: a single identity line. Deliberately thin — S2 fills it.

**Watch for**
- `usePhotoSelection` persists selection across pages; confirm it exposes an exactly-one signal
  before wiring, rather than deriving one from a `Set` you assume is filter-scoped.
- The rail must not fight `RightPaneOverlayHost` (`PhotoLibraryPage.tsx:571`) — that pins dialogs
  over the pane rect and is *not* the right rail.

**Gate — dogfood walk on `:3050`**
- [ ] Click a tile → the **fullscreen lightbox** opens, exactly as today. No rail.
- [ ] Enter select mode, tick one photo → rail **pushes** in; the grid narrows and reflows beside
      it. Nothing floats over the tiles; no scrim.
- [ ] URL gains `?photoId=…`. Reload → same photo still open.
- [ ] `↑` / `↓` step to the previous / next photo in the stream, content swapping **in place**
      (no blank frame between records). Cursor reads `N / M`.
- [ ] Tick a second photo → rail closes, bulk toolbar appears. Untick → rail returns.
- [ ] Change a filter so the open photo leaves the result set → selection clears, `?photoId=`
      clears, rail closes.
- [ ] `>|` closes and clears the param.

**Gate — automated**
- [ ] `right-rail-push.guard.test.ts` green with **no** new `FLOAT_ONLY` entry.
- [ ] Add `PhotoInspectorPanel.tsx` to `DESK_RAIL_CHROME_ROW_GOLDEN`
      (`right-rail-inspector-header.guard.test.ts:59-66`); green.
- [ ] Scoped `tsc` clean.

</details>

---

### S1.5 — Delete the left rail; port its tabs into the top chrome

> **Handoff:** [`media-library-rail-less-chrome-EXECUTION-PROMPT.md`](media-library-rail-less-chrome-EXECUTION-PROMPT.md)

**Operator direction, 2026-08-09.** `/ops/photos` goes **rail-less** (Pattern E).
`PhotoLibrarySidebarPanel` is deleted outright — not migrated, not gated — and
its lifecycle facets become Band-1 tabs, the Unbox chrome way:

```
Band 1  tabs (All · Unboxing · Pickups · Packing · Repair · Claims · Outbound)
Band 2  the search bar
Band 3  breadcrumb + display controls
```

This **reverses the 2026-07-29 ruling** that put the scope control in the rail
and forbade one in the chrome. That ruling's invariant — *exactly one writer of
`sourceScope` / `imageType`* — is kept; what changes is which control survives.
Deleting the rail first (rather than porting first) is what makes the two-writer
state unreachable instead of temporary.

Band 2 = search / Band 3 = breadcrumb **inverts** the house Band 2 = KPI /
Band 3 = find. That divergence is deliberate (no KPI band exists here; search is
an approved entry-path exception on this surface; a path strip is a context
readout at KPI altitude) and it is why S1.5 also authors
`.claude/rules/display/media-library.md` as this surface's display SoT.

**Side effect worth naming:** S1 measured the centre at **720** at 1440 with the
360 rail open — below `MIN_WORK_SURFACE_PX`, which is `frame.test.ts:71`'s pinned
answer for any desk inspector in that frame. Reclaiming the rail's width is what
lets the inspector push without constraining the stream.

#### S1.5 — what actually shipped (2026-08-09)

- **The rail is deleted**, not gated: `PhotoLibrarySidebarPanel` +
  `OutboundDocumentTypeFilters` are gone, `SidebarContextPanel` lost its branch,
  and `'ops-photos'` left `CONTEXT_PANEL_ROUTE_KEYS`.
  `isRaillessOrderFeedSurface` was **not** widened.
- **Band 1** is `PhotoLibraryScopeBand` — lifecycle tabs (paired glyph + label)
  plus a leading media-type cube, in ONE file, which is what makes "exactly one
  writer of `sourceScope` / `imageType`" structural rather than a convention.
  Trailing is empty (honest absence).
- **Band 2** composes the house `WorkbenchTriageBand`: a dominant always-open
  `SearchField` whose `trailingSuffix` refine popover absorbed the rail's two
  survivors — outbound document types and capture days (with counts, and the
  three-state honesty carried over verbatim).
- **`window.prompt` is gone from the whole surface** — the port replaced one and
  the guard found two more (`PhotoLabelEditor`, `PhotoLabelsSection`); all three
  are inline DS inputs now.
- **The 720 was NOT the rail.** `RightPaneOverlayHost` is a flex item that sized
  to `max-content`; deleting the column reclaimed the width and handed it to
  nobody. `min-w-0 flex-1` on that host is the fix, and the stream now measures
  **1440 of 1440** at a 1440 viewport.
- **New nets:** `.claude/rules/display/media-library.md` (the display SoT, indexed
  from `contextual-display.md`, with a row in `source-of-truth.md`),
  `media-library-chrome.guard.test.ts` (6/6) and
  `tests/e2e/photos-railless-frame.spec.ts` (4/4). The two S1 specs stayed 6/6.

---

### S2 — Index→leaf topics

**Goal:** the rail earns its width — topic depth the lightbox Details drawer cannot host.

**Do**
- `src/lib/photos/photo-inspector-topics.ts` — topic spec SoT, mirroring
  `history-inspector-topics.ts`. Typed keys, labels, groups, shortcuts.
- `src/components/photos/photo-inspector/build-photo-inspector-leaves.tsx` — the builder, in the
  house shape all three existing builders share (`ICON_FOR` / `SUBTITLE_FOR` / `GROUP_FOR`
  records → `.map()` into `DeskInspectorLeaf`).
- Leaves, mapped to `DisplayIndexGroup`:

  | Leaf | Group | Holds |
  |---|---|---|
  | **Identity** | `verification` | title, capture day, dimensions, staff, caption |
  | **Evidence** | `verification` | stage, source scope, Captured vs Uploaded, damage / analysis flags |
  | **Links** | `context` | PO · ticket · SKU · serial · tracking · carton, each a jump that **preserves library filters** |
  | **Activity** | `context` | audit / analysis history |
  | **Actions** | `assets` | S4 |

- Hold the active leaf id in **local `useState`**, not the URL. All eight existing
  `DeskInspectorIndexShell` consumers do this; the C2 rule for desk visit history is
  "URL / simple last leaf".
- Facts resolve through existing SoTs — `src/lib/photos/stages.ts`, `capture-provenance.ts`,
  `libraryPhotoMeta` (`photo-grid-format.ts:74-95`). Invent no second projection.

**Gate — dogfood walk**
- [ ] Rail opens on the **index**, showing grouped topic rows.
- [ ] Each row drills to its leaf; sticky Back returns to the index; `Esc` pops leaf → index.
- [ ] A `Links` row jumps to the entity **without losing the library's filters**.
- [ ] Stepping `↓` to another photo re-seeds every leaf; no stale value from the prior photo.

**Gate — automated**
- [ ] Add the panel to `INDEX_SHELL_HOSTS` (`desk-inspector-index.guard.test.ts:25-34`); green.
      That guard also asserts the file does **not** contain `StationDisplaysPushStack`,
      `StationDisplayIndexList`, `density="icon"`, `PaneHeaderTabs`, or `SectionTabsSlider`.
- [ ] The file does not import `StationDisplayIndexList` (so it never joins
      `INDEX_LIST_IMPORT_ALLOWLIST`).

---

### S3 — Action floor + armed verb rows

**Goal:** the inspector inherits the seven verbs currently reachable only by right-click.

**Do**
- `InspectorActionFloor` at the panel floor: `leading` (copy / open raw), `actions` (labelled CTA
  cluster), `delete` = `InspectorFlushDelete`. It composes `FlushTerminalFooter layout="cluster"`.
- The **Actions** leaf carries the armed verb rows: Open in new tab · Copy shareable link ·
  Create share page · Attach to ticket · Edit labels · Download. Delete lives on the floor, not
  in the list — a destructive action belongs to the record's own control.
- Permission gates carried over verbatim from `photoMenuItems`: `photos.share`,
  `integrations.zendesk`, `photos.manage`.
- **Explicitly excluded** (Station-only, per the brief): Phone capture · Move between POs · Send
  to phone. The library deep-links to Unbox; it does not grow bench tools.

**The one real risk in this stage.** `StationArmedVerbList` and `useArmedCursorList` live under
`src/components/station/displays/` and are **not exported from that barrel**. Importing them is
*legal* — there is no ESLint boundary, the C2 rule shares presentation primitives, and Unbox
workspace files already deep-import both. But `StationArmedVerbList` hardwires
`useNavRegion({ id: 'right' })` and `isKeyboardRegion('right')`.

> **Decide at the top of S4, and write the choice down:** either (a) compose `useArmedCursorList`
> directly and render library-owned rows — no nav-region coupling, the safer default — or
> (b) grow `StationArmedVerbList` to take its region as a prop. Do **not** import it as-is and
> discover the coupling at the bench.

**Gate — dogfood walk**
- [ ] Every verb in the right-click menu is reachable from the inspector.
- [ ] Delete arms on first click and commits on the second; nothing else on the floor is
      destructive.
- [ ] Keyboard: arm and commit a verb without the mouse. Arming does not steal focus from the
      grid's own roving arrow-key nav (`usePhotoGridKeyboardNav.ts`).
- [ ] A staffer lacking `photos.share` sees no share verbs — absent, not disabled.

**Gate — automated**
- [ ] Add the panel to `DESK_FLOOR_CONSUMERS` (`inspector-action-floor.guard.test.ts:29-37`);
      green. That guard also bans `StationTerminalDock` / `SlicedActionDock` imports and
      full-width red delete buttons.

---

### S4 — Modals → rail leaves

**Goal:** the overlays that edit a record stop being overlays. **Ruled in S1 —
the decision table lives above** (S1 → *the modal inventory, ruled*); this stage
executes it, now that a topic container (S2) and a commit surface (S3) both
exist to land them in.

**Re-check before moving `PhotoLabelEditor`:** the inspector's stable occupant id
(`detail:photo`) means the record swaps IN PLACE on every ↑↓ step. That is free
today because the body holds no draft. A label editor in the rail makes it a
dirty-draft surface, so S4 owes the flush-before-swap precondition
(`display/motion-crossfade.md` → a queue-processing inspector swaps in place):
the outgoing photo's edits must commit while the save closure still points at
it, and navigating without editing must write nothing.

**Do**
- **`ZendeskClaimModal`** (`PhotoLibraryPage.tsx:678`) → a rail leaf. It edits the
  selected photos, which is record work; the modal shape was only ever a
  placement.
- **`PhotoLabelEditor`** (`:699`) → a rail leaf for **n = 1**. The bulk-diff path
  for n ≥ 2 stays on `PhotoLibraryToolbar` — that is the cardinality split S1
  established, not a second home for one job.
- Retire `RightPaneOverlayHost` (`:571`) **iff** nothing else needs it once those
  two move. If something does, say what, and leave it.

**Do NOT move**

| Overlay | Why it stays |
|---|---|
| `MediaLibraryShortcutsModal` (`:706`) | a keyboard cheat sheet is not a record surface; it has no business in a record inspector |
| `PhotoViewerModal` (lightbox) | ruled 2026-08-09 — it owns the tile click |
| A destructive confirm | house law reserves modal for surfaces that genuinely block until dismissed; Delete is a floor button that arms |
| `MediaLibraryPicker*` | different surface, defended fork, live Zendesk-attach consumer |

**Gate — dogfood walk**
- [ ] Editing labels on one photo happens **in the rail**; the grid stays visible
      and the row stays selected throughout.
- [ ] Creating a claim from selected photos happens in the rail; no scrim.
- [ ] Bulk label edit (n ≥ 2) still opens the diff editor from the toolbar.
- [ ] `?` still opens the shortcuts modal, and it is still a modal.
- [ ] No overlay renders over the grid on this surface except the lightbox.

---

### S5 — Provenance on the tile face

**Goal:** close the density gap the report graded as a core principle (Class B) and its own audit
called primary — then omitted from its backlog. **Included at operator direction, 2026-08-09.**

Deliberately last of the build stages: it is the one item that improves the surface
**without opening the rail at all**, so it is independent of S1–S4 and can slip
without blocking anything.

**Do**
- `PhotoCard.tsx` + `photo-library-grid/photo-grid-format.ts` — put **stage** and **Captured vs
  Uploaded** on the tile face. Both already exist on `LibraryPhoto`; today they wait for the
  lightbox Details drawer.
- Stage paints from `src/lib/photos/stages.ts` + `scope-icons.ts`. No page-local tone map.
- Captured vs Uploaded is the `clientCapturedAt` / `createdAt` distinction the drawer already
  labels as not-server-verified — keep that honesty on the face; do not imply verification.
- Respect density: the face must survive `grid-sm` without becoming a dossier. A glyph + a short
  chip, not a fact stack.
- The QA fixture already seeds both cases (`QA_FIXTURE_PHOTOS` mixes `captured: true` / `false`),
  so the absent branch is exercisable rather than theoretical.

**Gate — dogfood walk**
- [ ] At `grid-sm`, every tile shows its stage and whether it was captured on-device or uploaded,
      with nothing opened.
- [ ] `grid-lg` and `list` still read cleanly; no clipped or wrapped chips.
- [ ] A photo with no stage renders honest absence (quiet `—` / no chip), never a guessed default.

---

### S6 — Plane consolidation (the kill)

**Goal:** one primary home per verb. This is what justifies the four stages before it.

**Do**
- Demote or delete `PhotoContextMenu`. Preferred: **delete** it and its
  `photoMenuItems` builder (`PhotoLibraryPage.tsx:322-396`), plus the `ctxMenu` state at `:147`,
  the opener at `:656-659`, and the mount at `:689-696`. Right-click then falls back to the
  browser's native menu, which is what "Open image in new tab" already does better.
  - If any verb turns out to be genuinely faster by right-click at the bench, keep the menu as a
    **thin mirror** of the inspector's verb list built from the *same* topic spec — never a
    second hand-maintained array.
- Write the plane map into `.claude/rules/source-of-truth.md` as a Media Library row: which plane
  owns each verb, and that bulk stays on `PhotoLibraryToolbar`.
- **Do not touch** `PhotoContextPanel`, `PhotoViewerModal`, `PhotoLibraryToolbar`, or the picker
  modal (`MediaLibraryPicker*` — a defended fork with a live Zendesk-attach consumer).

**Gate**
- [ ] Every verb has exactly one primary home; the plane map in the SoT says which.
- [ ] `npx knip` reports no new orphans (deleted menu + builder fully removed, not stranded).
- [ ] Nothing under `src/components/shipped/photo-gallery/` changed —
      `git diff --stat -- src/components/shipped/photo-gallery/` is empty.

---

### S7 — Guards, SoT rows, and green

**Goal:** the architecture is enforced by tests, not by prose.

**Do**
- New guard `src/components/photos/photo-inspector.guard.test.ts`:
  - no `StationDisplaysPushStack` / `UnboxDisplaysActionFloor` / `StationDisplaysActionFloor`
    anywhere under `src/components/photos/`;
  - the panel is a `RightRailHost` occupant with the **stable** id `detail:photo`;
  - operator copy is **"Show inspector" / "Hide right panel"**, never "Open displays";
  - `⌘]` is **not** bound under `src/components/photos/` (that chord is the station Displays
    edge toggle; desk park is `⌘\` + bare `]`);
  - no second lightbox — nothing under `src/components/photos/` renders a viewer other than
    through `PhotoViewerPortal`.
- `.claude/rules/source-of-truth.md` — Media Library inspector row (host, occupant id, topics
  module, plane map).
- `.claude/rules/display/right-rail-inspector.md` — add the library to the consumer list.
- While here: that doc's L11 / L249 still describe desk `detail:order` as
  `DeskRailChromeRow` + `SectionTabsSlider density="icon"`, which contradicts L48–56 **and** the
  guard that bans `SectionTabsSlider` in `ShippedDetailsPanel`. Stale prose — correct it in the
  same pass.

**Gate**
- [ ] The four right-rail guards + the new photo guard all green.
- [ ] Scoped `tsc` clean.
- [ ] `npm run verify` green **except** the pre-existing `HeaderPinsSwitcher` failures — and if
      that other session has landed by then, fully green with no raised baselines.

---

## 4. Explicitly out of scope

Named so a later session does not read the omission as an oversight:

| Deferred | Why |
|---|---|
| **List → LedgerGrid** (C-LIST) | House law: table-engine fan-out dogfoods Unbox History first. The hand-rolled `PhotoListView` stays. |
| **Compare in library** (C-CMP) | Settled elsewhere as a centre-stage Unbox job; a library twin needs its own ROI. |
| **Listing-gallery curation** (C-GAL) | v2+; must not block the inspector. |
| **Share-pack management** (C-PACK) | Create exists; list/revoke/renew is a new API surface. |
| **Nav-keys `⌘;` region arm** (C-NAV) | Ask-first — the nav-key registry has one owner and adding a region is a registry change, not a page change. |
| **Per-scope counts in the rail** | Impossible client-side (the loaded stream is already scope-filtered); needs an aggregate endpoint. |
| **Picker/browse convergence** (D15) | `MediaLibraryPicker*` is a defended fork with a live consumer. |
| **D6–D15 of the brief** | The report ruled D1–D5 only. D6 (recency face) is answered by S3; the rest stay open and are **not** silently decided by this plan. |

---

## 5. Open risks

1. **The eviction rule is a guess about operator intent.** Clearing the rail when a filter drops
   the photo is the simplest honest rule, but an operator mid-triage may prefer the rail to stay
   open on a photo that left the view. Resolve at the S1 bench walk, not in review.
2. **`usePhotoSelection` semantics.** Selection persists across pages; the exactly-one signal must
   be read from the hook, not assumed.
3. **`StationArmedVerbList` region coupling** — see S4.
4. **`HeaderPinsSwitcher` collision.** That session is editing the saved-views/pins surface, which
   is also where D11 (saved views placement) would land. This plan deliberately does not touch
   saved views.
