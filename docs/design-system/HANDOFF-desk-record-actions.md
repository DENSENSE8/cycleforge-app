# HANDOFF — desk record: actions surface + triage finish (written 2026-09-26)

Law: BRIEF §12 (industrial on phones, triage on desktop). Read it, then this file only.

## Landed (pushed, don't redo)

| Commit | What |
|---|---|
| 4b3a695e4 | Triage tokens (shadcn neutral, 10px card / 8px control / pill); `ModeRegion` resolves by device (`resolve-region-mode.ts`); desktop industrial mounts → triage; ⌘K palette on mode corners |
| 97a783e4b | Record plane motion (`motionRole.record.pane`, `swap.focus`), `DeskRecordViewSwitch` (In place / Split) |
| 7d4f558b3 | Line roles `divide/seam/frame/fact/mark` + `labelVoice` in `packages/design-tokens/src/modes.ts`; mode corners on Button/shadcn/Dialog/TextField; record columns lift (`DESK_RECORD_COLUMN_CARD_CLASS`); split = list 2/3 · record 1/3, one column; full ids + click-to-copy (`RecordFullId`); customer copy + Maps; item hierarchy; Ecwid order link |

Rules now in code — reuse, don't fork:
- Borders: `border-mode-divide` (between records), `-seam` (vertical), `-frame` (box), `-fact` (inside a record card), `outline-mode-mark` via `RECORD_OPEN_CLASS`. Triage: only `divide` paints.
- Labels: `RECORD_LABEL_CLASS` = `mode-label` (caps on floor, sentence on desk). Write source strings in sentence case.
- Corners: `rounded-mode` (card), `rounded-mode-control` (controls), `rounded-mode-pill`. Photos stay square.
- Only the two record columns lift (shadow); header/list stay planted on one white page.

## Actions — landed shape (owner 2026-09-26, supersedes the rail plan)

Owner simplified the plan: no right rail, no split actions bar, no duplicates.
1. **Top strip = quick triage only**: Report out of stock · Mark urgent · Mark scanned out · Select, then **⋮** (the record's other actions), Delete isolated (`ORDER_BULK_VERB_IDS` in `to-ship/MorphingRowActionMenu.tsx`). The desk's check-set strip shows the same bulk buttons with the rest in ⋮; phones keep the full strip.
2. **More actions below the details** (`order-record-more-actions`): the same list as ⋮, one source — `useOrderRecordMoreVerbs` → Paperwork · Copy · Print · Download photos · SKU stock · Rules (+ task verbs).
3. **No duplicates** (`RECORD_INLINE_VERB_IDS`): Pick/Pack assign live on the stage rows, condition + qty on the item card, ship-by in the details, the rule is a pencil on the item card (`OrderAutoAssignRuleAction`, tooltip = current rule), label · slip · manuals are ONE **Paperwork** action; Flag / Export are list-level.
4. **Paperwork is inline, never a popover**: `PaperworkPanel` replaces the record body with a Back button (`dispatchOpenOrderPaperwork` / `subscribeOpenOrderPaperwork` in `utils/events.ts`); the item # opens the item-number view the same way. Tabs use the In place / Split segmented face.
5. Item card stage order: QC by · Picked by · Packed by · Scanned out by (then pre-box / bench).

Split list: full width of its two thirds with side gutters, a plain scrollable list (no card, no floating bottom). Rows show the full order number (`LEDGER_ORDER_NUMBER_SLOT_CLASS`, `OrderNumberMenuChip face="full"`).

eBay placeholder: ShipStation adopt now re-keys rows filed under a bare platform onto the store's linked account (`placeholderRowsToRekey`); `orderPlatformChoices` offers accounts, not bare "eBay"; last-7-day backfill `scripts/backfill-shipstation-ebay-account-source.sql` (215 orders moved, 1 left without a ShipStation ref: order 14211).

## Other open items

- **Order # link follows the imported platform**: `getOrderPlatformLabel` lets a recognised `account_source` (ShipStation store → platform) beat the 4-digit Ecwid guess, so Shopify 11xx orders read Shopify and open `admin.shopify.com/.../orders?query=<n>`; Ecwid 5043 opens `my.ecwid.com/store/<id>#order:id=5043` (browser-checked 2026-09-26).
- **Details are for reading (owner 2026-09-26)**: no Label row / print bar in To-ship / Pending details (Shipped / Search keep the label history, `label-entries`). Price row = paid price in green, no "Net". Listing row: link opens, copy (`LedgerCopyAction`) far right on the ↗ / ✎ axis. Trailing ↗ / ✎ / copy share `RECORD_TRAILING_ACTION_CLASS` via `IconButton radius="control"`.
- **Same details-panel face on other records**: repair (`repair-record-sections.tsx`), carton (`carton-record-facts.tsx`), incoming (`incoming-record-sections.tsx`) still use `OrderNumberIdentity`/`TrackingIdentity` (dot + last-8). Swap to `RecordFullId`.
- **Remaining caps / square bits**: `DESK_BAR_SEGMENT_CLASS` (e.g. "SKU STOCK") is uppercase; list row state codes (URG/RDY/NOTE) are intentional codes — ask before changing. `IconButton` default radius is still `flush`.
- **To-ship row redesign** (handoff `HANDOFF-desktop-triage-foundation.md` §spec) and **row selection + floating bar** are still to do.
- Red gates not ours: `Tenancy isolation` (11 routes), typecheck in `src/lib/assistant/grok-agent-loop.ts` (another session).

## Floor — the industrial fullscreen (owner 2026-09-26, BRIEF §12 Mode D)

- **One stage state, three views**: `DeskStageContext` `view: 'in-place' | 'split' | 'floor'` + `setView` / `toggleFloor`; `fullscreen` is derived (`view !== 'in-place'`). `DeskPageLayout` remembers In place / Split as `desk.<deskId>.view` (the old boolean `desk.<deskId>.fullscreen` is still read via the setting's `legacy` key); floor is never stored.
- **Faces**: To ship paints the triage index face (`UnshippedSheet` → `DataTable`) in In place and Split; `UnshippedTable floor` registers a floor face (`useDeskFloorFace`) and paints `OutboundOrdersLedger` only while `view === 'floor'`. The Picking desk keeps its always-ledger (`ledger`).
- **Records on the index face**: `UnshippedSheet` wraps its `DataTable` in `DeskRecordPlane` + `OrderRecordView` (same placement as the ledger) using `useOrdersSpreadsheet`'s `recordPlane` bag (live open row, close, rows, commits — not a `DataTable` prop; destructure it off). The hook builds the open record's `OrderRecordActionStrip` for the action row itself; checked rows turn the header into the bulk bar instead. Station embeds (pack, shipping workspaces) render the bare table.
- **Entering**: ⌘/Ctrl+Shift+F anywhere on the desk (a chord — passes scanner and text-entry guards; an open overlay still owns the keys; listed under "Desk" in `?`), or the **Floor** button `DataTableFullscreenToggle` paints beside ⤢ when a floor face is registered. Ctrl/⌘+F stays browser find.
- **In floor**: no page header / tab row, the sidebar column and context rail park (`useDeskFloorActive`, not written to their remembered state), the shipping page `ModeRegion` flips to `industrial`, records open In place (the In place / Split switch hides), and the toolbar shows **Exit floor**. Checking rows with no record open shows the check-set strip (`OrdersMorphingHost placement="header"`) under the ledger toolbar.
- **Esc, one exit per press**: close the record (`DeskRecordPlane`, `document`) / clear the check-set (strip, window capture) → leave floor for the view it came from → leave Split.

## Working rules

- Verify at `http://localhost:3050` only (sign in: `/api/auth/staff-picker` → `/api/auth/signin`, tenant `usav`, see `scripts/ds-trial-shots.ts`). Screenshot in place + split + a phone viewport (`/m/pick`, `isMobile/hasTouch`) — phones must stay industrial (square, caps, flush).
- Many files carry other sessions' uncommitted hunks. Commit **by name**; for mixed files stage HEAD + your hunks only (`git apply --cached` of your hunks). Never `git add -A`.
- `pnpm tokens:build` after any `modes.ts` edit; `pnpm verify:fast` before calling done.

## Paste-ready prompt

```text
CycleForge prod lane. Read AGENTS.md, docs/design-system/BRIEF.md §12, and
docs/design-system/HANDOFF-desk-record-actions.md — nothing else until a face needs it.
Build the record ACTIONS surface first: one DS component with grouped actions
(documents: print/view manual, view label, packing slip; go to: SKU stock, overall
rules page, listing; task: give someone a task with this order's context), placed as
a right rail beside the two columns in the In place view and as a bar on top in the
Split view; move "SKU stock" into it. Confirm the bulk-actions placement with the
owner before touching the list chrome. Then the open items in the handoff. Screenshot
in place + split + phone at :3050, commit your own hunks by name, push --no-verify.
```
