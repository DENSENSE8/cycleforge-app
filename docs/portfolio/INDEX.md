# Portfolio INDEX — SoT catalog

> **Status:** Living SoT · 2026-07-12  
> **Hub:** [README.md](./README.md) · **Lanes:** [WORKTREE-LANES.md](./WORKTREE-LANES.md) · **Review:** [review-protocol.md](./review-protocol.md)  
> **Catalog:** [`DOC-CATALOG.md`](./DOC-CATALOG.md) (158 files, regenerated 2026-07-12) · run `node scripts/portfolio-sot-sync.mjs`
> **Live tickets:** [`master-plan.mdx`](../../master-plan.mdx) → `/forge` or usav-dev  
> **Switcher:** [`dev-worktrees.json`](../../dev-worktrees.json) · `pnpm dev:switcher`

Human SoT for **workstreams**, **worktrees**, **phases**, and **human review**.  
Machine SoT for **every `docs/**` file**: [DOC-CATALOG.md](./DOC-CATALOG.md) (`DOC-*` ids, sorted).

Docs stay in this monorepo. Worktrees are **code lanes** only ([WORKTREE-LANES.md](./WORKTREE-LANES.md)).

---

## 0. Dogfood surface (`main` / integration branch)

| Surface | Routes | Review |
|---------|--------|--------|
| Orders / Shipping | `/dashboard` | continuous |
| Receiving | `/unbox` `/triage` `/incoming` `/pickup` … | continuous |
| Packing | `/pack` | continuous |
| Testing | `/test` | continuous |
| Outbound | `/outbound` | continuous |
| Operations | `/operations` | continuous |
| Support / Admin / Settings | bottom nav | continuous |

**Parked** (stand-in until promote): FBA, Studio, Inventory, Warehouse, Sourcing, AI Chat, Home → build on topic worktrees.

---

## 1. Worktree / branch registry (live)

> Snapshot from `git worktree list` + `dev-worktrees.json`. Refresh via
> `node scripts/portfolio-sot-sync.mjs`.

| WT-ID | Absolute path | Branch | HEAD | Switcher card | Unlock parked | Workstreams |
|-------|---------------|--------|------|---------------|---------------|-------------|
| `main` | `/Users/icecube/repos/cycleforge-app` | `main` | `370521de9` | yes · :3000 | no | WS-DOGFOOD + lane=main |
| `ai-chat` | `/Users/icecube/repos/cycleforge-ai-chat` | `topic/ai-chat` | `3f55b275e` | yes · :3000 | yes | WS-AI |
| `fba` | `/Users/icecube/repos/cycleforge-fba` | `topic/fba` | `3f55b275e` | yes · :3000 | yes | WS-FBA |
| `glass` | `/Users/icecube/repos/cycleforge-glass` | `glass-design-system` | `a331b1247` | yes · :3000 | yes | WS-GLASS |
| `home` | `/Users/icecube/repos/cycleforge-home` | `topic/home` | `3f55b275e` | yes · :3000 | yes | WS-HOME |
| `inventory` | `/Users/icecube/repos/cycleforge-inventory` | `topic/inventory` | `3f55b275e` | yes · :3000 | yes | WS-INV |
| `sourcing` | `/Users/icecube/repos/cycleforge-sourcing` | `topic/sourcing` | `3f55b275e` | yes · :3000 | yes | WS-SRC |
| `unbox` | `/Users/icecube/repos/cycleforge-unbox` | `unbox-work` | `370521de9` | yes · :3000 | yes | — |
| `warehouse` | `/Users/icecube/repos/cycleforge-warehouse` | `topic/warehouse` | `3f55b275e` | yes · :3000 | yes | WS-WH |

**Relative paths (for switcher / docs):**

| WT-ID | Path relative to monorepo parent |
|-------|----------------------------------|
| `main` | `.` (parent: `cycleforge-app`) |
| `ai-chat` | `../cycleforge-ai-chat` (parent: `cycleforge-ai-chat`) |
| `fba` | `../cycleforge-fba` (parent: `cycleforge-fba`) |
| `glass` | `../cycleforge-glass` (parent: `cycleforge-glass`) |
| `home` | `../cycleforge-home` (parent: `cycleforge-home`) |
| `inventory` | `../cycleforge-inventory` (parent: `cycleforge-inventory`) |
| `sourcing` | `../cycleforge-sourcing` (parent: `cycleforge-sourcing`) |
| `unbox` | `../cycleforge-unbox` (parent: `cycleforge-unbox`) |
| `warehouse` | `../cycleforge-warehouse` (parent: `cycleforge-warehouse`) |

**Add a tree:**

1. `git worktree add ../cycleforge-<id> -b <branch> main`
2. Row appears after re-run of `portfolio-sot-sync.mjs`
3. Card in `dev-worktrees.json` (`script: dev:tunnel`, `appPort: 3000`)
4. Workstream row in §2 with matching WT-ID
5. Restart `pnpm dev:switcher`

## 2. Workstream catalog (sorted by WS-ID)

**Phase:** `P0-catalog` → `P1-branch` → `P2-build` → `P3-tunnel` → `P4-human-review` → `P5-promote` → `P6-done`  
**Review:** `—` · `needed` · `approved` · `changes`

| WS-ID | Name | Primary docs | Lane (WT-ID) | Phase | Tickets | Review |
|-------|------|--------------|--------------|-------|---------|--------|
| WS-AI | AI chat | `/ai-chat` · diagrams AI | **`ai-chat`** | P1-branch | `WS-AI` | — |
| WS-ALP | Agentic loop | [todo/agentic-loop…](../todo/agentic-loop-master-plan.md) | `main` | P5-promote | `ALP-*` | needed |
| WS-BETA | Beta intake | [todo/beta-intake…](../todo/beta-intake-funnel-plan.md) | `main` | P0-catalog | — | — |
| WS-CONN | Connections | [master-connections](../master-connections-and-refactor/README.md) · live MDX · `connections_gap_adoption` | `main` | P3-tunnel | `CONN-*` (74) + org template | needed | P1 MDX fold + P2 adoption template shipped |
| WS-DEV | Dev workflow | [dev-workflow/](../dev-workflow/) | `main` | P6-done | — | — |
| WS-DIAG | Diagrams | [diagrams/](../diagrams/) | `main` | P6-done | — | — |
| WS-DOGFOOD | Stations + shipping | product default | `main` | P6-done | — | continuous |
| WS-DS | Design system | [design-system/](../design-system/) | `main` | P2-build | — | — |
| WS-ENGINE | Ops events / engine | [todo/ops-events…](../todo/ops-events-station-workflow-unification-plan.md) | `main` | P2-build | — | — |
| WS-FBA | FBA prep | FBA diagrams + `/fba` | **`fba`** | P1-branch | `WS-FBA` | — |
| WS-GLASS | Glass DS | [todo/GLASS…](../todo/GLASS-DESIGN-SYSTEM.md) | **`glass`** | P2-build | `WS-GLASS` | needed |
| WS-HOME | Home triage/collab · Ops TV | [todo/home-ops-tv-collab…](../todo/home-ops-tv-collab-surfaces-plan.md) · my-day | **`home`** + `main` | P2-build | `HOME-OPS-*` | — | A–C shipped on main 2026-07-12 (TV board `?tv=1` + `operations.tv.view`); D–F next |
| WS-INT | Integrations | [integrations/](../integrations/) + todo oauth | `main` | P2-build | — | — |
| WS-INV | Inventory | inventory UI | **`inventory`** | P1-branch | `WS-INV` | — |
| WS-LOGIN | Org login | [todo/org-login-gate…](../todo/org-login-gate-EXECUTION-PROMPT.md) | `main` | P4-human-review | — | needed |
| WS-NEW | New-additions | [new-additions/](../new-additions/) | `main` | P0-catalog | — | — |
| WS-ONB | Onboarding | [todo/onboarding…](../todo/onboarding-foundational-plan.md) | `main` | P0-catalog | — | — |
| WS-PARK | Park soft-gate | `src/lib/dogfood/parked-surfaces.ts` | `main` | P5-promote | `WS-PARK` | needed |
| WS-PARTIAL | Partial / human | [partial/](../partial/) | `main` | P2-build | — | owner |
| WS-PLATFORM | Platform runbooks | architecture, tier0, branding, qa… | `main` | P2-build | — | — |
| WS-POLY | Polymorphic schema | [todo/schema-wide…](../todo/schema-wide-polymorphic-refactor-plan.md) | `main` | P2-build | — | — |
| WS-PORTFOLIO | Portfolio hub | [portfolio/](./) | `main` | P6-done | — | continuous |
| WS-RECV | Receiving plans | receiving-* returns visual-identify | `main` | P2-build | — | — |
| WS-ROADMAP | Roadmap | [CYCLE-FORGE-ROADMAP](../CYCLE-FORGE-ROADMAP) · [roadmap/](../roadmap/) | `main` | P2-build | `P1-*` | — |
| WS-ROI | Highest-ROI ops | [todo/highest-roi…](../todo/highest-roi-ops-ui-execution-plan.md) | `main` | P2-build | `ROI-*` | needed |
| WS-SAAS | SaaS / billing | [todo/saas-…](../todo/saas-commercialization-plan.md) | `main` | P2-build | — | owner |
| WS-SEARCH | Search | unified-global-search · unit-event | `main` | P2-build | — | — |
| WS-SERIAL | Serial pairing | [todo/serial-label…](../todo/serial-label-pairing-split-combine-plan.md) | `main` | P2-build | — | — |
| WS-SHIP | Shipping docs | outbound · shipstation · zoho-fulfillment | `main` | P2-build | — | — |
| WS-SKILLS | Skills notes | [skills/](../skills/) | `main` | P0-catalog | — | — |
| WS-SRC | Sourcing | [todo/sourcing-hub…](../todo/sourcing-hub-integration-plan.md) | **`sourcing`** | P1-branch | `WS-SRC` | — |
| WS-STATION | Station chassis | station-chassis · testing-vs-receiving | `main` | P2-build | — | — |
| WS-STUDIO | Studio | [operations-studio/](../operations-studio/) · todo studio-* | **`studio`** | P2-build | `WS-STUDIO` | — |
| WS-SUB | Substitution | [todo/tech-substitution…](../todo/tech-substitution-wiring-plan.md) | `main` | P2-build | — | — |
| WS-SYNC | USAV sync | [todo/cycleforge-sync…](../todo/cycleforge-sync-from-usav-2026-07-10.md) | `main` | P0-catalog | — | — |
| WS-TENANCY | Tenancy | [tenancy/](../tenancy/) | `main` | P2-build | — | owner |
| WS-UNBOX | Unbox UX | [todo/unbox-receive…](../todo/unbox-receive-ux-improvement-plan.md) | `main` | P2-build | — | needed |
| WS-VOICE | Nextiva | [todo/nextiva…](../todo/nextiva-voice-support-mode-plan.md) | `main` | P0-catalog | — | — |
| WS-WH | Warehouse | [todo/warehouse-map…](../todo/warehouse-map-react-flow-plan.md) | **`warehouse`** | P1-branch | `WS-WH` | — |

### Human review log

| Date | WS-ID | Reviewer | Result | Notes |
|------|-------|----------|--------|-------|
| 2026-07-12 | WS-PARK | — | needed | Parked stand-ins on tunnel |
| 2026-07-12 | — | — | — | Topic worktrees created for fba/inventory/warehouse/sourcing/ai-chat/home |

---

## 3. Document coverage

**All paths:** [DOC-CATALOG.md](./DOC-CATALOG.md) (regenerate: `pnpm portfolio:sot`).

| Rule | Action |
|------|--------|
| New file under `docs/` | `pnpm portfolio:sot` |
| New worktree | `git worktree add` → `pnpm portfolio:sot` |
| New initiative | §2 WS-ID row + optional path map in `scripts/portfolio-sot-sync.mjs` |
| Plan shipped | Delete or archive policy ([../archive/README.md](../archive/README.md)); phase `P6-done` |

---

## 4. master-plan.mdx bridge

| Tickets | WS-ID |
|---------|-------|
| `ALP-*` | WS-ALP |
| `ROI-*` | WS-ROI |
| `CONN-*` | WS-CONN |
| `WS-*` | matching §2 |
| `P1-*` / `P2-*` | WS-ROADMAP |

Human **approved** → INDEX log; ticket **`deployed`** only after promote + VERIFY.

---

## 5. Commands

```bash
pnpm portfolio:sot
pnpm portfolio:sot:check
pnpm dev:switcher          # :3099
git worktree list
```
