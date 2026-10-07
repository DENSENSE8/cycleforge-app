# Handoff — Fulfilled drill-down (Phase 5)

Builds on session `01a10f61-3ed8-71e9-b3eb-5b7128d69b6e` (2026-10-06): the journey
board in `src/features/fulfilled-board/`, carrier-sync fixes, and the Phase 4
write-up in `PHASE1-REPORT-fulfilled-sheet.md`. Read that report's Phase 2–4
sections first; do not redo them.

Operator rulings below were gathered 2026-10-06 by Q&A and bind this build.

## 0. The goal

Pinpoint one order exactly. The operator zooms out to see where the trouble is,
zooms in on one column to see every order in it, and zooms in again on a single
order to read its thread, alert a staffer, and act. Bloat comes off the
zoomed-out view; detail lives one level down.

## 1. Rulings

| # | Ruling |
|---|---|
| R1 | **Three zoom levels**: Board → Column → Order. |
| R2 | **Expanded column takes over the board** in place (not a drawer, not a sheet jump). Every order, no 60-card cap, dense sortable/searchable rows. Esc / breadcrumb returns to the board. |
| R3 | **Board columns are carrier-facing only**: Exception, No movement, Stalled, Tracking stale, In transit, Out for delivery, Delivered. |
| R4 | **Become nav saved views** (left sidebar, `NAV_PAGE_DECLS`), not board columns: Returned, Reply due, Late, No tracking, Awaiting pickup, Untracked. |
| R5 | **Off the board** (statuses still exist, still readable on the order record and filterable in the Sheet — logic NOT deleted): Check-in due, Check-in scheduled, Checked in, Happy, Had an issue, No reply, Closed. |
| R6 | **One thread per order**: staff notes, @mentions and system events (carrier status changed, assigned, alert sent, watch fired) in one chronological list. |
| R7 | **Staff alert = all four verbs**: @mention in a note, assign + due time, watch for changes, urgent ping. |
| R8 | **Urgent ping reaches** the staffer in-app (toast) and on their `/m` phone session. No SMS / Slack / email this pass. |
| R9 | **"Why isn't this tracking number seen" diagnosis: dropped.** Do not build it. |
| R10 | **Desk first.** `/m/fulfilled` gets the same three levels in a follow-up pass, not this one. |
| R11 | No external Google Sheet to mirror — design from the current Sheet view's fields. |

**Scrolling (operator 2026-10-06, supersedes the session's "wheel moves across
columns")**: a plain wheel scrolls the column under the pointer up and down;
Shift + wheel scrolls the board sideways across columns, cards included.
Implemented in `BoardStrip` (`FulfilledBoard.tsx`) and verified on `:3050`.

Carried forward from earlier rulings in the same session: full
screen is top-right; actions are icon-first with hover labels; "Platform" not
"Channel"; light edge fade only, no heavy side shadow.

## 2. The three levels

### L1 — Board (zoomed out)
- Seven columns (R3), grouped Act now / Watch / Done as today.
- Column header: label, exact count, "N over · oldest Xd". Header click (or an
  expand icon) → L2 for that column.
- Card is the minimum to recognise the order: order # (last 8), customer or item,
  time-in-status vs limit. Carrier/tracking/place/ETA/"Checked n ago" move to L3.
  An owner avatar shows when the order is assigned (R7); an unread-mention dot
  when the viewer is @mentioned.
- Carrier-sync failure is one board-level banner, not a per-card badge.
- Card click → L3.

### L2 — Column (zoomed in on one status)
- Replaces the board body; breadcrumb `Fulfilled › <Status> (N)`; Esc returns
  to L1 with horizontal scroll position restored.
- Every order in the bucket, dense rows, worst-first by default, sortable by
  time-over-limit / ship date / customer / carrier; text search within the
  column.
- Row columns: order #, customer, item, platform, carrier, tracking, latest
  carrier event + place, time in status vs limit, owner, last note snippet.
- Bulk select → assign, watch, add note to many.
- URL-addressable (e.g. `?view=board&col=stalled`) so a link opens L2 directly.
- Row click → L3 (L2 stays behind it).

### L3 — Order (zoomed in on one order)
Extend the existing record slot (`use-shipment-record-slot.tsx`,
`shipment-record-face.ts`, `ShipmentJourneyRail.tsx`), do not fork it.
- Header: order #, customer, platform, current status word, time vs limit,
  owner + due, Refresh now.
- Journey rail (exists) + full carrier event list.
- All statuses incl. the R5 check-in family, read-only.
- **Thread** (R6) with composer: @mention picker, and alert verbs inline.
- **Alert actions** (R7): Assign + due, Watch, Urgent ping, each also posting a
  system event into the thread.
- URL-addressable so a link to one order opens L3 directly.

## 3. Reuse map — existing plumbing (verify before building)

| Need | Existing piece |
|---|---|
| Notes + @mentions | `order_notes` (`2026-07-28_order_notes.sql`, `2026-09-27_order_notes_mentions.sql`), `src/lib/orders/order-notes.ts`, `src/lib/orders/note-mentions.ts` |
| Assign + due | `work_assignments` + `src/lib/notifications/assign-inbox-item.ts` (`WORK_TASK_ASSIGNED`, has `urgent`) — confirm it carries a due time; add if not |
| Watch a tracking number | `src/lib/notifications/tracking-watch.ts` — today it watches **inbound arrival**; outbound "carrier status changed" needs a new event in `event-vocabulary.ts` emitted by the carrier sync |
| Urgent ping in-app + /m | inbox fanout realtime push (`fanout-worker.ts`, `publishInboxItem`) with `urgent: true`. **There is no OS push**: `HeadBootScripts.tsx` actively unregisters service workers. "Phone push" this pass = realtime inbox toast on an open `/m` session. Real OS push is a separate decision — flag it, don't build it. |
| Tags | `order_tags` (`2026-10-04h_order_tags.sql`) |
| Saved views | `src/lib/operations/saved-view-presets.ts`, nav facets for `/fulfilled` |
| Staff picker | `AssigneeCombobox` via `StageStaffAssignPopover` (AGENTS.md §4) |
| Board / buckets | `src/features/fulfilled-board/*`, `src/lib/nav/locate/bucket-precedence.ts` (`FULFILLED_BUCKETS`) |

## 4. Build order

1. Board column set (R3) + saved views (R4) + R5 off-board — model change in
   `fulfilled-board-model.ts`, tests updated.
2. Slim cards + single sync banner (L1).
3. L2 column takeover + URL state + breadcrumb/Esc.
4. L3 thread: merge notes + system events into one list; composer with mentions.
5. Alert verbs: assign + due → watch (new outbound event) → urgent ping.
6. Browser check on `:3050` at each step; `pnpm verify:fast` green before done.

## 5. Open questions for the operator (ask, don't assume)

- Due-time presets for Assign (e.g. 1h / end of day / tomorrow), or free picker?
- Watch: which carrier changes fire it — any status change, or only
  delivered / exception?
- Who may send an urgent ping — any staff, or leads only (permission gate)?

## 6. Constraints

- `:3050` only; lane lifecycle is operator-only (AGENTS.md §1).
- Production still needs `vercel --prod` for the UPS/FedEx credential fix from
  Phase 4 — independent of this build.
