# PLAN — Media Library: breadcrumb to the footer, search on the row, a real CTA

**Written:** 2026-09-01 · **Branch:** `main` · **Status:** plan of record — decisions locked 2026-09-01
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
| Path strip (breadcrumb · count · display controls) | `PhotoLibraryHeader.tsx` | 88 | **delete** — breadcrumb → footer, controls → find row |
| The breadcrumb itself | `PhotoDateBreadcrumb.tsx` | 164 | move to footer `lead`, clickable ancestors kept |
| Display controls (density · view · refresh · select) | `PhotoDisplayControls.tsx` | 163 | keep, re-host on find row; select must toggle |
| Scope tabs + media-type cube | `PhotoLibraryScopeBand.tsx` | 349 | **done** — already on the frame |
| The stream | `PhotoLibraryGrid.tsx` | — | untouched |
| Filter popover | `PhotoLibraryFilterDropdown.tsx` | — | keep, re-host |
| Saved views | `MediaViewsMenu.tsx` · `MediaSavedViewsSection.tsx` | — | keep, re-host |
| URL state | `hooks/usePhotoLibraryUrlState.ts` · `lib/photos/library-filter-state.ts` | — | **SoT, do not fork** |

**Chrome today** (after the frame port) is one band inside
`DashboardScrollShell`'s `chrome` slot (Band 1 / `PhotoLibraryWorkspaceHeader`
is already gone — comments still name it):

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

## 2. The three moves (decisions locked)

### 2.1 Breadcrumb → the footer (`lead` on `TableStatusBar`)

**Correction:** the footer left is **not** empty product-wide. After
2026-08-31, `TableStatusBar` is **selection verbs left, counts right**. Labels
still parks sub-mode tabs there; DataTable paints Assign/Copy when a selection
exists. The empty spacer is only the idle state of surfaces that pass neither.

So `lead` is an **idle-left readout** for surfaces that do not put verbs on this
bar. Media can use it because bulk verbs already live on
`PhotoBatchInspectorPanel` (2026-08-09: bands stay mounted; verbs are the
right-edge rail).

**Precedence (Phase 1 fence — write it on the prop):**

`selectionActions` (and legacy Copy) beat `tabs` beat `lead` beat empty spacer.

Never paint `lead` beside pill CTAs. Never grow `lead` into actions.
Path-contraction crumbs are the one allowed exception, and they stay
caption-weight `ds-raw-button`, not `Button`.

`lead` is **not** `tabsLead`. `tabsLead` belongs to `DeskPageChrome` (Media
already uses it for the type cube). Same *idea* of a readout slot; different
component.

```text
│ All dates › Aug 2026 › Aug 29 › PO-4471          48 of 48 · 2 selected │
```

The `metaLine` count (`photo-library-meta`) **merges into the footer's existing
count** rather than riding along beside it. Keep the end-of-stream line — it
answers "there is no more to load", which a count does not.

**Breadcrumb stays clickable — ancestor crumbs only.** Keep
`PhotoDateBreadcrumb` as-is: All dates / ancestor range buttons patch the date
window and clear the entity leaf; the current crumb is already `disabled`; the
folder leaf is already a `<span>`. That is path contraction, not page
navigation (Unboxing · Packing · … on the frame). Today / Latest move with the
component as its empty state.

Media has no `DataTable`, so it mounts `TableStatusBar` directly — the
component's docblock already sanctions exactly this.

### 2.2 Search → inline on the card's find row

The card gains **one find row**, the same shape every `DataTable` draws:

```text
│ ⌕ Find by order # / tracking / serial…   [filter] [views] … ⤢ │
```

- **Find field left** — `SearchField` from `@/design-system/primitives`. Writes
  `poFinder` through `usePhotoLibraryUrlState` — **no second writer**.
- **Find kind inside the field** — `poFinderKind` via `SearchField`'s
  `onLeadingAction` (search-by picker). Not a separate `[scope ▾]` cell.
  `finderKindForField` / `fieldForFinderKind` already model the mapping.
- **Filter** → existing `PhotoLibraryFilterDropdown`.
- **Views** → existing `MediaViewsMenu`.
- **Display controls** → `PhotoDisplayControls` (density · view · refresh ·
  select). **Select stays here** — it changes how tiles behave, not what the
  page creates. Fix the toggle lie: tooltip says "Done selecting" but the page
  currently only `setSelectMode(true)`.
- **⤢** → `DataTableFullscreenToggle` (free once the frame provides a desk
  stage).

**Do not** name the new row `PhotoLibraryToolbar` — that name was the
selection-swap band the batch rail replaced. Band 2 / `PhotoLibraryHeader` is
deleted once its pieces move.

### 2.3 The CTA — primary Add + overall Download (no ⋯)

```text
Media                              [ Download 48 ]  [ Add photos ]
```

| Control | Role | Does | Endpoint |
|---|---|---|---|
| **Add photos** | `primary` | File picker → upload into the **resolved entity leaf** | `POST /api/photos/upload` |
| **Download N** | `overall` | ZIP of **shown** photo ids (same `shown` the footer prints) | `GET /api/photos/download-zip` |

**No ⋯.** NAS / Drive are tenant-wide pending-mirror batches — not peers of
Download; leave them where they already live. Share pack is selection-scoped and
already on the batch rail. That leaves one collection verb: view Download — the
same `DeskActionSlotRegistrar role="overall"` slot every DataTable desk uses.

**Download with nothing selected — download shown, labeled, refuse at 0.** Label
`Download 48`; disabled at 0 as `Download`. Do **not** fetch
`/api/photos/library/ids` from the header click (that zips thousands the
operator has not seen). Selection download stays on the rail floor.

**Add photos cannot land on a scope tab.** Upload requires `entityType` +
`entityId`. Armed only when a leaf is resolved (`poRef` / `receivingId` /
`ticketId` — the same facts the breadcrumb leaf names). Otherwise visible and
disabled (or focuses Find). `photoType` from the active media scope.

**Rename the rail verb.** The batch rail's primary row is already labeled
**Add photos** and means "attach selection to a Zendesk ticket". Header Add =
upload. Rail becomes **Attach to ticket** (or keep Zendesk wording).

Target chrome:

```text
Media                              [ Download 48 ]  [ Add photos ]
Unboxing · Packing · …                              [type cube]
┌ card ─────────────────────────────────────────────────────────┐
│ Find by order # / tracking / serial…  [filter] [views]  … ⤢  │
│ tiles                                                         │
│ All dates › Aug 2026 › Aug 29              48 of 48           │
└───────────────────────────────────────────────────────────────┘
```

---

## 3. Phases

### Phase 1 — `TableStatusBar` grows a `lead` slot
Additive prop + precedence docs + pin + smoke. No Media consumer. After the
edit: `pnpm run eval:cohort shortcuts` (`TableStatusBar` is shortcut-display
cohort engine).

### Phase 2 — the footer
Mount `TableStatusBar` at the foot of the card with
`lead={<PhotoDateBreadcrumb …/>}`, `shown` / `total` / `selected` wired.
Delete `photo-library-meta`. Keep end-of-stream. Clickable ancestors.

### Phase 3 — the find row
Compose `SearchField` + kind + filter + views + display controls +
`DataTableFullscreenToggle`. Wire `poFinder` / `poFinderKind` through
`usePhotoLibraryUrlState`. Delete `PhotoLibraryHeader`. Select toggles for real.
Do not name it `PhotoLibraryToolbar`.

### Phase 4 — the CTA
`PhotoLibraryDeskActions` (or equivalent): `role="overall"` Download shown;
`role="primary"` Add photos (leaf-armed). Rename rail Zendesk verb. No
NAS/Drive/Share in the header. Once header CTAs exist, staff `?` must yield
`MediaLibraryShortcutsModal` to the house cheat-sheet / inline overlay (cohort
law).

### Phase 5 — verify
`pnpm run verify:fast` · `node tools/design-mcp/smoke.mjs` ·
`tests/e2e/photos-railless-frame.spec.ts` (≥784px) ·
`pnpm run eval:cohort shortcuts` after TableStatusBar.

---

## 4. Anti-goals

| Do not | Because |
|---|---|
| Fork `TableStatusBar` or `SearchField` for Media | Two copies of the strip is the fork its own docblock names |
| Add a second writer of `poFinder` | The 2026-07-29 two-writer bug on this exact surface |
| Put NAS / Drive / Share in a header ⋯ | False peer set; NAS/Drive are tenant mirrors; Share is rail-scoped |
| Keep `metaLine` beside the footer count | Two readouts, one number, different words |
| Let the breadcrumb become navigation chrome | Path contraction in the footer; the tab row is navigation |
| Re-introduce a band under selection | Bands stay mounted (2026-08-09); bulk verbs are armed rows on the right edge |
| Upload with only a scope tab (no entity leaf) | Makes the tab and breadcrumb lie |
| Resurrect the name `PhotoLibraryToolbar` | That was the selection-swap band the rail replaced |
| Paint `lead` beside selection CTAs | Precedence: verbs beat tabs beat lead |
| Open a sheet from staff `?` once header CTAs exist | Shortcut-display cohort — letters on the Buttons |

---

## 5. Decisions (locked 2026-09-01)

1. **Breadcrumb stays clickable** — ancestor crumbs only (path contraction).
2. **Download with nothing selected** — download **shown**, labeled
   (`Download N`); disabled at 0; never `library/ids` from the header.
3. **Select stays in the display group** — mode toggle, not a create verb; fix
   the toggle-off lie while re-hosting.
