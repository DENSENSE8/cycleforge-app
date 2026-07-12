# Worktree lanes

> **Code lanes only.** All long-form docs stay under `docs/` in this repo.  
> Refresh live table: `pnpm portfolio:sot` → [INDEX.md](./INDEX.md) §1 + [DOC-CATALOG.md](./DOC-CATALOG.md).

## Convention

| | |
|--|--|
| Directory | `/Users/icecube/repos/cycleforge-<wt-id>` (sibling of `cycleforge-app`) |
| Branch | `topic/<wt-id>` for new lanes; legacy: `glass-design-system`, `studio-catalog-followups` |
| Switcher | `dev-worktrees.json` · `pnpm dev:switcher` · always `dev:tunnel` · port **3000** |
| Unlock parked | `true` on topic trees; `false` on main dogfood |
| Docs | Edit plans on the branch in shared `docs/` paths; never a second docs root |

## Lanes (target registry)

| WT-ID | Branch | WS-ID | Surface / purpose |
|-------|--------|-------|-------------------|
| `main` | `main` / current integration branch | WS-DOGFOOD | Stations + shipping dogfood |
| `glass` | `glass-design-system` | WS-GLASS | Glass design system |
| `studio` | `studio-catalog-followups` | WS-STUDIO | Studio / catalog |
| `fba` | `topic/fba` | WS-FBA | FBA prep (parked on main) |
| `inventory` | `topic/inventory` | WS-INV | Inventory workbench (parked) |
| `warehouse` | `topic/warehouse` | WS-WH | Warehouse map (parked) |
| `sourcing` | `topic/sourcing` | WS-SRC | Sourcing hub (parked) |
| `ai-chat` | `topic/ai-chat` | WS-AI | AI chat (parked) |
| `home` | `topic/home` | WS-HOME | My Day / home (parked) |

## Create another lane

```bash
cd /Users/icecube/repos/cycleforge-app
git worktree add -b topic/<id> ../cycleforge-<id> HEAD
pnpm portfolio:sot
# restart pnpm dev:switcher
```

Add a §2 workstream row in INDEX if it is a new initiative.
