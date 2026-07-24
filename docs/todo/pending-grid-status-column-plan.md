# Plan — Pending grid **Status column** (sortable; replaces lane-style display)

> **Status: SUPERSEDED 2026-07-23** — Status + Platform columns removed; lane is
> now the lifecycle tabs **Pending · Tested · Packed · Shipped** (`?tested`
> peer of `?unshipped`). Historical notes below archive the Status-column landing.

## Landed shape (archive)

- **Status column** after Age: Pending · Tested · Out of stock via
  `deriveFulfillmentState` + `FULFILLMENT_STATE_META` (not `AWAITING_LABEL`).
- **Data gate:** Pending client-filters rows with empty
  `tracking_number` / `shipping_tracking_number` (Labels owns untracked).
- **Sort:** `?sort=status` ranks `PENDING → TESTED → BLOCKED`
  (`FULFILLMENT_STAGE_RANK`); deadline tiebreak.
- **Chrome:** full-bleed in workbench gutters (no rounded card shell); page
  scroll via `DashboardScrollShell` + `LedgerGrid` `scrollParentRef` so KPI
  scrolls away and the column header sticks under pinned context chrome.
- Product-cell status **dot** dropped on `gridSkin` (column replaces it).

## Why (archive)

Status on the Pending grid was previously expressed three indirect ways, all
leftovers of the retired swimlane board:

1. a 2×2px **status dot** on the Product cell,
2. the **`?ustatus=` lane filter**,
3. the **`priority` sort's implicit tested-before-pending grouping**.

## Status vocabulary — fulfillment lanes only

| Stage | When (signals) | Reads as |
|---|---|---|
| `PENDING` | label linked, no tech scan | awaiting test |
| `TESTED` | tech scan recorded | ready to pack |
| `BLOCKED` | `out_of_stock` set | Out of stock |

Presentation via **`FULFILLMENT_STATE_META`**. No inline status→class maps.

## Column model (superseded)

Was: `select · title · date · age · status · qty · cond · platform · order · tracking`

Now: `select · title · date · age · qty · cond · order · tracking` on Pending;
Tested tab uses tester · testedAt instead of status.

## Follow-ups (ask-first)

- Align KPI / queue-counts with the tracking filter if dogfood shows drift.
- ~~Chip-click → `?ustatus=` filter~~ → lifecycle **Tested** tab.
- Retire invisible tested-first grouping inside `priority` once status sort is the explicit alternative.
