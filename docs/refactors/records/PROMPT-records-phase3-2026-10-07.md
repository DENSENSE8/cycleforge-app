# Agent prompt — Records Phase 3: clean up the data, finish the sheet, and make Fulfilled render as the Records sheet

> Paste everything below the line into a fresh agent session in
> `/home/michaelgarisek/Projects/cycleforge-lanes/prod`. Written 2026-10-07.
> Earlier briefs: `PROMPT-records-sheet.md` (the original spec) and
> `PROMPT-records-sheet-handoff-2026-10-06.md` (operator rulings — still
> binding). Do not re-litigate any ruling below.

---

Read `AGENTS.md` first and obey it: `:3050` only; lane lifecycle is
operator-only (never start/stop/restart a lane or run `next dev`);
`pnpm verify:fast` before "done"; `ds_contract` / `ds_critique` /
`ds_display_method` on UI work; read `docs/design-system/CONSOLIDATION_LEDGER.md`
before any table action, bottom bar or wrapper.

**The `.env` DSN is the PRIMARY Neon branch (`ep-shiny-hall`) — real USAV
data, also written by the deployed app.** Every migration and every write is
live. Read-only SQL: `set -a; . ./.env 2>/dev/null; set +a;
PGOPTIONS='-c default_transaction_read_only=on' psql "$DATABASE_URL_UNPOOLED" -X -A -c "…"`.
Apply migrations one at a time with
`node --env-file=.env scripts/run-pending-migrations.mjs --only <file>`; it
refuses when an earlier file is pending (`2026-10-06d_order_list_removals.sql`
is another lane's and still pending — name new files to sort before it only
when there is no ordering dependency, otherwise wait). Browser test writes:
pick a record you can restore, restore it, and report both the write and the
restore.

**Other sessions edit this worktree at the same time.** Re-read a file before
patching it; never stage, stash or check out anything you did not write.
Many shared files (`PastedListSheet.tsx`, `pasted-list-table.ts`,
`schema.ts`, `pages.ts`, `contexts.ts`, `route-tree.ts`) carry other
sessions' uncommitted hunks. Commit your hunks only: build the staged blob
from `git show HEAD:<file>` + your edits (`git update-index --cacheinfo`, or a
filtered `git apply --cached`), export with
`git checkout-index -a --prefix=/tmp/staged/`, typecheck and run your tests
there, then `git commit` the index.

The standard: **fix each problem at its root, make every place that touches
it consistent, and leave the code simpler than you found it.** A second way
of doing something is not a fix — delete it, or record it in
`docs/design-system/consolidation-ledger.json` with an exit criterion.

## 1. Where things stand (commits on `HEAD`)

| Commit | What |
|---|---|
| `1d44fd0aa` | Inbound walk Awaiting tracking → Not received → Unboxed → Received; `resolveInboundInternalStatus` (`src/lib/status/record-status.ts`) |
| `91e2187be` | Slice 6 (applied live): per-line inbound tracking (`shipment_links` owner `RECEIVING_LINE`, `receiving_line.shipment_id`, `stampInboundLineShipment`), `orders.unit_price`, indexes (`idx_orders_org_placed` on `(organization_id, COALESCE(order_date, created_at) DESC, id DESC)`) |
| `1153a8745` | Records sheet `/records`: read `GET /api/nav/records` (`src/lib/nav/records/{params,sql,service,read}.ts`), facet context `records`, writes `/api/records/{tracking,tracking/unlink,order-number,delete,actions}` (`src/lib/records/sheet-actions/`), page `src/components/records/*` on the house sheet `PastedListSheet`; `/search/list` forwards to `/records` |
| `028f803f6` | Polish: every column sorts server-side (`RECORDS_COLUMN_SORTS`), one 24px row height, whole-cell status fill (`RECORD_STATUS_TONE_CLASSES[tone].cell`, black text), "… by" cells = time + staff (`StaffAt`), only columns the loaded rows carry are mounted (`RECORDS_COLUMN_SET.mount`), row cascade removed, range tint as an overlay (fixes the clicked-frozen-cell bleed) |

Measured 2026-10-07: 6-month query = 6,655 lines, 6.8 MB, ~2 s server, ~8.6 s
first paint on `:3050`. 1,820 of the 6-month outbound packages have NO
carrier category (`shipping_tracking_numbers.latest_status_category IS NULL`)
— External is blank for them.

## 2. Operator rulings (binding)

All rulings in the 2026-10-06 handoff §2 stand. Added 2026-10-07:
1. Status cells: the tone fills the whole cell, black text — never a pill.
2. Columns follow intent: a column nobody in the loaded list carries is not
   shown (an all-inbound list has no Ship by / Picked by / Packed by /
   Scanned out by).
3. Every column header sorts.
4. One row height for every row; no row entrance animation.
5. Every "… by" cell shows when (date + time) and who.
6. **Fulfilled renders exactly as a pasted list does.** Whatever Fulfilled
   shows as rows (its sheet layout and its zoomed-in column) is the Records
   sheet: same component, same columns and cells, same Internal | External
   status columns, same selection dock and actions, same keys. No second grid,
   no second row component, no second bulk bar.

## 3. The work, in order — one commit per item

### 3.1 Remove the Fulfilled display fork (ruling 6) — highest priority

Today Fulfilled (`/fulfilled`, `src/components/outbound/fulfilled/FulfilledSheet.tsx`)
has three faces:
- **Board** (default, `src/features/fulfilled-board/FulfilledBoard.tsx`): the
  journey card board, one column per bucket.
- **Column zoom** (`?col=<bucket>`, `FulfilledColumnView.tsx` +
  `column-table/{FulfilledColumnGridRow.tsx,fulfilled-column-table.ts}`): its
  OWN DataTable binding, its OWN row component, its OWN check gutter and
  header bulk bar. ← fork
- **Sheet** (`?layout=sheet`): `PastedListSheet` with `FULFILLED_COLUMNS`
  (`pasted-list-table.ts`) and `FulfilledSheetTools` (grain toggle, optional
  columns). ← second column catalog, no selection dock, no Internal | External

Note: `FulfilledColumnView.tsx` and `column-table/` are UNTRACKED work of
another session (the fulfilled-drilldown lane,
`docs/refactors/fulfillment/HANDOFF-fulfilled-drilldown.md`). Read that
handoff, and before deleting or replacing their files, check
`git log`/`git status` for whether they have landed; if they are still
uncommitted, coordinate through the operator rather than overwrite them.

Do:
1. **One read.** Decide, with evidence, whether Fulfilled's rows come from the
   Records read with a preset query (type `outbound`, axis `shipped`, plus a
   bucket facet) or whether the Fulfilled read (`src/lib/nav/fulfilled/`)
   keeps answering and the Records sheet takes it as a second SOURCE of the
   same `LocatedRecords` + `NavLocateFacts` shape. Prefer one read: move what
   only Fulfilled computes (journey bucket + clock `facts.clock`,
   `promisedAt`, `checkIn`, `lastNote`, `mentionsMe`, `owner`, scan source,
   label cost, attempts, claim window, transit days) into the Records read as
   optional facts and a `bucket` facet, measured with `EXPLAIN (ANALYZE,
   BUFFERS)` read-only, and keep the Fulfilled endpoint only as long as the
   board's cards need it (or make the board read Records too). State the
   choice and why.
2. **One sheet.** The zoomed column and `layout=sheet` both mount
   `RecordsSheet` (extract its core so a host can pass a preset query, a
   title/breadcrumb and Esc-back without forking the body). Fulfilled-only
   facts become Records columns (Clock, Check-in, Last note, …) in
   `RECORDS_COLUMNS`, mounted by the carried-columns rule. The grain toggle
   is the Records grain (`RECORDS_GRAIN_PARAM`), the optional-columns menu is
   the sheet's own column menu if it exists — otherwise the carried-columns
   rule replaces it.
3. **Delete the fork:** `FulfilledColumnView.tsx`, `column-table/*`,
   `FULFILLED_COLUMNS`, `FulfilledSheetTools`' column/grain menus, and the
   `FulfilledColumnGridRow` — every caller migrated, no re-exports. Ledger
   entry for anything you cannot delete yet, with an exit criterion.
4. **The board (L1 card columns) stays** as the default face unless the
   operator says otherwise — it is a different display method (column board,
   `ds_display_method`). Its click-through (zooming into a bucket) lands on
   the Records sheet with that bucket preset. Ask the operator once, with the
   two options, if you believe the board itself should go.
5. Sidebar: Fulfilled's controls/facets/saved views must keep working; where a
   Fulfilled param duplicates a Records one (find, sort, carrier, channel),
   collapse to the Records param and keep old URLs working with a one-way
   param rewrite (`SurfaceParamHygiene` or the page's own redirect).

Acceptance: open `/fulfilled`, zoom a bucket, switch to sheet layout, paste a
list on `/records` — the three are pixel-identical in row height, cells,
status fills, selection dock and keys (screenshots side by side on `:3050`);
`grep` finds no `FulfilledColumnGridRow`, `FULFILLED_COLUMNS` or
`fulfilled-column-table`.

### 3.2 Carrier status coverage (External is blank on 1,820 packages)

1. Root-cause the NULL `latest_status_category` rows by carrier and age
   (read-only SQL), and the "Not polled" USPS bucket
   (`UNTRACKED_BUCKET`, `pasted-list-table.ts`). Report counts per carrier.
2. Fix at the root: the carrier sync must poll every carrier the house ships
   with (find the poller and its carrier allow-list; USPS was excluded), and
   backfill the NULL rows through the same poller (dry run first, rate
   limits honoured). No second status path.
3. Re-measure: NULL category count before → after.

### 3.3 ShipStation 6-month backfill (Phase 1 slice 7, still blocked)

`scripts/shipstation-backfill.ts` is ready (dry run default, `--apply`,
checkpoints, 429-aware). It fails because the stored ShipStation
credentials are encrypted under the PRODUCTION `INTEGRATION_KMS_KEY`, which
Vercel holds as a Sensitive secret (`vercel env pull` returns it masked —
never write a pulled env file to disk and leave it; `shred` it). Ask the
operator for the key once (`.env` `INTEGRATION_KMS_KEY_PREVIOUS`). If it is
supplied: dry run → review counts → `--apply` → re-run
`tsx --env-file=.env --import ./scripts/register-server-only-shim.cjs scripts/data-integrity-coverage.ts`
and report buyer / Placed coverage before → after per platform. If not, mark
it blocked and move on.

### 3.4 Data repairs the sheet now exposes

Each: count it (read-only), fix the WRITER that produced it, then one repair
migration, then re-count.
1. Tracking numbers stored in scientific notation (`4568e+21`, `0214e+21`;
   `SCIENTIFIC_NOTATION_TRACKING` in `src/lib/inbound/inbound-order-draft.ts`
   already detects them) — find every row, recover the true number from its
   source (Zoho PO `reference_number`, the import file's ledger row) where
   possible; list the rest for the operator.
2. Inbound "Placed" is a calendar date but paints as `12:00 AM` — the read
   must carry a date (`YYYY-MM-DD`) for date-only sources and the cell must
   paint a date without a time; Placed sort keeps working.
3. The 72 outbound rows with a blank platform (45 non-channel ids, 27
   second-package rows) — resolve or name each class.
4. Order total: only correct when a ShipStation ref is linked. Make the rule
   explicit per source (ShipStation total; marketplace order total where the
   importer has it; else sum of line totals) and show the source in the
   cell's hover.

### 3.5 Phase 2 loose ends

1. Outbound Delete needs PIN step-up (`orders.void`): wire the house step-up
   flow (find the hook other destructive desk actions use) into the dock's
   Delete so a 403 `STEPUP_REQUIRED` prompts for the PIN and retries.
2. Query-mode "Remove from list" (outbound) is stripped from the committed
   dock until the other lane's `order_list_removals` migration is applied;
   when it is, restore it through that lane's API (`/api/orders/list-removal`).
3. Undo toast lasts ~6 s — use the house undo duration for reversible
   tracking writes, and make sure the undo works after a refetch.
4. Paste mode: the sidebar Window row still reads "Last 30 days" though a
   pasted list has no window — show it as not applied (or hide it) while
   `refs` is set; a spreadsheet's extra text column (e.g. `note`) becomes a
   "Not found" number — drop cells that cannot be an identifier at the
   parser (`parseRefList`), with a test; a carton with no receiving lines is a
   miss — show it as a carton row.
5. `RecordsSelectionDock` working-tree copy differs from HEAD (query-mode
   Remove from list) — reconcile when 3.5.2 lands.

### 3.6 Load speed

6-month load is 6.8 MB / ~2 s server / ~8.6 s first paint. Target: first
screen < 1 s, full window < 3 s. Options to measure (pick by numbers, not
taste): trim the wire (drop `entry.title` duplicating `facts.title`, omit
defaults — the wire already compacts nulls), stream/paginate rows (first page
then the rest; facets from the same read), or cache the read per URL.
Counts must still come from the same builder as the rows.

### 3.7 Saved views and keyboard verbs

Saved views for the views the warehouse works ("Delivered, not unboxed",
"Packed by me today", "Late", "Exceptions") through the house saved-views
mechanism (`NAV_PAGE_DECLS.records.savedViews`, see Purchasing/Fulfilled).
Single-key verbs on a selection — T add tracking, N note, H hold — registered
in the `?` overview and disclosed on hover only (never painted keycaps,
`cf-keys/hotkey-on-hover`).

## 4. Report format

After each item: what was wrong at the root · what is now the one way · what
was deleted · before → after numbers · tests / `verify:fast` output (name
which reds are other sessions') · anything left, with evidence. Browser-check
every UI change on `:3050` and attach the screenshot finding.
