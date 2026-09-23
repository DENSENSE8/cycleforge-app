# Docs — Cycle Forge

**Engineering docs live in this repo** (not per-worktree copies).  
**Entry:** [`AGENTS.md`](../AGENTS.md) for the working rules, then the area folder below.

| Need | Open |
|------|------|
| Open plan dump | [todo/README.md](./todo/README.md) |
| Connections (staff + tech) | [master-connections-and-refactor/README.md](./master-connections-and-refactor/README.md) |
| Archive policy | [archive/README.md](./archive/README.md) |
| Live tickets | repo-root `master-plan.mdx` → `/forge` |

## Layout

| Folder | Role |
|--------|------|
| `todo/` | Open execution plans |
| `master-connections-and-refactor/` | Cross-feature connections |
| `operations-studio/` | Studio / engine plans |
| `integrations/`, `tenancy/`, `roadmap/`, … | Domain reference + plans |
| `partial/` | Owner-gated leftovers / human TODO |
| `diagrams/` | Architecture diagrams |
| `archive/` | Deleted or retired plan history note (git keeps blobs) |

**Code isolation** = git worktrees under `../cycleforge-*`.  
**Doc SoT** = always this `docs/` tree on the branch you merge to main.
