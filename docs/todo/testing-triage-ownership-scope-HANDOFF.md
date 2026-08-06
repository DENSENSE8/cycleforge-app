# Handoff — Testing triage: "My work / All" ownership scope

**For:** Cursor (paste § Prompt).
**Lane:** current checkout — stay on branch; attach to `:3050` (never start/restart/kill). User owns commits.
**Scope:** ONE full feature. Give the Testing **queue** tabs (Pending · Urgent · Returns) a per-staff **My / All** scope, backed by the assignment column that already exists, plus a floor gesture to assign — so an operator can see *their* testing queue and drop back to the whole pool.
**Explicitly NOT in this feature:** fixing the Urgent priority predicate, SKU→tech routing, saved views. See § Out of scope — each is its own follow-on handoff.
**Do not edit** any `*.plan.md`.

---

## Why this feature (the frame)

Testing triage has **two orthogonal axes** and they are currently collapsed:

| Axis | Question | Who owns it | Where it belongs |
|---|---|---|---|
| **Lifecycle / state** | "what *kind* of work is this?" | the **system** | Band-1 tabs (Urgent · Returns · Pending · All · History) |
| **Ownership / focus** | "whose work / which slice?" | the **operator** | Band-3 **staff facet** (My / All) |

Today the ownership axis only exists on **History** (`StaffFilterButton`). The queue tabs have no "mine" scope at all — every tech sees the whole undifferentiated pool. This feature adds the ownership axis to the queue tabs. It does **not** touch the lifecycle axis.

**The load-bearing rule for this feature:** a filter over a column nothing writes is a dead filter (this is the same trap the empty Urgent tab is in). "My tests" is only real if a tech can **assign** work to themselves from the floor. So an **assign gesture is mandatory**, not optional — it is what makes this a *full* feature.

---

## The one product decision (make this call first)

Default scope for the queue tabs when `?staff=` is absent:

- **Option A — default ALL (recommended).** Absent `?staff=` = the whole pool (today's behavior); picking a tech (or "Me") scopes to `assigned_tech_id = <tech>`. **No server change. Nothing is hidden by default.** "Removing the filter to see all" is the baseline; "Mine" is the opt-in. Ship this.
- **Option B — default MINE.** Absent = the signed-in tech's queue (like History), "All technicians" clears it. **Requires a server change**: strict `assigned_tech_id = me` hides the unassigned shared pool, so a tech sees an empty queue until work is routed to them (the directed-work trap). To make Mine a safe default you must widen the needs-test predicate to `assigned_tech_id = $tester OR assigned_tech_id IS NULL` (mine **or** unassigned). Only take this if the floor genuinely wants directed defaults.

**Recommendation: Option A.** It is zero-risk, matches the "see all by default, focus on demand" model (Linear/Zendesk), and needs no SQL change. Everything below assumes A unless the § Option B note says otherwise.

---

## Current wiring (start here — all confirmed)

| Layer | Path | Behavior today |
|---|---|---|
| Tab URL + normalize | `src/utils/testing-workspace-state.ts` | `?testTab=`; **`normalizeTestingWorkspaceTabParams` deletes `staff` for every non-history tab** (must change) |
| Band 1 (tabs) + Band 3 (triage) | `src/components/tech/testing/TestingWorkspaceHeader.tsx` | `TestingTriageBand` renders `StaffFilterButton` **only when `tab === 'history'`** |
| Body table | `src/components/tech/TestingHistoryList.tsx` | `testerId` resolved **only for history**; queue tabs pass no `tester`. queryKey includes `priorityOnly` |
| KPI twin | `src/components/tech/testing/TestingKpiStrip.tsx` | `queryTester` **only for history**; queryKey **omits `priorityOnly`** (already a latent twin drift) |
| Staff facet hook | `src/hooks/useStaffFilter.ts` | `?staff=` — absent/`0` = ALL; positive int = one staff; `allToken` opt makes absent = caller's Me default |
| Facet button | `src/components/ui/StaffFilterButton.tsx` | `iconOnly` · `allLabel` · `allToken` · `meLabel` — reuse verbatim |
| Multi-select actions | `src/components/tech/useTechTestingSelection.tsx` | Testing `SelectionAction[]` on `ContextualSelectionBar` — add the assign action here |
| Assign WRITE (already exists) | `PATCH /api/receiving-lines { id, assigned_tech_id }` → `upsertReceivingLineTesting` | perm `receiving.mark_received`; writes `receiving_line_testing.assigned_tech_id` |
| Assign READ/filter (already exists) | `GET /api/receiving-lines?view=needs-test&tester=<id>` → `src/lib/receiving/lines/build-sql.ts` needs-test arm | `if (tester>0) rlt.assigned_tech_id = $tester`; no tester = full pool (unassigned included) |

Network check when Mine is active: `GET /api/testing/receiving-lines?view=needs-test&return_scope=<scope>&tester=<id>&…` and the response is that tech's assigned needs-test lines.

---

## Implementation steps

### 1. Persist `?staff=` across the queue tabs
`src/utils/testing-workspace-state.ts` → `normalizeTestingWorkspaceTabParams`: stop deleting `staff` for queue tabs. Keep deleting `layout` / `weekOffset` (history-only) and `search` (as today). Staff scope should survive a Pending↔Urgent↔Returns switch.

### 2. Show the facet on the queue tabs
`TestingWorkspaceHeader.tsx` → `TestingTriageBand`: render `StaffFilterButton` for the queue tabs too, not just History.
- **Option A:** plain convention — `StaffFilterButton` **without** `allToken`/`meLabel` (absent = All; offers a quick "Me"). Keep History's existing `allToken="all"` + `meLabel="You"` untouched.
- Keep the sort icon logic as-is.

### 3. Scope the body to the tester on queue tabs
`TestingHistoryList.tsx`: today `testerId` is `null` unless `mode === 'history'`. For queue modes set `testerId = filteredStaffId` (from `useStaffFilter()`, `null` when absent = All). Pass `tester` to the request whenever `testerId != null` (the queue arm already accepts it). Add `testerId ?? 'all'` to the queryKey.

### 4. Move the KPI twin in lockstep (counts must match rows)
`TestingKpiStrip.tsx`: apply the **same** `testerId` resolution and pass `tester` on queue tabs. **The body + KPI queryKey and request params must be byte-identical** or React Query stops deduping and the strip disagrees with the table. While here, align the keys (the KPI key omits `priorityOnly` today — add it so urgent dedups too).

### 5. The assign gesture (mandatory — this is what makes Mine real)
Without a floor writer, "Mine" is empty for everyone and you've shipped a second dead tab.
- **Bulk:** add an **"Assign to…"** `SelectionAction` in `useTechTestingSelection.tsx` (staff picker → `PATCH /api/receiving-lines { id, assigned_tech_id }` per selected line, or a bulk variant if you add one). Include a one-tap **"Assign to me."**
- **Per-row (nice to have, same PR if cheap):** a quick "claim / assign to me" affordance on a needs-test row.
- Reuse the existing PATCH — do **not** invent a new endpoint. Confirm the tech role holds `receiving.mark_received`; if not, thread the correct permission rather than widening this one.
- Optimistic update + invalidate `['testing-workspace', …]` so the assigned row leaves the All pool / enters Mine without a manual refresh.

### 6. Honest empty-state copy
Distinguish the two empties on the queue tabs:
- All scope, nothing waiting → "No lines are waiting for testing."
- Mine scope, nothing assigned → "No tests are assigned to you. Switch to **All** to pick up unassigned work." (teach the escape hatch)

Update both `TestingHistoryList` `emptyMessage` and `TestingKpiStrip` `StripEmpty`.

### § Option B note (only if you chose default-Mine)
- `StaffFilterButton` with `allToken="all"` + `meLabel="You"` on queue tabs; body `testerId = explicitlyAll ? null : filteredStaffId ?? ownTesterId`.
- `build-sql.ts` needs-test arm: widen the tester predicate to `(rlt.assigned_tech_id = $tester OR rlt.assigned_tech_id IS NULL)` so Mine = mine **or** unassigned. Unit-test both membership shapes.

---

## Tests / guards

- `build-sql.test.ts` / `query.test.ts`: a `tester` on `view=needs-test` scopes to `assigned_tech_id`; no tester = full pool. (Option B: add the `OR IS NULL` case.)
- Component/spec: queue tabs render `StaffFilterButton`; selecting a tech puts `tester=<id>` on the request; "All" clears it; `?staff=` survives a queue↔queue tab switch.
- Keep the existing sheet guards green: `testing-workspace-sheet.guard.test.ts`.
- New guard: KPI and body issue the **same** request params for a given (tab, staff, search) — the twin contract.
- `npm run verify` green. Never raise a ratchet baseline.

---

## Done when

- On `/test?view=testing`, the queue tabs (Pending · Urgent · Returns) show a staff facet; default is the whole pool.
- Picking a tech (or "Me") scopes the table **and** the KPI counts to that tech's assigned needs-test lines; "All" restores the pool; `?staff=` persists across queue tabs and survives reload.
- The multi-select bar can assign selected lines to a tech / to me, and the assigned rows move between All and Mine live.
- Empty states distinguish "nothing waiting" from "nothing assigned to you."
- `npm run verify` passes.

---

## Out of scope (each = its own next handoff)

1. **Fix the Urgent predicate.** Urgent is empty because `priority_only=1` → `(is_priority = true OR priority_tier IS NOT NULL)` and dogfood rarely stamps those. Grow the shared priority membership SoT (`RECEIVING_PRIORITY_RANK_SQL` / `RECEIVING_LANE_RANK_SQL` in `build-sql.ts`, aligned with Unbox `isUnboxPriority`) so Urgent = the real priority queue — or redefine/remove it. This is a **lifecycle-axis** fix, independent of this ownership feature. (Original ticket: `testing-urgent-empty-HANDOFF.md`.)
2. **SKU→tech routing.** Wire the existing `work_assignments` model (`/api/assignments`, `/api/assignments/sku-search`, `entity_type=SKU_STOCK`, `work_type=TEST`) so a durable "this SKU is Alice's job" auto-populates a line's `assigned_tech_id` on intake. This turns per-line assignment (this feature) into standing routing.
3. **Saved views on the queue tabs.** `useSavedViews` + `TableOptionsMenu` (wired for `testing_history` today) → operator-named facet combos (`?staff=…&search=…`) on the queue tabs, per-staff and shareable.
