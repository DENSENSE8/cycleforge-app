# Project rules — Cycle Forge

@AGENTS.md

**`AGENTS.md` is the constitution** — product frame, regions, and hard laws.

## Claude-only

- **Skills** under `.claude/skills/`. Prefer a skill over reinventing a playbook.
- **Hooks are laws.** `.claude/settings.json` blocks secret-path edits, `db:push`,
  and force-push — do not bypass.
- **Specialized reviewers** in `.claude/agents/*`.
- **Self-improve:** grow `AGENTS.md` with a one-line hard law when a live invariant
  is missing — do not revive archived rule files into the always-on prompt.
