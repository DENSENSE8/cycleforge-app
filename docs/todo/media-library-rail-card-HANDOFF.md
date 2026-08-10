# Handoff — Media Library rail: adopt the Unbox detached-card wrapper

**Repo:** `/Users/icecube/repos/cycleforge-app` · branch `main` · **all work uncommitted**
**Surface:** `/ops/photos` (Media Library) · **Predecessor plan:** `media_library_implementation_plan.md`
(Phases 1–3 executed 2026-07-28; see "What already landed")

---

## 0. The ask (do this first)

The Media Library's facet rail currently renders **flush to the viewport edge** as a bare
sidebar body — no card, no depth, no inset. It should instead use **the same wrapper
component the Unbox display uses for its recents rail**: a detached card with

- depth / shadow,
- padding between the card and the surrounding edges,
- **not** glued to the left edge and **not** visually part of the sidebar chrome.

> The operator's words: *"ensure that you are using the same wrapper component from the
> unbox display — this component has depth and shadows and padding between edges, so it's
> not connected to the edge or the sidebar. It should be a completely different component,
> not in the sidebar itself."*

Read that last clause literally: the rail should be **its own component**, not the sidebar
panel body. Today it *is* the sidebar body.

### Where to find the wrapper — CONFIRM, don't assume

I did not finish identifying the exact component before handing off. Start here:

1. Open `/unbox` in the browser and visually match the card in the operator's screenshot —
   header row `Ticket · Tracking · PO` with a green top accent, eyebrow `UNBOXED · 50`,
   then rows of `title / 1‑1 / 9h`.
2. Trace it from `src/components/sidebar/ReceivingSidebarPanel.tsx` → `ReceivingRailBody`
   → **`ReceivingFeedRail.tsx`** (most likely owner of the card chrome) and/or
   **`RecentActivityRailBase.tsx`** (the documented reference wrapper — see
   `.claude/rules/ui-design-system.md` → "Compose rails; never rebuild rail infrastructure").
3. Note: `grep` for `rounded-2xl|shadow|elevationClass|<Panel` inside
   `src/components/sidebar/receiving/` did **not** hit `ReceivingFeedRail`, so the card
   chrome likely comes from a shared primitive one level up (`Panel` with
   `elevation`, `CardShell`, or a station card token). **Find the real owner and compose
   it — do not re-type `rounded-2xl border … shadow-sm`.** That is a hard house law
   (`surface-box-tokens.guard.test.ts` ratchets hand-rolled shells down).

### House law that governs this change

- **Compose the shared primitive; never fork a page-local twin** (`AGENTS.md` → Never).
  If the Unbox card is single-consumer, promoting it into a shared primitive that both
  Unbox and Media Library compose is *growth*, and is the preferred outcome.
- Surface/box shell SoT: `Panel` (generic) · `SectionCard` (monitor) · `CardShell` (rows).
- Depth: `elevationClass(role)` from `tokens/shadows.ts` — never hand-rolled shadow.
- Spacing: Tier-2 intents (`inset-card`, `stack-section`, …), never raw `p-[6px]`.

---

## 1. Current state of the rail

- Component: **`src/components/photos/PhotoLibrarySidebarPanel.tsx`**
  (I originally created it at `src/components/sidebar/MediaLibrarySidebarPanel.tsx`;
  the operator moved + renamed it — use the current path.)
- Mounted via `SidebarContextPanel.tsx:100` → `if (routeKey === 'ops-photos') return <PhotoLibrarySidebarPanel />`
  (dynamic import at line ~41, per the bundle-altitude rule — keep it dynamic).
- `'ops-photos'` **is** in `CONTEXT_PANEL_ROUTE_KEYS` (`src/lib/sidebar-navigation.ts`), which
  is what reserves the column. `useHasSidebarContext` and that set must agree — if you move
  the rail out of the sidebar entirely, **revisit both** or you will reserve a 360px column
  with nothing in it (the exact bug documented in `useHasSidebarContext.ts`).
- Content as of handoff: a vertical lifecycle facet list (All photos · Unboxing · Local
  pickups · Packing · Repair services · Zendesk Claims · Outbound) plus a `CAPTURE DAYS`
  tree (2026 → JULY → Jul 28 · 48). The operator reworked this from my original
  (saved views / date presets / labels) — **treat the current file as the source of truth.**

---

## 2. What already landed (Phases 1–3, uncommitted, `npm run verify` PASSED)

- **Flat stream is the landing view.** `DEFAULT_PHOTO_LIBRARY_VIEW = 'grid-sm'`. This fixed
  the landing state fetching **zero** photos (the old `folders` default gated the query).
- **Sticky day bands** — `groupPhotosByCaptureDay` (`src/lib/photos/capture-day-groups.ts`)
  + `DateGroupHeader`. Groups in **array order and does not sort**, so `?sort=oldest`
  re-orders days for free.
- **Folder hierarchy deleted** (−1,058 net lines): `FoldersView`, `date-folder-tree`,
  `useDateFolders`, the `folders` view mode, the recency-tab abstraction, and two decayed
  seams (`photoLibraryShowsSelectControl`, `photoLibraryViewToggleModes` — both ignored
  their args).
- **`?view=folders` degrades** to the flat stream (legacy deep links / saved views).
- **Date filter is now sargable** — see §3.
- Scoped house-law exception recorded for the always-open `SearchField` on this surface
  (`.claude/rules/ui-design-system.md` + `source-of-truth.md`).

### Deliberately still alive — do NOT "finish the job" by deleting these

`folder-level.ts`, `usePhotoLibraryFolders`, `/api/photos/library/folders`,
`FolderTileCover`, `PHOTO_LIBRARY_FOLDER_LEAF_PAGE_SIZE`, and the `weekRange` /
`weekRangeLabel` / `isoWeekNumber` helpers in `date-hierarchy.ts` all still serve the
**Media Library picker modal** (`MediaLibraryPickerContent` / `MediaLibraryPickerFolders`,
used by Zendesk attach). The original plan called `folder-level.ts` "safe to delete" — it
is not.

### Removed by the operator — do not reinstate

The non-modal photo inspector (`PhotoInspectorPanel.tsx`, `?photoId=` URL state) was built,
verified, then deleted. Its URL plumbing was cleanly removed too. Leave it gone.

#### SUPERSEDED 2026-08-09 — the ban is lifted, conditionally

Keep the paragraph above: it is the evidence, and the two conditions below exist only because
it was written. The blanket "leave it gone" no longer holds.

**Why the deletion was rational.** The operator did not recall the reason; the code did, in three
places that agree:

| Evidence | What it says |
|---|---|
| `PhotoCard.tsx:53-62` | *"There is deliberately no second, quieter 'inspect' path competing for the same click."* |
| `src/data/release-notes.json:91` | *"Drop PhotoInspectorPanel + date-folder tree; tile click reopens fullscreen viewer"* |
| `src/lib/photos/library-filter-state.ts:526-537` | *"There is deliberately no `?photoId=` record selection here… re-adding a durable record param means re-answering what happens when a filter change evicts that photo from the result set."* |

Two independent failures: (1) the inspector **competed with the lightbox for the tile click** —
on a photo surface a click means *show me the photo*, and the operator resolved the ambiguity by
giving the click back to the viewer; (2) **`?photoId=` had no eviction answer** on a filtered
stream.

**The two conditions any return must meet.** Both are met by the A3 plan
([`media-library-desk-inspector-A3-PLAN.md`](media-library-desk-inspector-A3-PLAN.md)) and both
are Stage-1 acceptance checks there:

1. **The tile click is not touched.** Click stays → fullscreen lightbox. The inspector is the
   **n = 1 face of the selection plane** (select one → inspector; select two or more → the
   existing `PhotoLibraryToolbar`), the same cardinality switch Orders and History already use.
   *Operator ruling, 2026-08-09* — this overrides D2 of the answering research report, which had
   click → inspector and double-click → lightbox.
2. **Eviction is ruled explicitly.** `?photoId=` is written from selection and cleared with it, so
   a filter change that drops the photo from the loaded set closes the rail. One rule, no new
   concept.

**What makes it worth rebuilding rather than restoring.** The deleted panel was facts-only, which
is why it read as a redundant second Details drawer. The return is `DeskInspectorIndexShell`
index→leaf topics plus an `InspectorActionFloor`, and it inherits the seven single-asset verbs
that are currently reachable **only by right-click** — a plane the deleted panel never replaced.

A restoration that is facts-only, or that takes the tile click, is still banned by the paragraph
above.

---

## 3. The date-filter fix (done — context so you don't undo it)

`buildLibraryWhere` (`src/lib/photos/queries/library.ts`) used to filter with
`(p.created_at AT TIME ZONE 'America/Los_Angeles')::date >= $n::date`. Correct, but a
predicate on a **function of** the column, so `idx_photos_org_created` could not serve it —
every date-filtered read was a **Seq Scan + top-N sort**.

Now: PST civil day → instant bounds via `warehouseDayUtcBounds`, compared as a **half-open**
range `created_at >= start(from) AND created_at < start(to + 1 day)`.

Measured (EXPLAIN ANALYZE, dogfood tenant): **Seq Scan 2,841 rows / 1.81 ms → Index Scan
48 rows / 0.09 ms**, Sort node eliminated. Row sets identical across 7 ranges. Live API
re-confirmed (233 / 752). **No migration was needed** — the plan predicted a generated
`created_pst_date` column or expression index; neither is required. Don't add one.

Half-open is deliberate: `endIso` is `23:59:59.999` but timestamptz is microsecond-precision.
DST is locked by a unit test in `src/utils/date.civil.test.ts` (23h spring day / 25h fall day).
The `GROUP BY` bucket at the aggregate site still casts — that's fine, only *filters* need
to be sargable.

---

## 4. Remaining backlog after the card wrapper

1. **Virtualization of the flat stream** — `PhotoFlatGrid` plain-`map`s every loaded photo.
   Measured: **~12.2 DOM nodes per tile**; 48 tiles ≈ 1,051 total nodes, 96 tiles ≈ 1,518.
   Linear growth, unbounded via infinite scroll. `@tanstack/react-virtual` is already a
   dependency.
   **Important:** `VirtualGroupedSections` (the DS windowing SoT) virtualizes a **linear row
   stream** (header | group | row). The photo stream is a **2D CSS tile grid** (4–8 per
   visual row, responsive). It does not compose directly. Either chunk tiles into
   rows-of-N and feed those as "rows" (needs a live column count), or justify a sibling.
   **Measure the real cost before building** — at 2,841 photos this may not be worth it yet.
2. **List view → `LedgerGrid`** (research Q6). `PhotoListView` is still hand-rolled markup;
   adopting `LedgerGrid` inherits column visibility, URL-durable sort, and selection.
3. **Typed search params** — the operator chose hand-rolled over `nuqs`. Done for the new
   parsers; the pre-existing ~20 optional strings in `PhotoLibraryFilterState` are still loose.

---

## 5. Verification — read before claiming green

- **`npm run verify` is the gate.** It PASSED for the media-library work.
- **At handoff it is RED, from unrelated concurrent work**, not from anything above:
  4 lint errors in `src/lib/orders/ingest-canonical-orders.ts` (`transitionalDogfoodOrgId`
  deprecation) and 11 knip findings (10 in `src/lib/orders/**`, 1 = the new
  `src/lib/photos/capture-time.ts`). Confirm ownership before "fixing" any of it.
- **Never raise a DS-ratchet baseline** to pass a gate.
- Photo unit tests: `TZ=UTC npx tsx --test src/lib/photos/*.test.ts`. Note 3 files
  (`labels`, `listing-photos`, `reassign-receiving-photo`) fail under **bare tsx** because
  they import `src/lib/db.ts` (`server-only`) — pre-existing and environmental, not yours.

### ⚠️ Browser-verification gotcha that cost real time twice

The Browser pane is often `document.visibilityState === 'hidden'`, and browsers **pause
`requestAnimationFrame` and `IntersectionObserver`** for hidden documents. Consequences:

- framer-motion elements freeze at their **`initial`** variant, so a panel reads
  `opacity: 0` via `getComputedStyle` and looks broken when it is fine.
- Infinite scroll appears dead — the sentinel never fires.

**Take a screenshot first.** That forces a paint and wakes the pane; then re-measure.
Never diagnose a motion or lazy-loading bug from computed styles on a hidden pane.

### Dev server / auth

The operator runs their own dev server (observed on **:3050**, not :3000) in this same
directory, which holds `.next/dev/lock` — do not fight it, just use their port. Auth via
the project's pinless dev sign-in: `GET /api/auth/staff-picker` with `x-tenant-slug: usav`,
then `POST /api/auth/signin {staffId, deviceKind:'personal'}`, and set the returned
`cf_sid` cookie. **Never type credentials into the sign-in form.**

### The operator edits concurrently

Files changed under me repeatedly during the last session (sidebar renamed/moved, inspector
deleted, new `capture-time.ts` / `capture-provenance.ts` appearing mid-run). **Re-read a
file immediately before editing it**, and check `git status` / mtimes before attributing a
failure to yourself.

---

## 6. Definition of done for the card wrapper

- [ ] The Media Library rail renders inside the **same** wrapper primitive as the Unbox
      recents rail — composed, not re-typed. If that meant promoting a single-consumer
      component into a shared one, say so in the summary.
- [ ] Visible depth/shadow, inset from the viewport edge, visually detached from the
      sidebar chrome (match the operator's screenshot).
- [ ] No hand-rolled `rounded-* border … shadow-*` (guard: `surface-box-tokens.guard.test.ts`).
- [ ] Sidebar column reservation still coherent (`CONTEXT_PANEL_ROUTE_KEYS` ↔
      `useHasSidebarContext` ↔ what actually renders).
- [ ] `npm run verify` shows no NEW failures beyond the pre-existing set in §5.
- [ ] Browser-verified **with a screenshot** at 1440 and 1920 (per §5's gotcha).
