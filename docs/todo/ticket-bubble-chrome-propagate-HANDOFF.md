# HANDOFF — Ticket chat bubble chrome: same face on Unbox · Testing · Arrival · `/support`

**Status:** done (bubble-only; ledger/`streamVariant` deleted) · **Lane:** main (dogfood) · **Opened:** 2026-08-12 · **Closed:** 2026-08-12  
**Product ruling (user):** one conversation face on Unbox · Testing · Arrival · `/support`. Follow-up: **delete the ledger variant** — no `streamVariant`, no `TICKET_LEDGER_BODY`, no dual shell.

**Operator check remaining:** hard-reload Unbox / Testing / Arrival Ticket + `/support` (Ticket leaf is `next/dynamic`).

**Paste into the next agent (if only visual QA left):**

> Hard-reload Unbox · Testing · Arrival Ticket Displays and `/support`. Conversation is bubble-only (no variant prop).

---

## 1. Locked visual contract (Unbox dogfood = golden)

Chrome SoT (already landed; **compose, do not fork**):

`src/components/support/zendesk/chat/ticket-bubble-chrome.ts`

| Token / helper | Face |
|---|---|
| `TICKET_BUBBLE_ROW` | Avatar **left**, bubble left; tight `gap-1.5 py-1`; **never** `flex-row-reverse` |
| `TICKET_BUBBLE_SHELL` | White `bg-surface-card`, hairline border, `rounded-lg`, `max-w-[min(100%,75%)]`, `px-2 py-1` — **no** blue/amber fills |
| `TICKET_BUBBLE_MARK` + `TICKET_BUBBLE_MARK_BOX` | Quiet xs person mark (muted canvas disc), not inverse black initials |
| `TICKET_BUBBLE_BODY` | `text-role-micro leading-snug` |
| `TICKET_BUBBLE_META` | Same micro role — **no** eyebrow / uppercase |
| Age | `formatTicketBubbleAge` → **`N hrs`** / `1 hr` / `N mins` / `N days` (hover keeps absolute PST) |
| Internal | Text only: **`internal note`** — **no Lock icon**; paints **after** age: `author · N hrs · internal note` |
| `TICKET_COMPOSER_PAD` | `DISPLAYS_BODY_INSET` + `pt-2 pb-3` under the thread (inline **and** station-dock) |
| `TICKET_DETAIL_SURFACE` | Host plane only (`bg-surface-canvas/40`) — **do not** gray the whole rail for “quiet” |

Render path for the stream:

`MergedRecordStream` `variant="bubble"` + dense meta (see `MetaLine` / `RowMark` / `MessageBody` in `MergedRecordStream.tsx`).

Composer path:

`SupportChatComposer` → `TICKET_COMPOSER_PAD` → `OmnichannelComposerDock` (both inline and `station-dock`).

---

## 2. Where conversations mount today (inventory)

```
Station Ticket leaf (Unbox · Arrival · Testing / QC)
  StationDisplaysPushStack → TicketDisplayHost
    └─ SupportTicketDetail streamVariant="bubble"   ✅ bubble
         ├─ MergedRecordStream variant=bubble
         └─ SupportChatComposer (inline)

Support service workspace (/support)
  SupportTicketFocus
    └─ SupportTicketDetail streamVariant="bubble"   ✅ bubble (default + explicit)
         ├─ MergedRecordStream variant=bubble
         └─ composerPlacement="host" → SupportTicketComposerDock
```

| Host | File | Bubble today? |
|---|---|---|
| Unbox Ticket Displays | `…/line-edit/TicketDisplayHost.tsx` → `streamVariant="bubble"` | Yes |
| Arrival Ticket | `…/triage/build-triage-displays.tsx` → same `TicketDisplayHost` | Yes (shared) |
| Testing / QC Ticket | `…/testing-panel/build-testing-displays.tsx` → same `TicketDisplayHost` | Yes (shared) |
| `/support` thread | `…/service-workspace/SupportTicketFocus.tsx` → `streamVariant="bubble"` | Yes |

Out of scope (not the ticket conversation stream):
- `ClaimTicketReply` / claim compose (create/link, not the thread)
- `WarrantyTicketPopover` (separate popover surface — only port if product later asks)

---

## 3. Implementation plan (done)

### Step A — Make bubble the conversation default ✅

1. `SupportTicketDetail.tsx` — `streamVariant = 'bubble'`
2. `SupportTicketFocus.tsx` — explicit `streamVariant="bubble"`
3. `TicketDisplayHost` kept `streamVariant="bubble"`

### Step B — Dense meta on every bubble host ✅

Unchanged bubble branch in `MergedRecordStream` (already dense).

### Step C — Composer pad parity on `/support` ✅

`SupportChatComposer` — station-dock and inline both wrap with `TICKET_COMPOSER_PAD`.

### Step D — Kill the ledger-for-support house law ✅

Updated: `workbench-service.md`, `reference-timeline.md`, `ui-design-system.md`, docblocks on `MergedRecordStream` / `SupportTicketDetail` / `ticket-bubble-chrome`. Guards inverted in `ticket-chat-displays-gutter.guard.test.ts` (+ hierarchy align).

### Step E — Verify on real surfaces (operator) ⏳

Hard-reload each surface (Ticket leaf is `next/dynamic` — HMR often keeps a stale chunk):

1. **Unbox** → Displays → Ticket (linked) — golden screenshot match  
2. **Testing** → Displays → Ticket  
3. **Arrival** → Displays → Ticket  
4. **`/support`** → open a ticket with public + internal comments — bubbles, `N hrs`, `internal note` after age, white shells, quiet marks, composer gutter  

Also confirm QC presets on Testing still work (`showReplyPresets`); Unbox may keep presets off — that is **behavior**, not chrome.

### Step F — Done gate ✅

Guards + `npm run verify -- --fast` green 2026-08-12. Full `npm run verify` before commit.

---

## 4. Explicit non-goals / don’ts

- **Don’t** invent a second bubble renderer or resurrect `SupportChatThread`.
- **Don’t** gray the whole Ticket/Support column to “quiet” bubbles — quiet = shell + mark only.
- **Don’t** reintroduce blue/amber message fills; internal is words (`internal note`).
- **Don’t** keep ledger on `/support` because an old rule said “scan vs read.” Product ruled: **same display**.
- **Don’t** start/restart the user’s `:3050` server; tell them to hard-reload if the dynamic chunk looks stale.
- **Don’t** commit unless asked.

---

## 5. Acceptance checklist

- [x] Unbox · Testing · Arrival · `/support` conversation rows share one bubble path (code) — **operator visual confirm pending**
- [x] Meta reads: `Author · N hrs · internal note` (internal only when private) — guarded
- [x] No Lock icon on bubble internal label — guarded
- [x] No `flex-row-reverse` / full-bleed / blue-50 bubbles — guarded
- [x] Chrome tokens live only in `ticket-bubble-chrome.ts`; hosts only opt into `streamVariant="bubble"` / default
- [x] Guards encode the product override (Support must be bubble)
- [x] Docs no longer claim ledger is the `/support` conversation face
- [x] `verify --fast` green
- [ ] Operator hard-reload of four surfaces (§3 Step E)

---

## 6. Why stations “already look done” but Support doesn’t

`TicketDisplayHost` is shared across Unbox / Arrival / Testing — one `streamVariant="bubble"`.  
`SupportTicketFocus` never opted in and the default was `ledger`, **and** a guard **banned** bubble on `/support`. Propagation was: **flip default + Support host + reverse that guard + composer pad on host dock** — not a four-way UI rewrite.

---

## 7. Files changed

| File | Change |
|---|---|
| `SupportTicketDetail.tsx` | Default `streamVariant` → `'bubble'` |
| `SupportTicketFocus.tsx` | Pass `streamVariant="bubble"` (explicit) |
| `SupportChatComposer.tsx` | Host-dock uses `TICKET_COMPOSER_PAD` |
| `ticket-chat-displays-gutter.guard.test.ts` | Invert Support/ledger assertions |
| `support-chat-hierarchy.guard.test.ts` | Align with bubble conversation |
| `.claude/rules/display/workbench-service.md` (+ timeline / ui-ds) | Product override: bubble everywhere for ticket conversation |
| `ticket-bubble-chrome.ts` / `MergedRecordStream.tsx` docblocks | Support + stations, not “station only” |

Already correct (untouched): `TicketDisplayHost.tsx`, `MergedRecordStream.tsx` bubble branch tokens, Testing/Arrival builders that mount `TicketDisplayHost`.
