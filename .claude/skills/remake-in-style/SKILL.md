---
name: remake-in-style
description: Use when the owner points at a screen, record, panel or row and says "make this like that" / "remake it in the outbound style" — diffs the target against a reference surface and rebuilds it with the reference's parts.
allowed-tools: Read, Grep, Glob, Edit, Write, Bash
---

# Remake in style

One move: **target** → rebuilt with the **reference's** parts. Nothing else.

```
remake <target> like <reference>
```

- `target` — a URL on :3050 (`/incoming?lane=docked&openLine=32624`), a component, or a screenshot.
- `reference` — defaults to **the order record** (`src/components/outbound/orders/OrderRecordView.tsx`,
  seen at `/shipping/orders?openOrderId=<id>`). Any surface the owner names can be the reference.

## The loop (do all five, in order)

1. **Look at both.** Screenshot target and reference on `:3050` via deep link (never synthesized clicks),
   In place + Floor. Find the target's component from the page (`data-testid`) — do not guess files.
2. **Diff against the checklist** below. Write one line per mismatch: `rule — target file:line — fix`.
   That list IS the plan; show it to the owner only if a fix changes shared tokens or another desk.
3. **Swap parts, don't paint.** Replace each mismatch with the reference's own part (table below).
   Never hand-write a border, hex, radius, badge or caps class to "look like" it.
4. **Delete what the swap made dead** (old helpers, per-item copies of a per-record fact). No shims.
5. **Prove it.** Screenshot target again (same deep link, In place + Floor), `pnpm verify:fast`,
   attribute every red per file. Report: before/after shots, files changed, what was left.

## The checklist (the reference style, reduced)

| # | Rule | Reference part |
|---|---|---|
| 1 | Every section is one card with a title top-left and at most ONE action top-right | `RecordGroup` (`record-ledger/RecordGroup.tsx`) |
| 2 | ONE status per record, top-right of the header; items carry no badge | `OrderRecordStatus` pattern, `LifecycleCode` |
| 3 | Left column = the work (Items → Fulfilment → Notes → Timeline); right = facts (Photos → Purchase/Customer → Shipping → …) | `DeskRecordLayout main / aside` |
| 4 | Progress is a step rail below the items, not a grid of cells | `StepRail` (`record-ledger/StepRail.tsx`) |
| 5 | An item card is identity only: photo, title, SKU, qty, condition, price | `OrderItem` in `OrderRecordView.tsx` |
| 6 | A fact shows once, at its real grain (a carton's claim on the carton, not every item) | the data model — check which table owns it |
| 7 | One identity = one row (tracking + carrier together) | `TrackingIdentity` with `carrierHint` |
| 8 | Notes the job needs are open at rest; disclosure only for the rarely read | `RecordGroup`, `EvidenceDisclosure` only for extras |
| 9 | Sentence case; soft rules (`border-mode-fact`), never `border-mode-ink` inside a triage record | `mode-label`, tokens |
| 10 | Empty states read as the next action ("Not paired" + Pair), not shouting | group header action |

A rule the reference itself breaks is not a rule — skip it. A rule that needs a NEW shared part
(e.g. a triage badge face) is an owner question: ask, then build it once at the token.

## Guardrails

- `:3050` only (AGENTS.md §1). Other sessions edit concurrently: re-read before each edit, touch only
  your lines, never fix another owner's in-flight file — attribute it.
- Stored data is never re-cased or rewritten; only presentation changes.
- One target per run. A second target is a second run.

Worked example + ground truth for the inbound records: `docs/design-system/HANDOFF-inbound-record.md`.
Inventory Stock + QC labels records (done; the SKU exception face is the open second target):
`docs/design-system/HANDOFF-inventory-records.md`.
