# Cycle Forge — agent instructions

Portable hard rules for every coding agent (Claude, Grok, Codex, Cursor, …).
Depth lives in `.claude/rules/` — read those when the task touches the concern.

## Product

**Cycle Forge** is multi-tenant reseller-ops SaaS. This repo is the app; USAV is the dogfood tenant.
Vendor integrations (Zoho, Zendesk, …) are tenant connectors behind **capability facades** — never the product itself.
Operator copy uses capability nouns or runtime provider labels, never hardcoded vendor product sentences (except Integrations hub / deep links).

## Workflow & safety

- **One worktree lane per initiative.** A distinct addition/surface gets its own worktree
  (`../cycleforge-<id>` on `topic/<id>`), registered in
  [`docs/portfolio/WORKTREE-LANES.md`](docs/portfolio/WORKTREE-LANES.md) + `dev-worktrees.json`
  (`pnpm dev:switcher`). Prefer the matching lane over piling unrelated work onto one branch.
  `main` is the **integration / dogfood lane** (WS-DOGFOOD) — dogfood-surface fixes and integration,
  not large parked-surface builds (e.g. WS-HOME → the `home` worktree). Docs stay in this monorepo; worktrees are code lanes only.
- **Stay on the current checkout's branch; don't create ad-hoc branches or switch a checkout's branch mid-session.**
  The worktree *is* the branch — a separate directory per lane is what keeps agent work from colliding.
  Verify with `git branch --show-current` before committing.
- **Parallel lanes, own ports.** `pnpm dev` auto-resolves this lane's port (main :3000, others :3010+); lanes run concurrently. Tunnel is main-only (`pnpm dev:tunnel`, mobile testing). Map: [`docs/portfolio/WORKTREE-LANES.md`](docs/portfolio/WORKTREE-LANES.md).
- **Work-log for cross-session memory.** Read the last ~10 entries before starting (`pnpm worklog:tail`); append one when you finish a unit of work (`pnpm worklog "<action>" --result <r>`). Contract: [`docs/agent-log/README.md`](docs/agent-log/README.md).
- **Shared-memory artifacts.** Record work in its typed home (tickets → `master-plan.mdx`, signals → `user_reported_issues`/`entity_signals`, logs → work-log, …); never fork a markdown twin of an existing store. Map: [`docs/agent-fs/README.md`](docs/agent-fs/README.md). New autonomous loop → a contract ([`docs/agent-fs/contracts/`](docs/agent-fs/contracts)).
- **The user manages commits; never `git stash`.** Leave in-flight working-tree changes untouched; commit/push only when asked.
- **Never commit `.env`.** Real `.env` is gitignored with live secrets. `.env.example` is the template.

## Source-of-truth invariants

Each concern has one module — never inline or re-derive:

| Concern | Source |
|---|---|
| Dates (civil / instant / warehouse zone) | `src/utils/date.ts` |
| Condition labels / tones | `src/lib/conditions.ts`, `src/lib/condition-tone.ts` |
| Z-index | `src/design-system/tokens/z-index.ts` |
| Spacing scale + intents | `src/design-system/tokens/spacing.mjs` |
| Focus affordance | `src/design-system/tokens/focus-ring.ts` (`focusRing`) |
| Surface / box shell | `Panel` / `SectionCard` / `CardShell` (never hand-roll the shell) |
| Station entity-context header | `@/components/station/entity-context` (`CartonContextCard`) — Unbox/Triage/Testing/Shipping |
| Integrations / capabilities | `src/lib/integrations/**` |
| Cross-entity search | `src/lib/search/hybrid-retrieval.ts` → `SearchHit` |
| Full list | `.claude/rules/source-of-truth.md` |

## Compose → grow the SoT → compound

House rules name **which pattern family** to use; they do not freeze primitives forever.
**"Compose, don't invent" means don't invent *beside* the SoT — not "never improve the SoT."**
The user prompt is a **floor, not a ceiling**: on any UI / styling / layout / component / motion touch,
scan siblings + `@/design-system/**` + golden pages for a stronger *house* pattern before implementing.
A genuinely different job / region contract earns a **new sibling that composes the shared primitive** —
that's growth (Always), not a fork. The fork ban targets duplicating a primitive for the **same** job;
it never blocks serving a new one. When jobs differ, add the sibling and share the primitive underneath.

### Always

1. **Compose first** from the named registry / SoT when it fits.
2. **Grow the SoT** when it is wrong or weaker than a stronger sibling — especially single-consumer /
   low-blast-radius primitives (one strip, one page).
3. **Promote, then compose** — improve the registry so the *next* caller inherits the better pattern.
4. Pair every hard "don't" with a concrete "do" (prefer / extend / import X) — bare prohibition lists cause conservative half-fixes.
5. **Recommend even when you only implement the asked slice** — a short note:

   ```markdown
   ### Compound opportunities
   - Do now (in scope / low blast radius): …
   - Promote to DS next (2+ call sites): …
   - Deferred (ask first / multi-page): …
   ```

### Ask first

- Public API changes to a shared primitive used by **many** call sites.
- Migrations, security, tenant scoping, status-machine / audit / search waists.
- Introducing a **second** visual or domain language without merging or deleting the old one.
- Expanding beyond the asked surface solely to migrate other call sites (recommend first).

### Never

- Fork a **page-local** parallel primitive (`function SectionCard`, second KPI shell, new search engine, raw status `UPDATE`) — compose the shared one and grow it instead. *(A genuinely different job may add a **new sibling that composes the same primitive** — that's growth, not a fork.)*
- Leave **two shapes for the same job** after a polish pass when unifying the single-consumer SoT is free — unify them. *(Two shapes for two genuinely **different** jobs / region contracts is correct — don't collapse them just to satisfy this line.)*
- Encode a net-new architecture **only** in prose before it exists in code — build the better SoT, then document it.
- Import a **foreign aesthetic** that fights Kinetic Ledger tokens / region contracts. "Better" = stronger *within* Cycle Forge's DS family, not a different product.

### After a correction or a paid miss

Fix the **SoT / registry primitive** over a page-local patch; capture a **general** principle (not just the incident)
in the right `.claude/rules/` file; prune redundant always-on prose. Hard correctness (tenant GUC, `transition()`,
secrets, search waist) stays restrictive via SoT + hooks/tests; **taste and composition** stay recipes with an evolution path.

Decision tables beat architecture essays. Progressive disclosure: root = map + hard laws; `.claude/rules/` = load when the task touches that domain; skills = multi-step playbooks. Full scan/recommend method: `.claude/rules/ui-design-system.md` + the `improve-ui` skill.

## Kinetic Ledger (product UI identity)

Cycle Forge UI is **Kinetic Ledger**: data-first reseller ops — dense, state-colored, scan-aware, multi-tenant.
**Legible throughput** over document calm; calm chrome (Linear discipline), not document whitespace as the product shape.
**Better** means stronger *within* this family and house tokens — never a foreign kit or a second design language.
Industry blend: ops density (Carbon / Stripe Dashboard) + Linear chrome + POS/scan floors + Studio canvas.
Code north star: `src/design-system/DESIGN_SYSTEM.md`.

### Five laws

1. **Facts and state drive chrome** — chrome never invents a second story.
2. **Archetypes are region contracts** (I/O + persistence), not layout skins.
3. **Data shape chooses the primary surface** — table | list | board | card | timeline | KPI zones | canvas.
4. **Presentation kinds resolve via SoT** — labels, tones, chips, dates, capabilities, search hits; views stay dumb.
5. **Compose named shells / blocks; grow the SoT when wrong; compound every UI task.**

### Detail lives on-demand (read when the task touches it)

- Region contracts (Station / Workbench / Monitor / Canvas), data-shape → surface, `pickArchetype` — `.claude/rules/contextual-display.md` (+ `display/*`).
- Density modes (`floor` / `ops` / `rollup` / `studio`), one-row anatomy, chips, tokens, `HoverTooltip`, paired icons — `.claude/rules/ui-design-system.md`.
- Monitor rollup blocks (compose from `@/design-system/components/monitor`, or grow the registry) — `.claude/rules/display/monitor-rollup-blocks.md`.
- Presentation-kind SoTs (dates, condition, platform, capabilities, search hits) — `## Source-of-truth invariants` above + `.claude/rules/source-of-truth.md`.

**Always ban:** random card soup, nested cards-as-rows, a second visual language beside Kinetic Ledger tokens.
Boards, KPI grids in named rollup zones, and Studio canvas are valid primaries when the data shape requires them.
Color only from semantic / theme tokens (`bg-surface-card`, `border-border-soft`, `text-text-*`); no page-local hex; themes via `data-theme` + `src/design-system/themes/*`.

## Backend patterns

- Status changes only via `transition()` (`src/lib/inventory/state-machine.ts`) — never a raw `UPDATE … current_status`.
- Routes: `withAuth` → validate → domain helper → map status (404/409/200) → `recordAudit` → `after()` side-effects. `orgId` from `ctx`, never body.
- Tenant scope: `withTenantTransaction(orgId, …)`. Idempotency: thread `clientEventId`. Inject `Deps` so unit tests run DB-free.
- Detail: `.claude/rules/backend-patterns.md`; new polymorphic / typed-fact tables: `.claude/rules/polymorphic-tables.md`.

## Build gotchas

- Tailwind z-index import in `tailwind.config.ts` needs an explicit `.ts` extension (Turbopack) or all `z-*` utilities silently drop in dev.
- Classes used only in un-scanned files won't generate — update `content` / safelist and restart the dev server.
- Detail: `.claude/rules/build-gotchas.md`.

## Verify (when you change code)

Prefer the smallest relevant check during the inner loop:

```bash
npx tsx --test path/to/file.test.ts        # unit tests for a file
npx tsc --noEmit -p tsconfig.json          # typecheck (heavy — use when types are in doubt)
```

**Before a task is "done" (and before any commit): `npm run verify`.** It is the
local mirror of CI (`.github/workflows/ci.yml`) — lint, typecheck, unit tests
(incl. the DS-ratchet guards), knip dead-code, route-auth drift + enforce, schema
drift — and reports every failure at once. **Green locally ⇒ green in CI.** The
pre-push hook (`.githooks/pre-push`, wired by `npm install`) runs it for you and
blocks a red push; `--fast` (lint + typecheck) is the quick inner-loop variant.
When a **DS-ratchet** gate fails, migrate to the DS primitive
(`Button`/`IconButton`, `HoverTooltip`, `focusRing(...)`, `text-role-*`) or add
the documented `ds-*` escape for a genuine one-off — **never** raise a baseline
count or `--no-verify` past it.

Do not invent new search engines, audit APIs, or status transitions outside the SoT modules above. **Do** improve those SoT modules when they are incomplete or inconsistent — that is pattern evolution, not invention.
