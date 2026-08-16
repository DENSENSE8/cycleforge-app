# HANDOFF — Ticket chat bubble chrome: same face on Unbox · Testing · Arrival · `/support`

**Status:** done (bubble-only; ledger/`streamVariant` deleted) · **Lane:** main (dogfood) · **Opened:** 2026-08-12 · **Closed:** 2026-08-12  
**Product ruling (user):** one conversation face on Unbox · Testing · Arrival · `/support`. **No** `streamVariant`, **no** `TICKET_LEDGER_BODY`, **no** dual shell.

**Operator check remaining:** hard-reload Unbox / Testing / Arrival Ticket + `/support` (Ticket leaf is `next/dynamic`).

**Paste into the next agent (if only visual QA left):**

> Hard-reload Unbox · Testing · Arrival Ticket Displays and `/support`. Conversation is bubble-only (no variant prop).

---

## Locked visual contract

Chrome SoT: `src/components/support/zendesk/chat/ticket-bubble-chrome.ts`

| Token | Face |
|---|---|
| `TICKET_BUBBLE_ROW` | Avatar left, bubble left; never `flex-row-reverse` |
| `TICKET_BUBBLE_SHELL` | White card, hairline, capped width — no blue/amber fills |
| `TICKET_BUBBLE_META` / age | `Author · N hrs · Internal note` (internal only when private) |
| Internal | Text only — **no Lock icon** |
| `TICKET_BUBBLE_DAY_HEADER` | Date · count as text — no gray band fill |
| `TICKET_COMPOSER_PAD` | Shared gutter under thread |

Render path (no props to opt in):

`TicketDisplayHost` / `SupportTicketFocus` → `SupportTicketDetail` → `MergedRecordStream` (always bubble) + `SupportChatComposer`

Guard: `ticket-bubble-only.guard.test.ts`
