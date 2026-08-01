# Handoff — sidebar facet display: finish the pill-band sweep

**For:** a fresh Claude Code session
**Lane:** current checkout, no ad-hoc branch. Attach to `:3050`, never start it. User owns commits.
**Landed so far:** `2b92b29f8` (dead-code pass) · `78477fee0` (facet control + first 4 rows)
**Design source:** the merged plan in this session's workflow run `wf_7bcb9f6a-051`; the row inventory below is copied from it verbatim so you do **not** need to re-derive it.

---

## Paste this into a new Claude Code session

```
Read docs/todo/sidebar-facet-display-HANDOFF.md end-to-end, then execute it in order.

MISSION
Finish replacing the horizontal pill bands in sidebar rails with the vertical
SidebarFacetGroup control. Four rows are already migrated; ~15 remain across 9 files.
This is a display swap — every filter VALUE must stay reachable, and every existing
writer keeps its exact semantics.

THE ONE HARD RULE
Never delete a filter row without its values still being reachable. Four of the
remaining rows are backed by local useState with NO URL fallback — botch one and
those values become unreachable by any means, and nothing in `npm run verify`
will notice (no e2e covers them). Verify those four in a browser.

Start at §4. Do §3 first if SidebarFacetGroup is unfamiliar.
```

---

## 1. What this is, in one sentence

**The horizontal pill band goes; the values it held stay visible in a vertical facet list.**

## 2. The finding that reframed the task — do not re-litigate it

The original ask was "delete the modes display in the sidebar." A full app sweep found:

- **There is not one L2 page-mode pill row left in any sidebar.** Every `?mode=` rail already
  migrated to `GlobalHeader`'s `HeaderModeSwitcher` over `SIDEBAR_PAGE_NAV`. The consts that fed
  them are orphans (§6).
- **All ~19 surviving rows are secondary filters/facets**, and `display/workbench.md:62-64` names
  four of them *by example* as permitted to stay in the rail: *"Nested / secondary sliders (pairing
  sort, sourcing status, FBA plan/combine, inventory triage filters) may stay in the sidebar —
  those are not page L2."*

So a literal deletion would remove nothing that is a mode, and a lot that is load-bearing. **The
sanctioned reading — and the one already half-executed — is: replace the band, keep the values.**

## 3. The control (already built — compose it, don't re-invent)

**`src/components/sidebar/SidebarFacetGroup.tsx`** — an eyebrow label over a vertical
`SidebarSectionList` at `density="ops"`, pinned above the scroll body.

```tsx
<SidebarFacetGroup
  label="Status"
  sections={statusSections}      // SidebarSection<TId>[]
  active={status}
  onSelect={setStatus}           // the EXISTING writer, byte-for-byte
  ariaLabel="Voicemail follow-up status"
  action={/* optional trailing IconButton in the eyebrow row */}
/>
```

Why this shape: rows stay visible at rest **with their counts** — the band's one real virtue —
without its fixed 40px cost or its truncation past ~4 values. It is also what Linear / Height /
Superhuman do; nobody puts a segmented band inside the navigator column. It is a **promotion**:
`IncomingSidebarPanel` ("Views") and `PhotoLibrarySidebarPanel` ("Sources") had each independently
hand-copied this exact markup, and both now compose it.

### Four rules that are not negotiable

1. **`density="ops"` is baked in.** The list's default `comfortable` is the *Settings navigator*
   register (`py-3`, `text-sm`, per-row border). `ops` is the floor-rail register (`py-1.5`,
   `text-role-caption`, container `divide-y`, `QUEUE_ROW.selectedClass`). The wrapper bakes it so
   this cannot be got wrong — don't add a `density` prop to it.
2. **Never wrap it in an `h-full` host.** `SidebarSectionList` deliberately drops `h-full` under
   `ops` because it is a pinned block with siblings beneath it. Re-adding height makes it claim the
   column and paint over everything below — this already shipped once on the Media rail.
3. **`onSelect` is the existing writer, unchanged** — including default-sentinel deletion
   (`if (next === 'all') p.delete('status')`) and every coupled cascade (see the ⚠️ rows in §4).
4. **Carry the counts across.** Where the pill row showed a count, map it to `SidebarSection.count`.
   Losing those is real information loss.

### Where it mounts — three host shapes

| Host | Where it goes |
|---|---|
| `SidebarShell` panels | `headerAbove={…}` (append after any search block); **delete the `headerRows` entry** |
| Hand-rolled `flex h-full flex-col` panels | first child after the search block, **outside** the `min-h-0 flex-1 overflow-y-auto` div |
| `AdminSidebarShell` | keep the `filters={…}` slot, swap its child |

`headerRows[]` is *structurally* wrapped in the 40px `sidebarHeaderPillRowClass`
(`SidebarShell.tsx:103-107`); `headerAbove` is rendered bare (`:93`). **Moving between those two
slots is the whole mechanism** — `SidebarShell` needs no change.

> ⚠️ `VoicemailQueue`, `CallLogSidebar`, `SupportTicketsRecentRail` and `FbaWorkspaceSidebar` do
> **not** compose `SidebarShell` at all. They are hand-rolled flex columns — row 2 of the table.

---

## 4. The remaining rows

Ordered by risk. **Do Tier 1 first and verify each in a browser** — they have no URL surface, so a
botched writer makes the values unreachable by any means.

### Tier 1 — local `useState`, NO URL fallback ⚠️

| # | Row | Const | Mount to delete | Backing state (keep) |
|---|---|---|---|---|
| 1 | Inventory triage status (Open/Resolved/All) | `InventoryTriageSidebar.tsx:32-36` | `:121-130` (`headerRows`) | `useState<TriageStatus>('open')` @ `:78` → `useTriageList(q,status)` → `/api/tracking-exceptions?status=` |
| 2 | FBA Plan rail (Planned/Testing) | `FbaSidebarRails.tsx:95-98` | `FbaWorkspaceSidebar.tsx:99-102` | `useState<FbaPlanRailView>('planned')` @ `fba-workspace-hooks.ts:237` |
| 3 | FBA Combine rail (Recent/Packed) | `FbaSidebarRails.tsx:130-133` | `FbaWorkspaceSidebar.tsx:105-108` | `useState<FbaCombineRailView>('recent')` @ `fba-workspace-hooks.ts:238` |

> ⚠️ **Row 3 has a hidden writer.** `useEventBridge` force-sets `'packed'` on `FBA_COMBINE_STARTED`
> (`fba-workspace-hooks.ts:241-243`). Preserve it.

### Tier 2 — URL-backed (degrade to deep-link-only if botched, not lost)

| # | Row | Const | Mount to delete | Param |
|---|---|---|---|---|
| 4 | Issue status (All/Pending/In-progress/Deployed) | `IssuesQueue.tsx:29-32` | `:159-169` (`headerRows`) | `?status=` |
| 5 | Signals view (Timeline/Browse) | `signals-url.ts:14-18` | `OperationsSidebarPanel.tsx:378-388` | `?signalsView=` |
| 6 | Journey dimension (Order/Serial/Tracking) | `operations-sidebar-shared.ts:58-62` | `OperationsSidebarPanel.tsx:493` | `?dim=` |
| 7 | Pairing sort (Ordered/Confidence/Suggestions/A-Z) | `ProductsSidebarPanel.tsx:30-35` | same file | `?sort=` |
| 8 | Replenish tabs | `ReplenishSidebarPanel.tsx:35-39` | same file | `?rtab=` |
| 9 | Replenish pipeline chips | `ReplenishSidebarPanel.tsx:40-49` → `:143` | same file | `?rstatus=` |
| 10 | Sourcing lookup-by (Serial/Model) | `SourcingSidebarPanel.tsx:22-25` | same file | `?by=` |
| 11 | Sourcing alert + watch status | `SourcingSidebarPanel.tsx:26-36` | same file | `?status=` (per-mode sentinel) |
| 12 | Sourcing supplier type | `SourcingSidebarPanel.tsx:37-41` | same file | `?type=` |
| 13 | FNSKU catalog (All/Hydrated/Stubs) | `FbaCatalogSidebarPanel.tsx:92-100` | `:103-118` (`AdminSidebarShell filters`) | `?fbaFilter=` |
| 14 | Inventory ledger tabs (Activity/Bins/SKUs/Units/Alerts/Counts) | `InventorySidebarTabs.tsx:7-14` | same file | `tab` |

**⚠️ Coupled writers — dropping the cascade breaks the surface:**

- **5** also deletes `signalId` / `window` / `signalKind` / `q`.
- **6** also prunes the dimension keys (`useOperationsTimelineUrlState.ts:142-150`).
- **8** also clears `?rstatus=`.
- **9** also **force-sets `rtab=need`** — drop it and picking a stage shows no rows.
- **10** also drives the search placeholder (`:81`) and the helper copy (`:97`).
- **11** uses a *per-mode* sentinel (`live` for queue, `all` for watch, `:151-152`) deleted rather
  than written.

**Counts to carry:** row 9 (`counts[stage.key]`, `ReplenishSidebarPanel.tsx:141-149`) and row 13
(`stats.total/hydrated/stubs`, `FbaCatalogSidebarPanel.tsx:93-98`).

### Judgement calls, flagged not decided

- **Row 14 (Inventory ledger tabs)** is a **navigator**, not a filter — `tab` re-scopes the search
  fields (`InventorySidebar.tsx:240`), buckets (`:249`), placeholder (`:273`) and the results
  renderer (`:335`). Six vertical rows with counts is exactly the Linear shape, so
  `SidebarFacetGroup` fits. But it is the one row worth a second opinion; it does **not** belong in
  the GlobalHeader Mode switcher (that is reserved for `SIDEBAR_PAGE_NAV` L2 modes).
- **Row 15 — `EXPIRY_SORT_ITEMS`** (`WarrantyLoggerSidebar.tsx:24`) already lives inside the
  `SidebarShell` **Filters dropdown**, not the header band, and its value has a redundant plane (a
  removable refinement chip at `:48-55`). **Lowest priority; arguably already correct.**
- **The `N > ~5` escape.** A facet that must hold two values at once, or a column carrying 3+
  facets, belongs on `SidebarShell`'s first-class `filter` prop → `FilterRefinementBar
  variant="sidebar"`, not on `SidebarFacetGroup` (single-select by construction). `IssuesQueue`
  (row 4) already mounts `FilterRefinementBar` whose dropdown carries **only** type chips
  (`:98-127`) — the tidiest answer there is to move status into that same popover and drop
  `headerRows` entirely. The "~5 values flips the vertical budget" number is a **heuristic, not a
  measured fact** — confirm it on the first migration.

---

## 5. Delete `SidebarNavOverlaySlider` when row 6 lands

`src/components/sidebar/SidebarNavOverlaySlider.tsx` now has **exactly one** consumer left:
`OperationsSidebarPanel.tsx:493` (row 6). Once that migrates, delete the component and check
`knip-baseline.json` for a stale entry (**baselines only shrink**).

## 6. Dead consts still to sweep

| Const | File | Blocker |
|---|---|---|
| `RECEIVING_MODE_ITEMS` | `receiving-sidebar-shared.ts:50-56` | ⚠️ `route-mode-registry.guard.test.ts:13,20,25` asserts against it. **Retarget that guard onto `SIDEBAR_PAGE_NAV`'s receiving `modes` array first**, then delete. Also update the doc-reference at `station-nav-icons.ts:49`. |
| `WALK_IN_HISTORY_MODE_ITEMS` | `history-modes.ts:33` | Test-only consumer (`history-modes.test.ts:10,41`). Delete const + assertion. Keep the file's other exports. |
| `WALK_IN_HISTORY_ITEMS` | `history-categories.ts:17` | Test-only (`jobs.test.ts:14,72`). **Keep the `WalkInHistoryCategory` type** — `transactions.ts:17` imports it. |
| `WALK_IN_JOB_ITEMS` → `WalkInJobSwitcher` → `WalkInStationSidebar` → `WalkInSurfacePage` | `jobs.ts:17` | Whole chain unmounted (`/pickup` mounts `ReceivingSurfacePage`). Already in `knip-baseline.json`. Separate PR. |

`parseVoicemailStatus` (`support-sidebar-shared.ts:131`) is also dead — it is the helper for
URL-backing the voicemail filter, which was **deliberately deferred** (see §8).

## 7. Do NOT touch

- **`RouteShell.tsx:94`** — surfaces in any grep-driven sweep; it is the **mobile pane switcher**
  for `/support`, `/shipping` and two more routes. Not a sidebar row.
- **`TICKET_STATUS_ITEMS`** (`support-sidebar-shared.ts:105-111`) — same shape, but already mounted
  in **workbench chrome**, not the sidebar. It is the reference case, not a target.
- **The `/support` green lifecycle tab strip** — compliant (`WorkbenchChromeHeader density="band"` +
  `TabSwitch size="sm"`, allowlisted in `workbench-chrome-band.guard.test.ts:37`; the green is
  `bg-accent-bg`, the staff accent var the golden Outbound header uses). Do not "fix" it.
- Any `HorizontalButtonSlider` mount outside `src/components/sidebar/**` / context rails.

## 8. Deliberately deferred — decide before doing

**URL-backing the four `useState` rows.** House law says *"Selection and mode live in `searchParams`,
not React state"*, and voicemail is the lone outlier on its own page (`CallLogSidebar` reads
`?direction=`, `SupportTicketsBoard` reads `?tstatus=`). `?status=` is already a reserved param on
`/support` (`query-mode-routes.ts:64`) with no reader, and `parseVoicemailStatus` already exists.

**The catch:** `IssuesQueue` (row 4) *also* uses `?status=` on the same route. They are mode-scoped
so they never mount together, but two modes sharing one param key needs the mode-change clear to be
right. **Settle that before URL-backing either.** The display swap does not depend on it.

## 9. Verify

- `npm run verify` green. Never raise a ratchet baseline; **lower** any your deletions shrink.
- **Browser-verify Tier 1 in the real app** — attach to `:3050` (`preview_start { url }`), never
  start a server. Those three rows have no URL surface, so a spec cannot deep-link them and no e2e
  covers them; clicking is the only gate.
- `git status` before committing — a concurrent session shares this checkout and has had staged
  deletions in the index. **Stage only your own files**, never `git add -A`, never `git stash`.
- Work-log: `pnpm worklog "<action>" --result <r>`.

## 10. Definition of done

- [ ] All Tier 1 + Tier 2 rows compose `SidebarFacetGroup` (or the documented `filter`-prop escape)
- [ ] No `headerRows` entry anywhere holds a facet pill band
- [ ] `SidebarNavOverlaySlider` deleted, baseline shrunk
- [ ] Dead consts in §6 swept (or explicitly deferred with the guard reason recorded)
- [ ] Counts preserved on rows 9 and 13; every coupled writer cascade intact
- [ ] Tier 1 rows clicked through in a browser
- [ ] `npm run verify` green
- [ ] A short report naming any row you **refused** and why — refusals are the useful output

---

## Appendix — the other outstanding item (separate work)

**`/review?mode=catalog-link` → LedgerGrid.** The user chose *browse-a-queue → migrate* over
keep-sibling. Full spec (column models for both tabs, capabilities bag, the **four** guard
registrations, the `?colsort=` decision, and what must be preserved from the current 621-line
component) is in workflow run `wf_7bcb9f6a-051`, section C.

Three things from it that are easy to get wrong:

1. **Two column models, two `TableId`s, one capabilities bag, one mount file.** The tabs have
   disjoint identity facts — tab A has no tracking and no order id; tab B has no sku and no item
   number (the blank Item Number *is* why the row exists). Sharing one `TableId` means hiding
   `platform` on one tab hides it on the other.
2. **`inCellEdit: false`.** Tab B's Item Number looks like a textbook single-value in-cell field,
   but resolving it re-runs the sheet import and **creates an order**
   (`order-import-exceptions.ts:256-268`). Side-effectful multi-step work is the **record** plane.
3. **`setSection` must also delete `colsort`/`coldir`.** The two tabs have disjoint sort
   vocabularies, and `useUrlColumnSort`'s `isColumn` guard silently resolves an unknown key to
   `null` — so a surviving `?colsort=` shows unsorted while the URL claims a sort.

**It has zero test coverage today** — no e2e, no unit, no guard names it. Write the `qa-desktop`
spec (tab switch, deep-link selection, link, resolve, both ignores) **before** migrating.
