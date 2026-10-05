# PROMPT — Support becomes a top-level workspace, then prove every feature end to end (2026-10-04)

Paste this whole file as the first message of a fresh session in
`/home/michaelgarisek/Projects/cycleforge-lanes/prod`.

You are a senior product engineer and test lead. You build the refactor in
**Part B**, then you prove **every** Support feature in a real browser in
**Part C**, with a screenshot, a network log and a database read for each
claim. A feature is done only when you watched it work at
`http://localhost:3050`. A green unit test, a 200 from curl, or a button that
renders is not proof.

Read `AGENTS.md` first. This file is the product source of truth for this
session. Where it conflicts with an older handoff, this file wins. The owner's
words in **Part A.2** are binding and quoted verbatim.

---

## Part A — Ground rules and the state you inherit

### A.1 Hard rules

1. Origin: `http://localhost:3050` only. Lane unit `cycleforge-lane@prod`
   (`systemctl --user {status,restart} cycleforge-lane@prod`, logs
   `journalctl --user -u cycleforge-lane@prod -f`). Never bind another port,
   never run `next dev`, never move `PW_BASE_URL`.
2. The lane reads the **primary Neon branch** (`ep-shiny-hall-adz0n0nu`) —
   production data. Every row you create is real. Mark every test record's
   text with `(E2E proof)`. Leave E2E records **resolved** with the reason
   `E2E proof` at the end; never delete them; report their ids.
3. **Never send a customer-visible message.** No Zendesk public comment, no
   eBay/Amazon message, no email. Allowed customer-reply actions in tests:
   `Copy & open <platform>` (it only copies and opens a page — close that tab),
   `Mark sent`, `Log as sent`. Never click `Send public reply` on a
   Zendesk-bound item. After each scenario the network log must show zero
   requests to `/api/zendesk/tickets/*/comments`, `/api/zendesk/photo-ticket`,
   and zero `support.provider_call` lines in the lane journal unless the step
   is explicitly a provider read.
4. New migrations: write them, dry-run them inside `BEGIN … ROLLBACK`
   (see `/tmp/support-closed-loop-e2e/mig-dryrun.sql` for the pattern), then
   **stop and ask the owner** before `node scripts/run-pending-migrations.mjs
   --only <file>`. Applied files are immutable.
5. Dirty worktree (~560 changed paths, most not yours). Never `git stash`,
   revert, reformat or commit. Touch only files the work needs.
6. Design system: before building any UI run `ds_contract '<job>'` (write JSON
   to `xd://mcp__design_mcp_ds_contract`) and obey its `placement.briefBlock`
   verbatim; run `ds_critique` on every touched UI file; `ds_route` /
   `ds_vocabulary` before naming a route or a label; read
   `docs/design-system/CONSOLIDATION_LEDGER.md` before adding an action,
   destructive control or wrapper.
7. Done gate: `pnpm verify:fast` green, then `pnpm verify` (cross-cutting
   change). Name unrelated failures exactly (file + test). Never claim done on
   red.
8. Browser: the omp `browser` (headless, `app: { relay: false }`). Sign in by
   setting the `cf_sid` cookie from `tests/.auth/admin.json` through
   Puppeteer (`page.setCookie({ name, value, domain: 'localhost', path: '/',
   httpOnly: true, sameSite: 'Lax' })`) — `tab.setCookies` rejects that file's
   shape. The session is staff **Michael (id 1)**; use **Thuc (id 2)** as the
   second owner so alerts have a recipient (alerts skip the actor).
   Viewport 1600×1000 desktop, 390×844 phone. Typing into the composer: set
   the value with the native setter + `input` event, or `keyboard.type`
   after a click. **Never press Enter in a composer** — Enter commits.
9. Cron: `curl -H "Authorization: Bearer $CRON_SECRET"
   http://localhost:3050/api/cron/support/loop` (load `.env` and `.env.local`
   first). It loops 10 orgs and takes ~30 s.

### A.2 Owner rulings (verbatim, binding)

From the original brief (still binding unless overridden below): one local
Support model; one ingest waist `ingestSupportMessage`; Zendesk/eBay/Amazon/
Ecwid/email/phone/walk-in/pasted are transports, not truth; a human always
sends; internal records never show customer-send actions; every order-related
item points at the exact `orders.id`; "followed up" only with a real outbound
message or logged contact; no automated test sends a real customer message.

Overrides from the owner during the 2026-10-04 session:

> "If I am on support and press N, it must show a form inline with the exact
> inline form layout for completing the support item, not a popover for
> completing the support item. The drop down for where the customer is from
> platform has overlapping text. Take a screenshot of it. Do not reuse a black
> floating text label. Ensure that you are using and rewriting the black
> floating text label component with the floating text label component used in
> sign in. Completely remove the floating text black floating text label
> featured at the popover component and ensure that it's importing the same
> floating text label in blue on sign in. Remove the to-do status button bottom
> left. It's already top right"

> "It must have first class platform, including text as well. You must be able
> to immediately add your own platform if it's a different platform that's not
> on the platform list. You must be able to drag and drop photos. The support
> page should not include "Open", "Waiting", "Done", "All", "Handed off",
> "Everyone". The "Group by Display" type should be moved over to the left
> contextual sidebar, sorting and grouping and filtering. When I'm under "Task"
> and "Parent Level Support", I should never be able to switch and view all. I
> should only be able to view all if I'm on "All Task", not only support for the
> "List" and "Column" switcher. I should never be able to view the daily
> checklist within the support. Support should only focus on support. So remove
> "Open", "Waiting", "Done", "All" from the top header and move "New", "Open",
> "Pending", "Unhold", "Solved", "Closed" to the top header where that was.
> It should never display the raw eBay formatted email. Outbound has already
> fixed this with eBay Relay email. I must be able To search via order ID within
> the support page drop down itself and search through all the order
> identifications or ticket number or anything linked. It seems like making
> support just as a top level workspace page instead of stuffed into task would
> be a lot better."

Decisions the owner made when asked:

- **Route:** Support becomes its own top-level workspace page at **`/support`**.
  This reverses the earlier "never recreate `/support`" rule. The old
  Zendesk console tree stays deleted; the new page is built on the local
  model. ("Unhold" in the quote means **On-hold**.)
- **Status row:** the six words are **local statuses computed for every
  item**, not Zendesk's: New = never answered, Open = customer owed a reply,
  Pending = waiting on customer, On-hold = snoozed / internal hold, Solved =
  resolved, Closed = resolved and auto-archived after N days (pick N, state it,
  make it one constant). Zendesk status stays metadata only.

### A.3 What already exists (built and applied this session)

Schema — applied to the lane DB (owner-approved):

- `src/lib/migrations/2026-10-04d_support_closed_loop.sql`: `support_tickets`
  = the Support item (kind, purpose + staff acknowledgement, lifecycle
  open|waiting_customer|snoozed|resolved, requester, account_label,
  platform_account_id, primary_order_id → `orders.id`, primary_task_id →
  `work_assignments.id`, pending_inbound_count, last_inbound/outbound_at,
  sync_state, resolution fields); `entity_threads` anchor `SUPPORT_TICKET`;
  `thread_messages` direction / external_message_id / reply_disposition
  (pending|answered|no_reply_required) / answered_by_message_id /
  delivery_state (pending|sent|failed|copied|logged); new `support_drafts`;
  `work_assignment_follow_ups.channel 'message'` + `thread_message_id`;
  `ticket_links.external_reference`; new `order_support_follow_ups`
  (per-order check-in projection); `support_ticket_assignments` deprecated
  (its one row copied to task assignees).
- `src/lib/migrations/2026-10-04e_support_search_docs.sql`: search-outbox
  triggers for Support items, links and items.
- Backfill run: 58 Zendesk-mirrored items → 213 local `thread_messages`
  (backfill mode: no tasks, alerts or drafts created).

Server (local-only reads; zero provider calls on read paths):

- Waist and rules: `src/lib/support/conversation/` — `ingest.ts`
  (`ingestSupportMessage`), `ingest-core.ts`, `store-db.ts`
  (`supportTransaction` = `withTenantTransaction`), `transitions.ts`,
  `reply.ts` / `reply-core.ts` (`recordSupportReply`, mark sent),
  `item-actions*.ts` (purpose, next step, lifecycle, no-reply-required),
  `resolve*.ts` (guarded resolve + override reason), `bundle.ts`
  (`readSupportItemBundle`), `follow-up-due*.ts` (due-alert sweep),
  `post-commit.ts`, `timeline-events.ts`, `model.ts` (shared vocabulary,
  `supportWorkFlags`, `supportResolveBlockers`, wire types), `transport.ts`
  (`resolveSupportTransport`, `sendSupportReplyViaTransport`),
  `marketplace-policy.ts`, `mirror-bridge.ts` (Zendesk mirror → waist).
- Adapters: `src/lib/support/adapters/{zendesk-comments,ebay-messages,
  email-message,website-contact}.ts`.
- Drafts: `src/lib/support/drafts/` (`store.ts`, `process.ts`, `context*.ts`,
  `prompt.ts`, `validate.ts` — unsupported specifics, apology/filler strip,
  contact-us, unbacked commitments, weekday/date checks). `suggest-reply-core.ts`
  takes local context; `/api/support/suggest` maps station ticket ids to the
  local item.
- Orders and check-ins: `src/lib/support/orders/` (`resolve-order-reference.ts`
  refuses silent ambiguity; `link-orders.ts`; `order-facts.ts`),
  `src/lib/support/check-ins/` (`config.ts` program start
  `2026-10-04T00:00:00Z`, due +2 d delivered/picked up, +10 d fallback,
  chase +3 d, one chase then no-response close; `milestones*.ts`,
  `state.ts`, `projection.ts`, `sweep.ts`). Hooks in
  `src/lib/shipping/publish-on-status-change.ts` (DELIVERED) and
  `src/app/api/shipped/scan-out/route.ts` (SHIP_CONFIRM).
- Routes: `POST /api/support/items`; `GET|PATCH /api/support/items/[id]`;
  `POST /api/support/items/[id]/messages`; `PATCH
  /api/support/items/[id]/messages/[messageId]`; `POST
  /api/support/items/[id]/replies`; `POST /api/support/items/[id]/resolve`;
  `POST /api/support/items/[id]/drafts`; `POST|DELETE
  /api/support/items/[id]/orders`; `GET /api/support/order-candidates?q=`;
  `GET /api/support/check-ins`; `GET /api/cron/support/loop` (in
  `vercel.json`, every 10 min, owner-approved).
- Late fixes that are in code but **not yet browser-proven**: an answering
  reply (sent / logged / mark sent) or a logged outbound contact clears a
  **due** `next_follow_up_at` (`logTaskFollowUpInTx`); alert titles use the
  item subject, never "Ticket N"; `subject_cache` defaults to the first line
  of the first message on create.

Client (current surface — **Part B moves it**):

- Tasks → Support at `/?tab=ticket[&view=…][&task=<id>]`; helper
  `src/lib/tasks/support-task-route.ts` `supportTasksHref({ task, q, view })`.
- Record: `src/features/task-board/TaskDetailRail.tsx` (tabs Overview ·
  Conversation · Timeline · Media · Links) mounting
  `src/features/task-board/support/*` (`SupportConversationPanel`,
  `SupportRecordHeader`, `SupportMessageList`, `SupportDraftCard`,
  `SupportPurposeAck`, `SupportNextStep`, `SupportResolve`,
  `SupportCheckInFacts`, `SupportLogCustomerMessage`); hooks
  `src/lib/support/record/{use-support-item,next-step-store,support-record-model}.ts`;
  composer `src/components/composer/TicketComposer.tsx` +
  `src/lib/composer/use-ticket-composer.ts` (Support-item mode; commit label
  "Send public reply" / "Add internal note", never "Update ticket").
- Creation: `src/features/task-board/NewSupportItemForm.tsx`, mounted inline
  (`DeskStageOverlay fill="stage"`) when N is pressed on Support.
- List: `src/lib/tasks/list-tasks.ts` (`TaskDeskRow.support`, SQL search over
  every linked identifier), `src/lib/task-board/task-board-model.ts` (Support
  views), facets `src/lib/nav/facets/support.ts`, sidebar children in
  `src/lib/sidebar-navigation.ts`.
- Floating label: `FloatingFieldLabel` exported from
  `src/design-system/primitives/TextField.tsx` (the sign-in label: notched,
  muted, blue on focus) is the only floating label; the black in-field label,
  the `'auth'` appearance and `SearchableSelectField`'s in-trigger label are
  deleted. All `TextField` / `SearchableSelectField` consumers inherit it.
- The bottom-left record status footer, `TaskStatusCombobox` and
  `src/lib/tasks/use-task-status-commit.ts` are deleted; `S` anchors to the
  header Status verb.
- Phone: `src/components/mobile/daily/SupportItemInline.tsx` reads the local
  bundle (read-only thread).

Checks already observed: 1013 unit tests across support/tasks/nav/search/threads
passed; `pnpm eval:support-drafts` 27/27; live eval 4/6 on `cf-v2-base`
(both failures were caught by the validators as warnings); `pnpm
tenancy:guard:check` passed; full `node scripts/typecheck.mjs` was 0 errors
after the last edits. `pnpm verify:fast` and `pnpm verify` have **not** run.

E2E records that exist now (production DB, org `…0001`):

| Support item | Task | Kind / purpose | Order (`orders.id` · number) | State now |
| --- | --- | --- | --- | --- |
| 595 | 16145 | conversation · customer · eBay | 19833 · 22-15228-39486 | open, 0 pending, `next_follow_up_at` 2026-10-04 20:21Z (due, from before the due-clear fix) |
| 596 | 16146 | post-purchase check-in · customer · eBay | 19475 · 04-15228-73411 (MEKONG) | open, check-in `due`, check_in draft 4 ready |
| 597 | 16147 | conversation · internal record | — | open |

Messages on 595: #226 and #227 inbound (answered by #228), #228 outbound
copied → marked sent, #229 inbound (answered by #230), #230 outbound logged.
Drafts on 595: 1–3 stale. Alerts already created: 12661 (Thuc, assigned),
12662 (Thuc, "Customer followed up", key `alert:support-inbound:227`),
12663/12664 (Michael + Thuc, follow-up due, key
`alert:support-follow-up-due:16145:1791145314537`, contacts = relay email +
`orders.id` 19833 / 22-15228-39486); a second cron run alerted 0.
Order 19475's check-in row was projected with a throwaway script using
`SUPPORT_CHECK_IN_PROGRAM_START=2026-10-02T00:00:00Z` (it was delivered
2026-10-02 19:41Z, before the real program start); the real cron then opened
item 596. Screenshots so far: `/tmp/support-closed-loop-e2e/`.

---

## Part B — The refactor: Support is its own workspace at `/support`

Step back before you write code. The defects the owner reported all come from
six roots. Fix each root once; do not patch symptoms on the Tasks board.

### B.0 Roots (read these, confirm them in code, then plan)

1. **Placement root.** Support is a mode of the Tasks board, so it inherits
   the board's generic chrome: Open/Waiting/Done/All and Mine/Handed
   off/Everyone segments (`src/features/task-board/TaskBulkBar.tsx`), the
   List/Columns switch and Display/Group-by, the Daily checklist column
   (`TaskChecklistColumn.tsx`, key H), and the "All tasks" fallback. Fix: a
   dedicated `/support` page with its own `NAV_PAGE_DECLS` entry; views, sort,
   group and filters declared for the left sidebar; the body shows Support
   records only. The record's data model does not change (Support item +
   primary task).
2. **Platform root.** The form's platform list is the hard-coded
   `SUPPORT_CHANNELS` enum, which conflates **transport** (how a reply can be
   carried: zendesk, ebay, email, …) with **platform** (where the customer
   bought / wrote: the org's `platforms` + `platform_accounts` catalog, which
   already supports org-created rows via `POST /api/catalog/platforms` and
   `POST /api/catalog/platform-accounts`). Fix: the Support item references
   `platforms.id` (and optional `platform_accounts.id`); `provider` stays the
   transport, derived from the platform when it has one. The picker lists the
   org's platforms with **text labels** and an inline "Add platform" that
   creates one immediately and selects it.
3. **Identity-display root.** Raw relay addresses
   (`…@members.ebay.com`) appear in the record header, alerts, inbox and the
   header banner because Support surfaces print `requester_email` directly.
   Outbound already solved this: `src/lib/customers/classified-email.ts`
   (`classifyEmail` → `{ kind: 'marketplace-relay', provider: 'eBay', label:
   'eBay relay email' }`). Fix: one Support contact face used by every
   surface (record header, list row, alerts payload/notes, inbox, banner,
   Timeline, phone sheet). Raw relay strings stay in data, never on screen.
4. **Find root.** The Support page's Find is a plain field with no locator,
   so its dropdown cannot list matches. Fix: declare
   `search.locate` for `/support` with a Support locator over the same SQL
   search `list-tasks.ts` already does (Support #id, task id, `orders.id`,
   order number, marketplace order/item number, external ticket id, requester
   email/name/handle, tracking, SKU, repair number, subject,
   `ticket_links.external_reference`). The dropdown shows matching Support
   items (identity, platform, order, status) and opens the record. Pattern:
   `src/components/sidebar/contextual/NavFind.tsx` (`LocatedFind`,
   `NavLocatePills`) and `src/lib/nav/locate/*`.
5. **Status root.** The status row filters Zendesk `status_cache`. Fix: a
   pure `supportLocalStatus(item, nowMs)` in `model.ts` mapping lifecycle +
   reply facts to New · Open · Pending · On-hold · Solved · Closed (owner
   definitions in A.2), computed server-side for list, counts and filter from
   one predicate. The row sits in the page header where Open/Waiting/Done/All
   were (ds_contract decides whether it is header chrome or a sidebar control
   — the owner asked for the header; if the placement law objects, stop and
   ask the owner with both screenshots).
6. **Photo root.** The create form only has a file button. Fix: drag-and-drop
   onto the whole inline form (and paste) using the house
   `usePhotoDropzone`, staged previews, upload after create to the task media
   entity (`TASK_MEDIA_ENTITY_TYPE`) **and** link to the Support item so the
   composer's photo library sees them.

### B.1 Build order (each step ends green before the next)

1. **Route and nav.** `ds_route { intent: 'support workspace' }` → add the
   `/support` node to `ROUTE_TREE` (`src/lib/nav/route-tree.ts`) under the
   Support lane (`'support'` already exists as a spine section in
   `src/lib/sidebar-navigation.ts`); `src/app/support/page.tsx` (desktop)
   with `DeskPageLayout bare`; `NAV_PAGE_DECLS.support` with views (All open,
   Needs reply, Customer followed up, Draft ready, Follow-up due, Waiting on
   customer, Unclassified, Internal records, Unassigned, Sync failed,
   Post-purchase check-ins, Resolved), facets (Platform, Account, Assignee),
   sort (Urgency default, Newest message, Oldest waiting, Due), group-by
   (None, Status, Platform, Assignee). `ds_display_method` picks the body
   display. `ds_nav_names` must pass (a parent and a child never share a
   name). Phone: give `/m/*` a Support entry per
   `docs/mobile-first/SURFACE_LAW.md` (list + record read + internal note +
   log customer message at minimum), or state the gap to the owner.
2. **One href helper.** Replace `supportTasksHref` with
   `supportHref({ item?, q?, view? })` → `/support[?view=][&item=][&q=]` (the
   URL carries the **Support item id**, not the task id). Migrate every
   caller (grep: search hits, inbox, my-day, alerts, order record panels,
   barcode routing, assistant read-tools, `DocRefChip`, thread connections).
   `/?tab=ticket` redirects to `/support` keeping `view`/`q`, and
   `/?tab=ticket&task=<id>` redirects to the item whose primary task is
   `<id>`. Remove the Support mode from the Tasks sidebar; Tasks keeps
   Support tasks visible only as ordinary tasks under All tasks.
3. **Page body.** Records only. No Open/Waiting/Done/All, no Mine/Handed
   off/Everyone, no List/Columns, no checklist column, no "view all". The
   local status row (B.0.5) where the owner asked. The record opens with the
   same `DeskRecordPlane` and the existing Support record components (move
   them under `src/features/support/` if that is cleaner; do not fork them).
   Record header keeps: Support # (local), Customer/Internal/Unclassified,
   primary order (number + platform text), platform/account, requester (via
   the contact face), assignees, flags. Status verb top-right only.
4. **Inline create.** N (and C) on `/support` opens `NewSupportItemForm`
   inline (the layout already built). Fields in this order: (1) Customer |
   Internal, (2) Platform/account — first-class platforms with text + "Add
   platform", (3) question / internal record, (4) order/reference/link/photo
   with drag-and-drop, (5) assignees, (6) urgency + due, (7) Create support
   item. Labels use `FloatingFieldLabel` only.
5. **Platform first-class.** Migration (dry-run, then ask the owner):
   `support_tickets.platform_id BIGINT REFERENCES platforms(id) ON DELETE SET
   NULL` + backfill from `provider`/`account_label`/`orders.account_source`
   where unambiguous; list, facets, header, alerts and search read the
   platform label. Transport resolution keeps working from `provider`.
6. **Contact face (B.0.3)** everywhere; add a unit test that a relay address
   never reaches a rendered string.
7. **Find locator (B.0.4).**
8. **Local status (B.0.5)** + unit tests for every mapping edge
   (never-answered vs answered-then-new-inbound, snoozed, resolved < N days,
   resolved ≥ N days).
9. **Drag-and-drop photos (B.0.6).**
10. Update `docs/` the repo keeps for Support (route tree, vocabulary terms
    "Support item", "Internal record", "Check-in" already added) and the
    consolidation ledger if you retire or add a fork.

Run `pnpm verify:fast` after steps 2, 5 and 10; fix before moving on.

---

## Part C — End-to-end proof of every feature

Work at `http://localhost:3050/support` (after Part B). For each case:
screenshot at the asserted moment, save the network log
(`tab.requests()` filtered to `/api/`) as JSON, and read the database rows
named in **Evidence**. File names: `/tmp/support-e2e-2026-10-04/<case>-<step>.png`
and `<case>-network.json`. Record wall time of every AI draft (ready under
20 s; over 20 s is a speed fail).

### C.1 Surface and owner rulings

| # | Do | Expect | Evidence |
| --- | --- | --- | --- |
| U1 | Open `/support` | Records only. No Open/Waiting/Done/All, no Mine/Handed off/Everyone, no List/Columns, no Daily checklist, no "All tasks" toggle. Status row New · Open · Pending · On-hold · Solved · Closed in the header. | screenshot; DOM query for those words returns none outside the status row |
| U2 | Click each status chip, then each sidebar view | List and counts agree for every chip/view; counts come from one server predicate | screenshot per view; compare chip count to row count |
| U3 | Sidebar sort, group-by, platform/account/assignee facets | All live in the left sidebar; group-by Status / Platform / Assignee regroups records | screenshots |
| U4 | `/?tab=ticket` and `/?tab=ticket&task=16145` | Redirect to `/support` and `/support?item=595` | network 307/308 + final URL |
| U5 | Press N on `/support` | Inline form, not a dialog (`[role=dialog]` count 0). Fields in the 7-step order. | screenshot |
| U6 | Open Platform | Text labels, no overlap; list anchored under the field; "Add platform" visible | screenshot `platform-open.png` |
| U7 | Add platform "Facebook Marketplace (E2E proof)" inline | Created via `POST /api/catalog/platforms`, selected immediately, appears in the facet | network + `platforms` row |
| U8 | Focus each field | Floating label is the sign-in label (notched, blue on focus). Compare with `/signin` in a logged-out page. No black floating label anywhere in the form. | two screenshots + computed color of the focused label |
| U9 | Drag two image files onto the form, create | Previews staged; after create both photos on the record's Media tab and in the composer photo library | Media screenshot; `photo_entity_links` rows |
| U10 | Record header | Status verb top-right only; no bottom-left status control on any tab | screenshot of each tab bottom edge |
| U11 | Any eBay item: header, list row, alert, inbox, banner, Timeline | Never shows `…@members.ebay.com`; shows "eBay relay email" (or the buyer name) | screenshots + DOM scan for `members.ebay.com` returns 0 |
| U12 | Find: type `22-15228-39486`, then `19833`, `595`, the Zendesk number of a mirrored item, a tracking number, a SKU, the requester email, a repair number | The Find dropdown lists the matching Support item(s) each time; click opens it | screenshot per query |

### C.2 Closed-loop scenarios (from the original brief)

Create **new** records for these (do not reuse 595–597 except where noted).
Use an eBay order other than 19833 and 19475 (pick one from `orders` with
`account_source` MEKONG/USAV and a customer, read-only query first).

| # | Scenario | Steps | Must observe | Evidence |
| --- | --- | --- | --- | --- |
| S1 | Customer sends initial message | Create a Customer item (eBay, pasted question, the order reference resolved and confirmed, owners Michael + Thuc) | Task opens; Thuc alerted; draft appears **without reload** (card polls while pending); zero provider calls | `support_tickets`, `work_assignments`, `staff_inbox_items` (Thuc), `support_drafts` ready, journal `support.provider_call` = 0 |
| S2 | Customer follows up before staff answers | "Log customer message" with a follow-up | Same item and task; old draft `stale` (reason new_inbound); new draft on the newest boundary; Thuc alerted "Customer followed up"; header flag "Customer followed up" | drafts statuses; inbox row key `alert:support-inbound:<msgId>` |
| S3 | Staff responds | Type a reply → `Copy & open eBay` (close the eBay tab) → `Mark sent`; on a second reply use `Log as sent` | Copied reply answers nothing until Mark sent; then every pending inbound shows "Answered by #n"; composer clears; next-step choice appears for **both** Mark sent and Log as sent; exactly one follow-up row per outbound message | `thread_messages` dispositions; `work_assignment_follow_ups` (`thread_message_id` unique) |
| S4 | Waiting reminder comes due | Next step "Waiting for customer" → pick a reminder day. Then simulate time: `UPDATE work_assignments SET next_follow_up_at = now() - interval '5 minutes' WHERE id = <task>` (say so in the report). Run the cron twice. | First run alerts every owner once with the exact customer contact (relay shown as label in UI) and `orders.id` + order number; second run alerts 0; header "Follow-up due" | cron JSON; inbox rows; inbox screenshot |
| S5 | Resolve guard | Log a new customer message, try Resolve | Refused with "A customer message is still unanswered" (and "A follow-up is overdue" while due). Override without a reason is refused. Then Log as sent → the due chase is cleared by the reply → Resolve succeeds with a reason. Task DONE and item resolved in one step. | resolve 409 body; item `resolved_*`; task `DONE` |
| S6 | Customer writes after resolution | Log customer message on the resolved item | Item reopens (lifecycle open), task back to To do, owners alerted, new draft | rows + alert + screenshot |
| S7 | Internal shortage | Create Internal item with owners | No Public toggle, no Send/Copy & open/Log as sent, no Draft with AI, no Log customer message; "Add internal update" and "Resolve internal record" present; internal update appears in the thread and Timeline; resolve works | DOM checks (use item 597 / task 16147 or a new one) + screenshots |
| S8 | Post-purchase check-in | Use item 596 / task 16146 (order 19475): check-in facts show exact order, platform/account, customer, products, delivered date, due time, assignee, contacted?, replied?, answered?. Use the check-in draft → Copy & open → Mark sent | State `contacted`, `contact_message_id` set, `next_follow_up_at` = chase date. Then Log customer message → state `staff_reply_due`, task reopened, owners alerted, reply draft generated. Reply + Log as sent → resolve with `checkInDisposition: resolved`, or after one chase close "Close — no response" with a reason | `order_support_follow_ups` row at each step; screenshots |
| S9 | Zendesk outage | Pick a Zendesk-imported item with mirrored comments. Prove local-only reads: open it, Find it, assign Thuc, Draft with AI, add an internal update. | Network shows only `/api/support/*` and local task routes; journal has zero `support.provider_call` lines for the run window. For a true outage, ask the owner before restarting the lane with an invalid Zendesk host; otherwise report the journal proof as the outage proof. | network JSON + journal grep |

### C.3 AI drafting standard

For every draft you see (S1, S2, S6, S8): record the first 240 characters,
confidence, warnings, missing facts, model and wall time. Fail the draft (not
the build) when it: opens with an apology, asks the customer to contact us,
states a size/quantity/date/price/time frame no source has, promises to
send/refund/replace/repair without a staff note, contains a signature or
`[placeholder]`, or names a wrong weekday for a date. Each such failure must
also appear in the draft's stored `warnings` — if a violation is present and
not warned, that is a **validator bug**: add the case to
`scripts/ai-eval/support-drafts-fixtures.ts` and fix `validate.ts`. Then run
`pnpm eval:support-drafts` (must be 100 %) and `pnpm eval:support-drafts:live`
(report the pass rate and each failure's warning).

### C.4 Phone

At 390×844 open the phone Support list and one record (route from B.1.1):
local thread with disposition chips, no truncated record text, no raw relay
address, internal note and Log customer message reachable.

---

## Part D — Report

Return, in this order:

1. Files changed / created / deleted (grouped by root B.0.1–6), migrations
   written and whether the owner approved and you applied them.
2. Table for C.1 and C.2: case · final URL · Support item id · task id ·
   `orders.id` + order number · lifecycle transitions seen · owners ·
   alerts created (ids, dedup keys) · message dispositions · next follow-up
   timestamps · customer-visible POST count (must be 0) · provider calls
   (count + where) · screenshot paths · pass/fail.
3. C.3 draft table and eval results.
4. Commands run with results: unit test files, `pnpm eval:support-drafts`,
   `pnpm tenancy:guard:check`, `node scripts/typecheck.mjs`,
   `pnpm verify:fast`, `pnpm verify`. Unrelated failures named exactly.
5. E2E records left (all resolved with reason `E2E proof`), plus any time
   simulation you did (exact SQL).
6. Anything not done, with the exact reason and what you tried.

Do not summarize what you "would" do. Do not start a different feature.

---

## Out of scope

Auto-sending; eBay message polling on a schedule
(`pollEbaySupportMessages` exists but is not wired into the cron — wire it
only if the owner asks); public website/email ingest endpoints (pure
adapters exist: `adapters/email-message.ts`, `adapters/website-contact.ts`);
`rag_documents` / `rag_document_chunks`; dark mode; the station
`SupportTicketDetail` path (keep it working, do not redesign it).

## Known defects to fix while you are there

- Item 595's `next_follow_up_at` is still the pre-fix due date (S4 left it).
  It clears naturally when you log a chase or reply on it; do that once and
  confirm, then resolve it with `E2E proof`.
- The check-in draft for 596 names two products run together
  ("Cube Speaker - 5 16 Gauge Speaker Cable"): check how `order-facts.ts`
  joins multi-line product titles for the draft context.
- The resolved-order chip once read "MEKONG · MEKONG" (fixed in code when the
  account equals the platform — confirm on screen).
- Row flags on the old board said "Ticket" for Support rows — the new page
  must say "Support item" or nothing.
