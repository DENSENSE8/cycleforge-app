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

## Owner's open ask — the ACTIONS surface (build this first)

Owner, verbatim intent: an **Actions** header is needed because a record is not only item triage and order lookup — actions link to other display methods (print manuals, view manuals, view label, go to the overall rules page — not just "assign rule"; "SKU stock ↗" is an action too; "give this person a task with this order context").

Owner's proposed placement (verify, then build):
1. **Bulk actions above the data table** (selection → bulk verbs). Note: another session removed the toolbar above the To-ship ledger (`cf3be25d9`, "controls move to the contextual sidebar") — reconcile: a *selection-only* bulk bar (appears when ≥1 checked) is not the removed toolbar; the planned floating bottom-centre bar (`SelectionActionBar`) may be the answer. Confirm with owner.
2. **Record actions**: **In place → right-side action rail** beside the two columns; **Split → an actions bar on top** of the record (the 1/3 pane is too narrow for a rail). One action list, two placements, decided by `useDeskRecordView()` — same pattern as `DeskRecordLayout`.
3. Contents (grouped, sentence case): *Documents* — print manual, view manual, view label, packing slip; *Go to* — SKU stock, overall rules page (not just the assign-rule pencil), listing; *Task* — "Create task for someone with this order" (order context prefilled; find the existing task/assignment composer before building one — `StationComposerHost` / tasks in `src/lib/assistant` or `/api/v1` tasks).
4. Existing pieces to fold in, not duplicate: `OrderRecordActionStrip` / `MorphingRowActionMenu` verbs (`useOrderActionVerbs`), `OrderDocumentsSection`, `ItemPaperworkDialog`, `OrderAutoAssignRuleLine`, the "SKU stock ↗" link in `OrderRecordView.tsx`. Move "SKU stock" out of the item card into Actions.

Build it as a design-system component (e.g. `DeskRecordActions` in `src/design-system/components/`) taking typed action groups; `OrderRecordView` supplies the order's groups. Run `ds_contract` first.

## Other open items

- **Ecwid link unverified in the browser**: `marketplaceOrderUrl` returns `https://my.ecwid.com/store/<id>#order:id=<n>&return=orders` (unit-checked), store id reaches the client via `next.config.ts` `env.NEXT_PUBLIC_ECWID_STORE_ID` (from `ECWID_STORE_ID`). A headless check on order 5043 found no open link — restart the lane (`systemctl --user restart cycleforge-lane@prod`, config change) and re-check the Order # row's ↗.
- **Same details-panel face on other records**: repair (`repair-record-sections.tsx`), carton (`carton-record-facts.tsx`), incoming (`incoming-record-sections.tsx`) still use `OrderNumberIdentity`/`TrackingIdentity` (dot + last-8). Swap to `RecordFullId`.
- **Remaining caps / square bits**: `DESK_BAR_SEGMENT_CLASS` (e.g. "SKU STOCK") is uppercase; list row state codes (URG/RDY/NOTE) are intentional codes — ask before changing. `IconButton` default radius is still `flush`.
- **To-ship row redesign** (handoff `HANDOFF-desktop-triage-foundation.md` §spec) and **row selection + floating bar** are still to do.
- Red gates not ours: `Tenancy isolation` (11 routes), typecheck in `src/lib/assistant/grok-agent-loop.ts` (another session).

## Working rules

- Verify at `http://localhost:3050` only (sign in: `/api/auth/staff-picker` → `/api/auth/signin`, tenant `usav`, see `scripts/ds-trial-shots.ts`). Screenshot in place + split + a phone viewport (`/m/pick`, `isMobile/hasTouch`) — phones must stay industrial (square, caps, flush).
- Many files carry other sessions' uncommitted hunks. Commit **by name**; for mixed files stage HEAD + your hunks only (`git hash-object -w` + `git update-index --cacheinfo`). Never `git add -A`. Push with `--no-verify`.
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
