# Project rules — Cycle Forge

@AGENTS.md

**`AGENTS.md` (imported above) is the constitution** — hard rules, SoT invariants, Kinetic Ledger,
pattern evolution, backend patterns, build gotchas. It is portable across agents (Grok, Codex, Cursor,
Claude). This file adds **only** the Claude-native layer: which deep rules load on demand, plus
Claude-only tooling. **Don't restate `AGENTS.md` here** — that duplication is what bloats every session.

## Deep rules — load on demand (NOT auto-loaded)

Read the file when the task touches its concern. `AGENTS.md` carries the always-on summary of each;
these hold the detail + rationale:

- `.claude/rules/source-of-truth.md` — full SoT invariant list + rationale (compact table is in `AGENTS.md`).
- `.claude/rules/build-gotchas.md` — Turbopack `.ts` z-index import, Tailwind content globs.
- `.claude/rules/ui-design-system.md` + `.claude/rules/contextual-display.md` (+ `display/*`) — region contracts, density, one-row anatomy, motion.
- `.claude/rules/backend-patterns.md` — route skeleton, `transition()`, audit, tenant GUC, `Deps` injection.
- `.claude/rules/polymorphic-tables.md` — new polymorphic / typed-fact table contract.

For scoped UX/UI audits and refactors, use the **`improve-ui`** skill (critique → audit → normalize → polish, with an approval gate).

## Keep the always-on layer slim

A session's always-on cost = `CLAUDE.md` + everything it `@import`s (`grep '^@' CLAUDE.md` is the meter). Keep it lean:

- **Never `@import` a file you also summarize** — pick one. Summary + full import means the model reads the same law twice; that redundancy is the bloat.
- **Always-on = a one-line *mapping*** ("use X for Y"). Rationale, tables, and edge-cases live in an on-demand `.claude/rules/*` doc **referenced by path, never `@`** — read only when the task touches that concern.
- A **new hard law** is a one-line mapping here (or in `AGENTS.md`) **plus** a detail file on demand — not a new `@import`.

## Pattern evolution (the one discipline to hold in mind)

Full law: **`AGENTS.md` → Pattern evolution + Compound design system**. In one line:
**compose from the named SoT / registry first; grow the SoT when it is wrong or weaker than a sibling
(especially single-consumer, low blast radius); never freeze on a conservative reskin.** The user
prompt is a floor, not a ceiling — but hard safety (tenant, status machine, secrets, search waist)
stays Never / Ask-first.

## Claude-only

- **Skills** under `.claude/skills/` (`improve-ui`, `new-route`, `db-migrate`, `station-block`, …). Prefer a skill over reinventing a playbook; when a recipe is outdated, update the skill so the next run evolves.
- **Hooks are laws.** `.claude/settings.json` blocks secret-path edits, SoT regressions, `db:push`, and force-push — do not bypass. Hooks/tests are real enforcement; prose rules are recipes with an evolution path.
- **Specialized reviewers** in `.claude/agents/*` (api-route-reviewer, permission-registry-guard, neon-cost-reviewer, e2e-spec-writer).
- **Broader project context** (in-flight initiatives) lives in Claude Code per-project auto-memory, not here. Keep this file limited to the Claude-native layer.
- **Self-improve:** after a repeated miss, add a short *general* rule (paired do + don't) to the right `.claude/rules/` file — don't bloat always-on context with session notes.
