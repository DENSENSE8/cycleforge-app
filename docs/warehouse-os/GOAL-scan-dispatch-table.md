# Overnight GOAL — G1 · scan dispatch table (mobile, pure)

**Host:** Garisek goal-run (Hermes coder hop). **Human:** verify twenty scans on a phone after land.
**Plan:** [`PLAN-scan-shell-mobile.md`](PLAN-scan-shell-mobile.md). **Host JSON:** `docs/eval/goals/scan-dispatch-table.goal.json`.
**Do not expand this goal.** One verb: the table. Stop when the gate is green.

## OMP

```text
cd ~/Projects/cycleforge-app
omp
@docs/warehouse-os/PLAN-scan-shell-mobile.md
```

```text
/goal A pure scan dispatch table decides the Card and session title from scan class × object state: carrier tracking never seen → arrival; tracking known → the carton's stage; LPN or SSCC with open QC → qc; LPN staged for pack → pack; bin paired to a pending order → pack; bin unpaired, serial, SKU, kit, ticket → preview. No armed session → every scan previews; armed session → an expected class acts, any other class previews and parks nothing; prior state wins and a tie asks. Add carrier-tracking, sscc and bin-paired-order classes to src/lib/barcode-routing.ts without changing the eight existing classes. Done when src/lib/scan/dispatch-table.test.ts, src/lib/barcode-routing.test.ts and verify:fast are green.
```

## GOAL

`src/lib/scan/dispatch-table.ts` exports a pure `dispatchScan({ scan, state, armedSession })` returning `{ card, title, mode: 'act' | 'preview' | 'ask', reason }`. `barcode-routing.ts` gains `carrier-tracking`, `sscc` and `bin-paired-order` classes (detection only; pairing lookup is an injected dep). Nothing renders.

## HOW IT MUST FUNCTION

- Class detection: UPS `1Z…`, USPS 20/22-digit, FedEx 12/15/20-digit, DHL 10-digit → `carrier-tracking`; GS1 `(00)` / 18-digit → `sscc`. Existing eight classes keep their exact matchers and tests.
- State is an input, never fetched: `{ trackingSeen, qcOpen, stagedForPack, binOrderId }`.
- Titles are data: `Arrival · UPS 4471`, `QC · LPN 4471`, `Pack · 04-1234`. Template strings in one place.
- Preview vs act is state, not a switch. Ambiguity → prior state wins; only a true tie returns `mode: 'ask'` with the two candidates.
- Every result carries `destination` in words (the placeholder text).
- Graph: `find_symbol` → `impact_analysis` on `routeScan` / `detectScanType` before editing `barcode-routing.ts`.
- Gate: `node "$GARISEK_OS_ROOT/tools/eval-engineering/cursor-eval.mjs" --root . --fast`.

## HOW IT MUST NOT FUNCTION

- Do **not** touch any React component, route, or `/m/*` page.
- Do **not** change `wedge-scan-machine.ts`, `work_sessions`, or any migration.
- Do **not** fetch state inside the table. No DB, no fetch, no provider.
- Do **not** re-order or rename the eight existing `ScanType` members.
- Do **not** add a fourth mode. `act` · `preview` · `ask` only.

## ALLOWED FILES

- `src/lib/scan/dispatch-table.ts` (+ `dispatch-table.test.ts`)
- `src/lib/barcode-routing.ts` (+ existing `barcode-routing.test.ts`, extend only)
- This GOAL file

## DONE WHEN

1. `npx tsx --test src/lib/scan/dispatch-table.test.ts` green: ≥ 12 cases covering every row of the plan's dispatch table, both preview-vs-act rules, and one tie.
2. `src/lib/barcode-routing.test.ts` green with the three new classes added and the eight old ones unchanged.
3. `verify:fast` green.

## STOP

Do not build the Card, the Stack, or any screen. Hand back for the G2 goal.
