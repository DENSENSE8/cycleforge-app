# Receiving-line selection → right rail

**Status (2026-08-03):** Landed for Unbox / History / Incoming. The bottom
`ContextualSelectionBar` capsule is removed from those surfaces; gutter
selection opens `RightRailHost` via `ReceivingLineRailShell`
(`detail:receiving-line-batch`) and Incoming’s existing `detail:incoming`
inspector. Pack / Shipping / Repair / Tech Testing keep the capsule (order-rail
**D2** / grid plan **E5** partial).

Parent pattern: [`order-rail-selection-plane-PLAN.md`](order-rail-selection-plane-PLAN.md).

## Locked rules (do not re-open)

| ID | Ruling |
|---|---|
| **R1** | Gutter selection non-empty → right rail. Capsule gone on these three hosts. |
| **R2** | Collection click planes stay: Unbox body → line workspace; History body → `/carton/[id]`. |
| **R3** | Incoming: 1 → `IncomingDetailsPanel`; 2+ → batch shell. Close clears selection. |
| **R4** | Unbox / History: any non-empty check-set → batch shell (selection action plane). |
| **R5** | No compare pane. Occupant ids: `detail:incoming`, `detail:receiving-line-batch`. |
| **R6** | Close rail → clear check-set. |
| **R7** | Ticket → claim modal (hosted on Unbox browse too). Suppress batch rail while Unbox line workspace is open. |

## Key modules

| Piece | Path |
|---|---|
| Publish bridge | `src/hooks/useReceivingLineRailSelection.tsx` |
| Occupancy | `src/lib/right-rail/receiving-selection-occupancy.ts` |
| Batch shell | `src/components/receiving/rail/ReceivingLineRailShell.tsx` |
| Shared band / actions | `src/components/right-rail/RailSelectionActions.tsx` |
