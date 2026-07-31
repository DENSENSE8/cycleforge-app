# Inline support-ticket editor in the receiving carton pane

Status: **Superseded for Unbox** by Ticket as first-class detail-stack float
(`ReceivingTicketStack` / `detail:ticket` — same `DetailStackRailRegistrar` shell as
receiving More details). URL `?ticketView=1` still opens/closes the rail; the
pane body-swap path is retired. See plan ratification (Ticket as first-class
detail-stack float). Flag `NEXT_PUBLIC_RECEIVING_INLINE_TICKET_EDITOR` is unused
for Unbox rail mount (always on). Testing display remains deferred / tab-based.

---

# Inline support-ticket editor in the receiving carton pane (historical)

Status (historical): **Unbox v1 built** (behind `NEXT_PUBLIC_RECEIVING_INLINE_TICKET_EDITOR`, ships dark) · Surface: unbox line-edit workspace (testing display deferred) · Region contract: Workbench (focus-surface swap)

## Build log — unbox v1 (2026-07-13)

Shipped the full unbox vertical slice, flag-gated OFF by default:

- **Flag** `src/lib/receiving/inline-ticket-editor-flag.ts` — `isReceivingInlineTicketEditorEnabled()`
  reads `NEXT_PUBLIC_RECEIVING_INLINE_TICKET_EDITOR` (`1|true|on|yes`), default OFF (client-safe,
  mirrors `operations-history-flags.ts`).
- **Hook** `…/line-edit/hooks/useReceivingTicketView.ts` — reads/writes `?ticketView=1`
  (`router.replace`, preserves params), clears on a genuine sibling-line switch via the pure
  `shouldClearTicketViewOnLineChange(prev, current, open)` (unit-tested, 5 cases). `'ticketView'`
  added to `MODE_SCOPED_PARAMS` in `useReceivingMode.ts` so mode switches strip it.
- **Button** `CartonContextCard.tsx` — `Reply` `IconButton` (orange) between the ticket chip and
  seller-message button, gated on `onToggleTicketView && providerTicketId != null` (opt-in props
  `onToggleTicketView` / `ticketViewActive`). Threaded through `LineCartonContextSection`.
- **Body swap** `LineEditPanel.tsx` — `AnimatePresence mode="wait"` keyed on the ticket view, routed
  through `useMotionPresence(framerPresence.workbenchPane)` / `useMotionTransition(...workbenchPaneMount)`.
  Ticket branch = identity row (shrink-0) + `SupportTicketDetail` filling `flex-1`; toolbar, other
  body cards, feedback dock, action bar, and photo peek all unmount. Guardrail effect auto-clears
  `?ticketView=1` + toasts when no ticket resolves.
- **Testing display (phase 4): deferred by design** — `TestingCartonHeader` omits the toggle props,
  so the button never renders on `/tech`; the existing `TestingTicketReplyCard` is untouched.
  Confirmed no double composer.

Verification: `tsc` clean on all touched files (only pre-existing `.next/types` errors for the
already-deleted `/search` routes remain); hook unit test passes 5/5.

**Remaining manual step (de-risk #1):** runtime standalone-mount smoke test of `SupportTicketDetail`
in the pane with the flag on (`NEXT_PUBLIC_RECEIVING_INLINE_TICKET_EDITOR=1`) — static read confirms
no `SupportWorkspace` context dependency, but confirm overlays / photo viewer at runtime.

## Goal

A reply-icon button in the carton identity row (between the `#9494` ticket chip and the
seller-message button) that toggles a **URL-addressable full-ticket editor**. Turning it on swaps the
entire line-edit body for the reused `SupportTicketDetail` (title, thread, reply/notes,
status/priority/tags), keeping only the identity row — so an operator can update and post to Zendesk
from inside the receiving workspace and toggle straight back.

## Locked decisions (from planning Q&A)

- **Reuse** the support console — mount `SupportTicketDetail` in the pane (do not build a new editor).
- **Actions exposed:** public reply, internal note, edit title + status, priority + tags
  (all already present in `SupportChatHeader` / `SupportChatComposer`).
- **State:** URL-addressable — `?ticketView=1` (survives reload, shareable, matches the receiving
  `?mode=`/deep-link pattern + Workbench durable selection). See **Selection & URL model** below for
  how this composes with the (mostly event-driven) line selection.
- **Retained chrome:** identity row only (`LineCartonContextSection`); **unbox line-edit surface for
  v1** — the tech `TestingCartonHeader` renders the *same* `CartonContextCard` but the button is
  opt-in per surface and stays off there for v1 (see **Testing display** for why + how to enable).

## The two displays share one carton card (the load-bearing fact)

Both right-pane displays compose the **same** `CartonContextCard` for their identity row — this is
why the reply button can be added in exactly one place, and also why v1 must be *opt-in per surface*
rather than unconditional:

| Display | Panel | Identity-row wrapper | Body cards |
|---|---|---|---|
| **Unbox** (`/unbox`) | `LineEditPanel.tsx` | `LineCartonContextSection` → `CartonContextCard` | `POUnboxingSection`, `WorkspaceNotesCard`, `LineLabelPreviewCard` |
| **Testing** (`/tech`) | `TestingPanel.tsx` | `TestingCartonHeader` → `CartonContextCard` | `TestingPoUnboxingSection`, `LineTestingTabbedCard`, **`TestingTicketReplyCard`**, `LabelPreviewCard` |

Because the button lives in `CartonContextCard`, adding it there makes it appear in **both**
displays unless it is gated on a prop the caller passes. v1 passes the toggle prop from
`LineCartonContextSection` only; `TestingCartonHeader` omits it → the button is unbox-only with zero
extra branching. (Contrast the existing `showStaffPhotoRow` prop, which is how `CartonContextCard`
already varies its Photos/Claim row per caller.)

## Architecture

Region contract stays **Workbench** — this is a focus-surface swap, not a new archetype. The
collection map (sidebar rail) stays put; only the right-pane **body** crossfades between the
line-edit body and the ticket editor, keyed on `ticketView`, via
`useMotionPresence(framerPresence.workbenchPane)` (the `ReceivingRightPane` crossfade recipe). Never
animate/crossfade the rail.

## Selection & URL model (grounded — not `?recvId=`)

Receiving line selection is **not** a durable `?recvId=` param. It is event/state-driven:
`useReceivingWorkspacePane` holds the focused line in in-memory `workspace` state, set via
`dispatchSelectLine(row)` from the rail / scan resolve. The one URL entry point is
`?openReceivingId=<receiving.id>` — the **cmd+K deep-link** (`useReceivingWorkspacePane` L162), which
resolves the carton's first line, calls `dispatchSelectLine`, then the param clears.

Consequences for `?ticketView=1`:

- It survives a reload on its own, but the **selected line** only survives a reload via
  `?openReceivingId=`. The correct shareable/reload deep-link is therefore
  `/unbox?openReceivingId=<id>&ticketView=1` — resolve the line, then open the editor.
- `useReceivingTicketView` must **clear `ticketView`** whenever the focused line changes (listen for
  the same `receiving-clear-line` / select events `useReceivingWorkspacePane` already uses) and on
  mode change (`updateMode` in `useReceivingMode` already strips mode-scoped params — add `ticketView`
  to `MODE_SCOPED_PARAMS`, L41), so a stale editor can't bleed across selections or modes.

## Reuse map (build almost nothing new)

| Need | Reuse |
|---|---|
| Full ticket editor (title / thread / reply / notes / status / priority / tags / photos) | `SupportTicketDetail({ ticketId, onBack })` — `src/components/support/zendesk/chat/SupportTicketDetail.tsx` |
| Linked ticket id for the current line/carton | `useEntitySupportTicket` → `providerTicketId` (exposed as `c.providerTicketId` from `useReceivingLineCore`, L412; surfaced by both `useUnboxLineController` and `useTestingLineController`) |
| Post reply / internal note | `SupportChatComposer` → `POST /api/zendesk/tickets/:id/comments` (the console write path) |
| Edit subject / status / priority / tags | `SupportChatHeader` → `PATCH /api/zendesk/tickets/:id` |
| Overlay host + fullscreen photo viewer | **already inside** `SupportTicketDetail` — it wraps itself in `RightPaneOverlayHost` and mounts `PhotoViewerModal` (L129, L176). No pane-level host needed. |
| Reply glyph | `Reply` from `@/components/Icons` |

`SupportTicketDetail` is low-coupling: props are only `{ ticketId, onBack? }`, it owns its own hooks
(`useZendeskTicket` / `useTicketComments` / `useTicketPhotos` / staging / dropzone) and composes
`SupportChatHeader` + `SupportChatThread` + `SupportChatComposer` + `SupportSuggestionPanel` +
`SupportLinkedContext`. **No `SupportWorkspace` context dependency** — verified by reading the file
(it reaches only React Query hooks + its own child components). This is the single biggest de-risk:
the standalone-mount smoke test should pass without any provider wrapping.

## Changes (file-by-file)

### 1. Reply-toggle button — `CartonContextCard.tsx`
In the ticket block (currently `<ReceivingTicketChip/><SellerMessageChip/>` inside the
`zendeskTrimmed` branch, L472–488), insert a `rounded-lg h-8 w-8` icon button (matching the square
seller-message + photos style) **between** the chip and the seller-message button. Icon `Reply`,
orange tone to echo the ticket chip. `onClick` → `onToggleTicketView?.()`; `aria-pressed` reflects
`ticketViewActive`.

Add two **opt-in** props to `CartonContextCard`:
- `onToggleTicketView?: () => void` — omitted by callers that don't want the button.
- `ticketViewActive?: boolean` — drives `aria-pressed` + selected ring.

Render the button only when **all** of: `zendeskTrimmed` (a ticket is linked), `providerTicketId`
resolves, **and** `onToggleTicketView` is provided. Because it hangs off `onToggleTicketView`, the
testing header (which won't pass it in v1) shows nothing — no `mode` flag needed.

### 2. URL param — new `useReceivingTicketView()` hook
Sibling of `useReceivingMode`. Reads `?ticketView=` from `useSearchParams`; `setTicketView(on)` does
a `router.replace` preserving other params. **Mode/line-scoped:**
- Add `'ticketView'` to `MODE_SCOPED_PARAMS` in `useReceivingMode.ts` (L41) so `updateMode` strips it.
- In the hook, clear it on line change: subscribe to `receiving-clear-line` and the select events, or
  key it off the focused line id from `useReceivingWorkspacePane` and clear when that id changes.

### 3. Body swap — `LineEditPanel.tsx`
`LineEditPanel` is a stagger-reveal column: each card is a `<motion.div variants={revealItem}>` inside
a `motion.div variants={revealContainer}` scroll body (L175–247). The unbox body cards, in order, are:
`LineCartonContextSection` (**stays**), `POUnboxingSection`, `WorkspaceNotesCard`,
`LineLabelPreviewCard`, and the `WorkspaceActionFeedbackSlot`. Below the scroll body sit three
shrink-0 bands: the `ReceiveFeedbackRegion` dock (conditional), the `LineReceiveActionBar`, and the
`ReceivingPhotoPeek` right-edge fan.

Branch on `ticketView` **after** `<LineCartonContextSection>`:
- **on** → render `<SupportTicketDetail ticketId={c.providerTicketId} onBack={() => setTicketView(false)} />`
  and **do not mount** `POUnboxingSection` / `WorkspaceNotesCard` / `LineLabelPreviewCard` /
  `WorkspaceActionFeedbackSlot` (true unmount). Also suppress the three below-body bands
  (`ReceiveFeedbackRegion`, `LineReceiveActionBar`, `ReceivingPhotoPeek`) — the editor owns the whole
  body height, and `SupportTicketDetail` has its own sticky composer, so a lingering receive action
  bar would be a second, conflicting footer.
- **off** → today's body.

Motion: wrap the two branches in `AnimatePresence mode="wait"` keyed on `ticketView`, routed through
`useMotionPresence(framerPresence.workbenchPane)`. Note `SupportTicketDetail` is a full-height
`flex flex-col` (its own scroll region + sticky header/composer) — mount it **outside** the
stagger-reveal `motion.div` column so it fills `flex-1`, not inside the padded/`space-y-4` hero
column. Recommended: also hide `LineEditToolbar` (the `mode="unbox"` header, L155) in ticket view for
a focused "identity row only" editor — `SupportChatHeader` already provides its own header controls.

### 4. Testing display — v1 defers; do NOT double up composers
The testing panel **already ships an inline ticket reply surface**: `TestingTicketReplyCard`
(`src/components/tech/testing-panel/TestingTicketReplyCard.tsx`), rendered in `TestingPanel` L109.
It composes `TicketThreadCard` (bubble thread) + `ClaimTicketReply` (internal-note / public-reply
composer) via `useClaimTicketReply`, and shows a "File claim" empty state when a unit failed testing
with no ticket attached. Critically, it posts to a **different route** than the console:
`/api/receiving/zendesk-claim/thread` (receiving-scoped) vs `SupportTicketDetail`'s
`/api/zendesk/tickets/:id/comments`.

So the testing display already answers "reply to the linked ticket from the tech bench." v1 therefore:
- **Keeps `TestingTicketReplyCard` as-is** and does **not** add the `SupportTicketDetail` swap to
  `TestingPanel`. `TestingCartonHeader` simply omits `onToggleTicketView`, so the reply-toggle button
  never appears there. No double composer, no two write paths racing on one ticket.
- Leaves a clean enable path (below) for when we decide the tech bench also wants the full editor.

**If/when testing adopts the full editor (v2):**
1. Pass `onToggleTicketView` + `ticketViewActive` from `TestingCartonHeader` (wire to a
   `useTestingTicketView` sibling, or lift the param hook so both displays share it).
2. In `TestingPanel`, branch the body on `ticketView` the same way `LineEditPanel` does — unmount
   `TestingPoUnboxingSection` / `LineTestingTabbedCard` / `TestingTicketReplyCard` / `LabelPreviewCard`
   and the bottom `FloatingButton` (Pass + Print), render `SupportTicketDetail` in their place.
   Note `TestingPanel`'s body is a **plain** `div.space-y-4` (no stagger-reveal container like unbox),
   so the `AnimatePresence` wrapper is a touch simpler here.
3. **Reconcile the two reply paths** first — decide whether `TestingTicketReplyCard` disappears in
   favor of the console composer, or stays as a compact inline option beside the full-editor toggle.
   Shipping both a `zendesk-claim/thread` composer *and* the console `comments` composer on the same
   ticket is the main hazard to design around, not the mount.

### 5. Guardrails
- If `ticketView=1` but no linked ticket resolves (e.g. unlinked while open) → auto-clear the param,
  fall back to the normal body, toast. (`onTicketUnlinked` in `LineCartonContextSection` already fires
  `c.invalidateSupportTicket()` — hook the auto-clear off the resulting `providerTicketId === null`.)
- Overlay host / photo viewer: **already handled** — `SupportTicketDetail` self-wraps
  `RightPaneOverlayHost` and mounts `PhotoViewerModal`. Confirm nothing in the receiving pane tree
  double-wraps an overlay host that would conflict; otherwise no work here.
- Permissions: `SupportTicketDetail` writes gate on support permissions server-side (`/api/zendesk/*`).
  Confirm the receiving operator role can `PATCH`/`POST` Zendesk. The existing `TestingTicketReplyCard`
  already posts on the tech bench via `zendesk-claim/thread`, so *some* Zendesk-write grant exists for
  operators — verify the console routes carry the same grant, not a stricter support-only one.

## De-risking (do first)

1. **Standalone-mount smoke test** — render `SupportTicketDetail` with a hardcoded `ticketId` in a
   throwaway unbox-pane spot; confirm it mounts without `SupportWorkspace` context and that
   overlays / photo viewer work. Reading the file says it should (no context import); confirm at runtime.
2. Confirm `c.providerTicketId` is populated for a linked carton (verified for PO `21-14834-86931` →
   `9494` after the `serial_unit_provenance` resolver fix — see Context below).
3. Confirm the console write routes (`/api/zendesk/tickets/:id/comments`, `PATCH /api/zendesk/tickets/:id`)
   accept the receiving operator role, since v1's editor uses those, not `zendesk-claim/thread`.

## Edge cases

Line switch while open (param clears via line-id change) · unlink while open (auto-close) · reduced
motion (`useMotionPresence` handles) · no ticket (button hidden) · deep-link
`?openReceivingId=<id>&ticketView=1` reload (resolves line → renders editor) · concurrent
seller-message popover (independent) · testing display (button absent; existing `TestingTicketReplyCard`
unchanged).

## Testing

- Unit: `useReceivingTicketView` param read / toggle / clear-on-line-change / clear-on-mode-change.
- E2E (Playwright): open **unbox** carton with linked ticket → click reply → body swaps to editor +
  identity row persists + toolbar hidden → post an internal note → toggle back → deep-link
  `?openReceivingId=&ticketView=1` reload lands on the editor. Assert the **testing** panel shows no
  reply-toggle button and still renders `TestingTicketReplyCard`.

## Rollout

Optional flag `receiving_inline_ticket_editor` (env or per-org) gating the button — ship dark, then
enable for USAV. Gate at the `onToggleTicketView` wiring in `LineCartonContextSection` so a flag-off
tenant renders the pre-existing card cluster untouched.

## Assumptions (defaults; override any)

1. **Button gating:** visible only when a ticket is linked **and** the surface opts in (unbox only for
   v1). Alt: always visible, opening a "link a ticket" state.
2. **Toolbar in ticket view:** hidden (identity row only). Alt: keep it.
3. **Param name:** `ticketView`.
4. **Reply icon:** `Reply` glyph, orange tone.
5. **v1 surface:** unbox `LineCartonContextSection` only. Testing keeps its existing
   `TestingTicketReplyCard`; the full-editor swap is a documented v2 with a reply-path reconciliation
   step.

## Context / prior fixes this builds on

- Ticket display in the carton header was previously broken because
  `getPrimarySupportTicketForReceiving` queried the dropped `serial_units.receiving_line_id` column;
  repointed to `serial_unit_provenance` (`origin_type='RECEIVING_LINE'`). The reply button depends on
  `providerTicketId` resolving, which that fix restored (visible in `useReceivingLineCore` L406–412).
- `Ticket` is the single flat house ticket glyph (`src/components/icons/media.tsx`); `TicketHelp`
  delegates to it; `CHIP_TONES.ticket` renders it in place of the `#` hash for ticket-number chips.
- The testing bench's ticket reply reuses the **claim** composer stack (`ClaimTicketReply` /
  `useClaimTicketReply`) posting to `/api/receiving/zendesk-claim/thread`, distinct from the support
  console's `/api/zendesk/tickets/:id/comments`. Any convergence of the two displays must pick one
  write path per ticket.
