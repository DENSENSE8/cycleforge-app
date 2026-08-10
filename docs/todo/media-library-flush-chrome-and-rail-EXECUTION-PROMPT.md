# Execution prompt — Media Library S1: flush chrome port + the rail actually displays

**Surface:** `/ops/photos` (Media Library — Workbench pick+edit)
**Stage:** S1 of [`media-library-desk-inspector-A3-PLAN.md`](media-library-desk-inspector-A3-PLAN.md)
**Prereqs:** S0 (ruling) and S0.5 (E2E baseline) are **DONE**. Do not redo them.
**Date:** 2026-08-09

You are porting `/ops/photos` onto the promoted chrome SoT and making the desk
inspector real. **No new features.** Three jobs, in this order.

---

## 0. Read first (do not skip — these are laws, not suggestions)

| Law | Where |
|---|---|
| Ops chrome is flush-square | `.claude/rules/source-of-truth.md` → **Workbench chrome flush** |
| Outer hosts flush, pad on the row | `.claude/rules/source-of-truth.md` → **Host vs content pad** |
| The right edge PUSHES, never floats | `.claude/rules/source-of-truth.md` → **Right-rail modality** |
| Desk inspector ≠ Station Displays (C2 waist) | `.claude/rules/display/right-rail-inspector.md` |
| One lightbox, ever | `.claude/rules/source-of-truth.md` → Photo gallery viewer |

**The tile click is settled and is not yours to change** (operator ruling
2026-08-09): click → fullscreen lightbox, exactly as today. The inspector is the
**n = 1 face of the selection plane**. This overrides the research report's D2.
The prior `PhotoInspectorPanel` was deleted precisely because it fought the
lightbox for that click — see the plan's §1 postmortem before you touch
`PhotoCard`.

---

## 1. Flush chrome port

`/ops/photos` carries **~34 soft-radius sites** on the library surface. Convert
them to `cornerClass('flush')` (`rounded-none`) and move host padding onto rows.

**In scope** — the library surface only:

```
src/components/photos/PhotoLibraryPage.tsx
src/components/photos/PhotoLibraryWorkspaceHeader.tsx
src/components/photos/PhotoLibraryHeader.tsx
src/components/photos/PhotoLibraryToolbar.tsx          (4 radius sites)
src/components/photos/PhotoLibraryFilterDropdown.tsx   (4)
src/components/photos/PhotoLibraryGrid.tsx             (1)
src/components/photos/PhotoDisplayControls.tsx
src/components/photos/PhotoGridDisplayControls.tsx     (1)
src/components/photos/PhotoDateBreadcrumb.tsx
src/components/photos/PhotoSortMenu.tsx                (1)
src/components/photos/PhotoThumb.tsx                   (1)
src/components/photos/PhotoLabelsSection.tsx           (1)
src/components/photos/PhotoLabelChips.tsx
src/components/photos/PhotoLibraryNasBackup.tsx        (1)
src/components/photos/MediaSavedViewsSection.tsx
src/components/photos/photo-library-controls.ts        (1)
src/components/photos/photo-library-grid/PhotoCard.tsx (5)
src/components/photos/photo-library-grid/PhotoListView.tsx    (2)
src/components/photos/photo-library-grid/PhotoGridStates.tsx  (2)
src/components/photos/photo-library-grid/PhotoTicketGrid.tsx  (1)
src/components/photos/photo-library-grid/SelectionMark.tsx    (1)
src/components/photos/photo-library-grid/GroupSelectionMark.tsx (1)
```

**OUT of scope — do not touch.** These are different surfaces and the diff noise
will hide your real change:

| File | Why |
|---|---|
| `ListingPhotoGallery.tsx` (8) | SKU/unit detail pages, not the library |
| `PublicSharePhotosPage.tsx` (2) | public share page, unauthenticated |
| `MediaLibraryPicker{Modal,Content,Folders}.tsx` (13) | the Zendesk-attach picker — a **defended fork** with a live consumer (`media-library-rail-card-HANDOFF.md`) |
| `src/components/shipped/photo-gallery/**` | shared lightbox SoT, ~18 consumers |

**Keep `rounded-full`** on status dots, avatars, and Switch tracks only.
`SelectionMark` / `GroupSelectionMark` are selection checkmarks — if they read as
a control rather than a status dot, they flush; if they are the Google-Photos
circle check, they keep `rounded-full`. **Decide once, in one place, and say
which in the PR.**

**Padding:** hosts go flush (`p-0` or a named sheet/rail token); readable pad
moves onto the row via `inset-field` / `inset-cozy` / `inset-chip`. Never stack a
raw `p-*` on top of an intent — both survive `cn()` and the intent wins in CSS
order, so the result is not what either says.

**Do not** hand-roll `rounded-none` strings — compose `cornerClass('flush')`.

---

## 2. Make the rail actually display

`RightRailHost` is **already mounted globally** (`ResponsiveLayout.tsx:402`) as
an in-flow flex sibling inside `<main>`. `/ops/photos` inherits it and has simply
never filled it — there is not one `useRegisterRightPanel` /
`DetailStackRailRegistrar` under `src/components/photos/`, and no photo occupant
id exists in `src/lib/right-rail/`. **Do not add a host. Do not touch
`ResponsiveLayout`.**

Build:

- `src/lib/photos/library-filter-state.ts` — add `photoId` to **display params**
  (`parsePhotoLibraryDisplayParams`, beside `view` / `page`), **never** to
  filters; it must not reach `buildLibraryWhere`. Replace the
  "deliberately no `?photoId=`" comment at `:526-537` with the eviction rule —
  do not delete it.
- **Do not add `photoId` to `MediaViewPayload`** (`useMediaLibrarySavedViews`).
  A saved view that reopened one photo is a bug.
- `src/hooks/usePhotoInspectorParam.ts` — compose `useOptimisticUrlParam`
  (`shareKey: 'photos:photoId'`). Model on `useLabelsHistoryIdParam.ts`, the
  cleanest existing consumer. Photos has no optimistic-param usage today and no
  entry in `src/lib/routing/route-params.ts` — add one.
- `src/components/photos/photo-inspector/PhotoInspectorPanel.tsx` — register via
  `DetailStackRailRegistrar`, **stable** id `detail:photo` (never
  `detail:photo:<id>` — a per-record id plays exit→empty→enter on every ↑↓ step),
  `modal={false}`. Leave `push` unset: it defaults `true`, which keeps the file
  off the `FLOAT_ONLY` allowlist in `right-rail-push.guard.test.ts`.
- Chrome: `DeskRailChromeRow` — `onClose`, `onPrev`/`onNext` over the loaded
  stream, `cursor` = `N / M`. **`↑` is previous, `↓` is next.** No contextual
  icons on this row.
- Body: one identity line. Deliberately thin — S2 fills it.

**Cardinality is the mode switch** (wire in `PhotoLibraryPage.tsx`):

| Selected | Surface |
|---|---|
| 0 | nothing |
| 1 | the rail (`?photoId=` written) |
| ≥ 2 | `PhotoLibraryToolbar`, rail closed and `?photoId=` cleared |

**Eviction rule:** `?photoId=` is written from selection and cleared with it. A
filter change that drops the photo from the loaded set clears the selection,
which closes the rail. One rule, no new concept.

**Watch for:** `usePhotoSelection` persists selection across pages — read an
exactly-one signal off the hook, do not assume the `Set` is filter-scoped. And
the rail must not fight `RightPaneOverlayHost` (`PhotoLibraryPage.tsx:571`),
which pins dialogs over the pane rect and is *not* the right rail.

**Operator copy is "Show inspector" / "Hide right panel"** — never "Open
displays". Chords are **⌘\\** and bare **]**, never **⌘]** (that is the Station
Displays edge toggle).

---

## 3. Modal inventory — rule every one, move none yet

`PhotoLibraryPage` mounts five overlays. **Author the decision table now**; the
mechanical moves land in S4, because a modal cannot move into a rail that has no
topic container (S2) and no commit surface (S3). Moving one early means building
a page-local body you delete two stages later.

| Line | Overlay | Kind | Ruling |
|---|---|---|---|
| 678 | `ZendeskClaimModal` | `RightPaneOverlay` | **→ rail leaf** (S4). It edits the selected photos — that is record work. |
| 690 | `PhotoContextMenu` | cursor dropdown | **→ deleted** (S6). Its 7 verbs become the rail's armed rows + action floor. |
| 699 | `PhotoLabelEditor` | centred `Dialog`, `sm:rounded-2xl` | **→ rail leaf** (S4). Keep the bulk-diff path for n ≥ 2 on the toolbar. |
| 706 | `MediaLibraryShortcutsModal` | `Dialog` (`?` help) | **STAYS a modal.** A keyboard cheat sheet is not a record surface and has no place in a record inspector. |
| — | `PhotoViewerModal` (lightbox) | immersive viewer | **STAYS.** Ruled 2026-08-09; it owns the tile click. |

Also: a **blocking destructive confirm stays modal** — house law reserves modal
for surfaces that genuinely block until dismissed. Delete is a floor button that
arms, not a rail leaf.

In S1 you only: write this table into the plan, and flush
`PhotoLabelEditor`'s `sm:rounded-2xl` as part of job 1.

---

## 4. Acceptance

**Dogfood walk** on the running server at `http://localhost:3050/ops/photos`
(QA org). **Never start, restart, or kill that server.**

- [ ] No soft-radius chrome remains on the library surface — tabs, filter
      popover, sort menu, toolbar, tiles, empty states all read flush-square.
- [ ] No host gutter: the grid and chrome sit flush against the left context
      rail, no decorative outer margin between columns.
- [ ] `rounded-full` survives only on status dots / avatars / Switch tracks.
- [ ] Click a tile → the **fullscreen lightbox** opens, unchanged.
- [ ] Select one photo → the rail **pushes**; the grid narrows and reflows
      beside it. Nothing floats over the tiles; no scrim.
- [ ] URL gains `?photoId=…`; reload restores the same photo.
- [ ] `↑` / `↓` step records, content swapping in place — no blank frame.
- [ ] Select a second photo → rail closes, bulk toolbar appears. Untick → rail
      returns.
- [ ] Change a filter so the open photo leaves the set → selection clears, param
      clears, rail closes.
- [ ] The center never drops below `MIN_WORK_SURFACE_PX`; the left context rail
      does **not** auto-close to make room.

**Automated:**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "photos|qa-org|right-rail"
npx tsx --test src/components/right-rail/right-rail-push.guard.test.ts src/components/right-rail/right-rail-inspector-header.guard.test.ts
npx playwright test tests/e2e/photos-library-deep-link.spec.ts --project=qa-desktop
```

- [ ] `tsc` clean for photos / right-rail files. **The repo-wide run is red from
      other sessions** (CSV import staging, and historically `HeaderPinsSwitcher`)
      — do not fix or inherit those; report which are pre-existing.
- [ ] Add `PhotoInspectorPanel.tsx` to `DESK_RAIL_CHROME_ROW_GOLDEN`
      (`right-rail-inspector-header.guard.test.ts:59-66`); green.
- [ ] `right-rail-push.guard.test.ts` green with **no** new `FLOAT_ONLY` entry.
- [ ] **`photos-library-deep-link.spec.ts` still 6/6** — it was green before you
      started (~18s), and it is the regression net for the URL contract you are
      about to extend. If it goes red, you changed routing, not chrome.

---

## 5. Hard bans

- Mounting `StationDisplaysPushStack` or `UnboxDisplaysActionFloor` here.
- Calling the rail "Displays", or binding ⌘] for it.
- A floating / modal inspector over the grid.
- A second lightbox, or any photo viewer not reached through `PhotoViewerPortal`.
- Touching `PhotoContextPanel` or anything under `shipped/photo-gallery/` — it
  is the shared lightbox drawer with ~18 consumers and a guard that reads its
  source file.
- Deleting `PhotoLibraryToolbar` or its actions — it has **zero** single-asset
  actions and is already correctly specialized for bulk.
- Raising a DS ratchet baseline, or `--no-verify`.
- Restoring the Year→Week folder landing, or the retired `PhotoInspectorPanel`
  shape (facts-only, owning the tile click).
