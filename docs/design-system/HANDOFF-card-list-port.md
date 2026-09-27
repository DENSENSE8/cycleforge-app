# Handoff prompt — port the triage order-card list into a design-system list, then to Receiving

Paste everything below the line into a fresh session.

---

You are continuing the To-ship **order card list** work in the `prod` worktree of CycleForge
(`/home/michaelgarisek/Projects/cycleforge-lanes/prod`). Read `AGENTS.md` first. Dev origin is
`http://localhost:3050` ONLY (lane unit `cycleforge-lane@prod`). The owner tests in the real browser
phase by phase — make one change set, typecheck + lint the touched files, tell the owner exactly what
changed, and let them verify before the next phase. Do not run browser tests unless asked.

Read before touching code:
- `docs/design-system/HANDOFF-order-card-list.md` — current state of the card list, what is fixed,
  what is open, and the commit rules (nothing is committed; ~446 dirty paths from several sessions —
  never commit without asking; hunk-split shared files).
- `docs/design-system/BRIEF.md` §13 — owner rulings for the card list (2026-09-27).
- `docs/design-system/MODE-SPLIT-INVENTORY.md` (if present) — route → mode table and the mode-blind
  style leaks (triage vs industrial).

## Goal

Turn the To-ship card list into the **triage data-table format of the design system** — one smooth,
reusable list — then port the same format to **Receiving POs** and **Inbound (`/incoming`)**.
Floor (Ctrl/⌘+Shift+F) keeps the industrial ledger; this is the triage (non-floor) face.

## What exists (re-verified 2026-09-27 against the live files)

| Piece | File | Notes |
|---|---|---|
| List | `src/components/outbound/orders/cards/OrderCardList.tsx` | feed (`useOrdersQueueFeed`) + `arrangeGroups` (status chips, held orders, SLA sections), pager/scroll, Find, peek, SKU batch, record plane (`DeskRecordPlane`) |
| One card | `src/components/outbound/orders/cards/OrderCard.tsx` | line 1: order # · ↗ admin link · platform · buyer name ··· Listing ↗ · SLA (BRIEF §13 "card line 1"); line 2: photo + title; line 3: qty · condition · stock · bin · price; bottom-right: packer avatar (`packer` prop). Facts (`buyerName`, `listingHref`, `listingItem`) come from `orderCardModel` |
| Quick look / one-card verbs | `OrderCardPeek.tsx` (Space, mounted at `OrderCard.tsx:674`), `OrderCardActionMenu.tsx` | order-specific — stay with the order domain in phase 4 |
| Bar | `src/components/outbound/orders/cards/OrderCardSelectBar.tsx` | select-all · Find (sidebar closed, slides in) · status chips · pager · per-page · sort · Floor · count |
| Find field (DS) | `src/design-system/components/FindField.tsx` | `FindField` + `findHints(label)`; the bar's `BarFind` already mounts it — reuse, do not fork |
| Pure facts | `src/lib/orders/order-card-model.ts` | `orderCardModel`, `orderSla`, `ORDER_SLA_SECTIONS` |
| URL / prefs | `src/components/outbound/orders/cards/order-card-list-state.ts` | History-API URL writes (`?cardStatus=`, `?page=`), page-size pref with `resolved` |
| Platform | `OrderCard.tsx:468,564-570` | `platformFace = channel.label` (full name, phase 1) from `useOrderChannel()`; `title=` holds the storefront (`connectionName`) |
| Staff | `OrderCardList.tsx:540` | `queueRowStaff(r, getStaffName)` → only the PACKER reaches the card |
| Pick facts on the row | `src/types/orders.ts:35-37` | `picked_by`, `picked_by_name`, `picked_at` (pick scan time, else picking session end); not yet read by `orderCardModel` |
| Width tokens today | `src/design-system/tokens/desk-stage.ts` | `DESK_SPLIT_LIST_CLASS` (`basis-2/3`), `DESK_SPLIT_LIST_CARD_CLASS`, `DESK_STAGE_FIXED_CLASS` (`max-w-6xl`) — no label / platform measure yet |
| DS "Triage*" (forms, not lists) | `src/design-system/components/TriageSections.tsx`, `TriageScrollLayout.tsx`, `TriageScrollKnobs.tsx` | scroll host for a dense triage **form** — not a list primitive; see phase 4 |
| Inbound cards (other session's WIP) | `src/components/receiving/incoming/cards/IncomingDeliveryCardList.tsx`, `IncomingDeliveryCard.tsx` | untracked; mounted from `IncomingDeliveriesLedger.tsx:301` on `/incoming`; typechecks clean 2026-09-27 — coordinate, do not overwrite |

Known list defects that the extraction (phase 4) inherits — see `HANDOFF-order-card-list.md` "Still
open": J/K steps per LINE, one order can render as two cards (urgent band splits lines), pager counts
lines not cards. Decide with the owner whether the DS list keys on the order or the line before
extracting.

## Phases (one at a time; stop after each for the owner)

1. **DONE (2026-09-27, owner verifying) — Full platform names.** `channel.label` replaces the short
   face; brand dot and FBA tag kept; the platform span is `shrink-0 whitespace-nowrap` (no
   truncation) — the order number chip is the part that shrinks.
2. **Separate widths (design-system tokens, not per-component classes).** Three independent measures:
   - the **label length** — the identity cluster (order number + platform) on line 1;
   - the **triage list length** — the card list's own measure inside the desk stage;
   - the **full-platform length** — a slot sized to the longest full platform name, so a long name
     never pushes the SLA or reflows the card.
   Today the list measure is `DESK_SPLIT_LIST_CLASS` / `DESK_SPLIT_LIST_CARD_CLASS` (split) and
   `DESK_STAGE_FIXED_CLASS` (in place); BRIEF §13 calls the list "fixed-width". Ask the owner
   whether "triage list length" is one of those or a new token, then add the label and platform
   measures beside them in `src/design-system/tokens/desk-stage.ts` and consume them from the card
   and the bar so the bar's check axis and the cards stay aligned. The request was "a separation
   between label length and triage data table length, full platform length".
3. **Pick name + pick date/time, bottom-right of the card.** From `picked_by_name` (fallback:
   `getStaffName(picked_by)`) and `picked_at` (format with the repo's date helpers in
   `src/utils/date`, PST like the rest of the desk). Keep the packer avatar; the pick line sits with
   it in the bottom-right cluster. Not picked yet → show nothing (no placeholder dash). Thread the
   facts through `orderCardModel` (pure) rather than reading the row in the card.
4. **Extract the reusable triage list** once 1–3 are approved: split the order-specific parts
   (`orderCardModel`, order verbs) from the list chrome (bar, sections, pager, Find, check axis,
   record plane) into a design-system component under `src/design-system/components/` so a second
   domain can reuse it. Keep To-ship behaviour identical. Reuse `FindField`; do not extend the
   form-oriented `TriageSections` / `TriageScrollLayout` into a list — give the list its own name
   (e.g. `TriageCardList`) and confirm it with the owner.
5. **Port to Inbound (`/incoming`).** Reconcile with `IncomingDeliveryCardList` (another session's
   WIP — untracked, so `git log` has nothing; ask the owner who owns it before editing. The earlier
   build break is gone: the files typecheck clean on 2026-09-27). Same bar, same card grammar,
   receiving facts (PO, carrier/tracking, ETA, lines).
6. **Port to Receiving POs.** Map the PO surfaces first (`src/components/receiving/**`,
   `PoLinesAccordion`, `ReceivingLinesTable`, `DockedReceiptsLedger`) and confirm with the owner
   which route is "Receiving POs" before building.

## Rules that already bit this work

- URL state on these desks: write with `readLiveSearchParams` + `window.history.replaceState`
  (not `router.replace` — it waits on an RSC round-trip and quick presses clobber each other).
- A card BODY click opens the record; only the checkbox checks (owner ruling). The Floor ledger keeps
  its own select-mode law (`queue-row-click.ts`) — do not change shared gesture laws for a card fix.
- Anything that re-orders groups must go through `arrangeGroups` so pages, J/K and Shift-range agree
  with the screen.
- Do not edit the contextual left sidebar (another session). Shell files touched so far:
  `DesktopRouteShell.tsx` (sidebar open-state publish + ⌘\ hotkey) — keep edits there minimal.
- Before calling a phase done: `npx tsc --noEmit -p tsconfig.json` (filter to touched files) and
  `npx eslint <touched files> --quiet`; `pnpm verify:fast` before handing a batch back.
