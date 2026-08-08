# Handoff — Regional sidebar split (scan periphery ≠ Workbench saved-views rail)

**For:** next Claude Code / Cursor agent session
**From:** Cycle Forge engineering
**Date:** 2026-08-07
**Lane:** current checkout — no ad-hoc branch. Attach to `:3050`. User owns commits.
**Status:** architecture already **locked** — implement, do not re-litigate.

**This is a directive, not a fresh design.** The regional split is ruled in
[`unbox-pin-pattern-harden-CLAUDE-CODE-PROMPT.md`](./unbox-pin-pattern-harden-CLAUDE-CODE-PROMPT.md)
§1.1 (regional split), §1.3 (saved-view buckets), §1.4 (collapse/expand vs grid
real estate) + [`.claude/rules/source-of-truth.md`](../../.claude/rules/source-of-truth.md)
→ Frame column budget · Right-rail modality and
[`.claude/rules/display/workbench-ops-queue.md`](../../.claude/rules/display/workbench-ops-queue.md)
→ Tabs vs saved views. Read those first.

---

## Goal (one line)

Permanently separate the **act-and-clear scan-station periphery** (MRU / scan
history / error toasts — ephemeral) from the **durable Workbench saved-views left
rail** (facet combinations over one collection). `/unbox` gets the scan
periphery; `/incoming` gets the saved-views rail.

---

## ⚠️ Premise corrections (read before coding)

The originating brief has three premises that do **not** match this codebase.
Follow the corrected version:

| Brief said | Reality | Do this instead |
|---|---|---|
| "Update `GridSurfaceDescriptor` to conditionally render sidebars by route" | `GridSurfaceDescriptor` (`@/design-system/components/grid`) is grid **state** only — column model, sort, visibility, capabilities. It has **no** sidebar/layout concern. | Route-level layout owns which rail mounts. Compose `ContextPanelLayout` (`src/components/sidebar/context-panel-column.ts`) per route; the grid descriptor is unchanged. |
| "applies facet combos … without mutating the underlying `tableId`" | Correct **and** already the S3 contract — `tableId` is the per-staff **prefs bucket**, never a filter. Facets are **URL params** (nuqs model). | Apply saved views through `useSavedViews` → URL params (`?…`) read by the grid's existing filter path. Never touch `tableId`. |
| "exception triage … existing internal identity transitions … no new terminal states" | Already house law — an exception is an **orthogonal `exception_code`** on the row (`receiving_exceptions` via `recordReceivingException`), **never** a terminal `FAILED` `workflow_status`. | Exception-triage saved views filter on `exception_code` / real `transition()` history — do **not** invent a status. |

---

## Region contract (the whole point)

Run `pickArchetype` per region ([`contextual-display.md`](../../.claude/rules/contextual-display.md)):

| Region | Contract | Left / periphery |
|---|---|---|
| **`/unbox` scan station** | **Station** — scanner-driven, act-and-clear, selection **ephemeral** (never URL) | MRU · immediate scan history · error toasts · scan bar. **No** saved-views rail. |
| **`/incoming` desk** | **Workbench `ops-queue`** — pick→edit, durable URL selection | `ContextPanelLayout` left rail = **Saved Views** (`SavedViewsList` / `useSavedViews`). Band-1 = system lifecycle tabs only. |

**Never** cross them: no saved-views rail in the scan column; no browse list stealing scan focus (`display/station.md` §1).

---

## Milestones → real SoTs

### M1 — Route layout decides the rail (structural, cheap)
- `/unbox` route layout suppresses the saved-views rail; mounts the scan periphery.
- `/incoming` route layout mounts `ContextPanelLayout` + `SavedViewsList`.
- SoT: `ContextPanelLayout`, `context-panel-column.ts`, `SidebarShell`. **Not** the grid descriptor.
- Guard: a `*.guard.test.ts` asserting `/unbox` mounts no `SavedViewsList` and `/incoming` does.

### M2 — Workbench saved-views rail
- Compose `useSavedViews` (`src/hooks/useSavedViews.ts`) + `SAVED_VIEW_SURFACES` (`src/lib/saved-views/surfaces.ts`) — the polymorphic `saved_views` table (org-scoped, `staff_id`-owned, `is_shared`). Reference consumer: `OutboundSavedViewsList`.
- Standard buckets (harden §1.3): Exception triage · SLA/expedites · Special handling · Batch ops — each a **facet combination**, never a Band-1 tab.
- Apply = write URL params; the grid re-filters. **No `tableId` mutation, no page reload.**
- Density: dense rows (`NAV_ROW.selectedClass` for the selected view — quiet sunken wash, **not** `QUEUE_ROW.selectedClass`).

### M3 — Scan-station ephemeral periphery
- MRU / recent: compose `SidebarRecentRailBase` + `CompactActivityRow` + `RailRowBody` + `formatLaneAgeCompact` (age `4h`), scrolled via `SidebarRailScrollport`. Selection **ephemeral**.
- Wedge input: `wedge-scan` events + `useRegisterScanTarget` (`src/lib/scan-hotkey/`). Error toasts = `@/lib/toast` / big active-card fail state — **never** `window.alert` (steals wedge focus).
- Perf (<50ms): keep the row primitive cheap (no heavy re-render per scan); optimistic prepend to the MRU list (existing rail pattern), not a refetch.

---

## Collapse / expand (harden §1.4 — do not invent a second collapse)
- **Operator-owned park only.** Width pressure **never** auto-closes the left rail. Yield ladder (`frame.ts`): shrink the **right** panel first → center floor (`MIN_WORK_SURFACE_PX` desk / `STATION_PUSH_CENTER_FLOOR_PX` = 720 station) → context rail parks only on an **operator** gesture (`RailFilterCollapseButton` / drag-past-min via `CONTEXT_PANEL_COLLAPSE`).
- Grid keeps real estate by **horizontal scroll / lean embed column set** (S3's `incoming_embed` bucket), not by auto-parking the rail.

---

## Success thresholds (from the brief) → how to meet them here
- **Perf <50ms MRU / toast:** cheap row primitive + optimistic prepend; verify in Playwright on `:3050` (real runner, not the embedded preview — `verify.md` "Measure in the real runner").
- **State integrity — 100% data-lineage guards / no new terminal states:** exception views filter `exception_code` + `transition()` history. Add a guard asserting no new `workflow_status` enum value and no `SET workflow_status='FAILED'` shortcut.
- **Visual density — 1080p, no padding inflation / nested scroll:** one scroll port per region (`ui-design-system.md` → Scroll ownership); host = flush (`p-0`), pad on the row (`inset-*`); no `min-h-*` voids.

---

## Sequencing recommendation (answer to "UI scaffolding first, or data/guards first?")

**Data/state + guards first — with only a thin routing shell up front. Build the dense Tailwind UI last, on verified state.** Order:

1. **M1 routing shell** (thin) — just enough to *see* the split (`/unbox` no rail, `/incoming` rail slot). Cheap, structural, de-risks layout.
2. **M2 + guards** — saved-views facet-apply that never mutates `tableId`, and the exception-triage-via-real-transitions guard. **This is where the hard thresholds live**, and guards are enforcement here, not documentation. Locking state before UI avoids building on the wrong contract.
3. **M3 dense UI + <50ms MRU** — polish on top of verified state; it rides an existing rail pattern, so it's the lowest-risk step.

**Why this order:** the success thresholds are dominated by *state integrity* and *data lineage*, not layout. In this repo guards are laws (`CLAUDE.md`: "Hooks/tests are real enforcement; prose rules are recipes"), `saved_views` is an existing SoT to **compose**, and the risky work is the facet-apply + exception contract — not the rail markup. UI built on an unverified state contract is rework. The one exception is the thin M1 shell, which is cheap and worth doing first purely to visualize.

---

## Non-negotiables
- Compose `LedgerGrid` / `useSavedViews` / `ContextPanelLayout` — no second table engine, no second saved-views store, no second collapse mechanism.
- Never start/restart/kill `:3050`. User owns commits; stage only your own files; no `git stash`.
- `npm run verify` green before done; never raise a ratchet/knip baseline to pass.
- Floor-simulation integration test on `:3050` (QA org, not dogfood — `verify.md`) before any merge.
