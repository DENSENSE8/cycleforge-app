# HANDOFF — Tasks board: follow-ups, repair links, checklist column, wide triage (written 2026-09-29)

Paste the **Prompt** block at the bottom into a fresh session. Dev origin `http://localhost:3050`
only (AGENTS.md §1). The `.env` database is PRODUCTION (dogfood org). Other sessions edit this
tree: re-read before each edit, touch only your lines, never commit.

## 1. Owner rulings (2026-09-29, verbatim intent)

- `/` is **Tasks** (was Daily). Task-first rows, never id-first. Two-line rows, no column header,
  small type, bright triage colour (never washed out). Tickets = the house ticket mark (orange
  `Ticket` glyph + number, no fill). Urgent = the house yellow `Zap` (`text-text-warning`).
- ONE left mark per row, in the select-all column — select and done never paint two checks.
- Staff wear their own staff colour and photo (`StaffAvatar`, `getStaffColorHex`).
- Keys: house keycaps only (`KeyboardKey` / `ChordKeys`). `G` + letter = left-sidebar views;
  bare `1`–`5` = the same views (`useViewHotkeys`).
- **Email, phase 1 = free text.** "Just like you are sending someone an email" — the operator
  types To / Subject / Body on the task and logs WHEN they followed up. No Gmail send, no mail
  storage as a follow-up *method* yet. Pick the long-term table now so phase 2 slots in.
- Any staff member sets their own icon + colour for task types and project types (later phase).
- Projects get milestones later — not now.

**Definition of done (owner):** on desktop AND phone (`/m/*`, `docs/mobile-first/SURFACE_LAW.md`):
1. See the due date of every open task at a glance; tell a daily checklist item vs ticket
   follow-up vs open task vs project in the Everything view.
2. Add several owners to a ticket follow-up.
3. Write a sales email (free text) on a task, set/adjust the date+time it was followed up, and
   have that follow-up stored against the task in the database.
4. Link a video for a staffer to review.
5. Link a repair service to a task.
6. Left sidebar split into four roots with a clean divider: All tasks · Support · Daily checklist ·
   Long-term projects. Daily checklist pinned as the left-most column of the board, removable
   (hide/show, remembered), with quick add.
7. Wide screens: several task columns side by side, horizontal scroll (Shift + wheel), complete
   inline.

## 0. Status — phase shipped 2026-09-29 (supersedes §2's file map where they differ)

§4 steps 1–8 are done; step 9 (cutover) waits on owner approval. Owner rulings added mid-session:

- **Left sidebar = the house two-tier contextual sidebar**, not a custom panel. `TaskSidebarPanel.tsx`
  is deleted. `NAV_PAGE_DECLS.home.modes` makes four parents (`tasks` All tasks · `support` Support ·
  `daily` Daily checklist · `projects` Long-term projects) on `G A / G S / G D / G P` (not `G C`: `C` is create app-wide). Under the current
  parent, bare `1`–`3` pick its saved views (`?tab=` × `?filter=`), e.g. Support: 1 Follow-ups ·
  2 Resolved. Glyphs come from `NAV_VIEW_ICONS['home.*']`. `TaskBoard` is `DeskPageLayout bare`, so
  the header reads `View ›` the way Allocate does.
- **Scope (Mine · Handed off · Everyone) is centred in the toolbar** (`TaskBulkBar`), not in the sidebar.
- **Rows:** line 1 is the type glyph (hover names the type) plus the title. Line 2 is due · the
  type in words (`Daily checklist` / `Support #10025 open` / `Project · name`) · the follow-up face
  · next step · people. Each row has one ticket glyph. "Whole shift" now reads "Daily checklist".
- **Contrast:** all board, rail, toolbar and sidebar text is ≥4.5:1 on white (audited headless;
  0 failures). Staff names keep their hue through `readableTextOn` (`src/lib/color-contrast.ts`).
  White-on-colour fills are the -800 shades. Nothing uses `text-text-faint` for text.
- **Tomorrow is urgent:** it paints orange-700 on desk and phone, as Today does, and is never blue.

Shipped: migrations `2026-09-29_work_assignment_follow_ups.sql` and
`2026-09-29_work_assignment_links_repair.sql` (applied to prod with the owner's go-ahead).
`GET/POST /api/tasks/[id]/follow-ups`, rail tabs Overview · Ticket · Follow-up · Media · Links
(`TaskRailFollowUp`, `TaskRailMedia`), link kind `repair` (`RS-<id>` → `/repair?openRepair=`,
phone `/m/rs/<id>`), the pinned checklist column (`TaskChecklistColumn`, `H`, setting
`desk.home.checklistColumn`), `?layout=columns` (`TaskBoardColumns`, `V`) and the `S` status picker
(`TaskStatusPicker`). Sort reads the earlier of due and next follow-up (`taskBoardActionMs`). On
the phone the sheet has Follow-ups (`MobileTaskFollowUps`) and Team + Add person (`MobileTaskTeam`).

Smoke data left in prod: follow-ups #1 (the DoD email, 16012, Sep 28 3:15 PM) and #2 (a phone
test call on 16012). The log is append-only and has no delete route.

## 2. What exists today (verified 2026-09-29 — re-verify before editing)

**Surface** (all new, `src/features/task-board/`):

| File | Role |
|---|---|
| `TaskBoard.tsx` | page: bulk strip, list, right rail, New task sheet, keyboard (J/K/↑/↓, Enter, X, Shift+X, D, N, `[`/`]`, Esc) |
| `TaskTable.tsx` | two-line rows; `TaskGutter` = one 16px mark (`CompoundSelectStatusFace` bolt/triangle at rest, emerald check when done, `GridRowCheckbox` on hover/selection); right-edge verb (Reply `Enter` / Done `D`) |
| `TaskBulkBar.tsx` | select-all (`GridRowCheckbox`, same column as rows — measured x=327 both), Open·Done·All, bulk Done/Reopen/Urgent/Due today/Add person |
| `TaskDetailRail.tsx` | right rail tabs Overview · Ticket (inline Zendesk thread + reply/internal note) · Links (icon-first) |
| `TaskSidebarPanel.tsx` | left panel pills (coloured glyphs, counts, `HoverTooltip` glance, keycaps), scope Mine/Handed/Everyone, project list |
| `NewTaskSheet.tsx` | `N` — Task / Ticket follow-up / Checklist; multi-owner; project; due chips; urgent; built on `useThrowTask` |
| `useTaskBoard.ts` | `TaskBoardState`: feeds (`useTaskDesk('all', scope)` + `useDailyChecks`) + URL (`tab filter scope q project task check compose`) |
| `task-board-atoms.tsx` | `PersonDot`/`PeopleInline` (StaffAvatar), `DueChip`, `TicketChip`, `DoneRing` (rail only) |
| `src/lib/task-board/task-board-model.ts` (+ `.test.ts`, 5 pass) | row model, views, sort, counts, projects, `taskBoardNextStep`, due face |

**Wiring:** `src/app/page.tsx` → `TaskBoard`; `ContextualSidebar.tsx` mounts `TaskSidebarPanel`
for page `home` (`inlineTaskBoard`); `sidebar-navigation.ts` home children
`all · task · ticket · checklist · project`; `go-keys.ts` `NAV_PAGE_GO_KEYS.home`
(A T S C P); `pages.ts` home `viewKeys: true`, action `daily.add-task` → New task;
`query-mode-routes.ts` declares `?project=`; `parity.ts` home rows updated (a parity gap
silently downgrades the page to `legacy` — `resolve.ts:30-39`; run `parityGaps('home')`).

**Data model today:** `work_assignments` (FOLLOW_UP rows) — `notes`, `project_name`,
`priority` (≤10 urgent), `deadline_at`, `remind_at`, multi-owner membership
(`assigneeStaffIds`, lead first, `TASK_ASSIGNEES_MAX`), anchor `entity_type/entity_id`
(order · receiving · support_ticket; NULL = standalone). `work_assignment_links`
(kinds order · tracking · ticket, `src/lib/tasks/task-links*.ts`).
`work_assignment_media_links` (video/photo URLs: youtube vimeo loom drive image video_file;
route `POST /api/tasks/[id]/media/links {url,title}`). `TaskDeskTicket.status` = Zendesk
`status_cache`. **No** follow-up log, **no** last/next follow-up columns, **no** repair link.

**Phone:** `/m/home` (`MobileDailyChecklist`), task sheet `/m/home?task=<id>`
(`MobileTaskSheet`, `MobileTaskSections`, `MobileTaskMediaLinks`). Repair on phone `/m/rs/<id>`.

**Fixed this session:** standalone tasks were `task_not_found` for links / media / documents
(`findTaskAnchor` treated a NULL anchor as missing). Now returns `{entityType:null,entityId:null}`
(`src/lib/tasks/task-links.ts` `TaskAnchor`, `task-links-db.ts:83-100`).

**Seeded (prod dogfood org, via `POST /api/tasks` as Michael, owner-approved):**

| id | What | Owners | Due |
|---|---|---|---|
| 16011 | Ticket #10025 follow-up (Bose AM15 surge) — urgent | Sang (3), Thuc (2) | 2026-09-29 17:00 PT |
| 16012 | Sales email follow-up (free-text draft in the note) | staff 1, Sang | 09-30 |
| 16013 | Relist Pixel 9 on eBay + Amazon — project "Listing refresh" | staff 1 | 09-30 |
| 16014 | Audit top-25 Amazon listings — project "Listing refresh" | Thuc, staff 1 | 10-06 |
| 16015 | Watch amp packing video (YouTube link attached, media link id 5) | Sang | 10-01 |
| checklist | "Check the sales inbox for replies" (recurring) | shift | — |

Use these to verify; do not create more without cleaning up.

## 3. Decisions for this phase

### 3a. Follow-up storage — the long-term table (industry: CRM "engagements/activities")

HubSpot calls these engagements (email/call/note objects associated to a record), Salesforce
"Activities"; the shape is the same: **an append-only activity log per record, with the latest
instant denormalised onto the record for sorting.** Adopt it:

- **New table `work_assignment_follow_ups`** (tenant-from-birth, `db-migration-author` skill):
  `id bigserial`, `organization_id uuid NOT NULL`, `assignment_id int NOT NULL REFERENCES
  work_assignments(id) ON DELETE CASCADE`, `channel text NOT NULL CHECK (channel IN
  ('email','call','ticket','note'))`, `direction text NOT NULL DEFAULT 'outbound' CHECK
  (direction IN ('outbound','inbound'))`, `occurred_at timestamptz NOT NULL` (operator-set,
  defaults to now in the writer), `staff_id int REFERENCES staff(id) ON DELETE SET NULL`,
  `email_to text`, `email_subject text`, `body text` (phase 1 free text),
  `provider text` + `provider_thread_id text` + `provider_message_id text` (NULL in phase 1;
  phase 2 Gmail send fills them — no schema change then), `created_at timestamptz NOT NULL
  DEFAULT now()`. Index `(organization_id, assignment_id, occurred_at DESC)`. Enforce tenant
  isolation only if every writer stamps org (it will: one route).
- **Columns on `work_assignments`:** `last_follow_up_at timestamptz`, `next_follow_up_at
  timestamptz`. The follow-up writer sets `last_follow_up_at = GREATEST(existing, occurred_at)`
  in the same transaction; `next_follow_up_at` is operator-set (reuse the due-chip quick picks).
- **Why not a link kind:** a follow-up is an EVENT with a time and words, not a record
  reference; links stay for records (order, tracking, ticket, repair).

### 3b. Repair services — path of least resistance

Add link kind **`repair`** to `TASK_LINK_KINDS` (`task-links-shared.ts`), resolve by repair
ticket number / `RS-<id>` against `repair_service` (`schema.ts:2012`), noun "Repair", door
`/repair?…` desk and `/m/rs/<id>` phone. Do **not** make repair an anchor: `REPAIR` is already
in `work_entity_type_enum` but anchors must also be `URGENCY_TARGETS`
(`src/lib/urgency/urgency-targets.ts`) and repair has no urgency storage — a link avoids that
coupling entirely. Check whether `work_assignment_links.entity_type` has a CHECK constraint
needing a migration.

### 3c. "Done" hotkey — what Linear does

Linear: **`S`** opens the status picker (fuzzy, then Enter) —
[keychord.app/linear/change-status](https://keychord.app/linear/change-status); direct status
set is **⌘/Ctrl + Option + 1–5** —
[linear.app changelog 2020-05-26](https://linear.app/changelog/2020-05-26-setting-an-issue-s-status).
Recommendation: keep `D` as the one-key Done (fast, already taught on the row), add **`S`** =
status picker (To do · Doing · Done · Canceled, digits inside the menu) for Linear parity. `S`
is free on the board (`G S` is a chord, not bare `S`). Register both in the `?` sheet
(`registerShortcutOverviewGroup`).

## 4. Work, in order (each step ends green: `pnpm verify:fast`)

1. **Type glyph + sidebar roots** (no migration). Row line 1 leads with a type glyph from ONE
   map in `task-board-model.ts`: checklist `Repeat`/`ListChecks` (emerald), ticket `Ticket`
   (orange), project `FolderKanban` (indigo), task `ListTodo` (violet) — same inks as the
   sidebar pills. Sidebar: four roots (All tasks · Support · Daily checklist · Long-term
   projects) separated by one hairline; keep `G`/digit bindings and nav children order in
   lockstep (`sidebar-navigation.ts` home children ↔ `VIEW_PILLS` ↔ `NAV_PAGE_GO_KEYS.home`;
   run `parityGaps('home')` = `[]`).
2. **Media tab** in the rail (videos/photos via existing `useTaskMedia` + media-link routes) —
   "Link a video for review" with URL paste; phone already has `MobileTaskMediaLinks`.
3. **Migration** `src/lib/migrations/2026-09-29_work_assignment_follow_ups.sql` per 3a (write
   the file with the `db-migration-author` skill; apply ONLY via `/db-migrate` with the owner).
   Then `POST/GET /api/tasks/[id]/follow-ups` (`new-route` skill: `withAuth`, permission
   `work_orders.claim`, `recordAudit`, zod), wire `last/next_follow_up_at` into
   `list-tasks-db` → `TaskDeskWireRow` → `TaskDeskRow` → `TaskBoardRow`.
4. **Follow-up tab** in the rail: free-text email composer (To · Subject · Body), channel pills
   (Email · Call · Note), "Followed up at" date+time (defaults now, editable), Log. History list
   newest first. Row line 2 shows "Followed up 2d ago" (due-tone inks) and sort honours
   `next_follow_up_at`. Mirror as a section in `MobileTaskSheet` (same API).
5. **Repair link** per 3b (link kind + resolver + icon-first `LinkLine` face `Wrench`).
6. **Daily checklist column**: pinned left column in `TaskBoard` (checklist rows + inline add
   via `useItemActions().addItem`), hide/show remembered in a staff setting (`useSetting` /
   `src/lib/settings/registry.ts`), key to toggle (pick a free bare key; register it).
7. **Wide triage**: `?layout=columns` renders one column per view (Tickets · Tasks · Projects,
   checklist stays pinned) in an `overflow-x-auto` strip with `scroll-snap-type:x`; Shift+wheel
   is native horizontal scroll on Linux/Windows — do not hijack wheel events. Rows keep the
   same gutter/verbs so completing inline is identical.
8. **`S` status picker** per 3c.
9. **Cutover**: once the owner approves the surface, delete the retired Daily code
   (`src/features/home/DailyAgenda.tsx`, `AgendaRow.tsx`, `AgendaRecentRail.tsx`,
   `DailyAgendaComposer.tsx`, `DailyComposerRow.tsx`, `ChecklistEvidence.tsx`,
   `DailyEntrance.tsx`, `HomeWorkspace.tsx`, `src/lib/daily/agenda-lens.ts`,
   `DAILY_AGENDA_VIEW`, `DAILY_TABLE_BINDING` if unused) — `xd://lsp` references first.

## 5. Verification (smoke every step at `:3050`)

- Headless Playwright with `storageState: tests/.auth/admin.json` (never re-mint on every run —
  `/api/auth/signin` rate-limits at 429). Keys need human pacing (≥150 ms between presses) or
  the wedge-scanner guard eats them. If the sidebar is collapsed, click
  `getByRole('button', { name: 'Show navigation' })` only when it exists.
- Check the nav wire when the panel is missing: `GET /api/nav/context?path=%2F` must say
  `rollout: "contextual"`, `scope: "section"`.
- Phone: open `/m/home?task=16011` and `?task=16012` at a 390×844 viewport; the follow-up and
  media sections must render and write.
- DoD walk: on 16012 write the email, set "followed up" to yesterday 3:15 PM, Log → row shows
  it, `GET /api/tasks/16012/follow-ups` returns it, refresh persists. On 16011 add a third
  owner. On 16015 the video plays in the Media tab.

## 6. Known noise (not yours)

Concurrent sessions broke the dev build during this session (`Providers.tsx` →
`@/lib/background-work/query-work`, `GlobalHeader.tsx` → `HeaderPrintWork`,
`OrderRecordView.tsx` types). `src/lib/tasks/plan-files.test.ts` fails under plain node
(`server-only` import) — pre-existing.

---

## Prompt

```
You are continuing the CycleForge Tasks board (`/`, was Daily). Read
docs/HANDOFF-tasks-board-follow-ups.md end to end first — it holds the owner's rulings, the
current file map, the seeded task ids (16011–16015), and the decided data model.

Goal (definition of done, desktop AND phone): see due dates of open tasks at a glance; tell
checklist vs ticket follow-up vs task vs project apart in Everything; add several owners to a
ticket follow-up; write a free-text sales email on a task, set the date+time it was followed up,
and have that stored in the database; link a video for review; link a repair service; left
sidebar split into four roots (All tasks · Support · Daily checklist · Long-term projects);
daily checklist pinned left and hideable; wide multi-column triage with horizontal scroll.

Do the work in the handoff's §4 order. Rules: dev origin http://localhost:3050 only; the .env DB
is production — write migrations with the db-migration-author skill and apply ONLY through
/db-migrate with the owner; new routes via the new-route skill; reuse house primitives
(StaffAvatar, GridRowCheckbox, CompoundSelectStatusFace, KeyboardKey/ChordKeys, HoverTooltip,
Zap for urgent, orange Ticket mark) — never fork a second copy. Phone parity per
docs/mobile-first/SURFACE_LAW.md in the SAME change as each desktop feature. Keep the sidebar
children, NAV_PAGE_GO_KEYS.home, VIEW_PILLS and parityGaps('home') in lockstep. Other sessions
edit this tree: re-read before each edit, never commit. Smoke every step headlessly at :3050
with tests/.auth/admin.json and finish each step on `pnpm verify:fast`. Report what you
verified, with the exact commands/urls, and what is still open.
```
