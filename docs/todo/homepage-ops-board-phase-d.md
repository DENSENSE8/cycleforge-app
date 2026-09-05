# Homepage ops board, Phase D

Staff directory and project roster. Product lives on the dirty main checkout, not this worktree.

throughput checkpoint: n/a, prove-only against `http://localhost:3050`

## Predicate

Assign uses this org’s `getActiveStaff()`, not USAV `STAFF_NAMES` / `PACKER_IDS`. Project roster is `ops_plan_members` (GET/POST/DELETE). People adds someone to the project without stealing the task assignee.

## Result

| Job | Proof |
|---|---|
| Org roster | Morphing Assign / People load `/api/staff?active=true` via `getActiveStaff()`. QA org faces: Admin 67, Receiver 68, Packer 69, Technician 70, Shipper 71 |
| Invalid USAV pick | Ajax ids fail `INVALID_ASSIGNEE` in this org — expected |
| People adds roster | Playwright click `QA Shipper` → POST `/api/ops-plans/{plan}/members` **201**, member staffId 71. GET members: Admin, Packer, Receiver, Shipper, Technician |
| Assign ≠ People | Assign writes `ops_plan_tasks.assignee_staff_id`. People writes `ops_plan_members` only |

`ops_plan_members` routes and `AddPlanMemberBody` are on dirty main. Audit: `OPS_PLAN_MEMBER_ADD` / `OPS_PLAN_MEMBER_REMOVE`.

## Left as directory gap (not a D fail)

`normalizeStaff` still drops `color_hex` / `avatar_photo_id`. Avatars keep resolving through `staff-colors`. Phase A already logged that. Assign does not need those fields.

## Next paste

Phase E. Impeccable polish only, or skip with reason.
