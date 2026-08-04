# Unbox flush display — remaining phases HANDOFF

**Status (2026-08-04 evening):** Phases **1–4** landed. **B declined**. **C/D** landed.
**Phase 5 geometry** verified via QA-org E2E at **1440 + 1920** (context flush,
Displays push flush + center ≥ floor). **Claim→AI** and **Displays→AI** yield E2E
green. **AI→Claim** yield still flaky under App Router soft-replace (OPEN event +
`setClaimView(false)` + `startTransition` landed; confirm when `:3050` is healthy).
**UnboxPushColumn** now publishes `setStationPushDemand` so 1440 parks the context
rail (fixes center crushed to ~660). Plan: `.cursor/plans/unbox_flush_display_9e0a1b16.plan.md`
(do not edit the plan).

SoT already locked: `AGENTS.md` + `source-of-truth.md` → **Depth elevation** ·
**Frame column budget** · **Right-rail modality** (AI + ticket one slot).

---

## Paste this into a new session (AI→Claim residual only)

> Read `docs/todo/unbox-flush-display-REMAINING-HANDOFF.md`.
>
> Geometry Phase 5 is done. Only residual: **Sparkles over open Claim** must clear
> `?claimView=1` (OPEN event fires; `setClaimView(false)` runs; App Router sometimes
> drops the replace). Attach `:3050`, QA storage `tests/.auth/qa-admin.json`, re-run:
> `npx playwright test tests/e2e/unbox-flush-display.spec.ts --project=qa-desktop -g "AI open yields"`.

---

## What already landed (do not redo)

| Phase | Landed |
|---|---|
| **1a** Context rail flush | [`context-panel-column.ts`](../../src/components/sidebar/context-panel-column.ts) |
| **1b** Station push flush | [`detail-stack/layout.ts`](../../src/design-system/shells/detail-stack/layout.ts); [`UnboxPushColumn.tsx`](../../src/components/receiving/workspace/UnboxPushColumn.tsx) |
| **1c** Sunken center | [`StationPanelRoot.tsx`](../../src/components/station/workbench/StationPanelRoot.tsx) |
| **1d** Frame gutters | [`frame.ts`](../../src/lib/right-rail/frame.ts) gutters 0; push floor 1144 |
| **2** AI ↔ Ticket yield | hooks + `ASSISTANT_DOCK_OPEN_EVENT` + LineEditPanel listener |
| **3** Push width pad | `UNBOX_STATION_PUSH_MAX_WIDTH_PAD_PX = 784` |
| **4** Guards / recipes | [`unbox-push-gutter.guard.test.ts`](../../src/components/receiving/workspace/unbox-push-gutter.guard.test.ts) |
| **5a** Geometry E2E | [`unbox-flush-display.spec.ts`](../../tests/e2e/unbox-flush-display.spec.ts) @1440/@1920 green when server up |
| **5b** Station demand | `setStationPushDemand` from UnboxPushColumn (park rail at 1440) |
| **5c** Measure hook | `data-testid="unbox-station-center"` on LineEditPanel center column |

---

## Remaining residual

### AI → Claim yield — soft-replace race

Symptom: OPEN event fires; `URLSearchParams.delete('claimView')` runs; address bar
keeps `?claimView=1`. →| clear (same `setClaimView(false)`) works. Claim→AI and
Displays→AI E2E pass.

Landed attempts: `ASSISTANT_DOCK_OPEN_EVENT`, yield before `setOpen`, live
`window.location.search` seed when clearing, `startTransition(router.replace)`,
claimView CLOSE effect is false→true only.

Re-verify when `:3050` is up. Do not restart the dev server.

### Explicit non-goals (still)

- Squaring Dashboard / Support / every Workbench grid
- Dual-right wide breakpoint; Ticket → RightRailHost; assistant `push: true`
- Procedure vocabulary / dock action maps
- `unbox-push-close-column-alignment` optical gutter

---

## Verify

```bash
npx tsx --test \
  src/lib/right-rail/frame.test.ts \
  src/components/receiving/workspace/unbox-push-gutter.guard.test.ts \
  src/components/receiving/workspace/line-edit/unbox-right-edge.test.ts
npx playwright test tests/e2e/unbox-flush-display.spec.ts --project=qa-desktop
npm run verify
```
