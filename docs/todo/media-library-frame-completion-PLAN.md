# PLAN — Media Library: breadcrumb to the footer, search on the row, a real CTA

**Written:** 2026-09-01 · **Branch:** `main` · **Status:** plan of record, not started
**Composes (do not fork):** `DeskPageChrome` (`@/design-system/components`) · `TableStatusBar` · `SearchField` · `DeskActionSlot`
**Follows:** the Media Library frame port (`daeb2ba13`) — tabs + media-type cube moved to the frame's tab row

Operator direction (2026-09-01): *"port over the breadcrumb to the bottom of the
table display footer and have a search inline with the row itself. and have a
CTA for adding photos and importing exporting in bulk."*

Read `CLAUDE.md` first — `design-mcp` (`ds_contract` · `ds_tokens` · `ds_critique`)
is mandatory before any UI code here.

---

## 1. What exists today, measured

| Piece | File | Lines | Fate |
|---|---|---|---|
| Page host + chrome stack | `src/components/photos/PhotoLibraryPage.tsx` | 903 | edit |
| Path strip (breadcrumb · count · display controls) | `PhotoLibraryHeader.tsx` | 88 | **split** — breadcrumb leaves, controls stay |
| The breadcrumb itself | `PhotoDateBreadcrumb.tsx` | 164 | move, unchanged |
| Display controls (density · view · refresh · select) | `PhotoDisplayControls.tsx` | 163 | keep, re-host |
| Scope tabs + media-type cube | `PhotoLibraryScopeBand.tsx` | 349 | **done** — already on the frame |
| The stream | `PhotoLibraryGrid.tsx` | — | untouched |
| Filter popover | `PhotoLibraryFilterDropdown.tsx` | — | keep, re-host |
| Saved views | `MediaViewsMenu.tsx` · `MediaSavedViewsSection.tsx` | — | keep, re-host |
| URL state | `hooks/usePhotoLibraryUrlState.ts` · `lib/photos/library-filter-state.ts` | — | **SoT, do not fork** |

**Chrome today** (after the frame port) is two bands inside
`DashboardScrollShell`'s `chrome` slot:

```text
┌ frame: Media                                            [ no CTA ]  ┐
│ Unboxing · Packing · Testing · Shipping · … (+ ▦ type cube)         │  tab row
│ ┌───────────────────────────── card ─────────────────────────────┐  │
│ │ ‹breadcrumb›  6 photos          [density][view][refresh][select]│  │  ← Band 2
│ │ ───────────────────────────── the tile stream ───────────────── │  │
│ │                    End of results · 48 photos                   │  │
│ └────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

### 1.1 The search field currently has no home

`poFinder` / `poFinderKind` — "the unified PO-photo finder" — is described in
`library-filter-state.ts` as *"the core search-first job of the surface"*, and
its docblock says it is **"fed by the sidebar search's field-scope"**. That
sidebar was deleted on 2026-08-09 when `/ops/photos` went rail-less. The param
survived; its input did not. **Search is currently reachable only by URL.**

That is the strongest single argument in this plan: this is not a relocation,
it is restoring the surface's primary job.

---

## 2. The three moves

### 2.1 Breadcrumb → the footer

**Why the footer is right, and why it is right *now*.** `TableStatusBar`'s left
half was the page-mode tab strip until 2026-08-31, when page modes moved to
`DeskPageChrome`'s top row. That half is **empty product-wide**. Its right half
already prints shown / total / selected — a context readout. A date/folder path
is the same kind of fact: *where am I in this archive*, not *what can I do*.

`PhotoLibraryHeader`'s own docblock already concedes the altitude problem — it
says the path strip sits where a KPI band would, "and the divergence is
deliberate". With the footer's left half free, the divergence stops being
necessary.

```text
│ ‹ Aug 2026 › ‹ Aug 29 › ‹ PO-4471 ›            6 shown · 48 total · 2 sel  │
```

The `metaLine` count (`photo-library-meta`) **merges into the footer's existing
count** rather than riding along beside it. Two counts on one row saying the
same number in different words is what the end-of-stream footer already had to
be talked out of (`PhotoLibraryPage.tsx` — *"it used to read `Photos 48` — the
same count the path strip already shows"*).

**Do not** reimplement the strip. Media has no `DataTable`, so it mounts
`TableStatusBar` directly — the component's docblock already sanctions exactly
this: *"the station desks also mount `StationListTable`… Both need the SAME
strip, and two copies of it is how the display layer forked the last time."*

`TableStatusBar` needs one additive prop: **`lead?: ReactNode`** for the vacated
left half. Same fence as `tabsLead` — a context readout, never an action.

### 2.2 Search → inline on the card's toolbar row

The card gains **one toolbar row**, the same shape every `DataTable` draws:

```text
│ ⌕ Find by order # / tracking / serial…   [scope ▾] [filter] [views] ⤢ │
```

- **Find field left** — `SearchField` from `@/design-system/primitives`, the same
  primitive `DataTable`'s toolbar uses. Writes `poFinder`.
- **Scope selector** — `poFinderKind` (`any` · `po` · `tracking` · `serial`). It
  is *part of the find field*, not a filter: it changes how the typed value is
  read. Render it as the field's own leading affordance, not a separate cell —
  `PhotoSearchField`/`finderKindForField` already model the mapping.
- **Filter** → the existing `PhotoLibraryFilterDropdown`.
- **Views** → the existing `MediaViewsMenu`.
- **⤢** → `DataTableFullscreenToggle`. It renders nothing off a desk stage and
  the frame now provides one, so Media gets fullscreen for free.

**`PhotoDisplayControls` moves here too** (density · view · refresh · select).
Band 2 then has nothing left and is **deleted** — that is the point. The card
goes back to one chrome row, which is what the frame was for.

### 2.3 The CTA — one primary, one overflow

The frame's `addSlot` is empty today, and `PhotoLibraryScopeBand`'s docblock
defends that: *"this surface has no import / add CTA, and honest absence beats
an invented one."* That sentence expires here — the operator is asking for the
action, so it stops being invented.

```text
Media                                        [ Add photos ]  [ ⋯ ]
```

| Control | Does | Endpoint (exists today) |
|---|---|---|
| **Add photos** (primary) | File picker → upload into the active scope/folder | `POST /api/photos/upload` |
| ⋯ → Export selection (zip) | Bulk download of the checked set, else the current window | `GET /api/photos/download-zip` |
| ⋯ → Mirror to NAS | Bulk archive | `/api/photos/nas-backup` |
| ⋯ → Mirror to Drive | Bulk archive | `/api/photos/drive-backup` |
| ⋯ → Share pack | Tokenised external bundle | `/api/photos/share-packs` |

**One primary plus an overflow, not four buttons.** This repo has already ruled
on the shouted row: `ChromeCheckButton` went icon-only because *"the word CHECK
in condensed uppercase next to UNBOX next to ADD read as a shouted row of
three."* Bulk verbs are also rare and destructive-adjacent; a menu is the
correct altitude, and it keeps the header to one visual weight.

**Add photos uploads into the current scope.** The tab and breadcrumb already
say where the operator is; an upload that ignores that context and lands
everything in an unsorted bucket makes the scope a lie.

---

## 3. Phases

### Phase 1 — `TableStatusBar` grows a `lead` slot
Additive prop + pin + smoke assertion, mirroring `tabsLead`. No consumer
changes. Ships alone and green.

### Phase 2 — the footer
Mount `TableStatusBar` at the foot of the card with `lead={<PhotoDateBreadcrumb …/>}`,
`shown` / `total` / `selected` wired from the existing query + selection state.
Delete the `metaLine` span. Keep the end-of-stream line — it answers "there is
no more to load", which a count does not.

### Phase 3 — the toolbar row
New `PhotoLibraryToolbar` composing `SearchField` + scope + filter + views +
display controls + `DataTableFullscreenToggle`. Wire `poFinder` /
`poFinderKind` through `usePhotoLibraryUrlState` — **no second writer**. Delete
`PhotoLibraryHeader` once its controls have moved.

### Phase 4 — the CTA
`PhotoLibraryDeskActions` registering into `DeskActionSlotRegistrar`: primary
**Add photos**, overflow for the four bulk verbs. Upload posts with the active
scope/folder. Confirm before any destructive-adjacent bulk action.

### Phase 5 — verify
`npm run verify` · `node tools/design-mcp/smoke.mjs` ·
`tests/e2e/photos-railless-frame.spec.ts` (asserts the ≥784px work surface —
the toolbar and footer must not re-narrow it).

---

## 4. Anti-goals

| Do not | Because |
|---|---|
| Fork `TableStatusBar` or `SearchField` for Media | Two copies of the strip is the fork its own docblock names |
| Add a second writer of `poFinder` | The 2026-07-29 two-writer bug on this exact surface |
| Put bulk verbs in the header as peer buttons | The shouted-row ruling; and they are rare, not primary |
| Keep `metaLine` beside the footer count | Two readouts, one number, different words |
| Let the breadcrumb become navigation chrome | It is a readout in the footer; the tab row is the navigation |
| Re-introduce a band under selection | Bands stay mounted (2026-08-09); bulk verbs are armed rows on the right edge |
| Upload outside the active scope | Makes the tab and breadcrumb lie |

---

## 5. Open questions for the operator

1. **Does the breadcrumb stay clickable in the footer?** It is a navigator today
   (each crumb patches the date window). In the footer it reads as a readout.
   Recommendation: **keep it clickable** — it is the cheapest way back up the
   date tree, and the footer is one glance away. But a clickable control in a
   readout strip is a small altitude break worth naming.
2. **Export scope when nothing is selected** — the current window, or refuse?
   Recommendation: export the window and say so in the menu item
   ("Export 48 in view"), because a disabled item teaches nothing.
3. **Is `select` still a display control** once bulk export exists? It arms the
   selection the export consumes, so it may belong beside the CTA rather than in
   the toolbar's display group.
