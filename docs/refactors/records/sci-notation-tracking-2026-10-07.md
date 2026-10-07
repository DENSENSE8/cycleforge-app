# Tracking numbers stored in scientific notation — 2026-10-07

Records Phase 3 §3.4.1. A 22-digit USPS number read as a float prints as
`9.434608106244568e+21`. The last digits are gone, so it can't match a real
package. On the Records sheet it shows as `4568e+21` / `0214e+21`.

## What was stored (counted before the repair, primary)

| Table | Rows | Where they came from |
|---|---|---|
| `shipping_tracking_numbers` | 145 | 144 `ebay_purchase` from 2026-09-01 to 09-18 (eBay XML parse, fixed 2026-10-04); 1 `zoho_po` on 2026-09-18 (a Zoho PO Reference# pasted from a spreadsheet) |
| `inbound_purchase_order_mirror` | 89 | eBay purchase snapshots from 2026-09-02 to 09-19 |
| `zoho_po_mirror.reference_number` | 1 | Zoho's own field (PO 05-15185-97935) |
| `entity_search_docs` | 1 | derived; rebuilds from the outbox |

## What the repair did

Migrations: `2026-10-07_c_tracking_scientific_notation_repair.sql` and
`2026-10-07_d_ebay_mirror_tracking_from_po_carton.sql`.

The repair accepted a number only if two things were true. First, its float
rendering had to be exactly the stored value. Second, it had to come from the
row's own evidence: its carton's receiving scans, the carton's own package, or
its Zoho PO Reference#. The same rounded value can stand for different
packages on different orders, so a global match was never enough.

- **3 linked packages, all recovered.** Their links, lines and cartons moved
  to the true package, which already existed:
  - carton 53019 (PO 16-15165-17221) → `9434608106244567868872`
  - carton 53020 (PO 11-15174-21112) → `9334611043900214123734`
  - carton 53034 (PO 05-15185-97935) → `9434608106244564717364`
- **142 orphan packages deleted.** Nothing pointed at them: no order, carton,
  line, link or event. They belonged to eBay twin lines that
  `scripts/repair-ebay-zoho-twins.ts` had already removed. The true numbers
  still exist as their own package rows.
- **89 eBay mirror rows, all recovered.** 88 came from the order's Zoho PO
  Reference# or its cartons. The last one, order 19-15115-65421, came from its
  PO carton 52619's scan `9434608106244530786660`.

After the repair, `shipping_tracking_numbers` and the eBay mirror have 0 rows
in scientific notation. `zoho_po_mirror` still has 1: that is Zoho's own field,
fixed in Zoho (see below).
`stn_tracking_not_scientific_chk` and
`inbound_po_mirror_tracking_not_scientific_chk` now refuse new ones.

## For the operator — fix in Zoho

| Zoho PO | Reference# now | Set it to | Evidence |
|---|---|---|---|
| 05-15185-97935 | `9.434608106244565e+21` | `9434608106244564717364` | Carton 53034 for this PO was scanned with this number on 2026-09-21. It is the only number on the PO that rounds to the stored value. |

Until the Reference# is fixed in Zoho, the Zoho sync refuses it (it is not
registered as a package). The carton keeps its scanned package.

## Nothing else is unrecoverable

Every rounded value tied to a record was recovered. The 142 deleted orphans
had no record to repair.
