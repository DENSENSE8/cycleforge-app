# Hop 1 /clarify

Paste this file as the next overnight task. Stop when hop 1 is green. Do not start hop 2 in the same session.

Agents never write `docs/eval/goals/**`. Copy PLAN §10 into `docs/eval/goals/item-record-wms-receive-ledger.goal.json` yourself and commit it on HEAD before `goal-run.ts`.

## Goal

There is one item identity ledger. This hop grows the qty face only.

Live Unbox must show listed vs got vs remaining. Door-scan must not paint `1/1` as complete. Open must not go emerald. Done must not be color-only.

## Do this hop

1. Call `ds_contract` and `ds_tokens` before any `src/**/*.tsx` write.
2. Run `find_symbol` then `impact_analysis` on `ItemRecordQtyBadge` before you change its signature.
3. Dual readout `got/listed` plus remaining on receiving lines.
4. Stop `PoLineRow` from setting `counted = quantity_expected` on a live Unbox row.
5. Keep serial-unit `1/1` as one physical unit. Do not recast it as PO receive.
6. Leave orders on expected-only via `shippedOrderToItemRecords`.
7. Critique every edited UI file. Run `cursor-eval --fast`. Stamp `.cursor/eval-session.json`.

## Stop when

The hop 1 row in PLAN §4 is true. `verify:fast` is green. Critique ran on the edited UI files.

## Do not

Do not add Received or SHORT. That is hop 2 `/harden`.
Do not reorder meta tracks. That is hop 3 `/normalize`.
Do not change station depth. That is hop 4 `/bolder`.
Do not rewrite the Items band as a meter. That is hop 5 `/distill`.
Do not run the heuristic pass. That is hop 6 `/critique`.
Do not fork a second item row.
Do not touch CompoundItem, slot-table header-sort, `DataTableFilterMenu`, overlay `visibility`, or `zIndex.panel`.
Do not toast line receive. Do not add a second composer.

## Read first

- [Overnight GOAL](../warehouse-os/GOAL-item-record-wms-receive-ledger.md)
- [Plan of record](./item-record-wms-receive-ledger-PLAN.md)
- [Kickoff trail](./item-record-wms-receive-ledger-decisions.tsv)
