# Loop contracts

A **contract** is the README for one autonomous loop: what it is allowed to do,
how it runs, and how it ends. An agent (or a human) should be able to read one
contract and know the loop's goal, workflow, boundaries, backlog, and cadence
without reverse-engineering scripts. This formalizes the shape the `loopany`
guard-sweep already uses — promoted into a convention.

## Required sections

Every contract (`contracts/<name>.md`, or the loop's own README linked from the
registry) must define:

| Section | What it pins down |
|---|---|
| **Goal** | The finish line in one sentence. A loop with a goal self-completes when met; without one it runs indefinitely (a monitor). |
| **Trigger** | How it starts — cron, webhook, server incident, or manual (`forge.sh <req>` / `--next-ticket`). |
| **Workflow** | The ordered steps, and whether it's workflow-only (no LLM) or agent-driven. |
| **Boundaries / anti-goals** | What it must NOT touch. Hard-safety (tenant, status machine, secrets, search waist, `db:push`, force-push) is always out of bounds — enforced by `.claude/settings.json` hooks + CI guards regardless. |
| **Generator / verifier** | Which role generates and which *independently* verifies (see below). Name the verify command(s). |
| **Backlog** | Where its queue lives (e.g. `master-plan.mdx` pending tickets). |
| **Timeline** | Append-only run notes — dated outcomes, what changed. |
| **Notify** | When it speaks vs stays silent (e.g. silent on all-green, message on failure). |

Front-matter on any failure/report output: `type: <vocab-word>` · `title:` ·
`date: YYYY-MM-DD` (PST). Mirror the guard-sweep's `type: alert`.

## Generator / verifier separation (required)

A loop that writes code must keep **generation** and **verification** in separate
roles — the generator never grades its own work:

- **Generator** produces the change. Forge: the Architect emits a Markdown File
  Manifest (`.cycle_forge_ops/prompts/ARCHITECT_SYSTEM.md`, *writes no code*) →
  the Coder executes it (`CODER_SYSTEM.md`).
- **Verifier** is read-only and tests against the spec: the manifest's
  `### VERIFY` command(s), CI guards (`audit-route-auth:enforce`, `test:ds-guards`,
  tenancy canary), and a **Neon CoW branch** (`forge-verify-branch.mjs`,
  `assertNotProductionUrl`) so DB tests never touch production.

## Registry

| Loop | Trigger | Generator → Verifier | Contract |
|---|---|---|---|
| **guard-sweep** | cron `0 9 * * 1-5` (loopany) | workflow-only (no LLM) → 4 guard checks | [`loopany/guard-sweep/README.md`](../../../loopany/guard-sweep/README.md) |
| **forge** | manual / Telegram / `forge.sh --next-ticket` | Architect plan → Coder → Neon-branch verify + CI | [`.cycle_forge_ops/prompts/`](../../../.cycle_forge_ops/prompts) + `forge.sh` |
| **claude-fix-issue** | GitHub issue label | agent fix → CI | [`.github/workflows/claude-fix-issue.yml`](../../../.github/workflows/claude-fix-issue.yml) |

New loop → copy [`TEMPLATE.md`](./TEMPLATE.md), fill every required section, add a
registry row. Keep the detail in the loop's own home; this registry stays thin.
