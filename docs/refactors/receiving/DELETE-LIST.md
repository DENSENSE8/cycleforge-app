# Receiving delete list — one physical truth, no integration verdicts

Status: 2026-10-03. Sibling of `docs/refactors/DELETE-LIST.md` (repo-wide waves); this file
owns the inbound / receiving / Zoho slice. Counts are prod-DB reads on the date above.

## 0. The rule

A package is judged only by physical facts, at the grain they happen:

| Fact | Grain | Source |
|---|---|---|
| In transit / delivered | package | `shipping_tracking_numbers` (carrier) |
| Docked | package | `receiving_scans`, `receiving_triage.door_received_at` |
| Opened | package | `receiving_unbox.unboxed_at` |
| Received N of M | order line | `receiving_line.quantity_received / quantity_expected` |

An external system (Zoho) is an echo. It never decides, hides, or labels what the
warehouse shows. A label that pairs "received" with "not scanned" is a bug by definition.

## 1. Done — data first, then deletes

### 1.1 Orphan packages (fixed before anything was deleted)

Cause: a box scanned before its order knew the tracking (seller adds tracking to the PO
later) lands as an `unmatched` carton. The PO keeps its own empty carton, so the paste
check saw "PO received, never scanned" while the box sat unboxed on another record.
Traced example: PO `17-15191-28624`, tracking `383922113625`, scanned + unboxed 10/2
18:37 into carton 53617; Zoho reference added 18:53; PO carton 53278 never saw it.

- **Never again:** `claimPendingIdentifierCartons` (`src/lib/receiving/link-pending-identifier.ts`)
  runs on every PO import and now also claims an orphan whose **scanned** number equals the
  order's PO# / reference (≥ 8 chars). It never merges onto an order whose own carton has
  physical progress (`cartonHasPhysicalProgressSql`, the one predicate shared with
  `claimOrAbsorbZohoPoShell`).
- **Backfill:** `scripts/backfill-orphan-cartons.ts` (dry-run default, `--apply`, `--list`)
  runs the same claim for every order that already carries a scanned number.
  Applied 2026-10-03: **64 packages reattached to 62 orders**. Re-run: 0 left to claim.

Remaining scanned packages with no order link (dogfood org, after apply):

| Bucket | Count | Next |
|---|---|---|
| `needs_person` — order's own carton already has physical progress (two records, one order) | 30 | Unfound queue; operator pairs |
| `ambiguous` — scanned number names several orders | 5 | Unfound queue |
| `return_repair` — no purchase order expected | 261 | not orphans; returns identity |
| `no_order` — nothing anywhere carries the number | 1,092 | purchases never entered as orders → native intake (§2 R7) |

### 1.2 Integration verdicts removed

- `erp_ahead` reason ("Zoho received · never scanned") — `reconcile.ts`, tests, piles, locate.
- `ERP_AHEAD` exception code ("Zoho received · not scanned") — `incoming-exceptions*.ts`,
  `incoming-delivery-state.ts`, `build-sql.test.ts`.
- `open_po` no longer prints the Zoho status (`PO received`); it reads **Ordered · no tracking**.
- Paste lookup: a PO's carton with no carrier shipment is no longer "known", so a pickup /
  untracked order reads **Ordered · no tracking**, never "In transit" (`check-zoho-received.ts`).
- `IncomingBulkTrackingPanel`: "No warehouse record" / "Zoho behind" chips and stats gone;
  tabs bucket by physical facts.
- `railCoarseStatus`: Zoho status can no longer turn a line Received.
- Deleted `zoho-received-reconcile.ts` (forced `quantity_received = quantity_expected`, `DONE`
  from Zoho status) and its calls in `po-mirror-sync.ts`.

### 1.3 Dead routes deleted (zero runtime callers)

`api/receiving/mark-received` (1,070), `api/zoho/purchase-orders/receive` (425),
`api/zoho/debug-receive` (104), `debug-pr-shapes` (120), `debug-bills` (53),
`api/zoho/purchase-receives/sync` (43) — **1,815 lines**, plus helpers only they used
(`mergeCatalogItemIdsFromPurchaseOrder`, `isPreReceiveWorkflowStatus`,
`isPlacementStrangleReceivingPutaway`). Route manifests regenerated.

### 1.4 The staff sheet, replaced

The "Unreceived Tracking" Google Sheet's columns, carrier notes and colour tags now live
in the pasted ledger (`?ref_in=`): Compact one-row view by default, Full on toggle. Tags
are `inbound_followups` (migration `2026-10-03_inbound_followups`). Carrier signer,
attempts and ETA come from `sql-shipment-carrier-facts.ts`. The field parity table is in
`docs/refactors/sidebar/HANDOFF-inbound-deliveries-reconcile.md` §6. Once staff stop
opening the sheet, its Apps Script / import (if any) is the next delete.

## 2. Next, in order (each gated on the one before)

| # | Delete | Gate (measure first) | Evidence |
|---|---|---|---|
| R1 | `NOT_ZOHO_RECEIVED_PREDICATE` / `NOT_ZOHO_RECEIVED_SHIPMENT_PREDICATE` — Zoho status still **hides** lines from Incoming, summary chips, delivered-not-unboxed, refresh stream, removed-lane (`build-sql.ts` 148/551/839/942/958/1379, `incoming-shipments.ts`, `delivered-not-unboxed.ts`, summary + refresh routes) | 103 lines / 93 POs (90 d) are hidden only by Zoho status today; they reappear as their physical state. Review that list, then delete | `delivered-unscanned.ts:160` |
| R2 | Zoho receipt faces: `incoming-removal-reason.ts` `vendor_received`, `tracking-removal-status.ts` `vendorReceived`, `zoho-receipt-face.ts` | with R1 | labels Zoho status as an exit reason |
| R3 | `check-zoho-received*` stack (~1.6k lines) → one local "order ↔ package" lookup; rename the paste check | R1 | today it is a local join wrapped in Zoho vocabulary |
| R4 | Line copies of package events: `receiving_line.scanned_at / unboxed_at / received_at / receiving_line_status` + `trg_receiving_line_coarse_status` | one status function (R5) reads the package tables | 117 lines (90 d) say "not scanned" while their package was scanned |
| R5 | Nine status calculators → one: `railCoarseStatus`, `deriveReceivingLineStatus`, `resolveReceivingLineStatus`, `reconOfCheckRow`, `reconOfWarehouseRows`, `resolveWatchState`, `cartonStage`, `dockedRecordState`, PO-header rollup in `api/receiving/po/[poId]` | — | 0 partial receipts in 90 d: "received" is binary everywhere today |
| R6 | `receiving_line.status_override*` columns (migration drop) | — | 0 rows set; no reader or writer |
| R7 | `receive-backfill` + `zoho-receiving-sync` + `po-sync` crons; `zoho_po_mirror`, `receiving_line_zoho` → read-only history | native intake (`ingestInboundOrder`) is the only way orders enter | 1,092 `no_order` packages above are the cost of orders living outside |
| R8 | Demoted empty PO shells (absorbed, `unmatched`, no scans) — delete or mark merged | move `receiving_order_link` rows first (FK cascades) | `triage/metrics` counts them as unfound |
| R9 | Ledgers → `TriageCardList density="row"`: `IncomingDeliveriesLedger`, `PastedNumbersLedger`, `DockedPackagesLedger`, `useReceivingSpreadsheet`, `ReceivingLinesTable` switchboard | repo-wide Wave 1 (`docs/refactors/DELETE-LIST.md` §2–3) | five list implementations for one queue |
| R10 | Mobile "Unbox = receive every line" (`mark-received-po` from `/m/r/[id]`) → Opened, then count N of M per line | R5 | 168 lines in opened boxes show 0 received |

Left on purpose (product calls, not dead code): `receiving.defaultPutawayBin` setting is now
unwired (its only reader was `mark-received`); `QA_FAIL_EXCEPTION_STATUS` is test-only.
