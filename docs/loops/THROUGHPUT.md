# Throughput — measured, not gated

Pack side of Garisek-OS `docs/loops/AUTORESEARCH.md` §5: a read-only trend line next to the exam
score. It is never a gate.

```
pnpm throughput [--days 7] [--org usav]     # report + receipt
pnpm test:throughput                        # pure pairing / percentile tests
```

- Code: `scripts/throughput/report.ts` (IO), `scripts/throughput/cycle-times.ts` (pure).
- DSN: the worktree `.env` only (loaded over the shell). Data reads go through
  `withTenantConnection` in a transaction switched to `READ ONLY`; the org-slug lookup runs in
  `BEGIN READ ONLY … ROLLBACK`. Nothing is written to the DB.
- Receipt: `.garisek/spec/throughput/<Pacific day>.json` (gitignored) —
  `{v:1, at, window, org, steps:[{id, from, to, n, medianMin, p90Min, noData?}], daily, queries}`;
  `queries` maps each query id to `sha256(sql)`, so a changed definition shows in the trend.

## How a step is measured

Per subject key: the **earliest** start event, then the earliest end event at or after it. A pair
counts when its **end** lands in the window (the start may be older). A key with no start, or whose
ends all precede the start, is skipped. n = 0 is `no_data`, never a zero median. Median / p90 are
`percentile_cont`-style interpolation.

| Step | Subject | Start → end |
|---|---|---|
| `arrival_to_unbox_open` | carton | `ops_events receiving.carton.arrived` → `UNBOX_SCAN_OPENED` |
| `unbox` | carton | `UNBOX_SCAN_OPENED` → `UNBOX_CONFIRMED` |
| `unbox_to_test` | unit | carton `UNBOX_CONFIRMED` → first `testing_results` verdict |
| `test_to_stock` | — | `no_data`: no put-away event log (`receiving_line_putaway` is a last-write projection; `inventory_events MOVED` has no `serial_unit_id`) |
| `stock_to_pick` | — | `no_data`: no per-unit stock-entry event; picks are keyed by shipment |
| `order_to_pick` | shipment | `orders.created_at` (order ingested) → `PICK_SCANNED` |
| `pick_to_serial` | shipment | `PICK_SCANNED` → `SERIAL_ADDED` (serial bound at the picker desk) |
| `pick_to_pack` | shipment | `PICK_SCANNED` → `PACK_COMPLETED` |
| `pack_to_ship` | shipment | `PACK_COMPLETED` → `SHIP_CONFIRM` with `metadata.source = 'shipped-scan-out'` |
| `order_to_ship` | shipment | `orders.created_at` → live `SHIP_CONFIRM` |

Live scan-outs only: bulk backlog clears (`bulk-scan-out`, `bulk-catchup-scan-out`), ops backfills
and held-scan replays stamp a script or replay time (bulk rows sit at 0 min after the pack), so they
neither end a cycle time nor count as shipped.

## Daily counts

Pacific days in the window (the first day is partial). Each subject counts once, on the day of its
first event: `cartonsUnboxed` (first `UNBOX_CONFIRMED`), `unitsUnboxed` (sum of
`receiving_line.quantity_received` over those cartons), `unitsTested` (first `testing_results`
verdict), `shipmentsPacked` (first `PACK_COMPLETED`), `shipmentsShipped` (first live `SHIP_CONFIRM`).
Outbound is counted in shipments, not units: `orders.quantity` is a free-text column.

To measure a `no_data` step, first add a real append-only start/end event to the app. Do not
derive one from a projection column.
