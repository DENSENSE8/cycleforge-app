# WS-NAV-IA — Phase 4: lane-based master nav

**Lane:** `nav-ia` · `topic/nav-ia` · `E:\cycleforge-nav-ia` · :3130 · `unlockParked: true`
**Base:** `ebd999d9`
**Scope:** Phase 4 only. Phases 1–3 belong to `main`.
**Upstream brief:** `docs/todo/page-consolidation-station-first-GEMINI-RESEARCH-BRIEFING.md` (read its two AUDIT CORRECTION blocks first — the original orphan table and the §6 middleware claim are both superseded).

---

## 0. BLOCKING — do not write nav code until this clears

This lane branched from `ebd999d9`, which contains `src/components/layout/station-rail/`
(a floating dock that portalled station content **over the work canvas**).

**`main` has since abandoned that design.** An in-flight change there deletes all three
`station-rail/` files and replaces them with `src/components/sidebar/station-column.ts` — a
**two-card sidebar column**: nav card flush to top (expands downward), recents + scan bar
flush to bottom, gray backdrop showing between. Both cards stay **inside** the 360px rail.

Consequences:

1. **The rail is not being emptied.** An earlier reading of the rail dock — that it vacates
   the 360px column and leaves it free for lane nav — is **void**. Lane nav must share the
   column with a station card, as the top card of a two-card shell.
2. **Five-file collision.** Phase 4 rewrites `MasterNav.tsx`, `MasterNavView.tsx`,
   `MasterNavDropdown.tsx`, `SidebarShell.tsx`, `sidebar-navigation.ts`. All five are being
   edited in `main` right now. A worktree isolates the filesystem, **not** the merge.

**Gate:** wait for main's station-column work to commit, then
`git rebase main` (or `git merge main`) in this lane and re-read `station-column.ts`
before the first nav commit. Building on `ebd999d9` guarantees a rewrite.

---

## 1. What Phase 4 is actually solving

Not page count. The Phase 1 audit (see the brief's correction block) found **zero** dead
pages: every unreachable route was a live feature, a legacy redirect, dev tooling, or an
**unlinked feature with a capability existing nowhere else**.

> The app carries ~4,400 LOC of **working features nobody can navigate to.**

That is a navigation failure, and it is the strongest argument for lanes: features fell off a
flat 15-row nav and kept running. **Phase 4's success criterion is therefore not "fewer
rows" — it is "no capability without a navigation path."**

---

## 2. Lane model

Six top-level lanes. Selecting a lane scopes the nav to its surfaces; the L2 mode rail is
unchanged (74 modes stay exactly where they are — this phase does not touch mode routing).

| Lane | Surfaces | Notes |
|---|---|---|
| **Dashboard** | `/dashboard` | 3 modes unchanged |
| **Inbound** | `/unbox` · `/triage` · `/incoming` · `/pickup` · `/repair` · `/test` · `/review` | The receiving family already shares one `page_key`; `test`/`review` are bench work on the same units |
| **Outbound** | `/pack` · `/shipping` | `?mode=fba` already hosts FBA prep |
| **Workspace** | `/inventory` · `/warehouse` · `/products` · `/ops/photos` | Reference + record editing (all Workbench) |
| **Front Desk** | `/walk-in` · `/support` | FOH commerce + helpdesk |
| **Admin** | `/admin` · `/settings` | 17 + 8 sections unchanged |

Parked surfaces (`home`, `operations`, `sourcing`, `studio`, `ai-chat`) must slot in
**without reshaping the lanes** — the lane set is designed for 21 surfaces, not today's 15:
`home` → Dashboard lane · `operations` → Dashboard lane · `sourcing` → Workspace lane ·
`studio` → Workspace lane · `ai-chat` → Dashboard lane.

---

## 3. Homes for the unlinked features (from the audit)

Each of these is a working capability with **no** nav path today. Phase 4 must either give
it one or record a deliberate retirement. **Do not delete any of them** — each was checked
and each holds something unique.

| Feature | Unique capability | Proposed home |
|---|---|---|
| `/reports` | `/api/reports/bin-utilization` — **one caller in the repo** | Workspace lane, or fold bin-utilization into Warehouse |
| `/calendar` | `WorkOrderCalendar` + live E2E; ≠ Admin staff shifts | Front Desk lane (work-order scheduling) |
| `/tracking-exceptions` | `TrackingExceptionsTable.tsx:164` — the **only** `DELETE` path for `/api/tracking-exceptions/[id]` | Fold the delete action into Inventory → Triage, then retire the page |
| `/admin/inventory/**` | `bulk-allocate`, `holds` — zero implementations elsewhere | Admin lane as explicit sections, or migrate to Inventory modes |
| `/photos` | Full-page NAS browser (vs. picker modals) | Workspace lane beside Media library, or retire |
| Inventory `bins`/`skus`/`units`/`alerts`/`counts` | Real routes + search configs, absent from the mode rail | Reconcile the rail with `INVENTORY_TABS` (8, not 5) |

---

## 4. Implementation notes

- **Grow `sidebar-navigation.ts`, don't fork it.** `APP_SIDEBAR_NAV` already carries
  `kind: 'main' | 'station' | 'bottom'`. Add a `lane` field and a `LANES` registry beside it;
  keep `getSidebarNavItems()` as the filtering waist (permissions + parked filtering must
  keep working untouched).
- **`SIDEBAR_PAGE_NAV` is out of scope.** Modes, `to()`/`resolveMode()`, and the round-trip
  invariant test stay exactly as they are.
- **Lane selection is UI state, not a route.** Do **not** add `?lane=` — it would collide
  with the L2 `?mode=` contract and add a fourth nav level. Derive the active lane from the
  current route via the existing `getSidebarRouteKey()`.
- **Compose the two-card column** (`station-column.ts`) rather than adding a third card.
- **Guards:** `sidebar-navigation.test.ts` and `src/lib/stations/surface-routing.test.ts`
  both assert nav shape — extend, never weaken. `npm run verify` before any commit.

---

## 5. Sequence

1. Rebase onto `main` once station-column lands; re-read `station-column.ts`. **(gate)**
2. Add `lane` + `LANES` to `sidebar-navigation.ts` + tests. No UI change yet.
3. Render lanes in `MasterNavView` as the top card; keep every existing row reachable.
4. Wire the §3 unlinked features into their lanes.
5. Reconcile the Inventory mode rail with `INVENTORY_TABS`.
6. `npm run verify`, then hand back for review.

---

## 6. Out of scope / escalate first

- **Route gating.** There is **no `middleware.ts`** in this repo and `permissionForPath()`
  has zero runtime callers — `ROUTE_PERMISSIONS` is dead config; enforcement is per-page
  opt-in on 24/137 pages. Lanes hide *more* surfaces from nav while gating exactly as much
  as before: nothing. Reinstating a real route gate is a **security** change → ask first,
  do not bundle into this lane.
- Deleting any surface (see §3).
- Phases 1–3 (`main`).
