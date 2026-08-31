# IMPLEMENTATION PROMPT — Station composer Ticket Telegram UX

**Paste everything below the horizontal rule into a fresh agent session.**  
Repo: `cycleforge-app` on **`main`**.  
Plan of record: [`station-composer-ticket-telegram-PLAN.md`](./station-composer-ticket-telegram-PLAN.md).  
Hard verifier: [`station-composer-ticket-telegram-VERIFY.md`](./station-composer-ticket-telegram-VERIFY.md).

Related (do not conflate):

- [`station-composer-HANDOFF-PROMPT.md`](./station-composer-HANDOFF-PROMPT.md) — mode row **below** outline; Unbox \| Ticket locks
- [`po-line-capture-composer-collapse-IMPLEMENTATION-PROMPT.md`](./po-line-capture-composer-collapse-IMPLEMENTATION-PROMPT.md) — in-row Serial capture — **touch nothing**

**Surface:** `StationComposerHost` via `LineNotesCard` on Unbox scan station only.

---

You are implementing **Telegram-mobile inline editing** for **Ticket mode** on the station composer: channel and audience **above** the draft, **`+` drill-down** for “Add to message”, **`@`/Cc for Zendesk emails on public reply only**.

Treat every **REQ-*** row in the PLAN and VERIFY files as a **hard gate**. If a REQ cannot be met, stop and report — do not ship a partial metaphor swap (e.g. `@` still attaching product).

Work on **`main` only**. Operator owns commits. Do not restart `:3050` / `usav-dev` unless the work requires it.

## Anatomy (locked)

```
┌─────────────────────────────────────────────────────────────┐
│ Internal │ Public                                            │
│ @ Cc … [email input]                    ← Public only         │
│ [product chip] [fact chip]…                                   │
│  Message… (auto-grows)                                        │
│ [+]                                              [↵ Send]     │
└─────────────────────────────────────────────────────────────┘
[ Unbox ] [ Ticket ]                                       ( ◠ )
```

| Control | Ticket | Unbox |
|---|---|---|
| Internal / Public | **Above textarea** — never inside `+` | hidden |
| `@` / CC strip | **Public only** — Zendesk email CCs | hidden |
| Context chips | Above textarea — from `+` inserts | hidden |
| `+` | **Drill menu** (stack navigation) | Existing flat insert rail |
| Location · Print | hidden | unchanged |

**Hard rule:** Mode faces + procedure ring stay **below** the outline only (existing handoff). **No layout animations.**

## Done when

### Phase A — separation (block Phase B until VERIFY Phase A green)

- [ ] **REQ-CHAN-01/02/03** — `VisibilityToggle` (`appearance="flush"`) above ticket textarea via new dock slot `insetTop`.
- [ ] **REQ-CC-01–04** — `ComposerTicketCcStrip` extracted from `SupportChatComposer`; shown when Public; `@` or Cc affordance focuses email input.
- [ ] Internal/Public **removed** from `ticketPlusMenu` / `+` popover in `LineNotesCard`.
- [ ] **REQ-SEND-02** — `handleTicketCommit` passes `emailCcs` to `useSupportReply` when Public (port logic from `SupportChatComposer` submit).
- [ ] **REQ-SEND-01** — Internal still signs with staff name.
- [ ] `SupportChatComposer` refactored to import shared CC strip (no duplicate CC UI).
- [ ] Unit tests for channel visibility + CC payload (see VERIFY).

### Phase B — drill menu + context

- [ ] **REQ-PLUS-01/02/08/09** — `ComposerDrillMenu`: stack in one `ComposerPlusMenuPanel`, back header, instant page swap (no height tween).
- [ ] **REQ-PLUS-03/04** — Ticket `+` tree: **This item**, **What happened** → facts (`buildWhatHappenedFacts`), chips in inset chrome.
- [ ] **REQ-PLUS-*** — Remove product/context **`@` menu** from `ComposerTicketContextTools`; `@` is CC-only on Public.
- [ ] **REQ-UNBOX-01/02** — Unbox `+` unchanged (flat coloured inserts via `NoteComposerInsertRail`).
- [ ] `composer-drill-menu.test.tsx` green.

### Phase C — photos (skip only with VERIFY skip row + operator-visible disabled state)

- [ ] **REQ-PLUS-05–07** — Photos submenu: Browse library · Upload file.
- [ ] **REQ-SEND-03** — Staged `photoIds` on send; thumb strip above field (port from Support chat).
- [ ] If staging cannot mount: disable Photos rows + document blocker — **do not** invent a parallel upload API.

### Final gate

- [ ] All VERIFY **REQ-*** rows checked or explicitly skipped with reason.
- [ ] Interaction budgets in PLAN §6 not regressed.
- [ ] `npm run verify` green.

## Read first (in order)

1. `docs/todo/station-composer-ticket-telegram-PLAN.md`
2. `docs/todo/station-composer-ticket-telegram-VERIFY.md`
3. `docs/todo/station-composer-HANDOFF-PROMPT.md`
4. `src/components/support/zendesk/chat/SupportChatComposer.tsx` — CC strip, toggle placement, submit payload, photo staging
5. `src/components/receiving/workspace/line-edit/LineNotesCard.tsx` — today’s `ticketPublic`, `ticketPlusMenu`, `handleTicketCommit`
6. `src/components/composer/StationComposerHost.tsx` — mode switch, `+` wiring
7. `src/components/composer/ComposerPlusMenu.tsx` + `note-composer-helpers.ts` — panel/row tokens (edge-to-edge)
8. `src/components/composer/ComposerTicketContextTools.tsx` — refactor attach logic, drop `@` context menu
9. `src/hooks/useSupportReply.ts` — `emailCcs`, `photoIds`
10. `src/design-system/primitives/OmnichannelComposerDock.tsx` — add `insetTop`

## Build order (locked)

1. **`insetTop` on `OmnichannelComposerDock`** — inside shell, above textarea; edge-to-edge.
2. **`ComposerTicketCcStrip`** — extract from Support chat; testids from VERIFY.
3. **`ComposerTicketInsetChrome`** — toggle + conditional CC + chip row slot.
4. **`StationComposerHost`** — pass `insetTop` when `mode === 'ticket'`; accept ticket inset props from `LineNotesCard`.
5. **LineNotesCard** — CC state, wire commit payload, remove channel rows from `ticketPlusMenu`.
6. **Refactor SupportChatComposer** to use shared CC strip.
7. **`ComposerDrillMenu` + `ticket-composer-insert-tree.ts`** — stack navigation primitive.
8. **Rewire Ticket `+`** to drill menu; refactor context tools.
9. **Phase C photos** if staging hook lands cleanly.
10. **`npm run verify`**.

## Component contracts

### `ComposerDrillMenu`

```ts
type ComposerDrillNode =
  | { type: 'action'; id: string; label: string; icon?: ReactNode; disabled?: boolean; onSelect: () => void }
  | { type: 'submenu'; id: string; label: string; icon?: ReactNode; children: ComposerDrillNode[] };
```

- Trigger: `ComposerPlusTrigger` (circular `+`, `data-testid="composer-plus"`).
- Panel: `data-testid="composer-drill-menu"`.
- Back: `data-testid="composer-drill-back"`.
- Reset stack on close.

### CC strip

- Root: `data-testid="composer-ticket-cc-strip"`.
- Email input: `data-testid="composer-ticket-cc-input"`.
- Chip: `data-testid="composer-ticket-cc-chip"` + email in text.

### Channel toggle

- Wrapper: `data-testid="composer-ticket-channel"`.
- `data-composer-channel="public" | "internal"` on inset chrome root (match Support chat).

## Report back

1. Phase completed (A / B / C / deferred).
2. Paths changed.
3. REQ checklist — pass / skip / fail per VERIFY table.
4. Before/after anatomy (one ASCII block).
5. How photo staging is wired (or skip reason).
6. `npm run verify` result.
7. Anything deferred to a follow-up prompt.

## Non-goals

- In-row PO capture composer
- Warehouse OS `AssistantFeed`
- Full `/support` page redesign
- `DropdownMenuSub` flyout submenus for station `+`
- Second textarea in Displays
- Branches; commits without being asked
- Layout animations
- Regex-over-source house-law tests
