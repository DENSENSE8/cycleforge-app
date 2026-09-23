# ONE daily task system — header panel, handoffs, description, tickets

**Status:** plan only. Phase 0 (header arrangement) is landed; everything from
Phase 1 down is unbuilt. Operator takes over to verify and to answer the five
rulings in [§3](#3-rulings-the-operator-must-make-before-phase-2).

**Operator ask, verbatim (2026-09-16):**

> Ensure the daily task button is between the search icon and the pin icon. and
> the open daily would be a top right CTA button and you would be able to add
> task and mark task as done from the global header and add a task and add a
> task would remount the display and then assign to who and you would be able
> to choose between a existing support ticket.
>
> The definition of done is when you are able to click on the daily task and
> view all of your daily tasks and who they are assigned from. And so you would
> be able to identify who assigned the daily task to you. There would be tabs on
> the top of the daily task like reoccurring, which would be the daily aspect
> and task that you would just need to fulfill like goals. … Would other staff
> members be able to add to your daily or add to your just task only? And would
> they be able to add a description? Seems like a description would be best
> needed like this support ticket. This is what needs to be solved for this
> support ticket. It has to be mobile friendly … incredibly path of least
> resistance. So you would be able to quickly pass a task to someone. There is
> already code within the code base like throw a task but it must be simplified
> under one daily task system like the daily page.

---

## 1. What exists today (evidence, not memory)

### 1.1 The one store worth keeping — `daily_check_items` + `daily_check_marks`

| Thing | Where |
|---|---|
| Tables | `src/lib/migrations/2026-08-19b_daily_checks.sql` (list + marks, civil-day windows, tenant-from-birth) |
| Cadence / owner / glyph | `src/lib/migrations/2026-09-14a_daily_check_kind_owner_glyph.sql` (`kind` `recurring`\|`once`, `assigned_staff_id`, `glyph`) |
| Links (ticket · WO · tracking) | `src/lib/migrations/2026-08-19d_daily_check_item_links.sql` + the `2026-09-14a` CHECK rework |
| DB half | `src/lib/daily-checks/queries.ts` (`loadDailyCheckReport`, `createDailyCheckItem`, `updateDailyCheckItem`, `retireDailyCheckItem`, `markDailyCheck`, link CRUD) |
| Read model | `src/lib/daily-checks/report.ts` — PURE; per-staff denominator `assigned_staff_id IS NULL \|\| === S` |
| Shapes | `src/lib/daily-checks/types.ts` (`DailyCheckItem`, `DailyCheckStaffRow`, `DailyCheckReport`) |
| Client data layer | `src/lib/daily-checks/use-daily-checks.ts` — `useDailyChecks(dateKey, scope)`, `useToggleCheck` (optimistic), `useResetDay`, `useItemActions` |
| Routes | `GET /api/daily-checks` (`dashboard.view`; `scope=all` needs `operations.view`) · `POST/PATCH/DELETE /api/daily-checks/items` (**`admin.manage_staff`**) · `POST/DELETE /api/daily-checks/mark` (`dashboard.view`, caller-only) · `/api/daily-checks/items/[id]/links` · `/api/daily-checks/ticket-candidates` |
| Composer vocabulary | `src/lib/daily-checks/composer.ts` — subject switcher `Task`\|`Ticket`, cadence `Every day`\|`Just today`, glyph palette, link parsing, `dailyComposerCreateBody` |
| Desk mount | `src/features/home/HomeDailyMode.tsx` on `/` (`HomeWorkspace` renders it alone) + `DailyComposerRow` |
| Phone mount | `src/components/mobile/daily/MobileDailyChecklist.tsx` on `/m/home` (`MOBILE_NAV_DESTINATIONS` leaf `daily`) + `MobileDailyComposerSheet` / `MobileDailyComposerFields` / `MobileDailyRow` / `MobileDailySheets` |
| Header face | `src/components/layout/HeaderDailyTasks.tsx` — as of Phase 0 a dropdown reading the SAME hook + route, preview only |

**What the store already answers:** what is on the list, per-person-per-day
attestation, cadence, owner, ticket/WO/tracking links, and honest history for
past days. **What it cannot answer yet:** *who assigned this to me* and *what
needs solving* — there is no creator column and no description column
(`2026-08-19b` lines 62-79, `2026-09-14a` lines 63-67).

### 1.2 The two systems that must be folded in or deleted

**(a) `staff_todos` — already unmounted by operator ruling.**
`src/features/home/HomeWorkspace.tsx:6-9`: *"The mode router is gone
(2026-09-14): Today (`MyDayWorkspace`) and Tasks (`TasksWorkbench`) are
unmounted from this page by operator ruling — their files and backends stay on
disk, and deleting them remains a separate, gated pass."*
Its last live face was the header popover; Phase 0 repointed that at Daily, so
`staff_todos` now has **zero** reachable UI:

- `GlobalHeaderActions` (which mounts `HeaderGoalChip` → `GoalPopover` → `TaskList`) is itself unmounted — `src/components/layout/GlobalHeaderActions.tsx:4-9`.
- `TasksWorkbench` / `tasks.mine` binding is registered (`src/components/tables/registered-bindings.ts:113`) but no route renders it.
- Backend: `/api/staff-todos`, `src/lib/neon/staff-todos-queries.ts`, `src/lib/queries/staff-todos-queries.ts`, `src/lib/staff-todos/tasks-grid-layout.ts`, `src/lib/tables/field-catalog/tasks*.ts`.

**(b) "Throw a task" — a different store with a different grain.**
`⌘⇧U` → `ThrowTaskHost` (mounted in `DesktopRouteShell.tsx:416`) → `ThrowTaskPanel`
→ `POST /api/tasks` → a `FOLLOW_UP` **`work_assignments`** row + optional urgency
promotion + optional inbox notify (`src/lib/tasks/create-task-core.ts`,
`src/lib/tasks/task-vocabulary.ts`). Constraints that decide the fold:

- It is **entity-anchored**: `entityType`/`entityId` must be an urgency entity. It **cannot** carry a free-text task ("sweep the bench").
- Its notify leg anchors only `order` and `receiving` (`task-vocabulary.ts:141`), so a ticket handoff is already delivered silently (`notified: 'skipped_entity'`).
- It is desktop-only (`ThrowTaskHost` is in `DesktopRouteShell`, chord-triggered) — a mobile-first violation on its face.
- Gate is `work_orders.claim`, which *every floor role holds* (`route.ts:30-33`). **This is the precedent that settles Phase 2:** passing work to a colleague is already an everyday, non-admin action in this codebase.

**Conclusion.** Daily is the SoT: it is the only one of the three with
per-person marks, cadence, honest history, tenancy, a report, a desk face AND a
phone face. Throw becomes a Daily composer face; `staff_todos` is deleted under
the ruling already taken.

### 1.3 Phase 0 — landed, verify this first

`src/components/layout/GlobalHeader.tsx` nav cluster is now
`toggle → Search → Daily → Pins → pin chips`; the Pin glyph leads its own chip
banner (`HeaderPinsSwitcher.tsx:290-325`). `HeaderDailyTasks.tsx` is an
`AnchoredLayer` + `HeaderChromeMenu` dropdown (no `BottomSheet`, no scrim),
reads `useDailyChecks(getCurrentPSTDateKey())`, mounts its data component only
while open (zero request per page while closed), and previews rows with a
read-only done mark plus an `Open Daily · done/total` row.

Verified at `:3050`:
`["Show navigation","Search","Daily tasks","Pins","Open pinned page Unbox",…]`,
`role="dialog"` count 0, request-while-closed `null`.

---

## 2. Target shape

```
GlobalHeader  [◧] [⌕] [☑ Daily] [📌 Pins][chips…]        ← Phase 0, landed
                        │
                        ▼  AnchoredLayer (bottom-start, gap 0)
   ┌───────────────────────────────────────────────┐
   │ Daily  1/3                 [+ Add task] [Open Daily] │ ← QuickAccessPanelShell
   │  Recurring | Today                            │ ← TabSwitch (toolbar slot)
   ├───────────────────────────────────────────────┤
   │ ☐ Sweep the packing bench                     │
   │ ☑ Photograph the unboxed amps    from Ana     │ ← assigner line
   │ ☐ Ticket #4821  · from Ben       🎫           │ ← ticket chip → thread
   └───────────────────────────────────────────────┘
```

Same three verbs (view · tick · add/assign), same vocabulary, three mounts:
`/m/home` (SoT) · `/` desk · header panel. One store, one composer module, one
report.

---

## 3. Rulings the operator must make before Phase 2

| # | Question (operator's own words in §0) | Recommendation | Why |
|---|---|---|---|
| R1 | *"Would other staff members be able to add to your daily?"* | **Yes for a one-off assigned task; no for the recurring list.** Any staffer may create `kind:'once'` + `assignedStaffId` (self or colleague); `kind:'recurring'` and org-wide (owner-less) rows stay `admin.manage_staff`. | A recurring row changes the denominator of **every future report for everyone** (`report.ts:65-69`, `2026-09-14a` header). A one-off owned row only changes that one person's day. Throw already lets every floor role hand out work (`/api/tasks`, `work_orders.claim`). |
| R2 | *"would they be able to add a description?"* | **Yes — `description TEXT`, cap 2000, on the item.** Not a `daily_check_marks.note` (that is the tick's note, 500, per-person-per-day). | The operator's example is *"This is what needs to be solved for this support ticket"* — a property of the TASK, read by whoever owns it, not of one day's tick. |
| R3 | Tab names | **`Recurring` \| `Today`.** | The nav-name law forbids a child wearing its parent's name — a tab called "Daily" inside the Daily lane is exactly the clash `nav-name-collisions.ts` guards. "Today" is the `once` lane; "Recurring" is the operator's word. Confirm before building, then it is frozen in the vocabulary module. |
| R4 | Does the assignee get **told**? | **v1: no push — the header/`/m` count IS the notification** (the Daily icon is on every desktop page and leads the phone drawer). Follow-up: a `staff_messages` DM line. | The inbox ledger anchors only `order`/`receiving` (`task-vocabulary.ts:141`); a DAILY_TASK anchor is an enum + migration + Ably leg — a separate increment, not a blocker for the DoD. |
| R5 | ~~Retire `POST /api/tasks` + `FOLLOW_UP` work_assignments?~~ **SUPERSEDED 2026-09-22 by R-A of `operator-reconnect-4-increments-PLAN.md`.** | ❌ **Do NOT fold assigned work into Daily.** `work_assignments` OWNS a task assigned to a person: it carries `assignee_staff_id`, `assigned_by_staff_id`, `deadline_at`, `started_at`, `priority`, `status` and the `SUPPORT_TICKET` link, none of which `daily_check_items` has. The task desk (`/tasks`), `GET /api/tasks`, `PATCH /api/tasks/[id]`, the `tasks` slot-table family and `/m/tasks` all shipped on it in Increment 3. Daily keeps PER-DAY ATTESTATION, which is a genuinely different grain and is not in scope for a deadline. | The original ruling read the two asks as one. They are not: the 09-16 ask is *a header panel of my daily tasks*; the 09-22 ask is *a desk table with deadline, start date, priority, done, and the ticket inline on the right*. Folding them would have forced DDL onto `daily_check_items` for three columns the other store already had. **Anything below in this document that recommends the fold is stale — read this row first.** |

Also worth an explicit yes/no: **may a colleague retire (delete) a task they
assigned to you?** Recommendation: the creator may retire what they created,
the owner may not delete a task assigned to them (they tick it, or it is
retired by the assigner) — otherwise "pass a task" is unenforceable.

---

## 4. Phases

Each phase is independently shippable and ends green on `pnpm verify:fast`.
No phase raises a baseline to pass.

### Phase 1 — Assigner + description (server, no UI)

**Files**

- NEW `src/lib/migrations/2026-09-17_daily_check_task_handoff.sql`
  ```sql
  ALTER TABLE daily_check_items
    ADD COLUMN IF NOT EXISTS description        TEXT,
    ADD COLUMN IF NOT EXISTS created_by_staff_id INTEGER REFERENCES staff(id) ON DELETE SET NULL;
  -- named CHECK via the DO $$ … EXCEPTION WHEN duplicate_object $$ guard the
  -- two prior daily migrations use verbatim:
  --   daily_check_items_description_len CHECK (description IS NULL OR char_length(description) <= 2000)
  CREATE INDEX IF NOT EXISTS idx_daily_check_items_owner
    ON daily_check_items (organization_id, assigned_staff_id, effective_from);
  ```
  No backfill (`created_by_staff_id` NULL on legacy rows = "the org", which is
  what those rows were). ROLLBACK + VERIFY sections mandatory — copy the
  structure of `2026-09-14a`.
- `src/lib/daily-checks/queries.ts` — `ITEMS_ON_DAY_SQL` selects `description`,
  `created_by_staff_id` and a `LEFT JOIN staff` for the creator's name (same
  shape as the existing owner join); `createDailyCheckItem` takes
  `description` + `createdByStaffId`; `updateDailyCheckItem` accepts
  `description` and returns the previous value for the audit row.
- `src/lib/daily-checks/types.ts` — `DailyCheckItem` gains
  `description: string | null`, `assignedByStaffId: number | null`,
  `assignedByName: string | null`.
- `src/lib/daily-checks/report.ts` — **arithmetic unchanged**; new fields are
  passthrough. Guard against scope creep here: the denominator rule stays
  `countsFor` exactly as written.

**Acceptance**

- `src/lib/daily-checks/report.test.ts` gains a case pinning that an item with
  a creator ≠ owner still counts once, for the owner only.
- `npx tsx scripts/…` n/a; `pnpm verify:fast` green; `npm run tenancy:audit`
  clean (new column on an already-enforced table, no new table).

**Non-goals:** no route or UI change in this phase.

### Phase 2 — Who may write what (server)

**Files**

- NEW `src/lib/daily-checks/daily-task-write-law.ts` — the pure resolver, one
  implementation shared by the route, its test and the guard:
  ```ts
  export type DailyWriteGate = 'admin.manage_staff' | 'dashboard.view';
  /** Recurring or owner-less ⇒ the ORG list (report denominator) ⇒ admin.
   *  A one-off with an owner ⇒ a handoff ⇒ every staffer. */
  export function dailyItemCreateGate(body: {kind?: 'recurring'|'once'; assignedStaffId?: number|null}): DailyWriteGate
  export function canEditDailyItem(item, viewerStaffId, has): boolean   // owner ∪ creator ∪ admin
  export function canRetireDailyItem(item, viewerStaffId, has): boolean // creator ∪ admin (see §3)
  ```
- `src/app/api/daily-checks/items/route.ts` — route-level `permission` drops to
  `dashboard.view`; each handler asks the resolver and returns **403 with the
  reason in operator words** when the body asks for more than the caller holds
  (`'Only a manager can add to the recurring list'`). `created_by_staff_id` is
  always `ctx.staffId`, never the body. `assignedStaffId` keeps its
  `dailyCheckStaffExists` tenant pre-check. Audit rows gain the assignee.
- `POST /api/daily-checks/mark` — **unchanged.** `dailyCheckItemBelongsToStaff`
  already refuses ticking someone else's task; a mark is an attestation.

**Acceptance**

- `daily-task-write-law.test.ts`: recurring→admin, once+owner→staffer,
  once+no-owner→admin, self-assignment→staffer, edit/retire matrix.
- `src/lib/tables/…` n/a. `tests/…/route-permission-manifest.test.ts` updated
  (the items route's declared permission changed) — that manifest test is the
  reason this cannot be done quietly.
- e2e `tests/e2e/daily-task-handoff.spec.ts` (new): a non-admin session creates
  a once-task for a colleague (201) and is refused a recurring one (403).

### Phase 3 — One composer, richer (client vocabulary)

**Files**

- `src/lib/daily-checks/composer.ts` — `DailyComposerDraft` gains
  `description: string`; `dailyComposerCreateBody` carries it;
  `dailyComposerError` validates the 2000 cap in the operator's words; the
  owner field becomes valid for **both** cadences (today `ownerId` is
  documented as *"Only meaningful (and only shown) when kind is `once`"*,
  `composer.ts:118`). Add the frozen lane vocabulary:
  ```ts
  export const DAILY_TASK_LANES = [
    { id: 'recurring', label: 'Recurring' },   // R3
    { id: 'once',      label: 'Today' },
  ] as const;
  ```
  Every surface imports these labels — no surface spells its own tab text.
- People picker: **`AssigneeComboboxPanel`** (`@/design-system/components/AssigneeCombobox`)
  everywhere. `MobileDailyComposerFields.OwnerStep` already uses it; audit
  `src/features/home/DailyComposerRow.tsx` for a hand-rolled staff select and
  port it if found (house law: never `SearchableSelectField` for staff).
- Ticket picker: `useDailyTicketCandidates` +
  `MobileDailyTicketSlider` (already exist, already anchor-free). The desk and
  header mounts consume the SAME hook; when the draft is in `ticket` subject
  the description field's placeholder becomes *"What needs solving?"*.

**Acceptance:** `composer.test.ts` extended (description cap, owner legal on
recurring, lane labels exported once). No new form file.

### Phase 4 — The header panel grows (desktop face of the DoD)

**Files**

- `src/components/layout/HeaderDailyTasks.tsx` — keep the trigger + the
  open-only data mount; replace the `HeaderChromeMenu` body with
  **`QuickAccessPanelShell`** (`src/components/quick-access/QuickAccessPanelShell.tsx`),
  the existing frame for header-anchored panels that ThrowTaskPanel already
  uses. It supplies exactly the slots the ask names:
  - `title="Daily"`, `count={doneCount}` (subtitle `of N checked`),
  - `headerActions` = `Add task` + **`Open Daily` CTA, top-right**,
  - `toolbar` = `TabSwitch` over `DAILY_TASK_LANES`,
  - body = rows, `footer` = the inline composer when open.
  `HeaderChromeMenu` stays untouched — it remains the Page · Recents · Pins row
  SoT and is not grown for one consumer.
- NEW `src/components/layout/daily/DailyHeaderTaskRow.tsx` — checkbox (tick →
  `useToggleCheck`, optimistic, disabled when `!isToday`), glyph + title,
  **`from {assignedByName}`** meta line, ticket chip → `/t/{id}` (desktop
  thread; gate on `integrations.zendesk` exactly as
  `MobileDailyChecklist.tsx:87` does), row press → the Daily desk.
- NEW `src/components/layout/daily/DailyHeaderComposer.tsx` — the panel mount
  of the Phase 3 vocabulary: subject switch, one field, cadence, assignee,
  description, ticket slider. On success the list **remounts** for free:
  `useItemActions.addItem` prefix-invalidates `['daily-checks']`
  (`use-daily-checks.ts:138-141`) — assert it rather than adding a second
  refresh path.

**Acceptance (this is the operator's DoD, desktop half)**

- Click Daily → every task the viewer owns, with who assigned it.
- Tabs `Recurring` / `Today` switch lanes.
- Tick a row from the header → the desk and `/m` agree without a reload (one
  query key).
- `Add task` → assign to a colleague → choose an existing support ticket → the
  new row appears in the panel immediately.
- `Open Daily` CTA lands on `/`.
- e2e `tests/e2e/daily-header-panel.spec.ts`; browser proof at `:3050` only.

### Phase 5 — `/m` parity (ships with or BEFORE Phase 4)

`docs/mobile-first/SURFACE_LAW.md` + the `Mobile-first` verify gate make this
non-optional: a verb that exists only on the desk is a violation.

- `src/components/mobile/daily/MobileDailyChecklist.tsx` — lane tabs from
  `DAILY_TASK_LANES` (decide the ONE tab family: recommend lanes on the strip,
  the `all/open/done` status filter moving into the sheet — SURFACE_LAW §5-§6
  forbids two tab families competing on one screen).
- `MobileDailyRow` — `from {assignedByName}` line (it already paints owner +
  ticket).
- `MobileDailySheets` (detail) — description, assigner, ticket link.
- `MobileDailyComposerSheet` — description field + assignee for both cadences;
  drop the `canManage` door in favour of Phase 2's `canAssignTask` so a floor
  staffer can hand off from a phone in three taps.

**Acceptance:** `npx tsx scripts/mobile-first-guard.ts` clean; a `/m` e2e that
assigns a task to a colleague and sees it under `Today`; the same task visible
in the desktop header panel.

### Phase 6 — Collapse the twins ("one daily task system")

**6a — Throw becomes a Daily handoff.**
`ThrowTaskPanel` keeps its shape (scan/paste → who → note → send) and its
`⌘⇧U` host, but writes a Daily `once` item owned by the recipient with the
resolved record attached as a **link** (`ZENDESK_TICKET` / `WORK_ORDER` /
`TRACKING`) and the note as the **description**. `resolveThrowTargets` +
`POST /api/scan/resolve` are kept verbatim — server-side resolution is the
reason the panel works with a tracking number in hand. Per R5, the urgent
switch still calls the urgency promotion; the task row is no longer a
`work_assignment`. Rename to `DailyHandoffPanel`, delete `ThrowTaskRow`'s
"different from Add a task" docblock premise, and put the SAME panel on `/m`
(it is desktop-only today).

**6b — Delete `staff_todos` (the gated pass `HomeWorkspace.tsx:6-9` names).**
`src/features/tasks/**`, `src/lib/staff-todos/**`,
`src/lib/queries/staff-todos-queries.ts`, `src/lib/neon/staff-todos-queries.ts`,
`src/app/api/staff-todos/**`, `src/lib/schemas/staff-todos.ts`,
`goal-chip/{TaskList,TaskListMenu,TaskRowMenu,useGoalChecklists}`, the
`tasks.mine` binding + `field-catalog/tasks*`, and their tests. **Blast radius
is the slot-table cohort** (`src/lib/tables/slot-table-cohort.ts:380`,
`slot-table-id-header-law.test.ts:79`, `compound-row-model.test.ts:42`) —
`impact_analysis` first, then `pnpm run eval:cohort slot-table` and
`pnpm run eval:discover`. Drop the TABLE in a later migration, after an export
if the operator wants the history.
Decide separately whether `MyDayWorkspace` ("Today", a different feed) is in
this pass — recommendation: **no**, out of scope.

**Acceptance:** `⌘⇧U` still throws, now into Daily; no reachable UI reads
`staff_todos`; knip clean without a baseline bump; slot-table cohort green.

### Phase 7 — Make it law (AGENTS.md: a rule with no gate is folklore)

- Rule module `src/lib/daily-checks/daily-task-system-law.ts`: ONE store, the
  Phase 2 write gates re-exported, `DAILY_TASK_LANES`, the banned-twin list
  (`staff_todos` UI, a second composer module, a second people picker, a
  `POST /api/tasks` handoff), and the field contract
  (assigner = `created_by_staff_id`, "what needs solving" = `description`).
- Tripwire `daily-task-system-law.test.ts` (runs under the `Unit tests` gate).
- CLI `scripts/daily-task-guard.ts --json`.
- MCP face `ds_daily_task` in `tools/design-mcp/{server,ds,smoke}.mjs`.
- `always` gate **`Daily task`** in `scripts/verify-profile.mjs`.
- Eval cohort `docs/eval/cohorts/daily-task/LEDGER.md` + `tools/eval-ledger/registry.json` + `docs/eval/README.md`.
- Route the agents: a row in the `AGENTS.md` table and a line in
  `.cursor/rules/design-mcp.mdc`.

---

## 5. Refusals (do not accept these, even if asked mid-build)

- A second task store, a second composer module, or a second people picker.
- A tab named "Daily" inside the Daily lane (nav-name law) — see R3.
- Opening the recurring list to non-admins (R1) — it rewrites everyone's report.
- Letting the client name `created_by_staff_id` or `staffId` on a mark.
- A `BottomSheet`/modal for the header face (that was Phase 0's bug).
- Keeping the header panel's data mounted while closed (one request per page on
  every route, for a panel nobody opened).
- Deleting `daily_check_marks` rows to "clean up" a retired item — retire is a
  window move, never a delete (`2026-08-19b` lines 24-31).

## 6. Verification ladder

```
pnpm verify:fast                       # every always gate (incl. Mobile-first, Nav names)
npx tsx scripts/mobile-first-guard.ts  # Phase 5
npx tsx scripts/nav-name-guard.ts      # R3 tab names
pnpm run eval:cohort slot-table        # Phase 6b only (tasks.mine removal)
pnpm run eval:discover                 # Phase 6b: KEEP vs DELETE ids
npm run tenancy:audit                  # Phase 1
node tools/design-mcp/ds.mjs critique <each new tsx>
```

Browser proof at **`http://localhost:3050` only** (switchboard; lane via
`systemctl --user start cycleforge-lane@prod`). New e2e specs:
`daily-task-handoff.spec.ts` (API + permission), `daily-header-panel.spec.ts`
(DoD desktop), and a `/m` companion.

## 7. Sequencing

```
Phase 1 ─┬─ Phase 2 ─┬─ Phase 3 ─┬─ Phase 5 (/m)  ─┬─ Phase 6 ── Phase 7
         │           │           └─ Phase 4 (hdr) ─┘
         └─ R1/R2 answered        R3 answered      R4/R5 answered
```

Phases 1-3 are pure groundwork and can land in one PR. Phase 5 must not trail
Phase 4 by more than its own PR. Phase 6 is the only phase that deletes, and it
is the only phase that needs the graph tools before touching a file.
