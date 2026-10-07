# Agent prompt — Data integrity, then the Records sheet

> Paste everything below the line into a fresh agent session in
> `/home/michaelgarisek/Projects/cycleforge-lanes/prod` (host `avion`).
> Written 2026-10-06 from operator rulings; do not re-litigate them.

---

You are working in the CycleForge repo. Read `AGENTS.md` first and obey it
(`:3050` only, lane lifecycle is operator-only, `verify:fast` before "done",
design-system calls). Other agent sessions edit this worktree at the same
time: re-read a file before patching it, commit with `git commit --only
<paths>`, and never stage what you did not write.

The job has **two phases, strictly in order**. Phase 2 does not start until
Phase 1's exit gate passes and the operator says go.

The standard for both phases: **fix each problem at its root, make every
place that touches it consistent, and leave the code simpler than you found
it.** A fix that adds a second way of doing something is not a fix. Every
duplicate you find gets deleted or recorded in
`docs/design-system/CONSOLIDATION_LEDGER.md` with an exit criterion.

## Phase 1 — Data integrity

### Baseline (measured 2026-10-06 on the dev database, org `00000000-…-01`)

| Field | Coverage | Notes |
|---|---|---|
| Buyer (`orders.customer_id`) | 1,576 / 5,401 (29%) | Amazon 22%, eBay 15%, Walmart 13%, Ecwid 94%, blank-platform 1% |
| Order date (`orders.order_date`) | 1,449 / 5,401 (27%) | All 1,072 eBay and 1,811 Amazon blank; 135 fillable now from `shipstation_order_refs` |
| Platform (`orders.account_source`) | 708 blank | `eBay` and `ebay` are separate values; also `QA-DEMO`, `QA_SANDBOX`, `Other` |
| Pick events (`station_activity_logs` `PICK_SCANNED`) | 3,968 rows, 5 staff | Packed: 11 staff; Scanned out: 4 staff |

Most Amazon and eBay orders have no `order_import_run_rows` provenance. The
ShipStation integration is `active` and `shipstation_order_refs` carries
`customer_username`, `customer_email`, `ship_to`, `order_date`,
`marketplace` — but only 763 refs exist. The eBay integration shows `error`
(operator is reconnecting it).

Write a script that reproduces this table (`scripts/data-integrity-coverage.ts`,
run with `tsx --env-file=.env --import ./scripts/register-server-only-shim.cjs`).
It is the Phase 1 pass/fail check; run it before and after every slice.

### Slices — one commit each, in this order

**1. Platform identity.** Find every column and code path that names where an
order came from (`orders.account_source`, `orders.fulfillment_channel`,
`shipstation_order_refs.marketplace` / `account_source`,
`order_import_run_rows.platform` / `account_source`, the Fulfilled `?channel=`
facet, the "Platform" labels). Pick ONE canonical vocabulary and ONE
normalizer applied at every ingest writer (the inbound-order single writer is
`ingestInboundOrder`, `src/lib/inbound/`; outbound ingest is
`src/lib/orders/ingest-canonical-orders.ts` and `src/lib/orders/sources/`).
Backfill existing rows with an idempotent migration (use the
`db-migration-author` skill). Trace the 708 blank rows to their writer and fix
that writer — do not just paint them "Unknown". QA/demo sources must be
filterable out, not mixed in.

**2. Buyer identity.** `src/lib/orders/resolve-buyer-customers.ts` is the one
buyer resolver. List every order writer and whether it calls it; every writer
that carries a buyer must route through it. No second matcher. Then backfill
from what is already in the database.

**3. Order dates.** Define two dates and use them everywhere: **Placed**
(the channel's order date) and **Imported** (`orders.created_at`, never null).
Find every place that reads `COALESCE(order_date, created_at)` or similar and
make it name which one it means. Fill Placed from `shipstation_order_refs`
where linked.

**4. "Picked by".** Operator ruling: pick scanning is **not** required at a
station. "Picked by" means **the person who inventory-picked the product and
took it to the packing station**. Find every signal that records that
(`PICK_SCANNED`, inventory moves/picks, bin decrements, cart/tote moves,
assignment to a packer) and build ONE resolver that answers "who picked this
line, and when" with a stated precedence and a `source` field. Every surface
that shows or filters "Picked by" (Allocate, Fulfilled, the Records sheet)
reads that resolver. No new scan requirement.

**5. Status vocabulary.** Today the words and buckets live in several places
(`src/lib/nav/locate/bucket-precedence.ts`, `src/lib/outbound/desk-views.ts`,
`src/lib/nav/fulfilled/bucket.ts`, `src/lib/receiving/reconcile.ts`
`RECON_*`, `STATUS_CATEGORIES` in `shipped-filter-constants.ts`,
`outbound-facts.ts`). Produce ONE module that defines, per direction:
- **Internal status** — outbound: To pick → Picked → Packed → Scanned out
  (the Allocate words), plus Buyer cancel / On hold; inbound: Awaiting
  tracking → Not received → Received → Unboxed (confirm against reconcile).
- **External (carrier) status** — Label created, On the way, In transit, Out
  for delivery, Delivered, Exception, Returned — one set for both directions.
- Each status's tone (see Phase 2 colours) and its precedence.
Every existing caller maps onto it; delete the redundant word lists.

**6. Line grain and price.** An inbound order can have many items, and
different items can travel under different tracking numbers. Confirm the
schema supports **tracking per line** (receiving lines, `shipment_links`) and
that order/line **price** (unit, line total, order total) is stored and
readable for both directions. Report gaps; fix the model only if the operator
agrees.

**7. ShipStation backfill — 6 months.** Only after slices 1–3 land. Pull
ShipStation orders and shipments for the last **6 months**, link each to our
order, and push buyer, Placed date and platform through the slice 1–3 code
(never a side path). Idempotent, resumable, rate-limit aware, `--dry-run`
first with counts. Run it against the dev database; production is the
operator's call — hand them the exact command.

### Phase 1 exit gate
Re-run the coverage script and report before → after per platform. Targets:
no blank platform except rows you can name; no case-variant platforms; buyer
and Placed coverage for ShipStation-covered platforms within the 6-month
window near 100% (explain every remaining gap by source); one status module;
one picked-by resolver; `verify:fast` green. Stop and report.

## Phase 2 — The Records sheet

One high-density, high-throughput data sheet for **inbound and outbound
together**. It replaces the Pasted list (`/search/list`); a pasted list
becomes one way of filling it. Register the page in
`src/lib/nav/route-tree.ts` (pick path + label; `ds_route` / `ds_vocabulary`).

**What it is not.** It is NOT a triage card list. Do not reuse or share
components with `TriageCardList` / `RecordCard` / the journey board — those
are for one-by-one review. This is a single-row-per-record grid built on the
house grid (`src/design-system/components/grid/` — `LedgerGrid*`), confirmed
with `ds_display_method` (data table).

### Two modes
- **Query** — every record, narrowed by the sidebar.
- **Paste** — the pasted numbers (today's `parseRefList` + `/api/nav/locate`),
  same columns, same filters, same actions.

### Rows and grain
A grain switch: **per line · per order · per item number · per product**.
Condensed grains show a count and expand in place. Bulk edits apply at the
grain shown (e.g. per line: give lines 1–2 of order X tracking A and line 3
tracking B).

### Columns, left to right
1. **Select checkbox** (sticky left).
2. **Identifiers** (sticky left): order number, tracking number.
3. **Type**: Inbound / Outbound.
4. Facts: item, SKU, qty, **price** (unit, line total, order total), platform,
   buyer (outbound) / vendor (inbound), Placed, Imported, ship-by, picked by,
   packed by, scanned out by, unboxed by, carrier, service, ETA, last carrier
   event + place.
5. **Statuses** (sticky right), two columns:
   - Outbound: **Internal | External**.
   - Inbound: **External | Internal**.
   - Mixed list: see open question 1.

### Status colours — light, vibrant background, dark text
Use real tokens (`ds_tokens color`), never raw hex.
- External: **On the way = blue**, **In transit = yellow**, **Delivered =
  green**; Exception = red, Returned = orange, Label created = gray.
- Outbound internal: **To pick = gray**, **Picked = light blue**, **Packed =
  light purple/pink**, **Scanned out = light green**.
- Inbound internal: **Received = light green** (others proposed from the
  same palette).
- A finished record shows two green pills: Scanned out + Delivered, or
  Delivered + Received.

### Selection and bulk actions (Linear model)
- Checkbox column on the far left; click, Shift-click range, ⌘A, `x` toggles
  the focused row, Esc clears.
- On selection, a **floating bottom bar** appears just in time (progressive
  disclosure): `N selected · ⌘ Actions · … · ×`. On its left, a **⋮ more
  actions** overflow with **Delete** beside it. Start from the house dock
  (`DeskSelectionDock` / `DetailDock`) — read `CONSOLIDATION_LEDGER.md`
  before adding any wrapper.
- Actions include: add / replace tracking for the selected lines (split across
  tracking numbers), set internal status, assign staff, add note, set ship-by,
  delete. Inline cell edit for single values.
- Inbound with no tracking yet (seller hasn't sent it): select → Actions →
  Add tracking.

### Left sidebar — sort on top, filters below (WHERE before WHAT)
Everything that changes which rows show or their order is declared in
`NAV_PAGE_DECLS` and painted by `NavFilters`; nothing in the page body.
Paste `ds_contract`'s placement `briefBlock` into your notes.
- **Sort group (top):** as pasted, internal status, external status, the
  chosen date, staff, platform, buyer/vendor, price, time over limit.
- **Filter group (below)**, every facet value with **include and exclude**
  and a live count:
  Type · Internal status · External status · **Who did what, when** (event =
  Picked / Packed / Scanned out / Unboxed / Received / Imported, + staff, +
  date range) · Date axis (Placed / Imported / Ship-by / Shipped / Delivered,
  presets Today / Yesterday / This week / This month / custom) · Platform ·
  Buyer (type-ahead) · Vendor / PO · SKU / product · Carrier / service ·
  Price range · Flags (Late, Exception, No tracking, Duplicate, Has note,
  Assigned to me).
- Exclude does not exist in `NavControlsSchema` today: extend the schema and
  `NavFilters` once, for every page, citing the missing field
  (`src/lib/nav/context/schema.ts`). Counts come from the same server builder
  as the rows.

### Throughput
Server-side filtering, sorting and counts; a virtualized grid; keyboard
J/K moves focus; no per-row requests.

### Phase 2 acceptance
Browser-checked on `:3050`. Load a 6-month query; paste a Google-Sheets copy
of 60+ mixed tracking and order numbers (quoted multi-line cells and a note
line included); filter "packed by X on <day>"; exclude a
platform; switch grain to per order; select three lines, add a tracking
number to two of them through the bottom bar. `ds_critique` on every touched
UI file; `verify:fast` green.

## Open questions — ask the operator, do not guess
1. Mixed inbound + outbound list: the status columns are fixed. Default
   proposal: **Internal | External** for all rows (or follow the Type filter
   when it is set to one direction). Confirm.
2. Inbound internal statuses beyond Received: the full list and colours.
3. Delete: what it deletes at each grain (a line, an order, the pasted entry
   only?) and who may do it.
4. Any slice-6 schema change (per-line tracking, price storage).

## Report format (after each slice and at each phase end)
What was wrong at the root · what is now the one way · what was deleted ·
before → after numbers · tests / verify output · anything left, with
evidence.
