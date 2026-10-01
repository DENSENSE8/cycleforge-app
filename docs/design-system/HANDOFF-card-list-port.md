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
   **Partly done (2026-09-27):** the card's own disclosure tiers are tokens now —
   `CARD_FACT_BOX_CLASS` and `CARD_DISCLOSE` (`brand` @md, `label` @xl, `detail` @2xl) in
   `desk-stage.ts`. Still open, ask the owner: the list measure (today `DESK_SPLIT_LIST_CLASS` /
   `DESK_SPLIT_LIST_CARD_CLASS` split, `DESK_STAGE_FIXED_CLASS` in place; BRIEF §13 says
   "fixed-width") and a fixed platform slot so a long name never pushes the SLA. The request was
   "a separation between label length and triage data table length, full platform length".
3. **DONE (2026-09-27, owner verifying) — current stage inline, timeline on click.**
   `src/lib/orders/order-stages.ts` (`orderStage`, `currentOrderStage`, `ORDER_STAGE_KINDS`) is the
   one stage source for the card, the quick look and the record's QC by / Picked by / Packed by
   rows. The card face shows the current stage (icon + word, PST time when done, no staff name);
   a click opens the QC → Pick → Pack timeline with names and, when the record's mode allows
   assigning, `LedgerStageAssign` for Pick / Pack (`onAssignStage` → `handleCommitStageAssign`
   on every line). "Details ▾" on hover opens the quick look. Card tooltips are `HoverTooltip`.
   BRIEF §13 "card stages" / "card width disclosure" / "One stage source".
   **Superseded same day by the cleaner display:** Pick → QC → Pack everywhere; Pick + QC chips per
   line, Pack once per order; 2+ line orders always show up to 3 lines (`CARD_LINES_SHOWN`), "+N
   more" for the rest; chip stamp `atShort` (today → time, older → date). Model: `orderStage(row,
   kind, { todayKey, staffName?, outOfStock? })` (options object) with `atShort`, `inherited`
   (Pre-QC'd, false until the backend feeds it), `blocked: 'out_of_stock'`; `OrderCardLine.stages
   { pick, qc }`, `OrderCardModel.pack`. Data truth: `HANDOFF-qc-pick-split.md`.
   **Superseded again (owner, 2026-09-27 later):** no stage chips on the card face at all; lead
   line + "+N items" disclosure; unfolded lines are columns in the fixed fact order. See BRIEF §13
   "multi-line display language". Stages remain in the quick look and the record.
3b. **PROPOSED (owner idea 2026-09-27, not started) — bulk assign QC / pick / pack + auto-rule.**
   With cards checked, the bulk bar offers "Assign QC / pick / pack → staff"; the same action can
   save a rule ("item number or SKU X → staff Y for pick") so future orders auto-assign. Map what
   exists first: `handleCommitStageAssign` (`OutboundOrdersLedger.tsx`), `work_assignments`, and
   any existing rule engine (the record's "rule pencil", commit e5684cb60). Confirm with the owner:
   rule key (item number vs SKU), precedence vs manual assignment, and where rules are managed.
4. **RecordCard foundation (owner, 2026-09-27) — one card, told what to show, never forked per page.**
   Target surfaces: To-ship, daily, inbound, inventory, sales, products, automations, saved views,
   AI chat. Full autonomous-run prompt (waves, laws, action QoL, ASK points):
   `docs/design-system/HANDOFF-record-card-foundation.md`. Five layers; a page supplies only the top one:

   | Layer | Owns | State |
   |---|---|---|
   | 5. Page | family + layout (or saved view) + actions | a few lines per page |
   | 4. `TriageCardList` (list shell) | bar, check axis, sections, pager, Find, J/K, quick look, record plane | extract from `OrderCardList` |
   | 3. `RecordCard` (anatomy) | fixed slots: rail · check · identity (top-left) · status (top-right) · lead photo + title · subtitle facts · stage/time (bottom-right) · Details | extract from `OrderCard` |
   | 2. Hierarchy | field catalog + layout (`src/lib/tables/field-catalog/<family>.ts`, `types.ts`): WHAT each slot shows, per family and saved view | exists (~60 families); extend |
   | 1. Data | family resolver → `CompoundSlotValue` (`<family>-resolve.ts`) | exists |

   **Law:** pages pass field ids, never JSX; the card owns placement, one painter per display type
   (shared with the DataTable), the layout owns hierarchy. No `if (family === …)` in `RecordCard` /
   `TriageCardList` — a page that "needs" one is missing a field, a slot binding or an action.
   Layout additions for cards: `lead` (photo + title), `stage` (timeline fields; words/icons from
   `FieldDef.stageLabels` / `iconKey`, replacing the card's hardcoded `STAGE_FACE`), `rail` (tone
   field), and a disclosure priority per binding mapped to `CARD_DISCLOSE` (`brand`/`label`/`detail`).
   Actions by id from a per-family registry (assign, admin link, listing, copy).
   Example hierarchy: orders — status = SLA, subtitle = qty · condition · stock · bin · price;
   inventory — status = stock + location, subtitle = condition · received, no price.
   Steps:
   1. **DONE 2026-09-27 — Map.** Key facts:
      layouts are `DataTableColumnLayout` (`src/lib/tables/data-table-column-layout.ts`),
      product-owned constants consumed by each registered family. Painters are
      `CompoundStageStep`, `CompoundThumb`, and `CompoundItem`
      (`tables/compound/CompoundCells.tsx`). Gaps the card needs: lead item +
      sub-lines, photo field, stage summary + ordering + assignable roles, rail
      field, disclosure priority, and card-level actions.
   2. Extend the card adapter with `lead`, `stage`, `rail`, and priority; do not
      extend the DataTable column model to drive card hierarchy.
   3. Extract `RecordCard` + `TriageCardList`; move To-ship onto the orders layout with zero visual
      change (the proof). Reuse `FindField`; don't stretch the form-oriented `TriageSections` /
      `TriageScrollLayout` into a list.
   4. Second family that stresses hierarchy differently: inventory (bins / units), stock- and
      location-first. A new paint kind goes into the shared painter set, never the page.
   5. Inbound, daily, saved views, AI chat (artifact `entityHint` → family + default layout).
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
