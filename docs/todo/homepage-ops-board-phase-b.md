# Homepage ops board, Phase B

Slot-table bugs. No product UI. No new `*GridRow` / `*_GRID_COLUMNS` / `*_SHEET_COLUMNS`.

throughput checkpoint: n/a, prove-only. One worktree, no fan-out.

## Predicate

`pnpm run eval:discover` lists no unblocked DELETE. `pnpm run eval:cohort slot-table -- --skip-verify` returns `ok: true`. Remaining Discover rows are JUDGMENT (human). Agents do not empty `support-tickets` or delete `FBA_FIELD_CATALOG`.

## Result

| Gate | Result |
|---|---|
| Discover mechanical DELETE | 0 |
| Discover next unblocked | none |
| Cohort skip-verify | `ok: true`, tripwire true, engineContract true, graph true, 21/21 peers |
| Run id | `2026-09-05T04-39-22-734Z` |

JUDGMENT leftovers (do not touch):

- `catalog-orphan:fba:FBA_FIELD_CATALOG`. Catalog kept for a torn-out FBA desk.
- `table-columns-zombie:support-tickets`. Human chooses join `PRODUCT_TABLES` or empty the bucket.

Eval wrote `docs/eval/cohorts/slot-table/LEDGER.md` and 2026-09-05 snapshots. Those files are not in this commit. Agents do not own the ledger.

## Next paste

Phase C. Mount To-ship selection and row actions on Home Tasks. Do not wait for a second table stack.
