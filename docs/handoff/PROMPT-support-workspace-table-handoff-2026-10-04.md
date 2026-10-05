# PROMPT — /support: two-line triage table, then finish the E2E proof (handoff 2026-10-04, evening)

Paste this whole file as the first message of a fresh session in
`/home/michaelgarisek/Projects/cycleforge-lanes/prod`. Read `AGENTS.md` first.
The earlier brief `docs/handoff/PROMPT-support-workspace-e2e-2026-10-04.md` (Parts A–D)
still governs everything this file does not override. The owner's words below are binding.

---

## 1. Owner rulings made during the 2026-10-04 session (binding, newest last)

1. Support is its own top-level workspace at **`/support`**; Support is **deleted entirely from
   Tasks** (no ticket tab/views/facets/record panels). Support-item primary tasks are **hidden**
   from every Tasks list; they live only on /support.
2. Nav: the Support lane is painted **orange** and sits **between Live feed and Scan Stations**
   (Scan Stations last). Built (`SPINE_LEADING_SECTION_IDS`, `spine-parent-tone.ts`).
3. Status pills **New · Open · Pending · On-hold · Solved · Closed** sit at the **top of the
   list, above the table**, like the Allocate page (`/shipping/orders`). Status pills ≠ saved
   views ≠ sidebar filters. Views, Sort, Group by, Platform/Account/Assignee facets live in the
   left sidebar. Local statuses: `supportLocalStatus` (model.ts), Closed = resolved ≥ 4 days
   (`SUPPORT_CLOSED_AFTER_DAYS`).
4. Do **not** reuse Allocate's TriageCardList / RecordCard. Support gets **its own data table**.
5. The record shows the **conversation only** — Overview, Timeline, Media, Links tabs removed
   (they are Task concepts).
6. Remove **all overview details at the top of the conversation** (the purpose band
   "Customer conversation · Michael · Open · Make internal record" etc.) — duplicate of what the
   header/table already show. **Scan for more duplicated information and remove it** (one fact,
   one place).
7. **"In place"** record view must **not** show the status pills nor the identifier line at the
   top (Support #, Customer chip, platform, order, contact, owners, flags). In place = title +
   the one status verb top-right + the conversation.
8. **THE TABLE (latest, supersedes every earlier column spec)** — verbatim:
   > "The column should be formulated like this: Top left bold checklist. Then single per line
   > row checklist item. Second column status. Third column global task identification number.
   > Fourth column order ID identification number. Fifth column platform. Second row beneath the
   > columns as the customer question, so you can easily read the whole customer question, the
   > most recent customer question that the customer is inquiring about."
   > "It is completely fine if the data table is shown with a scrollable horizontal shift scroll
   > overflow."
   > "Before blindly implementing this stop and web search … exactly identify how to build the
   > data table triage in the codebase."

   Read as: header row starts with a **bold select-all checkbox**; every record is a **two-line
   row**: line 1 = `[checkbox] · Status chip · global ID · Order ID · Platform`; line 2 (spanning
   the full row width, under those columns) = the **most recent inbound customer message**,
   untruncated or clamped to ~2–3 lines with the full text readable (NOT the item's first-line
   subject). "Global task identification number" — decide with `ds_vocabulary`/the route tree
   whether this is the local **Support #** (`support_tickets.id`, the record's identity on
   /support) or the primary task id; the URL and Find already key on the Support #. Prefer
   Support # unless the owner says otherwise; if in doubt, ASK with both options.

## 2. Research already done (web)

- Freshdesk ticket list (https://support.freshdesk.com/support/solutions/articles/37559): Card,
  Table and Inbox layouts; table has fixed Contact + Subject columns plus configurable ones;
  checkbox per row → bulk update; status, requester, agent, priority, SLA, channel icon.
- Intercom Inbox (https://www.intercom.com/help/en/articles/6258745-the-inbox-explained): list vs
  table layout (key `L`), selecting a row previews the conversation on the right.
- Gorgias (https://docs.gorgias.com/en-US/tickets-panel-353165): hover preview of each ticket.
- HelpDesk.com (https://www.helpdesk.com/help/tickets-dashboard-guide): requester, subject, agent,
  status, date of last message.
- Pattern to copy: a two-line "inbox row" — compact facts on line 1, a message preview line under
  it (Help Scout / Gmail / Intercom list rows). The owner wants the preview to be the **latest
  customer message** and readable in full.
Do one more pass yourself if you need a specific UI reference, then decide.

## 3. Where to build it in the codebase (start here — do not fork)

- Current table: `src/features/support/SupportTable.tsx` (canonical `DataTable`,
  `hideToolbar`, `unpaged`, `getRowId={supportRowKey}` module-level) and
  `src/features/support/support-table.ts` (`SUPPORT_TABLE_BINDING`, TableDefinition, grid
  template, frozen columns). Table registry: `src/lib/tables/table-columns.ts` (TableId
  `support`), `src/lib/tables/table-definition.ts` (entity family `support`).
- Engine: `src/components/tables/DataTable.tsx` → `src/design-system/components/grid/LedgerGrid.tsx`
  → `VirtualGroupedSections.tsx` (virtualized; row height estimate `rowEstimate`) and
  `LedgerGridLeafRow` / `grid-cell-chrome.ts` (`ledgerGridCell`, `LEDGER_GRID_FROZEN_CELL`).
  Find whether any existing DataTable consumer renders a **second full-width line** inside a row
  (grep `gridColumn`, `1 / -1`, `rowEstimate`, `renderRow` in src/components/** and
  src/features/**); if none, add the capability to the engine ONCE (a row slot spanning all
  columns + variable row height in the virtualizer) rather than hand-rolling a list. Run
  `ds_contract '{"intent":"data table two-line row with message preview"}'` and
  `ds_display_method` first; read `docs/design-system/CONSOLIDATION_LEDGER.md`.
- Selection: DataTable selection ports (see how `OrderCardList` publishes visible ids:
  `publishDataTableVisibleIds`, `emitSelectionTotal`, `emitToggleAll`); there is NO Support bulk
  verb yet — the checkbox column is required by the owner; ask before inventing bulk verbs.
- Status chip in the row: tones in `src/features/support/support-face.ts`
  (`SUPPORT_LOCAL_STATUS_TONE`; a duplicate map lives in `src/lib/nav/locate/support.ts` — merge
  into one, e.g. model.ts).
- Latest customer message: the list row (`SupportListRow`, `src/lib/support/list/support-list.ts`
  + SQL `SUPPORT_LIST_SQL` in `support-list-db.ts`) carries `subject` (first line of the FIRST
  message) — add `latestInbound: { body, at } | null` (newest `thread_messages` row with
  `direction='inbound'` on the item's SUPPORT_TICKET thread; relay addresses scrubbed with
  `scrubRelayAddresses`). Keep ONE SQL; update `mapSupportListRow` + its tests.
- Desk: `src/features/support/SupportDesk.tsx` (pills via `useTriageUrlState` +
  `StatusChipRail`, `DeskRecordPlane`, `SupportConversationPanel` body, `SupportStatusVerb`
  actions), `use-support-desk-list.ts`, `use-support-desk-keys.ts`, `SupportNewItemStage.tsx`.

## 4. State you inherit

### Built and working (browser-observed at :3050)
- `/support` page, sidebar (Queue + 9 views with counts, Sort, Group by single-choice, Platform /
  Account / Assignee facets), status pills with server counts (chip count == rows for every
  view × chip: `/tmp/support-e2e-2026-10-04/U2-counts.json`).
- `/?tab=ticket[&task=][&view=]` forwards to /support (final URLs proven; the HTTP status is a
  streamed RSC redirect (200 + NEXT_REDIRECT 307) because `src/app/loading.tsx` streams — a true
  307 would need middleware; report it as such).
- Inline create (N): Customer|Internal, platform picker with org platforms (text labels) + inline
  **Add platform** (POST /api/catalog/platforms), customer question, order reference resolve,
  drag-and-drop + paste photos with staged thumbnails, owners, urgency/due. FloatingFieldLabel
  matches sign-in exactly (focused rgb(21,93,252), muted rgb(67,67,67)).
- Contact face everywhere (no `members.ebay.com` on screen), platform on the item
  (`support_tickets.platform_id`, migration `2026-10-04g_support_platform.sql` APPLIED with owner
  approval via psql + schema_migrations row), Find locator `support` with a dropdown of matching
  items, phone `/m/support` (list + record + Add note + Log message).
- Draft validator extended (unbacked "follow up with the right size", product-model asks when the
  order names it, unsourced word time frames, unsourced ship schedules); `pnpm
  eval:support-drafts` 36/36; live eval 5/6 (the failure is a model violation the validator now
  warns on).

### In flight when this handoff was written
- Agent PageDesk was told to finish ONLY rulings 6 and 7 (remove the conversation's top overview
  band + duplicates; in-place hides pills and identifier line) and to stop table column work.
  Check `git diff --stat src/features/support` and the running page before you start; if its
  edits are half-done, finish them yourself.

### Fixed by the integrator this session (keep)
- `src/hooks/useAncestorScrollMargin.ts`: disabled branch no longer writes state (it caused
  "Maximum update depth exceeded" from LedgerGrid on /support).
- `src/design-system/components/SearchableSelectField.tsx` `defaultFilter`: an option without
  `meta` matched every query (`qs.includes('')`); now guarded; regression test
  `SearchableSelectField.test.ts`.
- `src/features/support/SupportPlatformField.tsx`: catalog BIGINT ids coerced to numbers (POST
  /api/support/items 400 "expected number, received string").
- `src/lib/identify/identify.ts`: printed `T-####` handles link `supportHref({ q })` (provider
  number), never `item=`.
- `src/lib/nav/facets/service.ts`: the ten per-view facet requests share one `listSupportRows`
  read for 2 s (`sharedSupportRows`).

### Open defects / risks
- **Lane OOM-kills** (`journalctl --user -u cycleforge-lane@prod | grep oom`) at 15:00, 15:25,
  15:27 while several lanes compile. Navigate gently; retry on ERR_CONNECTION_RESET.
- **Typecheck red, mostly other lanes** (re-run `node scripts/typecheck.mjs`): TriageCardList
  `summary` became required (OrderCardList, ImportRowsList/RunsList, LabelBatchesDesk,
  LabelsDocsDesk), `useOrdersQueueFeed.ts` `queueMode`, `card-view-adapters.ts`
  LocationStockTableRow, `TaskBoard.tsx:101` `setGroup/setSort` missing on TaskBoardState —
  check `git diff` to see whether the TaskBoard one came from the Support deletion (agent
  DeleteFromTasks) or another lane; fix ours, name the rest.
- Unit tests (14 nav failures triaged by agent NavTestFix): 11 are other lanes / pre-existing on
  HEAD (Quality control rename, operations › live-feed child, FBM 'Shipping labels', Inventory
  restructure, OPS entity vocabulary, `/customers` mode registry). Ours fixed.
- Draft quality: draft 5 on item 598 (S1) promised "follow up with the right size" with no
  warning → validator fixed afterwards (new drafts will warn).
- Item 596 "Cube Speaker - 5 16 Gauge Speaker Cable" is NOT a join bug: it is the catalog title
  of SKU 00049-P-9 (`sku_catalog.product_title`), which the SKU identity law prefers over the
  marketplace title. Report to the owner; do not change the law.
- `/shipping/orders?context=support` still maps to the Support page id (old alias,
  `src/lib/support/order-support-routes.ts`) — decide/retire.
- Platform row created by the E2E: `platforms.id 437` "Facebook Marketplace (E2E proof)" — report
  it; ask the owner whether to deactivate.

### E2E records (production DB, org …0001) — leave resolved with reason `E2E proof` at the end
| Item | Task | What | State now |
| --- | --- | --- | --- |
| 595 | 16145 | eBay conversation, order 19833 · 22-15228-39486 | open, follow-up due (pre-fix) |
| 596 | 16146 | check-in, order 19475 · 04-15228-73411 | open, check-in due, draft 4 |
| 597 | 16147 | internal record | open |
| 598 | 16150 | S1: eBay · USAV, order 19830 · 06-15257-43461, owners Michael + Thuc, 2 photos (photo ids 11952, 11953 on WORK_ASSIGNMENT 16150) | open; msgs 233, 234 inbound answered by 235 (copied → Mark sent); next-step prompt shown, not chosen |

Alerts seen: 12673 (Thuc, work_task.assigned, item 598), 12674 (Thuc,
`alert:support-inbound:234`). Drafts: 5 (stale, new_inbound, 7.2 s), 6 (ready, 8.2 s, 2 warnings).
Zero `support.provider_call` lines during S1–S3.

### Part C progress (`/tmp/support-e2e-2026-10-04/` screenshots + JSON)
- Done: U1, U2, U3, U4 (final URLs), U5, U6, U7, U8, U9 (staged + uploaded; "composer photo
  library" still to prove), U10 (will change with rulings 6–8 — re-shoot), U11 (record + list
  DOM scans 0 relay hits; alerts/inbox/banner/Timeline still to screenshot), S1, S2, S3 part 1
  (copy → Mark sent; answered-by; status New→Open; one follow-up row per outbound — verify
  `work_assignment_follow_ups` for message 235).
- To do: U12 Find (queries prepared: `22-15228-39486`→595, `19833`→595, `595`, `10016`→593 Zendesk,
  `9621091390008524261900383913554805`→596 tracking, `00129-P-9`→598 SKU,
  `mark.franklin.78@gmail.com`→505, `10088`→542 repair), S3 part 2 (second reply "Log as sent" on
  598 + next-step choice), S4–S9, C.3 table for S6/S8 drafts, C.4 phone (the phone record hit a
  500 while the desk was mid-refactor — re-test), then `pnpm verify:fast`, `pnpm verify`, resolve
  every E2E record with `E2E proof`, Part D report (format in the earlier brief).

## 5. Order of work for the next session

1. Confirm PageDesk's rulings 6–7 landed (browser: in-place record shows no pills, no identifier
   line, no top overview band); finish if not.
2. Design the two-line table (section 3), ASK the owner the "global task identification number"
   question only if Support # vs task id is genuinely unclear after `ds_vocabulary`.
3. Build it once in the engine if needed, then the Support table; `ds_critique` touched files.
4. Re-run the Part C proofs that the table/record changes affect (U1, U2, U10, U11), then the
   remaining cases above.
5. Done gate: `pnpm verify:fast` → `pnpm verify`; name unrelated failures exactly.
