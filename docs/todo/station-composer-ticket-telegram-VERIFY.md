# Station composer Ticket Telegram UX — verification checklist

**Plan:** [`station-composer-ticket-telegram-PLAN.md`](./station-composer-ticket-telegram-PLAN.md)  
**Prompt:** [`station-composer-ticket-telegram-IMPLEMENTATION-PROMPT.md`](./station-composer-ticket-telegram-IMPLEMENTATION-PROMPT.md)

**Automated gate:** `npm run verify` (lint · typecheck · unit).  
**Manual smoke:** signed-in Unbox line with linked Zendesk ticket on `:3050` or lane.

Verifier role: judge the diff against **REQ-*** rows below. Any REQ marked **must** without proof = **fail the ship**.

---

## Locked testids (do not rename)

| id | Surface |
|---|---|
| `station-composer-host` | Root host |
| `composer-plus` | Circular `+` trigger |
| `composer-plus-menu` | Legacy flat menu (Unbox inserts may keep) |
| `composer-drill-menu` | Ticket drill panel |
| `composer-drill-back` | Stack back control |
| `composer-ticket-channel` | Channel toggle wrapper — **action bar, right of `+`** (operator ruling 2026-08-30) |
| `composer-ticket-inset` | Top-of-composer rows (Cc + staged thumbs); absent when there is nothing to show |
| `composer-staged-photos` | Staged photo thumb strip |
| `composer-ticket-cc-strip` | CC row (Public only) |
| `composer-ticket-cc-input` | Email typeahead input |
| `composer-ticket-cc-chip` | One CC chip |
| `omnichannel-composer-dock` | Shell |
| `composer-mode-unbox` | Mode face (existing — confirm in `ComposerModeRow`) |
| `composer-mode-ticket` | Mode face |

Add ids if missing; do not repurpose existing Unbox ids.

---

## REQ → proof matrix

### Mode & channel

| REQ | Must | Proof |
|---|---|---|
| REQ-MODE-01 | ✓ | Manual: Ticket face → ticket placeholder; Print hidden. Optional DOM test: `data-composer-mode="ticket"`. |
| REQ-MODE-02 | ✓ | Manual: Unbox face → Location + Print visible; no `composer-ticket-channel`. |
| REQ-CHAN-01 | ✓ | DOM: `composer-ticket-channel` present in Ticket (action bar, right of `+`); Internal selected by default. |
| REQ-CHAN-02 | ✓ | DOM: toggle Public → `composer-ticket-cc-strip` visible. |
| REQ-CHAN-03 | ✓ | Toggle Internal → CC strip absent (`queryByTestId` null). |

### CC (@ audience)

| REQ | Must | Proof |
|---|---|---|
| REQ-CC-01 | ✓ | Unit or RTL: type valid email + Enter → chip count +1. |
| REQ-CC-02 | ✓ | Unit: remove chip → count -1. |
| REQ-CC-03 | ✓ | Unit: mock `reply.mutate` / spy — Public send includes `emailCcs: ['a@b.c']`. |
| REQ-CC-04 | ✓ | Unit: Internal send — `emailCcs` undefined / omitted. |

### Drill menu (`+`)

| REQ | Must | Proof |
|---|---|---|
| REQ-PLUS-01 | ✓ | DOM: open drill → rows only, **no title row** (`panel.children.length === rows.length`). |
| ~~REQ-PLUS-02/03/04~~ | — | **WITHDRAWN 2026-08-30** — “What happened” + “This item” removed from `+`; a test asserts neither id is in the tree. |
| REQ-PLUS-05 | ✓ | Unit: tree is exactly `['Browse library','Upload file']`, both `type: 'action'` at the root. |
| REQ-PLUS-06 | ✓ | Manual: upload stages a thumb in `composer-staged-photos`. |
| REQ-PLUS-07 | ✓ | Manual: library picker adds a thumb. |
| REQ-PLUS-08 | ✓ | DOM: back pops stack without closing panel (primitive; no ticket submenu ships today). |
| REQ-PLUS-09 | ✓ | DOM: close resets stack to root. |

### Unbox regression

| REQ | Must | Proof |
|---|---|---|
| REQ-UNBOX-01 | ✓ | Manual or RTL: Unbox `+` still lists insert actions (staff stamp when staff present). |
| REQ-UNBOX-02 | ✓ | DOM: Unbox mode — no `composer-ticket-channel`, no drill menu on Unbox `+`. |

### Send

| REQ | Must | Proof |
|---|---|---|
| REQ-SEND-01 | ✓ | Unit: internal commit appends `— StaffName` when name present. |
| REQ-SEND-02 | ✓ | Same spy as REQ-CC-03. |
| REQ-SEND-03 | ✓ | Unit: `buildComposerReplyVars` includes `photoIds` + `attachmentPreviews` when staged. |
| REQ-SEND-04 | ✓ | `handleTicketCommit` onSuccess clears draft, CCs, CC input and staged photos. |

---

## Unit tests (must land)

| File | Covers |
|---|---|
| `src/components/composer/composer-drill-menu.test.ts` | Stack push/pop/close; REQ-PLUS-08/09 |
| `src/components/composer/composer-ticket-inset.test.ts` | Channel + Cc visibility, no chip row; REQ-CHAN-02/03, REQ-CC-04 |
| `src/lib/composer/ticket-reply-payload.test.ts` | Payload shape REQ-CC-03, REQ-SEND-01/02/03 |
| `src/lib/composer/ticket-cc.test.ts` | CC add/remove/payload rules; REQ-CC-01/02/04 |
| `src/lib/composer/ticket-composer-insert-tree.test.ts` | `+` tree shape + the withdrawal; REQ-PLUS-05 |

Prefer **mounted DOM / behaviour** over regex-on-source.

**`.test.ts`, not `.test.tsx`.** `scripts/run-unit-tests.mjs` collects files
ending in `.test.ts`, so a `.test.tsx` sibling is never run by `npm run verify`
(`composer-mode-row.test.tsx` has been unenforced for that reason). Mounted
tests use `jsdom` + `react-dom/client` + `React.createElement`, which needs no
JSX. Import `@tanstack/react-query` **statically** in such a test: `tsx`
compiles the file to CJS, and a dynamic `import()` would load the ESM build
while `src/**` loads the CJS one — two React contexts, and the provider is
invisible to the component under test.

Existing must stay green:

- `src/components/composer/composer-mode-row.test.tsx`
- `src/lib/composer/station-composer-mode.test.ts`
- `src/design-system/primitives/OmnichannelComposerDock.test.ts` (update if `insetTop` changes snapshot strings)

---

## Manual smoke script (signed-in Unbox + ticket)

1. Open Unbox line with linked ticket `#…`.
2. **Ticket** face — Internal/Public visible on the action bar right of `+`; no Print.
3. **Public** — CC strip appears; add one agent email; chip shows.
4. **`+`** — two rows, **no title**: Browse library · Upload file.
5. **Upload file** — pick an image; thumb stages above the field.
6. Enter — toast success; draft, CCs and thumbs clear; thread shows optimistic reply (Displays ticket tab).
7. **Unbox** face — coloured insert `+`; no channel toggle, no Cc row.
8. Confirm mode row still **below** outline; ring opens Displays.

---

## Interaction budget audit

| Flow | Max | Measure |
|---|---|---|
| Public + one CC | 3 | Ticket → Public → type email |
| Insert one fact | 3 | + → What happened → row |
| Send internal | 2 | Ticket → type → Enter |

If implementation exceeds budget, file as **REGRESSION** in report unless root menu promoted (document in PLAN).

---

## Phase C skip table

**Nothing skipped.** `useTicketPhotoStaging` mounts directly in `LineNotesCard`
(the hook only reads `ticketId` inside its callbacks, so no Displays refactor
was needed). Browse is gated on `photos.view` and renders **disabled** without
it rather than as a dead click.

---

## Anti-patterns (automatic fail)

- [ ] Internal/Public still inside `+` menu (the action bar, right of `+`, is where it belongs — inside the popover is the fail)
- [ ] `@` opens product/context attach (Cc only, Public only)
- [ ] “Add to message” title re-added over the `+` rows
- [ ] “This item” / “What happened” re-wired into `+` without being asked
- [ ] Second textarea in Displays for reply input
- [ ] Mode toggle or procedure ring moved inside bordered shell
- [ ] `DropdownMenuSub` flyout instead of in-panel stack for Ticket `+`
- [ ] Layout animation on menu stack, CC strip, or channel toggle
- [ ] `emailCcs` sent on internal notes
- [ ] Duplicate CC UI not refactored — Support chat and station diverge

---

## Sign-off line

> All **must** REQs proven · Phase C skip documented or complete · `npm run verify` green · manual smoke script passed · no anti-patterns.
