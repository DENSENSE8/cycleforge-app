# Multi-line orders plan

Staff pack one marketplace order that holds many products. The program keeps `orders` as a line table, groups those lines on the desk, and folds tracking so one shipment can cover two products. The rule is Order is the band, Line is the row, Shipment is the fold. The stack is PR-0, PR-1, PR-2, PR-3a, then PR-3b.

## How to read this

One box is one unit of work. Every box names the evidence that checks it. A nested box is a sub-step of the box above it. Check a box only when its evidence exists, a file, a log line, a screenshot, a test run, or a SHA. The body is a how-to. The appendices explain and record.

The program runs `pstack/skills/poteto-mode/playbooks/autopilot-stack.md`. The operator lands every PR. Owners stop at merge-ready. PR-1, PR-3a, and PR-3b wait for her review in chat.

Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

## Program checklist

### Arm the program

- [ ] State the protocol and this plan to the operator, then stop. Start execution only on her explicit go.
- [ ] On her go, arm a `/goal` with this exact text. "docs/todo/multi-line-orders-PLAN.md. PR-0, PR-1, PR-2, PR-3a, PR-3b. Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. The operator lands. Done when one person can open one marketplace order, see five item lines, expand and collapse the shipment folds, and see one tracking cover two products."
- [ ] Read these from trunk at program start. Re-read them at every tick.
  - [ ] `git show origin/main:pstack/skills/poteto-mode/playbooks/autopilot-stack.md`
  - [ ] `git show origin/main:pstack/skills/swarm/SKILL.md`
  - [ ] `git show origin/main:pstack/skills/control-ui/SKILL.md`
  - [ ] `git show origin/main:pstack/skills/poteto-mode/playbooks/opening-a-pr.md`
  - [ ] `git show origin/main:pstack/skills/show-me-your-work/SKILL.md`
  - [ ] `git show origin/main:.claude/skills/db-migrate/SKILL.md`
- [ ] Arm the 30-minute audit tick. In a local session, a real terminal `/loop`. In a cloud root, a cloud-sleeper wake chain. Never leave the cadence to memory.
- [ ] Use this tick prompt, verbatim. "Re-read the execution playbook from trunk and the armed /goal. Audit the operation against both and fix drift in this tick. Probe every active lane and judge progress by side effects only. Stand down a stuck lane and dispatch its replacement now. Then send the operator a status message, whether or not anything changed, with the queue table of PR, owner, state, and head SHA, the verdicts since the last tick, what merged, open operator gates, and blockers."
- [ ] On the operator's hold or stand-down, send every owner a zero-writes order at once.

### Spawn owners

- [ ] Spawn one owner per PR with the full lifecycle the execution playbook names.
- [ ] Follow this dependency graph. Start dependent work only after its parent merges, or base it on the parent branch when the execution playbook stacks.
  - [ ] PR-0 is first. It branches from `main`.
  - [ ] PR-1 after PR-0.
  - [ ] PR-2 after PR-1.
  - [ ] PR-3a after PR-2.
  - [ ] PR-3b after PR-3a.
- [ ] Hold the file boundaries. PR-0 touches only the migration SQL and the matching Drizzle `orders.externalLineId` column. PR-1 touches only the seed and the QueueGroupRow parent chrome needed to paint more than one leaf. PR-2 touches only ingest grouping, writers, and connector adapters. PR-3a touches only the shipment fold bracket. PR-3b touches only chevron, FoldState, and the design-mcp gutter rule.
- [ ] Hold the review gate. PR-1, PR-3a, and PR-3b change an interaction. They wait for the operator's review in chat with screenshots and a video before merge.

### PR mechanics, for every PR

- [ ] Resolve the forge once. Default to `gh`; if `command -v origin` succeeds and Origin can resolve the repository, use `origin pr` for every PR operation. Record any fallback to `gh`. Never require `gt`.
- [ ] Open the PR ready, never draft, with `origin pr create --status open --base <base-branch>` or `gh pr create --base <base-branch>` according to the resolved forge. A stack child targets its parent branch.
- [ ] Run the repo's lint and typecheck once before the PR-facing push. Push with hooks on.
- [ ] Run `/deslop` before each commit and `/no-comments` before review.
- [ ] Triage every Bugbot and security-reviewer comment per `../references/bugbot-triage.md`.
- [ ] Rebase onto current trunk before babysit and again before the merge-ready report.

### Verdict and merge, for every PR

- [ ] At the merge-ready head SHA, run the swarm per `pstack/skills/swarm/SKILL.md`. One gates lane. The ten live lanes from the PR's **Verify, live** block. The perf lane from its **Verify, perf** block. One audit lane that reads the diff and the receipts and distrusts the PR body.
- [ ] Clean only when every lane is `PASS`. Findings go back to the owner. A new head gets a fresh swarm and a fresh verdict.
- [ ] The root appends the PR to the base-branch stack. The operator lands it bottom-up. Before land, compare the stable `git patch-id` of the base-to-head diff at the verdict SHA with the current base-to-head diff. An unchanged patch-id keeps the code verdict. A changed patch goes back through swarm. Re-run mergeability and CI after every rewritten push.

### Boot recipe, for every live lane

Each live lane runs on its own cloud VM at the PR head. Drive through `control-ui` or `control-cli` from `cursor-team-kit`.

- [ ] `git fetch origin <head-branch> && git checkout <head SHA>`.
- [ ] Start the app with `pnpm dev`. Wait until the local origin answers. For PR-0, skip the browser and drive `npm run db:migrate:dry` then `npm run db:migrate` through `control-cli` after the operator types apply.
- [ ] Deliver input only through the control skill's commands. Name the read-only diagnostics. For the desk, use `control-ui`. For migrate, use `control-cli` and the dry-run SQL print.
- [ ] Save every screenshot to `/tmp/swarm-<pr-id>/worker-<n>/<slug>.png` and return the paths with the report.

## Apply the line-identity migration (PR-0)

**Depends on.** None.

**Files.**

- [ ] Edit `src/lib/drizzle/schema.ts` only for `orders.externalLineId` and `idx_orders_unique_org_account_order_line`.
- [ ] Create `src/lib/migrations/2026-09-04_orders_multi_line_identity.sql` if it is still untracked. Do not rewrite it after apply. Applied files are immutable.
- [ ] Delete nothing.

**Build.**

- [ ] Land the untracked SQL as written. Add the Drizzle column that matches it. Do not change ingest writers in this PR. Stop mid-ingest WIP first. Isolate or revert `canonical-order.ts`, `ingest-canonical-orders.ts`, `amazon/order-sync.ts`, and `ebay/sync.ts` so they do not ride this PR.

**You see.**

- [ ] `npm run db:migrate:dry` prints `2026-09-04_orders_multi_line_identity.sql`. After the operator types apply, `schema_migrations` holds that filename. `pg_indexes` shows `idx_orders_unique_org_account_order_line`. The old `idx_orders_unique_account_order` is gone.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Read the SQL file and confirm `ADD COLUMN IF NOT EXISTS`, the new unique index, and `DROP INDEX IF EXISTS idx_orders_unique_account_order`. Run no product test suite for this PR.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `grok-4.6-fast-xhigh` at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Run the dry-run at trunk and head. Trunk lacks this file. Record that. Gate that head lists the file and that apply creates the index plus the column. Save `pr-0-trunk-dry.png`. Pass when the head dry-run names the file and trunk does not.
- [ ] Lane 2. Dry-run prints the ADD COLUMN and the new index before anyone types apply. Save `pr-0-dry-sql.png`. Pass when the printed SQL matches the file and the runner has not applied yet.
- [ ] Lane 3. After apply, dry-run reports that file as already recorded. Save `pr-0-dry-empty.png`. Pass when the filename is absent from pending.
- [ ] Lane 4. Query `pg_indexes` for `idx_orders_unique%`. Save `pr-0-indexes.png`. Pass when the org-account-order-line index exists and the old account-order index does not.
- [ ] Lane 5. Query `information_schema.columns` for `external_line_id`. Save `pr-0-column.png`. Pass when the column is `text`, not null, default `''`.
- [ ] Lane 6. Count collisions under `(organization_id, order_id, account_source, '')`. Save `pr-0-collisions.png`. Pass when the count is 0.
- [ ] Lane 7. Re-run `npm run db:migrate` on the same database. Save `pr-0-idempotent.png`. Pass when the second apply is a no-op.
- [ ] Lane 8. Confirm Drizzle `orders.externalLineId` maps to `external_line_id`. Save `pr-0-drizzle.png`. Pass when schema.ts and the live column agree.
- [ ] Lane 9. Confirm ingest files from the cancelled Layer 2 attempt are not in this diff. Save `pr-0-diff-scope.png`. Pass when `git diff` against the parent has no `groupCanonicalOrderLines` rewrite.
- [ ] Lane 10. Confirm `/db-migrate` was used. Dry-run first. The operator typed apply. Save `pr-0-gate.png`. Pass when the chat shows that word and the apply log follows it.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Wall time of `npm run db:migrate:dry` at trunk and at head, plus head apply time for this one file.
- [ ] Probe. Run the dry-run at trunk, then at head, interleaved. Then apply once at head. Both sides must print the dry-run.
- [ ] Baseline. Record the trunk dry-run duration first.
- [ ] Rule. Head dry-run must finish within 2x trunk. Head apply of this file must finish under 30 seconds on the dogfood database. Fail if apply exceeds 30 seconds or if the dry-run hangs.

**Review gate.** None. PR-0 is not review-gated.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged.
- [ ] The root appends it to the base-branch stack and the operator lands it bottom-up.

## Seed a five-line order and confirm parent chrome (PR-1)

**Depends on.** PR-0.

**Files.**

- [ ] Edit `src/components/dashboard/orders-queue/QueueGroupRow.tsx` only if parent chrome is still missing on the branch after isolate.
- [ ] Create a seed that inserts five `orders` rows that share one `order_id` and five distinct `external_line_id` values, plus the `shipment_links` the desk reads.
- [ ] Delete nothing.

**Build.**

- [ ] Insert one marketplace order with five different products by SQL. Do not wait for ingest. Confirm `QueueGroupRow` paints parent chrome when `group.rows.length > 1`.

**You see.**

- [ ] On the orders desk, one order chip sits above five product leaves. The parent shows a line count of 5. Singleton orders nearby stay a single leaf.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `src/components/dashboard/orders-queue/QueueGroupRow.test.ts` gains a case with five leaves. Run `node --import tsx --test src/components/dashboard/orders-queue/QueueGroupRow.test.ts`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `grok-4.6-fast-xhigh` at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Open the same desk at trunk and head. Trunk cannot store five lines under one account_source. Record that. Gate that head shows parent chrome plus five leaves. Save `pr-1-trunk-vs-head.png`. Pass when head shows the parent and five leaves and trunk cannot.
- [ ] Lane 2. Seed the five-line order. Reload the desk. Save `pr-1-five-leaves.png`. Pass when five product titles are visible under one order number.
- [ ] Lane 3. Confirm the parent chrome `data-order-group-parent` is in the accessibility tree. Save `pr-1-parent-chrome.png`. Pass when that node exists only for the multi-line group.
- [ ] Lane 4. Confirm a one-line neighbor stays a plain leaf with no parent chrome. Save `pr-1-singleton.png`. Pass when that order has no `data-order-group-parent`.
- [ ] Lane 5. Toggle the group checkbox. Save `pr-1-group-select.png`. Pass when all five line ids select and deselect together.
- [ ] Lane 6. Confirm the mixed checkbox state when two of five are selected. Save `pr-1-mixed.png`. Pass when the parent checkbox is mixed.
- [ ] Lane 7. Search the marketplace order number. Save `pr-1-search.png`. Pass when the five leaves remain grouped after search.
- [ ] Lane 8. Resize to a packed desk width. Save `pr-1-narrow.png`. Pass when the parent and five leaves still paint without overlap that hides a title.
- [ ] Lane 9. Confirm ingest was not required. Save `pr-1-seed-only.png`. Pass when the rows exist from the seed SQL and no connector sync ran.
- [ ] Lane 10. Run `pnpm run eval:cohort slot-table` after the display edit. Save `pr-1-eval.png`. Pass when the cohort reports ok.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Time from desk navigation to first paint of the seeded group, trunk and head. Also isolate the extra parent chrome work the diff adds.
- [ ] Probe. Open the desk at trunk, then at head, interleaved, with the same login. Measure with `control-ui` performance. Both sides must produce the metric.
- [ ] Baseline. Record the trunk desk first-paint first.
- [ ] Rule. Head first-paint of the desk must stay within 20 percent of trunk. The parent chrome for five leaves must add under 50 ms. Fail if either budget breaks.

**Review gate.** The operator reviews before merge.

- [ ] Copy lane 2 screenshots into `docs/todo/media/PR-1-review-five-leaves.png`.
- [ ] Record a 30 to 60 second video of the change on a lane VM. Save it as `docs/todo/media/PR-1-review.mp4`.
- [ ] Post the screenshots and the video in chat. Stop at merge-ready. Wait for the operator's click.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged.
- [ ] The root appends it to the base-branch stack and the operator lands it bottom-up.

## Re-key ingest onto line identity (PR-2)

**Depends on.** PR-1.

**Files.**

- [ ] Edit `src/lib/orders/canonical-order.ts`. Re-key `groupCanonicalOrderLines` to `(externalOrderId, externalLineId)`.
- [ ] Edit `src/lib/orders/ingest-canonical-orders.ts`. Write `external_line_id`. Keep `collapseDuplicates` on the same line only. Keep one `work_assignments` TEST row per marketplace order, not per line row.
- [ ] Edit Amazon, eBay, Shopify, Square, ShipStation, Ecwid, and Sheets adapters so every INSERT that claims `ON CONFLICT (organization_id, order_id, account_source, external_line_id)` also writes that column.

**Build.**

- [ ] Change `groupCanonicalOrderLines` so five products on one marketplace number stay five `CanonicalOrder` values. Downstream customer matching and shipment links follow the line. Deadlines stay one assignment per order band.

**You see.**

- [ ] A connector sync of a five-item order inserts five `orders` rows that share `order_id` and differ on `external_line_id`. A second sync does not multiply them.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `src/lib/orders/canonical-order.test.ts` covers five lines, duplicate same-line fold, and blank order drop. Run `node --import tsx --test src/lib/orders/canonical-order.test.ts src/lib/orders/ingest-canonical-orders.ts`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `grok-4.6-fast-xhigh` at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Sync the same five-item fixture at trunk and head. Trunk folds by `externalOrderId` and stores one row. Record that. Gate that head stores five rows and a second sync stays at five. Save `pr-2-trunk-vs-head.png`. Pass when head count is 5 and trunk count is 1.
- [ ] Lane 2. Ecwid or Sheets already emits lines. Sync one five-item order. Save `pr-2-ecwid-lines.png`. Pass when five `external_line_id` values persist.
- [ ] Lane 3. Shopify, Square, or ShipStation still summarize today. After the adapter change, sync a multi-item order. Save `pr-2-summarizer.png`. Pass when those sources emit one row per line, not one summary row.
- [ ] Lane 4. Amazon writer path. Save `pr-2-amazon.png`. Pass when `OrderItemId` lands in `external_line_id` and ON CONFLICT hits the new index.
- [ ] Lane 5. eBay writer path. Save `pr-2-ebay.png`. Pass when `lineItemId` lands and a retry does not insert a sixth row.
- [ ] Lane 6. `collapseDuplicates` on two sheet rows of the same listing. Save `pr-2-collapse.png`. Pass when siblings of different listings survive and the true duplicate is gone.
- [ ] Lane 7. Customer matching. Save `pr-2-customer.png`. Pass when five lines share one `customer_id`.
- [ ] Lane 8. `work_assignments`. Save `pr-2-assignment.png`. Pass when one OPEN TEST row exists for the marketplace order, not five.
- [ ] Lane 9. Re-sync with a new tracking on two of five lines. Save `pr-2-tracking-union.png`. Pass when those two lines pick up the tracking and the untracked siblings stay untracked.
- [ ] Lane 10. Confirm no desk chrome changed in this PR. Save `pr-2-no-ui.png`. Pass when the diff has no `src/components` files.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Ingest wall time for a 50-order batch that includes five 5-line orders, trunk and head. Also isolate the extra per-line writes the diff adds.
- [ ] Probe. Run the same fixture ingest at trunk, then at head, interleaved. Both sides must print a duration.
- [ ] Baseline. Record the trunk ingest duration first.
- [ ] Rule. Head must stay within 2x trunk on the unlike shape. The extra per-line writes for 25 new rows must finish under 2 seconds. Fail if either budget breaks.

**Review gate.** None. PR-2 is not review-gated.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged.
- [ ] The root appends it to the base-branch stack and the operator lands it bottom-up.

## Fold lines under the shipment bracket (PR-3a)

**Depends on.** PR-2.

**Files.**

- [ ] Edit `src/components/dashboard/orders-queue/useOrdersQueueRows.ts` so the inner fold key is the shipment, while the band stays the marketplace order number.
- [ ] Edit `src/components/dashboard/orders-queue/QueueGroupRow.tsx` so parent chrome is the tracking bracket, not a second order band.
- [ ] Edit `src/lib/orders/order-group-identity.ts` if unique tracking facts must follow the new fold.

**Build.**

- [ ] Make Shipment the fold bracket via `shipment_links`. Keep Order as the day or urgency band. Do not add an order-header table. Do not reason from `shipment_id` alone. `order-grain-sql.ts` already warns that many orders can share one carton, and that sibling lines that share a tracking trip the same smear.

**You see.**

- [ ] Two products that share one tracking sit in one fold. A third product on a second tracking sits in a second fold under the same order band. Expand and collapse act on the shipment, not on the order number.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `src/lib/group-rows.test.ts` and `src/lib/orders/order-group-identity.ts` tests cover one order, two shipments, five lines. Run `node --import tsx --test src/lib/group-rows.test.ts src/lib/orders/order-group-identity.ts src/components/dashboard/orders-queue/QueueGroupRow.test.ts`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `grok-4.6-fast-xhigh` at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Open the seeded five-line order at trunk and head. Trunk groups only by `order_id`. Record that. Gate that head groups by shipment inside the order band. Save `pr-3a-trunk-vs-head.png`. Pass when head shows two shipment folds under one order and trunk does not.
- [ ] Lane 2. One tracking covers two products. Save `pr-3a-shared-tracking.png`. Pass when those two leaves share one tracking parent.
- [ ] Lane 3. A second tracking on the same order. Save `pr-3a-second-shipment.png`. Pass when a second fold exists under the same order band.
- [ ] Lane 4. An untracked sibling stays out of a tracked fold. Save `pr-3a-untracked.png`. Pass when that line is not nested under a tracking it does not have.
- [ ] Lane 5. Two marketplace orders that share one carton do not smear into one fold. Save `pr-3a-carton-smear.png`. Pass when each order band stays distinct. This is the `order-grain-sql.ts` converse.
- [ ] Lane 6. `box_seq` is not used as the fold key. Save `pr-3a-not-box.png`. Pass when Box is absent from the fold identity.
- [ ] Lane 7. Select still works per line and per shipment fold. Save `pr-3a-select.png`. Pass when a fold checkbox selects only that shipment's lines.
- [ ] Lane 8. Design-mcp. Call `ds_contract`, `ds_tokens`, and `ds_critique` before the tsx write. Save `pr-3a-design.png`. Pass when the session stamp is fresh and critique is clean.
- [ ] Lane 9. Run `pnpm run eval:cohort slot-table`. Save `pr-3a-eval.png`. Pass when the cohort reports ok.
- [ ] Lane 10. Graph. `find_symbol` then `impact_analysis` on `QueueGroupRow` and `useOrdersQueueRows`. Save `pr-3a-graph.png`. Pass when impact is cohort-wide and the owner did not treat one desk row as the blast radius.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Time to render a desk page of 100 orders that include 20 multi-line shipment folds, trunk and head. Also isolate the extra fold grouping the diff adds.
- [ ] Probe. Open the same page at trunk, then at head, interleaved. Both sides must produce the metric.
- [ ] Baseline. Record the trunk render time first.
- [ ] Rule. Head page render must stay within 20 percent of trunk. The extra grouping work must stay under 30 ms. Fail if either budget breaks.

**Review gate.** The operator reviews before merge.

- [ ] Copy lane 2 screenshots into `docs/todo/media/PR-3a-review-shared-tracking.png`.
- [ ] Record a 30 to 60 second video of the change on a lane VM. Save it as `docs/todo/media/PR-3a-review.mp4`.
- [ ] Post the screenshots and the video in chat. Stop at merge-ready. Wait for the operator's click.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged.
- [ ] The root appends it to the base-branch stack and the operator lands it bottom-up.

## Restore chevron, FoldState, and the gutter rule (PR-3b)

**Depends on.** PR-3a.

**Files.**

- [ ] Edit `src/components/dashboard/orders-queue/QueueGroupRow.tsx` to paint a disclosure chevron on multi-line shipment folds. Default expanded. The 2026-09-04 reversal that removed the chevron ends here.
- [ ] Edit `src/lib/group-rows.ts` so Orders uses `FoldState` `default-expanded`. Singletons stay chevron-free.
- [ ] Edit `tools/design-mcp/router.json` and the matching refuse rule so disclosure lives in the select gutter, not as a standing keycap or a second mouth.

**Build.**

- [ ] Wire expand and collapse to `FoldState`. Bind the chevron. Do not open a cheat sheet. Do not leave standing keycaps. Call `ds_contract` for disclosure in the gutter before the tsx write.

**You see.**

- [ ] A five-line order loads expanded. Clicking the gutter chevron hides the leaves under the shipment parent. Clicking again shows them. `?` still paints letters on buttons. It does not open a sheet.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `src/lib/group-rows.test.ts` and `src/lib/record-cursor/cursor-model.test.ts` cover default-expanded plus one collapsed shipment fold. Run `node --import tsx --test src/lib/group-rows.test.ts src/lib/record-cursor/cursor-model.test.ts`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `grok-4.6-fast-xhigh` at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Open the five-line order at trunk and head. Trunk has no chevron on this parent. Record that. Gate that head shows a gutter chevron, starts expanded, and collapses on click. Save `pr-3b-trunk-vs-head.png`. Pass when head expands and collapses and trunk cannot.
- [ ] Lane 2. Default expanded on load. Save `pr-3b-default-open.png`. Pass when all five leaves are visible without a click.
- [ ] Lane 3. Collapse one shipment fold. Save `pr-3b-collapsed.png`. Pass when those leaves hide and the parent remains.
- [ ] Lane 4. Expand it again. Save `pr-3b-reopen.png`. Pass when the same leaves return.
- [ ] Lane 5. Chevron sits in the select gutter, not in the identity chip. Save `pr-3b-gutter.png`. Pass when the control is in the gutter column.
- [ ] Lane 6. Singleton orders have no chevron. Save `pr-3b-singleton.png`. Pass when a one-line order has no disclosure control.
- [ ] Lane 7. Record cursor. Collapse, then prev or next into the fold. Save `pr-3b-cursor.png`. Pass when the fold opens and the first child is focused. Navigation stays fold-blind per `flattenRenderOrder`.
- [ ] Lane 8. Staff `?` still reveals letters on buttons and does not open a cheat sheet. Save `pr-3b-hotkey.png`. Pass when no cheat sheet appears from `?`.
- [ ] Lane 9. `ds_adjudicate` refuses a disclosure control that is not in the gutter. Save `pr-3b-router.png`. Pass when a probe diff outside the gutter is refused.
- [ ] Lane 10. Run `pnpm run eval:cohort slot-table` and `pnpm run eval:cohort shortcuts` if hotkey paint changed. Save `pr-3b-eval.png`. Pass when both report ok, or shortcuts is skipped with proof that `?` paint did not change.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Time to collapse and expand one 5-line fold, plus desk first-paint, trunk and head. Also isolate the chevron work the diff adds.
- [ ] Probe. Toggle the fold at head. Measure first-paint at trunk and head, interleaved. Both sides must produce first-paint. Head also produces toggle time.
- [ ] Baseline. Record the trunk first-paint first.
- [ ] Rule. Head first-paint must stay within 20 percent of trunk. Collapse or expand must finish under 50 ms. Fail if either budget breaks.

**Review gate.** The operator reviews before merge.

- [ ] Copy lane 3 screenshots into `docs/todo/media/PR-3b-review-collapsed.png`.
- [ ] Record a 30 to 60 second video of the change on a lane VM. Save it as `docs/todo/media/PR-3b-review.mp4`.
- [ ] Post the screenshots and the video in chat. Stop at merge-ready. Wait for the operator's click.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged.
- [ ] The root appends it to the base-branch stack and the operator lands it bottom-up.

## Close the program

- [ ] Every box above is checked with its evidence.
- [ ] Reply to the operator with the report the execution playbook names. Links to the stack root and tip, a one-line verdict per link, and anything parked.

## Appendix A. Prototype evidence

No prototype ran in the plan-only kickoff. `/workspace/cyc-multi-line-orders-goal-loop.md` was missing. The operator paste is the goal SoT. Product questions already settled. One person, one order, five items, expand and collapse, tracking grouped so one tracking can cover two products. Empirical paint proof is PR-1, not this note. Dirty Layer 2 files exist in the working tree. They stay unstaged in this run.

## Appendix B. Alternatives rejected

An order-header table. Rejected because `orders` is already the line table and `order_id` is the marketplace number. A new header would duplicate identity.

Folding only by `order_id` forever. Rejected because the operator asked for tracking grouped so one tracking covers two products. Shipment is the fold. Order is the band.

Folding by `shipment_id` on `orders` alone. Rejected because `order-grain-sql.ts` shows many orders sharing one carton. `shipment_links` is the linkage SoT.

Applying the migration without dry-run. Rejected by `.claude/skills/db-migrate/SKILL.md`. Phase 0 is that gate.

Landing ingest before a seeded paint. Rejected because a five-line seed proves `QueueGroupRow` without waiting on every connector.

Autopilot-full. Rejected because the work is sequenced and the operator keeps landing authority, including the apply word.

Reverting every dirty file blindly. Rejected because QueueGroupRow parent chrome is display work PR-1 needs. Isolate ingest writers. Keep or restage chrome on the PR-1 branch.

## Appendix C. Risks

pstack skills are not in this repo's `origin/main`. The `git show origin/main:pstack/...` boxes will fail until owners read the plugin tree instead. Watch this on PR-0.

The SQL file is untracked. Drizzle already has the column in a dirty `schema.ts`. If PR-0 lands SQL without isolating ingest, a half-writer can hit the new index and fail. Isolate before Phase 1.

`work_assignments.entity_id` is `orders.id`. Five lines can create five TEST rows unless PR-2 keys the assignment on the marketplace order.

Shopify, Square, and ShipStation still summarize. If PR-2 forgets those adapters, the desk will keep looking like one row per order for those channels.

`control-ui` from `cursor-team-kit` is not in this working tree. Live lanes must still drive the desk. Treat a missing control skill as a boot failure, not a skip.

Do not reconstruct the deleted house-law corpus. Warehouse OS docs in `docs/warehouse-os/` are the plan of record.

## Appendix D. Links and reading list

Read `docs/warehouse-os/` before any UI PR. Read `.claude/skills/db-migrate/SKILL.md` before PR-0. Read `src/lib/orders/order-grain-sql.ts` before PR-3a. Read `src/lib/keyboard/shortcut-display-cohort.ts` before PR-3b if `?` paint moves.

PR-3a and PR-3b get `pstack/skills/how/SKILL.md` and `pstack/skills/interrogate/SKILL.md` because they change the fold model.

The trail is `docs/todo/multi-line-orders-decisions.tsv` per `pstack/skills/show-me-your-work/SKILL.md`.

Graph before shared edits. `find_symbol` then `impact_analysis`. Slot-table display eval is `pnpm run eval:cohort slot-table`. Ingest is not UI. design-mcp is required for Layer 3 only.

## Appendix E. Phase 0 apply migration

Next paste, named exactly Phase 0 apply migration.

```
Phase 0 apply migration

Follow docs/todo/multi-line-orders-PLAN.md PR-0.

DO
- Isolate cancelled Layer 2 ingest WIP. Do not commit canonical-order.ts,
  ingest-canonical-orders.ts, amazon/order-sync.ts, or ebay/sync.ts on this PR.
- Commit src/lib/migrations/2026-09-04_orders_multi_line_identity.sql and the
  matching Drizzle orders.externalLineId column only.
- Use /db-migrate. Run npm run db:migrate:dry. Show the SQL. Stop.
- Wait until the operator types apply. Then npm run db:migrate.
- Re-run the dry-run. Expect this file gone from pending.

DO NOT
- Implement ingest, seed, or QueueGroupRow in this paste.
- Run db:push.
- Apply without the dry-run print and the apply word.
- Open a PR unless the operator's go on the multi-line program has started.
```
