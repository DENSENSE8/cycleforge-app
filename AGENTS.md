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
  `main` is the **integration / dogfood lane** (WS-DOGFOOD) — dogfood-surface fixes and
  integration, not large parked-surface builds (e.g. WS-HOME → the `home` worktree). Docs stay in
  this monorepo; worktrees are code lanes only.
- **Stay on the current checkout's branch; don't create ad-hoc branches or switch a checkout's
  branch mid-session.** The worktree *is* the branch — a separate directory per lane is exactly
  what keeps agent work from colliding with the user's GitHub Desktop branch-switching. Verify with
  `git branch --show-current` before committing.
- The user commits via GitHub Desktop mid-session — **never `git stash`**; leave in-flight
  working-tree changes untouched; commit/push only when asked.
- **Never commit `.env`.** Real `.env` is gitignored with live secrets. `.env.example` is the template.

## Source-of-truth invariants

Each concern has one module — never inline or re-derive:

| Concern | Source |
|---|---|
| Dates (civil / instant / warehouse zone) | `src/utils/date.ts` |
| Condition labels / tones | `src/lib/conditions.ts`, `src/lib/condition-tone.ts` |
| Z-index | `src/design-system/tokens/z-index.ts` |
| Integrations / capabilities | `src/lib/integrations/**` |
| Cross-entity search | `src/lib/search/hybrid-retrieval.ts` → `SearchHit` |
| Full list | `.claude/rules/source-of-truth.md` |

## Pattern evolution (compose → grow SoT → compose again)

House rules name **which pattern family** to use. They do **not** freeze primitives forever.

**“Compose, don’t invent” means: don’t invent *beside* the SoT. It does not mean: never improve the SoT.**

### Always

1. **Compose first** — use the named registry / SoT module when it fits.
2. **If the SoT is wrong or inconsistent with a stronger sibling**, fix the SoT — especially when blast radius is small (single consumer, one strip, one page).
3. **Promote, then compose** — grow the registry or shared module so the *next* caller gets the better pattern.
4. Pair every hard “don’t” with a concrete “do” (prefer / extend / import X). Pure prohibition lists cause conservative half-fixes.
5. **Scan → recommend → compound** (below) on every UI / styling / layout touch — do not stop at the literal prompt when a better house pattern exists.

### Ask first

- Public API changes to a shared primitive used by **many** call sites.
- Migrations, security, tenant scoping, status-machine / audit / search waists.
- Introducing a **second** visual or domain language without merging or deleting the old one.
- Expanding work beyond the user’s asked surface solely to migrate other call sites (recommend first).

### Never

- Fork a **page-local** parallel primitive (`function SectionCard`, second KPI shell, new search engine, raw status `UPDATE`).
- Leave two shapes for the **same job** after a polish pass (e.g. half-gauge vs full-ring for the same KPI role) when unifying the single-consumer SoT is free.
- Encode a net-new architecture **only** in prose docs before it exists in code — implement the better SoT, then document it.
- Import a foreign aesthetic (random Dribbble, new color system, novel card language) that fights **Kinetic Ledger** tokens / region contracts. **Better** means stronger *within* Cycle Forge’s DS family, not a different product.

### Continuous evolution loop

After a user correction or a paid miss (wrong shape frozen, over-conservative reskin, repeated re-prompt):

1. Prefer fixing the **SoT / registry primitive** over page-local patches.
2. Capture a **general** principle (not only the incident) in the relevant `.claude/rules/` file or a short always-on bullet here.
3. Prune redundant or aspirational always-on text — root files stay an index + hard laws; depth stays on-demand.
4. Hard correctness (tenant GUC, `transition()`, secrets, search waist) stays restrictive via SoT + hooks/tests; **taste and composition** stay recipes with an evolution path.

Decision tables beat long architecture essays. Progressive disclosure: root = map; `.claude/rules/` = when the task touches that domain; skills = multi-step playbooks.

## Compound design system (scan → recommend → promote)

**Goal:** every UI task leaves the *system* slightly stronger so the next task is cheaper — exponential benefit via shared primitives, not one-off beauty.

User prompts are a **floor**, not a ceiling. On any change that touches layout, styling, components, motion, or display contracts:

### Always scan (before / while implementing)

Quick inventory (grep / sibling read — don’t boil the ocean):

| Scan for | Where to look |
|---|---|
| Stronger sibling of the same job | Same feature folder + `@/design-system/**` + golden pages |
| Duplicated markup / class soup (2+ copies) | Nearby components; promote candidate |
| Token / typography / z-index drift | Semantic tokens, `ui-design-system.md`, SoT modules |
| Wrong **region contract** blend | `contextual-display.md` |
| Wrong **data-shape surface** (pane forced where table/board/timeline fits) | `contextual-display.md` + siblings |
| Registry miss (Monitor/Station/rails/fact stacks) | `monitor/*`, rails shells, station blocks |
| Motion not on house bridge | `motion-framer` + `useMotionPresence` / `useMotionTransition` |

**Identify patterns**, name them in plain language (e.g. “half-gauge KPI”, “one-row anatomy”, “eyebrow + chips”, “fact stack”, “Monitor SectionCard”), and map each to a SoT path or a promotion target.

### Always recommend (in the reply)

Surface a short **Compound opportunities** note (even if you only implement the asked slice):

```markdown
### Compound opportunities
- **Do now (in scope / low blast radius):** …
- **Promote to DS next (2+ call sites):** …
- **Deferred (ask first / multi-page):** …
```

Recommend the *better house pattern* over a literal reskin when:
- A golden sibling is clearly stronger for the same job.
- The same structure appears ≥2 times and is not yet a named block.
- Unifying a single-consumer primitive fixes many visual mismatches at once.

### When to implement vs only recommend

| Situation | Action |
|---|---|
| Better pattern is already the SoT — target just doesn’t use it | **Use it now** (compose) |
| SoT is weaker than a sibling; **1 consumer** or same PR surface | **Grow SoT now**, then compose |
| Same bug/pattern in **many** files outside the ask | **Recommend** bulk promote; implement only if user expands scope |
| New reusable block would help **future** pages | **Recommend** extract; offer `improve-ui` / extract; don’t invent a second shell on the page |
| Foreign style would “look nicer” but breaks Kinetic Ledger tokens / contracts | **Reject**; recommend house equivalent |

### Exponential compounding rule

Prefer changes that **increase reuse**:

1. Fix / extend `src/design-system/**` or the named registry.
2. Point the feature at it.
3. Optionally note remaining call sites for a follow-up migrate.

Avoid changes that **only** make one screen prettier while leaving a worse primitive for everyone else.

Full UI audits: use the **`improve-ui`** skill (scan + recommend is mandatory there too).

## Kinetic Ledger (product UI identity)

Cycle Forge UI is **Kinetic Ledger**: data-first reseller ops — dense, state-colored, scan-aware, multi-tenant.
**Legible throughput** over document calm. Calm chrome (Linear discipline), not document whitespace as the product shape.

**Industry blend:** ops density (Carbon / Stripe Dashboard) + Linear chrome + POS/scan floors + Studio canvas.
**Better** means stronger within this family and house tokens — not a foreign kit or a second design language.

Code north star: `src/design-system/DESIGN_SYSTEM.md`.  
Recipes: `.claude/rules/ui-design-system.md`, `.claude/rules/contextual-display.md`.

### Five laws

1. **Facts and state drive chrome** — chrome never invents a second story.
2. **Archetypes are region contracts** (I/O + persistence), not layout skins.
3. **Data shape chooses primary surface** — table | list | board | card | timeline | KPI zones | canvas.
4. **Presentation kinds resolve via SoT** — labels, tones, chips, dates, capabilities, search hits; views stay dumb.
5. **Compose named shells/blocks; grow the SoT when wrong; compound every UI task.**

### Region contracts (pick first, per region)

Run per **region** (not per page): scanner → **Station**; observe-only → **Monitor**; node-graph → **Canvas**; else → **Workbench**.

These answer *what may scan / select / edit / observe* — **not** “must be sidebar + right pane.”
Never blend two contracts in one region. Index: `.claude/rules/contextual-display.md`.  
Code: `src/lib/stations/archetype.ts` (`pickArchetype`) + `SURFACE_REGISTRY` in `surface-keys.ts`.

### Data shape → primary surface

| Data shape | Primary surface | Secondary (optional) |
|---|---|---|
| Singleton transient | Station card | HUD / offline banner |
| Singleton durable | Fact stack + actions | Timeline / related |
| Many records + pick | List **or** table **or** board | Inspector / fact stack |
| Event stream | Timeline / feed | Filter band only |
| Rollup metrics | KPI strip + SectionCards | Drill filters |
| Definition graph | Canvas | Inspector |

**Detail / right pane / context rail = one optional context slot**, not Workbench identity and not the default for every job.

### Density modes

| Mode | When | Feel |
|---|---|---|
| `floor` | Station / mobile scan | One focus, big state, fail loud, compact chrome |
| `ops` | Daily pick+edit, boards, tables | Dense rows, inline actions, meta + chips |
| `rollup` | Analytics / goals | More air, KPI heroes, named SectionCard zones |
| `studio` | Graph authoring | Spatial canvas; inspector secondary |

Density is orthogonal to contract. Same Workbench job can be `ops` table or `ops` master–detail.

### Presentation SoTs (views stay dumb)

Never invent label maps, status hues, or chip types in a view. Resolve through SoTs:

- Dates — `src/utils/date.ts`
- Condition — `src/lib/conditions.ts` / `condition-tone.ts`
- Platform / lifecycle / chips — `source-platform`, lifecycle tones, typed `CopyChip`s
- Capabilities — `src/lib/integrations/**`
- Cross-entity hits — `SearchHit` / hybrid search

Full waist: `.claude/rules/source-of-truth.md` (presentation kinds) + `DESIGN_SYSTEM.md`.

### Monitor rollup blocks (compose, or grow)

For observe/rollup regions (`density: rollup`), import from `@/design-system/components/monitor`:

`MonitorPageShell` · `FilterBand` · `KpiStrip` / `KpiTile` · `SectionCard` · `MonitorListBlock` · `DeltaChip`

- Prefer these blocks for dashboard rollups.
- If a registry gauge/tile/shell fights a stronger sibling, **unify via the SoT** when blast radius is small.
- Named blocks for 2+ surfaces: yes. Page-local card shells: no.
- **Never** nest `SectionCard`s as list rows. Named rollup zones may use responsive CSS grid.

Rules: `.claude/rules/display/monitor-rollup-blocks.md`.  
Golden composition: `src/features/operations/workspace/OperationsAnalyticsView.tsx`.

### Shared UI house style (recipes, not identity)

- Compose rails (`SidebarRailShell` / `RecentActivityRailBase`); don't fork when the job is mode-scoped pick+edit.
- One-row anatomy: title → meta → chips; selection = `bg-blue-50 ring-1 ring-inset ring-blue-400` only (never a size shift).
- Icons from `@/components/Icons`, structural & paired.
- Color only from semantic / theme tokens (`bg-surface-card`, `border-border-soft`, `text-text-*`). **No page-local hex.** Themes via `data-theme` + `src/design-system/themes/*`.
- Ban **random card soup** and nested cards-as-rows — not all grids (boards, KPI strips, Studio are valid).
- Detail: `.claude/rules/ui-design-system.md`.

## Backend patterns

- Status changes only via `transition()` (`src/lib/inventory/state-machine.ts`).
- Routes: `withAuth` → validate → domain helper → map status → `recordAudit` → `after()` side-effects. `orgId` from `ctx`, never body.
- Tenant scope: `withTenantTransaction(orgId, …)`.
- Idempotency: thread `clientEventId`.
- Detail: `.claude/rules/backend-patterns.md`.

## Build gotchas

- Tailwind z-index import in `tailwind.config.ts` needs explicit `.ts` extension (Turbopack).
- Classes only in un-scanned files won't generate — update `content` / safelist.
- Detail: `.claude/rules/build-gotchas.md`.

## Verify (when you change code)

Prefer the smallest relevant check:

```bash
# Unit tests for a file
npx tsx --test path/to/file.test.ts

# Typecheck (heavy — use when types are in doubt)
npx tsc --noEmit -p tsconfig.json
```

Do not invent new search engines, audit APIs, or status transitions outside the SoT modules above. **Do** improve those SoT modules when they are incomplete or inconsistent — that is pattern evolution, not invention.
