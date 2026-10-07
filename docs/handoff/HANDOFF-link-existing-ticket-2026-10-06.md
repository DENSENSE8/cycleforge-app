# Handoff — link existing ticket, full-screen read-before-link (2026-10-06)

Paste this whole file as the first message of a fresh session in `~/Projects/cycleforge-lanes/prod`.

Screenshot of the bug: the centered card titled "Link to an existing ticket?" with the candidate list and the blue Link button painting past the card's right edge onto the gray scrim. Status words ("pending", "open") sit on that scrim. Subjects are cut off.

---

## Goal

Replace that small card with a full-screen read-before-link surface.

Left side is a control plane: search at the top, the ticket list under it. Clicking a row opens that ticket on the right. The right side scrolls, and it shows the ticket in enough detail that the operator can read it and confirm it is the right one before they link it.

The composer button that opens this surface stays above the composer, top left, only while nothing is linked. It gets a larger corner than the composer shell, and an orange face so it is readable.

---

## Current state (read these before editing)

### Composer button

- `src/components/receiving/workspace/line-edit/ComposerLinkTicket.tsx`
- Mounted from `LineNotesCard` only when `!hasTicket`, Zendesk is allowed, and `receivingId > 0`.
- Sits in a `px-3 pb-1.5` row **above** `StationComposerHost`.
- Label: `Link existing ticket?`. Icon: `Link2` on the left. Today: `Button` `variant="secondary"` `size="sm"`. Default button radius is the control corner (`rounded-mode-control`, 8px).
- The composer shell corner is `COMPOSER_SHELL_CORNER` = `rounded-2xl` (16px) in `src/design-system/tokens/radius.ts`. The button must be rounder than that. Next rung is `rounded-3xl` (24px, the `canvas` role). `cn()` / tailwind-merge treats `rounded-3xl` and `rounded-mode-control` as the same rounded group (`src/utils/_cn.ts`), so a `rounded-3xl` class on the button wins over the default control corner. Do not use `radius="composer"` — that **is** the composer corner.
- Orange face: `variant="warning"` (`bg-amber-700 text-white` in `src/design-system/primitives/button-variants.ts`). That is the readable orange. Do not use a pale amber tint.

### The card that is broken

- `TicketLinkPopover` in `src/components/support/context/TicketLinkPopover.tsx` renders the design-system `Dialog` (`src/design-system/components/Dialog.tsx`).
- `DialogContent` is overridden with `w-full max-w-sm gap-3 rounded-3xl border-0 p-4`. `max-w-sm` is 24rem. The dialog does not clip its children.
- `TicketLinkPicker` (same file) is the body: a search input, a `max-h-48` bordered list of `TicketPickRow`s, a "N more matches already linked to another item" line, and a full-width primary `Link ticket` button.
- `TicketPickRow` (`src/components/ui/TicketPickRow.tsx`) truncates the subject. The status is the row's `trailing` slot. In the screenshot the list box and the Link button extend past the white card; the status paints on the scrim. Fix that by making the surface big enough and `overflow-hidden` on the shell, not by truncating harder.

### What already works — keep it

- Button hidden once a ticket is linked.
- After a successful link, `ComposerLinkTicket` invalidates support caches, patches the rail (`patchReceivingRailTicketByCarton`), dispatches `dispatchLineUpdated` with `zendesk_ticket`, invalidates receiving feeds, then calls `onLinked`.
- Unbox passes `onTicketLinked={onClaimTicketCreated}` from `src/components/receiving/workspace/LineEditPanel.tsx`, which refreshes the support ticket and `selectTask('ticket')`. That is the thread switch. Do not toast "Claim filed".
- Identity prefetch: `GET /api/support/tickets/link?list=identity&tracking=&order=` → `findTicketIdentityMatch` in `src/lib/support/ticket-link.ts`. Local `ticket_links` only. Tracking match wins over order. Wired in `src/app/api/support/tickets/link/route.ts` before the anchor parser, so it needs no `anchorType`.
- When that match exists, the card is `bg-surface-success` and the title is "Pair to existing ticket" in `text-orange-600`, with a Pair button that links `match.id`. Keep this: if a match exists, open the full-screen surface with that ticket **already selected and loaded on the right**, and keep the green ground and orange type on that pair state.
- When nothing matched, the search box stays empty. Do not seed the carton's tracking number into the search. `initialQuery` on the picker is a host-typed id, not a tracking seed.
- The dashed "Link ticket" chip was removed from `LinkageStrip` (`src/components/support/context/LinkageStrip.tsx`). Do not put it back. Link tracking and Link order chips stay.
- `SupportContextCustomer` and the pickup record still open `TicketLinkPopover`. They should get the same full-screen surface.
- `RepairTicketPanels` mounts `TicketLinkPicker` **inline** inside the repair record. Leave that inline. Do not force a full-screen dialog into the repair panel.

### Link write (do not invent a new one)

`TicketLinkPicker` already posts through `linkRequest`:

- Receiving anchor → `POST /api/receiving/zendesk-claim/link` with `{ receivingId, lineId, ticketId }`.
- Every other anchor → `POST /api/support/tickets/link` with `{ ticketId, anchor }`.

Both return `{ success, ticketNumber }`. Success toast is `Linked ${ticketNumber}`. Then close and run `onLinked`.

Candidate list: `GET` the same link routes with `query`. Receiving uses `/api/receiving/zendesk-claim/link?receivingId=&lineId=&query=`. Others use `/api/support/tickets/link?` + `anchorToParams`. Response: `{ tickets, hiddenLinked }`. Ticket shape from `listTicketLinkCandidates` (`src/lib/zendesk-link-candidates.ts`): `id`, `subject`, `description` (capped at 600 characters), `status`, `priority`, `createdAt`, `updatedAt`, `url`, `linkedToThis`. The 600-character slice is not enough to read the ticket. The right pane must load the real ticket.

### Do not use the receiving thread route for the preview

`GET /api/receiving/zendesk-claim/thread?ticketId=` (`src/app/api/receiving/zendesk-claim/thread/route.ts`) returns 404 unless the ticket is **already** linked to a `RECEIVING` or `RECEIVING_LINE` entity. Candidates in this picker are not linked to this carton yet. That route will not show them.

Use the helpdesk reads. Both require `integrations.zendesk` + feature `support`, the same permission as `POST /api/support/tickets/link`:

- `GET /api/zendesk/tickets/[id]` — `{ success, ticket }` where `ticket` is the mirrored Zendesk ticket (`src/lib/zendesk.ts` `ZendeskTicket`: subject, description, status, priority, requester_id, tags, created_at, updated_at, external_id, and the rest of the payload).
- `GET /api/zendesk/tickets/[id]/comments` — `{ success, ...pageMirrorComments }`. Comments have `id`, `body`, `html_body`, `public`, `created_at`, `author_id`. Omit `page` / `perPage` to get the whole thread.

Load both when a row is selected. Cache on `['ticket-link-preview', ticketId]`. Do not refetch the list when the selection changes.

---

## Requirements

1. **Full-screen surface.** Keep `Dialog` (do not hand-roll a second scrim). `DialogContent` fills the viewport with a small inset (`w-[min(100vw-2rem,80rem)] h-[min(100vh-2rem,52rem)]` or equivalent), `overflow-hidden`, `rounded-3xl`, `border-0`, `p-0`. Nothing inside it paints onto the scrim. The close control stays in the corner of this surface.

2. **Left: control plane.** A column about 22–26rem, full height, with its own scroll.
   - Search is the first row inside that column, not a header floating over the whole screen. Placeholder stays `Search or paste #ticket…`.
   - Under it, the candidate rows. Reuse `TicketPickRow`. The selected row is visibly selected.
   - Status stays inside the row. Subjects may truncate on the row; the full subject is on the right.
   - The "N more matches already linked to another item" line stays under the list, inside the column.
   - Empty, loading, and error states stay inside the column.

3. **Right: the ticket, scrollable.** Selecting a row loads ticket + comments and paints them in this pane. The pane scrolls independently of the list.
   - Show subject, ticket id (`TicketPickRow` / `TicketChip`), status, priority, created and updated times, and the description.
   - Then the comments in chronological order: public vs internal, time, and the full body. Do not clamp or line-clamp the comment bodies. The operator is reading them to decide.
   - Before a selection: a quiet empty state, "Select a ticket to read it."
   - While the preview loads: a spinner in the right pane only. The list stays put.
   - If the preview 404s or the helpdesk is not connected: say so in the right pane. Do not clear the selection.

4. **Link only after a selection.** One link control, in the right pane's footer, not under the list. Disabled until a ticket is selected and the preview has loaded (so they had the body to read). Label `Link ticket`, or `Pair` when the identity match is the selected ticket. Pending state stays on that button. Enter in the search still submits only when a parsed ticket id or a selection exists; it must not link the identity seed by itself (that rule is already in `submitLink`).

5. **Identity match.** If `findTicketIdentityMatch` returned a ticket, open with that row selected and its preview loading. Title "Pair to existing ticket", green ground (`bg-surface-success`) and orange type (`text-orange-600`) on the pair heading. The list can still be searched to pick a different ticket; changing the selection clears the pair styling.

6. **Composer button.** `Link existing ticket?`, chain icon on the left, top left above the composer, only while unlinked. `variant="warning"`, `rounded-3xl` (rounder than `COMPOSER_SHELL_CORNER`). Same `data-testid="composer-link-ticket"`.

7. **Screenshot defects this removes.**
   - List and Link button no longer escape a 24rem card.
   - Status is not painted on the scrim.
   - The operator can read the ticket before linking.
   - The button above the composer is orange and rounder than the composer edge.

## Out of scope

- Do not add a new link-write route.
- Do not put the dashed Link ticket chip back on `LinkageStrip`.
- Do not seed tracking into the search box.
- Do not change repair's inline `TicketLinkPicker` into this full-screen shell.
- Do not start, restart, or switch a lane. Prove the UI on the lane already serving `:3050`.

## Done when

- On an unlinked carton, the orange round button sits above the composer. The composer's own corner is still `rounded-2xl`; the button is `rounded-3xl`.
- Opening it shows a full-screen two-pane surface. Search filters the left list. Clicking a row fills the right pane with subject, description, and the comment thread, and that pane scrolls.
- Linking closes the surface and the station ticket thread is the ticket that was just linked (Unbox: `selectTask('ticket')` via `onClaimTicketCreated`).
- A tracking or order hit opens with that ticket already on the right, pair heading in orange on green.
- No identity hit leaves the search empty.
- `pnpm verify:fast` is green for this change. Typecheck already passed on the previous slice; lint/routes/ring failures that are not in these files belong to other sessions — do not "fix" them.
- Click through on `:3050`: open the button, select a ticket, scroll the right pane, link, confirm the composer hides the button and the thread is that ticket. The lane redirects to `/signin` when logged out; use the operator's already-signed-in session.
