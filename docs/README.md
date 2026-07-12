# Docs — Cycle Forge

**Engineering docs live in this repo** (not per-worktree copies).  
**SoT entry:** [portfolio/INDEX.md](./portfolio/INDEX.md)

| Need | Open |
|------|------|
| Plans × worktrees × human review | [portfolio/INDEX.md](./portfolio/INDEX.md) |
| Every file + DOC-id (machine) | [portfolio/DOC-CATALOG.md](./portfolio/DOC-CATALOG.md) |
| Tunnel walk checklist | [portfolio/review-protocol.md](./portfolio/review-protocol.md) |
| Open plan dump | [todo/README.md](./todo/README.md) |
| Connections (staff + tech) | [master-connections-and-refactor/README.md](./master-connections-and-refactor/README.md) |
| Archive policy | [archive/README.md](./archive/README.md) |
| Live tickets | repo-root `master-plan.mdx` → `/forge` |

```bash
pnpm portfolio:sot          # refresh DOC-CATALOG + worktree registry + switcher
pnpm portfolio:sot:check
pnpm dev:switcher           # http://127.0.0.1:3099 → dev:tunnel per tree
```

## Layout

| Folder | Role |
|--------|------|
| `portfolio/` | SoT index + catalog + review protocol |
| `todo/` | Open execution plans |
| `master-connections-and-refactor/` | Cross-feature connections |
| `operations-studio/` | Studio / engine plans |
| `integrations/`, `tenancy/`, `roadmap/`, … | Domain reference + plans |
| `partial/` | Owner-gated leftovers / human TODO |
| `diagrams/` | Architecture diagrams |
| `archive/` | Deleted or retired plan history note (git keeps blobs) |

**Code isolation** = git worktrees under `../cycleforge-*`.  
**Doc SoT** = always this `docs/` tree on the branch you merge to main.
