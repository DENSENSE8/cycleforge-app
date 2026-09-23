# Agent work-log

Durable, human-readable memory of **what agents did**, so a session (or a new
agent) starting cold can read the last few actions instead of re-deriving state.
This is the "read the last 5–10 entries before you start; append one when you
finish" construct. Neon `cycle_forge_runs` holds machine run-telemetry; this holds
the short, legible narrative.

## Use it

```bash
pnpm worklog "unified the outbound KPI strip" --result done --ticket ALP-2.1
pnpm worklog:tail            # last 10 entries, newest first, merged across lanes
pnpm worklog:tail 20         # last 20
```

- **Before starting a task:** `pnpm worklog:tail` — read the last ~10 entries.
- **On finishing a unit of work:** append one entry describing what you did and
  the result. One line per action; keep it terse and factual.

Flags (all optional except the action): `--result <r>` · `--ticket <id>` ·
`--agent <name>` (default `$WORKLOG_AGENT` or `agent`) · `--commit <sha>` ·
`--lane <id>` (defaults to the current worktree lane).

## Schema

One entry = one markdown list item, timestamp first so it sorts machine-cleanly:

```
- `2026-07-15T04:12:33Z` · **fba** · topic/fba · claude · added FBA popover fix — merged · FBA-12 · `a1b2c3d4e5f6`
```

| Field | Source | Meaning |
|---|---|---|
| timestamp | auto (`new Date().toISOString()`) | UTC instant of the entry |
| lane | auto (`dev-worktrees.json` id / git) | which worktree lane did the work |
| branch | auto (`git branch --show-current`) | branch it was on |
| agent | `--agent` / `$WORKLOG_AGENT` | who did it |
| action — result | positional action + `--result` | what happened, how it ended |
| ticket | `--ticket` | master-plan / roadmap id, if any |
| commit | `--commit` | resolution commit, if known |

## Storage & why it's sharded

Entries live in **one append-only file per lane**: `entries/<lane>.md`. Two lanes
never write the same file, so worktree branches merge to `main` **without append
conflicts** — the same collision-avoidance logic behind one worktree lane per initiative.
`worklog:tail` globs every `entries/*.md`, merges by timestamp, and prints the
newest N, so it still reads as one log.

**Cross-lane visibility is eventual:** a lane sees another lane's entries only
after that lane's file merges into the shared branch. Within a lane it is
immediate and complete. Live cross-lane state belongs in Neon, not here.

SoT: [`scripts/worklog.mjs`](../../scripts/worklog.mjs).
