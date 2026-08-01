# EXECUTION PROMPT — Lane A · Station identity density

> Paste below the line into a fresh session at `/Users/icecube/repos/cycleforge-app`.
> **Plan SoT:** [`docs/todo/unbox-A-identity-density-PLAN.md`](./unbox-A-identity-density-PLAN.md) — the plan wins on conflict.
> **Parallel lane:** A. Do not touch files owned by lane B (capture stack, photo intent) or lane C (labels, notes).

---

# Cycle Forge — Lane A: two-row station identity

You are Claude Code in the Cycle Forge monorepo. One focused change to a **family source-of-truth component**.

## Mission

Give `CartonContextCard` a **two-row bar density**, opted into by Unbox only. Row 1 = classification context + listing link. Row 2 = identifiers. Every other station keeps its current one-row rendering byte-identical.

## Read first

1. `docs/todo/unbox-A-identity-density-PLAN.md` — SoT for this run.
2. `.claude/rules/display/station-workbench.md` — layer 2 (bookmark chrome) + the enforcement tiers.
3. `.claude/rules/source-of-truth.md` — Station entity-context header; Copy-chip; Link triggers.
4. `.claude/rules/ui-design-system.md` — one-row anatomy, chips, type roles, spacing intents.

## Files you own in this lane

- `src/components/station/entity-context/CartonContextCard.tsx` (708 lines)
- `src/components/station/entity-context/StationContextBar.tsx` (read-only unless geometry demands)
- `src/components/receiving/workspace/line-edit/LineCartonContextSection.tsx` (184 lines) — the Unbox adapter, the only opt-in

**Do not open or edit:** `LineEditPanel.tsx`, `PoLinesAccordion`, anything under `mobile/feed/`, any label or notes component.

## Steps

1. **Read `CartonContextCard.tsx` end to end before editing.** It is 708 lines and branches on `density` in at least six places (`:133`, `:145`, `:357`, `:364`, `:375`, `:463`, `:473`, `:698`). Map every branch first.
2. Add the new density value to the `density` union (`:145`) and its default (`:133`). Name it descriptively; state the chosen name in your report.
3. Implement the two rows per the plan's table. Row 1 trailing slot composes the existing listing/external chip — do not build a new one.
4. Opt `LineCartonContextSection` in by passing the new density. Change nothing else in that adapter.
5. Resolve every face through its SoT: `source-platform.ts`, `receiving-type-meta.ts`, `priority-override.ts`, and the `CopyChip` family. **If you find yourself writing a label map or a hex value, stop — you have missed a SoT.**

## Hard rules

- **Never fork a second identity header.** Extend the density union; do not create a sibling component.
- **The other five adapters must render identically.** Confirm by reading their call sites — none should pass the new density.
- No new chip variant. No raw px. No `font-bold`. No hand-picked padding pairs — use spacing intents.
- Row height constant across states.
- **Never raise a ratchet baseline.** If `station-workbench-chrome.guard.test.ts` fails, you have drifted from the SoT — fix the code, not the baseline.
- Dev server runs on **`:3050`** — attach only. Never start, restart, or kill it.

## Done when

- `npm run verify` green, no baseline raised.
- Unbox shows two rows; no wrap or horizontal scroll at 1280 / 1440 / 1920.
- Triage / Testing / Shipping / Pack / Pickup identity unchanged.
- Verified against the running dev server, with a screenshot of the Unbox identity band.

## Report back

1. The density value name you chose and why.
2. Every `density` branch you touched, by line.
3. Any fact you wanted on a row but could not resolve from an existing SoT.
4. Anything in the plan you believe is wrong.

Commit only when asked. Stage only files you changed — other sessions share this tree.
