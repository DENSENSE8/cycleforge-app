# Order Management Module

Status: proposed operating contract for review before the Shipping / Packing
interface is reorganized.

## Purpose

Order Management is the control layer for every marketplace order. It answers,
at a glance: what sold, where it came from, when it must ship, what state it is
in, whether it is blocked, who owns the next step, and what that step is.

It is not a packing station. Picking, packing, label purchase, scan-out, and
packer KPI remain execution concerns and feed their state back to this module.

```
Sales channels → Order Management → Shipping / Packing execution
                         ↑                    │
                         └──── status, owner, exception, tracking ────┘
```

## Scope and boundaries

| Concern | Order Management | Shipping / Packing |
| --- | --- | --- |
| Intake, duplicate detection, channel/account identity | Owns | Consumes |
| Due-date triage and management priorities | Owns | Reads |
| Status, exception, action required, ownership | Owns | Updates progress |
| Order details, customer notes, marketplace context | Owns | Reads critical instructions |
| Pick, pack, labels, scan-out, performance/KPI | Links to execution work | Owns |

## Main-screen contract

The default grid is intentionally narrow. It should show only the fields
needed to make a management decision:

1. Channel / account — a named platform and account label; never a color dot
   alone.
2. Order number.
3. Item, SKU, quantity, and condition.
4. Ship-by priority — **Overdue**, **Ship today**, **Ship tomorrow**, or
   **Upcoming**, plus the exact date.
5. Status.
6. Action required.
7. Assigned owner or responsible team.
8. Exception category when present.

Everything else belongs in the order detail: address, customer data, raw
marketplace payloads, tracking, timeline, attachments, and full notes.

## Views and triage order

Top-level views should be stable saved lenses, in this order:

1. All orders
2. Action required
3. Ship today
4. Overdue
5. Exceptions
6. Ready to ship
7. Shipped

The default sort is: overdue first, then ship-today, ship-tomorrow, upcoming,
then orders without a known deadline. Each view keeps a visible due-date sort
and filter, rather than making due-date urgency a hidden calculation.

## Canonical status and next-action model

Status describes the current lifecycle state. `action_required` describes the
next operational decision and `owner` says who must make it. They must not be
overloaded into one field.

| Status | Typical action required | Default owner |
| --- | --- | --- |
| New / needs review | Validate marketplace and SKU mapping | Sales Support / Inventory |
| Ready to pick | Pick inventory | Warehouse |
| Picked | Pack and verify | Packing |
| Ready to ship | Create or print shipping label | Sales Support / Shipping |
| Shipped | No action | — |
| Exception | Resolve classified exception | Named team or person |

Exception categories: SKU mapping, out of stock, address issue, buyer request,
marketplace hold, testing issue, shipping issue, and other. SKU creation or
modification remains an Inventory / Accounting-owned workflow; Order
Management reports and routes the exception but does not silently change the
catalog.

## Information hierarchy and interaction rules

- Ship-by urgency uses a text label, exact date, and accessible visual treatment;
  color supports the label rather than carrying the meaning alone.
- Channel identity shows platform icon **and** account name (for example,
  `Amazon · USAV West`), including in compact rows and detail headers.
- Important marketplace, buyer, and internal instructions surface as a concise
  instruction strip in the row/detail header; full notes remain in detail.
- An exception is actionable only when category, required action, and owner are
  all represented.
- Selecting a row opens the existing order detail rather than expanding the
  grid with address, tracking, and audit data.
- Bulk actions in management are limited to assignment, status/triage, and
  exception routing. Packing and shipping mutations remain on execution
  surfaces.

## Refactor sequence

### Phase 0 — contract and data audit (this document)

Confirm field definitions, lifecycle statuses, exception taxonomy, ownership
teams, the account naming convention, and SLA rules with Sales Support,
Inventory/Accounting, and Warehouse.

### Phase 1 — introduce the management shell without moving data

Create an Order Management route and navigation label backed by the existing
orders query, order detail, notes, exceptions, assignments, and timeline. Add
the management grid field set and saved lenses above. Keep `/shipping/orders`
as a compatibility redirect until daily use has proven the new surface.

### Phase 2 — normalize management semantics

Make `ship_by`, named `channel/account`, `status`, `action_required`,
`owner`, and typed exception data first-class in the read model/API. Define
migration and fallback rules for incomplete older marketplace data. Add
contract tests for urgency bucketing, account display, ownership, and
exception routing.

### Phase 3 — separate execution navigation

Keep the existing Pick / Pack / label / scan-out tools under Shipping / Packing.
Pass the order identity and critical instructions to those tools, and publish
