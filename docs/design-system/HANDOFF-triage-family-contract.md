# Handoff prompt — make the triage card list page-agnostic (one face, many families)

Paste everything below the line into a fresh long-running session.

---

You are turning CycleForge's To-ship card list into a **page-agnostic triage face**. Stock
(inventory) and receiving must be able to wear it too, even though they have their own
information architecture, their own record, and their own backend routes.

Worktree: `/home/michaelgarisek/Projects/cycleforge-lanes/prod`.
- Read `AGENTS.md` first.
- Dev origin is `http://localhost:3050` only (lane unit `cycleforge-lane@prod`).

The tree is shared with other live sessions:
- Re-read a file right before you edit it.
- Never revert what you did not write.
- Never commit without asking.
- Report red in other people's files; don't fix it.

On 2026-09-27 the per-section sorts the owner had asked for that morning were removed from
`OrderCardList.tsx`, `TriageListBody.tsx` (`TriageSectionHeader` lost its `sort` prop) and
`order-section-sort.ts` (now only the fixed in-section order). That was the **owner's later ruling**
("Remove, sidebar Sort only", given in the sidebar session), not an accident. If a file you own
changes under you, stop and ask.

## The answer in one paragraph

Do **not** build a generic backend, and do **not** make one table that knows every page. Split every
triage page into three layers joined by typed contracts:

1. **Data host** — per family. It owns its backend route, query, URL filters, selection state,
   open-record state and record view.
2. **Family adapter** — per family, and pure. It turns a row group into a `RecordCardModel`: facts,
   top-right status, next step, notes, alert, sections, status chips, verbs.
3. **Triage face** — shared. It provides the card anatomy, the selection bar, sections, pager,
   keys, the quick-look slot and the record plane.

Families differ only in layers 1 and 2. The face never branches on family (Law 1). Receiving keeps
`/api/receiving-lines`, stock keeps its inventory routes, and orders keeps `/api/orders`. What they
share is the **shape handed to the face**, not the data source.

```
 /api/orders            /api/receiving-lines        /api/inventory/…     ← each family's own backend
      │                        │                          │
 useOrdersQueueFeed     useReceivingLinesData       useUnitsFeed         ← data hosts (layer 1)
      │                        │                          │
 orderCardModel         receiptCardModel            unitCardModel        ← pure adapters (layer 2)
      └──────────────┬─────────┴──────────────┬──────────┘
                TriageFeed<Row>          TriageFamily<Row>              ← the two contracts
                     └──────────┬─────────────┘
                     TriageCardList (face, layer 3) → RecordCard · TriageSelectBar · TriageListBody · DeskRecordPlane
```

## Best starting point (do these in order; each phase is a wave with owner sign-off)

**Phase 1: extract the face out of `OrderCardList`, with zero pixel change on orders.**
- `components/outbound/orders/cards/OrderCardList.tsx` (~700 lines) is today a data host, adapter
  and face fused together. Pull the family-agnostic ~70% into
  `design-system/components/triage-card-list/TriageCardList.tsx`, behind the two contracts below.
- Leave `OrderCardList` as a thin orders host of about 150 lines: feed, adapter wiring, verbs, record
  view.
- This is the highest-leverage step. Every later family becomes "write an adapter + a host", and the
  risk is lowest because orders is the most complete reference and the proof tool exists.
- Proof: `node scripts/dom-equivalence.mjs capture orders-p1-before /shipping/orders order-card` before
  the first edit, then `compare` after. The only allowed diff is text or data.

**Phase 2: re-mount `IncomingDeliveryCardList` (receiving "On the way", ledger #13) on the face.**
- It is the second hand-built card list, over a **different backend**
  (`ReceivingLineRow`, `/api/receiving-lines`) with a **different IA**: purchase-grouped cards, a
  dock-state top-right instead of an SLA, and sections from `lib/receiving/incoming-sections`.
- Its host (`IncomingDeliveriesLedger`) already owns the data and hands the list `groups` +
  callbacks. That is exactly the host → face split, so it proves the contract with a real second
  consumer and then deletes about 500 hand-rolled lines (`IncomingDeliveryCardList` +
  `IncomingDeliveryCard`).
- It forces the contract extensions every later family needs (below).

**Phase 3: stock — `/inventory/units` (ledger #17), the stress family.**
- The top-right status is stock / location, there is no price column, the record is a unit or SKU,
  and there is no deadline.
- If Phases 1–2 got the contract right, this is an adapter + host with no face edits.
- Then receiving history (`HANDOFF-inbound-history-cards.md`), bins (#18), sku-bins (#19) and the
  admin queues, per the families handoff.

**ASK the owner before Phase 2:** the ledger's owner ruling is "outbound first (O1–O5), then
inventory, then receiving". Phase 1 fits inside O1. Phases 2–3 need an explicit go, plus the order
between them. The recommendation is receiving first, because it already has a card list and the
same host pattern.

## The two contracts (Phase 1 designs these; sketch — refine against the code)

```ts
/** Layer 1 → face: what a data host hands the list. Rows are already the family's own type. */
interface TriageFeed<Row> {
  /** Bands of groups, already filtered, sectioned and ordered by the host (J / K walk this order). */
  bands: readonly [band: string, groups: readonly RowGroup<Row>[]][];
  /** Every group before status-chip filtering — chip counts read this. */
  allBands: readonly [string, readonly RowGroup<Row>[]][];
  total: number | null;              // server scope total when known
  loading: boolean;
  fetching: boolean;
  loadMore: (() => void) | null;
  search: { value: string; onChange: (v: string) => void; pending: boolean; answeredBy: 'server' | 'client' };
  selection: { ids: ReadonlySet<number>; toggle(row: Row, e: { shiftKey: boolean }): void; toggleGroup(ids: readonly number[], on: boolean): void; all(on: boolean): void };
  open: { id: number | null; open(row: Row, e?: RecordOpenEvent): void; close(): void };
}

/** Layer 2: the family's pure description. No hooks except where data needs them (as useOrderChannel). */
interface TriageFamily<Row> {
  noun: { one: string; many: string };
  testIdPrefix: string;                              // 'order-card' · 'receipt-card' · 'unit-card'
  storageKeys: { pageMode: string; scrollTop: string };
  recordParams: readonly string[];                   // URL params naming the open record
  statusChips: { keys: readonly string[]; keysOf(row: Row): readonly string[]; render(props): ReactNode };
  groupKey(band: string, group: RowGroup<Row>): string;
  cardModel(group: RowGroup<Row>, ctx): RecordCardModel;  // facts, status, next, notes, alert, lines
  factColumns: readonly RecordFactColumn[];
  sections?: { label(band: string): string; tone(band: string): TriageSectionTone };
  identity(group): ReactNode; trailing(group): ReactNode; quickLook(group): ReactNode;  // family slots
  verbs: (props: { rows: Row[]; lead: Row; count: number }) => RecordActionVerb[];     // Law 5, with scope
  exactFind?(query: string, group: RowGroup<Row>): boolean;  // an exact hit opens the record
  onSaveNote?(row: Row, text: string): void;
  record: { title(row): ReactNode; view(row): ReactNode; summary?: ReactNode };
}
```

Rules:
- The face owns every **interaction**: the bar (Law 5 verbs at 1 and N), `[` `]` paging, per-page /
  Scroll mode, kept scroll, held-new pill, X / Space / Enter (`useTriageCardKeys`), J / K through
  the record cursor, sticky sections with counts, the empty / all-clear / loading states, the record
  plane, and the In place / Split switch on the bar.
- The adapter owns every **meaning**: which facts in which order, what the top-right says, what the
  next step is, which verbs exist and their scopes, and what the quick look adds.
- The host owns **data and URL**:
  - the query and route;
  - sort — the sidebar's one Sort control, since sections carry no sort of their own after 2026-09-27;
  - sidebar filters (see "The sidebar half" below);
  - the record's sub-state, e.g. documents opening via `documentsRequest`.

## Contract extensions the second family will force (add for every family, never as a page branch)

1. **Top-right status as a union.** Today it is `status: RecordCardDeadline` (SLA only). Make it
   `{ kind: 'deadline' … } | { kind: 'state'; label; tone } | { kind: 'stock'; onHand; tone }`. That
   covers receiving's dock state and stock's on-hand.
2. **Optional status icon**, and state glyphs beyond `LIFECYCLE_GLYPH` (receiving:
   `RECEIVING_LIFECYCLE` in `design-system/tokens/receiving-lifecycle.ts`).
3. **Next step for every family.** `RecordCardModel.next` already exists: arrow + present-tense verb,
   bottom-right (orders: `orderNextStep`). Receiving maps Unbox → Complete, with Continue / Resolve
   for hold / exception (`DockedReceivingRecord.tsx` has today's map).
4. **Per-line open** (`line:<id>`, the open line highlighted), plus the **notice** / **footer**
   slots `IncomingDeliveryCardList` already has.
5. **External selection and cursor ports.** Receiving's host owns its selection `Set` and its
   record cursor; the face must accept them, not only the orders selection store.
6. **Notes stay generic.** `notes: { fixed, own }` + `onSaveNote` already exists. Staff notes are an
   **append-only trail**: a save adds an entry and becomes the latest. There is no in-place rewrite
   of an old entry, and none should be promised.

## The sidebar half of the contract (host ↔ left contextual sidebar)

The face owns the middle of the page; the **left contextual sidebar** owns every control that
narrows or orders the list. Owner rulings, 2026-09-27:
- "Remove all of the filters or sorting or date selection from the data table header … and move it
  into the left sidebar."
- "The status chips are perfect for displaying in the middle above the data table."

**Superseded 2026-10-04 (owner rulings A1 + A4,
`docs/handoff/PROMPT-omp-write-time-rules-2026-10-04.md` §3):** the 2026-09-27 "status chips in the
middle above the data table" placement is void. Status chips that filter are controls: each page
declares its own statuses as facets in its contextual sidebar (`NAV_PAGE_DECLS[page]` + its
`NAV_FACET_GROUPS` context) — never a shared chip rail in a body or a list's `summary` / `banner`
slot (ledger `body-status-chip-rails`). The `sidebarOwnsControls` toolbar exception is void too:
`DataTable`'s find, filter, sort, views and date controls are retired (ledger
`record-selection-controls-left-the-body`). Debt is tracked by loop rule
`layout.sidebar-owns-table-controls`.

So the triage page has exactly two places a control can live:

| Where | What | Examples |
|---|---|---|
| Middle, above the list (face) | Select-all, count, per-page / Scroll, In place / Split, Floor, fullscreen — how records render, never which records show | Compact / Full density switch |
| Left sidebar (host declaration) | Status facets with counts, sort, staff, date ranges, single-choice filters, facet groups with counts, saved views, Find, view keys | To ship `cardStatus` statuses; On the way delivery states (`?state=`) |

Nothing that sorts, filters or picks a date may render in the list header, the section headers, a
toolbar menu or a chip row above the list. Phones (`src/app/m/**`, `src/components/mobile/**`) are
exempt pending the mobile filter-home ruling (A2).

A family's sidebar is **data**, declared once in `NAV_PAGE_DECLS[<page>].items[<view>]`
(`src/lib/nav/context/pages.ts`) and painted by `NavFilters` for every family:

| Field | Kind | Writes | Use it for |
|---|---|---|---|
| `controls.sort` | radio list | `param` (+ `dirParam` when an option names a direction; omit both when the ids already encode it) | the list's one order |
| `controls.staff[]` | staff picker per role | one param per role | who did it |
| `controls.dateRanges[]` | `DateRangePickerField variant="compact"` | `fromParam`/`toParam`, deletes `clearParams` | civil-day windows (replaces week pills) |
| `controls.choices[]` | single-choice, no counts | `param`, deletes `clearParams` (e.g. `page`) | a fixed vocabulary the list cuts on itself |
| `NAV_FACET_GROUPS['<page>.<view>']` | checkbox groups with counts from `GET /api/nav/facets` | `param` | a cut the server can count (view counts in the switcher come free) |
| `savedViews` | Save view / presets | captures `paramKeys` | exactly the params the list reads — nothing stale, never `q` |
| `viewKeys: true` | bare `1`–`9` | the view href | only after proving no other bare digit is bound on the page |

Rules for every family:
1. **URL is the only state.** A control the sidebar writes must be read by the list from
   `useSearchParams`; no `useState` filter survives the port (it can't be saved or reloaded).
2. **One param, one control.** A status the chips cut must not also be a sidebar row. When a family
   adopts chips over a param the sidebar already owns, the sidebar row goes in the same change.
3. **Declared route params.** Every param in `navControlParams` must be owned or carried by the
   route (`src/lib/routing/*-routes.ts`), or hygiene strips it; `resolve.test.ts` enforces this.
4. **Server-safe declarations.** `pages.ts` is read by `/api/nav/context` on the server. Anything it
   imports (option lists, param names) must live in a plain module, never a `'use client'` file: a
   client constant arrives as a function and the route 500s. Option lists come from the same
   constant the list's predicate uses (`DOCKED_STATE_OPTIONS`, `INBOUND_SOURCE_OPTIONS`,
   `HISTORY_ACTIVITY_OPTIONS`) so the two can't drift.
5. **Parity rows.** Each moved control gets a `param` row in `src/lib/nav/context/parity.ts`
   citing the toolbar it replaced; `parityGaps(<page>)` must stay `[]`.
6. **Saved-view keys follow the list.** When a family adds or drops a param, update its
   `SAVED_VIEW_PARAM_KEYS` entry in the same change.

Live references (verified 2026-09-27): To ship (`QUEUE_CONTROLS` — sort, 4 staff roles, 2 date
ranges, 5 facet groups), Inbound On the way (`PIPELINE_CONTROLS` — Sort, Source), Inbound History
(`DOCKED_CONTROLS` — Sort, Handled by, Activity date, Activity, State). Check matrix:
`docs/refactors/sidebar/HANDOFF-outbound-sidebar-verify.md`.

## What already exists (verified 2026-09-27 — re-verify, other sessions move it)

- **Face pieces:**
  - `design-system/components/record-card/RecordCard.tsx` + `record-card-types.ts` — anatomy, white
    card with outline-only state, next step, inline notes, quick-look slot.
  - `record-fact.tsx` — fact faces.
  - `triage-card-list/TriageSelectBar.tsx` — Law 5 bar with the view switch.
  - `TriageListBody.tsx` — sections, held-new, load more, kept scroll.
  - `triage-list-state.ts` — URL chips + page, page mode, held-new, page keys, `useTriageCardKeys`.
  - `record-action-strip/` — `RecordActionVerb.scope` + `scopeRecordVerbs`.
  - `DeskRecordPlane.tsx` + `DeskRecordViewSwitch.tsx`.
- **Orders family:**
  - `OrderCard.tsx` (adapter), `OrderCardPeek.tsx` (quick look: new facts only),
    `lib/orders/order-card-model.ts` (`orderCardModel`, `orderNextStep`, `ORDER_NOUN`),
    `lib/orders/order-section-sort.ts` (fixed order inside a section).
  - `to-ship/MorphingRowActionMenu.tsx` (`triageBarVerbs`, `onOpenDocuments`), `OrderRecordView.tsx`
    (`documentsRequest`), `paperwork/PaperworkDocuments.tsx` (the Documents pane).
- **Receiving:**
  - `components/receiving/incoming/IncomingDeliveriesLedger.tsx` → `cards/IncomingDeliveryCardList.tsx`
    + `IncomingDeliveryCard.tsx`.
  - `lib/receiving/receiving-line-row.ts` (row), `lib/receiving/incoming-sections.ts`,
    `lib/receiving/docked-record-state.ts`.
- **Stock:** `components/inventory/UnitsWorkspaceView.tsx`, `ByFilterResultList.tsx`,
  `SkuDetailTables.tsx`.
- **Ledger and laws:**
  - `docs/design-system/RECORD-CARD-MIGRATION.md` — rows #1, #13, #17–#19, O1 progress, dev red.
  - `HANDOFF-record-card-families.md` — the per-page loop, Laws 1–7, pattern-card sign-off.
  - `HANDOFF-inbound-history-cards.md` — receiving history, and a Law 7 check: #11 / #13 are
    **port**.

## Open decisions to carry (ASK; don't settle silently)

1. ~~**Per-section sorts.**~~ **Settled 2026-09-27 by the owner: "Remove, sidebar Sort only".** The
   sidebar's Sort is the list's only sort; the face grows no section-sort slot. A family that needs
   a different in-section order changes its fixed comparator (orders: `sortOrderSection`), never a
   header control.
2. **Documents rewrites the remembered view.** The bar's Documents calls `stage.setView('split')`,
   which persists `desk.<deskId>.view` for the staffer. Ask whether the auto-split should be
   transient (like Floor, never written). If yes, add a transient-split entry to the desk stage for
   every family.
3. **`l` on Documents.** The triage bar reuses Label's `l` for Documents. The legacy check-set strip
   still has Label on `l`. Confirm the letter.
4. **Unverified this session:**
   - the Documents upload empty state (the probed order had files) — check it against an order with
     no documents;
   - whether the Documents ✕ is the visually last control (the pane header's own ✕ sits right of
     it);
   - `pnpm verify:fast` was not re-run after the last round.

## Per phase, every time (the loop from the families handoff)

1. Capture before: screenshots at 1500 / 1100 / 760 at `:3050`, plus `dom-equivalence capture` for
   orders.
   - Expired admin session: `PW_BASE_URL=http://localhost:3050 node tests/shot.mjs /shipping/orders /tmp/x.png`
     re-mints it.
   - Probes that switch the desk view must put it back; it is a per-staffer remembered setting.
   - Probes that write (notes, uploads) must `page.route`-intercept the write.
2. Write the pattern card for the family in the ledger and get the owner's sign-off before code.
3. Extend the contract / foundation for every family. Re-prove orders is unchanged.
4. Write the pure adapter + unit tests (next step per state, grouping, status union), then the thin
   host.
5. Delete what only the old mount used. Clean cutover, no shims.
6. Verify:
   - `npx tsc --noEmit -p tsconfig.json` (filter to touched files), `npx eslint <touched> --quiet`,
     `pnpm verify:fast`;
   - chips + URL reload, exact Find opens, J / K, X, Space, Enter, the bar at 1 and N, Esc on an open
     ⋮ keeps the selection;
   - the next step sits bottom-right, notes add and cancel;
   - screenshots at 3 widths, and Floor (⌘⇧F) still shows the family's ledger.
7. Add a ledger row (what landed, proof, open items), then get the owner's sign-off.

## Laws (enforce in review)
1. Families pass data and ids, never JSX branches; the face never branches on family.
2. One painter per display type (`record-fact.tsx`, the status union's painters).
3. Fixed positions (anatomy table in the families handoff), including next step bottom-right and
   notes on line 1.
4. Disclosure by the card's own width (`CARD_DISCLOSE`), never per-page breakpoints.
5. Height animates only through `Collapse` / `CollapseItem`.
6. `/m/*` is untouched unless a wave says so (ASK).
7. Keep-sheet pages stay on `DataTable` (the ledger's Wave 0 list).
