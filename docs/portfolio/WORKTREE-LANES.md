# Worktree lanes

> **Code lanes only.** All long-form docs stay under `docs/` in this repo.  
> Refresh live table: `pnpm portfolio:sot` → [INDEX.md](./INDEX.md) §1 + [DOC-CATALOG.md](./DOC-CATALOG.md).

## Convention

| | |
|--|--|
| Directory | `/Users/icecube/repos/cycleforge-<wt-id>` (sibling of `cycleforge-app`) |
| Branch | `topic/<wt-id>` for new lanes; legacy: `glass-design-system`, `studio-catalog-followups` |
| Dev server | `pnpm dev` — auto-resolves **this lane's own port** from `dev-worktrees.json`. Lanes run in **parallel** (main :3000, ai-chat :3010, fba :3020, …). No `-p`, no `PORT` export needed. |
| Switcher | `pnpm dev:switcher` → `http://127.0.0.1:3099` — start/stop any number of lanes concurrently, each on its own port |
| Tunnel | Main-only, for mobile testing: `pnpm dev:tunnel` (Cloudflare named tunnel → :3000). **Not** per-lane. |
| Unlock parked | `true` on topic trees; `false` on main dogfood |
| Docs | Edit plans on the branch in shared `docs/` paths; never a second docs root |

### Dev ports (SoT: `dev-worktrees.json` `trees[].appPort`)

Each lane owns a distinct port so several dev servers (one per agent) run at once
without colliding. `pnpm dev` inside a lane picks its port automatically; override
with `DEV_PORT`/`PORT`. Playwright's `baseURL` defaults to the same resolved port,
so `pnpm test:e2e` in a lane hits that lane's server (override via `PW_BASE_URL`).

| Lane | Port | Lane | Port |
|--|--|--|--|
| `main` | 3000 | `inventory` | 3050 |
| `ai-chat` | 3010 | `sourcing` | 3060 |
| `fba` | 3020 | `studio` | 3070 |
| `glass` | 3030 | `unbox` | 3080 |
| `home` | 3040 | `warehouse` | 3090 |
| `pending-grid` | 3100 | | |
| | | switcher panel | 3099 |

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
| `pending-grid` | `topic/pending-grid` | WS-PENDING-GRID | To-Ship Pending full spreadsheet grid — **developed in `main`** until the uncommitted predecessor base is committed (no physical worktree yet) |

## Create another lane

```bash
cd /Users/icecube/repos/cycleforge-app
git worktree add -b topic/<id> ../cycleforge-<id> HEAD
pnpm portfolio:sot
# restart pnpm dev:switcher
```

Add a §2 workstream row in INDEX if it is a new initiative.
