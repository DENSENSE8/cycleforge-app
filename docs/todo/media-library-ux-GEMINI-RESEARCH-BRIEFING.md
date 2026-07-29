# Research briefing — Media Library (photo/document DAM) navigation model

**For:** Gemini Pro (deep research, with codebase access)
**From:** Cycle Forge engineering
**Date:** 2026-07-28
**Surface:** `/ops/photos` — the Media Library
**Deliverable:** a navigation + information-architecture recommendation for a photo-evidence library, benchmarked against named industry DAM/photo-management systems and 2026 design-system practice, then reconciled against the constraints in §5–§7.

---

## 0. How to use this brief

Two things are being asked of you, and they are **different questions**. Answer both separately, and do not let one collapse into the other:

1. **What is industry standard in 2026?** Survey how comparable products solve library navigation — named examples, cited sources, dominant patterns, and the conditions under which each wins. Do not generalize into "it depends." Where practice has *changed* recently (and DAM navigation has changed a lot since ~2023), say what changed and why.
2. **What is right for *this* codebase?** Reconcile the industry answer against §5–§7. Where the industry standard conflicts with a house constraint, say so explicitly and pick a side with reasoning. **A defended deviation is worth more to us than a generic best-practice list.**

### 0a. You have codebase access — use it

Unlike our previous briefs, you are expected to **read the repository**. §2–§4 below are our own findings; treat them as a starting hypothesis to verify, extend, or contradict — not as ground truth. If our diagnosis is wrong, say so.

**Read these first (the navigation model lives here):**

| File | Why it matters |
|---|---|
| `src/components/photos/PhotoLibraryPage.tsx` | Page orchestrator (~830 lines). Owns the two-query split, selection, bulk actions. |
| `src/lib/photos/library-filter-state.ts` | **The URL contract.** View modes, recency tabs, date presets, source scopes. Most defects in §3 originate here. |
| `src/lib/photos/folder-level.ts` | Maps URL date range → folder aggregation level. 69 lines; it is the whole drill state machine. |
| `src/components/photos/photo-library-grid/date-folder-tree.ts` | Client-side Year→Month→Week→Day→PO tree (the legacy path, still used at leaf). |
| `src/components/photos/PhotoLibraryWorkspaceHeader.tsx` | The chrome: recency tabs, search, filters, media-type menu, sort. |
| `src/components/photos/PhotoDisplayControls.tsx` | The view toggle — note *when* it renders. |
| `src/lib/photos/photo-grid-density.ts` | `photoLibraryShowsSecondHeaderControls` / `photoLibraryShowsGridControls` — the visibility gates that cause §3.4. |
| `src/components/photos/photo-library-grid/FoldersView.tsx` | Folder tile grid + leaf contact sheet. |
| `src/components/photos/PhotoDateBreadcrumb.tsx` | The date path bar (the only widen-navigator). |
| `src/lib/photos/queries/library.ts` | The SQL waist: `buildLibraryWhere` (~line 492), `listPhotoLibraryFolders` (~line 950). |
| `src/app/api/photos/library/route.ts`, `.../library/folders/route.ts`, `.../library/ids/route.ts` | The three endpoints. |
| `src/hooks/usePhotoLibraryUrlState.ts`, `usePhotoLibrary.ts`, `usePhotoLibraryFolders.ts` | URL-as-state + the two queries. |
| `src/lib/drizzle/schema.ts` (search `photos`, `photoEntityLinks`) | The data model. |

**Then read the house law you must compose with:**

- `AGENTS.md` — the constitution: Kinetic Ledger identity, source-of-truth invariants, "compose → grow the SoT → compound."
- `.claude/rules/contextual-display.md` — the four **region contracts** (Station / Workbench / Monitor / Canvas) and the `pickArchetype` decision procedure. **This vocabulary is load-bearing; use it in your answer.**
- `.claude/rules/display/workbench.md` — the pick+edit contract, action planes, URL-as-state, sticky-docking law.
- `.claude/rules/ui-design-system.md` — density modes, one-row anatomy, token SoTs.
- `.claude/rules/display/motion-crossfade.md` — the motion law.
- `.claude/rules/source-of-truth.md` — the full SoT table, including right-rail modality and Escape ownership.

**Comparison target for §7 Q6:** contrast the Media Library's navigation against the app's *own* strongest surfaces — `src/components/dashboard/**` (the outbound orders Workbench: pinned chrome + lifecycle tabs + `LedgerGrid` + non-modal inspector) and `src/design-system/components/grid/**` (the headless grid waist). The Media Library is the surface that most conspicuously did **not** adopt that pattern. Assess whether it should.

Assume the reader is the engineer implementing this next week. Prefer concrete, implementable recommendations over frameworks-for-thinking.

---

## 1. Product context

**Cycle Forge** is multi-tenant reseller-operations SaaS for used-goods resellers (electronics refurb/resale is the dogfood tenant). The Media Library is its **photo-evidence DAM**: every inbound carton unboxing, triage, testing, repair, packing, and shipping event captures photos, and those photos are the evidence trail for damage claims, carrier disputes, warranty returns, and marketplace listings.

**The operator's actual jobs, in rough frequency order:**

1. *"A customer says the item arrived damaged — show me the packing photos for order X."* (identifier → photos)
2. *"What did we photograph in the last hour / today?"* (recency stream — supervisor spot-check)
3. *"Pull every photo for PO 14-14825-46707 and ZIP it for the insurance claim."* (entity → bulk export)
4. *"Attach these three photos to Zendesk ticket #9599."* (multi-select → bulk action)
5. *"Find the serial-number close-up for unit SN-…"* (identifier → single photo)

**Note what is absent from that list: nobody's job is "browse the year 2026."** Yet that is the app's landing state (§3.1).

The UI identity is **Kinetic Ledger**: data-first, dense, state-colored, scan-aware; the stated bias is **legible throughput over document calm** — closer to Linear/Carbon/Stripe Dashboard chrome discipline than to a document-whitespace product.

---

## 2. The surface as built (measured facts)

### 2a. Two orthogonal axes, presented as one chrome

The library has **two independent state axes** that the UI conflates:

| Axis | Values | Where it lives | How it's set |
|---|---|---|---|
| **View mode** (`display.view`) | `folders` · `grid-sm` · `grid-lg` · `grid-ticket` · `list` | `?view=` (omitted = `folders`) | A 2-position Icons/List toggle on the breadcrumb strip |
| **Date range** (`filters.dateFrom/dateTo`) | absent · today · last-7 · any drill range | `?dateFrom=&dateTo=` | A 4-tab strip labelled **Recent · Today · Last 7 · All** |

The four tabs read as *view tabs* (they are the most prominent chrome, in the workbench header, rendered by `WorkbenchChromeHeader` with tab coloring). They are in fact **date filters only**. `applyRecencyTab()` patches `dateFrom`/`dateTo`/`sort` and **never touches `display.view`**.

### 2b. The folder drill

`view=folders` is the **default** (`parsePhotoLibraryViewMode` returns `'folders'` for any unrecognized/absent `?view=`). Folder depth is derived *entirely from the date range* by `resolvePhotoLibraryFolderLevel()`:

| URL date state | Aggregation level | What renders |
|---|---|---|
| no dates | `year` | Year tiles |
| a full-year range | `month` | Month tiles |
| a full-month range | `week` | Week tiles |
| a full ISO-week range | `day` | Day tiles |
| a single day | `entity` | PO# / ticket# folder tiles |
| `poRef` / `ticketId` / `receivingId` / `poFinder` set | `entity` (leaf) | Photo contact sheet |

Server-side, `listPhotoLibraryFolders()` runs a `GROUP BY` on a PST-cast date expression against the same WHERE waist as the photo query, returning `{key, label, count, latestAt, previewPhotoId, dateFrom, dateTo}` per tile. **This part is well-built** — folder counts do not materialize photo rows, and each tile carries the exact nav range it applies. The aggregation is not the problem; what it is asked to aggregate is.

### 2c. Click math, cold start to one photo

```
/ops/photos  →  [2026]  →  [June]  →  [Jun 15-21]  →  [June 17]  →  [PO 14-…]  →  [photo]  →  lightbox
   land         click 1    click 2     click 3         click 4        click 5      click 6
                 year       month        week            day          entity
```

**Six clicks to see one image**, five of which are pure date arithmetic the operator already knows. On a tenant with one year of data, the first click is a **single tile** — a folder with no siblings, offering no information and no choice. It exists only to be clicked through.

The leaf then shows **5 photos** (`PHOTO_LIBRARY_FOLDER_LEAF_PAGE_SIZE = 5`) behind an explicit **Load more** button. A 40-photo carton unboxing takes 8 more clicks to view in full.

---

## 3. The verified defects

Each of these was traced to a specific line of code. Please verify independently and tell us if we've mis-diagnosed any.

### 3.1 — "Recent" fetches zero photos

`applyRecencyTab('recent')` → `{...applyDatePreset('all'), sort: 'recent'}` → `dateFrom`/`dateTo` = `undefined`.

With no dates and the default `view=folders`, `resolvePhotoLibraryFolderLevel()` returns `level: 'year', isLeaf: false`. `PhotoLibraryPage` then computes:

```ts
const fetchPhotos = view !== 'folders' || foldersIsLeaf;   // → false
usePhotoLibrary(filters, { enabled: fetchPhotos });         // → DISABLED
```

**The photo query is disabled on the Recent tab.** The tab labelled "Recent" issues no photo request at all; it renders one year folder. The `sort: 'recent'` it sets applies to a query that never runs. This is the user-reported defect *"the recent is displaying all dates and then today, and it's still displaying the 2026 folder that I have to drill through"* — and it is exactly what the code does.

### 3.2 — "All" is an unreachable state; the tab strip lies about where you are

`applyRecencyTab('all')` and `applyRecencyTab('recent')` produce **identical URLs**. Both clear the dates; `sort: 'recent'` is the default and is stripped by `photoLibraryFiltersToParams` (`if (filters.sort && filters.sort !== 'recent')`). Round-tripping through `recencyTabFromFilters()` → `datePresetFromFilters()` returns `'all'` → maps to tab `'recent'`.

**Consequence:** clicking **All** highlights **Recent**. Two of four tabs are one state.

Worse, the reverse projection is also wrong: any drill that isn't exactly today or exactly last-7 yields `datePresetFromFilters() === 'custom'` → `recencyTabFromFilters()` returns `'all'`. **So while you are four levels deep inside `2026 › June › Jun 15-21 › June 17`, the chrome highlights the "All" tab.** The most prominent navigation control in the header is actively misreporting position.

### 3.3 — Two navigators, neither complete, no shared model

Position is expressed twice, by two components with different vocabularies:

- **Recency tabs** (header) — a 4-value lossy projection of an arbitrary date range. Cannot represent "June 2026." Cannot represent a PO leaf.
- **Date breadcrumb** (`PhotoDateBreadcrumb`, on the path strip below) — the real `Year › Month › Week › Day › Folder` path, correct and clickable.

They are never reconciled. The tab strip says "All"; the breadcrumb says `2026 › June › Jun 15-21 › June 17 › PO 14-…`. The operator has to learn that the *small* control is the true one.

### 3.4 — The drill is a one-way trap: the view toggle is hidden inside it

This is, in our reading, the most serious structural defect.

```ts
// src/lib/photos/photo-grid-density.ts
export function photoLibraryShowsSecondHeaderControls(view, folderIsLeaf) {
  if (view === 'folders') return folderIsLeaf;   // ← false at every drill level
  return true;
}
```

`PhotoLibraryPage` passes that as `showToggle`/`showSelect` to `PhotoDisplayControls`. **At every non-leaf folder level (year, month, week, day, entity) the Icons/List toggle, the density control, and the Select affordance are all unmounted.**

So an operator sitting on the "2026" tile has *no chrome control that escapes folder mode*. The recency tabs don't change `view`. The only exits are: type in the search box, hit the `1` keyboard shortcut (undocumented outside a `?` cheat-sheet), edit `?view=` by hand, or apply a saved view. **The default landing state of the page has no visible affordance to leave itself.**

### 3.5 — Three of five view modes are orphaned

`PHOTO_LIBRARY_VIEW_ORDER` declares five modes. The toggle renders two, and collapses the mapping:

```ts
const active = (view === 'list' ? 'list' : 'icons') === id;
onClick={() => onViewChange(id === 'list' ? 'list' : 'folders')}
```

`grid-sm`, `grid-lg`, and `grid-ticket` are fully implemented (`PhotoFlatGrid`, `PhotoTicketGrid`) and unreachable from the chrome — only via a hand-edited URL or a saved view. Meanwhile `photoLibraryViewToggleModes()` ignores both its parameters and returns the constant `['list']`, so the digit shortcuts address a one-element list.

**There is a flat recency grid already built in this codebase.** It is what the "Recent" tab should show. It has no button.

### 3.6 — Search is the only fast path, and it's buried behind a hover-toggle

`ToolbarSearchToggle` is collapsed-at-rest by house law (correct for a Workbench). The finder itself is genuinely good: `poFinder` + `poFinderKind` resolves an order#, tracking#, serial#, PO#, SKU, or ticket# through `photo_entity_links` and jumps straight to a leaf, bypassing the drill entirely (`resolvePhotoLibraryFolderLevel` short-circuits to `isLeaf: true` when `poFinder` is set).

So the app's fastest path to a photo — one field, one identifier, zero drilling — is a collapsed icon, while a five-level date drill occupies the entire canvas. **The IA is inverted relative to actual job frequency (§1).**

### 3.7 — The left sidebar for this route is `null`

`src/components/sidebar/SidebarContextPanel.tsx:95` reads, verbatim:

```ts
if (routeKey === 'ops-photos') return null;
```

The page ships with **360px of permanently empty left column** while its own navigation is crammed into a header tab strip that can't express its state (§3.2). That is the single largest unexploited resource on this surface. See the companion brief `docs/todo/contextual-sidebar-ia-GEMINI-RESEARCH-BRIEFING.md` for the app-wide sidebar inventory.

### 3.8 — Smaller, but real

- **Date arithmetic is client-visible.** ISO week numbers ("Jun 15-21", "W25") are a *calendar* abstraction, not a *work* abstraction. No operator thinks "that carton arrived in ISO week 25." Weeks exist here to keep the drill balanced, not because anyone needs them.
- **Empty intermediate levels are still rendered.** A year with one month still renders a month level; a week with one day still renders a day level. There is no path-collapsing.
- **Leaf page size of 5** is far below any contact-sheet norm and is *not* infinite-scroll (the flat grid views are; the folder leaf is explicitly button-paged).
- **Selection resets on every scope change** (`scopeKey = JSON.stringify(filters)`) — correct and deliberate, but it means a drill-then-select workflow is impossible across folders. Cross-folder selection requires "select all matching" against `/api/photos/library/ids`.
- **Non-sargable date predicates.** Every date filter compares `(p.created_at AT TIME ZONE 'America/Los_Angeles')::date`, but the only relevant index is `idx_photos_org_created ON photos (organization_id, created_at DESC)`. The expression can't use it. Worth an EXPLAIN at tenant scale; an expression index on the PST date cast may be required if you recommend anything that increases folder-aggregation frequency.

---

## 4. Data model (what the navigation *could* be built on)

The underlying model is richer than the date tree exposes. **This matters: the recommendation should exploit what already exists rather than propose new capture.**

```
photos (id, organization_id, photo_type, taken_by_staff_id, po_ref, created_at, …)
  └── photo_entity_links (polymorphic hub, 2026-06-18)
        photo_id, organization_id, entity_type, entity_id, link_role
        entity_type ∈ RECEIVING | RECEIVING_LINE | PACKER_LOG | SERIAL_UNIT
                    | SKU | SKU_STOCK | BIN_ADJUSTMENT | SHARE_PACK | ZENDESK_TICKET | ORDER
        link_role  ∈ primary | claim_evidence | insurance_share
  └── photo_labels + photo_label_assignments   (many-to-many, org-scoped, colored)
  └── photo_analysis                            (AI vision output; metadata->>'damage_detected')
  └── photo_image_types                         (tenant-definable media types)
  └── media saved views                         (2026-07-01_media_library_saved_views.sql)
```

Every library photo row already resolves, server-side, a rich identity bundle (`LibraryPhoto` in `photo-library-types.ts`):

`sku` · `serialNumber` · `unitUid` · `stage` (evidence stage) · `poRef` · `tracking` · `platform` · `ticketId` · `takenByStaffName` · `labels[]` · `sourceScope` · `damageDetected` · `hasAnalysis` · `caption`

**Seven source scopes** exist as a first-class filter (`all`, `unboxing`, `local_pickup`, `packing`, `repair`, `claims`, `outbound`) with a dedicated menu. **Evidence stages** exist (`arrival_package`, `unbox_carton`, `unbox_item`). **Labels** exist. **AI damage detection** exists.

**And yet the primary navigation axis is the calendar** — the one dimension that carries the least operational meaning, and the only one an operator can already express as a filter.

**One notable gap:** photos are **not** wired into the cross-entity search waist (`src/lib/search/hybrid-retrieval.ts` / `entity_search_docs`). `build-search-text.ts` has no photo branch. So the app's hybrid keyword+vector search — which already serves orders, units, SKUs, and cartons — does not reach the media library. The library has a separate, identifier-only finder. Assess whether that's a defensible split or a missed consolidation (house law: "never build a new per-surface search implementation").

---

## 5. Ratified house law (do not silently overturn)

Your recommendation must compose with these or explicitly argue one should change.

1. **Four region contracts, one per region.** Station (scanner, act-and-clear, ephemeral selection) / Workbench (pointer, pick+edit, **durable URL-addressable selection**) / Monitor (observe-only, filters only, no durable selection) / Canvas (node-graph). A page with N jobs is N regions. **Tell us which contract the Media Library is** — we believe Workbench, but a "browse a stream of recent captures" region may be a Monitor, and if the page is genuinely two regions, say so.
2. **Data shape chooses the primary surface** — table | list | board | card | timeline | KPI zones | canvas. The contract does not dictate layout.
3. **URL is the state SoT.** A shared link must reproduce the exact view. (Already honored here for filters + view; this is a strength to preserve.)
4. **One sticky layer per scroll port.** Pinned chrome lives *outside* the `overflow-y-auto` body (`DashboardScrollShell`'s `chrome` slot), so in-body sticky headers dock at `top-0` with no offset math.
5. **Crossfade exactly one focus surface per region; never the collection map, list, or stream.** The navigator stays mounted and still.
6. **Action planes**: in-cell · row-scoped · multi-select · record. Each action gets one primary plane. Multi-select actions go through `ContextualSelectionBar` + `SelectionAction[]` with `enabled`/`minSelected`/`maxSelected` scoping.
7. **Compose the shared primitive; grow it when wrong; never fork a page-local twin.** A genuinely different job earns a *new sibling composing the same primitive*.
8. **Right-edge detail slot is single-owner** (`RightRailHost`), and `modal` is **per-occupant, defaulting true**; a pick-a-row-and-inspect-it surface should pass `modal={false}` (no scrim, no scroll lock, resizable). The dashboard order inspector already does this.
9. **Density is first-class** (`floor`/`ops`/`rollup`/`studio`) and wired to a CSS multiplier tightening spacing and type together.
10. **Motion budget**: opacity + transform only, sub-300ms, ease-out for discrete swaps; never animate `width`/`height`/`padding`; `prefers-reduced-motion` collapses transforms to pure opacity.

---

## 6. Constraints

- **No foreign design kit.** "Better" means stronger *within* Kinetic Ledger and its existing tokens (semantic color, density-aware spacing, named z-index bands, focus-ring SoT, elevation roles). Importing another product's visual language is out of scope.
- **No second visual language** beside the existing one without merging or deleting the old one.
- **Multi-tenant.** Every query is org-scoped (`organization_id` + tenant GUC). Any rollup, recents rail, or aggregate that leaks across tenants is a hard failure.
- **Desktop-only by policy.** `/ops/photos` is not in the mobile route allowlist; phones hard-redirect to `/m/home`. There is no mobile Media Library to keep in parity. (Mobile capture surfaces exist separately under `/m/*`.)
- **Folder counts must stay cheap.** The current design deliberately aggregates server-side rather than materializing photo rows to count them. Any proposal that requires loading the library to render navigation is a regression.
- **Existing capability must survive** any restructure: multi-select across pages, select-all-matching, ZIP download, share links (24h TTL) + durable share pages, attach-to-Zendesk, bulk label editing, NAS backup, saved views, per-photo context menu, keyboard nav, and the lightbox.

---

## 7. The questions

### Q1 — What is the correct primary navigation model for a photo-evidence library in 2026?

The current answer is a **calendar hierarchy** (Year→Month→Week→Day→Entity). Our hypothesis is that this is a 2005 file-system metaphor applied to a database, and that the entire industry moved off it.

Survey and rule. Specifically:

- **Consumer photo managers** — Google Photos, Apple Photos, Amazon Photos. All abandoned folder hierarchies for a **single reverse-chronological scroll with sticky date headers**, plus a zoomable timeline scrubber (day↔month↔year as a *zoom level of one continuous surface*, not as separate drill screens). When did that consolidate, and what was the measured argument?
- **Professional DAM** — Adobe Lightroom (catalog + smart collections), Adobe Bridge, Capture One, Photo Mechanic. These keep folders because a filesystem genuinely exists underneath. **Does that rationale apply when there is no filesystem — when "folders" are a `GROUP BY` over `created_at`?**
- **Enterprise DAM / MAM** — Bynder, Cloudinary Media Library, Frame.io, Brandfolder, Aprimo, Acquia DAM. What is the dominant 2026 navigation primitive: faceted filter rail, saved smart collections, or hierarchy? How do they handle "recent"?
- **Adjacent evidence/document systems** — Google Drive's "Recent" vs "My Drive", Dropbox, Box, Notion's file handling, Slack's file browser. Note especially: **Drive ships Recent and Folders as two peer top-level destinations with different affordances.** Is that the pattern we should be copying, and what does Drive's "Recent" actually render?
- **Ops/logistics evidence tools** — carrier proof-of-delivery archives, warehouse WMS photo capture, insurance claim evidence portals, bodycam/DEMS platforms (Axon Evidence is a genuinely close analogue: timestamped evidence, case-linked, chain-of-custody, bulk export). How do those navigate?

Give a ruling on the **default landing state**. Our strong prior is "reverse-chronological photo stream with sticky day headers, grouped by capture session," but we want it tested — including the counter-argument that an evidence system's legal/audit posture favors a durable, addressable hierarchy over an infinite stream.

### Q2 — Is a folder hierarchy justified at all here, and if so keyed on what?

If you keep folders, **what should the folder key be?** The data model (§4) offers, in rough order of operational meaning:

`PO / carton` · `order` · `Zendesk ticket` · `serial unit` · `SKU` · `source scope` (unboxing/packing/repair/claims/outbound) · `evidence stage` · `label` · `staff member` · `date`

The current build uses date for levels 1–4 and entity only at level 5. **That ordering appears exactly inverted relative to how operators name things** (§1: every job starts from an identifier, never from a year).

Address specifically:

- **Should the calendar be a *filter* rather than a *hierarchy*?** (i.e. a date-range picker + sticky date headers in a flat stream, which is what Google Photos, Drive Recent, and every modern DAM do.)
- **Should there be exactly one drill level** — a flat list of *capture sessions* (PO/carton/order/ticket), reverse-chronological, each expandable in place — instead of five?
- **Do ISO weeks ever belong in an operator-facing UI?** Argue it either way.
- **Path collapsing:** if a level has one child, should it be skipped? What do systems that keep hierarchies do about degenerate paths?

### Q3 — Tabs: what should the four top tabs actually be?

Today: **Recent · Today · Last 7 · All** — four *date filters* dressed as view tabs, two of which are the same state (§3.2), one of which fetches nothing (§3.1).

The house pattern for tabs is explicit (see `.claude/rules/display/workbench.md`): **"content-chrome tabs = lifecycle *facets* of ONE workspace"** — same records, same body shape, different stage filter — and **"sidebar mode rail = distinct *surfaces*"** with different jobs and body shapes.

By that law, **"Recent" (a flat stream) and "Folders" (a hierarchical drill) are different body shapes and arguably different region contracts** — so they may not belong in the same tab strip at all.

Rule on:

- Should the top tabs become **view/destination tabs** (Recent · Folders · Search results · Saved views) — the Google Drive model — with date as a separate filter control?
- Or should tabs stay **facets** (e.g. source scope: Unboxing · Packing · Claims · Outbound), with view mode as a segmented control?
- Or should there be **no tab strip** and the whole thing become filter chips + a single adaptive surface (the Linear/Height model)?
- **Whichever you pick: does every tab need to be independently addressable in the URL, and does every tab need to be a distinct, reachable state?** (Our §3.2 failure suggests the current model can't satisfy that.)

Name precedents. Distinguish clearly between **destination tabs**, **facet tabs**, and **filter chips** — we believe the app is currently mixing all three into one strip.

### Q4 — What goes in the 360px empty left sidebar?

`/ops/photos` renders an empty context panel (§3.7). Every DAM we can name uses that space.

Rule on what belongs there, distinguishing three things the app currently conflates:

1. **Navigation** — source scopes, saved views, label tree, entity folders. (Belongs in a persistent left panel.)
2. **Filter state** — date range, staff, damage-detected, has-analysis. (Belongs in chrome or a filter rail — which?)
3. **Inspection of current selection** — the selected photo's identity bundle (§4). (Belongs on the right, or in the main pane.)

Compare: Lightroom's left panel (catalog/folders/collections) vs right panel (metadata/develop); Bynder and Cloudinary's left facet rails; Google Photos' minimal left nav; Frame.io's project tree; Adobe Bridge's Folders/Favorites/Filter panels. **Is a left facet rail the 2026 standard for a DAM, and if so what is the standard *content order*?**

Note the constraint: house law says the left sidebar is *navigation*, and the right rail is *inspection* — and explicitly warns "don't invert the sidebar to hold related items where the picker belongs."

### Q5 — Search vs. browse: which should be primary?

The identifier finder (§3.6) already answers questions 1, 3, 4, and 5 from §1 in one keystroke, and it is a collapsed icon. The date drill answers none of them, and it is the whole canvas.

- What is the 2026 standard for **search-first vs browse-first** in a DAM of this size (tens of thousands of assets, strongly entity-linked)?
- Should the finder be **promoted to a persistent, always-open, prominent field** — violating the house `ToolbarSearchToggle` law — or does the law hold and something else should change?
- Should the media library be **folded into the app's existing hybrid search waist** (`hybridSearch` over `entity_search_docs`, keyword-trgm + pgvector + RRF), which currently doesn't index photos at all? House law says "never build a new per-surface search implementation" — the library arguably already violates it. Is consolidation correct, or is identifier-exact-match a legitimately different job?
- **Is there a role for the existing AI vision metadata** (`photo_analysis`, `damage_detected`) in navigation — e.g. a "flagged damage" smart collection? What do DAMs do with auto-tagging in 2026, and where does it fail to earn its place in the IA?

### Q6 — Reconciling with this codebase's own best surface

The outbound Workbench (`/dashboard`) is this repo's strongest collection surface: pinned chrome outside the scroll port, lifecycle facet tabs, a virtualized `LedgerGrid` with per-staff column preferences, URL-durable column sort, a multi-select `ContextualSelectionBar`, and a **non-modal, resizable right inspector** with a stable occupant id so arrowing record-to-record swaps content in place.

The Media Library adopted almost none of it.

- **Should the Media Library's `list` view become a real `LedgerGrid`** (photo as row: thumbnail · identity · SKU/serial · stage · labels · captured-by · time), inheriting column visibility, sort, and selection for free? Is a grid a legitimate *primary* surface for a photo library, or is it a power-user secondary alongside a visual grid?
- **Should selecting a photo open the non-modal right inspector** (identity bundle, labels, linked entities, analysis) instead of only the fullscreen lightbox? What's the industry split between *lightbox* (immersive, modal, single-asset) and *inspector* (persistent, non-modal, supports rapid triage across many assets)? Both exist in Lightroom, Bridge, Frame.io — how do they divide the work?
- **Where does bulk action chrome live** relative to the browse surface, and does the answer change between hierarchical and flat navigation?

### Q7 — The decision rule

Produce a **decision rule** — a compact table or 3–4 question flowchart — that an engineer can run to answer, for any media/asset collection surface:

*Does this get a hierarchy or a stream? What is the hierarchy keyed on, if any? What are the top tabs? Where does search sit? Where does per-asset detail open, and is it modal?*

It must slot into the existing four-contract vocabulary (Station / Workbench / Monitor / Canvas) rather than introducing a fifth taxonomy. Where a contract already implies the answer, say so.

### Q8 — 2026 design-system principles: audit the implementation

Beyond navigation, assess the Media Library's implementation against current design-system practice. Read the code, and address at minimum:

- **State modeling.** Two orthogonal axes projected onto one lossy control (§3.2) is the root cause of three separate defects. What is the current best practice for **URL-as-state in a faceted browse surface** — discriminated unions over boolean soup, `nuqs`-style typed search params, state machines for drill navigation? Is `PhotoLibraryFilterState`'s 20+ optional-string shape defensible at this size, or should it be a tagged union?
- **Progressive disclosure vs. discoverability.** Three of five view modes and the entire escape from folder mode are hidden (§3.4, §3.5). What's the 2026 line between "calm chrome" and "undiscoverable"? Is the collapsed-search-toggle pattern still considered good practice?
- **Empty and degenerate states.** A single-tile "2026" folder level is a degenerate state the design never considered. What's the standard treatment for degenerate hierarchy levels and low-cardinality facets?
- **Accessibility.** Assess the drill for keyboard and screen-reader users: a 6-click path with no landmark structure, tab state that misreports position (§3.2), and controls that unmount at certain depths (§3.4). What does WCAG 2.2 / APG require for a breadcrumb + tab + grid composite like this?
- **Performance.** Non-sargable PST date predicates (§3.8) against a `(organization_id, created_at DESC)` index; a 5-row leaf page; two queries that toggle `enabled` based on derived view state. What are the standard patterns for infinite media grids in 2026 (virtualization, `content-visibility`, responsive `srcset`/AVIF, blur-up placeholders, cursor pagination), and which are missing here?
- **Naming.** "Recent" that shows a year folder; "All" that is the same as "Recent"; "Latest" chip explicitly renamed to avoid colliding with the "Recent" tab (see the comment in `PhotoDateBreadcrumb.tsx`) — **that rename is itself evidence the model is confusing enough to need a disambiguating comment.** What's the standard vocabulary for these destinations?

---

## 8. Requested output format

1. **Executive answer** — 5–10 sentences. The recommended navigation model, stated as a decision, up front. What the landing state should be, what the tabs should be, and whether folders survive.
2. **Industry survey** — organized **by pattern, not by company**, each with named shipping examples and citations. Flag where practice has changed recently and why. Cover consumer photo managers, professional DAM, enterprise DAM, document/evidence systems, and ops/logistics evidence tools as distinct segments — they may not agree, and where they disagree, say which segment we resemble.
3. **Per-question rulings** — Q1 through Q8, each with a clear verdict, the reasoning, and **the strongest counter-argument you rejected**.
4. **The decision rule** (Q7) as a compact table or flowchart.
5. **Codebase reconciliation** — an explicit list of which §5 house laws your recommendation composes with, and which (if any) it asks us to change, with the argument for each. Call out any place our §3 diagnosis is wrong.
6. **Phased implementation sketch**, ordered by blast radius:
   - *Phase 0* — defect fixes that need no design decision (e.g. the All/Recent collision, the missing view escape).
   - *Phase 1* — the landing-state change.
   - *Phase 2* — hierarchy restructure or removal.
   - *Phase 3* — sidebar, inspector, search consolidation.
   Mark each item as **engineering decision** vs **product decision**.
7. **What to delete.** We would rather remove surface area than add it. Name what should go: orphaned view modes, the week level, the recency tabs, the client-side date tree (`date-folder-tree.ts`) now that the server aggregates, or anything else the recommendation obsoletes.
8. **Open risks** — where you're least confident, and what evidence (usage telemetry, a specific user test, an EXPLAIN plan) would resolve it.

Cite sources throughout — design-system documentation, published product decisions and their rationale, HCI research on hierarchical vs. faceted browsing and on search-vs-browse in large collections, and WCAG/APG guidance. **Where evidence is thin and you're extrapolating from convention, say so explicitly rather than dressing it up.**
