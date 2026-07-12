# Project rules — Cycle Forge

@AGENTS.md

Hard rules and source-of-truth invariants for this repo. Portable body lives in **`AGENTS.md`** (shared by Grok, Codex, Cursor, Claude). This file is the Claude-native entry: imports + Claude-only notes.

## Always-loaded deep rules

@.claude/rules/source-of-truth.md

@.claude/rules/build-gotchas.md

## Pattern evolution (Claude summary)

Full law: **`AGENTS.md` → Pattern evolution** + **Compound design system**. Claude must follow both on every UI/lib polish:

- **Compose first** from named SoTs / registries — do not invent *beside* them.
- **Grow the SoT** when it is wrong, incomplete, or inconsistent with a stronger sibling — especially single-consumer primitives (zero/low blast radius).
- **Never** freeze on a conservative reskin when unifying the registry primitive is the real fix.
- **Always / Ask first / Never** tiers: hard safety (tenant, status machine, secrets, search waist) stays Never/Ask; composition taste has an upgrade path.
- After a user correction: prefer a general rule in the right `.claude/rules/` file over more always-on prose; keep this file and `AGENTS.md` lean.

### Scan → recommend → compound (always on UI work)

User prompt = **floor**, not ceiling. On layout/styling/component/motion work:

1. **Scan** siblings + `@/design-system/**` + golden pages for a stronger *house* pattern (not a foreign aesthetic).
2. **Identify** the pattern in plain language and map it to a SoT path or promotion target.
3. **Recommend** always — short `### Compound opportunities` with Do now / Promote next / Deferred.
4. **Implement** when in scope or low blast radius (compose missing SoT, or grow single-consumer primitive).
5. **Ask** before multi-page migrates or new public DS APIs with many consumers.
6. Prefer changes that **raise reuse** so the next task is cheaper (exponential system benefit).

Progressive disclosure: root = index + hard laws; depth = on-demand rules/skills; hooks/tests = real enforcement.

## UI / design-system (Claude summary)

House identity is **Kinetic Ledger** — data-first reseller ops: dense, state-colored, scan-aware.
**Not** document-calm “Notion-like” chrome as the product shape. Full law: **`AGENTS.md` → Kinetic Ledger**.

Detail: `.claude/rules/ui-design-system.md`, `src/design-system/DESIGN_SYSTEM.md`.  
For scoped UX/UI audits and refactors, use the **`improve-ui`** skill — it chains critique, audit, normalize, and polish with an approval gate.

Reason in this order on every UI surface:

1. **Region contract** — station / workbench / monitor / canvas (`pickArchetype` Q1→Q4). Contracts are I/O + persistence, **not layout skins**. Algorithm: `.claude/rules/contextual-display.md`.
2. **Data shape → primary surface** — singleton / collection / stream / rollup / graph → card | list | table | board | timeline | KPI | canvas. Right pane / inspector / context rail is **optional secondary**.
3. **Density** — `floor` | `ops` | `rollup` | `studio`.
4. **Presentation kinds** — resolve labels/tones/chips/dates/capabilities/`SearchHit` via SoTs; views stay dumb.
5. **Compose / grow** named shells (rails, Monitor blocks, station scan chrome) — never page-local twins.

### Layout (density- and data-scoped, not house-wide bans)

- **Ban** random card soup and nested cards-as-rows. **Allow** boards, KPI grids in named rollup zones, Studio canvas.
- **Station (`floor`):** one focus surface (scan bar + active card); linear fact stacks inside the card.
- **Workbench (`ops`):** pick+edit with durable URL selection; primary may be list, table, board, **or** sidebar+detail — data shape decides.
- **Monitor (`rollup`):** scroll shell + named rollup zones may use responsive CSS grid. Compose `@/design-system/components/monitor` — **or grow that registry** — see `.claude/rules/display/monitor-rollup-blocks.md`.
- **Canvas (`studio`):** spatial graph; inspector secondary.

### Shared recipes (still hard)

- **Compose rails, don't rebuild them** when the job is mode-scoped pick+edit: wrap `SidebarRailShell` / `RecentActivityRailBase`; supply only renderers. If a rail primitive is wrong, improve the shared shell, don’t fork.
- **One row anatomy:** left-aligned title → meta eyebrow → chips; selection is `bg-blue-50 ring-1 ring-inset ring-blue-400` only (never a size shift).
- **Contextual info via `HoverTooltip`** (body-portal), not `title=`. Status = small dot + tooltip.
- **Icons structural & paired, never decorative;** import from `@/components/Icons`, size by context.
- **Color only from theme / semantic tokens;** typed chips via SoT. No hardcoded hex. Themes = `data-theme` + `src/design-system/themes/*`, never page-local dark hex.

## Backend patterns (Claude summary)

Detail: `.claude/rules/backend-patterns.md`.

- **Status changes only via `transition()`** — never raw `UPDATE … current_status`.
- **Route skeleton:** `withAuth` → validate → domain helper → map 404/409/200 → `recordAudit()` → `after()` side-effects. `orgId` from `ctx`, never the body.
- **Audit only via `recordAudit()`** with `AUDIT_ACTION`/`AUDIT_ENTITY` constants.
- **Idempotency:** thread `clientEventId` → `UNIQUE(client_event_id)` on `inventory_events`.
- **Tenant scope via `withTenantTransaction(orgId, …)`**.
- **Inject `Deps`** into domain fns so unit tests run DB-free.
- Incomplete domain helpers: **extend the helper** (Deps + tests), don’t re-derive logic in the route.

## Claude-only

- Skills under `.claude/skills/` (e.g. `improve-ui`, `new-route`, `db-migrate`, `station-block`). Prefer skills over reinventing playbooks; when a skill recipe is outdated, update the skill so the next run evolves the pattern.
- Hooks in `.claude/settings.json` block secret-path edits, SoT regressions, `db:push`, and force-push — do not bypass. Hooks are **laws**; prose rules are **recipes with evolution paths**.
- Specialized reviewers: `.claude/agents/*` (api-route-reviewer, permission-registry-guard, neon-cost-reviewer, e2e-spec-writer).
- Broader project context (in-flight initiatives) lives in Claude Code per-project auto-memory, not here. This file stays limited to hard rules, SoT pointers, and the pattern-evolution summary.
- Self-improve: after a repeated miss, propose a short rule update in the relevant deep doc (or a single always-on bullet in `AGENTS.md`) — general principle, paired do+don’t — then continue. Do not bloat always-on context with session notes.
