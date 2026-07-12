# Template — new portfolio workstream

Copy into [INDEX.md](../INDEX.md) §2 table and fill.

## Table row

```markdown
| WS-XXXX | Short name | [plan path](../../todo/….md) | `main` or worktree id | P0-catalog | `WS-XXXX` | — | One-line intent |
```

## Worktree (if topic)

```bash
git worktree add ../cf-topic-xxxx -b topic/xxxx main
```

`dev-worktrees.json` card:

```json
{
  "id": "xxxx",
  "label": "Short name",
  "path": "../cf-topic-xxxx",
  "appPort": 3000,
  "unlockParked": true,
  "note": "…"
}
```

INDEX §1 registry row for the path/branch.

## master-plan.mdx (optional executable tickets)

```mdx
## WS-XXXX — Short name

Long-form: docs/todo/….md · Portfolio: docs/portfolio/INDEX.md

<TicketStatus status="pending" ticketId="WS-XXXX-1" href="/docs/todo/….md" />
<TicketStatus status="pending" ticketId="WS-XXXX-HR1" href="/docs/portfolio/INDEX.md" />
```

`*-HR1` = human review gate (tunnel walk).
