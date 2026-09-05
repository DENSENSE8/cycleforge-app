# HAND-OFF — the phone scan surface, inverted (Field bottom · one Card · Stack top-left)

**Written 2026-09-05 from the Impeccable critique of `/m/scan` (14/40, two P0s).**
Snapshot: `.impeccable/critique/` (slug `src-components-mobile-redesign-universalscan-tsx`).
Plan of record: [`PLAN-scan-shell-mobile.md`](PLAN-scan-shell-mobile.md) · umbrella [`PLAN-scan-shell.md`](PLAN-scan-shell.md).
Host JSON: `docs/warehouse-os/goals/scan-shell-mobile-scan-surface.goal.json` (promote to `docs/eval/goals/` when a human commits it).

Paste everything from **PROMPT** to **END** into a fresh coder session (Claude Code, Cursor, or OMP `/goal`) pointed at `~/Projects/cycleforge-app` on `main`.

---

## PROMPT

You are rebuilding the phone scan surface of Cycle Forge, `src/components/mobile/redesign/UniversalScan.tsx` (route `/m/scan`), around three primitives and nothing else. Read `docs/warehouse-os/PLAN-scan-shell-mobile.md` first. The operator's verdict on the current screen: *"terrible — mobile focused, must be bottom anchored, no text input at the top of the screen."*

**The three primitives, in order on a 390×844 phone:**

1. **The Stack** — behind the existing top-left control in `MobileTopBar`. It opens a sheet with four bands: NOW (the armed session: title · state · elapsed), EARLIER TODAY (blocks, newest first, each resumable), QUEUES (the receiving Prioritize list and the other queues, as the existing tables), FIND (the launch-index search). The pure model already exists: `src/lib/nav/stack-model.ts` (`stackModel`, `resumeBlock`). Nothing else lives in the header: remove the "+ New" button (the next scan *is* the new scan) and the three-icon mode row. The header shows the armed session title, or "Scan" when nothing is armed.
2. **The Card** — the middle of the screen shows exactly one thing at a time. Before any scan: an empty state with one sentence ("Scan a carton, a label, or a unit") and nothing else. After a scan: the Card the dispatch table names (`src/lib/scan/dispatch-table.ts` → `arrival` renders the existing `src/components/mobile/scan/ArrivalCard.tsx`; every other class renders a Card with the same shape — header with the resolved mode as a *word*, the object, one to three facts, ONE primary verb preselected with its reason, at most two secondary verbs, and "Rescan" as a secondary verb instead of "+ New"). The receiving list, the Prioritize dropdown and the UNFOUND banner leave this surface; the list is a Queue in the Stack. Map `not_found` to "Not on any inbound" with the next verb ("Photograph the label" / "Unbox anyway"); never show a snake_case enum.
3. **The Field** — a **fixed bottom dock**, `position: fixed; bottom: 0`, padded with `env(safe-area-inset-bottom)`, that never moves. It holds the one scan/type/say input (`ScanInput` → `ThemedStationScanBar`, keep the wedge path so DataWedge keystrokes still land) with its placeholder naming the destination ("Scan → Arrival", "Scan → QC · LPN 4471"), and a full-height **56 px camera cell** at the right end as the thumb target (the current 24 px glyph inside the field is not a target). The camera viewfinder opens *upward* from the dock and never pushes the Card. There is no text input anywhere above the dock. The dock's height is reserved at the bottom of the Card scroll area so the last content is never clipped.

**Dispatch stays the brain.** `dispatchScan` decides the Card; the operator never picks a mode. Keep `detectScanMode` and the carrier-overrides rule; keep `previewTrackingSeen` (a read) so a never-seen tracking opens the Arrival Card *before* anything is minted; minting is a verb on the Card ("Unbox now"), not a side effect of the scan. A tie asks one line on the Field with two answers.

**Design system, non-negotiable order of operations.** Before writing any `.tsx`: call the design MCP tools `ds_contract` with intent "phone scan surface: fixed bottom scan dock, one card, stack sheet from the top-left control", `ds_tokens` for `radius`, `spacing` and `elevation`, and `ds_critique` on `src/components/mobile/redesign/UniversalScan.tsx` and `src/components/mobile/scan/ArrivalCard.tsx`. The PreToolUse hook refuses unstamped `.tsx` writes; if a write is denied, call the tools again. Use `Button` from the design system (variant `primary` for the one verb, `secondary` for the rest), `COMPOSER_SHELL_CORNER` for the dock, `cornerClass('card')` for the Card. Never `showModeRow={false}`; never a second textarea; never a toast for a verdict; nothing animates geometry (colour and opacity only, 80 ms); `outline` for state, never `border`. Before touching `StationScanBar` or `ScanInput`, run `find_symbol` → `impact_analysis` on them (the graph hook enforces it) and prefer not to touch `StationScanBar` at all.

**Accessibility and the glove.** Every tap target ≥ 48 px. The segmented control is gone, so no icon-only tabs remain. Focus rings visible. No colour-only state: UNFOUND / EXPECTED / MATCHED get distinct glyphs, not just amber.

**Tests (node:test, `.test.ts`, jsdom + `createElement`, copy the global setup of `src/components/composer/composer-drill-menu.test.ts`):**
- `src/components/mobile/redesign/scan-surface-layout.test.ts`: the dock is the last child of the surface and carries the fixed-bottom + safe-area classes; there is exactly one `input`/`textarea` in the tree and its bounding top is below the Card region; the header contains no button labelled "New" and no `role="tablist"`.
- `src/components/mobile/redesign/scan-surface-card.test.ts`: before a scan, exactly one sentence and no list; after `dispatchScan` returns `arrival`, `section[aria-label^="Arrival"]` renders and exactly one primary `Button`; for an unfound carton the Card text contains "Not on any inbound" and never "not_found".
- Existing suites must stay green: `src/components/mobile/scan/ArrivalCard.test.ts`, `src/lib/scan/dispatch-table.test.ts`, `src/lib/nav/stack-model.test.ts`.

**Allowed files:** `src/components/mobile/redesign/UniversalScan.tsx`, `src/components/mobile/redesign/ScanInput.tsx`, `src/components/mobile/redesign/MobileTopBar.tsx`, new `src/components/mobile/redesign/MobileStackSheet.tsx`, new `src/components/mobile/redesign/ScanDock.tsx`, new `src/components/mobile/scan/CartonCard.tsx`, the two new tests. Touch nothing else. Do not run `db:migrate`. Do not commit.

**Done when:** the two new tests and the three existing suites are green; `node "$GARISEK_OS_ROOT/tools/eval-engineering/cursor-eval.mjs" --root . --fast` is green; `ds_critique` on every edited `.tsx` reports no forks; a 390×844 screenshot shows, top to bottom: header (title only), one Card or the one-sentence empty state, the fixed dock at the bottom with the 56 px camera cell — and nothing else.

**Hand back with:** the screenshot, the test output, and one paragraph naming anything in the plan you could not honour and why.

## END

---

## Verifier notes (for whoever checks the hand-back)

- Measure, do not look: the input's bounding `top` must be ≥ 700 px on an 844 px viewport with the dock closed; `document.querySelectorAll('input,textarea').length === 1`; no `[role="tablist"]` in the header.
- The Arrival Card must appear for a fresh tracking number *without* a new receiving row being created (check the receiving table count before and after).
- Refuse: any second composer, any toast for a verdict, any `showModeRow={false}`, any geometry transition, any snake_case status text.
