# Agent prompt — Records sheet: finish Phase 1, then build Phase 2

> Paste everything below the line into a fresh agent session in
> `/home/michaelgarisek/Projects/cycleforge-lanes/prod`. Written 2026-10-06 as a
> handoff from the session that did Phase 1 slices 1–6. The original brief is
> `docs/refactors/records/PROMPT-records-sheet.md` — read it; this file records
> what is done, the operator's answers, and what remains. Do not re-litigate
> the operator rulings below.

---

Read `AGENTS.md` first and obey it (`:3050` only; lane lifecycle is
operator-only; `pnpm verify:fast` before "done"; design-system calls). Other
sessions edit this worktree at the same time: re-read a file before patching
it, never stage what you did not write. Many files carry other sessions'
uncommitted hunks — stage your own hunks only (build the staged blob from
`git show HEAD:<file>` + your edits and `git update-index --cacheinfo`, or a
filtered `git apply --cached`), then typecheck the staged tree exported with
`git checkout-index -a --prefix=/tmp/staged/` before `git commit`.

**The `.env` DSN is the PRIMARY Neon branch (`ep-shiny-hall`) — real USAV data,
also written by the deployed app.** Every migration you apply there is live.
Apply with `node scripts/run-pending-migrations.mjs --only <file>`; it refuses
when an earlier file is pending — `2026-10-06d_order_list_removals.sql` is
another lane's and still pending, so name same-day files to sort before it only
when there is no ordering dependency. Read-only SQL: wrap in
`PGOPTIONS='-c default_transaction_read_only=on' psql "$DATABASE_URL_UNPOOLED"`.

## 1. What is done (commits on `HEAD`)

| Commit | Slice | The one way now |
|---|---|---|
| `de5ba71eb` | 1 Platform | `canonicalAccountSource()` — `src/lib/orders/account-source.ts`; every writer; backfill migration |
| `56a48a609` | 2 Buyer | `resolveOrderBuyers()` — `src/lib/orders/resolve-buyer-customers.ts` (channel id › email › phone › this order number's buyer › name › create) |
| `42952e0ac` | 3 Dates | `src/lib/orders/order-dates.ts` — **Placed** (`order_date`) / **Imported** (`created_at`); `shipStationV1Instant()` parses ShipStation v1 in Pacific |
| `eca993dc2` | 4 Picked by | `src/lib/picking/picked-by.ts` — inventory event › picking session › pick scan › serial pull, with `source` |
| `760ea7374` | 5 Status | `src/lib/status/record-status.ts` — outbound/inbound internal + one carrier set, tone, precedence |
| `0a131a6cd`, `462fbcedc` | 1 | `orders_account_source_canonical_chk` dropped then **re-added** (operator: apply now) |

Coverage check: `tsx --env-file=.env --import ./scripts/register-server-only-shim.cjs scripts/data-integrity-coverage.ts`.
After slices 1–6 (org …01): case variants 0; blank platform 72 (45 non-channel
ids, 27 second-package rows); Placed 29%; buyer 30%; Amazon Placed 12% / buyer
19%; plain-`ebay` Placed 4% / buyer 11%.

Ledgered (docs/design-system/consolidation-ledger.json, queued with exit
criteria): `customer-matchers-outside-order-resolver`,
`picker-cell-assignee-actor-fallback`, `status-outbound-ladders`,
`status-desk-stage-pending-id`, `status-inbound-delivery-vocabulary`,
`status-tone-maps`.

Uncommitted leftovers from slices 4–5 that sit inside other sessions' open
work (commit them only with that work): `pickedAt`/`pickedBy: null` in
`purchaseOnlyFacts` (`src/lib/nav/purchases/service.ts`), a picked-by import in
`src/lib/nav/locate/outbound-facts.ts`, one line in untracked
`src/lib/outbound/fulfilled-thread.ts`.

`verify:fast` is red only on other sessions' files (Routes:
`mobile-v2-destinations.tsx`; Ring state: `spine-parent-tone.ts`,
`ListRemovalPicker.tsx`) and `locate/service.test.ts` "FBM locator omits
Exceptions" (route-params work in flight). Report, don't fix, unless they are
yours by then.

## 2. Operator rulings (2026-10-06) — binding

1. Platform CHECK: re-added now (done). A deployed build older than
   `de5ba71eb` will fail inserts for MEKONG/USAV/DRAGON until deploy — tell the
   operator if you see such failures in `order_import_runs`; do not drop it.
2. **Schema changes for slice 6 are approved**, and the operator wants them for
   faster loading and better indexes (see §3B).
3. **Inbound order: Received comes AFTER Unboxed.** Fix `record-status.ts`
   (inbound walk: Awaiting tracking → Not received → Unboxed → Received), its
   tests, and every caller that assumed the other order (paste verdict
   `src/lib/receiving/reconcile.ts`, `src/lib/nav/locate/inbound.ts`). This
   matches the receiving workflow's coarse status (`workflow-stages.ts`).
4. **Colours approved:** Awaiting tracking gray, Not received yellow, Unboxed
   teal, Received green, Out for delivery teal (rest as in the original brief).
5. **Delete exists at every grain**; what it deletes is your call by importance
   — §4.3 below is the decided rule set; implement it.
6. **Identifiers are editable** (tracking number, order number) — change/replace
   through the sheet, at the grain shown.
7. **Mixed inbound + outbound list: two status columns on every row, Internal |
   External.** External comes from the carrier tracking APIs (the
   `shipping_tracking_numbers` status the carrier sync writes, mapped through
   `carrierStatusOfCategory`). When the Type filter is one direction the order
   still reads Internal | External (one rule, no flipping).

## 3. Remaining Phase 1 work

### A. Slice 7 — ShipStation 6-month backfill (blocked on a key)
`scripts/shipstation-backfill.ts` is written and committed: dry run by default,
`--apply` writes through the connector's backfill mode (the same
`ingestCanonicalOrders` path), checkpoints every page in
`shipstation_sync_runs`, honours ShipStation's 429 reset header. Its dry run
failed before any API call: the ShipStation key/secret stored in
`organization_integrations` was encrypted with a different
`INTEGRATION_KMS_KEY` than the one in `.env` (the deployed app's key). Ask the
operator for ONE of: the matching key put in `.env` as
`INTEGRATION_KMS_KEY_PREVIOUS` (the crypto layer tries it on decrypt), or a
re-save of the ShipStation connection from the `:3050` lane (re-encrypts under
the local key). Then:

```
tsx --env-file=.env --import ./scripts/register-server-only-shim.cjs scripts/shipstation-backfill.ts --orgId=00000000-0000-0000-0000-000000000001 --months=6
# review counts, then the same with --apply
```

Re-run the coverage script; report buyer/Placed before → after per platform and
explain every remaining gap by source (Amazon/eBay rows ShipStation never saw
need the eBay/Amazon APIs — eBay integration was in `error`).

### B. Slice 6 schema (approved) — write with the `db-migration-author` skill
Facts (from the slice-6 scout): inbound tracking is per **carton**
(`receiving_carton.shipment_id` + `shipment_links` owner `RECEIVING`);
`receiving_line.shipment_id` exists but no writer fills it. Outbound is one
`orders` row per line; tracking per line (`orders.shipment_id` + `shipment_links`
owner `ORDER`). Price: `orders.sale_amount` = LINE total; no unit price or order
total stored; inbound stores only `receiving_line.unit_cost_cents`.

Do:
1. Per-line inbound tracking: widen `shipment_links.owner_type` CHECK with
   `RECEIVING_LINE`; make the inbound writer (`ingest-purchase.ts`,
   `ingest-inbound-order.ts`) stamp `receiving_line.shipment_id` and the link;
   backfill lines from their carton's primary shipment.
2. Price columns: `orders.unit_price NUMERIC(12,2)` (backfill
   `sale_amount / qty` where qty parses; ShipStation `line_items.unitPrice` wins
   where linked); outbound order total and inbound line/order totals as
   computed columns or one SQL fragment — pick the cheaper read for the sheet
   and say why.
3. Indexes for the Records sheet query (measure first with `EXPLAIN (ANALYZE,
   BUFFERS)` read-only): at least `orders (organization_id, account_source)`,
   `orders (organization_id, order_date)`, `orders (organization_id,
   created_at)`, `orders (organization_id, customer_id)`, `shipment_links
   (organization_id, owner_type, owner_id)`, the status/date columns the sidebar
   filters on, and `lower(...)` / trigram indexes only where a filter needs
   them. Every index leads with `organization_id`; `CREATE INDEX CONCURRENTLY`
   is not allowed inside the runner's transaction — check how existing
   migrations build large indexes and follow that.

### C. Status order fix (§2.3) and colours (§2.4)

## 4. Phase 2 — the Records sheet
Build exactly the spec in `PROMPT-records-sheet.md` §Phase 2 (one grid for
inbound + outbound on the house `LedgerGrid*`, Query and Paste modes, grain
switch, sticky identifiers left / statuses right, Linear-style selection +
floating bottom bar, sidebar sort-then-filter with include/exclude and live
counts from the same server builder, virtualized, J/K focus). Read the
pieces it must reuse, not fork: `resolveOrderBuyers`, `canonicalAccountSource`,
`placedElseImportedSql`, `PICKED_BY_LATERAL`, `record-status.ts`
(`RECORD_STATUS_TONE_CLASSES`). Register the page in
`src/lib/nav/route-tree.ts` (`ds_route`, `ds_vocabulary`), declare controls in
`NAV_PAGE_DECLS`, read `CONSOLIDATION_LEDGER.md` before any table action or
bottom bar, run `ds_display_method` (data table) and `ds_critique` on every
touched UI file.

### 4.1 Status columns (ruling §2.7)
Every row: **Internal | External**, sticky right. Internal = outbound
`resolveOutboundInternalStatus` / inbound walk (§2.3). External = carrier status
of the row's tracking (latest category from the carrier APIs →
`carrierStatusOfCategory`); multi-package rows use `leadStatus`. Paint with
`RECORD_STATUS_TONE_CLASSES`. A finished record shows two green pills.

### 4.2 Identifier edits (ruling §2.6)
Tracking number and order number are editable inline (single value) and from
the bottom bar (selection). At line grain a tracking change touches only the
selected lines (lines 1–2 → A, line 3 → B); at order grain all lines of the
order. Order-number change re-keys the line(s) under the unique key
`(organization_id, order_id, account_source, external_line_id)` — refuse with a
clear message on collision, never merge silently. Every identifier change
writes `audit_logs` (before/after) and publishes the order-changed event the
existing PATCH routes publish.

### 4.3 Delete — decided rule set (ruling §2.5)
Importance decides what Delete removes and how hard it is to do:

| Target | What Delete does | Guard |
|---|---|---|
| Descriptive field (title, note, condition, ship-by) | Not a Delete — clear it by inline edit | none beyond the edit |
| Identifier on a line (tracking number) | Unlinks that tracking from the selected line(s) (`shipment_links` row + `shipment_id` if primary); the tracking row itself stays | confirm dialog naming the identifier; audit; undo toast |
| Identifier: order number | Not deletable (it is the record's key) — edit only (§4.2) | — |
| Line grain | Deletes the selected line rows (outbound `orders` row; inbound `receiving_line`) with their dependents (work assignments, links); refuses a line that has a pick/pack/scan-out or unbox/receive event — offer "Remove from list" instead | type-to-confirm on >1 row; audit; permission `orders.delete` (outbound) / receiving equivalent |
| Order grain | Deletes every line of the selected orders under the same refusals | same, plus a count in the confirm |
| Item-number / product grain (aggregates) | Delete not offered (an aggregate is not a record) — the bar shows Remove from list only | — |
| Paste mode entry | Removes the pasted number from the list only; no database write | none |

Reuse the existing order delete path (`DELETE /api/orders/<id>` →
`deleteOrder`, which raises `OrderDeleteBlockedError`) — fix its known orphan
leaks (work_assignments, created customers) in the same change rather than
adding a second delete. "Remove from list" for outbound is the existing
`order_list_removals` (another lane's table; wait for its migration).

### 4.4 Acceptance
As the original brief §Phase 2 acceptance, plus: edit a tracking number on two
of three lines from the bottom bar; delete one line at line grain and see the
refusal on a scanned-out line; mixed list shows Internal | External with the
approved colours. Browser-checked on `:3050` only; `verify:fast` green on your
files.

## 5. Report format
After each slice and at each phase end: what was wrong at the root · what is
now the one way · what was deleted · before → after numbers · tests / verify
output · anything left, with evidence.
