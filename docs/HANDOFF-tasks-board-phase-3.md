# HANDOFF — Tasks board phase 3: record plane, timeline + alerts, house ticket, ⌘K add (written 2026-09-29)

Paste the **Prompt** block at the bottom into a fresh session. Dev origin `http://localhost:3050`
only (AGENTS.md §1). The `.env` database is PRODUCTION (dogfood org). Other sessions edit this
tree: re-read before each edit, touch only your lines, never commit, never `git checkout/stash`.

Prior phase: `docs/HANDOFF-tasks-board-follow-ups.md` (§0 = what shipped). Read §0 first. It is the
current state: the house two-tier sidebar (`G A/S/C/P` parents, `1`–`3` saved views), centred scope,
two-line rows with type glyph + type word, rail tabs Overview · Ticket · Follow-up · Media · Links,
`work_assignment_follow_ups`, repair links, checklist column (`H`), `?layout=columns` (`V`), `S` picker.

## 0. Status — shipped 2026-09-29 (supersedes §3 where they differ)

All of §3 is done; `pnpm verify:fast` green; contrast audit (`/tmp/contrast-audit.cjs`) 0 failures light
and dark. Migrations applied (owner ok): `2026-09-29_work_assignment_email_refs.sql` and, per owner, the
other lane's `2026-09-29_repair_service_intake_channel_backfill.sql`.

- R8/R5/R4: record in `DeskRecordPlane` (in place / split, remembered); `TabSwitch` tabs Overview · Ticket ·
  Timeline · Media · Links; Ticket = `SupportTicketDetail embedded`. Owner ruling: record-header verbs show
  icon + word when the band is ≥56rem, icon-only below (container query in `DeskActionSlot.tsx`,
  `DeskRecordHeadContext`; every desk inherits); title takes the freed width, 2 lines max.
- R11/R12: Brief = `TaskBriefSection` (label "Brief" everywhere); `MarkdownReaderSlideOver`
  (`src/design-system/components/`), key `B`; phone full-height sheet.
- R6 + owner override: Timeline rows are drawn in the board's own two-line voice (not EventTimeline);
  pure `taskTimelineItems` + `GET /api/tasks/[id]/timeline`.
- R7: `POST /api/tasks/[id]/alerts`, key `A`, inbox tabs, header personal line, phone verb + QuickAccess.
- R10: ⌘K "Delegate "<query>"" on miss; `/?compose=1&note=` off-board.
- R2/R9: row verb on house `Button` (success/warning fills darkened at source), keycap tint, emerald faces.
- Media (owner priority): rewritten in board style — one player, lesson rows, paste unlisted YouTube /
  Vimeo / Loom / Drive or upload MP4/MOV/WebM ≤500 MB with inline refusals. Recorded-video upload was
  broken everywhere (bucket had no CORS); fixed via `scripts/gcs-bucket-cors.mjs --apply`.
- Step 8 cutover: retired Daily files deleted; `DAILY_TABLE_BINDING` kept (live referrers).
- Open: `src/features/tasks/workspace/TaskEvidence.tsx` has no importer (pre-existing; delete with owner ok).

Owner rulings 2026-09-30, shipped:
- Email is a LINK, never a follow-up form: Log head = Call · Note (server refuses new `channel:'email'`,
  `email_is_a_link`); paste an address or header block into the Links input → email link row (mailbox menu,
  inline order/ref no.), shown in Overview Linked. `TaskEmailRefs`/`MobileTaskEmailRefs` deleted.
- Nudge: alert composer picks any staff (default owners) and previews "Sends with"; inbox item payload
  `contacts` (emails, tickets, orders, repairs, tracking) shows on the inbox Alerts row and header line.
- Staff identity = house station colours (`StaffBadge` + `StaffAvatar`); board's private `--staff-ink` deleted;
  `stationThemeColors[*].text` moved to -700 at the source (all station surfaces).
- Ticket status = `TicketStatusPill` (token map `src/design-system/tokens/ticket-status.ts`); filter
  `GET /api/tasks?ticketStatus=` (SQL on `status_cache`, anchor or linked), board `?ticket=` chip rail, `/m/home` chips.
- `TabSwitch` labels centred at the source.
- Recorded-video upload from the phone failed: the lane is reached over the tailnet
  (`http://avion:3050` etc.), which the bucket CORS did not allow. Origins added in `scripts/gcs-bucket-cors.mjs`.
- "Delegate" → **New task** everywhere (`NewTaskSheet.tsx`, board `N`, ⌘K `New task “<query>”`).
+- Ticket thread: always a tab on every task row — with no ticket linked it shows a paste-a-number panel;
+  the repair sync resolves a repair's paperwork number against `support_tickets` (exact org-scoped match)
+  and links the thread, so repair rows carry "Support #10089" and reply inline.
- Alerts: never to yourself (server `cannot_alert_self`; owners default minus sender); the Alert verb/`A` key
  only under scope Everyone. Media tab fills the record width.
- Repairs are Support rows: every open repair (not Done / Picked Up / Shipped / Cancelled, no pickup
  signature) has one task owned by Michael (lead), Lien, Thuc, Sang (`REPAIR_TASK_OWNER_IDS`,
  `src/lib/tasks/repair-tasks.ts`), kept in sync by repair-writer hooks + cron `/api/cron/tasks/repair-sync`
  (every 15 min); backfill `scripts/backfill-repair-tasks.ts` created 34 (2026-09-30), rerun = no-op.
  Import does not notify owners (would have been 136 inbox items).
- Task status: To do · In progress · Pending · Follow-up · Blocked · Done · Canceled (one map
  `src/design-system/tokens/task-status.ts`). Holds live in `work_assignments.task_state` (migration
  `2026-09-30_work_assignment_task_state.sql`, applied; trigger clears it when a row closes); the shared
  status enum is untouched. Record: combobox (`S`) + slider Not done · Pending · Done; Status and Priority
  share one row; linked media leads the Overview. Board: Waiting filter + line-2 status pill.
- Keys: `C` = create everywhere (guard `src/lib/keyboard/key-registry.test.ts`); Copy = ⌘/Ctrl+C,
  copy-shown = ⌘⌥C; Daily checklist go-key `G D`; checklist column `H`; tapping Shift alone toggles the
  views strip (same as hovering the page title).
- 2026-09-30 #2: after a cold `.next` wipe every route failed to compile — `next/font/google queries have
  exactly one entry` (Turbopack cannot build the font import map when one family is instantiated twice).
  `src/lib/fonts.ts` now loads Inter's italic cut inside the same `Inter()` call (`cfSansItalic` = alias).
- Status is pinned bottom-left of the record on EVERY tab (`RecordStatusFooter`, same commit path via
  `useTaskStatusCommit`); the Mine · Handed off · Everyone segment hides while the Daily checklist column
  is open (the checklist is the shift's shared list — scope does not apply). The Overview slider is the
  compact `StopSlider` band (h-7/small thumb — new `compact` prop, other callers unchanged) so the Status
  row matches its siblings' height (49px vs 42–53px). Footer status change verified end to end
  (PATCH 200 from the Links tab, task restored).
- Optimistic status is ONE shared store per task (`use-task-status-commit.ts`): every control reads the
  same face; writes queue one at a time, confirm from the write RESPONSE (not refetches), and a refetched
  row that differs from the high-water mark is ignored for 4s (stale echo / out-of-order board+desk
  snapshots were flipping the slider by itself). External edits still land after the window.
  During the rewrite the write step was briefly dropped (face moved, nothing saved) — the drift test now
  asserts PATCH 200s AND zero idle flips.

Open:
- Recorded video upload is ONE XHR PUT of the whole file: on cellular a large recording can still die
  mid-transfer. Remedy: GCS resumable session + chunked PUTs with retry (`Location` must then be added to
  the CORS `responseHeader` list).
- Repair task notes are single-newline lines, so the Brief shows them as one paragraph.

## 1. Owner rulings (2026-09-29, verbatim intent → decision)

| # | Owner said | Decision |
|---|---|---|
| R1 | "There must be a way to toggle the fixed width" (the 400px rail) | Superseded by R8: the record opens in the house `DeskRecordPlane`, **in place** (full stage, back top-left) or **split** (list left, record right). The staffer's choice is remembered as `desk.<deskId>.view`. If split still needs a drag width, extend `DeskRecordPlane` once with `useHorizontalEdgeResize` + `HorizontalEdgeResizeHandle` (and the `Maximize2/Minimize2` latch `RightRailHost` uses). Never add a board-local width. |
| R2 | "'Enter to reply' displays too dark; the subtitle too light. Even the subtitle should respect contrast, white on dark." | The row verb uses `bg-orange-800` / `bg-emerald-800` (TaskTable.tsx ~249), which reads as muddy. Move the verb to the house `Button` (`src/design-system/primitives/Button.tsx`, fix the fill at its source if AA fails; never per page) + `KeyboardKey tone="inverse"`. "White on dark" = **audit dark mode too**: line-2 inks (`text-text-muted`, `-700` hues, staff `--staff-ink-dark`) must be ≥4.5:1 on the dark card AND on the cursor/selected row fills (`bg-surface-hover`, `bg-surface-selected`, sky selection). The last audit covered light mode only. |
| R3 | "And for the email …" → answered 2026-09-29: "just a record for the email … no body … the customer's email, and which channel email it came from — sales, technical, info, hi@ … if the customer did not order yet, a reference number … full CRUD" | **Shipped.** `work_assignment_email_refs` (customer_email, mailbox, order_number XOR reference_number, subject; no bodies), `GET/POST/PATCH/DELETE /api/tasks/[id]/email-refs`, paste-a-header ingest (`ingestEmailReference`). **2026-09-30 cutover** ("Just having an email linkage under links"): no email form and no Email follow-up verb (Log head = Call · Note; `POST …/follow-ups {channel:'email'}` → 400 `email_is_a_link`, old email rows stay on the Timeline). The Links input takes an address or pasted From/To lines (`emailRefFromPaste`) → an email `LinkLine` (mailbox menu + inline `Order 123` / `Ref X`, `emailRefNumberPatch`) in Links and Overview's Linked; phone = `TaskEmailLinks` in Linked records. Alerts stamp the task's links as `payload.contacts` (`taskAlertContacts` → `InboxItemDto.contacts`, painted by `InboxContactLinks`); the composer previews them and can alert any active staffer. |
| R4 | "The ticket must properly support markdown… the internal and public switcher must use the switcher already in the codebase." | Delete the hand-rolled `TicketTab` (TaskDetailRail.tsx ~483–603). The Ticket tab becomes `SupportTicketDetail ticketId embedded` (`src/components/support/zendesk/chat/SupportTicketDetail.tsx`). It renders comments with `renderBlockMarkdown` (`src/lib/support/markdown.ts`) and replies through `TicketComposer` (pinned: "the ONE mouth for a helpdesk comment"), whose Internal/Public switch is `VisibilityToggle` via `ComposerTicketChannelToggle`. |
| R5 | "The top tabs must always display on one row. The follow-up button is displaying on two rows." | Replace the hand-rolled `<nav role="tablist">` (TaskDetailRail.tsx ~103–125) with `TabSwitch` (`src/design-system/components/TabSwitch.tsx`), `size="sm"` + `scrollable` (faces are `whitespace-nowrap`; the active tab auto-scrolls into view). Must be one row at the narrowest record width. |
| R6 | "Acknowledge it operationally as a timeline — what was said on the call as a timeline with a vertical hairline of staff records. View a timeline instead of follow-up." | The **Follow-up tab becomes Timeline**: house `EventTimeline` / `TimelineSection` (`src/components/ui/EventTimeline.tsx`), whose StepRail hairline + `ActorLabel` StaffAvatar gives the per-staff hairline. One stream merges `work_assignment_follow_ups` (email/call/note, operator-set `occurred_at`), ticket comments (`zendeskCommentsToTimeline`), task audit (assign, status, due changes) and alerts sent (R7). Title "Timeline", newest 5 + "Show N earlier" (house law). The Log composer stays as the Timeline's head (compact), not its own tab. |
| R7 | "Follow-up would just be an alert action to alert the staff to follow up — an inline alert button using the top-left contextual per-staff-ID display, and the inbox as tabs." | An inline **Alert** verb on the row (hover right edge beside Reply/Done) and in the record header: "Alert <people> to follow up" with an optional note + due. The server inserts `staff_inbox_items` for each owner via `assignInboxItemParams` (`src/lib/notifications/assign-inbox-item.ts`), `entity_type='task'`, new `event_key` `work_task.follow_up_alert`, `reason` `manual`. It pushes the Ably `inbox_item` event on `org:{org}:inbox:{staffId}` and records a timeline row. Recipient sees it in the **top-left personal line** (`HeaderNextAction`, `src/components/layout/HeaderWork.tsx`; spec `docs/design-system/HANDOFF-header-personal-line-and-unfound-ticket.md`) and in the **Inbox** (`ActivityInboxButton` → `ActivityInboxPopover`), which gains house `TabSwitch` tabs (e.g. Alerts · Watching · Activity; confirm labels with owner). Reuse the `/api/inbox` read/triage routes; add one write route `POST /api/tasks/[id]/alerts` (new-route skill). Next-follow-up time (`next_follow_up_at`) can schedule the alert. |
| R8 | "Expand the detail inline or split in place (split already exists in the codebase) — port it to tasks. Back button top-left, actions top-right." | Port the rail into `DeskRecordPlane` (`src/design-system/components/DeskRecordPlane.tsx`). `list` = board (checklist column + list/columns), children = record tabs, `actions` = Done · Status (`S`) · Alert · Reply, `indexLabel` = J/K position, deep link stays `?task=` / `?check=`. Add the Tasks desk to `DESK_VIEW_DESKS` (`src/lib/settings/registry.ts`) and drop the board's own `AnimatePresence` rail. The plane owns Esc (first closes the record, next exits split) and `⌘/Ctrl+Shift+S`. |
| R9 | "The light green daily contrast is too low — top right of the task display." | The checklist toggle in the toolbar's right cluster (TaskBulkBar.tsx ~205: `bg-emerald-50 text-emerald-800`) and every emerald face (checklist glyph `-600`, DoneRing, gutter check `text-emerald-500`). Non-text icons need ≥3:1 and text ≥4.5:1 in both themes; replace pale fills with the house pressed-state face. |
| R10 | "Delegate / add a task properly integrated into ⌘K, so you can quickly add a task if what you search for doesn't exist." | `CommandBar` (`src/components/CommandBar.tsx`) has no create-on-miss today. Add one "Actions" group item, **Delegate "<query>"**, shown when the typed query yields no record hit and in the empty-query verbs (already `NAV_PAGE_DECLS.home.actions` `daily.add-task`). Carry the query: give `registerNavIntent`/`runNavIntent` (`src/lib/nav/intents.ts`) an optional payload. `TaskBoard` handles `daily:compose` with `{ note }` and `DelegateSheet`/`useThrowTask` prefill the title. Off `/`, navigate `/?compose=1&note=…` and read it once. Palette voice per pinned `command` law. |
| R11 | "The brief within the right sidebar must be markdown-friendly formatting as well." | The rail's Overview **Brief** is a raw `InlineText` textarea (TaskDetailRail.tsx ~284–292): `**bold**`, lists, links and `- [ ]` print as literal characters. Replace it with the house `TaskBriefSection` (`src/features/tasks/workspace/TaskBriefSection.tsx`: Write/Preview `TabSwitch`, read view = `MarkdownRenderer` from `src/components/ui/MarkdownRenderer.tsx`). If its evidence-card chrome clashes with the Overview field stack, add ONE prop to `TaskBriefSection`; never a second brief editor. One label everywhere: the rail says "Brief", `TaskBriefSection` and `MobileTaskSheet` say "Instructions" — use **Brief** (owner's word) in all three. GFM task lists (`- [ ]`) currently get `list-disc` bullets plus a checkbox; fix that once in `MarkdownRenderer`, not per page. |
| R12 | "There must be a separate brief slider just for viewing the briefing in fullscreen." | A read-only **reader slide-over**, separate from the editor: an Expand (`Maximize2`) verb on the Brief header (and a free bare key, registered in `?`) opens it. Build it once as a generic markdown reader (`title`, `meta`, `content`, optional `onEdit`) on the house `RightPaneOverlay` (`align="right"`, `resizable`, its own `storageKey`) with the `Maximize2/Minimize2` latch flipping `anchor` to `"viewport"` for true fullscreen. Body = `MarkdownRenderer` at a reading measure (~70ch). Esc closes via the overlay stack (`useRegisterOverlay` is built into `RightPaneOverlay`), so it must not also close the record plane. Not `DocumentSlideOver` (iframe/PDF canvas, no markdown). Name it for the document, not the task (e.g. `MarkdownReaderSlideOver` in `src/design-system/components/`), because the day Briefing (§5) is its second caller. Phone: the same content in a full-height `BottomSheet` from `MobileTaskSheet`'s Brief section. |

## 2. Reuse map (verified 2026-09-29 by scouts — re-verify before editing)

- Record plane: `DeskRecordPlane`, `DeskStageOverlay`/`DeskStageRecordHeader` (back ⟵ top-left in place,
  × in split), `DeskRecordViewSwitch`, `DeskStageContext` (one view enum, never a second boolean),
  `useDeskView`. Callers to copy: `src/components/repair/RepairCardList.tsx`,
  `src/components/outbound/orders/OutboundOrdersLedger.tsx:395`. Pinned law: never hand-roll a split
  or register a record with `RightRailHost`.
- Width: `useHorizontalEdgeResize` + `HorizontalEdgeResizeHandle` (`RightRailHost.tsx:213`,
  `TaskWalkSidebar.tsx:14`).
- Timeline: `EventTimeline`, `TimelineSection`, `TimelineItem` (`src/lib/timeline/types.ts`),
  `zendeskCommentsToTimeline`, `resolveTimelineGlyph`. Callers: `OrderTimelineSection`, `SearchEntityRecord.tsx:218`.
- Ticket: `SupportTicketDetail` (embedded), `TicketComposer`, `VisibilityToggle`/`ComposerTicketChannelToggle`,
  `renderBlockMarkdown`/`markdownToHtml`; brief editing stays `TaskBriefSection` (Write/Preview TabSwitch + `MarkdownRenderer`).
- Tabs: `TabSwitch` (`size="sm"`, `scrollable`, `fit`).
- CTA: `Button` / `DeskHeaderAction` + `KeyboardKey tone="inverse"` (currentColor-driven keycap).
- Alerts/inbox: `staff_inbox_items`, `assignInboxItemParams`, `GET /api/inbox`, `PATCH /api/inbox/[id]`,
  `ActivityInboxContext` (Ably `inbox_item`), `ActivityInboxPopover`, `HeaderNextAction`.
- ⌘K: `CommandBar`, `CommandBarPageMap` (`VerbItem`), `registerNavIntent`/`runNavIntent`, `COMMAND_BAR_OPEN_EVENT`.
- Phone twins: `MobileTaskSheet` (sections Instructions · Follow-ups · Media · Documents · Linked),
  `MobileTaskFollowUps`, `MobileTaskTeam`. Mobile may NOT import `src/components/*` except ui/Icons/identity
  (`.dependency-cruiser.cjs` `mobile-no-desktop-surface-components`). Design-system and `src/lib` are fine.

## 3. Work, in order (each step: smoke at :3050, then `pnpm verify:fast` green)

0. **Ask R3** (the cut-off email ask) with the `ask` tool before starting; carry the answer as step 9.
1. **R8 record plane.** Port `TaskDetailRail` content into `DeskRecordPlane`: header title, index label,
   actions top-right, back top-left in place, split with remembered view. Remove the board's rail
   animation + fixed 400px. Esc ladder and J/K walk (`onPrev/onNext`) intact. R1 falls out of this;
   add the drag width only if split still feels fixed after the owner sees it.
2. **R5 tabs.** `TabSwitch size="sm" scrollable` in the record header. Tabs: Overview · Ticket ·
   Timeline · Media · Links, one row at every width (check 360px split pane and 390px phone).
2a. **R11 markdown brief.** Rail Brief → `TaskBriefSection`; one "Brief" label on desktop rail, workspace and
   phone; `MarkdownRenderer` task-list fix. Smoke: save a brief with a heading, bold, a list, a link and
   `- [ ] item` on a seeded task (16011–16015) and screenshot the rendered read view.
2b. **R12 reader slide-over.** Generic markdown reader on `RightPaneOverlay`; Expand verb + key on the Brief;
   width remembered; fullscreen latch; Esc closes only the reader. Phone: full-height `BottomSheet`.
   Smoke at 1440px and 390px, both themes (the reader joins the step-7 contrast audit).
3. **R4 ticket.** `SupportTicketDetail embedded` in the Ticket tab. Delete the hand-rolled `TicketTab`
   and its local reply state. Markdown renders (headings, lists, links, images → photo viewer). Verify a
   Public reply and an Internal note round-trip on a test ticket the owner names. Do NOT post to a real
   customer ticket without the owner's ok.
4. **R6 timeline.** A `taskTimelineItems(taskId)` adapter in `src/lib/tasks/` merges follow-ups + ticket
   comments + task audit + alerts into `TimelineItem[]` (pure, unit-tested for ordering/merging). The
   Timeline tab = compact Log head (existing `TaskRailFollowUp` composer minus its own history) +
   `TimelineSection title="Timeline"`. Phone: `MobileTaskFollowUps` history becomes the same items
   rendered with a phone-legal timeline (EventTimeline lives in `src/components/ui` → allowed).
5. **R7 alerts.** Migration only if a column is needed (probably none: `staff_inbox_items` exists).
   Route `POST /api/tasks/[id]/alerts {staffIds?, note?, dueAt?}` (defaults to the task's owners),
   audit `AUDIT_ACTION` new verb, Ably push, timeline row. The row and record header get an inline
   Alert verb, plus a key (pick a free bare key, register it in `?`). The Inbox popover gets `TabSwitch`
   tabs and the header's personal line shows the newest alert. Phone: the same alert verb in `MobileTaskSheet`,
   and the phone inbox surface (`QuickAccessPopover`) lists it.
6. **R10 ⌘K.** Payload-capable intents, create-on-miss item, prefilled `DelegateSheet`. Test: ⌘K →
   type "call UPS about Friday pickup" → no hits → Delegate "call UPS…" → sheet opens prefilled.
7. **R2 + R9 contrast, both themes.** Row verb on house `Button`. Headless audit (script pattern
   below) in light AND dark (`emulateMedia({ colorScheme: 'dark' })` + the app's theme class). Cover
   rows (rest, cursor, selected), toolbar, sidebar, record plane, Inbox popover. Text ≥4.5:1,
   icons ≥3:1. Zero failures, report the numbers.
8. **Cutover (needs owner ok, carried over).** Delete the retired Daily code listed in the previous
   handoff §4 step 9 after `xd://lsp` references.
9. **R3 email**, per the owner's answer.

## 4. Verification pattern

- Headless Playwright from a `/tmp/*.cjs` script: `require(process.cwd() + '/node_modules/@playwright/test')`,
  `storageState: 'tests/.auth/admin.json'`, keys paced ≥150 ms. Never re-mint auth (`/api/auth/signin` 429s).
- Contrast audit: walk text nodes under the target roots, composite fg over the stacked bg with
  opacity, WCAG ratio, and report failures (text <4.5, icons <3). Run it per theme.
- Seeded tasks 16011–16015. Follow-ups #1/#2 on 16012 are prior smoke data (append-only). Clean up any
  links/alerts you create. Inbox items you create for other staff are real notifications; target
  staff 1 (Michael) only unless the owner agrees.
- If the dev lane serves `Module not found` for a file nobody references, restart it:
  `systemctl --user restart cycleforge-lane@prod`.

## 5. Briefing roots (plan only — do NOT build this phase)

Verified 2026-09-29: no morning / next-day briefing exists. `briefing` appears only in Unbox Ask
(`src/lib/assistant/carton-ask-brief.ts`); no cron composes a digest (`vercel.json`); the assistant
advertises `get_my_day` (`agent-loop.ts:308`, `tool-subsetting.ts:113`, `tool-activity.ts`) but it is
NOT in `ASSISTANT_TOOLS` (`src/lib/assistant/tools/index.ts`), so it fails as `unknown_tool`.

Nouns (one each, never reused across levels, per the nav name law):

| Noun | What it is | Store |
|---|---|---|
| **Task** | one row type on the board (`'task'` beside `'checklist' · 'ticket' · 'project'`) | `work_assignments` |
| **Brief** | the markdown instructions on one row (R11/R12) | `work_assignments.note` |
| **Agenda** (proposed name for the board, today labelled "Tasks") | every row type for a person, any date | read over the tables above |
| **Briefing** | the Agenda cut to ONE (staff, work date), composed for reading at the start of that day | live read first; snapshot later |

Roots, in dependency order:

1. **The day key.** A briefing is `(organization_id, staff_id, work_date)` with `work_date` a civil date in
   the org timezone (`organizations.settings->>'timezone'`, `resolveWhen`, `warehouseCivilTimeToInstant`).
   Never a UTC date.
2. **A do-date, separate from the due-date.** Today a row only knows `deadline_at` and `remind_at`, so
   "put this on tomorrow" has nowhere to live. Gap: `work_assignments.planned_for DATE NULL` (when I intend
   to do it). "Next-day planning" = setting `planned_for = tomorrow`. This is the only schema change the
   briefing needs to exist at all.
3. **One pure selector.** `composeBriefing({ staffId, workDate, now })` in `src/lib/briefing/` returns fixed
   sections: Carried over (open, `planned_for` < date) · Planned (`planned_for` = date) · Due
   (`deadline_at` on date) · Reminders (`remind_at`) · Checklist (`daily_check_items` effective that date) ·
   Alerts (unread `staff_inbox_items`, incl. R7) · Waiting on others (follow-ups with a next chase) ·
   Yesterday done (audit). Every caller reads this: the board's Briefing view, `/m/home`,
   `HeaderDailyTasks`, and the assistant (`get_my_day` finally registered against it). Unit-tested for
   boundaries (midnight, timezone, carried-over vs planned precedence).
4. **A human note, in markdown.** The part a lead writes the evening before ("tomorrow: Tuan on returns
   first") is a Brief attached to the day, rendered by the same `MarkdownRenderer` and opened in the
   same R12 reader. This is why R11/R12 must stay generic.
5. **Snapshot only when something must be remembered.** Live read until one of these is needed, then
   `staff_briefings (organization_id, staff_id, work_date, note_md, composed_at, delivered_at,
   acknowledged_at, UNIQUE (organization_id, staff_id, work_date))`: a lead's note, "read it"
   acknowledgement, or proof of delivery.
6. **Delivery.** On demand first (opening the board at the start of the day shows the Briefing). Scheduled
   later: one hourly cron that picks orgs whose local hour = their briefing hour and inserts one
   `staff_inbox_items` row (`event_key` `briefing.ready`), idempotent on the day key, drained by the existing
   `/api/cron/notification-outbox` for push/email. No second notification pipe.

---

## Prompt

```
You are continuing the CycleForge Tasks board (`/`). Read docs/HANDOFF-tasks-board-phase-3.md end to
end first, then §0 of docs/HANDOFF-tasks-board-follow-ups.md for the current state.

Goal (desktop AND phone, SURFACE_LAW): the task record opens in the house DeskRecordPlane (in place
with back top-left + actions top-right, or split; remembered per staffer); the record tabs sit on ONE
row (TabSwitch); the Ticket tab is the house SupportTicketDetail/TicketComposer (markdown, house
VisibilityToggle); Follow-up becomes a Timeline (EventTimeline hairline, per-staff avatars) merging
follow-ups, ticket comments, audit and alerts; a new inline Alert verb sends staff a follow-up alert
through staff_inbox_items + Ably, shown in the top-left personal line and in an Inbox with tabs; ⌘K
offers "Delegate '<query>'" when nothing matches and opens the Delegate sheet prefilled; every text is
≥4.5:1 and every icon ≥3:1 in light AND dark mode (fix the row Reply/Done verb and the pale green
checklist toggle); the task Brief renders markdown in the record (house TaskBriefSection, one "Brief"
label) and opens read-only in a resizable, fullscreen-capable markdown reader slide-over (built generic:
the future day Briefing is its second caller). §5 (Briefing) is plan only: do not build it.

First, ask the owner what the cut-off "And for the email…" request needs (handoff R3).
Then work in §3 order. Rules: dev origin http://localhost:3050 only; the .env DB is production;
migrations via the db-migration-author skill and applied only with the owner's go-ahead; new routes
via the new-route skill; reuse the house components named in §2 and never fork a second copy (extend
the primitive once if it lacks a prop). Phone parity in the same change. Keep sidebar/go-keys/
parity in lockstep (parityGaps('home') = []). Other sessions edit this tree: re-read before each
edit, never commit. Smoke every step headlessly at :3050 with tests/.auth/admin.json; finish each
step on `pnpm verify:fast`. Report what you verified (exact URLs, commands, numbers) and what is
still open.
```
