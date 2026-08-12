# Project rules — Cycle Forge

@AGENTS.md

**`AGENTS.md` is the constitution** — product frame, region hosts, SoT tables, and
hard laws. Deep historical detail lives in `.claude/legacy-rules-archive/` (not
loaded). For a job, run `node scripts/sot-lookup.mjs "<job>"` before composing UI.

## Claude-only

- **Skills** under `.claude/skills/` (`improve-ui`, `new-route`, `db-migrate`,
  `station-block`, …). Prefer a skill over reinventing a playbook.
- **Hooks are laws.** `.claude/settings.json` blocks secret-path edits, SoT
  regressions, `db:push`, and force-push — do not bypass.
- **Specialized reviewers** in `.claude/agents/*`.
- **Self-improve:** grow `AGENTS.md` (one-line hard law) + regenerate
  `sot-manifest.json` when a live invariant is missing — do not revive archived
  rule files into the always-on prompt.
