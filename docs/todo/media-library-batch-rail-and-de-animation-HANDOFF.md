# Handoff — Media Library: one predictable DS (no animation) + the bulk bar as right-rail rows

**Surface:** `/ops/photos` (Media Library)
**Continues:** [`media-library-desk-inspector-A3-PLAN.md`](media-library-desk-inspector-A3-PLAN.md) — after S1.5
(the rail-less three-band chrome, shipped and green).
**Date:** 2026-08-09
**Operator direction this executes:** *"remove all the animations so it functions under one DS that's
predictable"* + *"this top action bar must be ported over to the right panel display in rows just like the
Unbox SoT right rail"* + **"the delete button must always live in the bottom-right icons display, just like
the SoT right rail in Unbox mode."**

---

> ## ✅ CLOSED — 2026-08-10
>
> §2–§5 are done. What landed, and the two decisions this handoff left open:
>
> - **Delete moved to the floor.** `PhotoBatchInspectorPanel` mounts
>   `InspectorActionFloor` with `InspectorFlushDelete` (+ `FLOOR_DELETE_PEER_CLASS`) as a
>   `shrink-0` sibling after the scroll body; the `delete` verb row, `deleteArmed` /
>   `deleting` / `handleDelete` / `DELETE_ARM_MS` / the disarm effect and `BatchRow.danger`
>   are all gone — the control owns arm-then-confirm itself.
> - **§2.3.3 answered: (a), Delete alone.** Same shape `BinDetailFlyout` · `SkuDetailView` ·
>   `RepairDetailsPanel` already ship. **Consequence to know:** with one peer the spread floor
>   gives Delete the whole 419px column, so it reads as a bottom *bar* with a centred trash
>   rather than the far-right cell of Unbox's five-icon row. Adding a second icon verb is what
>   makes "far right" literal — the E2E therefore asserts **trailing = last peer**, which
>   stays true either way, rather than a gap that is trivially 0 today.
> - **§2.4 answered by the operator: keep the pulse OFF.** The armed face composes the shared
>   chevron + track tokens without `ARMED_CURSOR_MARKER_PULSE_CLASS`; recorded as a deliberate
>   divergence from the Unbox golden in `display/media-library.md` and pinned by a guard.
> - **Guards:** `media-library-chrome.guard.test.ts` 9/9 (Delete-on-floor · no motion / no
>   `layoutId` across the whole photos dir · pulse off), and the panel joined
>   `DESK_FLOOR_CONSUMERS` + `DESK_RAIL_CHROME_ROW_GOLDEN`. Right-rail guards 33/33.
> - **E2E:** three batch tests added to `photos-railless-frame.spec.ts`; the three photo specs
>   run **21 passed** on `qa-desktop`. `photos-inspector-walk.spec.ts`'s stale "bulk toolbar"
>   naming was corrected to the batch rail.
> - **Docs:** `display/media-library.md` (planes · rail-vs-toolbar · no-motion · Delete floor ·
>   modules · guards), `source-of-truth.md` Media Library row, a dated amendment at the top of
>   the A3 plan (original kept as evidence), and `PhotoInspectorPanel`'s docblock.
>
> Everything below is the original brief, kept verbatim.

---

## 0. State at handoff — what is green, and what is half-done

**Green, verified, do not redo:**

| Gate | Result |
|---|---|
| `npx tsc --noEmit -p tsconfig.json` | clean |
| `npx tsx --test src/components/photos/media-library-chrome.guard.test.ts` | 6/6 |
| `photos-library-deep-link` · `photos-inspector-walk` · `photos-railless-frame` | 18/18 (`--project=qa-desktop`) |
| `npm run verify` | PASSED as of the S1.5 close (re-run before you call this done) |

**Shipped in this pass:**

1. **The surface no longer animates.** `PhotoThumb` was the only framer consumer under
   `src/components/photos/`; it is now a plain `div`. Gone: the `layoutId` hero morph paired with
   `PhotoViewerModal`, its `z-index` bump + `onLayoutAnimationStart/Complete`, the 500ms
   `transition-opacity` fade-in, and the pulsing gradient placeholder. `heroId` is off the prop type and
   both call sites (`PhotoCard`, `PhotoListView`) dropped `photoHeroLayoutId`. `PhotoGridSkeleton` and the
   `PhotoSortMenu` chevron are static.
2. **The bulk toolbar is deleted.** `PhotoLibraryToolbar.tsx` is gone; the three chrome bands now stay
   mounted under selection instead of being swapped out.
3. **`PhotoBatchInspectorPanel`** (`src/components/photos/photo-inspector/PhotoBatchInspectorPanel.tsx`) is
   the n ≠ 1 face of the right-edge slot — occupant `detail:photo-batch`, armed rows over
   `useArmedCursorList` + `armed-cursor-face`, mutually exclusive with `detail:photo` by construction
   (`showBatchRail = selectionActive && inspectorPhoto === null` — the toolbar's own predicate, unchanged,
   so the zero-selected "Select all 48" entry state moved with the verbs rather than being dropped).

**Half-done — this is the work:**

> **Delete is currently a ROW in that list. It must not be.** House law puts a destructive verb on the
> **bottom action floor, flush trailing, far-right** — never in the verb list beside its peers. §2 is the fix.

Also not yet done: the batch rail has **no guard coverage and no E2E**, and neither
`.claude/rules/display/media-library.md` nor the A3 plan mentions it. §3–§5.

---

## 1. Why the animations went (so nobody re-adds them)

Recorded in `PhotoThumb`'s own docblock; repeated here because it is the reasoning, not the diff:

- **`layoutId` for list → detail is banned** (`display/motion-crossfade.md`): opening the viewer is a
  *replace*, not a *move*, and shared-layout there produces a morphing artifact rather than continuity.
- **It leaked geometry into three unrelated files.** The morph's projected box overshot the tile's grid
  cell, so `PhotoThumb` raised `z-index` for the duration, `PhotoCard` had to refuse `overflow-hidden`, and
  the page's sheet plane had to refuse `TABLE_SURFACE_SHEET_CLASS`. Three files carrying a constraint for
  one animation.
- **A 500ms fade on a contact sheet is 48 fades.** At library density the stagger reads as the page failing
  to settle.

**What deliberately stayed, and why removing it would be the fork:**

| Kept | Reason |
|---|---|
| `Loader2 … animate-spin` | The house async SoT is *"Loading = spinner + text"* (`ui-design-system.md`). Removing it leaves no loading affordance at all. |
| `transition-colors` on hover | *"Hover is `transition-colors` and nothing else"* (`source-of-truth.md` → MasterNav row hover/press travel). It is the house answer, not a flourish. |
| `ARMED_CURSOR_MARKER_PULSE_CLASS` on Unbox's own list | Shared Displays token whose docblock bans a page-local twin. **The new batch rail composes the armed face WITHOUT the pulse** — see §2.4 if you want them to match. |

`PhotoViewerModal` (`shipped/photo-gallery/**`, ~18 consumers) was **not touched** — hard ban. Its
`heroLayoutId` is now a lone `layoutId` with no partner, which is inert.

---

## 2. THE WORK — Delete moves to the bottom-right action floor

### 2.1 The rule

`.claude/rules/display/right-rail-inspector.md` → *Workbench inspector action floor*:

> icons-first ONE row — `⋯` overflow leading · icon verbs · **flush trailing `InspectorFlushDelete` child**
> far-right. **Never a labelled `actions` cluster.** Park / close chrome stays on the top
> `DeskRailChromeRow`, never in this floor.

And `source-of-truth.md` → *Displays vs inspector*: the record's edit gravity is the bottom dock, so
*"the top chrome row stays navigation-only so a Park never sits beside a Delete."*

The Unbox twin the operator named is `StationDisplaysActionFloor` (`UnboxDisplaysActionFloor` — More · Zoho
Refresh · Print · Edit · **Delete far bottom-right**). **Do not import that one here** — it is the Station
half. `/ops/photos` is a desk `RightRailHost` occupant, so the desk half is `InspectorActionFloor`, which is
the same display method with the same anatomy.

### 2.2 The golden to copy, verbatim

`src/components/receiving/history/HistoryCartonTriagePanel.tsx:724` —

```tsx
<InspectorActionFloor>
  <FloorOverflowButton items={…} data-testid="history-triage-more" />
  <FloorIconButton icon={<Printer />} label="Print" onClick={…} data-testid="history-triage-print" />
  <FloorIconButton icon={<Pencil />} label={editLabel} onClick={…} busy={opening} … />
  <InspectorFlushDelete onConfirm={handleDelete} className={FLOOR_DELETE_PEER_CLASS} data-testid="…" />
</InspectorActionFloor>
```

Imports: `@/components/right-rail/InspectorActionFloor` (`InspectorActionFloor`, `FloorIconButton`,
`FloorOverflowButton`, `FLOOR_DELETE_PEER_CLASS`) and `@/components/right-rail/InspectorFlushDelete`.

### 2.3 Edits to `PhotoBatchInspectorPanel.tsx`

1. **Delete the `delete` entry from `batchRows`** — the whole `if (onDeleteSelected && count > 0)` block,
   plus `deleteArmed` / `deleting` / `handleDelete` / `DELETE_ARM_MS` / the disarm `useEffect` and the
   `danger` field on `BatchRow` if nothing else uses it. `InspectorFlushDelete` owns arm-then-confirm
   itself (uncontrolled `onConfirm`), so all of that state is duplicated logic once the floor lands.
2. **Add the floor** as a `shrink-0` sibling *after* the scroll body, inside the panel's
   `flex h-full min-h-0 flex-col` root — so it sits on the true column bottom:

   ```tsx
   <div className="min-h-0 flex-1 overflow-y-auto"> …count + armed rows… </div>
   <InspectorActionFloor>
     …optional icon verbs…
     <InspectorFlushDelete
       onConfirm={() => onDeleteSelected?.(rows)}
       label={`Delete ${shownCount}`}
       disabled={!onDeleteSelected || count === 0}
       className={FLOOR_DELETE_PEER_CLASS}
       data-testid="photo-batch-delete"
     />
   </InspectorActionFloor>
   ```

3. **Decide what else joins Delete on the floor, and write the choice down.** Two defensible answers:
   - **(a) Delete alone** — every other bulk verb stays an armed row. Smallest change, and it keeps the
     rows as the one place a verb is read.
   - **(b) The destructive + terminal pair** — Delete plus the one verb an operator reaches for without
     looking (Download). Closer to the Unbox floor's shape.

   **Recommended: (a).** The Unbox floor carries five icons because that station has five carton-scoped
   commits; this rail's verbs are a *set* operation on a selection, and they already read better as named
   rows. Delete is on the floor because it is destructive, not because floors are where verbs go.
4. **Do not put close / clear-selection on the floor.** `DeskRailChromeRow`'s `→|` already owns dismiss
   (`onClose={onClear}`), and the law is explicit that park never sits beside a delete.

### 2.4 One open question for the operator (do not decide silently)

The Unbox armed rows pulse their `>` chevron + bottom track while armed
(`ARMED_CURSOR_MARKER_PULSE_CLASS`, reduced-motion-gated in JS). The new batch rail composes the same face
**without** the pulse, because this pass was "remove all the animations".

That is a deliberate, recorded divergence from the Unbox golden the operator asked to match. Either is
defensible — **ask before flipping it**, and whichever way it goes, say so in
`.claude/rules/display/media-library.md`.

---

## 3. Guard coverage to add

Extend `src/components/photos/media-library-chrome.guard.test.ts` (it is already 6/6 — add to it, do not
fork a second guard):

```ts
it('the batch rail puts Delete on the action floor, never in the verb rows', () => {
  const src = readFileSync(join(PHOTOS_DIR, 'photo-inspector/PhotoBatchInspectorPanel.tsx'), 'utf8');
  assert.ok(src.includes('InspectorActionFloor'), 'batch rail must mount the desk action floor');
  assert.ok(src.includes('InspectorFlushDelete'), 'Delete is the flush trailing floor child');
  assert.ok(!/id: 'delete'/.test(src), 'Delete must not be an armed verb row');
  assert.ok(
    !/StationDisplaysActionFloor|UnboxDisplaysActionFloor/.test(src),
    'that is the Station floor — a desk RightRailHost occupant composes InspectorActionFloor',
  );
});

it('the surface imports no motion', () => {
  for (const { rel, src } of PHOTO_SOURCES) {
    assert.ok(
      !/@\/design-system\/motion|motion-framer|framerPresence|framerTransition|motionRole/.test(src),
      `${rel} imports motion — /ops/photos runs on one predictable DS (2026-08-09)`,
    );
  }
});
```

**Watch out:** the motion assertion will fail on `MediaLibraryPicker*` / `ListingPhotoGallery` /
`PublicSharePhotosPage` if any of them animate — those are **out of scope** for this surface (the picker is
a defended fork with a live Zendesk consumer). Scope the walk to the library's own files, or allowlist
them by name with a stated reason, shrink-only.

Also add `PhotoBatchInspectorPanel.tsx` to:
- `DESK_FLOOR_CONSUMERS` in `src/components/right-rail/inspector-action-floor.guard.test.ts`
- `DESK_RAIL_CHROME_ROW_GOLDEN` in `right-rail-inspector-header.guard.test.ts` (it composes the row)

and confirm `right-rail-push.guard.test.ts` stays green with **no** new `FLOAT_ONLY` entry (`push` is left
unset, which defaults `true`).

---

## 4. E2E to add — `tests/e2e/photos-railless-frame.spec.ts`

The batch rail has none. Add to the existing spec (same file, same QA-org discipline):

```ts
test('two selected opens the batch rail, not a chrome toolbar', async ({ page }) => {
  // tick two tiles via the hover checkmark (aria-pressed, never the label —
  // the mark's accessible name flips once selected)
  await expect(page.getByTestId('photo-batch-inspector-panel')).toBeVisible();
  await expect(page.getByTestId('photo-batch-count')).toHaveText(/2 selected/);
  // The chrome bands SURVIVE the selection — this is the whole point.
  await expect(page.getByTestId('photo-media-types')).toBeVisible();
  // Delete is on the floor, at the far right, and arms before it commits.
  await expect(page.getByTestId('photo-batch-delete')).toBeVisible();
});

test('↑↓ walks the batch verbs and Enter commits', async ({ page }) => { … });
```

Selection helper: copy `toggleTile` from `photos-inspector-walk.spec.ts:44` — it hovers the card and clicks
`button[aria-pressed]`, and the comment there explains why matching on the label silently stops working.

**Do not assert a real Delete** against the QA org — arm it and assert the confirm face, then press Escape.

---

## 5. Docs to update

1. **`.claude/rules/display/media-library.md`** — it currently says *"select ≥2 = bulk toolbar
   (`PhotoLibraryToolbar`)"* in the **Planes** table and in the `source-of-truth.md` row. Both are now
   wrong. Replace with the batch rail, and add:
   - the surface runs **no motion** (with the three reasons from §1, and the two things that stayed);
   - Delete lives on the bottom-right action floor, never as a verb row;
   - the armed-row waist is `useArmedCursorList` + `armed-cursor-face`, composed as the **hook**, not
     `StationArmedVerbList` — that component hardwires `useNavRegion({ id: 'right' })` and
     `isKeyboardRegion('right')`, which are Station keyboard-region concerns, and `⌘;` region arm on this
     surface is **ask-first** (A3 → C-NAV).
2. **`.claude/rules/source-of-truth.md`** — the Media Library display row says `select ≥2 = bulk toolbar`.
   Same correction.
3. **A3 plan** (`media-library-desk-inspector-A3-PLAN.md`) — its S1 modal table and stage map still assume
   the toolbar exists (*"≥2 hands the chrome slot to the bulk toolbar"*). Add a dated note; do not delete
   the original, it is the evidence.
4. **`PhotoInspectorPanel.tsx`'s docblock** — line 13 still says *"Two or more hands the chrome slot back to
   `PhotoLibraryToolbar` (bulk)"*. That component no longer exists.

---

## 6. Hard bans

- **Delete as an armed verb row**, or a full-width red delete button. It is the flush trailing floor child.
- `StationDisplaysActionFloor` / `UnboxDisplaysActionFloor` on this rail — that is the Station half.
- A labelled `actions` cluster on `InspectorActionFloor` (the legacy path is deleted).
- Close / clear-selection on the floor — dismiss is `DeskRailChromeRow`'s `→|`.
- Re-introducing a chrome band that swaps out Bands 1–3 on selection.
- Re-introducing `layoutId` / `motion.*` under `src/components/photos/`.
- Touching `shipped/photo-gallery/**`, `MediaLibraryPicker*`, or the lightbox.
- A per-selection occupant id (`detail:photo-batch:<n>`) — it would play exit → empty → enter on every
  tick, which is the loop this rail exists for.
- Porting the stream to `LedgerGrid` (deferred — Unbox History dogfoods first).
- Raising a DS ratchet baseline, or `--no-verify`.

---

## 7. Acceptance

```bash
npx tsc --noEmit -p tsconfig.json
npx tsx --test src/components/photos/media-library-chrome.guard.test.ts
npx tsx --test src/components/right-rail/inspector-action-floor.guard.test.ts \
                src/components/right-rail/right-rail-inspector-header.guard.test.ts \
                src/components/right-rail/right-rail-push.guard.test.ts
npx knip
npm run verify
npx playwright test tests/e2e/photos-library-deep-link.spec.ts \
                    tests/e2e/photos-inspector-walk.spec.ts \
                    tests/e2e/photos-railless-frame.spec.ts --project=qa-desktop
```

- [ ] `npm run verify` green, **no raised baselines**.
- [ ] The three photo specs stay at 18 passed, plus the new batch tests.
- [ ] Dogfood on the already-running `http://localhost:3050/ops/photos` — **never start, restart or kill
      that server**; drive it with Playwright + `tests/.auth/qa-admin.json`, as S1/S1.5 did.
- [ ] Tick two photos: the rail pushes in, the three chrome bands stay put, verbs read as named rows, and
      Delete sits alone on a bottom row at the far right.
- [ ] ↑↓ walks the rows, Enter commits in the same frame (no marker withhold).
- [ ] Nothing on the surface animates except the loading spinner.

---

## 8. Notes for whoever picks this up

- **The tree has another session in it.** During S1.5, `library-filter-state.ts` briefly lost
  `OUTBOUND_DOCUMENT_TYPE_LABELS` and `ShippingScanBand.tsx` carried three TS errors that were not mine.
  Run the failing gate against your own files before inheriting a red.
- **One stray QA-org row** was created verifying the media-type create path: `s15-walk-295389`.
- **`PhotoLibraryToolbar.tsx` is deleted, not orphaned** — `git rm`'d, and `knip` was clean at the S1.5
  close. Re-run it after your changes; the batch rail's props were lifted from the toolbar's, so a leftover
  type or helper is the likely stranding.
