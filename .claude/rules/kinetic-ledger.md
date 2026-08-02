# Kinetic Ledger — the product UI identity

The house identity every UI task inherits. Summarized in root [`AGENTS.md`](../../AGENTS.md); this file
holds the identity statement and the five laws.

Cycle Forge UI is **Kinetic Ledger**: data-first reseller ops — dense, state-colored, scan-aware,
multi-tenant. **Legible throughput** over document calm; calm chrome (Linear discipline), not document
whitespace as the product shape.

**Better** means stronger *within* this family and house tokens — never a foreign kit or a second
design language. Industry blend: ops density (Carbon / Stripe Dashboard) + Linear chrome + POS/scan
floors + Studio canvas.

Code north star: `src/design-system/DESIGN_SYSTEM.md`.

## Five laws

1. **Facts and state drive chrome** — chrome never invents a second story.
2. **Archetypes are region contracts** (I/O + persistence), not layout skins.
3. **Data shape chooses the primary surface** — table | list | board | card | timeline | KPI zones | canvas.
4. **Presentation kinds resolve via SoT** — labels, tones, chips, dates, capabilities, search hits;
   views stay dumb.
5. **Compose named shells / blocks; grow the SoT when wrong; compound every UI task.**

## Always ban

- Random card soup.
- Nested cards-as-rows.
- A second visual language beside Kinetic Ledger tokens. *(Changing WHICH face
  serves a cut is not that — the sans cut moved to Inter 2026-08-02. Adding a
  FOURTH slot, a display/heading face beside sans/condensed/mono, is.)*

Boards, KPI grids in named rollup zones, and Studio canvas are valid primaries when the data shape
requires them — the bans above are about *decorative* structure, not about which surface wins.

## Color

Only from semantic / theme tokens (`bg-surface-card`, `border-border-soft`, `text-text-*`). No
page-local hex; themes via `data-theme` + `src/design-system/themes/*`.

## Detail lives on-demand (read when the task touches it)

- Region contracts (Station / Workbench / Monitor / Canvas), data-shape → surface, `pickArchetype` —
  [`contextual-display.md`](contextual-display.md) (+ [`display/`](display/)).
- Density modes (`floor` / `ops` / `rollup` / `studio`), one-row anatomy, chips, tokens,
  `HoverTooltip`, paired icons — [`ui-design-system.md`](ui-design-system.md).
- Monitor rollup blocks (compose from `@/design-system/components/monitor`, or grow the registry) —
  [`display/monitor-rollup-blocks.md`](display/monitor-rollup-blocks.md).
- Presentation-kind SoTs (dates, condition, platform, capabilities, search hits) —
  [`source-of-truth.md`](source-of-truth.md).
- Composition discipline (compose → grow → compound) — [`pattern-evolution.md`](pattern-evolution.md).
