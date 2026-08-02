# Collection click planes + strip grammar — HANDOFF

**Status:** five surfaces shipped and verified 2026-08-01. Local Pickup was
audited and is **correct as-is** (§4.2). Two cross-cutting cleanups remain
(§4.3, §4.4). `npm run verify` has four reds, all owned elsewhere (§7).

Parent thread: [`queue-inspector-non-modal-rail-HANDOFF.md`](queue-inspector-non-modal-rail-HANDOFF.md)
(its Status log holds the dated blow-by-blow). This file is the forward-looking
half — read it before touching any receiving collection surface.

---

## 1. The defect family, in one paragraph

`useReceivingLineBulkSelection` pins `selectMode` **ON** for every
`isTableOnlyMode` surface ("selection is always on while `active`"), and
`useReceivingRowSelection.handleSelectRow` used to read `selectMode` as "bulk
mode — never open the record". Always-on select therefore meant **never open**:
the row body swallowed every click into a checkbox toggle, the gutter rendered a
painted `<span>` that only ate the click, and whatever the row was supposed to
open had no reachable gesture. Measured on dogfood before the fix — `/incoming`
28 rows, `/receiving/history` 31, `/unbox` 117 + 12 + 22 — all of them emitting
**zero** `receiving-select-line` events on click.

---

## 2. The contract now (do not re-litigate)

**Two planes, two gestures, always coexisting** (`display/workbench.md` → Action
planes; the golden outbound grid does the same thing):

| Plane | Gesture | Wiring |
|---|---|---|
| **Record** | click the row body | `rowClickOpens` → `dispatchSelectLine`, or an `openRow` override |
| **Multi-select** | click the gutter checkbox | `handleToggleRow` → `GridRowCheckbox` (a real button that `stopPropagation`s) |

Rules that came out of shipping it:

1. **A surface flag is never keyed on `mode.id` alone.** `mode.id === 'history'`
   is shared by `/receiving/history`, the Unbox workbench's default tab
   (`embedded`) and `/dashboard?mode=inbound` — and the three open *different
   things*. Use `isHistorySurface` / `isUnboxWorkbench` in
   `ReceivingLinesTable`, or add a sibling flag; never widen one.
2. **`openRow` is for when the destination differs.** Default = dispatch
   `receiving-select-line`. History overrides it to `/carton/[id]`
   (`cartonReadHref`) because the default branch would `router.replace` a browse
   click into `/unbox` — a Workbench map handing off to a Station. Unbox needs
   no override: its dispatch already opens the LineEditPanel in place.
3. **`recordView` is REQUIRED and undefaulted** on `ReceivingLineWorkspace`
   (`backend-patterns.md` → a classification that decides whether a write claims
   something takes no default). The Unbox feed passes `false`; the rail, the
   scanner, sibling PO lines and deep-link restores keep recording. Recent
   answers "which cartons did I open", not "what did I scroll past".
4. **The gutter is a real control or a painted readout — never a third thing.**
   `GridRowCheckbox` when a toggle handler exists; a plain `<span>` that does
   NOT `stopPropagation` when it doesn't (an unsplit surface's row click is
   still the toggle, so eating the click there makes a dead zone).
5. **Two vocabularies, one seam.** The UI says Recent · Queue · History; the
   wire keeps `?unboxview=viewed` because `viewed` is the SERVER's name for that
   feed (`view=viewed`, the `unbox_viewed` mode, `receiving_line_views`).
   `utils/unbox-workspace-state.ts` is the only place they meet.
6. **One hairline per strip, after index 0.** `withScopeDivider`
   (`workbench-shell.tsx`) marks the rule that separates the leading *scope* tab
   from the lanes filtering within it. Unbox = Recent; Home/My Day =
   Everything. Two rules around a middle tab reads as a rendering bug.

---

## 3. Shipped + verified

| Surface | Row click opens | Gutter | Notes |
|---|---|---|---|
| `/incoming` | `IncomingDetailsPanel` (`detail:incoming`) | real | unblocked the whole Phase A0 flip |
| `/receiving/history` | `/carton/[id]` | real | not `/unbox` — see rule 2 |
| `/unbox` (all 3 tabs) | LineEditPanel in place | real | **no** `receiving_line_views` write |
| `/dashboard?mode=inbound` | `/carton/[id]` | n/a (`selectMode` off) | was a dead click since it shipped |
| `/test?view=testing` (all 3 tabs) | `TestingPanel` in place | real | consumes the shared hook now — §4.1 |

Specs: `queue-inspector-non-modal.spec.ts`, `incoming-click-to-open.spec.ts`,
`history-row-opens-carton.spec.ts`, `unbox-feed-opens-carton.spec.ts`,
`testing-history-opens-line.spec.ts`, `pickup-row-opens-order.spec.ts`,
`home-scope-divider.spec.ts`. Unit: `utils/unbox-workspace-state.test.ts`,
`lib/receiving/receiving-modes.test.ts`.

---

## 4. Next up

### 4.1 Testing history — DONE 2026-08-01 (it consumes the shared hook)

Chosen over threading `handleToggleRow` + `rowClickOpens` into the private copy,
because the copy was not a stylistic duplicate — it was the **pre-split version
of this contract**, carrying verbatim the `selectMode → toggle → return` early
return §1 names as the defect, plus its own `handleSelectGroup` and its own
`emitSelection` / `emitSelectionTotal` / `onToggleAll` effects. Everything in it
already existed in `useReceivingRowSelection` byte-for-byte; the **only** thing
it varied was the selection-bus scope constant. That is one parameter
(`selectionScope`, defaulting to receiving), not a fork — and threading the
split in instead would have left two implementations of a contract that changed
twice in one week.

Adopting the hook also restored what the copy had dropped: `selectedId` (the
grid was hard-wired `selectedId={null}`, so an opened line had no highlight) and
the `receiving-clear-line` / `-highlight-line` / `-workspace-open` bridges —
buses Testing already dispatched into and never listened on.

Testing passes `openRow` rather than the default dispatch, because its open also
has to notify the host (`onOpenLine`); the destination is unchanged
(`dispatchSelectLine` → `TestingLineWorkspace` opens `TestingPanel` in place, no
navigation). It does **not** pass `recordViewOnOpen`: no `ReceivingLineWorkspace`
mounts on `/test`, so nothing there writes `receiving_line_views` — pinned by the
spec rather than by a flag.

The legacy pipeline board (`STATION_PIPELINE_BOARDS`, off by default) took
`isChecked` + `onToggleSelect` in the same change. Splitting the planes without
it would have left the board's always-on checkbox painted and its bulk set
unreachable — the exact dead gutter rule 4 exists to prevent. *(The receiving
board under `ReceivingLinesTable` still has that gap; see §4.5.)*

**Measured on dogfood** (`/test?view=testing&testTab=history&staff=1`, 5 rows
this week / 20 at `weekOffset=3`):

| | before | after |
|---|---|---|
| leaf-row `role` | `checkbox` | `button` |
| gutter checkboxes per row | 0 | 1 |
| `receiving-select-line` per row click | 0 | 1 |
| `TestingPanel` opens on click | no | yes |
| `POST /api/receiving-lines/view` | 0 | 0 |

### 4.2 Local Pickup grid — AUDITED, correct as-is (no change)

`PickupGridView` never had a `selectMode`, a `selectedIds` set, or a bulk bar.
The row body always calls `onSelectOrder(order_id)`, which writes the durable
`?lcpu=<orderId>` selection — the same param the sidebar rail writes from the
other side, and reversible (a second click clears it). That is the Workbench
URL-as-state contract satisfied; there is no receiving inspector for an LCPU row
to open, because LCPU orders live in `local_pickup_orders` / `_items` and never
enter the receiving-lines pipeline. Measured on dogfood: 8 rows,
`role="button"`, zero checkboxes, click → `?lcpu=48`. Pinned by
`pickup-row-opens-order.spec.ts` so the next sweep does not "fix" it into a
defect.

One nit, deliberately left: the 2rem `select` track is a painted `aria-hidden`
span with nothing wired to it — `display/workbench.md`'s "real selection OR a
collapsed gutter, never an inert one". Collapsing it is **not** a local edit:
`grid-column-tier.guard.test.ts` requires every registered column model to lead
with `select` (the frozen identity pane must be a contiguous prefix starting
there), so removing it is a change to that contract. Leave it until a surface
actually needs a pickup bulk plane.

### 4.3 The orders grid still has its own checkbox
`OrdersQueueTableRow` inlines the same 16px gutter button `GridRowCheckbox` now
owns (it is where the pattern was copied FROM). Migrating it removes the last
duplicate and drops a raw-button escape. Low risk, but that file is large and
frequently touched — do it as its own change, not as a rider.

### 4.4 Rows inside `role="table"`
Receiving leaf rows claim `role="button"` while sitting inside LedgerGrid's
`role="table"`. An element has one role, and a table whose rows are buttons has
no rows. `OrdersQueueTableRow` already solved this (`inTable` → `role="row"` +
`aria-selected`); receiving rows need `rowIndex` threaded through the group-row
layer to follow. Pre-existing, orthogonal to the click planes, worth doing.

### 4.5 The receiving pipeline board never got the gutter

`ReceivingLinesTable`'s board branch renders `ReceivingLineOrderRow` with
`onSelect` only — no `onToggleSelect` — while `rowClickOpens` is on for History /
Incoming / Unbox. So under `STATION_PIPELINE_BOARDS` + `?layout=board` the row
opens and the checkbox is painted, i.e. bulk is unreachable there. Testing's
board took the two-line fix in §4.1; do the same one for receiving. The flag is
off by default (`NEXT_PUBLIC_STATION_PIPELINE_BOARDS`), which is why it has not
bitten anyone.

### 4.6 `?staff=all` cannot survive a page load

Found while measuring §4.1, and it is why the Testing History spec skips on
dogfood. `useStaffFilter({ allToken: 'all' })` writes the literal `?staff=all`
for "All staff", and `TestingHistoryList` reads exactly that string
(`explicitlyAll`) to drop the tester scope. But the ambient param contract
declares `staff: paramPositiveInt` (`lib/routing/route-params.ts`), so the
boundary strips `all` before any component sees it — the URL rewrites itself back
to a tester-scoped view mid-load. Observed: the un-scoped request fires, returns
rows, and the render still shows "No tested lines in this staff scope yet."

Not fixed here on purpose — `staff` is carried by every workbench route
(`WORKBENCH_CARRIES`), so widening its vocabulary is a param-contract change with
its own guard (`param-ownership.guard.test.ts`), and §6 is explicit about what
renaming a param vocabulary in passing costs. Either widen the schema to accept
the all-token or have the surfaces express "all" as the param's ABSENCE — but
pick one deliberately, for every `allToken` consumer at once (Shipping History is
the other).

---

## 5. Key files

```
src/components/station/useReceivingRowSelection.ts    rowClickOpens · openRow · recordViewOnOpen · selectionScope · handleToggleRow
src/components/tech/TestingHistoryList.tsx            the second consumer of that hook (was a private copy)
src/components/station/ReceivingLinesTable.tsx        isHistorySurface / isUnboxWorkbench — the surface flags
src/components/ui/GridRowCheckbox.tsx                 the one gutter control (tri-state)
src/components/dashboard/workbench-shell.tsx          withScopeDivider
src/utils/unbox-workspace-state.ts                    UI ⇄ wire tab vocabulary (the seam)
src/components/receiving/workspace/ReceivingLineWorkspace.tsx   required `recordView`
src/components/sidebar/receiving/receiving-sidebar-shared.ts    readSelectLineDetail → recordView
src/lib/receiving/unbox-metrics.ts                    metric `modes:` are TAB ids — see §6
```

---

## 6. Traps that already cost time here

- **Renaming a value to a name already in use.** `unbox-metrics.ts` declared
  `modes: ['recent']` for three HISTORY metrics and `['viewed']` for two RECENT
  ones. A blind `viewed → recent` replace silently moved all five onto Recent
  and emptied the History KPI. tsc cannot see it — the literals stay valid.
  **Screenshot the surface after any vocabulary rename.**
- **A second private copy of a URL contract.** `useReceivingMode.ts` re-derived
  `?unboxview=` with its own union, parse and write. Survivable while both
  agreed; a live bug the moment the vocabularies diverged. It reads the SoT now
  — check for siblings before renaming any param vocabulary.
- **`count()` does not auto-wait.** Two specs skipped on tenants that
  demonstrably had rows because they counted straight after the fetch. Wait for
  `.first()` to be visible, then decide. Same for a count badge that arrives on
  its own query — poll, don't read once on paint.
- **"Which edge" needs a measurement.** Divider placement is asserted by
  comparing bounding-box x against the tabs either side; a class assertion
  cannot tell left from right.
- **Never start/restart the dev server.** The user's runs on `:3050`
  (`workflow-safety.md`). Attach; a broken server is a report, not a repair.

---

## 7. Known red, NOT owned by this thread

**The tree is edited concurrently.** During this work HEAD advanced several
times and `npm run verify` swung between fully green and four reds *without any
change of mine* — a half-applied `getLast4 → getLast8` rename, new untracked
files not yet wired, a doc-catalog regeneration. Before assuming a red is yours:

```bash
git status --porcelain -- <the file named in the failure>
```

A file that is untracked (`??`) or modified but outside your diff is someone
else's in-flight work. Run the failing gate over **your** files
(`npx eslint <paths>`, `npx tsc --noEmit | grep <your files>`) and report the
rest rather than absorbing or silently fixing it (`verify.md` says exactly
this).

Standing, verified as not-ours:

1. **Lint — `src/lib/documents/ensure-outbound-docs.ts:122`**, a bare
   `console.info` (`no-console` allows warn/error only). Committed in
   `baa2243e0`. One line, another session's file.
2. **`getByRole('complementary')` E2E anchors.**
   `receiving-tech-modes.spec.ts` (5 cases) + `receiving-param-isolation.spec.ts`
   (2) fail at their first gate. That element no longer exists on those routes:
   `ContextPanelLayout` renders no `<aside>`, and `SidebarNavColumn`'s is
   `role="navigation"` behind `everOpened` (the spine defaults closed). The only
   `role="complementary"` left is the sidebar error-boundary fallback. One
   anchor swap per spec. **Note the Recent-pill rename inside
   `receiving-tech-modes.spec.ts` is already applied and correct** — that spec
   just cannot reach it until the anchor is repaired.
3. **knip, intermittently** — findings in `icons/nav.tsx`, `MyDayKpiStrip.tsx`,
   `command-bar-nav-groups.ts` (the last two untracked as of 2026-08-01). They
   come and go as that session wires them up.

Standing as of the §4.1 pass (all four verify reds, none in the files above):

4. **`src/hooks/useOutboundQueueKeyboard.ts` is DELETED in the working tree
   while three committed files still import it** — `PackedOrdersTable.tsx`,
   `DashboardShippedTable.tsx`, `UnshippedShelfBoard.tsx`. That session's
   replacement (`src/hooks/useOrderRailSelection.tsx`, untracked) is not wired
   up yet. It fails typecheck AND knip (`[unresolved]` ×3), and — because it is
   a client-graph break — **it 500s every route on the dev server**, so E2E
   cannot run at all while it is mid-flight (`global-setup` fails at signin).
   Not a thing to repair: `git status --porcelain -- src/hooks` shows the `D`.
5. **Lint** picked up a second file: `PackChecklistLineRow.tsx:5` unused
   `AnimatePresence` (modified, another session), beside the standing
   `ensure-outbound-docs.ts` `console.info` above.
6. **knip** now reports 11 new findings, all in other sessions' in-flight files
   (`overlay-stack/store.ts`, `useRecordCursorKeyboard.ts`, the
   `procedure-receipt*` / `serial-identify` / `confirm-contents` types, plus the
   three unresolved imports from #4).

Route-permission drift also flickered red mid-session and went green on its own
once that session ran `--emit` — the same "run the gate over YOUR files first"
rule applies to it.

---

## 8. QA-org fixture gaps (specs skip, they do not fail)

`pnpm provision:qa-org` seeds Incoming (2 POs), Receiving, Orders, and — added
for §4.1 — two Testing lines on the existing QA carton:

- `QA_FIXTURE_TESTING_LINE` (`QA-MOCK-LINE-3`) — received + `needs_test`, so the
  Testing **Pending** tab (`view=needs-test`) has rows. Un-tester-scoped, so any
  QA admin sees it.
- `QA_FIXTURE_TESTED_LINE` (`QA-MOCK-LINE-4`) — plus a `testing_results` verdict
  attributed to the **QA admin**, so the Testing **History** tab has rows. The
  attribution is load-bearing: History defaults to the signed-in tester and
  `?staff=all` cannot rescue it (§4.6).

Their own lines, not mutations of `QA-MOCK-LINE-1`/`-2`, which carry the
note-vs-label grain walk and the receive-to-Zoho burn. The idempotent wipe now
deletes `testing_results` **before** the lines it references — that FK is
`ON DELETE SET NULL`, so without it every re-provision left an orphan verdict.

Still missing, so these cases skip on `qa-desktop` and only assert on dogfood:

- **Repair rows** → `queue-inspector-non-modal.spec.ts` Repair case
- **Unbox recent-rail rows** → the "rail still records a view" case
- **QA-admin recents** (`receiving_line_views`) → the Recent count badge case
- **A return-flagged carton** (`receiving_carton.is_return`) →
  `testing-history-opens-line.spec.ts` Returns case
- **LCPU pickup orders** → `pickup-row-opens-order.spec.ts`

Seeding them is the `verify.md`-sanctioned fix (extend `qa-org.ts` +
`scripts/provision-qa-org.ts`); skipping around them is not.

**The mirror gap is dogfood's.** `testing-history-opens-line.spec.ts` skips all
four cases on `--project=desktop`: the signed-in admin is not a tester on that
tenant (all 164 tested lines belong to tester 1), Pending/Returns are genuinely
empty, and §4.6 blocks the all-staff escape. The dogfood numbers in §4.1 were
measured with an explicit `?staff=1`. Fixing §4.6 makes that spec assert on both
tenants.

---

## 9. Verify

```bash
pnpm provision:qa-org
npx playwright test tests/e2e/unbox-feed-opens-carton.spec.ts \
  tests/e2e/history-row-opens-carton.spec.ts \
  tests/e2e/queue-inspector-non-modal.spec.ts \
  tests/e2e/incoming-click-to-open.spec.ts \
  tests/e2e/testing-history-opens-line.spec.ts \
  tests/e2e/pickup-row-opens-order.spec.ts \
  tests/e2e/home-scope-divider.spec.ts --project=qa-desktop
npm run verify
```

E2E asserts against the QA org (`verify.md`); `--project=desktop` runs the same
specs against the dogfood tenant, which is where the row-count-dependent cases
actually exercise. Never raise a DS-ratchet baseline to pass.

---

## 10. Prompt the next agent can paste

```
Continue docs/todo/collection-click-planes-HANDOFF.md.

The contract in §2 is settled — do not re-litigate the two planes, the
recordView grain, the Recent/viewed vocabulary split, or the one-hairline strip
grammar. Read §6 before any rename. §4.1 and §4.2 are closed; do not re-open
them (Pickup is correct AS-IS, and its inert select gutter is not a local fix).

Pick up at §4.6 (`?staff=all` dies at the param boundary) — it is the one that
unblocks a real assertion, since it is why the Testing spec skips on dogfood.
Decide for EVERY allToken consumer at once (Shipping History is the other):
widen the schema, or express "all" as the param's absence. Then §4.5 (the
receiving board's missing gutter, two lines, same shape as Testing's), then
§4.3 / §4.4.

Measure before and after on the dogfood tenant (attach to :3050, never start a
server): row role, gutter checkbox count, receiving-select-line events, and any
POST /api/receiving-lines/view. Run new specs on qa-desktop AND desktop, and if
one skips on either tenant, seed the fixture (§8) rather than shipping the skip.

The reds in §7 are not yours — report them, do not fix them silently. #4 in
particular breaks the dev build tree-wide, so E2E cannot run while it is
mid-flight; check `git status --porcelain -- src/hooks` before blaming your own
change for a 500.
```
