# HANDOFF — Desk record views: fixed-width in place by default, fullscreen split by choice (2026-09-25)

Paste this whole file into a fresh session in `~/Projects/cycleforge-lanes/prod`.

**This is an update + add-feature, not a port into one display method.** Every record surface gets ONE record view shown in TWO ways, and the staffer chooses:

| View | When | Layout |
|---|---|---|
| **In place** (default) | normal desk | fixed-width list; clicking a row shows the record *in place of the list*, same fixed width, table still mounted underneath |
| **Split** (staff choice) | the staffer turns on **fullscreen** (the existing toggle on the table row) | list on the **left** for selection, the open record on the **right** with the full information; clicking another row swaps the right side |

**Read first, in this order:**
1. `AGENTS.md`
2. `src/lib/design/desk-surface-law.ts` — the law, its rules, and how to add one
3. `src/lib/design/desk-surface-ledger.ts` — every desktop rail today, classified, with the shrink-only baselines
4. `src/design-system/pinned.json` → `DeskStageOverlay` and `SearchResultRow` (what `ds_contract` now answers)
5. `src/components/shipped/ledger/ShippedLedger.tsx` — a `RecordLedger` adopter in both views (it replaced the old Shipped mount `DashboardOrderDetails.tsx`, deleted 2026-09-25)
6. `src/design-system/components/DeskStageContext.tsx` + `DeskPageChrome.tsx` + `src/components/tables/DataTableFullscreenToggle.tsx` — the existing fullscreen state and toggle the split view keys off
7. `src/components/tables/table-surface-binding.ts` → `TableRecordPlane` (Center Lock Q5)

## Working rules
- **Dev origin:** `http://localhost:3050` only. Never start `next dev`, never bind a port. Lane: `systemctl --user status cycleforge-lane@prod`.
- **Do not commit** unless the owner says so in the session. Many agents edit this tree: never revert, reformat or stage their hunks.
- **Tokens only** — widths come from `src/design-system/tokens/desk-stage.ts` (`DESK_STAGE_FIXED_CLASS`, `DESK_RECORD_MEASURE_CLASS`); corners from `cornerClass`. A new width is a new token in that file, never a literal. Run `node tools/design-mcp/ds.mjs critique <file>` on every new UI file and fix real findings.
- **Gate:** `node_modules/.bin/tsx scripts/desk-surface-guard.ts` after every step. `pnpm verify:fast` before calling a step done.
- **Baseline state:** `pnpm verify:fast` passed all 20 gates (including `Desk surface`) when this handoff was written. Anything red at the start of your session is another lane's — report it, don't fix it.
- **Probe session:** `GET /api/auth/staff-picker` + `POST /api/auth/signin` with header `x-tenant-slug: usav`, body `{ staffId, deviceKind: 'personal' }`, against `:3050`. Playwright from the repo: `import { chromium } from '@playwright/test'`, script copied into the repo root (node resolves packages from there), deleted afterwards.

## Owner decisions (binding, 2026-09-25)
1. **Default view — in place.** A picked row's record (or any multi-field form) opens **in place of the fixed-width list**, at the same fixed width, as `DeskStageOverlay fill="stage"` over the still-mounted list. J/K steps next/previous, Esc (and the header X) returns to the exact row, the selection lives in the URL. Similar to Shopify / eBay order pages, without losing your place.
2. **Fullscreen view — split, by the staffer's choice.** When the staffer turns on fullscreen (the existing `DataTableFullscreenToggle` on the table row), the same record shows **beside** the list: list on the left for selection, the record on the right with all its information. Clicking a row or pressing J/K swaps the right side; the list keeps its scroll and check-set. This is the same record view component, not a second one.
3. **The staffer chooses; the choice sticks.** No surface forces one view. The fullscreen toggle is the switch. Remember the choice per staffer per desk (decision below in the pattern: Settings Registry, staff scope) so a staffer who works split stays split.
4. **Never the old right rail.** Neither view is a `RightRailHost` panel (`DetailStackRailRegistrar`, `useRegisterRightPanel` at detail priority) or a hand-rolled evidence `<aside>`. The split lives inside the desk stage, drawn by one design-system primitive (`DeskRecordPlane`, Step 0). The legacy rails stay debt in the gate until converted.
5. **Fixed-width list.** In the default view the list sits in the desk stage (`DESK_STAGE_FIXED_CLASS`, 1152 px centred) with nothing beside it. Rows are triage rows: identity, state, the facts you compare across rows, and one-decision cell popovers (e.g. Pick/Pack assign). Bulk selection and the bulk bar stay on the list in both views.
6. **Record view layout.** One record component, two widths: in place it gets the fixed stage → two columns (main 2/3: the work — items, Pick/Pack, labels, timeline, notes; aside 1/3: identity facts — customer, channel, ship-by, location, links); in the split pane it gets the pane width → the two columns stack (container query, not a viewport breakpoint). Simple records (task, checklist item) are one column at `DESK_RECORD_MEASURE_CLASS`.
7. **Contextual sections.** The record shows only the sections the current mode needs, in both views. Example: return / replacement labels never appear on Pending or To Ship.
8. **Config is not record data.** The item-number auto-assign rule shows as one read-only line in the record (`Rule: Cuong → Long · Chi → QA Packer`) with a pencil; the pencil opens the editor as `DeskStageOverlay fill="inset"`. The full list of rules gets its own config page later.
9. **Scope:** To Ship (and the outbound desks that share its ledger), Receiving, Tasks, Daily. Scan stations keep their right-edge Displays (`StationDisplaysPushColumn`) — exempt.
10. **CI is the base.** The `Desk surface` gate enforces this; new patterns are added as rules on top of it (Step 0 adds the next one).

## Already done this session (UNCOMMITTED — keep them together as one commit when the owner asks)
| File | What |
|---|---|
| `src/lib/design/desk-surface-law.ts` | The law. Three rules: `rail` (every desktop rail classified; `record` rails are debt), `search-desk-copy` (no desk table/ledger imports under `/search`), `binding-inspector` (no `kind: 'inspector'` table bindings). Rules are data; the header explains how to add rule #4. |
| `src/lib/design/desk-surface-ledger.ts` | 46 rails classified (`record` 26 · `supporting` 15 · `station-edge` 4 · `linked-peek` 1), 3 search imports, 12 inspector bindings. Baselines: `rail 26`, `search-desk-copy 3`, `binding-inspector 12`. |
| `src/lib/design/desk-surface-law.test.ts` | 8 planted-violation tests (runs in the `Unit tests` gate). |
| `scripts/desk-surface-guard.ts` | CLI (`--json`), exit 0 / 1 / 2. |
| `scripts/verify-profile.mjs` | `Desk surface` gate, `profiles: 'always'` → runs in `verify:fast`, `verify`, and CI (`.github/workflows/ci.yml` runs `pnpm verify`). |
| `src/design-system/pinned.json` | New `DeskStageOverlay` entry (both views, `DeskRecordPlane`); `SearchResultRow` law gains the 2026-09-25 ruling that supersedes its "becomes a DataTable mount" clause. |

Separate, earlier, also uncommitted — **do not touch**: picker/packer functional roles and item-number auto-assign (`staff_functional_roles`, `src/lib/automations/*`, `StageStaffAssignPopover`, `AssigneeCombobox`, `OrderAutoAssignRule.tsx`, `OrderAutoAssignSlot.tsx`). Step 2 below only *moves* `OrderAutoAssignRule` out of the rail.

## How the ratchet works (every step)
- Converting a `record` rail: **delete its ledger entry and lower `DESK_SURFACE_DEBT_BASELINE.rail` by one in the same change.** The gate fails until both move together ("debt retired — drop the baseline"), and fails if an entry is left for a file that no longer registers a rail ("no longer matches — drop it").
- Same for `binding-inspector` when a binding flips to `stage-overlay`, `search-desk-copy` when a search import goes, and the new `record-plane` rule (Step 0) when a surface moves onto `DeskRecordPlane`.
- Never add a `record` entry or raise a baseline. If a surface genuinely needs a rail, it is `supporting` / `station-edge` / `linked-peek` with a note — and a `supporting` rail never grows a per-record editor.

## The pattern — `DeskRecordPlane` (build once in Step 0, reuse on every surface)

**What it is:** `src/design-system/components/DeskRecordPlane.tsx`, the ONE place a desk record is placed. The surface hands it the record view and the cursor; it decides the view from the desk's fullscreen state.

```tsx
<DeskRecordPlane
  open={openRecord != null}
  onClose={close}                 // strips the deep-link param
  title="Order 113-0586702"       // header + accessible name
  indexLabel="2 of 28"            // n of N
  onPrev={cursor.onPrev} onNext={cursor.onNext}
  prevDisabled={cursor.prevDisabled} nextDisabled={cursor.nextDisabled}
  list={<TheFixedWidthList />}    // the list, mounted once, never remounted between views
  testId="to-ship-record"
>
  <OrderRecordView record={openRecord} mode={mode} />   // same component in both views
</DeskRecordPlane>
```

**Behaviour:**
- Reads `useDeskStageOptional()` (`DeskStageContext`). `fullscreen === false` (or no desk stage) → **in place**: `list` in the fixed stage, the record in `DeskStageOverlay fill="stage"` over it (the reference is `DashboardOrderDetails.tsx:59-101`: `indexLabel`, `onPrev`/`onNext`, `closeOnScrim={false}`). `fullscreen === true` → **split**: `list` on the left (flex), the record pane on the right at a desk-stage token width (add `DESK_SPLIT_RECORD_CLASS` to `desk-stage.ts`; start from `DESK_RECORD_MEASURE_CLASS`), same header band (title, `n of N`, prev/next, X) on the pane. Nothing registers with `RightRailHost`.
- Switching views never unmounts `list` (render it in one tree position; only the record's container changes), so scroll, cursor and check-set survive the toggle.
- Split with nothing open: the pane shows the list summary (what the old aside showed when empty — queue totals, "On the way" stats) or a one-line "Select a record" state; in place with nothing open: that summary lives on the list toolbar.
- **Keys:** J/K and arrows step the record in both views (`useRecordCursorKeyboard({ scope: 'record' })` or the surface's existing cursor). **Esc order:** first Esc closes the open record; the next Esc exits fullscreen (`DeskPageChrome` already exits fullscreen on Esc — make the record close consume the first press).
- **Remember the choice:** persist fullscreen per staffer per desk through the Settings Registry (`src/lib/settings/registry.ts`, `scope: 'staff'` → `staff_preferences.prefs`; see `docs/settings-registry.md`). `DeskPageLayout.tsx:126` owns `fullscreen` as plain `useState` today — seed it from the setting and write it on toggle. One key per desk id (`desk.<deskId>.fullscreen`), not one global.
- Deep link: keep each surface's existing param (`?openOrderId=`, `?task=`, `?check=`, `?openRepair=`); reload restores the record in whichever view the staffer's setting selects.
- Sections per mode come from a typed registry (`Record<Mode, readonly SectionId[]>`), so a section in the wrong mode is a type error. Extend the existing `src/lib/selection-context/order-inspector-context.ts` (Shipped's mode → features map) — don't invent a second one.
- Pin it: add a `DeskRecordPlane` entry to `pinned.json` (useWhen "open a row / record view / split view / fullscreen with list and details"; doNot "hand-roll a split or an evidence aside; register a record with RightRailHost; mount DeskStageOverlay for a record outside this primitive"), and point the `DeskStageOverlay` entry's record wording at it.

## Steps

### Step 0 — build `DeskRecordPlane` and gate it (rule #4)
- Build the primitive as specified above, plus its `DESK_SPLIT_RECORD_CLASS` token. Critique it (`ds.mjs critique`).
- Add rule `record-plane` to `DESK_SURFACE_RULES` in `src/lib/design/desk-surface-law.ts`: scope = desktop sources outside `src/design-system/components/DeskRecordPlane.tsx` and `DeskStageOverlay.tsx`; detect = `<DeskStageOverlay` with `fill="stage"` (a record placed by hand). Roles: `legacy` (debt). Seed its ledger with today's hits (the Shipped mount `DashboardOrderDetails.tsx`, and every other hit the guard lists) and its baseline, so the gate lands green. Plant a violation in `desk-surface-law.test.ts`. From then on, a record surface that skips the primitive — and so skips the staffer's choice of view — fails CI.
- Update the `rail` rule's law sentence to name `DeskRecordPlane` as the way to show a record beside the list.
- **Acceptance:** guard green with the new rule; tests green; a planted `<DeskStageOverlay fill="stage">` in a scratch file fails the gate.

### Step 1 — `RecordLedger` on `DeskRecordPlane` (converts Daily + Tasks + both `/incoming` lanes)
`src/design-system/components/record-ledger/RecordLedger.tsx` paints its evidence column itself — an `<aside data-testid="record-evidence">` (L244-310), static beside the list on wide screens, J/K and Esc at L112-145. **Its side-by-side behaviour is what becomes the fullscreen split view — it moves into `DeskRecordPlane`, it is not thrown away.**
- Make `RecordLedger` place its evidence through `DeskRecordPlane` (in place by default, split in fullscreen); delete its own aside markup. Keep its J/K/Esc handlers or hand them to the plane — one owner, not two.
- Its "nothing open" evidence body becomes the plane's empty/summary slot (decision in the pattern).
- Once `RecordLedger` no longer paints its own aside, remove the `<RecordLedger\b` detector from the `rail` rule and drop all six consumer entries at once (`DailyAgenda.tsx`, `IncomingDeliveriesLedger.tsx`, `DockedReceiptsLedger.tsx`, `StockLedger.tsx`, `SkuExceptionsLedger.tsx`, `ReplenishmentNeedTable.tsx`; `rail` baseline −6). **Ask the owner** before landing: Stock, SKU exceptions and Replenishment get the same two views because they share the primitive. If the owner says not yet, give `RecordLedger` a temporary `plane` opt-in, convert only the three target consumers (baseline −3), and delete the opt-in when the last one moves (no permanent dual mode).
- Surfaces covered: `/` (`DailyAgenda.tsx` — Tasks `?task=` → `TaskEvidence`, Daily `?check=` → `ChecklistEvidence`, L449-475; single-column records), `/incoming` (`IncomingDeliveriesLedger.tsx` → `IncomingDeliveryEvidence`), `/incoming?lane=docked` (`DockedReceiptsLedger.tsx` → embedded `HistoryCartonTriagePanel`).
- Bindings: `src/features/home/grid/daily-table-definition.ts` and `src/features/tasks/grid/tasks-table-definition.ts` → `recordPlane: { kind: 'stage-overlay', reason: '…' }` (drop both from `binding-inspector`, baseline −2). `stage-overlay` names the plane; `DeskRecordPlane` supplies both views of it.
- Dead rails — confirm unmounted, then delete (ledger entries + `rail` baseline −2): `src/features/daily-checks/DailyCheckItemInspector.tsx` (no importers found 2026-09-25), `src/features/my-day/MyDayTaskInspector.tsx` (only `MyDayWorkspace.tsx` mounts it; check whether `MyDayWorkspace` is still routed — if not, it and `task-inspector-id.ts` go too). Update or delete `src/features/daily-checks/build-daily-check-inspector-leaves.test.ts` with its subject.
- **Acceptance** on `/`, `/?task=<id>`, `/?check=<id>`, `/incoming`, `/incoming?lane=docked` — see "Verification" for the exact two-view script.

### Step 2 — To Ship (and every desk that shares `OutboundOrdersLedger`)
`src/components/outbound/orders/OutboundOrdersLedger.tsx:633` mounts `<aside data-testid="ledger-evidence" className={LEDGER_EVIDENCE_CLASS}>` → `OutboundOrderEvidence` (one monolithic column, no mode prop). Blast radius: To Ship (`DashboardOrdersView` → `UnshippedTable`), Pending (`ShortageDesk.tsx`), Exceptions (`OrderExceptionsWorkbench.tsx:271`), Search (`SearchOrderLedger.tsx`).
- Replace the aside with `DeskRecordPlane`, driven by the existing `plane.openRow` / `?openOrderId=` / `useRecordCursorKeyboard` (L233) wiring. In place, the list takes the full fixed stage; in fullscreen, list left + order right.
- Split `OutboundOrderEvidence` into an order record view (`OrderRecordView`): main (items, Pick/Pack, labels, notes, verbs) + identity column (customer, platform/order #, TRK#, ship-by, location, condition, qty) that stacks in the split pane. Pass the desk mode in; sections from the typed mode registry. Return/replacement labels (`OrderLabelEntries`) only where the mode needs them — not Pending, not To Ship.
- Auto-assign rule (`OutboundOrderEvidence.tsx:528` → `OrderAutoAssignRule`): one-line summary + pencil (decision 8); the pencil opens the existing editor in `DeskStageOverlay fill="inset"` (an inset form, not a record placement — the `record-plane` rule only reads `fill="stage"`).
- Move Shipped's `DashboardOrderDetails.tsx` onto `DeskRecordPlane` in the same step so all outbound desks offer both views (drop it from the `record-plane` ledger).
- `LabelIntakeDesk.tsx` reuses `LEDGER_EVIDENCE_CLASS` as a `supporting` reference column — leave it, keep its ledger note true.
- Gate: drop `OutboundOrdersLedger.tsx` from the `rail` ledger (baseline −1). `ORDERS_DEFAULT_TABLE_BINDING` already declares `stage-overlay` — after this step it is finally true.
- Tests / pins to update: `src/lib/right-rail/selection-occupancy.test.ts:58-62` if `detail:order` stops being registered; `src/lib/observability/tier1-paint-order.ts:54` lists `OutboundOrdersLedger.tsx` as the To Ship LCP host (keep if it still paints first).
- **Acceptance** on `/shipping/orders`, `/shipping/shortage`, `/shipping/exceptions`, `/shipping/shipped`: two-view script passes; Pick/Pack popovers work on rows and in the record in both views; Pending shows no return/replacement labels; the rule is one line with a pencil.

### Step 3 — Receiving rails (desk views only; stations exempt)
Exempt, do not touch: Arrival `/triage` (`TriagePanel.tsx:552`) and the Unbox bench (`LineEditPanel.tsx:1244`) keep `StationDisplaysPushStack`; the `station-edge` ledger entries stay.
Convert each onto `DeskRecordPlane` (ledger entry dropped, baseline −1; its binding → `stage-overlay` where it has one):
- **Unbox History tab** (`/unbox?unboxview=history`): `ReceivingLinesTable.tsx:465` → `dispatchReceivingOpenHistoryTriage` → `HistoryCartonTriagePanel.tsx:860` (`detail:history`). Binding `receiving-table-definition.ts:76`. Reuse the same `HistoryCartonTriagePanel` body the docked lane embeds in Step 1.
- **Legacy incoming rail**: `IncomingDetailsPanel.tsx:175` (`detail:incoming`, still reachable from the embedded `ReceivingLinesTable` tab via `receiving-open-incoming-details`). Binding `incoming-table-definition.ts:52`. If Step 1 made `/incoming` the only entry, retire the rail instead of converting it.
- **Unfound queue**: `UnfoundQueueDetailsPanel.tsx:165` (`detail:unfound`, opened from `useUnfoundQueueTable.ts:208`). Its binding says `navigate` — make the mount honest (the plane, or navigate — not a rail).
- **Repair desk** (`/repair`, receiving shell): `RepairDetailsPanel.tsx:253` (`detail:repair`, `?openRepair=`), binding `repair-table-definition.ts:34`.
- `IncomingAddInboundOverlay.tsx` (a create form in the rail, `record` debt) → `DeskStageOverlay fill="inset"` (a form, not a record placement).
- `ReceivingDetailsStack.tsx` (`detail:receiving`): confirm which desk still opens it; convert or retire.
- **Acceptance:** two-view script on each converted desk; `/triage` and the Unbox bench unchanged.

### Step 4 — Tasks and Daily follow-through
Step 1 converts the live surface (`/` → `DailyAgenda`). This step checks nothing still opens a task or checklist item in a rail: search for `detail:task`, `detail:my-day`, `detail:daily-check`; each hit is deleted (dead) or converted. `TaskEvidence` and `ChecklistEvidence` keep their faces (Task / doc / ticket) in both views; an embedded ticket inside a record is record content, not a rail. Mobile (`/m/home`, `MobileTaskSheet`) is out of scope.

### Step 5 — Search (separate track, same gate; confirm with the owner before starting)
`/search` renders a full `DataTable` (`SearchResultsSurface.tsx:51`, via `useSearchHitsSpreadsheet` → `useCompoundSpreadsheet`) and opens orders as the whole To Ship ledger (`SearchOrderLedger.tsx:22`). Target: fixed-width `SearchResultRow` rows; an order opens a search-owned two-column record through `DeskRecordPlane` (so search gets the same two views) with one "Open in To Ship" link (`/shipping/orders?openOrderId=<id>`). Each import removed: drop it from `search-desk-copy`, baseline −1.

## Expected baselines when Steps 0-4 land
| Rule | Now | After |
|---|---|---|
| `rail` | 26 | ≤ 12 (Step 1 −8 incl. dead inspectors, Step 2 −1, Step 3 up to −6) |
| `binding-inspector` | 12 | ≤ 7 (daily, tasks, receiving, incoming, repair) |
| `search-desk-copy` | 3 | 3 (0 after Step 5) |
| `record-plane` (new, Step 0) | seeded in Step 0 | 0 on the four target surfaces |

## Verification per step
1. `node_modules/.bin/tsx scripts/desk-surface-guard.ts` → "the desk surface law holds", with the lower debt numbers.
2. `npx tsx --test src/lib/design/desk-surface-law.test.ts` plus any test you touched.
3. `pnpm verify:fast` — green except reds that were already there.
4. **Two-view Playwright script at `:3050` (1600×1000), for every converted surface:**
   - **In place (fullscreen off):** click the first row → the record plane testid is visible and the list is covered by it at the fixed width; the old aside testid (`record-evidence` / `ledger-evidence`) is absent; `J` → `n of N` increments; `Escape` → record gone, same row focused, list scroll unchanged; reload with the deep-link param → the record reopens in place.
   - **Split (toggle fullscreen on the table row):** list visible on the left AND the record visible on the right at the same time; click the third row → only the right side changes, list scroll unchanged; `J` → the right side shows the next record; first `Escape` closes the record (list still fullscreen), second `Escape` exits fullscreen.
   - **Choice sticks:** with fullscreen on, reload → still fullscreen split with the record open; turn it off, reload → in place. Check a second desk keeps its own setting.
   - Screenshot both views and look at them.
5. `node tools/design-mcp/ds.mjs critique <file>` on every new or rewritten UI file.

## Adding the next pattern to the base
Append a rule to `DESK_SURFACE_RULES` in `src/lib/design/desk-surface-law.ts` (id, one-line law, roles, debt role, `scope`, `detect`), seed its ledger + baseline in `desk-surface-ledger.ts` so the gate lands green, and plant one violation in `desk-surface-law.test.ts`. The guard script, the verify gate and CI need no change. Step 0's `record-plane` is the first one added this way. Further candidates: "a `supporting` rail contains no Save button"; "no `Popover` with more than one form field"; "every `DeskRecordPlane` record declares its mode sections".
