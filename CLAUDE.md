# Project rules — Cycle Forge

@AGENTS.md

**`AGENTS.md` is the constitution** — product frame, regions, and hard laws.

## Claude-only

- **Skills** under `.claude/skills/`. Prefer a skill over reinventing a playbook.
- **Hooks are laws.** `.claude/settings.json` blocks secret-path edits, `db:push`,
  and force-push — do not bypass.
- **Specialized reviewers** in `.claude/agents/*`.
- **Two rule tiers.** `.claude/rules/*.md` is always-on (~690 lines); the depth is
  on-demand in [`docs/rules/`](docs/rules/) — **read the one your task touches.**
  The three-line files under `.claude/rules/display/` are pointers, not content.
- **Self-improve:** grow `AGENTS.md` with a one-line hard law when a live invariant
  is missing. New depth goes in `docs/rules/` — do not grow the always-on prompt.
