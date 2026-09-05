# Homepage ops board, Phase A spike

Read-only inventory against `main` at `daeb1c1f2`. No product UI in this commit.

throughput checkpoint: n/a, read-only investigation

## Overview

Home (`/`) is already a workbench with three URL modes. `daily` is the org checklist. `today` is My Day. `tasks` is one staffer's `staff_todos` sheet, not an org ops board. `/operations` is a Monitor. It is not the Home board.

The reusable To-ship action stack lives on `main`. The CYC-82 left-gutter morphing menu does not. That menu lives on branch `cyc-82-morphing-action-menu` and as uncommitted files on the dirty main checkout. Phase C must import it, not copy it, and must not take CYC-82 OM ingest with it.

## Key concepts

**Home Tasks on `main`.** Personal `staff_todos`. Slot-table family `tasks`. Record plane is `StaffTaskInspectorRail` at `detail:staff-task` (RightRailHost). Center Lock forbids that shape on desks.

**Org plans already in the database.** `ops_plans` / `ops_plan_phases` / `ops_plan_tasks` / `ops_plan_task_links`. Home does not mount them. `ops_plan_members` is not on this `main`.

**To-ship selection.** `GridRowCheckbox` in the gutter. `useOrdersQueueSelection` for the open record (typed to `ShippedOrder`). `DataTable` `selectionActions` into `TableStatusBar` plus `useSelectionStatusBarHotkeys` (`?` reveal). `CompoundRow` + `compound-row-actions.ts` for the ⋮ keyboard and right-click path.

**Staff cache.** `getActiveStaff()` hits `/api/staff?active=true`, then `normalizeStaff` keeps only `id`, `name`, `role`, `roles`. The API also returns `color_hex`, `avatar_photo_id`, `employee_id`, `active`, `default_home_path`. Avatars resolve those via `@/utils/staff-colors`, not the cache.

## How it works

To-ship paints a compound row. The leading track is select. Bulk verbs sit on the table foot. Assign-in-cell uses `StageStaffAssignPopover` → `AssigneeCombobox`. Shift+F10 / Menu / right-click opens the shared ⋮ trigger.

Home Tasks reuses `CompoundRow` and the `tasks` layout hook. The gutter check toggles todo done-ness, not multi-select. There is no `selectionActions` strip. Writes live in the right rail. That is the fork the lock forbids repeating.

CYC-82 morphing (not on `main`) opens from the same gutter, `left-start` against the row, commits assign on click, and filters faces through `morphingRoster`. That roster hard-codes USAV first names and `PACKER_IDS`. Reuse the menu shell. Do not reuse the name allow-list as a product roster.

## Where things live

| Job | Path |
|---|---|
| Home shell | `src/features/home/HomeWorkspace.tsx`, `home-modes.ts` |
| Home Tasks | `src/features/tasks/TasksWorkbench.tsx` |
| Tasks inspector (rail) | `src/features/tasks/StaffTaskInspector.tsx` |
| To-ship row | `src/components/dashboard/orders-queue/OrdersQueueTableRow.tsx` |
| To-ship selection | `src/components/dashboard/orders-queue/useOrdersQueueSelection.ts` |
| Foot CTAs + `?` | `src/components/tables/TableStatusBar.tsx`, `src/hooks/useSelectionStatusBarHotkeys.ts` |
| Compound row + ⋮ | `src/components/tables/compound/CompoundRow.tsx`, `compound-row-actions.ts` |
| Select gutter | `src/components/ui/GridRowCheckbox.tsx` |
| Assign combo | `src/design-system/components/AssigneeCombobox.tsx`, `StageStaffAssignPopover.tsx` |
| Morphing (other branch) | `src/components/outbound/orders/to-ship/MorphingRowActionMenu.tsx` on `cyc-82-morphing-action-menu` |
| Staff cache | `src/lib/staffCache.ts` |
| Staff list API | `src/app/api/staff/route.ts` |
| Settings directory | `src/app/settings/staff/page.tsx` |
| Dogfood name map | `src/utils/staff.ts` (`STAFF_NAMES`, `PACKER_IDS`) |
| Slot-table peers | `src/lib/tables/slot-table-cohort.ts` (`tasks`, `daily`, `my-day` already on engine) |

## Reuse. Do not fork.

Bring these onto Home as-is, with a typed adapter for the row record.

1. `TableStatusBar` + `SELECTION_STATUS_BAR_META` + `useSelectionStatusBarHotkeys`
2. `CompoundRow` / `CompoundSelect` / `compound-row-actions.ts`
3. `GridRowCheckbox`
4. `AssigneeCombobox` + `StaffAvatar`
5. `DataTable` `selectionActions`
6. `MorphingRowActionMenu` after it lands on `main`, parameterized off `ShippedOrder`. Do not add `TaskMorphingRowActionMenu`.

`useOrdersQueueSelection` stays To-ship. It is bound to `ShippedOrder` and the shipped-details event bus. Do not generalize it in Phase B.

## Staff directory gaps

- Floor cache drops photo, colour, active, home path even though `/api/staff` returns them.
- Settings `/settings/staff` is the admin directory (invite, deactivate, `color_hex`, PIN). Floor assigners never see it.
- Present-today (`getPresentStaffForToday`) is a second fetch. An ops board has not chosen active-vs-scheduled.
- `STAFF_NAMES` / `PACKER_IDS` / CYC-82 `morphingRoster` are USAV first-name allow-lists. A sellable tenant cannot assign from that list.
- Lane roles (`technician` / `packer`) patch the cache via `patchCachedStaffLaneRole`. Project membership is a different fact. UNKNOWN whether the board uses lanes, RBAC `staff_roles`, or a plan roster.
- No `ops_plan_members` table on this `main`.

## Schema UNKNOWN

Mark these before Phase C writes SQL.

| Item | What is known | UNKNOWN |
|---|---|---|
| Board row store | `staff_todos` backs Home Tasks. `ops_plan_tasks` exists and is unused on Home. | Which table is the ops board row. Merging them is forbidden by current comments. |
| Plan roster | `ops_plan_tasks.assignee_staff_id` is a single staff FK. | Multi-assignee. `ops_plan_members` is absent on `main`. |
| Status | `ops_plan_task_status` is `open` / `in_progress` / `done` / `canceled`. `staff_todos` uses `completed_at` + archive. | Board columns and legal transitions. |
| Due | `ops_plan_tasks.due_at`. Compact `DateRangePickerField` is the in-cell date. | Whether Home paints due. |
| Links | `ops_plan_task_links` points at `work_assignment` / `inventory_event` / `manual`. | Whether a board row must link an order. |
| Org isolation | Ops plan tables carry `organization_id` + RLS. `staff_todos` is staff-scoped. | Cross-staff org board query. |
| Linear | Lock says Linear is task SoT. | Ticket ids. Linear MCP needed auth. |
| Phase C–E | Locked out of this run. | Concrete jobs. Original goal file missing. |

## Gotchas

The dirty main checkout already contains a Home Tasks rewrite onto `ops_plan_tasks` plus a forked `TaskMorphingRowActionMenu`. That is a different task. Do not merge it into this branch.

Home Tasks `CompoundSelect.onToggle` marks the todo done. To-ship `onToggle` membership-selects. Reusing the gutter without splitting those jobs will check off tasks when the operator meant assign.

`ordersCompoundColumnsFor` drops the shared actions ⋮ on Orders / To-ship. Copy lives on identity chips. A Home board that remounts ⋮ fights that paint law.

Slot-table known debt on this `main` is `catalog-orphan:fba:FBA_FIELD_CATALOG` and `table-columns-zombie:support-tickets`. Neither is `tasks`. The `tasks` family is still an engine peer. Header-sort and funnel law apply before new board verbs.

## Next paste

**Phase B (slot-table bugs).**

Home Daily, Home Tasks, and My Day already sit on the slot-table engine. Phase C would add board verbs on that same waist. Fix engine bugs first. Then Phase C can mount To-ship selection and row actions onto Home without a second table stack.

Phase C stays locked until Phase B is green. Do not start Packing, Testing, or CYC-82 OM ingest.
