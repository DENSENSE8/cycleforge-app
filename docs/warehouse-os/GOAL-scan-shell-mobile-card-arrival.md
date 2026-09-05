# Overnight GOAL — G2 · the Arrival Card on the phone

**Host:** Garisek goal-run. **Human:** one carton, one phone, after land.
**Plan:** [`PLAN-scan-shell-mobile.md`](PLAN-scan-shell-mobile.md). **Host JSON:** `docs/eval/goals/scan-shell-mobile-card-arrival.goal.json`.
**Depends on:** G1 landed (`src/lib/scan/dispatch-table.ts` at HEAD).
**Do not expand this goal.** One Card. Stop when the gate is green.

## OMP

```text
/goal On /m/scan a carrier tracking number that has never been seen opens the Arrival Card: header "◀ Stack · Arrival · {carrier} {last4}", the tracking string, one to three facts, two photo inputs (label, box) through usePhotoDropzone and downscaleImageTo720, then ONE primary action preselected with its reason — "Unbox now · N orders waiting" or "Rack it for later" — decided by a pure arrivalRecommendation({ pendingOrdersForCarton, rackCapacity }). Choosing either writes one ops event and titles the armed session from the dispatch table. The Field stays the phone's StationComposerHost with faces off and its placeholder names Arrival. Done when src/lib/scan/arrival-card.test.ts and verify:fast are green.
```

## GOAL

A never-seen tracking scan on the universal scanner renders `ArrivalCard` (one screen: object · facts · photo inputs · one primary + one secondary) and names the session. The recommendation is a pure function with a reason string.

## HOW IT MUST FUNCTION

- Dispatch comes from `dispatchScan` (G1). This goal only renders the `arrival` card and wires its two verbs.
- `src/lib/scan/arrival-card.ts` exports `arrivalRecommendation(...)` and `arrivalTitle(...)`, pure, tested.
- Photos: `usePhotoDropzone` + `downscaleImageTo720`; the existing receiving photo write path. No new upload endpoint.
- The primary verb is a design-system `Button` `variant="primary"`; the secondary is `variant="secondary"`. `ds_contract`, `ds_tokens` (radius, spacing), `ds_critique` before writing any `.tsx`.
- Feedback after a verb lands on the mouth's `reaction` slot (`WeldedFeedbackPanel`), never a toast.
- The session title is set through the existing work-session write path; `surface_key` = `arrival`.
- Gate: cursor-eval `--fast`; `pnpm run eval:station unbox -- --skip-verify` only if `StationComposerHost` props change (they must not).

## HOW IT MUST NOT FUNCTION

- Do **not** add a bottom tab, drawer leaf, or route. The Card mounts inside `/m/scan`.
- Do **not** mount a second textarea or a second `StationComposerHost`.
- Do **not** call the model between the scan and the Card. The recommendation is pure.
- Do **not** touch QC, Pack, or the Stack.
- Do **not** animate geometry. Colour and opacity only.
- Do **not** pass `showModeRow={false}`.

## ALLOWED FILES

- `src/lib/scan/arrival-card.ts` (+ `.test.ts`)
- `src/components/mobile/scan/ArrivalCard.tsx` (new)
- `src/components/mobile/redesign/RedesignedMobileUniversalScan.tsx` (mount only)
- This GOAL file

## DONE WHEN

1. `npx tsx --test src/lib/scan/arrival-card.test.ts` green: recommendation picks *Unbox now* when ≥ 1 pending order waits on the carton, *Rack it* otherwise, with a reason; the title matches G1.
2. `verify:fast` green.
3. `ds_critique` on `ArrivalCard.tsx` reports no forks.

## STOP

Do not start QC or Pack Cards. Hand back for G3 (the Stack).
