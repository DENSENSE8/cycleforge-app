# Agent filesystem — shared-memory artifact map

The typed **shared-memory constructs** an agent reads and writes to accumulate
knowledge across sessions and lanes. This is an **index**, not a new store:
Cycle Forge already has strong homes (a CRDT plan, org-scoped DB tables, a docs
tree). Forcing parallel `signals/` `tasks/` `tickets/` folders here would **fork
the existing domain language** — banned by [`AGENTS.md`](../../AGENTS.md) → *Compose → grow the SoT*.
So each artifact type below points to its **real home + schema + read/write entry
point**. Only genuinely-new types get a folder here (`agent-log/`, `contracts/`).

> Rule of thumb: to record something, find its type below and use *that* home.
> If a type has no home, grow the nearest SoT — don't spin up a markdown twin.

## Artifact types

| Type | Home (SoT) | Schema / contract | Read | Write |
|---|---|---|---|---|
| **Tickets** — actionable work units | [`master-plan.mdx`](../../master-plan.mdx) | `TicketStatus` = `pending \| in-progress \| deployed` (`src/lib/master-plan/ticket-status.ts`) | `forge-next-ticket.mjs`; read the file | a `<TicketStatus … />` tag; `master-plan-set-status.mjs` |
| **Tasks / plans** — multi-step designs | [`docs/todo/*.md`](../todo) (plan + `*-EXECUTION-PROMPT.md` pairs); `ops_plans` (Operations ▸ Plans) | plan-doc convention; projects to `master-plan:{ticketId}` | read `docs/todo/` | author a plan doc, register its tickets in `master-plan.mdx` |
| **Signals — operational** | `entity_signals` (DB, org-scoped) → `/operations?mode=signals`; nightly `insight_links` rollup | `SIGNAL_KINDS` (`src/lib/surfaces/registry.ts`) | Signals Timeline/Browse; assistant `get_benchmarks` | domain writers + triggers only (never free-form) |
| **Signals — human friction / ideas** | `user_reported_issues` (DB; **migration UNAPPLIED** `2026-07-11_user_reported_issues.sql`) + FeedbackWidget | `issue_type` = `bug \| suggestion \| question`; `status` = `pending \| in-progress \| deployed`; **raw-source links** = `github_issue_url`, `page_path` | `/api/user-issues`; `/signals` | FeedbackWidget → `/api/user-issues` (Neon-first, GitHub best-effort) |
| **Docs** — durable knowledge | [`context/`](../../context) (arch + `INDEX.md`), [`.claude/rules/`](../../.claude/rules) (deep rules), [`docs/portfolio/`](../portfolio) (lanes + review) | per-area | start at `context/INDEX.md` | edit in place; **never a second docs root** |
| **Logs** — cross-session narrative | [`docs/agent-log/`](../agent-log) (per-lane shards) | [`docs/agent-log/README.md`](../agent-log/README.md) | `pnpm worklog:tail` | `pnpm worklog "<action>"` |
| **Contracts** — loop definitions | [`contracts/`](./contracts) | [`contracts/README.md`](./contracts/README.md) | read the contract | author from `contracts/TEMPLATE.md` |
| **Run telemetry** — machine | Neon `cycle_forge_runs` / `_run_steps` + `/forge` | — | `/forge`, DB | `forge.sh` → `/api/forge/ingest` |

## "Signals" means two live things — don't add a third

`entity_signals` (operational reason-code events) and `user_reported_issues`
(human feedback) are both first-class. The framework's "Signals = product ideas /
friction with links to raw sources" maps onto **`user_reported_issues`** — it
already carries raw-source links (`github_issue_url`, `page_path`); PostHog errors
and Zendesk tickets are additional raw sources to link when captured. Extend that
table/flow; do not create a markdown `signals/` store.

## The loop, end to end

Signal (friction) → Ticket (`master-plan.mdx`) → **generate** (`forge.sh` Architect
plan → Coder) → **verify** (Neon CoW branch + `### VERIFY` command + CI guards) →
`deployed` + `resolution_commit` → Log (`pnpm worklog`). Generator and verifier are
separate roles — see [`contracts/README.md`](./contracts/README.md).

Related: [`docs/agent-log/README.md`](../agent-log/README.md) ·
[`docs/portfolio/WORKTREE-LANES.md`](../portfolio/WORKTREE-LANES.md) ·
[`docs/todo/agentic-loop-master-plan.md`](../todo/agentic-loop-master-plan.md).
