# Handoff prompt — Inbound history (Docked) onto the triage card list

Paste everything below the line into a fresh session.

---

You are porting CycleForge's **inbound history** onto the shared `RecordCard` / `TriageCardList`
foundation, the same list `/shipping/orders` wears. The goal is for an operator to **narrow inbound
history to one receipt in seconds**, using status chips, Find, sections, the sidebar's one sort, the
next-step corner and J / K.

Worktree: `/home/michaelgarisek/Projects/cycleforge-lanes/prod`.
- Read `AGENTS.md` first.
- The dev origin is `http://localhost:3050` ONLY. The lane unit is `cycleforge-lane@prod`.
- The tree is shared with other live sessions:
  - Re-read a file right before you edit it.
  - Never revert what you did not write.
  - Never commit without asking.
  - Report red in other people's files; don't fix it.

## Where history actually lives (verified 2026-09-27)

- `/receiving/history` is a legacy URL. On desktop, `src/proxy.ts:205-215` sends a **308 to
  `/incoming?lane=docked`** and keeps `sort`, `rh_*`, `page` and `dir`. Keep that redirect working.
- Mount chain: `src/app/incoming/page.tsx` → `IncomingBrowseShell` → `ReceivingSurfacePage` →
  `ReceivingDashboard` → `ReceivingRightPane` → `ReceivingLinesTable`
  (`src/components/receiving/…`).
  - `lane=docked` resolves to mode `'history'` (`useReceivingDashboardMode.ts:36-39`).
  - Mode `'history'` paints **`DockedReceiptsLedger`**, a `RecordLedger` of `DockedReceivingRecord`
    (`ReceivingLinesTable.tsx:724-738`).
  - The spreadsheet (`useReceivingSpreadsheet`) is NOT on this path.
- Row type: `ReceivingLineRow` (`src/lib/receiving/receiving-line-row.ts:21-285`).
  - Today one ledger row is one receiving line (key `row.id`).
  - Opening a row opens its **carton** (`receiving_id`) in `CartonRecordView` through
    `useCartonRecord`, with the URL `?openLine=<lineId>`.
- State: `dockedReceivingState(row)` (`src/lib/receiving/docked-record-state.ts:8-24`) maps onto
  `RECEIVING_LIFECYCLE` (`design-system/tokens/receiving-lifecycle.ts`):
  - SCANNED
  - UNBOXED
  - RECEIVED
  - ON_HOLD
  - EXCEPTION
  - anything else falls back to the inbound delivery state.

  The fine `workflow_status` chain is in `lib/receiving/workflow-stages.ts:27-83`.
- Next step today (`DockedReceivingRecord.tsx:21-30`):

  | State | Next step |
  |---|---|
  | SCANNED | Unbox |
  | UNBOXED | Complete |
  | ON_HOLD | Continue |
  | EXCEPTION | Resolve |
  | RECEIVED | Review |
  | else | Inspect |

  The carton plane uses `record.readiness?.nextStep` instead.
- Data: one fetch of up to `RECEIVING_HISTORY_LIMIT = 3000` rows (`receiving-modes.ts:24`) from
  `GET /api/receiving-lines?view=activity` (`lib/receiving/lines/build-sql.ts:806-814`), with no
  pagination.
  - Server-side: `rh_q` / `rh_field` / `rh_scope` search, `sort` (`unboxed_newest` |
    `scanned_newest`, the activity axis — the sidebar's **Activity** row), `staff` (the sidebar's
    **Handled by**).
  - Client-side, over the loaded rows (all in the URL since 2026-09-27, all written by the left
    sidebar on `/incoming`): **State** `?dstate=` (`DOCKED_STATE_OPTIONS`), **Activity date**
    `?dateFrom=` / `?dateTo=` (replaced the week pill; clears `?weekOffset=`), **Sort**
    `?colsort=` / `?coldir=`. Sidebar Find (`useDeskSearch`) is still NOT in the URL.
  - On `/incoming` the ledger toolbar holds only fullscreen (`sidebarOwnsControls`). The Unbox
    History tab has no contextual sidebar and keeps State · Sort · week pill in its toolbar.
- Keyboard and selection:
  - Record cursor surface `incoming-docked-ledger`, scope `record`.
  - Selection scope `'receiving'` (`useReceivingRowSelection`).
  - Bulk verbs `copy` · `print` · `ticket` (one line only) · `staff` / `phone` (disabled stubs),
    with no hotkeys.
  - Carton verbs (`useCartonVerbs`): resolve · unbox · print · claim · move-photos · copy · delete.
- Mobile: there is **no** `/m/receiving` history list; only `/m/receiving/po/[poId]` exists.
- The sibling hand-built card list is `IncomingDeliveryCardList`
  (`components/receiving/incoming/cards/IncomingDeliveryCardList.tsx`, ledger #13). It is the "On
  the way" card face over the same row type, grouped by PO with `foldKey`. The families handoff
  says to absorb it into the foundation, so reuse its grouping and its `DeskRecordPlane` wiring
  rather than inventing new ones.

The full map is in the session artifact that produced this prompt. Re-verify line numbers before
you edit; other sessions move them.

## Read first
1. `docs/design-system/HANDOFF-record-card-families.md` — the principle ("one anatomy, a different
   card per page"), the per-page loop, and Laws 1–7.
2. `docs/design-system/RECORD-CARD-MIGRATION.md`:
   - the Wave 0 rows #11–#15;
   - "O1 progress", which has the Law 5 selection bar and its key map, the next-step corner, and
     the sections.
3. The foundation code and the reference family:
   - `design-system/components/record-card/RecordCard.tsx` + `record-card-types.ts`, including:
     - `next: RecordCardNextStep` — the bottom-right next step;
     - `status` — top right;
     - `alert`;
     - `lines` / "+N items".
   - `design-system/components/triage-card-list/`:
     - `TriageSelectBar` — Law 5 bar, verbs at 1 and N;
     - `TriageListBody` + `TriageSectionHeader` — sticky section heads with counts (the list's ONE sort is the sidebar's `?sort=`; sections carry no sort of their own — owner 2026-09-27);
     - `triage-list-state.ts` — URL status chips + page, page mode, kept scroll, held-new, `[` `]`,
       and `useTriageCardKeys` (X checks, Space folds the quick look, Enter opens — focused card, else the card under the pointer).
   - `design-system/components/record-action-strip/` — `RecordActionVerb.scope` +
     `scopeRecordVerbs`.
   - The orders reference:
     - `components/outbound/orders/cards/OrderCard.tsx` (adapter);
     - `OrderCardList.tsx` (mount);
     - `lib/orders/order-card-model.ts` (`orderNextStep`);
     - `lib/orders/order-section-sort.ts` (the fixed order inside a section).

## Gates checked before this prompt was written (re-check; stop if any changed)
- **Law 7 (keep-sheet):** the Wave 0 ledger marks #11 (`/receiving`, `/receiving/history`,
  `/unbox`) and #13 (incoming / docked) as **port**, not keep-sheet (`RECORD-CARD-MIGRATION.md`
  rows 52 and 54). If the owner has re-ruled either one keep-sheet, **stop**. Bring the fast-filter
  asks (chips in the URL, sections, next step) to the ledger as a `DockedReceiptsLedger`
  change instead of a card port.
- **Wave order:** the owner ruled outbound first (O1–O5) and inventory before receiving. Ask
  whether this port may jump the queue before writing code.

## Display rules from the orders page (owner 2026-09-27) — carry them over
- **Next step:** an arrow and a **present-tense verb** ("→ Unbox", never "Unboxed" or "Next:"),
  at the card's bottom-right, with no extra row.
- **Notes read in line** on line 1: icon + text in the room line 1 has left, full text on hover,
  and no drop-down needed. The person's own words (vendor / receiving note) are `attention`
  (amber); system notes are `quiet`.
- **Quick look adds; it never repeats.** Nothing already on the face appears again (vendor,
  channel, note, status, lead facts). It shows what the face lacks: full addresses, contacts,
  exact stamps, tracking, serials, who did each step and when.
- **Keys:** Space folds the quick look on the focused card, else the card under the pointer.
  Enter opens the order, and never lands on Details, which is not a tab stop and hands focus back
  to the card after a click. X checks the card.

## ASK the owner before code (only these)
1. **Record grain.** Is one card a **carton** (`receiving_id`, matching what the record plane
   already opens), a **PO**, or a **line**? Recommend the carton: lines become "+N items" columns,
   and the plane already opens it.
2. **Pattern card** (a short table in the ledger). Fill every fixed spot:
   - identity (carton # / PO # + ↗);
   - channel / person (vendor · received-by);
   - chips (Priority, Unmatched, Exception code);
   - top-right status (recommend: received / unboxed time as a date face, danger when an
     exception is open);
   - lead facts in order: qty received/expected · condition · SKU · serial · bin · cost;
   - "+N items";
   - alert (FAILED / RTV / SCRAP lines);
   - **next step** as a present-tense verb painted "→ Unbox" (Unbox → Complete; ON_HOLD → Continue; EXCEPTION → Resolve);
   - sections (recommend: Today · Yesterday · This week · Earlier, or by state) — no sort of
     their own; the sidebar's one sort orders the list;
   - verbs with scopes;
   - noun (`receipt` / `receipts`);
   - test-id prefix `receipt-card`;
   - status-chip keys;
   - record URL params (`openLine`);
   - storage keys `cf:receipt-cards:*`.

   The owner signs this off before any code.
3. **Server vs client filtering, and chips vs the sidebar State row.** History loads up to 3000
   rows. Status chips and Find can cut client-side instantly, and chips must be in the URL. The
   sidebar already owns a State cut (`?dstate=`, single choice). "One param, one control"
   (`HANDOFF-triage-family-contract.md`, sidebar half, rule 2): recommend the chips write `dstate`
   (made multi-value) and the sidebar State row is removed in the same change, rather than a second
   `cardStatus` param cutting the same thing. Also ask whether the state cut should become a server
   param so a shared link reproduces it past the 3000-row window.
4. Any foundation extension that changes the orders page's pixels.
5. Any `/m/*` change. There is no mobile history list today; do not add one unasked.

## Build, once signed off

1. **Capture before**:
   - Screenshots of `/incoming?lane=docked` at 1500 / 1100 / 760.
   - `node scripts/dom-equivalence.mjs capture orders-before /shipping/orders order-card` before
     any foundation change, and `compare` after.
   - If the admin session has expired (you land on `/signin`), re-mint it with
     `PW_BASE_URL=http://localhost:3050 node tests/shot.mjs /shipping/orders /tmp/x.png`.
2. **Foundation gaps**. Add these for every family, never as a page branch. Known ones:
   - A **date** top-right status (today `status` is the deadline shape — make it a union
     `deadline | state | date`; the families handoff lists this as extension 1).
   - A **serial** fact face in `record-fact.tsx` if `code` does not read well.
   - Nothing else should be needed: next step, sections with sort, Law 5 bar and X-check already
     exist.
3. **Adapter** `components/receiving/history/cards/receipt-card.tsx`:
   - Row group → `RecordCardModel`.
   - A pure `receiptCardModel` + `receiptNextStep` in `lib/receiving/`.
   - Each gets a unit test: next step per state, and grouping by the chosen grain.
4. **Mount** `ReceiptCardList`:
   - `TriageSelectBar` + `TriageListBody` + `TriageSectionHeader` (no sort of its own; the
     sidebar's Sort orders the list).
   - `useTriageUrlState` (status chips from `dockedReceivingState` plus `EXCEPTION` / `ON_HOLD` /
     `Unmatched`), `useTriagePageMode`, `useHeldNewRecords`, `useTriagePageKeys`,
     `useTriageCardKeys`.
   - `useRecordCursorKeyboard` + `usePublishRecordCursor`: keep surface id
     `incoming-docked-ledger` so the plane's J / K keeps working.
   - `DeskRecordPlane` with `CartonRecordView`.
   - Verbs: the bulk catalog + carton verbs merged into one `RecordActionVerb[]`, with `scope` on
     everything that acts on one carton (ticket, claim, move-photos, resolve, unbox, delete →
     `single`). Paint them through `scopeRecordVerbs` in the bar's `bulk` slot. Keep verb letters
     off `x f j k [ ]`.
   - Mount it where `ReceivingLinesTable` paints `DockedReceiptsLedger` for the card stage.
     **Floor (⌘⇧F) keeps `DockedReceiptsLedger`**, exactly like orders keep
     `OutboundOrdersLedger`.
5. **Fast filtering** (the point of the port):
   - Status chips with counts, in the URL; Esc resets them.
   - Find: the bar field when the sidebar is closed. An exact carton / PO / tracking / serial hit
     opens it (mirror orders' "exact order number opens it").
   - Sections in a fixed order inside (newest activity first); the sidebar's Sort (`?colsort=`)
     reorders the list and its Activity row (`?sort=`) picks which stamp "newest" means.
   - Pager, per-page / Scroll mode, and kept scroll across reload.
6. **Clean cutover**: delete anything only the old history card path used (none on Docked today),
   and fold `IncomingDeliveryCardList`'s duplicated pieces into the foundation where this port
   touches them. No shims.
7. **Verify at `:3050`**:
   - `npx tsc --noEmit -p tsconfig.json` (filter to touched files), `npx eslint <touched> --quiet`,
     `pnpm verify:fast`.
   - Screenshots at 3 widths.
   - Chips cut plus a URL reload reproduces the cut.
   - Find exact-hit opens the record.
   - The sidebar sort reorders the cards, and J walks the new order.
   - X / Shift+X check.
   - The bar shows the same verbs at 1 and N, and Esc on an open ⋮ keeps the selection.
   - The next step sits at the card's bottom-right (measure it the way the orders probe did:
     16 px from right, 12 px from bottom).
   - `/receiving/history?rh_q=…` still redirects with its params.
   - Orders DOM equivalence stays SAME, apart from the owner-approved deltas.
8. **Ledger**: add a row to `RECORD-CARD-MIGRATION.md` (what landed, proof, open items), then get
   the owner's sign-off.

## Left sidebar: what History has, and the quality-of-life backlog (2026-09-27)

The sidebar half of the family contract lives in `HANDOFF-triage-family-contract.md`. For History:

**Landed** (`DOCKED_CONTROLS` / `NAV_PAGE_DECLS.incoming` in `src/lib/nav/context/pages.ts`):
- Save view (`receiving_history_saved_views`; keys = exactly what the list reads).
- Sort · Handled by · Activity date · **Activity** (Unboxed / Scanned at the door — the
  `scanned_newest` axis existed server-side with no writer until this row) · State.
- **View keys:** `1` On the way, `2` History (no other bare digit is bound on `/incoming`; the
  status chips use ⌥1–⌥3).

**Backlog, highest value first** (sidebar lane; each is a declaration or a server count, not a new
control component):
1. **Counts.** History and On the way show no count in the view switcher, and State / Source have
   no option counts, because neither view has a facet context. Add `incoming.docked` and
   `incoming.pipeline` to `NAV_FACET_CONTEXTS` with a compute in `src/lib/nav/facets/` (pickup's
   pattern: the list's own read + its own predicate, `dockedReceivingState`), then turn the State
   and Source choices into facet groups. Gives zero-count dimming, and an amber alert beacon on the
   History row for open exceptions (the To ship `404` pattern). Watch the cost: History's read is
   up to 3000 rows; prefer a count-only SQL over re-reading rows.
2. **Find in the URL.** Find is desk-store only, so a saved view or shared link cannot carry a
   search, and an exact carton / PO / tracking / serial hit does not open the record from the
   sidebar. Shipping has the same gap; fix once in `NavFind` for every desk-store page.
3. **Handled by → roles.** The server ORs received-by, unboxed-by and scanned-by
   (`build-sql.ts` staff clause). Shipped splits its staff into roles; History could offer Received
   by / Unboxed by / Scanned by once `build-sql.ts` takes one param per role.
4. **Date presets tuned to the dock.** Check `DateRangePickerField`'s presets against receiving's
   day (Today · Yesterday · This week · Last week); `Last 30 days` exists. [Not verified which
   others do.]
5. ~~**Go letter for the Deliveries lane.**~~ Landed 2026-09-27: per-lane `NAV_GO_KEYS` — Inbound `G D` Deliveries · `G S` Sourcing, tones blue / indigo. Was: Inbound's mode
   card (Deliveries · Sourcing) has no `G` letters and no mode `tone`. Owner to pick the letters.
6. **Recents.** No History recents list. `receiving.viewed` rows link into `/unbox`, not back to the
   ledger, and repeat the History list itself; low value unless a "recently opened by me" surface
   with `/incoming?lane=docked&openLine=` hrefs is wanted.
