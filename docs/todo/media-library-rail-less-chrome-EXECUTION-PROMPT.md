# Execution prompt — Media Library S1.5: delete the left rail, port its tabs into the top chrome

**Surface:** `/ops/photos` (Media Library)
**Stage:** S1.5 of [`media-library-desk-inspector-A3-PLAN.md`](media-library-desk-inspector-A3-PLAN.md) — lands between S1 (done) and S2.
**Date:** 2026-08-09
**Operator ruling this executes:** the facet rail goes away entirely; its lifecycle tabs move to the top chrome; the surface reads like Unbox — **tabs on top, search below, breadcrumb + header row below that** — and that band order becomes a written SoT for this surface.

**Delete first, then port.** Not "port, then delete if unused" — a rail left mounted beside a tab strip is two writers of `sourceScope`, which is the exact defect the rail was created to fix (2026-07-29, below). Removing it first makes the duplicate impossible rather than temporary.

---

## 0. Read first (laws, not suggestions)

| Law | Where |
|---|---|
| The left context column is EARNED, not a default (Pattern E) | `.claude/rules/source-of-truth.md` → **Left-edge occupant** |
| Sheets flush mount recipe — bands, `gap-0`, one hairline per seam | `.claude/rules/source-of-truth.md` → **Ops table / spreadsheet surface shell** |
| Band-1 face, leading cubes abut the tab rail | `.claude/rules/source-of-truth.md` → **Workbench chrome flush** |
| Band-3 is find-only; refine rides IN the find field | `.claude/rules/display/workbench-ops-queue.md` → Sticky docking |
| Host flush, pad on the row | `.claude/rules/source-of-truth.md` → **Host vs content pad** |
| A retirement is not done until the old path is DELETED | `.claude/rules/pattern-evolution.md` → Always #6 |

**Golden to copy:** `src/components/receiving/unbox/UnboxWorkspaceHeader.tsx` (`:920` onward) — `WorkbenchChromeHeader density="band"` with `className="rounded-none border-l-0 border-t-0 shadow-sm"`, a **leading** popover cube abutting the tab rail (`UnboxAddListPopover`), then sibling bands inside one `WORKBENCH_SHEET_CHROME` host with `flex flex-col gap-0`.

**Already done in S1 — do not redo:** the surface is flush-square; host gutters are gone; the path strip (`PhotoLibraryHeader`) already renders in `DashboardScrollShell`'s `chrome` slot as a band, not in the scroll body; the desk inspector (`detail:photo`) is live and pushes.

---

## 1. Delete the rail — the exact set

```
DELETE  src/components/photos/PhotoLibrarySidebarPanel.tsx
DELETE  src/components/photos/OutboundDocumentTypeFilters.tsx   (see §3.3 — reuse its
                                                                 vocabulary, not its markup)
EDIT    src/components/sidebar/SidebarContextPanel.tsx
          – drop the import and `if (routeKey === 'ops-photos') return <PhotoLibrarySidebarPanel />;`
EDIT    src/lib/sidebar-navigation.ts
          – remove 'ops-photos' from CONTEXT_PANEL_ROUTE_KEYS, and the stale comment
            block above it that still explains why the rail exists (~:565–571)
EDIT    src/components/sidebar/SidebarFacetGroup.tsx
          – its docblock names PhotoLibrarySidebarPanel as a consumer; correct it
EDIT    src/components/photos/PhotoLibraryWorkspaceHeader.tsx
          – rewrite the docblock (see §2 — it currently forbids what you are building)
```

**`CONTEXT_PANEL_ROUTE_KEYS` is the whole frame change.** `ContextPanelLayout:112` computes
`hasPanel = (useHasSidebarContext() || isStationSurfaceRoute(pathname)) && !railless`, and
`useHasSidebarContext()` reads that set. Removing the key collapses the column outright — the same
route `/search` and `/reports` already take.

> **Do NOT extend `isRaillessOrderFeedSurface`.** The left-edge law says a new rail-less desk
> extends that predicate, and for another *order feed* it would. This one is named for the To-ship
> order feed, its docblock is entirely about outbound lifecycle tabs / KPI attention / Views, and
> `outbound-rail-dedup.guard.test.ts` asserts order-feed semantics on it. Widening it to a photo
> archive would make the name a lie and put a media concern inside an outbound guard. The set
> removal is the honest mechanism, and it is what the panel-less routes already use.

**Survives — do not delete:**

| Module | Why |
|---|---|
| `SidebarFacetGroup` | still consumed by `IncomingSidebarPanel`, `VoicemailQueue`, `CallLogSidebar` |
| `buildPhotoDateTree` / `date-tree.ts` | `PhotoLibraryPage` uses it for `photoDaySpan` + `mostRecentDay`, independent of the rail |
| `PHOTO_SCOPE_ICONS` | moves to the Band-1 tabs (paired glyph + label) |
| `PHOTO_LIBRARY_SCOPE_TABS` / `PHOTO_LIBRARY_SCOPE_TAB_LABEL` | already the tab-strip vocabulary — the compact labels were authored for exactly this and the SoT even says "the sidebar/menu uses the longer `PHOTO_SOURCE_SCOPE_LABELS`" |
| `applySourceScopeTab` | the scope-switch patch (clears scope-dependent filters); the tabs call it |

Run `npx knip` after the deletes and clear whatever they strand — a half-removed rail is the "prose-only retirement" Always #6 bans.

---

## 2. The reversal you are performing — say it out loud in the code

Two live docblocks forbid this change. **Both must be rewritten in this PR, not left lying**, or the next agent reads them as current law:

- `PhotoLibraryWorkspaceHeader.tsx` — *"Do not reintroduce a scope control here."*
- `PhotoLibrarySidebarPanel.tsx` — *"This rail is the ONLY writer of `sourceScope` / `imageType` (2026-07-29)."*

They were right about their defect and wrong about the remedy being permanent. The 2026-07-29 bug was **two controls writing one param** — a chrome media-type dropdown whose built-in rows were byte-for-byte the rail's source scopes, so the two could disagree. The fix chosen then was "delete one of them, and the survivor is the rail."

**This change keeps the invariant and changes which one survives:** the rail is *deleted*, and the Band-1 tabs become the single writer of `sourceScope` / `imageType`. One writer, in the chrome. Record that in the new docblocks with today's date and a pointer to the SoT in §4 — the invariant is "exactly one writer", never "the writer must be a rail".

---

## 3. The target chrome

```
┌─ Band 1 ── WorkbenchChromeHeader density="band" ─────────────────────────────┐
│ [▤ types▾] │ All · Unboxing · Pickups · Packing · Repair · Claims · Outbound │
│  leading cube, abuts the rail                              trailing: (none¹) │
├─ Band 2 ── the search band ──────────────────────────────────────────────────┤
│ 🔍 PO, order, tracking, serial…                    ▽ refine        ↕ Newest  │
├─ Band 3 ── the path strip (PhotoLibraryHeader, already a band) ──────────────┤
│ ▤ All dates › Aug › Aug 9   PHOTOS 48 · …        [density][⟳][✎][▦ ▤]        │
└──────────────────────────────────────────────────────────────────────────────┘
  ── sheet plane: day-banded photo stream ──                    → right: inspector
```

¹ Band-1 trailing stays empty for now — this surface has no import / add / return-to-scan CTA. Do not invent one.

All three bands stack in the SINGLE existing `WORKBENCH_SHEET_CHROME` host with `flex flex-col gap-0` (S1 already built that host). Band 1 takes `rounded-none border-l-0 border-t-0 shadow-sm`; Bands 2 and 3 take `border-t-0` — one hairline per seam, upper band owns it.

### 3.1 Band 1 — lifecycle tabs

`WorkbenchChromeHeader density="band"`, `tabs` from `PHOTO_LIBRARY_SCOPE_TABS` labelled by
`PHOTO_LIBRARY_SCOPE_TAB_LABEL`, glyphs from `PHOTO_SCOPE_ICONS`, `activeTab` from
`sourceScopeFromFilters(filters)`, `onTabChange` → `patch(applySourceScopeTab(id))`.

**Lifecycle tabs are text-only per the band law** — check `WorkbenchChromeHeader`'s tab contract before wiring glyphs; if it refuses icons, drop them rather than forking the band.

### 3.2 Custom media types → the Band-1 **leading** cube

Seven built-ins plus N operator-defined types cannot all be tabs. That overflow is not hypothetical:
`PhotoLibraryWorkspaceHeader`'s own docblock records that the facets "were the reason this row
overflowed and clipped its own right controls."

**Ruling: a leading popover cube, exactly the `UnboxAddListPopover` shape** — a boxed control
abutting the tab rail (`gap-0`, no `p-0.5` air), listing the org's custom types plus **Add media
type**. Same band, because "which media am I looking at" is one question; a separate control
altitude would recreate the split §2 just closed.

Carry over verbatim from the deleted rail: `useImageTypes()`, `BUILTIN_IMAGE_TYPE_KEYS` routing in
`selectSection`, the full clearing patch a custom type applies (`sourceScope`, `stage`, `label`,
`poRef`, `ticketId`, `receivingId`, `documentType`, `outboundMedia` → `undefined`), and the
`createType` flow. **Replace `window.prompt`** — it is a native dialog on a surface the house bans
them from; use the DS input path.

Active state is `filters.imageType ?? activeScope`, one row across both groups — a custom type
clears the lifecycle tab and vice versa.

### 3.3 Outbound document chips → in-field refine, outbound only

They exist only under `sourceScope=outbound`, and a facet that narrows the ROWS rides in the find
field (`trailingSuffix`, `WorkbenchFilterPopover density="field"`) — Band 3's ruled grammar, applied
to this surface's Band 2. Reuse `OUTBOUND_DOCUMENT_TYPE_LABELS` + the `documentType` /
`outboundMedia` patch pairs; render them as `WorkbenchFilterMenuRow`s rather than porting the
chip markup (which is a soft `rounded-lg` row this pass would have to flush anyway).

### 3.4 Capture days → the breadcrumb keeps navigation; counts move into refine

`PhotoDateBreadcrumb` (Band 3) already owns date navigation — the Year › Month › Week › Day path,
the Today / Latest quick chips, and the `onNavigate` that writes `dateFrom`/`dateTo`. The rail's
day tree duplicated that. What it uniquely had is **per-day counts** and a jump to a day that is not
on the current path.

**Ruling: keep the capability, move it into the Band-2 refine popover as a Days facet**, fed by the
`buildPhotoDateTree(photos)` the page already computes. Dropping it outright is a silent capability
loss on an evidence archive whose primary axis is capture day.

> Carry over the rail's three-state honesty verbatim — it was hard-won and the comment says why:
> a query that has **failed at least once** (`query.isError || query.failureCount > 0`) is an error;
> settled-and-empty is "No photos in view"; unsettled is a spinner. `refetchOnWindowFocus: 'always'`
> means `isError` is false at most sampled moments during a real outage, so `failureCount` is
> load-bearing, not belt-and-braces.

### 3.5 Band 2 vs Band 3 — the divergence you are ratifying

House grammar is Band 2 = KPI, Band 3 = the lean find row. **This surface inverts the lower two**,
and that is the whole reason §4 exists. Justify it in the SoT with these three facts, not with
taste:

1. **There is no KPI band here.** Nothing to collapse, so Band 2 is free rather than displaced.
2. **Search on this surface is the entry path, not a refinement** — already an approved house-law
   exception (2026-07-28, `ui-design-system.md` → Scoped search chrome): `/ops/photos` is a
   photo-EVIDENCE archive whose #1 job is exact-identifier retrieval. A control that IS the job
   earns its own band; it does not share one with layout toggles.
3. **The breadcrumb row is a context readout, not a find row.** A path answers *where am I in the
   archive*, which is the altitude a KPI strip occupies on a queue — so it sits where a KPI band
   would, under the primary control and above the plane.

Band 3 therefore keeps the breadcrumb + the display controls it already has (density · refresh ·
select · icons/list) and gains the inspector toggle if S2+ wants one. It does **not** grow a second
find field.

---

## 4. Author the SoT — this is a deliverable, not paperwork

**New:** `.claude/rules/display/media-library.md` — the exact viewing + display format for
`/ops/photos`, indexed from `.claude/rules/contextual-display.md`'s child-doc list. It must state:

- Region contract + branch (Workbench; `ops-queue`-shaped but a **media stream**, not a LedgerGrid —
  say so, because "port it to LedgerGrid" is deferred by the A3 plan and must stay deferred).
- **Rail-less** (Pattern E) and the mechanism (`CONTEXT_PANEL_ROUTE_KEYS`, not the order-feed predicate).
- The three-band order **with the §3.5 justification**, marked as a documented divergence from
  Band 2 = KPI / Band 3 = find.
- One writer per param: tabs own `sourceScope` / `imageType`; the find field owns the finder;
  the breadcrumb owns `dateFrom`/`dateTo`; `?photoId=` is a display param owned by selection.
- The tile click belongs to the fullscreen viewer; the inspector is the n = 1 selection face.
- The always-open `SearchField` exception, restated here so it is not re-collapsed by a sweep.

**Also:** one row in `.claude/rules/source-of-truth.md` pointing at it, in the presentation-kinds
table, and a line in the A3 plan's stage map.

---

## 5. Acceptance

**Automated**

```bash
npx tsc --noEmit -p tsconfig.json
npx knip
npm run verify
npx playwright test tests/e2e/photos-library-deep-link.spec.ts tests/e2e/photos-inspector-walk.spec.ts --project=qa-desktop
```

- [ ] `photos-library-deep-link.spec.ts` **still 6/6.** It asserts URL round-trips and header context
      copy, never the rail's DOM, so it should survive the deletion untouched — if it goes red you
      changed the filter contract, not the chrome.
- [ ] `photos-inspector-walk.spec.ts` **still 6/6** (the rail-less frame changes the widths the
      inspector pushes against; this is the net for that).
- [ ] `npx knip` reports no new orphans.
- [ ] `npm run verify` green with **no raised baselines**.
- [ ] New guard `src/components/photos/media-library-chrome.guard.test.ts`:
      nothing under `src/components/photos/` imports `SidebarShell`;
      `'ops-photos'` is absent from `CONTEXT_PANEL_ROUTE_KEYS`;
      `sourceScope` has exactly one writer under `src/components/photos/`;
      the band order is asserted from `PhotoLibraryPage`'s chrome slot.

**Dogfood walk** — `http://localhost:3050/ops/photos` (QA org). **Never start, restart, or kill that
server.** It has no browser session in the in-app pane; drive it with Playwright + the
`tests/.auth/qa-admin.json` storage state, as S1 did.

- [ ] No left column. The stream starts at the spine, not 360px in.
- [ ] Band 1 tabs switch scope; the URL round-trips; the active tab survives reload.
- [ ] A custom media type is reachable, selectable, and creatable — and creating one selects it.
- [ ] Outbound's document chips appear **only** under the Outbound tab and still filter.
- [ ] A capture day with its count is still reachable, and jumping to one still narrows the stream.
- [ ] The three bands read as one stacked block: no gap, one hairline per seam, nothing rounded.
- [ ] Selecting one photo still pushes the inspector; the reclaimed width means the centre now
      clears `MIN_WORK_SURFACE_PX` at 1440 (it measured **720** with the rail open — see the S1
      report; this refactor is what fixes that).

---

## 6. Hard bans

- Leaving `PhotoLibrarySidebarPanel` mounted "until the tabs are proven" — that is the two-writer bug.
- Extending `isRaillessOrderFeedSurface` to cover photos.
- A second control that writes `sourceScope` or `imageType`.
- A find field on Band 3, or a KPI band invented to make Band 2 look house-standard.
- `window.prompt` surviving the port of Add media type.
- Deleting `SidebarFacetGroup`, `buildPhotoDateTree`, or `PHOTO_SCOPE_ICONS` (all have other consumers).
- Touching `MediaLibraryPicker*`, `shipped/photo-gallery/**`, or the lightbox.
- Porting the photo stream to `LedgerGrid` (deferred by the A3 plan — table-engine fan-out dogfoods
  Unbox History first).
- Raising a DS ratchet baseline, or `--no-verify`.
