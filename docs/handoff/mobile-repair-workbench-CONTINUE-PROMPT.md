> **Superseded 2026-09-24** — checkpoints below are done. Continue from
> [mobile-repair-workbench-NEXT-HANDOFF.md](./mobile-repair-workbench-NEXT-HANDOFF.md).

# CONTINUE PROMPT — Mobile repair workbench, one verified checkpoint at a time

Paste this whole file into OMP TUI from the CycleForge production worktree.

---

You are continuing the mobile repair workbench at:

`/home/michaelgarisek/Projects/cycleforge-lanes/prod`

The operator is evaluating the real mobile repair ticket at `/m/rs/4799`.

## Non-negotiable working protocol

Work on **exactly one checkpoint per turn**. After completing a checkpoint:

1. Run only that checkpoint's checks.
2. Report the exact files changed and the exact mobile interaction to verify.
3. Stop. Do not start the next checkpoint until the operator explicitly says
   `continue`.

Do not combine checkpoints, do not “finish the obvious next part,” and do not
send an external customer message while verifying. The operator needs to see
and approve each state in isolation.

All browser/curl probes use `http://localhost:3050`, never a lane port. If it
is pinned to another lane, report that fact and stop; do not repin or stop a
different active lane merely to take a screenshot.

`pnpm verify:fast` is required only at a checkpoint that changes code. Preserve
unrelated dirty-worktree changes.

## What is already implemented

All checkpoints (1–7, plus 2b photos) were built in one pass on 2026-09-24 at
the operator's request; the operator is now verifying and listing changes.
Next work is operator feedback, not the next checkpoint.

- [src/app/m/(shell)/rs/[id]/page.tsx](../../src/app/m/(shell)/rs/[id]/page.tsx)
  — `ModeRegion mode="triage"`, identity-only header, one scroll (Photos ·
  Work · Customer · collapsed Record), owns the status PATCH (optimistic,
  rollback on failure, ack reads the server `status_history` stamp), the
  post-save "Draft customer update" prompt, and the Record facts / pickup
  audit / state history.
- `src/components/mobile/repair/` — `RepairWorkbenchDock` (sticky Status ·
  Log work · Pickup), `RepairStatusSheet` (select, then explicit Save),
  `RepairPhotoStrip` (read-only strip → `MobileSwipePhotoViewer`),
  `RepairCustomerUpdate` (ticket-link verdict, Public/Internal, status
  prefills, Insert timestamp, Send → confirm → Zendesk comments POST),
  `RepairPickupSheet` (editable signer, signature or declined reason, confirm
  before the pickup POST).
- New read routes (both `repair.view`): `GET /api/repair-service/[id]/photos`,
  `GET /api/repair-service/[id]/ticket-link` (verdict from
  `src/lib/repair/ticket-link.ts`; only `linked` may send — unit-tested).
- Shared logic: `src/lib/repair-status.ts` (pickup eligibility, operator
  labels, workbench status order), `src/lib/repair/repair-actions.ts` (action
  record type + wording), `src/lib/repair/pickup-submit.ts` (the ONE pickup
  write, also used by desk `RepairPickupFlow`),
  `src/lib/repair/customer-update-drafts.ts`.
- `SignaturePad` / `signature-canvas` promoted to `src/components/ui/` so the
  phone can use it without crossing the component split.
- Universal scan routes `RS-####` to `/m/rs/<id>`.

The target architecture is not “one big detail form” and not top tabs
(operator 2026-09-24: a Photos view would make a fourth tab — too crowded at
390px). It is one scrolling page ordered by bench use:

```text
Header:  identity only (Back · RS-4799 · quiet age)
Scroll:  Photos (swipe strip → full-screen viewer)
         Work     (status badge · device · issue · serial · timeline)
         Customer (contact · notes · ticket draft)
         Record ▸ (collapsed: SKU, price, intake, history, pickup audit)
Dock:    Status | Log work | Pickup
```

Verbs live only in the dock. No top tabs, no jump-chip row.

The mode controls neutral geometry and surfaces. State colours are semantic and
must stay mode-independent.

## Backend contracts — use, do not fork

| Need | Existing contract | Important behavior |
|---|---|---|
| Save bench work | `POST /api/repair/actions` | Stores `created_at` server-side. Do not add a manual work-date field. |
| Change repair status | `PATCH /api/repair-service` | Existing mobile handler already uses this. Preserve queue-compatible stored status values. |
| Customer pickup | `POST /api/repair-service/pickup` | Stamps pickup time/staff, closes repair work assignment, and supports `signerName`, signature, or signature decline. |
| Customer/internal ticket message | `POST /api/zendesk/tickets/[id]/comments` | This is external communication: message is editable and must be sent only after an explicit user tap. |

`repair_service.ticket_number` is not reliably a Zendesk ID by itself. Before
the customer-message checkpoint, inspect the existing ticket-link resolver and
only enable sending when the linked ticket is unambiguous.

## Checkpoints

### Checkpoint 1 — shell hierarchy only (reworked: sections, not tabs)

Replace the header status selector with identity-only header chrome. Replace
the tabs with one scrolling page: `Work`, `Customer`, and a collapsed `Record`
section. No new mutation, no pickup behavior, and no Zendesk UI yet.

Expected verification at `/m/rs/4799`:

- Header has Back + `RS-4799` + quiet age only; no status control.
- No tab strip. Work is first and shows the repair work context/timeline.
- Customer and Record have honest "not yet" lines rather than pretending their
  later functionality exists. Record opens and closes in place.

Run targeted lint and `pnpm verify:fast`. Then stop.

### Checkpoint 2 — thumb-zone dock, presentation only

Add a fixed bottom dock with exactly `Status`, `Log work`, and `Pickup`.
It must reserve safe-area space and use the triage mode hit/radius tokens.

For this checkpoint only, the controls may open labelled non-mutating sheets;
do not wire writes yet. `Pickup` may be visibly disabled if the current record
is ineligible, with a clear reason.

Expected verification:

- The dock stays pinned while the whole page scrolls.
- All three targets are reachable one-handed at the bottom.
- No header status returns and no horizontal pill row appears.

Run targeted lint and `pnpm verify:fast`. Then stop.

### Checkpoint 2b — intake photos, read-only

Add a `Photos` section at the top of the scroll: a swipe strip of photos linked
through `photo_entity_links` (`entity_type = 'REPAIR_SERVICE'`), tap opens a
full-screen viewer. First find an existing route that serves repair-linked
photos (`src/lib/photos/queries/library.ts` `repairLinkedExistsSql`); add a
read route only if none exists. No upload, delete, or relink.

Expected verification:

- The strip shows the repair's intake photos, or an honest empty state.
- Tapping a photo opens it full-screen; dismissing returns to the same scroll
  position.

Run targeted lint and `pnpm verify:fast`. Then stop.

### Checkpoint 3 — status sheet and server-stamped state change

Wire the Status dock action to a bottom sheet. It must show clear operator
labels while writing the existing queue-compatible values:

- In repair → `Pending Repair`
- Waiting on parts → `Awaiting Parts`
- Repair complete — contact customer → `Repaired, Contact Customer`
- Ready for pickup → `Awaiting Pickup`
- Waiting on payment → `Awaiting Payment`
- Closed → `Done`

The sheet must show “Saving” and recover the previous local value on failure.
It must not auto-send any ticket message.

Expected verification:

- Open Status, choose a state, observe the save acknowledgement and refreshed
  state in Work/Record.
- For a live data mutation, ask the operator before pressing the final save on
  RS-4799. Testing opening/closing the sheet needs no approval.

Run targeted lint and `pnpm verify:fast`. Then stop.

### Checkpoint 4 — repair work and timestamp semantics

Wire Log work to the existing action sheet. Improve labels for physical bench
work (including “Soldered or repaired a component”) but do not invent a second
event store or client-clock timestamp field.

After save, show the server-created timeline stamp. If a repair action is
`repaired` or `tested`, surface a quiet next-step prompt: “Draft customer
update.” It must navigate to Customer or open a draft; it must not send.

Expected verification:

- The action sheet opens from the dock at any scroll position.
- The timestamp comes from the saved action record, not a typed field.
- Repaired/tested reveals a customer-update suggestion only after save.

Ask before submitting any action against a real repair. Run checks, then stop.

### Checkpoint 5 — pickup handoff

Wire Pickup to `RepairPickupFlow`. Add an editable signer/representative field
so “Mark picked it up” is recorded accurately through the existing
`signerName` API field. Preserve signature and signature-declined audit paths.

The direct scan loop is already `scan RS-4799 → /m/rs/4799 → Pickup`; do not
add a competing pickup scanner.

Expected verification:

- Pickup is enabled only for eligible statuses and explains why when disabled.
- Opening the sheet shows the signer field and does not mutate anything.
- Final signature/decline submit requires explicit operator confirmation; it
  changes the status, writes pickup timestamps, and closes work.

Run checks, then stop.

### Checkpoint 6 — Customer section and safe ticket-update draft

Build Customer around the linked support ticket, customer contact facts, and a
message composer with Public customer update / Internal note intent. Include a
timestamp-insert control for readable prose, but derive the actual event time
from the saved server action/status record when available.

Prefill, but keep editable, the message for repair-complete, waiting-on-parts,
and ready-for-pickup states. The final Send is the only path that calls Zendesk.
Disable the send path honestly when ticket linkage is absent or ambiguous.

Expected verification:

- Message draft changes with the selected/saved repair state.
- “Insert timestamp” changes draft text only.
- Opening, editing, and dismissing draft sends nothing.
- Ask for confirmation immediately before testing Send because it communicates
  externally to a customer.

Run checks, then stop.

### Checkpoint 7 — Record section and final integration pass

Move all read-mostly facts, state history, pickup audit facts, linked-ticket
reference, and source identifiers into the collapsed Record section. Verify the
whole scroll plus dock works without duplicated status controls or duplicated
action paths.

Run `pnpm verify:fast` and provide the final manual mobile checklist. Then stop.

## Required stop report template

At the end of every checkpoint, reply using exactly this shape:

```md
Checkpoint N complete — awaiting verification

Changed:
- <file>: <one-line purpose>

Verify on mobile:
1. Open `/m/rs/4799`.
2. <one exact interaction>.
3. Expect: <one visible result>.

Checks:
- <exact command/result>

Not done yet:
- Checkpoint N+1: <one-line scope>.
```

Then stop. Do not continue until the operator says `continue`.
