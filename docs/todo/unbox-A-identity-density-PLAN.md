# Plan A — Station identity density (2-row context header)

**Lane:** A · runs in parallel with B and C · **must land before B Phase 3**
**Surface:** `@/components/station/entity-context` (`CartonContextCard` + `StationContextBar`)
**Date:** 2026-07-31 · `main` @ `1c226847d`

---

## Goal

The Unbox identity bookmark today is **one condensed row** (`CartonContextCard` `density="bar"`, `space-y-1 px-0.5 py-0`, `:357`). It cannot carry the facts an operator needs at a glance. Split it into **two semantic rows**:

| Row | Left → | Right |
|---|---|---|
| **1 — context** | urgency · listing · platform · receiving type | **listing link / external open** |
| **2 — identifiers** | order # · PO # · tracking # · claim | more-details affordance |

Row 1 answers *"what kind of work is this?"*; row 2 answers *"which record is this?"*. That split is the whole design — do not mix an identifier into row 1 or a classification into row 2.

An optional **row 3** (counts: photos · units · qty) is deferred until rows 1–2 are proven; do not build it speculatively.

---

## Hard constraint — this is a family SoT

`CartonContextCard` is the **shared identity header** for Unbox, Triage, Testing, Shipping, Pack, and Pickup, composed via thin adapters (`.claude/rules/display/station-workbench.md` → layer 2). `.claude/rules/source-of-truth.md` states: *"Never fork a second condensed identity header."*

Therefore:

- **Add a density variant, do not rewrite `bar`.** `density` today is `'card' | 'bar'` (`:145`). Add `'bar-2row'` (name it in the PR, not here) so every existing adapter keeps its current rendering untouched until it opts in.
- Unbox's adapter (`LineCartonContextSection`) opts in. The other five do not, in this lane.
- Do **not** change `StationContextBar` geometry, `stationContextBarHostClass`, or the `reserveIdentityClearance` contract.

---

## Composition rules (non-negotiable)

- **Typed identifiers use the `CopyChip` family** — `OrderIdChip`, `TrackingChip`, `SerialChip`, `SkuScanRefChip`, `ListingUrlChip`. Never a new chip variant, never a hand-rolled pill (`source-of-truth.md` → Copy-chip / serial display).
- **Classification faces come from their SoTs** — `src/lib/source-platform.ts` (platform), `src/lib/receiving/receiving-type-meta.ts` (type + `ReceivingTypeMark`), `src/lib/receiving/priority-override.ts` (urgency tier). No local maps.
- **One-row anatomy per row** — title → meta → chips(right), `truncate`, no `flex-1` stretch, constant vertical padding (`ui-design-system.md`).
- **Row height must not change on state change.** Selection/edit states change fill and ring only.
- **Type roles only** — `text-role-caption` / `-eyebrow` / `-micro`. No raw px, no `font-bold` (weight cap 600, guard-enforced).
- **Spacing intents only** — `inset-chip` / `inset-field` / `row-gap`. No hand-picked `px-N py-M` pairs (`spacing-tokens.guard.test.ts`).

## The right-edge listing link

Row 1's trailing slot is the **listing / external open**. It already exists as `ListingUrlChip` and `ExternalLinkPill` (`@/components/station/workbench`) — compose one of those. Rules from `source-of-truth.md` → Link triggers apply: the trigger stays neutral and does **not** restate linked state; identity and unlink live on the chip itself.

---

## Out of scope

- No change to `StationMoreDetails` corner utilities, Refresh placement, or the pane-anchor behavior.
- No new fields on `receiving` / `receiving_lines`.
- No migration of the other five station adapters (separate lane, after this proves out).
- No row 3.

## Verification

- `npm run verify` green; **no ratchet baseline raised**, including `station-workbench-chrome.guard.test.ts`.
- Visual: Unbox identity renders two rows at 1280 / 1440 / 1920 without wrap or horizontal scroll.
- Regression: Triage, Testing, Shipping, Pack, Pickup identity headers render **pixel-identical** (they did not opt in).
- Attach to the dev server on **`:3050`** — never start, restart, or kill it.
