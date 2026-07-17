# 01 — Receiving BOH slim

**Status:** Not started — **do LAST**
**Parent:** [../foh-boh-surface-split-plan.md](../foh-boh-surface-split-plan.md)
**Depends on:** [02 — Walk-In Station](./02-walk-in-station.md) live · [04 — Inbound History → Dashboard mode](./04-inbound-history-dashboard-mode.md) live

## Goal

Reduce Receiving to **BOH only — Incoming · Receiving (triage) · Unbox** — after Walk-In intake
and Inbound History have their own homes. This is the *removal* pass; it must not orphan any surface.

## Current state (verified 2026-07-16)

`RECEIVING_MODE_ITEMS` (`src/components/sidebar/receiving/receiving-sidebar-shared.ts`):

```
[ incoming, triage, receive (Unbox), pickup (Walk-In), history ]
```

Target: drop `pickup` and `history`.

## Phases

- [ ] **P1** — *(gated on 02 shipping)* remove `pickup` from `RECEIVING_MODE_ITEMS`.
- [ ] **P2** — *(gated on 04 shipping)* remove `history` from `RECEIVING_MODE_ITEMS`.
- [ ] **P3** — Prune the graduated `pickup` / `history` branches in `useReceivingMode.ts`.
- [ ] **P4** — Confirm `SURFACE_REGISTRY` legacy `/receiving?mode=pickup|history` redirects still resolve to the new homes (rows owned by [05](./05-nav-permission-redirects.md)).

## Reuse map (Compose / Relocate / Delete)

| Asset | Action |
|---|---|
| `RECEIVING_MODE_ITEMS` `pickup` + `history` entries | **Delete** |
| `useReceivingMode.ts` pickup/history branches | **Delete** (after redirects prove out) |
| Incoming / Triage / Unbox | **Keep** unchanged |

## Acceptance

- [ ] Receiving rail = Incoming · Receiving · Unbox only.
- [ ] `/receiving?mode=pickup` → `/pickup`; `/receiving?mode=history` → dashboard inbound mode.
- [ ] No dead `pickup` / `history` branches remain in `useReceivingMode.ts`.

## Files

`src/components/sidebar/receiving/receiving-sidebar-shared.ts`, `src/components/sidebar/receiving/useReceivingMode.ts`, `src/components/sidebar/receiving/ReceivingModeSwitcher.tsx`.

## Verify

`npm run verify`; receiving e2e (ensure Unbox/Triage/Incoming unaffected).
