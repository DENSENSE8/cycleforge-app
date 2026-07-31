# Review station: "Missing item number" durable import queue

**Companion, not entry point.** Continue from the unified handoff:

> Read `docs/todo/sheet-import-review-queue-HANDOFF.md` and continue from "Status".

This file keeps the design rationale. Session of **2026-07-30**, lane `main`
(WS-DOGFOOD). Related: `docs/todo/sheet-import-visibility-FINISH-PROMPT.md`
(item 1 — tenant-blind unique-index contract — **applied 2026-07-30**; this
queue does not depend on it).

---

## 0. The one thing to internalise

Google Sheets order import already has a mature "durable queue + triage"
pattern for orders that DID import but whose Item Number didn't resolve to a
catalog SKU: `order_catalog_link_chores` + `/review?mode=catalog-link`. That
one is fine as-is.

The gap this doc closes is the OTHER case: sheet rows with a real order id +
tracking but a **blank** Item Number. Those never became `orders` rows at
all (`noItemNumber` in `transfer-sheet-eligibility.ts`) and only ever
flashed in the sync dialog's `SkippedRowsPanel` — gone the moment the dialog
closed. This adds a second durable table, `order_import_exceptions`, and a
second tab on the same Review page, reusing the exact ingestion path so a
"resolved" row becomes a real order rather than a hand-built one.

Per `sheet-import-visibility-FINISH-PROMPT.md` §3: only `noItemNumber` rows
are legitimate candidates. Blank padding, FBA shipments, Ecwid rows, and
rows missing an order id or tracking are excluded for their own reasons and
must never be enqueued here.

---

## 1. Status

**Code Done, uncommitted — `npm run verify` green** (see unified handoff for
the full Done list). Do not treat as unverified.

**Migrations applied (2026-07-30):** `2026-07-30c_order_import_exceptions.sql`
+ `2026-07-29f_sku_platform_ids_tenant_contract.sql` (ungated). Dead
CASE/EXISTS removed from `order-catalog-link-chores.ts`. Dry-run: **0 pending**.

**Still to do:**
1. Manual smoke: `/review?mode=catalog-link` → Missing item number → resolve →
   Pending order → re-sync does not resurface.

**Entry point for next work:**
[`sheet-import-review-queue-HANDOFF.md`](sheet-import-review-queue-HANDOFF.md).

---

## 2. Design notes worth re-reading before touching this

- **Why `raw_row` + `col_indices` are stored, not just display fields:**
  `mapSheetRowsToCanonicalLines(rows, colIndices)` is a pure function from a
  raw sheet row to a `CanonicalOrderLine`. Storing both lets "resolve" splice
  the corrected cell and re-run the *exact* mapper + `ingestCanonicalOrders`
  the bulk job uses. No second order-creation code path exists anywhere in
  this feature — that is the whole safety argument.
- **Why the enqueue upsert has `WHERE order_import_exceptions.status =
  'open'`:** this is the one thing to get right or the queue never empties.
  The Google Sheet's actual cell is never edited by this feature (only our
  local copy of the row is patched, at resolve time). So on every future
  sync, the eligibility gate will keep classifying that sheet row as
  `noItemNumber` forever. Reopening a resolved/ignored row on re-sight would
  make it come back daily with no way to permanently clear it.
- **Ignored stays ignored, unlike `order_catalog_link_chores`.** The chores
  table deliberately reopens an ignored chore on re-sight (a listing might
  get properly catalog-linked later). A blank-Item-Number sheet row will
  never fix itself without a human either typing the number here or the
  automatic `backfillItemNumbersFromListingTitles` exact-title recovery
  catching it earlier in the pipeline (which runs BEFORE this gate, so a row
  reaching this table already failed that recovery). Permanent ignore is
  correct here.
- **This composes with the existing catalog-link queue for free.** If the
  operator-supplied Item Number still doesn't resolve to a catalog SKU,
  `ingestCanonicalOrders`'s existing `unmatchedCatalog` handling enqueues an
  `order_catalog_link_chores` row for it automatically — no special case
  needed in `resolveImportException`.
- **No new nav entry.** Everything lives on the existing `/review` station,
  `?mode=catalog-link`, as a second tab — matches `sidebar-mode` convention
  (in-surface tabs, not a new page for a variant of the same job).

---

## 3. Traps

- **Do not re-litigate "unverified code"** — finish session already ran
  `npm run verify` green; table is live. Remaining work is manual smoke.
- **Enqueue must use uncapped `noItemNumberRows`** — not the dialog's 200-row
  sample. Wiring the sample silently truncates the durable backlog.
- **Ignored stays ignored** — unlike `order_catalog_link_chores`; reopen-on-
  re-sight would make the queue never empty (sheet cell is never edited).
- **`SheetColumnIndices` was a private type** in `google-sheet-rows.ts` —
  exported for the domain module to type `col_indices` without duplicating.
- **`ingestCanonicalOrders` computed `insertedOrderIds` internally but never
  returned it** — exposed on `IngestCanonicalOrdersResult` so resolve can
  record which real order it created.
- **Dev server is on `:3050`, attach only — never start/restart/kill it**
  (`workflow-safety.md`). Manual verification assumes it's already running.
- **`TENANT_APP_DATABASE_URL` without tenant GUC looks empty** — RLS. Use
  `DATABASE_URL` (owner) for inspection.

---

## 4. Verify

Prefer the unified handoff §5 (covers both threads). Local quick check:

```bash
node --test --require ./scripts/register-server-only-shim.cjs --import tsx \
  src/lib/inventory/order-import-exceptions.test.ts
npx tsx --test src/lib/jobs/transfer-sheet-eligibility.test.ts
npm run verify                                      # before any commit
```

Manual: open `/review?mode=catalog-link`, confirm the "Missing item number"
tab renders, resolve one row with a real Item Number from the live sheet,
confirm an order appears in `/dashboard` Pending with that item number, then
re-run a sync and confirm the resolved row does NOT resurface.
