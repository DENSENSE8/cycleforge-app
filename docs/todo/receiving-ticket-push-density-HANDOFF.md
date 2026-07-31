# Handoff — Unbox Ticket push-over + denser type

**Self-contained.** A new session needs only this file. Paste:

> Read `docs/todo/receiving-ticket-push-density-HANDOFF.md` and execute §3–§5. Do not touch the carton identity / StationContextBar. `npm run verify` green before done.

**Lane:** stay on the checkout’s branch. User owns commits — do not commit unless asked.  
**Dev server:** attach to `:3050` — never start / restart / kill.  
**Never** `git stash`. Stage only files you touch.

**Status as of 2026-07-31:** Density + push shipped. Ticket is an in-flow push column (`ReceivingTicketStack` beside Unbox, detail-stack surface tokens, resizable) with `SupportTicketDetail` `embedded` + stronger compact type; no longer a `detail:ticket` RightRailHost float. Carton chrome untouched. `npm run verify` green.

**Prior status (2026-07-30 evening):** Ticket already left the Unbox tab strip and mounts as `ReceivingTicketStack` → `DetailStackRailRegistrar` `id="detail:ticket"` (elevated non-modal **float**, same rounded inset shell as receiving More details). Product feedback on the live UI (screenshot of Zendesk thread in that card):

1. **All fonts in the ticket panel must get a lot smaller** (header title, requester line, New/Priority/Assignee pills, INTERNAL/PUBLIC tags, bubble body, composer).
2. **Modality must become a push-over** — squeeze the Unbox workbench layout when open, not only float over it.
3. **Do not touch** the carton context top header bar (`StationContextBar` / `CartonContextCard` / `LineCartonContextSection` / `StationMoreDetails`). Entry points (Reply / chip / `?ticketView=1`) already exist — leave that chrome alone.

Reference screenshot (dogfood): ticket card showing “Found Order number…”, requester `#9666`, status pills New · Priority · Unassigned · Unassigned, blue public bubbles + amber INTERNAL note. Type currently reads console-scale; must read station-dense.

---

## 0. Hard constraints

| Rule | Detail |
|---|---|
| **No carton identity edits** | Do **not** modify `StationContextBar`, `CartonContextCard`, `LineCartonContextSection`, `StationMoreDetails`, `StationHeaderToolbar`, or `station-bookmark.ts` for this task. Reply/chip wiring already opens `?ticketView=1`. |
| **Ticket body only** | Density + push live in `ReceivingTicketStack` + `SupportTicketDetail` / chat children (scoped density), plus whatever layout host owns the push. |
| **Compose SoT** | Color/type/z from tokens (`text-role-*`). No page-local hex / raw `text-[Npx]` without role. Prefer a **density prop** on support chat (`compact` already exists — grow it) over forking a second ticket UI. |
| **One right-edge chrome** | Prefer growing an existing push/overlay primitive (`RightPaneOverlay` / DocumentSlideOver grammar, or station-scoped column that **reuses** detail-stack surface tokens) over a private `fixed right-0`. If push cannot live inside `RightRailHost` (host is fixed float geometry), keep the **rounded card surface** (`DETAIL_STACK_ASIDE_SURFACE` / detail-stack layout tokens) while changing **placement** to in-flow push. |
| **Coexistence** | `detail:receiving` (More details) and Ticket still cannot both own one host. Keep mutual exclusion (`receiving-close-details-overlay` / clear `ticketView` on details open) or re-derive after push migration — do not regress to two competing `fixed` panels. |
| **Verify** | `npm run verify` green. Never raise DS-ratchet baselines. |

---

## 1. What already shipped (do not redo)

| Piece | Where |
|---|---|
| Ticket removed from Unbox primary strip | [`unbox-tabs.tsx`](../../src/components/receiving/workspace/line-edit/terminal/unbox-tabs.tsx) |
| `ReceivingTicketStack` + `detail:ticket` float | [`ReceivingTicketStack.tsx`](../../src/components/receiving/workspace/ReceivingTicketStack.tsx) |
| URL `?ticketView=1` + line-scope clear | [`useReceivingTicketView.ts`](../../src/components/receiving/workspace/line-edit/hooks/useReceivingTicketView.ts) |
| Mount from `LineEditPanel` when ticket linked | [`LineEditPanel.tsx`](../../src/components/receiving/workspace/LineEditPanel.tsx) |
| Mutual exclusion vs receiving details | `dispatchReceivingDetailsOverlayClose` + listener in [`useReceivingDetailOverlays.ts`](../../src/components/receiving/useReceivingDetailOverlays.ts); clear ticketView on `receiving-open-details-overlay` |
| SoT notes | [`.claude/rules/source-of-truth.md`](../../.claude/rules/source-of-truth.md) Right-rail modality; [`display/station-workbench.md`](../../.claude/rules/display/station-workbench.md) |
| Historical pane-swap plan superseded | [`receiving-inline-ticket-editor-plan.md`](./receiving-inline-ticket-editor-plan.md) |

---

## 2. Product intent (why)

- **Density:** Unbox is Kinetic Ledger / station — the ticket card in the screenshot still uses near-console type (body/data scale on title + pills + bubbles). Operator needs more thread visible in ~420px without scrolling forever. Target: step **down at least one `text-role-*` rung** everywhere in the ticket panel (and tighten vertical padding to match). Prefer `embedded` + a stronger `compact` (or new `density="station-rail"`) on `SupportTicketDetail` → header / thread / composer.
- **Push-over:** Float peeks; Ticket is a **resident secondary workspace** while the carton stays open. Operator wants Unbox to **slide/squeeze left** when Ticket opens (Material-style `push` / Zendesk conversation column feel), while the card can still look like the rounded receiving-rail wrapper. Current `RightRailHost` inset float does **not** push layout — that is the gap.
- **Header bar stays:** Identity + Reply already work; polishing Ticket must not reshuffle the absolute-float carton bookmark.

---

## 3. Implementation target

### 3a. Density (do first — low blast radius)

1. Mount `SupportTicketDetail` from `ReceivingTicketStack` with **`embedded` + `compact`** (or grow an explicit rail density) so header/thread already shrink.
2. Audit and downshift **every** visible string in the ticket panel when that density is on:
   - [`SupportChatHeader.tsx`](../../src/components/support/zendesk/chat/SupportChatHeader.tsx) — title, requester, Links badge, **status/priority/assignee pills** (the four pills in the screenshot)
   - [`SupportChatThread.tsx`](../../src/components/support/zendesk/chat/SupportChatThread.tsx) — INTERNAL/PUBLIC tags, meta line, bubble body (`text-role-data` → `text-role-caption` / `text-role-micro` as appropriate)
   - [`SupportChatComposer.tsx`](../../src/components/support/zendesk/chat/SupportChatComposer.tsx) — textarea + hints
3. Prefer role tokens; if a raw `text-sm` remains in thread empty/error states, migrate to `text-role-*`.
4. Do **not** shrink Support **console** full-page ticket unless the density prop defaults keep console unchanged. Scope the aggressive shrink to Unbox rail / `embedded`/`compact` path only.
5. Visual check on `:3050`: open linked ticket → Reply → compare to screenshot — title + pills + bubbles should read clearly denser.

### 3b. Push-over (modality)

1. **Chosen approach:** station-scoped **in-flow push column** beside the Unbox workbench (`ReceivingRightPane` / `LineEditPanel` shell), **visually** using the same detail-stack surface tokens (`rounded-2xl`, inset gap, card shadow from [`detail-stack/layout.ts`](../../src/design-system/shells/detail-stack/layout.ts)) so it still “acts like the floating rounded wrapper.”
2. **Stop registering Ticket as a `RightRailHost` occupant** once push is live (or register a yield) so More details can still float without fighting Ticket’s geometry.
3. Opening Ticket still suspends/closes `detail:receiving`; opening More details still clears `?ticketView=1` **or** floats details over the squeezed canvas — keep one coherent rule and document it in SoT.
4. Resize: reuse `useHorizontalEdgeResize` / `DETAIL_STACK_RESIZE` grammar where possible; persist width.
5. Narrow viewport: collapse to overlay or full-pane rather than crushing scan UI below usable width.
6. Update SoT: Ticket is a **right-edge push work surface** with detail-stack **surface** tokens; receiving More details remains **non-modal float** on `RightRailHost`. Amend the earlier “Ticket = detail:ticket float” note accordingly.

### 3c. Explicitly out of scope

- Carton identity / `StationContextBar` / Reply button placement / chip lockup.
- Claim modal / auto-ticket / subject bugs ([`claim-subject-fba-unknown-HANDOFF.md`](./claim-subject-fba-unknown-HANDOFF.md)).
- Restoring the Unbox **Ticket tab**.
- Nesting receiving Details as a second Ant drawer inside Ticket.

---

## 4. Acceptance criteria

- [x] Ticket panel typography is **noticeably smaller** than the 2026-07-30 screenshot (header, pills, tags, bubbles, composer) on the Unbox path only.
- [x] Opening Ticket **pushes/squeezes** the Unbox workbench; closing restores width. Not merely a float over unchanged layout.
- [x] Rounded card / receiving-rail visual grammar preserved (inset + `rounded-2xl` surface) — not a flush full-bleed slab unless SoT forces it.
- [x] Carton context top header bar **unchanged** (no diff in identity/bookmark files listed in §0).
- [x] `?ticketView=1` + Reply + chip still open/close Ticket; mutual exclusion with More details still sane.
- [x] Support console (non-embedded) ticket type **not** degraded.
- [x] `npm run verify` green; no ratchet baseline bumps.

---

## 5. Paste-ready agent prompt

```text
Read docs/todo/receiving-ticket-push-density-HANDOFF.md and implement §3.

Goals:
1) Make ALL fonts in the Unbox Ticket panel a lot smaller (header, status pills, INTERNAL/PUBLIC, bubbles, composer) via SupportTicketDetail density — console path unchanged.
2) Convert Ticket from RightRailHost float to a layout push-over that squeezes Unbox, while keeping the rounded detail-stack surface look.
3) Do NOT touch StationContextBar / CartonContextCard / LineCartonContextSection / StationMoreDetails / carton identity chrome.

Attach to :3050. Stay on this branch. Do not commit unless asked. npm run verify before done.
```

---

## 6. Key files (start here)

| File | Role |
|---|---|
| [`ReceivingTicketStack.tsx`](../../src/components/receiving/workspace/ReceivingTicketStack.tsx) | Swap float registrar → push host; pass density props |
| [`LineEditPanel.tsx`](../../src/components/receiving/workspace/LineEditPanel.tsx) / [`ReceivingRightPane.tsx`](../../src/components/receiving/ReceivingRightPane.tsx) | Likely push column parent |
| [`SupportTicketDetail.tsx`](../../src/components/support/zendesk/chat/SupportTicketDetail.tsx) + Header / Thread / Composer | Density |
| [`detail-stack/layout.ts`](../../src/design-system/shells/detail-stack/layout.ts) | Surface tokens to reuse |
| [`RightPaneOverlay.tsx`](../../src/components/ui/RightPaneOverlay.tsx) | Existing pane-anchored slide-over cousin |
| [`.claude/rules/source-of-truth.md`](../../.claude/rules/source-of-truth.md) | Update modality after push lands |
| [`.claude/rules/display/station-workbench.md`](../../.claude/rules/display/station-workbench.md) | Ticket compound |

---

## 7. Done definition

Handoff complete when §4 checkboxes pass and verify is green. Leave a short note in this file under **Status** when push + density ship (date + one line).
