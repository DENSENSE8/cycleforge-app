# Throwable tasks (WS-TASKS) — handoff

**Replace the paper-and-text assignment loop** — "someone writes a tracking
number on paper and texts it to a colleague" — with assignment through the
inbox. Fast-paced floor, so latency and discoverability both matter.

| | |
|---|---|
| Lane | `/Users/icecube/repos/cycleforge-tasks` (sibling of `cycleforge-app`) |
| Branch | `topic/tasks`, branched from `main` @ `aeaa12185` |
| Registry | `dev-worktrees.json` + `docs/portfolio/WORKTREE-LANES.md` (WS-TASKS, port 3160) |
| Deps | `pnpm install --frozen-lockfile` already run in the lane |
| State | **Everything below is UNCOMMITTED.** Migrations are **APPLIED** to the live DB. |

---

## 0. Read this first — three things that will bite you

1. **`npm run verify` is RED in this lane, and none of it is this work.** A
   clean checkout of committed `main` fails four gates before any of our code
   exists. See §6. Always attribute a failure with
   `git diff --name-only HEAD` before assuming it is yours.

2. **The rules files have drifted from the code — three times in one session.**
   Treat `.claude/rules/*` as leads to verify, not facts:
   - `enforce_tenant_isolation('work_assignments')` appears in **no** migration,
     yet the table *is* FORCE-RLS'd (bulk sweeps used DO-block loops). **Grepping
     migrations for that literal gives false negatives — check
     `pg_class.relforcerowsecurity`.**
   - `CompactActivityRow`, `RailRowBody` and `compact-activity-row.guard.test.ts`
     are documented in `source-of-truth.md` as the SoT with a golden consumer and
     a guard. **None of them exist on main.** `ActivityInboxPopover` really uses
     `KIND_META` + `Pill` + `formatDistanceToNowStrict`.
   - The GlobalHeader zones table claimed goal + work-order sat in
     `GlobalHeaderActions`. They were in the **left nav cluster**, which the same
     rule says must never hold them. Corrected in this branch.

3. **The four migrations are applied and therefore IMMUTABLE.** The runner keys
   `schema_migrations` on (filename, sha256) and exits non-zero on any edit. Any
   fix is a **new** file.

---

## 1. Architecture — three layers, one SoT each

| Layer | SoT | Status |
|---|---|---|
| **Urgency** | `src/lib/urgency/` — one binary `urgent \| normal` rung over order · carton · ticket | done |
| **The task** | `work_assignments` with `work_type = 'FOLLOW_UP'` | done |
| **Triage** | `staff_inbox_items` (durable) + the bell (live) | done |

A throw does up to three things: creates the task, promotes the record's
urgency, notifies the assignee. **Only the first is a commitment** — the other
two are amplifiers that may fail without failing the throw.

---

## 2. What is done

### Phase 0 — lane + rules
- Lane registered; `.claude/rules/source-of-truth.md` gained **Cross-entity
  urgency** and **Inbox surfaces** sections + two registry rows; one-line hard
  law in `AGENTS.md`.

### Phase 1 — urgency SoT
- `src/lib/urgency/urgency-targets.ts` (pure vocabulary, client-safe)
- `promote-urgency-core.ts` (pure routing, Deps-injected)
- `promote-urgency-deps.ts` (server bindings, compare-and-set)
- `promote-urgency.ts` (entry: `promoteUrgency(orgId, { entityType, entityId, level? })`)
- `urgency-targets.test.ts`, `promote-urgency-core.test.ts`, `urgency-sot.guard.test.ts`
- `knip.config.ts` has a **dated ignore** for `src/lib/urgency/**` — **delete it
  in Phase 4**, when `promoteUrgency` gets its first UI consumer.

### Phase 2 — schema (APPLIED)
- `2026-08-08a` — `work_type_enum += FOLLOW_UP`, `work_entity_type_enum += SUPPORT_TICKET`
- `2026-08-08b` — `entity_id` → BIGINT; canonical `assignee_staff_id` + backfill +
  `fn_sync_work_assignment_assignee()`; `ux_work_assignments_active_entity`
  re-led with `organization_id` and **FOLLOW_UP exempt**; cancel function widened
  to include `OPEN`; `SUPPORT_TICKET` delete trigger.
- Drizzle model updated (`entityId` bigint, `assigneeStaffId`, both enum values).

### Phase 2b — create path
- `src/lib/tasks/task-vocabulary.ts` · `create-task-core.ts` · `create-task-deps.ts` · `create-task.ts`
- `POST /api/tasks` — perm `work_orders.claim`, Zod, idempotency key, audit
  `work_task.throw`. `docs/security/route-permissions.json` re-emitted.
- `AUDIT_ENTITY.WORK_ASSIGNMENT` + `AUDIT_ACTION.WORK_TASK_THROW` added.

### Phase 3 — inbox writer + the missing Ably leg
- `src/lib/notifications/assign-inbox-item.ts` — the **create path
  `staff_inbox_items` never had**. `reason: 'assigned'` had been in the CHECK
  since 2026-07-28 with no writer.
- `event-vocabulary.ts` — private `ASSIGNMENT_EVENTS` + exported `WORK_TASK_ASSIGNED`
  + `eventLabelFor()` (one label resolution point across both registries).
  `inbox.ts` `toItemDto` now calls it.
- `publishInboxItem()` in `src/lib/realtime/publish.ts` — event `inbox_item` on
  the existing `org:{org}:inbox:{staff}` channel. **This leg was diagrammed in
  the `2026-07-28d` migration header and in `useHomeInbox.ts` but never built.**
- Bell: `work_task` kind + `inbox_item` subscription in `ActivityInboxContext`;
  `KIND_META` / `primaryFor` / `hrefFor` branches in `ActivityInboxPopover`
  (href composes `notificationHref`, not a second route map).
- `2026-08-08c` (APPLIED) seeds `home_inbox` ON for USAV;
  `feature-flags-lifecycle.ts` `isHomeInbox` flipped `undecided → rollout`
  (`plannedRemoval: '2026-10-26'`).

### Phase 5a — the assigner (APPLIED)
- `2026-08-08d` — `work_assignments.assigned_by_staff_id` + partial org-led
  `idx_work_assignments_assigned_by`. Populated by the task writer.
- **No backfill, deliberately** — NULL for all 7844 pre-existing rows.

### Phase 4 — the throw UI (the surface all of the above was for)
- `src/lib/tasks/throw-targets.ts` + `.test.ts` (11) — the pure
  scan-resolve → `(entityType, entityId)` adapter.
- `src/components/quick-access/ThrowTaskHost.tsx` — owns **⌘⇧U**, mounted
  app-wide by `ResponsiveLayout` (never the spine footer), exports
  `THROW_TASK_HOTKEY_LABEL` + `openThrowTask()`.
- `src/components/quick-access/ThrowTaskPanel.tsx` — one panel, three always-
  mounted sections (record · who · note) + urgent Switch, composing
  `QuickAccessPanelShell` and the **existing** `StaffRecipientList`.
- `THROW_TASK_OPEN_EVENT` in `app-events.ts`; a **Throw a task** row in the
  spine ⋯ (`StaffAccountFooter`), above clipboard history, with the chord `kbd`
  imported from the binder.
- `throw-task-hotkey-owner.guard.test.ts` (7) — one binder · modifier-gated ·
  stands down in editables · label imported · one mount · not a header icon.
- **`knip.config.ts`'s dated `src/lib/urgency/**` ignore is DELETED.** Its two
  newly-exposed unused type exports (`UrgencyTarget`, and my own
  `ScanResolveLike`) were **un-exported**, not re-ignored.
- `.claude/rules/source-of-truth.md`: registry row for the chord; the ⋯ menu
  inventory; and the **Inbox surfaces "Known gaps" block rewritten** — it still
  claimed the Ably leg and the create path did not exist, three phases after
  phase 3 built them.

**Phase 4 decisions**
- **The staff picker is `StaffRecipientList`, not an extracted
  `ThreadPanel.AssigneeControl`.** §5 proposed the extraction; a sibling that
  does exactly this job already lives in `quick-access/` with five consumers,
  and it reads `/api/auth/staff-picker` — which also sidesteps the "≥4 React
  Query keys over `/api/staff`, pick one" problem. Extracting the ThreadPanel
  control would have been a sixth shape for one job. *The `ds-raw-button` /
  duplicate-`initials()` cleanup that extraction was going to buy is still
  owed — see Open / deferred.*
- **Resolution is server-side and that is load-bearing.** A tracking number is
  the likeliest thing in an operator's hand and `routeScan` has no tracking
  vocabulary, so the field posts to `/api/scan/resolve`.
- **One panel, not a wizard.** A stepped flow would hide the record while
  picking a person. Everything mounts from the first frame.
- **A single resolved target auto-selects**; two or more are a list. Confirming
  an unambiguous scan is a click that says nothing.

### Phase 6 — pace-and-next: one button, squared panel
- `HeaderGoalChip` is now **one control for the goal ring and the next work
  order**, opening **one panel**. Face = the ring when a goal exists, a
  clipboard glyph when there is no goal but a work order, nothing once both
  settle empty. One corner mark with precedence (recurring-due ping outranks the
  work-order dot).
- `goal-chip/useNextWorkOrder.ts` (query + Ably + already-on-record suppression,
  extracted so the **closed** face can know a work order exists) +
  `goal-chip/NextWorkOrderRow.tsx` (the row). `InboxNextWorkOrder.tsx` **deleted**
  and unmounted from `ActivityInboxPopover` — one home, not two.
- **The panel is squared off**: `GOAL_PANEL_SHELL_CLASS` (`rounded-none`) plus
  every inner radius — mode toggle, interval toggle, station rows, tone chip,
  progress bar, `TaskList` rows/checkbox/input. Only the recurring-due status dot
  keeps `rounded-full`, which the flush law allows.

**Phase 6 decisions**
- **This partly reverses 5b's placement, and says so.** 5b's *reasons* stand — a
  queue depth of one earns no chrome slot, and the chip rendered nothing when you
  were already on the record. Both still hold: the row is not a header occupant,
  and **the header slot count is unchanged**. What moved is which panel it opens
  in.
- **The ring did NOT absorb it.** The 2026-08-08 ring ruling is unchanged and is
  the thing to re-read before "simplifying" this: a queue item has no
  denominator, so it is a row beside the ring, never inside its arc. Sharing a
  button is not sharing a metric.
- **One mark, not two dots.** Same argument that rejected two rings in a header.
- `header-mode.guard.test.ts`'s cluster order needed no change — `HeaderGoalChip`
  is still the last slot; only its comment was updated.

### Phase 5b — header consolidation
- `HeaderTopWorkOrderChip.tsx` **deleted**; re-homed as
  `src/components/quick-access/InboxNextWorkOrder.tsx` at the top of
  `ActivityInboxPopover`, above `InboxQueueLinks`.
- `header-mode.guard.test.ts` cluster order updated; `source-of-truth.md`
  GlobalHeader zones corrected (see §0.3).

---

## 3. Decisions — do not re-litigate

- **Urgency is binary (`urgent | normal`) and stays binary.** It is the only
  rung all three storages share. `orders.is_urgent` has two states, so a 4-level
  union would be a lie on every order.
- **Every urgency write is compare-and-set** — for idempotency, and so clearing
  never clobbers a richer scale it did not set (a carton at manual tier 1 or a
  ticket at `high` is already `normal` in this vocabulary).
- **`order_flags.flag = 'priority'` is triage tint, NOT urgency.** Disjoint from
  `is_urgent`; nothing syncs them.
- **The three multi-field PATCH routes are frozen exceptions, not a backlog.**
  Each writes an urgency column inside a wider dynamic UPDATE; extracting one
  field would split an atomic write. The guard prevents a *fifth* single-purpose
  writer.
- **Task urgency reuses the existing `priority` int** (urgent 10 / normal 100,
  index is ASC). No new column.
- **`POST /api/tasks` is a sibling of `/api/assignments`, not a fork.** That
  route does find-active-and-update (right for a bench); reusing it would hijack
  an existing task instead of creating a second.
- **The assigned inbox row bypasses the outbox.** The cron worker exists to
  *derive* recipients from `staff_subscriptions`; a thrown task has an explicit
  recipient. Routing it through the outbox would deliver to the wrong people and
  add cron latency to a bench handoff. This is why `'assigned'` had no writer.
- **`ASSIGNMENT_EVENTS` is separate from `NOTIFIABLE_EVENTS`.** The latter's
  entries are subscribable domain events with one `entityType` each; an
  assignment is directly addressed, entity-agnostic, and can never be a rule
  subscription.
- **dedup_key and collapse_key are both `task:{id}`** — per-task collapse so a
  human handoff can never fold into a system notification about the same entity.
- **Durable row first, Ably push second.** The push is a mirror; a drop costs
  latency, not the task.
- **`support_ticket` is throwable but NOT inbox-anchorable.** Adding it needs an
  `ENTITY_VIEW_PERMISSION` entry, and **no role in `seed-roles.mjs` holds any
  `support.*` permission** — rows would be visible to nobody. This is an
  **authorization decision**, not a wiring gap. Ticket tasks report
  `notified: 'skipped_entity'`.
- **Do NOT merge queues/watch-lists into `GoalRing`.** A ring encodes progress
  toward a target — a bounded fraction. `GoalRing` = one staffer's pace at one
  station (today's scans vs admin quota, default 50, or checklist ticks). Queue
  inventory has no denominator. Industry standard: numeric badge for inventory
  (Linear/GitHub/Jira/Asana/Slack); rings only where a real goal exists (Apple
  Fitness, Things, Todoist Karma).
- **`FOLLOW_UP` being excluded from the work-order queue SQL is correct**, not a
  bug. A thrown task reaches the same popover as its own inbox row.
- **The send surface is a chord, not a 6th icon** — the clipboard-history
  ruling (D5) already settled this exact shape.

---

## 4. Traps found the hard way

- **The migration runner wraps every file in `BEGIN/COMMIT`**, so
  `ALTER TYPE … ADD VALUE` and any *use* of that label must be in **separate
  files** (PG refuses a new enum label in the transaction that added it). Hence
  the a/b split. *(The squashed baseline violates this; do not copy it.)*
- **Adding an enum value is irreversible** — PG cannot drop one.
- **The carton table is `receiving_carton`, not `receiving`** (the compat view
  was dropped). The entity-type *string* is `receiving`, matching the
  `staff_inbox_items` vocabulary. The mismatch is intentional.
- **node-postgres returns BIGINT as a STRING** — `entity_id` needs `Number()`.
- **`work_assignments` has FORCE RLS.** The migration role is `neondb_owner`
  with `bypassrls`, so the backfill really wrote. A non-bypass role would have
  updated 0 rows and reported success.
- **`fn_cancel_work_assignments_on_entity_delete()` only cancelled
  ASSIGNED/IN_PROGRESS**; `OPEN` was added later and never wired. Fixed in 08b.
- **The baseline's `trg_cancel_wa_on_receiving_delete` is `ON receiving`** — the
  table that became `receiving_carton`. Likely orphaned; RECEIVING assignments
  may leak on carton delete. **NOT fixed — verify separately.**
- **`ops_events` has `organization_id` but `rowsecurity = false`** — the only
  unenforced table in this blast radius. Untouched.
- **`password_reset_tokens` is the single `needs_col: 1`** in the whole
  286-table schema. 0 rows, pre-existing, unrelated.
- **`POST /api/scan/resolve` reads `input`, not `value`.** `value` is what the
  *response* calls the decoded payload, so the wrong key round-trips as a
  perfectly shaped answer for the empty string.
- **`handleType: 'receiving'` is not always a carton.** The repair short-form
  types itself `receiving` and redirects to `/m/rs/{id}`, where the number is a
  *repair service* id — matching the handle type, or `/m/r` unanchored, throws a
  task at a real carton belonging to someone else. `resolveThrowTargets` anchors
  on `^/m/r/(\d+)$` and has a test for exactly this.
- **Resolve and throw are gated on DIFFERENT permissions** — `sku_stock.view`
  vs `work_orders.claim` — so a role can hold one and not the other. The panel
  reports a 403 apart from a transient failure, because "try again" is advice
  that can never work.
- **`| tail` masks a command's exit code.** Capture to a file instead.
- **Running `scripts/portfolio-sot-sync.mjs` from a worktree** registers main as
  a bogus `app` lane. Cosmetic; disappears on merge.
- **Do not export ahead of a consumer** — knip flags it. Prefer un-exporting to
  adding an ignore entry.

---

## 5. What is next

### Part A — CHECK SHEET (do this first)

Nothing below Part B until this has been clicked. The tasks lane is **port
3160**; `:3050` is main and does **not** serve this work.

**Start the lane (your call — agents never start a server):**

```bash
cd /Users/icecube/repos/cycleforge-tasks
# symlink or copy .env from main if missing
ln -sf ../cycleforge-app/.env .env   # once
pnpm next dev -p 3160
```

Then either click through, or run the specs:

```bash
pnpm provision:qa-org                # picks up home_inbox + station staff
PW_BASE_URL=http://localhost:3160 \
  npx playwright test \
    throw-task-chord throw-task-flow header-pace-and-next \
    --project=qa-desktop
```

#### Manual click path (dogfood or QA on :3160)

| # | Action | Expect |
|---|---|---|
| 1 | **⌘⇧U** (spine closed) | Bottom-left **Throw a task** panel; scan field focused |
| 2 | Focus a notes field, **⌘⇧U** again | Panel does **not** open; caret stays |
| 3 | Paste `QA-PO-MOCK-001` (or a known PO) → **Find** | One record row; auto-selected |
| 4 | Pick another staffer under **Throw to…** → **Throw** | Toast `Thrown · … → Name`; panel closes |
| 5 | Recipient session → bell | Live `Task` row (no refresh) |
| 6 | Recipient → Home → Inbox (`?mode=inbox`) | Durable `assigned` row survives reload |
| 7 | Double-click **Throw** / replay | One task, not two |
| 8 | Header goal button | Ring **or** clipboard glyph **or** absent — never a 0% ring with no goal; panel is square |

**Known gap to note if it fails:** live Ably delivery needs a second signed-in
browser as the assignee. Specs cover the durable half + chord wiring; the
two-browser live leg is still a human check.

Specs added 2026-08-08:
- `tests/e2e/throw-task-chord.spec.ts`
- `tests/e2e/throw-task-flow.spec.ts`
- `tests/e2e/header-pace-and-next.spec.ts`
- QA flag `home_inbox` added to `QA_FEATURE_FLAGS` so Home → Inbox is on for QA.

> **Next job after Part A is green:**
> [`throwable-tasks-scan-completion-PROMPT.md`](throwable-tasks-scan-completion-PROMPT.md)
> Part B — pre-assigned tracking delivered by the arrival scan.

### Phase 5c — the "what I handed off" view
`assigned_by_staff_id` + its index exist and are populated. Build it as a
**filter/scope on an existing worklist** (My Day, or the work-orders board) —
not a header widget and not a ring. Unbounded inventory ⇒ a count.

### Open / deferred
- **`ThreadPanel.AssigneeControl` still owes its cleanup.** Phase 4 composed the
  existing `StaffRecipientList` instead of extracting it, so the three
  `ds-raw-button` escapes and the duplicate `initials()` in `ThreadPanel.tsx`
  are untouched. `StaffRecipientList` carries its own `initials()` too — both
  should compose `StaffAvatar` / `staffInitials` (the identity SoT). One change,
  two call sites, no new shape.
- **Part A visual / E2E proof is the gate** before Part B (see check sheet above).
- `support_ticket` in the inbox — needs the authorization decision above, then a
  CHECK widening (full-union redefinition per `polymorphic-tables.md`) + a delete
  trigger on `support_tickets`.
- `HeaderGoalChip` is still the one non-nav occupant of the nav cluster.
- A guard pinning "nothing inserts FOLLOW_UP outside the task SoT" — worth
  adding once there is a second writer to police.
- Contract migration dropping `assigned_tech_id` / `assigned_packer_id` once
  every reader moves to `assignee_staff_id`.

---

## 6. Inherited red on `main` (not ours)

A clean worktree off `aeaa12185` fails before any of our code:

- **Typecheck (21 errors)** — `LineEditPanel.tsx` imports four modules that
  exist only in `../cycleforge-unbox` (`UnboxDockHost`, `UnboxDockNotesEntry`,
  `UnboxProcedurePager`, `useUnboxProcedureArrowKeys`) plus `buildUnboxStepDock`;
  three FBA files import `normalizeFnsku`, which `tracking-format.ts` does not
  export; `UnboxPhotoAction` vs `'browse'` overlap in `PhotosDisplayHost`.
- **Lint** — real errors: unused imports in `lib/neon/orders-queries.ts` and
  `lib/surface-isolation.ts`.
- **Unit tests** — measured 2026-08-08 after phase 4: **55 `✖` lines**, all
  inherited. ~52 are Displays / LineEditPanel / Testing-panel guards downstream
  of the missing `../cycleforge-unbox` modules; the other 3 are FBA
  return-classification cases in `src/lib/zendesk-claim-subject-identity.test.ts`,
  a file no phase of this lane has touched. *(§6 read "~14" before this
  measurement — it was an estimate, and an estimate in the attribution section
  is the one place it cannot be.)*
- **knip** — 28 findings not in the baseline.

**Phase 4 changed none of these counts**: typecheck 21, knip 28, lint 3 errors
in the same two inherited files, and both new test files ran green *inside*
`npm run verify`.

A task chip was spawned for this. **Never raise a ratchet or knip baseline, and
never `git stash`.**

---

## 7. Commands

```bash
cd /Users/icecube/repos/cycleforge-tasks

# tests for this work
npx tsx --test src/lib/tasks/*.test.ts src/lib/urgency/*.test.ts \
  src/lib/notifications/*.test.ts src/lib/migrations/*.test.ts \
  src/components/layout/header-mode.guard.test.ts \
  src/components/quick-access/*.guard.test.ts            # 109 pass

npm run verify > /tmp/verify.log 2>&1; echo $?           # do NOT pipe to tail
node scripts/knip-gate.mjs                                # 28 = inherited baseline
npm run audit-route-auth:check
```

The lane has **no `.env`** (gitignored). Migrations and DB scripts need one:

```bash
DATABASE_URL="$(grep -m1 '^DATABASE_URL=' ../cycleforge-app/.env | cut -d= -f2- | tr -d '"')" \
  node scripts/run-pending-migrations.mjs --dry
```

Apply is normally the **user's** call via `/db-migrate` (that skill is
`disable-model-invocation: true`). The four migrations here were applied on
explicit instruction.

**Dev server: attach, never start.** The user's runs on `:3050` from the *main*
checkout — it does **not** serve this lane, so the header change has not been
visually verified. This lane's port is 3160; starting it is the user's call.
