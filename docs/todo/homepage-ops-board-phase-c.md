# Homepage ops board, Phase C

Home Tasks as a project desk. Product lives on the dirty main checkout, not this worktree. This note closes the phase. It does not merge that UI here.

throughput checkpoint: n/a, prove-only against `http://localhost:3050`

## Predicate

At `/?mode=tasks` a staffer can, without hunting: create a project, add a task, change status from the row, assign a coworker in this org, and see the new assignee on the row. One DataTable (`tableId: 'tasks'`). Left Morphing. No Zoho board. No right-rail inspector.

## Result

| Job | Proof |
|---|---|
| Create project | Live plan `da30e8be-d12d-426c-9b01-7d613c2e7588` (“Desk repro project”) |
| Add task | Header `tasks-header-add-task` + composer `tasks-composer-commit`; POST 201 |
| Status from the row | Morphing Open / In progress / Done. Assign of an open task also promotes to `in_progress` (row paints ACTIVE) |
| Assign in this org | Morphing Assign → `getActiveStaff()` (`QA Packer` id 69). Not Ajax / USAV name lists |
| See assignee on the row | Playwright: `Desk repro project · QA Packer` on task `8b340740-15c0-49be-8867-05fd570935c2` |

Reuse: `DataTable` + `TaskMorphingRowActionMenu` (typed sibling of To-ship Morphing; `MorphingRowActionMenu` stays bound to `ShippedOrder`) + `DeskComposerAskLane`. Center Lock: `recordPlane.kind: 'none'`.

## Bug that blocked the row-paint job

PATCH stored Packer. The Open lane refetch could still paint Admin. `writeTaskIntoLists` lost to a stale GET. Fix on dirty main: overlay the newer `TaskRow` by `updatedAt`, `cache: 'no-store'` on the list fetch, `Cache-Control: no-store` on `GET /api/ops-plans/tasks`.

## Do not

- Commit the dirty main product unless asked
- Merge that UI into this spike branch
- Invent a second table stack or `StaffTaskInspectorRail` for the org board

## Next paste

Phase D. Org roster + `ops_plan_members`.
