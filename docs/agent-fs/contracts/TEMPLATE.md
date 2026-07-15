---
type: contract
name: <loop-id>
trigger: <cron | webhook | manual | issue-label>
status: draft
date: <YYYY-MM-DD>
---

# Contract — `<loop-id>`

## Goal
<One sentence. The finish line. Omit only for a deliberate never-ending monitor —
say so explicitly if there's no goal.>

## Trigger
<How it starts: exact cron, webhook route, or command. e.g. `pnpm forge --next-ticket`.>

## Workflow
1. <step>
2. <step>
<Note whether this is workflow-only (no LLM) or agent-driven.>

## Boundaries / anti-goals
- Must NOT: <e.g. touch tenant scoping, status machine, secrets, run db:push, force-push>.
- Hard-safety is out of bounds regardless (hooks + CI enforce it).

## Generator / verifier
- **Generator:** <who/what produces the change>.
- **Verifier (read-only, independent):** <verify command(s), CI guards, Neon branch>.

## Backlog
<Where the queue lives — e.g. `master-plan.mdx` pending tickets, an issue label.>

## Notify
<Silent when …; message the user when … (include failing check names / exit codes).>

## Timeline
- <YYYY-MM-DD> — <what ran, outcome, what changed>.
