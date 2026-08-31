# Station composer — Ticket Telegram UX (inline editing)

**Status:** plan of record · **Written:** 2026-08-30 · **Branch:** `main`  
**Implementation prompt:** [`station-composer-ticket-telegram-IMPLEMENTATION-PROMPT.md`](./station-composer-ticket-telegram-IMPLEMENTATION-PROMPT.md)  
**Verifier:** [`station-composer-ticket-telegram-VERIFY.md`](./station-composer-ticket-telegram-VERIFY.md)

**Sits on top of (compose, do not rebuild):**

| Prior | Role |
|---|---|
| [`station-composer-HANDOFF-PROMPT.md`](./station-composer-HANDOFF-PROMPT.md) | Locked anatomy: modes **below** outline; Unbox \| Ticket; flex-col dock |
| [`po-line-capture-composer-collapse-IMPLEMENTATION-PROMPT.md`](./po-line-capture-composer-collapse-IMPLEMENTATION-PROMPT.md) | In-row Serial capture — **out of scope** |
| `SupportChatComposer` | CC strip, `VisibilityToggle`, photo staging, `useSupportReply` — **port targets** |
| `ComposerPlusMenu` + `NoteComposerInsertRail` | Shared menu chrome — **extend**, do not fork a third popover |

**Surface:** Unbox scan-station dock only — `StationComposerHost` via `LineNotesCard` / `WorkspaceNotesCard`.  
**Not:** Warehouse OS `AssistantFeed`, `/support` full-page chat fork, in-row PO capture composer, second textarea in `StationTicketPane`.

---

## THIS SHIP (operator deliverable)

Turn Ticket mode into a **Telegram-mobile inline editing** experience: one
auto-growing field, the channel on the action bar beside `+`, Cc above the
draft, **`+` = attach a photo** (Browse library · Upload file), **`@` adds
Zendesk CC emails** on public reply only.

**One sentence:** Channel → audience → photo → message → send. No buried mode
switch inside `+`.

---

## 0. Anatomy (locked target)

> **Operator rulings 2026-08-30 (supersede the first draft of this section):**
> 1. Internal / Public moved **onto the action bar, immediately right of `+`** —
>    not above the textarea. Rationale: recipients and attachments *describe*
>    the message so they sit above the text they apply to; the channel is
>    something you *do* to the draft, so it belongs on the bar with the other
>    verbs. It is still never inside `+`, which is the invariant REQ-CHAN-01
>    exists to protect.
> 2. **“This item” and “What happened” are removed from `+`**, and the panel
>    carries **no “Add to message” title**. `+` is photo attach and nothing
>    else, so the attached-context chip row is gone with them.

```
┌─────────────────────────────────────────────────────────────┐
│ @ Cc  cc@… · cc@…  [type email…]  ← Public only (CC strip)  │
│ [📷 staged thumbs]                ← after + → photo         │
│                                                             │
│  Message… (auto-grows, Shift+Enter)                         │
│ [+] [ Internal │ Public ]                      [↵ Send]      │
└─────────────────────────────────────────────────────────────┘
[ Unbox ] [ Ticket ]                                     ( ◠ )

+ opens:   Browse library
           Upload file          (flat; no title row)
```

| Control | Ticket mode | Unbox mode | Never |
|---|---|---|---|
| **Internal / Public** | Action bar, right of `+`, always visible in Ticket | hidden | Inside `+` menu |
| **`@` CC strip** | Public only; port from `SupportChatComposer` | hidden | Confused with context attach |
| **Context chips** | **removed 2026-08-30** — nothing can create one | N/A | Re-added without being asked |
| **`+`** | Browse library · Upload file (flat, untitled) | Flat insert list (existing rail) | Radix flyout submenus on station |
| **Location** | hidden | bottom bar left of Print | Ticket mode |
| **Print·Receive** | hidden | bottom bar trailing | Ticket mode |
| **Mode row** | below outline only | below outline only | Inside bordered shell |

**Hard rules (inherit from station-composer handoff):**

- Modes = **Unbox \| Ticket** only; no dropdown; ring below outline.
- **No layout animation** on channel switch, menu drill, or chip mount (instant show/hide).
- **One textarea** — `composerPlacement="host"` on ticket pane stays; Displays thread is read-only above.

---

## 1. Control separation (Telegram grammar)

Telegram mobile keeps four concerns separate. Map them 1:1:

| Telegram | Station Ticket | Implementation |
|---|---|---|
| Channel / DM | Internal note vs Public reply | `ComposerTicketChannelToggle` → `VisibilityToggle` (`appearance="flush"`) on the action bar |
| @ mentions / recipients | Zendesk **email CC** on public reply | `ComposerTicketCcStrip` ported from `SupportChatComposer` |
| Attach | **`+` → Browse library · Upload file** | `ComposerDrillMenu` (flat today; the stack stays for a third photo source) |
| Message body | Single draft | `ticketDraft` in `LineNotesCard` |

**Critical fix:** Today `ComposerTicketContextTools` uses **`@` for product/context attach** and buries **Internal/Public inside `+`**. This ship **inverts that**:

- **`@`** = audience (CC emails) — **Public only**
- **`+`** = draft inserts (this item, what happened, photos drill-down)

---

## 2. Use-case catalog (REQ ids — verifier judges diffs against these)

### 2.1 Mode & channel

| ID | Actor | Given | When | Then | Budget |
|---|---|---|---|---|---|
| REQ-MODE-01 | Operator | On Unbox line with linked ticket | ⌥2 or tap **Ticket** | Draft switches to ticket; channel row appears; Print hidden | ≤1 |
| REQ-MODE-02 | Operator | Ticket mode | ⌥1 or tap **Unbox** | Label note draft; channel/CC/chips hidden; Location + Print return | ≤1 |
| REQ-CHAN-01 | Operator | Ticket mode | Default open | **Internal** selected; amber wash on toggle; toggle sits right of `+` on the action bar | 0 extra |
| REQ-CHAN-02 | Operator | Ticket mode | Tap **Public** | CC strip appears; `@` affordance visible | ≤1 |
| REQ-CHAN-03 | Operator | Public → Internal | Toggle back | CC strip hidden; pending CC input folded or preserved in state (document choice in code comment) | ≤1 |

### 2.2 Audience (@ CC)

| ID | Given | When | Then | Budget |
|---|---|---|---|---|
| REQ-CC-01 | Public reply; Zendesk connected | Type email + Enter in CC field | Chip added; suggestions from requester + agents (`useZendeskAgents`) | ≤2 after Public |
| REQ-CC-02 | CC chips present | Tap × on chip | Removed from list | 1 |
| REQ-CC-03 | Public reply with CCs | Send | `reply.mutate({ emailCcs })` — same shape as `SupportChatComposer` | ≤3 total send |
| REQ-CC-04 | Internal note | — | No CC strip; `emailCcs` never sent | — |

### 2.3 Add to message (`+` drill menu)

| ID | Given | When | Then | Budget |
|---|---|---|---|---|
| REQ-PLUS-01 | Ticket mode | Tap `+` | Panel of rows, **no title row** | ≤1 |
| ~~REQ-PLUS-02~~ | — | — | **WITHDRAWN 2026-08-30** — no “What happened” submenu | — |
| ~~REQ-PLUS-03~~ | — | — | **WITHDRAWN 2026-08-30** — no fact insert, no chip | — |
| ~~REQ-PLUS-04~~ | — | — | **WITHDRAWN 2026-08-30** — no “This item” product chip | — |
| REQ-PLUS-05 | Root open | — | **Browse library** · **Upload file** at the root (flat, not behind a `Photos ›` page) | ≤1 |
| REQ-PLUS-06 | Tap **Upload file** | Pick file | Staged via `useTicketPhotoStaging`; thumb above the field | ≤2 |
| REQ-PLUS-07 | Tap **Browse library** | Select library photos | `SupportPhotoLibraryPicker` path; `photoIds` on send | ≤3 |
| REQ-PLUS-08 | Menu in a submenu | Tap ← back | Pops stack; parent returns without closing popover (primitive kept; no ticket submenu ships today) | 1 |
| REQ-PLUS-09 | Escape / outside click | — | Closes entire menu; stack resets to root | 1 |

### 2.4 Unbox `+` (unchanged behaviour, new chrome optional)

| ID | Given | When | Then |
|---|---|---|---|
| REQ-UNBOX-01 | Unbox mode | Tap `+` | Existing coloured inserts (stamp, ticket subject, unit price, sync PO, title, serial, last notes) — **not** drill stack unless row count forces Phase 2 grouping |
| REQ-UNBOX-02 | Unbox mode | — | No channel toggle, no CC, no ticket chips |

### 2.5 Send

| ID | Given | When | Then |
|---|---|---|---|
| REQ-SEND-01 | Internal + text | Enter | Body signed `— StaffName`; `isPublic: false` |
| REQ-SEND-02 | Public + text + CCs | Enter | `isPublic: true`; `emailCcs` included |
| REQ-SEND-03 | Staged photos | Enter | `photoIds` passed like `SupportChatComposer` |
| REQ-SEND-04 | Success | — | Draft + chips + CCs cleared; optimistic comment in thread cache |

---

## 3. Component design

### 3.1 `ComposerDrillMenu` (new primitive)

**Location:** `src/components/composer/ComposerDrillMenu.tsx`

Declarative tree:

```ts
export type ComposerDrillNode =
  | {
      type: 'action';
      id: string;
      label: string;
      icon?: ReactNode;
      iconTone?: string;
      disabled?: boolean;
      onSelect: () => void;
    }
  | {
      type: 'submenu';
      id: string;
      label: string;
      icon?: ReactNode;
      children: ComposerDrillNode[];
    };
```

Behaviour:

- Single `ComposerPlusMenuPanel`; **stack** of `{ title, nodes }[]`.
- **No header on the root page** — a title over a short list of verbs is a label
  for a question nobody asked (operator ruling).
- Header row when `stack.length > 1`: ← back + submenu title.
- Submenu rows: `ComposerPlusMenuRow` + `ChevronRight` (muted).
- Leaf `onSelect`: run handler; close menu; reset stack.
- **No height tween** between stack pages — swap children instantly.
- Reuse `ComposerPlusTrigger` for the circular `+`.

Ticket tree config lives in `src/lib/composer/ticket-composer-insert-tree.ts`
(pure data + factory). It returns the two photo actions **flat** — one row that
drills into two rows costs an interaction and buys nothing.

### 3.2 `ComposerTicketCcStrip` (extract + share)

**Location:** `src/components/composer/ComposerTicketCcStrip.tsx`

Extract from `SupportChatComposer` lines ~265–307:

- Props: `ccs`, `onCcsChange`, `requesterEmail`, `suggestions` pool
- `data-testid="composer-ticket-cc-strip"`
- `@` label chip or Mail icon + “Cc” eyebrow (match Telegram: small **@** button that focuses email input is acceptable if strip stays one row)

Refactor `SupportChatComposer` to import the strip — **one SoT**, two hosts.

### 3.3 `ComposerTicketInsetChrome` (Cc + thumbs) · `ComposerTicketChannelToggle` (channel)

**Locations:** `src/components/composer/ComposerTicketInsetChrome.tsx`,
`src/components/composer/ComposerTicketChannelToggle.tsx`

Above the textarea when `mode === 'ticket'` (dock `insetTop`):

1. CC strip when public
2. Staged photo thumbs

Renders **nothing** when internal with no staged photos — an empty rule above
the field would just steal draft height.

On the action bar (dock `footerStart`, right of `+`):

- `ComposerTicketChannelToggle` — `VisibilityToggle` flush, `data-testid="composer-ticket-channel"`

### 3.4 Dock extension

Add **`insetTop?: ReactNode`** to `OmnichannelComposerDock` — rendered **inside** the rounded shell, **above** the textarea flex-1 region, edge-to-edge (no extra gutter; match band/menu flush policy).

`StationComposerHost` passes `ComposerTicketInsetChrome` when Ticket mode.

Alternative (if dock prop rejected): wrapper `div` inside shell only — prefer single prop so Support chat can adopt later.

---

## 4. File map

| Path | Change |
|---|---|
| `src/design-system/primitives/OmnichannelComposerDock.tsx` | `insetTop` slot |
| `src/components/composer/ComposerDrillMenu.tsx` | **new** stack menu |
| `src/components/composer/ComposerTicketCcStrip.tsx` | **new** shared CC |
| `src/components/composer/ComposerTicketInsetChrome.tsx` | **new** Cc + staged thumbs (dock `insetTop`) |
| `src/components/composer/ComposerTicketChannelToggle.tsx` | **new** channel, action bar right of `+` |
| `src/components/composer/ComposerStagedPhotoStrip.tsx` | **new** shared staged-photo thumbs |
| `src/lib/composer/ticket-cc.ts` | **new** CC add/remove/payload SoT |
| `src/lib/composer/ticket-reply-payload.ts` | **new** single `useSupportReply` payload builder |
| `src/components/composer/ComposerTicketContextTools.tsx` | **deleted 2026-08-30** — `@` menu inverted to Cc, then the chips themselves were withdrawn |
| `src/components/composer/StationComposerHost.tsx` | Wire inset + drill `+`; drop `ticketPlusMenu` prop for channel |
| `src/components/receiving/workspace/line-edit/LineNotesCard.tsx` | CC state, photo staging, tree config, send payload |
| `src/lib/composer/ticket-composer-insert-tree.ts` | **new** declarative menu (photos only) |
| `src/lib/composer/what-happened-facts.ts` | **left in place, unwired** — keep for the day the fact insert comes back |
| `src/components/support/zendesk/chat/SupportChatComposer.tsx` | Import shared CC strip |
| `src/components/composer/composer-drill-menu.test.tsx` | **new** stack behaviour tests |
| `src/components/composer/composer-ticket-inset.test.tsx` | **new** channel/CC visibility |

---

## 5. Phased delivery (locked order)

### Phase A — Control separation (block B until verified)

1. Add `insetTop` to dock.
2. Move Internal/Public onto the action bar right of `+` (`ComposerTicketChannelToggle`).
3. Extract + wire CC strip; `@` visible on Public only.
4. Remove Internal/Public from `+` menu in `LineNotesCard`.
5. Pass `emailCcs` on `handleTicketCommit`.
6. Tests: REQ-CHAN-*, REQ-CC-*, REQ-SEND-01/02.

### Phase B — Drill menu + context

1. Implement `ComposerDrillMenu` + stack tests.
2. Ticket `+` uses drill tree: This item · What happened · Photos.
3. Refactor context attach off `@` onto `+` rows.
4. Chips render in inset chrome.
5. Tests: REQ-PLUS-01–04, REQ-PLUS-08/09.

### Phase C — Photos pipeline (may defer with explicit skip in VERIFY)

1. Wire `useTicketPhotoStaging` at station host (or lift from ticket detail).
2. Browse → `SupportPhotoLibraryPicker`; Upload → file input.
3. Thumbnail strip above field (port from SupportChatComposer).
4. Tests: REQ-PLUS-05–07, REQ-SEND-03.

**Phase C deferral rule:** If staging hook cannot mount without Displays refactor, ship A+B with Photos rows disabled + `toast.message('Photos from station composer — next ship')` and document in VERIFY skip table. Do **not** fake a second upload path.

---

## 6. Interaction budget (AGENTS.md — verifier enforces)

| Primary goal | Max interactions |
|---|---|
| See channel + whether Public | 1 (switch to Ticket) |
| Add one CC on Public reply | 3 (Ticket → Public → @/type → pick) |
| Attach a photo | 2 (+ → Browse library / Upload file) |
| Send internal note | 2 (Ticket → type → Enter) |

Any implemented path exceeding budget is a **regression** unless promoted to the
root menu — which is exactly why both photo rows are flat rather than behind a
`Photos ›` page.

---

## 7. Non-goals

- Lexical / rich text editor
- Second composer in Displays ticket tab
- Changing Unbox insert semantics (only re-wrap in drill if explicitly grouped later)
- `DropdownMenuSub` flyouts for station (desktop hover menus)
- Mobile `/m/*` fork in this ship
- Branch off `main`; commit only when asked
- Layout animations on menu stack or CC strip

---

## 8. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Photo staging only wired in `SupportTicketDetail` | Lift staging provider to `LineEditPanel` or pass bridge from ticket pane — read before Phase C |
| Duplicate CC / context SoT | Extract strip; single `useSupportReply` payload builder helper |
| `@` metaphor clash | CC strip labeled “Cc”; optional `@` button focuses email input — never product attach |
| Menu stack a11y | `role="menu"`, back button `aria-label="Back"`, focus trap in popover |

---

## 9. Success snapshot

Operator on Unbox scan station, linked ticket:

1. Taps **Ticket** — sees Internal/Public on the action bar beside `+`.
2. Taps **Public** — Cc row appears above the field.
3. Adds colleague email — chip shows.
4. Taps **+** → **Upload file** — thumb stages above the field.
5. Types the message.
6. Enter — public reply sends with CC + photo + body; thread updates optimistically.

That flow is the acceptance demo for sign-off.
