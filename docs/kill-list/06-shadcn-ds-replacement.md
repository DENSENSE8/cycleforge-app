# shadcn replaces the design system — decision record + conflict

**Operator decision (2026-08-20):** shadcn UI replaces Kinetic Ledger primitives; app code
imports shadcn components directly; `AGENTS.md` gets amended as part of the work.

This file exists because that decision **contradicts four active house laws**. It was raised
before the decision and reaffirmed after. Recording it so the amendment is deliberate rather
than discovered halfway through a wave.

## What it breaks

| Law | Where | What it says |
|---|---|---|
| No foreign kit | `kinetic-ledger.md` → *Always ban* | "A second visual language beside Kinetic Ledger tokens." |
| Do not paint over primitives | `AGENTS.md` → Hard laws | `<Button>` fills and `<Panel>` radii resolve through semantic variants — never `className` hue/radius overrides. Grow `button-variants.ts` instead. |
| Ops chrome is flush-square | `AGENTS.md`, `kinetic-ledger.md` | `cornerClass('flush')`; `rounded-full` survives only for status dots · avatars · Switch tracks. **shadcn new-york ships rounded-md by default** — every generated component violates this until retokenized. |
| Ask first | `pattern-evolution.md` → *Ask first* | "Introducing a **second** visual or domain language without merging or deleting the old one." |

## Scale

**1,677 parked call sites** across the DS ratchet baselines. This is not a session; it is the
largest single migration in the tree. The ratchet law still applies during it:
**baselines only shrink**, and `--no-verify` is never the answer.

## What is already true (and reduces the work)

`components.json` is already configured to generate shadcn **into** the design system:

```json
"aliases": { "components": "@/design-system", "ui": "@/design-system/primitives" }
```

Radix — shadcn's actual engine — is already a direct dependency (7 packages: dialog,
dropdown-menu, popover, checkbox, switch, alert-dialog, context-menu). So the primitives are
partly shadcn-shaped already. `"cssVariables": false` and `"baseColor": "neutral"` are the two
settings that will fight the token system hardest.

## The cheap path vs the declared path

**Declared (operator's choice):** retire Kinetic Ledger primitives; app code imports shadcn
directly. Requires amending all four laws above and rewriting `kinetic-ledger.md`'s identity
statement.

**Cheap alternative, for the record only:** flip `cssVariables: true`, point shadcn's tokens at
`@/design-system/tokens`, keep `Button`/`Panel` as the public face with shadcn/Radix underneath.
~90% of the mechanical benefit, zero law amendments, no second language window. This was offered
and not chosen; it is written here so the trade is visible when the wave is scheduled, not
re-litigated.

## Sequencing requirement

Whichever path runs: **do not start it before the two ports land.** `/shipping/orders` and
`/tech` are the proof that the Unbox frame generalizes. Porting surfaces onto a frame while
simultaneously swapping the primitives underneath that frame means neither result can be
attributed when something breaks.

Order: ports first → frame proven → then primitives.

## Required before wave 1 of this migration

1. Amend `AGENTS.md` hard laws + `kinetic-ledger.md` *Always ban* in the same commit that lands
   the first shadcn component. A rule that silently stops being true is the exact failure
   `pattern-evolution.md` law 6 was written about.
2. Decide the `rounded-*` ruling. Kinetic Ledger is **zero-radius industrial**; shadcn new-york
   is not. Either retokenize shadcn to flush-square, or the identity changes — say which.
3. Add the shrink-only allowlist guard naming surviving Kinetic-Ledger call sites, so the
   migration has a ratchet instead of a vibe.
