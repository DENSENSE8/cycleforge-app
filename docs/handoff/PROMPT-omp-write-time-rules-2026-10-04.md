# Prompt — omp write-time rules for two operator laws (2026-10-04)

You are turning two operator rulings into **omp Time-Traveling Stream Rules** (TTSR — rules that
interrupt the coding agent mid-stream, inject the law and make it retry), **scanning the codebase**
with the same rules, **migrating or deleting** every file that does the opposite, and **locking**
the result so it cannot grow back. Work in the CycleForge prod lane
(`/home/michaelgarisek/Projects/cycleforge-lanes/prod`, shared tree, dev origin `:3050` only).

Read first: `AGENTS.md` → `.omp/rules/ds-raw-elements.md` (the rule file format in use) →
Garisek-OS `docs/loops/SPEC-KERNEL.md` (the loop the rules feed) →
omp's rule docs: <https://github.com/can1357/oh-my-pi/blob/main/docs/rulebook-matching-pipeline.md>
and <https://github.com/can1357/oh-my-pi/blob/main/docs/ttsr-injection-lifecycle.md>.

---

## 0. How every rule in this prompt is built (the method)

Each operator law becomes **four artifacts**, in this order. Do not skip one; each catches what
the one before it cannot.

| # | Artifact | Where | What it catches |
|---|---|---|---|
| 1 | **Contract rule** (teaches) — `description` + `globs`, no trigger | `.omp/rules/<law>-contract.md` | Listed in every session's rulebook; the agent reads it via `rule://` *before* writing. |
| 2 | **Interrupt rule** (stops) — `condition` regexes and/or `astCondition`, `scope: tool:write/edit(...)`, `globs` exclusions | `.omp/rules/<law>.md` | The agent writing the wrong shape, mid-stream, before the tool runs. |
| 3 | **Loop rule** (proves) — `SpecRuleV1` + a mutant + a shrink-only baseline | `tools/spec-loop/contracts.mjs`, `mutants.mjs`, `scripts/<law>.baseline.json` | Anything the interrupt rule cannot see: whole-repo facts, human edits, other harnesses, a rule already fired once this session. Runs on GEX45 every pushed commit. |
| 4 | **Ledger lock** (forbids return) | `docs/design-system/consolidation-ledger.json` (`deletedPaths` / `forbiddenSource`) | A retired component or helper coming back; enforced by the `Design consolidation` gate in `verify:fast`. |

Facts about omp rules that shape the design (verified 2026-10-04, omp 18.6):

- An interrupt rule sees **only what the tool call writes** — for `edit`, the new text; for `write`,
  the whole file. Pre-existing content is invisible. So a trigger must match a **local fact** (an
  import, a prop, a call) — never "X sits above Y" across a file.
- `condition` = regex over streamed tool arguments (can interrupt mid-token). `astCondition` =
  ast-grep pattern over the finished per-file snapshot (checked before the tool runs). `question`
  = judged yes/no after the output (never interrupts; needs `ttsr.judge: on` unless the judge
  role is a native jev model). Use regex first; add AST where regex is noisy; `question` only for
  semantics regex cannot express, and always behind a regex prefilter.
- Default `repeatMode` is `once` per session. If the rule must fire every time in long sessions,
  set `ttsr.repeatMode: after-gap` in omp settings (operator-level; ask).
- The rule **body is what gets injected** — write the fix, not "don't": the exact declaration to
  make, the reference file, the escape clause.
- pi does **not** have TTSR. The kernel's `scripts/spec-kernel/harness/pi-guards.ts` reads the same
  `.omp/rules/*.md` but supports only regex `condition` (block before the tool runs, no rewind, no
  `astCondition` / `question`). Keep every interrupt rule's *essential* trigger as a regex.

Tools you will use (all read-only except the rule files you write):

```bash
omp ttsr list                                   # every active rule, with source
omp ttsr test --rule .omp/rules/<law>.md --source tool --tool write --path <file.tsx> --file <snippet>
omp ttsr scan src --json                        # every file on disk the active rules match
node tools/design-mcp/ds.mjs contract '<job>'   # binding placement block (paste verbatim)
pnpm spec:sweep --only contracts                # loop rule red/green on today's tree
pnpm spec:loop --debt rule:<id>                 # one file per unit, held patch → GEX45 queue
```

---

## 1. Use case A — table controls live in the left contextual sidebar

### Operator ruling (verbatim, 2026-10-04)

> "The agent has a very hard time building out the left contextual sidebar whenever building a new
> page. … sorting data table information and filtering belongs in the left contextual sidebar below
> the top level navigation. I needed to inject that rule whenever it tries to put filtering above
> the data table, scan the code base and … delete any functions In the codebase that are the
> opposite of that rule."

Binding placement (from `ds.mjs contract 'filter and sort a data table'`, AGENTS.md §3): every
control that changes **which records show or in what order** — filters, sort, date / time window,
staff, carrier / status / reason facets, views, modes — lives in the left contextual sidebar,
declared in `NAV_PAGE_DECLS` (`src/lib/nav/context/pages.ts`); the page body shows records only.
Exception (operator 2026-10-03): live / monitor boards keep their date range as page chrome
top-right (`src/components/live-feed/LiveFeedDateRange.tsx`).

### Why the agent fails today (root causes — fix all three, not just the rule)

1. **Contradicting law in context.** `src/design-system/pinned.json:226` (`FilterRefinementBar.doNot`)
   says *"DataTable owns search and the filter icon to its right (To-ship is the gold)"* — the
   opposite of the placement block. Rewrite that entry to the sidebar law.
2. **The wrong path is one file; the right path is up to seven.** `DataTable` ships its own toolbar
   (`SearchField` `sheetFind`, `DataTableFilterMenu`, `DataTableSortMenu`, `WorkbenchViewsMenu`,
   `DataTableDateMenuControl` — `src/components/tables/DataTable.tsx:1330-1365`). The sidebar path
   touches: `src/lib/sidebar-navigation.ts` (`SIDEBAR_PAGE_NAV`), `src/lib/nav/context/pages.ts`
   (`NAV_PAGE_DECLS`), `src/lib/nav/context/schema.ts` (only for a new control kind),
   `src/lib/nav/facets/contexts.ts` (facet counts), `src/components/sidebar/contextual/nav-view-icons.ts`,
   `src/lib/nav/context/parity.ts`, and `src/lib/nav/lanes.ts` for a lane door.
3. **No gate.** The only check, `filter-controls-outside-sidebar` (`tools/design-mcp/design-mcp.profile.json:261`),
   runs in `ds_critique` only (not `verify:fast`), knows four elements (`DateRangePickerField`,
   `TimeField`, `StageStaffAssignPopover`, `aria-pressed`), and fires only when the same file also
   writes the URL. Dual paths (`sidebarOwnsControls ? null : <toolbar>` in
   `IncomingDeliveriesLedger.tsx:172`, `DockedReceiptsLedger.tsx:186`) teach both shapes.

Reference implementation to point at (correct shape): `QUEUE_CONTROLS`
(`src/lib/nav/context/pages.ts:297-344`) registered at `NAV_PAGE_DECLS.outbound.items.orders`
(`:506-511`), facets `'outbound.orders'` (`src/lib/nav/facets/contexts.ts:109`); the body reads
the URL via `useSearchParams` / `useReplaceSearchParams`
(`src/components/sidebar/contextual/useReplaceSearchParams.ts`). Hub reference: Exceptions
(`NAV_PAGE_DECLS.exceptions.modes`, `pages.ts:990-994`).

### Inventory (scouted 2026-10-04 — re-run `omp ttsr scan` before acting; files move)

**(a) Clear violations — 21 files**

| File | Control in the body | Sidebar already declares it? |
|---|---|---|
| `src/components/photos/PhotoLibraryFindRow.tsx:92` | `FilterMenu`, `MediaViewsMenu`, view switch | No (`ops-photos` has search only) |
| `src/features/task-board/TaskBulkBar.tsx:290` | `DataTableSortMenu`, `Segmented` layout, status / scope | No |
| `src/features/task-board/TaskBoard.tsx:480` | `StatusChipRail` | No |
| `src/components/admin/LocationsManagementTab.tsx:256,335` | raw `<select>` room + raw `<input>` search | No |
| `src/components/admin/ReasonCodesManagementTab.tsx:270,283` | raw `<select>` + raw `<input>` | No |
| `src/components/warehouse/racks/RacksDesk.tsx:151` | raw `<select aria-label="Room">` in `TriageCardList banner` | No (search only) |
| `src/components/reports/TaskActivityReport.tsx:45,55` | `FilterDropdownSelect` staff + kind | Partly (`reports` has date + staff) |
| `src/components/search/pasted-list/PastedListPage.tsx:242,247` | `BulkStatusChips`, `BulkSortChips` above `DataTable` | No |
| `src/components/products/catalog/CatalogImportReview.tsx:279` | `IncomingStatusChips` in `summary` | No |
| `src/components/receiving/incoming/IncomingDeliveriesLedger.tsx:175-176` | `DataTableFilterMenu`, `DataTableSortMenu` (fallback) | **Yes** — duplicate |
| `src/components/outbound/orders/cards/OrderCardList.tsx:310` | `QueueStatusChips` in `summary` | **Yes** (`QUEUE_CONTROLS`) |
| `src/components/shipped/ledger/ShippedLedger.tsx:406` | `StatusChipRail` in `summary` | **Yes** (`SHIPPED_CONTROLS`) |
| `src/components/receiving/docked/DockedPackagesLedger.tsx:143` | `StatusChipRail` | **Yes** |
| `src/components/repair/RepairCardList.tsx:318` | `StatusChipRail` | **Yes** |
| `src/components/inventory/stock/StockLedger.tsx:587` | `StatusChipRail` | **Yes** |
| `src/components/exceptions/ExceptionsDesk.tsx:303` | `StatusChipRail` | **Yes** |
| `src/components/imports/ImportRunsList.tsx:222` | `IncomingStatusChips` | **Yes** |
| `src/components/imports/ImportRowsList.tsx:255` | `IncomingStatusChips` | **Yes** |
| `src/components/receiving/unbox/UnboxCartonCards.tsx:190` | `IncomingStatusChips` | **Yes** |
| `src/components/receiving/history/DockedReceiptsLedger.tsx:186-226` | `DropdownMenu` state / sort + `IncomingStatusChips` | **Yes** |
| `src/components/receiving/incoming/PastedNumbersLedger.tsx:493` | `IncomingStatusChips` (summary + banner) | **Yes** |

**(b) Ambiguous — 9 files (need decision A3/A4):** CSV staging modals
(`outbound/orders/CsvImportStagingHost.tsx:313,318`,
`sidebar/receiving/incoming/IncomingPoImportStagingHost.tsx:221,244`,
`IncomingReturnsImportStagingHost.tsx:187,214`); record lookup
(`labels/LabelsProductsWorkspace.tsx:100`); resolver flyout
(`receiving/unfound/ecwid-search/EcwidOrderScopeFilters.tsx:36`); analytics
(`admin/GoalsAnalyticsTab.tsx:133`); mobile (`mobile/imports/MobileImports.tsx:95`,
`mobile/reports/MobilePackerReport.tsx:166,591`, `mobile/daily/MobileDailyChecklist.tsx:366,375`).

**(c) Allowed — 3 files:** `sidebar/contextual/NavFilters.tsx`, `live-feed/LiveFeedDateRange.tsx`,
`layout/GlobalHeaderSearch.tsx`.

**Dead code (0 importers, delete outright):** `src/components/admin/shared/AdminFilterChips.tsx`,
`src/design-system/components/monitor/FilterBand.tsx` — confirm 0 importers with
`xd://lsp` references before deleting.

### Artifacts to build

**A1 — contract rule** `.omp/rules/sidebar-controls-contract.md`: `description` ("Where table
filters, sort, dates, staff, facets, views and modes go"), `globs: [src/app/**, src/components/**, src/features/**]`.
Body: the `ds.mjs contract` placement block **verbatim**, the 7-file checklist above, the
`QUEUE_CONTROLS` reference with line numbers, and the escape clause ("can't do X" is valid only
with a citation of the missing field in `schema.ts`; then extend `NavControlsSchema` + `NavFilters`,
never the page).

**A2 — interrupt rule** `.omp/rules/sidebar-owns-table-controls.md`. Triggers (regex, each tested by
the scout against the repo):

| Trigger | Catches | Tested |
|---|---|---|
| import of `DataTableFilterMenu \| DataTableSortMenu \| FilterMenu \| FilterDropdownSelect \| StatusChipRail \| QueueStatusChips \| IncomingStatusChips \| BulkStatusChips \| BulkSortChips` | a body file pulling a control | 18 hits: 15 (a), 3 (b), 0 false |
| `(summary\|banner\|chips)=\{\s*<(StatusChipRail\|QueueStatusChips\|IncomingStatusChips\|BulkStatusChips\|select\b)` | chips / select in a list's slot | 12 hits, all (a) |
| raw `<select` with a Room / Status / Filter / Station label or value | hand-rolled filter dropdowns | 4 hits, all (a)/(b) |
| `<DataTable` toolbar props (`sheetFind=`, `filter=`, sort / views / date menu props — read `DataTable.tsx` for the exact prop names) | switching on the built-in toolbar | **untested — test it** |

`scope: [tool:write(**/src/**/*.tsx), tool:edit(**/src/**/*.tsx)]`; `globs` exclude
`src/components/sidebar/**`, `src/design-system/**`, `src/components/tables/DataTable.tsx`,
`src/components/ui/FilterMenu.tsx`, `src/components/live-feed/LiveFeedDateRange.tsx`,
`src/components/layout/GlobalHeaderSearch.tsx`, plus whatever decisions A2/A3 exempt.
`interruptMode: always`. Body: "Declare it in `NAV_PAGE_DECLS[page].controls` instead — read
`rule://sidebar-controls-contract`", the reference lines, and the exception list.
Optional second pass: an `astCondition` for `<TriageCardList $$$ summary={<$C $$$/>} $$$ />` and a
`question` ("Does this page body render a control that changes which records show or their
order?") gated by the regex.

**A3 — loop rule** `layout.sidebar-owns-table-controls` in `tools/spec-loop/contracts.mjs`:
ruling words verbatim (above), `surface: 'desktop'`, `status: 'active'`, `fix: ['worker']`,
`lease` per unit = the body file + `src/lib/nav/context/pages.ts` + `src/lib/nav/facets/contexts.ts`
+ `src/lib/sidebar-navigation.ts`. Static probe = the same signatures over `src/**/*.tsx` with the
same exclusions. Mutant `sidebar-sort-menu-in-body` (add a `DataTableSortMenu` import + mount to
`OrderCardList.tsx`). Shrink-only baseline `scripts/sidebar-controls.baseline.json` seeded with
today's (a) list so nothing new is red but no new file can join.

**A4 — ledger lock.** Entries in `consolidation-ledger.json` for each retired component
(`AdminFilterChips`, `FilterBand`, then `FilterRefinementBar`, `FilterDropdownSelect`, body use of
`FilterMenu`, and the DataTable toolbar subcomponents if decision A1 retires them) with exit
criteria; fix `pinned.json:226`.

### Migration order (never delete a control the sidebar does not yet offer)

1. **Duplicates first (12 files marked Yes):** delete the body control and the `sidebarOwnsControls`
   prop/branch end to end (`ReceivingLedgers.tsx:571,614` pass it). Verify the sidebar shows the
   same filter at `:3050`.
2. **Missing declarations (9 files):** add `NAV_PAGE_DECLS` controls (+ facets / icons / parity),
   prove them at `:3050`, then delete the body control.
3. **Dead code + ledger:** delete, add ledger entries, rewrite `pinned.json:226`.
4. **Hand the long tail to the loop:** `pnpm spec:loop --debt rule:layout.sidebar-owns-table-controls`
   — held patches land in the GEX45 queue; the operator applies.

---

## 2. Use case B — identifiers show their last eight

### Operator ruling (verbatim, 2026-10-04)

> "there is also a rule that I need to implement within the OMP coding harness for the identifiers
> to use the last eight of the identification number."

### What already exists (one source of truth per job)

| Job | Canonical helper | File |
|---|---|---|
| **Display** an identifier's short face | `getLast8`, `getLast8Serial`, `formatOrderIdDisplay`, `CHIP_DISPLAY_LEN = 8` (`abbreviateIdentifier` strips prefixes / leading punctuation before cutting) | `src/lib/copy-chip-format.ts:5,57,65` |
| **Paint** it (copy-on-click, full value copied) | `CopyChip` family (`displayWidth="last8"`), `OperationalIdentityChip` | `src/components/ui/CopyChip.tsx`, `src/design-system/components/OperationalIdentityChip.tsx` |
| **Match** a scan / typed tail to a record | `normalizeTrackingLast8`, `orderTrackingMatchKeys` | `src/lib/tracking-format.ts:127,140` |
| Order / PO identity model | `OperationalIdentity` | `src/lib/operational-identity.ts` (ledger entry `operational-identity`, state `queued`) |

### Hand-rolled forks (the opposite of the rule — 45 `slice(-8)` / `RIGHT(…, 8)` sites, 24 files)

- **Display forks (UI) — replace with `getLast8*` / `CopyChip`:**
  `components/linkage/LinkedTicketsPanel.tsx:68` (local `last8`),
  `components/receiving/workspace/UnitSlotList.tsx:127` (local `last8`),
  `components/receiving/incoming/cards/receipt-card-model.ts:61` (`trackingTail`, adds `…`),
  `components/fulfillment/SubstituteUnitCard.tsx:71`,
  `components/receiving/workspace/SerialMatchResult.tsx:184`,
  `components/receiving/workspace/claim/components/ClaimModalHeader.tsx:34`.
- **A third helper (fork of the helpers themselves):** `hooks/useDeskPickController.ts:40`
  exports `getOrderIdLast8` (digits-only last 8, then raw last 8) — different semantics from
  `getLast8` (alphanumeric, prefix-stripping). Decide which one is canonical for order numbers,
  fold the other into it, and update its callers (`xd://lsp` references first).
- **Match forks (server / lib) — replace with `normalizeTrackingLast8` / `orderTrackingMatchKeys`:**
  `lib/search/order-number-match.ts` (8), `app/api/debug-tracking/route.ts` (5),
  `lib/search/global-entity-search.ts` (3), `lib/support/orders/resolve-order-reference.ts` (2),
  `lib/receiving/reconcile-unmatched.ts` (2), `lib/receiving/check-zoho-received.ts` (2),
  `lib/neon/orders-queries.ts` (2), `app/api/receiving-logs/search/route.ts` (2),
  `lib/sync/sheet-sync-common.ts`, `lib/receiving/scan-match-probe.ts`,
  `lib/receiving/photo-move-targets-shared.ts`, `lib/outbound/scan-out.ts`,
  `lib/orders/orders-search.ts`, `lib/nav/locate/outbound.ts`, `lib/ai/context-fetchers.ts`,
  `app/api/receiving/lookup-po/route.ts`, `app/api/orders/backfill/ecwid/route.ts`
  (`getLastEightDigits`). SQL `RIGHT(col, 8)` sits behind the `idx_stn_*_last8` indexes — keep
  the SQL shape, route the *input* through the helper.

### Conflicting rulings — resolve before building (decision B1)

- **2026-09-30** (`docs/handoff/HANDOFF-ux-polish-and-status-exclude-2026-09-30.md:150`): on record
  bodies, *"ids always full, never last-8, no colour dot"* for order # / tracking #;
  `HANDOFF-desk-record-actions.md:36` swaps details panels to `RecordFullId`.
- **2026-10-04** ledger `operational-identity`: one face per handle; "a full id on one density and
  a last-8 on the other" listed as the *problem*.
- **2026-10-04** (this ruling + iOS handoffs): tracking identity = the last 8 digits for matching.

Default until the operator rules: **dense faces (rows, chips, cards, scan tape) show the last 8
through `getLast8*` / `CopyChip`; record bodies keep the full id; matching uses
`normalizeTrackingLast8`; the copied value is always the full id.** The rule that is safe under
every reading — build it first — is **"the last-8 face and the last-8 match each come from one
helper; never `slice(-8)` by hand."**

### Artifacts to build

**B1 — contract rule** `.omp/rules/identifier-last8-contract.md`: `description` ("How identifiers
are shortened, painted and matched"), body = the helper table above, the default above, and the
final ruling once B1 is decided.

**B2 — interrupt rule** `.omp/rules/identifier-last8.md`:
- `condition`: `\.slice\(\s*-\s*8\s*\)`, `\.substring\([^)]*length\s*-\s*8`, `\bRIGHT\([^)]*,\s*8\s*\)`,
  `\.padStart\(\s*8`, and local helper definitions `\b(?:function|const)\s+(?:last8|lastEight|trackingTail|getLastEightDigits|getOrderIdLast8)\b`.
- `scope: [tool:write(**/src/**/*.{ts,tsx}), tool:edit(**/src/**/*.{ts,tsx})]`; `globs` exclude
  `src/lib/copy-chip-format.ts`, `src/lib/tracking-format.ts`, `src/lib/operational-identity.ts`,
  `**/*.test.*`, and SQL migration files.
- Body: "Use `getLast8` / `getLast8Serial` / `formatOrderIdDisplay` (display) or
  `normalizeTrackingLast8` / `orderTrackingMatchKeys` (matching); paint with `CopyChip`
  `displayWidth="last8"` / `OperationalIdentityChip`; copy the full value; record bodies show the
  full id (per the current ruling)."
- Test both directions with `omp ttsr test` (a `slice(-8)` in a `.tsx` row must fire; the same line
  inside `copy-chip-format.ts` must not).

**B3 — loop rule** `identity.last8-one-helper`: static probe = the same regexes over `src/**`
minus the helper homes; mutant `identifier-hand-rolled-last8` (add a local `last8` to a card
model); shrink-only baseline `scripts/identifier-last8.baseline.json` seeded with the 24 files;
`fix: ['worker']`, lease = the one file.

**B4 — ledger lock**: extend the `operational-identity` entry's `forbiddenSource` with
`slice(-8)` outside the helper homes once the forks reach 0.

---

## 3. Decisions the operator must make (ask; never guess)

| # | Question | Effect |
|---|---|---|
| A1 | Retire `DataTable`'s built-in toolbar (sidebar only), or keep it as the one allowed exception (`pinned.json` "To-ship is the gold")? | Whether `DataTable` toolbar props are a trigger; ledger entries for its subcomponents |
| A2 | Mobile has no left sidebar: exempt `src/app/m/**` + `src/components/mobile/**`, or define the mobile home for filters (`docs/mobile-first/SURFACE_LAW.md`)? | Rule globs; 3 mobile files |
| A3 | CSV staging modals and resolver flyouts — exempt as dialog-internal, or migrate? | 4 files |
| A4 | Status chips with counts that also filter (the 14 `summary` slot cases) are controls under "NO chip / pill row" — confirm? | 14 files move their counts to sidebar facets |
| B1 | Last-8 scope: which identifiers (tracking, order #, serial, ticket, PO, carton) and where (dense faces only vs also record bodies)? Supersedes the 2026-09-30 "ids always full on record bodies" ruling or not? | B2 body text; record-body files |
| R1 | Set `ttsr.repeatMode: after-gap` so the rules fire every time in long sessions? | omp settings (operator scope) |

### Operator rulings (2026-10-04, answers to the table above)

| # | Ruling | Consequence |
|---|---|---|
| A1 | **Retire `DataTable`'s built-in record-selection controls.** `sheetFind`, `filter` (`DataTableFilterMenu`), `sortMenu` (`DataTableSortMenu`), `views` (`WorkbenchViewsMenu`, incl. the `sheetSavedViewConfigForTable` default), `dateMenu` (`DataTableDateMenuControl`) leave `DataTable`; every consumer declares them in `NAV_PAGE_DECLS`. Non-selection chrome (toolbar actions, page size, export, zoom, record-view switch) stays. "To-ship is the gold" is void. | Those props are interrupt triggers; ledger entries for the five subcomponents. |
| A2 | **Deferred** — the mobile home for filters will be defined later. | Exempt `src/app/m/**` + `src/components/mobile/**` from A2/A3 for now (rule body says "pending mobile ruling"). |
| A3 | **CSV imports deferred.** | Exempt the three CSV staging hosts. Resolver flyout, `LabelsProductsWorkspace`, `GoalsAnalyticsTab` are NOT exempt: they sit in the A3 baseline as debt. |
| A4 | **Yes — status chips that filter are controls, declared per page** in that page's contextual sidebar (`NAV_PAGE_DECLS[page]` + its facet context), never a shared cross-codebase chip rail in a body. | The 14 `summary`-slot chip rails move to per-page sidebar facets; chip components are interrupt triggers. |
| B1 | **Last 8 when the identifier is in a list** (rows, cards, chips, scan tape — any identifier kind). Record bodies keep the full id (2026-09-30 ruling stands). Copy is always the full value; matching uses `normalizeTrackingLast8`. | B2 body text; no record-body changes. |
| R1 | **Yes** — `ttsr.repeatMode: after-gap` saved to the global omp config (`repeatGap: 10`). | Rules fire again after a 10-message gap in long sessions. |

---

## 4. Acceptance (each item is observed, not claimed)

1. `omp ttsr list` shows the 4 new rules (2 contract, 2 interrupt) loaded from `.omp/rules`.
2. `omp ttsr test` transcripts: each interrupt rule fires on ≥ 3 bad snippets and stays silent on
   ≥ 3 good ones (including the allowed files and helper homes) — paste them.
3. `omp ttsr scan src --json` before vs after: violations of A2 and B2 go from today's counts to the
   decided exceptions only; the before/after counts are in the PR / handoff status.
4. A headless omp session asked to "add a status filter above the Repair list" is interrupted and
   ends with a `NAV_PAGE_DECLS` change, not a body control (paste the session's `ttsr_triggered`
   event and the diff).
5. `pnpm spec:sweep --only contracts` green; `pnpm spec:loop --plant` kills the two new mutants.
6. The GEX45 static sweep of the pushed commit is green and recorded (receipt id).
7. Every migrated page verified at `http://localhost:3050` in the sidebar (screenshot per page
   group); `ds_critique` clean on every touched UI file; `pnpm verify:fast` green on the committed
   tree.
8. Ledger entries added; `pinned.json:226` no longer contradicts the placement law.

## 5. Non-goals and process

- Do not build a new filter primitive or a second sidebar; extend `NavControlsSchema` + `NavFilters`
  only with a cited missing field.
- Do not delete a control the sidebar does not yet offer; do not change matching SQL shape (the
  `last8` indexes depend on it).
- Shared tree: commit by explicit path (never `git add -A`, `stash`, `restore`, `reset --hard`);
  other sessions' uncommitted files are theirs.
- Slices that can run in parallel (one owner per file set): **RuleAuthor** (A1, A2, B1, B2 + tests),
  **LoopRules** (A3, B3 + mutants + baselines), **SidebarDuplicates** (migration step 1),
  **SidebarMissing** (step 2, one page group each), **IdentityForks** (B display forks, then match
  forks), **Ledger** (A4, B4, `pinned.json`). RuleAuthor goes first; the rest consume its rule files.

## 6. Status (2026-10-04, end of session)

| Acceptance | State |
|---|---|
| 1 rules loaded | Both interrupt rules `[native]` in `omp ttsr list`; contract rules are rulebook rules (`rule://`), read 11× by a headless probe. |
| 2 `ttsr test` | 40/40 + CatalogImportReview exemption cases. Transcripts were in the session's `local://ttsr-evidence.md`. |
| 3 scan before → after | A2: inventory 21 (a) + 9 (b) → **5 files**, all decided debt: `GoalsAnalyticsTab`, `ReasonCodesManagementTab` (needs a route-tree node), `EcwidOrderScopeFilters` (resolver flyout), `pickup-record-model.tsx` (record-internal item filter), `features/support/SupportDesk.tsx` (another session's untracked file; its sidebar has no `status` facet). B2: 24 files / 45 sites → **0**. |
| 4 headless session | The specified prompt ended in a `NAV_PAGE_DECLS` + facet change via the contract rule (no interrupt needed); a forced bad write fired `ttsr_triggered` and the file was never created. |
| 5 loop | `spec:sweep --only contracts`: both new probes pass; the anchor's 2 errors are the pre-existing `nav.every-page-contextual-sidebar` live-feed rows. `spec:loop --plant --attempts 0`: `sidebar-sort-menu-in-body` and `identifier-hand-rolled-last8` caught. Baselines: sidebar 5 files, last-8 0. |
| 6 GEX45 | Pushed by explicit path on operator instruction, knowing HEAD will **not** typecheck: this slice depends on other sessions' uncommitted work (`NavBulkChips`, `bulk-list-view`, `useSheetColumns`, route-tree `SEARCH_PATHS`/`supportHref`, `@/lib/operational-identity`, `RepairStatusList`, label-batch clients, `ReceivingLineRow` fields, and ExceptionsDesk `lock` callers already gone from the working tree). The GEX45 static sweep stays red until those sessions land. The full working tree typechecks except `features/support/SupportDesk.tsx`. |
| 7 `:3050` proof | Partial. Screenshots taken before the lane went down (~16:01, `tailscale serve` holds tcp 3050). Owed: `/shipping/orders?stage=picked`, `/operations/imports` status/outcome, `/incoming?ref_in=…` buckets + reasons, `/search/list`, `/unbox` tabs, `/stations/live`, `/inventory/stock` health facet, `/incoming?lane=docked&dkind=return` count, Shipped `?cardStatus=` (server-side now). |
| 8 ledger | `record-selection-controls-left-the-body` retired with `forbiddenSource`; queued entries for FilterRefinementBar, FilterDropdownSelect, FilterMenu-in-body, body chip rails, DataTableFilterMenu (CSV host only), MediaViewsMenu; `operational-identity` extended. `pinned.json` no longer has the To-ship carve-out. |

Known gaps: Photos `MediaViewsMenu` (NavSavedViewsSchema has no store/payload adapter), task-board `?project=` chip (needs a `home` facet group), `/unbox` Source dropped (`receive` has no per-tab controls), per-unit lease for `rule:layout.sidebar-owns-table-controls` needs a two-line change in Garisek-OS `scripts/spec-kernel/loop.ts`. Ready queue `GET /api/shipping/ready-queue` 500s (`fba_shipment_status_enum: ""`), seen during the run, not caused by it.
