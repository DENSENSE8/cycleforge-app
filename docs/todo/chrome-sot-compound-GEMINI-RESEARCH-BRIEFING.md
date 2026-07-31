# Research briefing — the chrome-SoT compound program vs. 2026 design-system practice

**For:** Gemini Pro (deep research)
**From:** Cycle Forge engineering
**Date:** 2026-07-30
**Subject:** [`chrome-sot-compound-PLAN.md`](chrome-sot-compound-PLAN.md) — a house-wide plan to consolidate
"chrome" (KPI strips, workbench tab headers, station identity bars, saved views, sidebar search,
offline banners) onto named source-of-truth (SoT) components, using a manual discover → name → lift →
delete → law → guard loop.
**Status:** plan only, zero code written yet. This brief exists to pressure-test the plan's *method*
against how design systems are actually built, governed, and kept from drifting in 2026 — before six
phases of migration work are spent executing it.

**Deliverable:** (a) a benchmark of this plan's governance model (prose law + hand-written guard tests +
manual grep audits) against named 2026 design-system tooling and organizational practice; (b) a defended
verdict on the ten decisions in §6; (c) answers to §7 with sources; (d) a concrete "what would change in
the plan doc" recommendation list an engineer can apply directly to `chrome-sot-compound-PLAN.md`.

---

## 0. How to use this brief

You do not have the codebase. Every number below was pulled directly from source files today (line
counts, prop signatures, grep consumer counts) — not estimated. Where something is inferred, it is
labeled **(inferred — verify)**. This brief is deliberately skeptical of the plan it is describing: the
plan was written by the same team executing it, and its own §14 admits "docblocks lie" and "golden pages
are not sacred pixels" — i.e., the authors already know their prose can drift from reality. Your job is
to tell them whether their *mechanism* for keeping law and reality in sync is strong enough for a program
this size, using what mature 2026 design systems actually do.

Three deliverables, kept separate:

1. **What is industry standard (2026)** for (a) design-token pipelines, (b) anti-drift/anti-fork
   enforcement in a large in-house design system, (c) consolidating N near-duplicate "chrome" components
   into one SoT at scale, and (d) governing a design system that is *also* the operating manual for AI
   coding agents (this repo's `CLAUDE.md`/`AGENTS.md`/`.claude/rules/*` are read by an LLM agent every
   session, not just by humans). Name real systems, specs, and tools. State the conditions under which
   each pattern wins over the others — do not retreat into "it depends."
2. **Take a side on each decision in §6.** Each states the plan's current approach, the strongest
   counter-argument, and — where relevant — a concrete measurement that already contradicts the plan's
   optimistic framing.
3. **Answer §7's open questions** with sources.

---

## 1. Product and architecture vocabulary (condensed — you need this to judge fit, not to re-derive it)

**Cycle Forge** is multi-tenant reseller-operations SaaS. One warehouse crew works multiple physical
"stations" (scan benches) and desk workflows in the same session. The product has a named visual identity
("Kinetic Ledger": dense, state-colored, scan-aware — explicitly *not* document-calm) and a formal
region-contract taxonomy enforced in code:

| Contract | Driven by | Job | Selection | Density |
|---|---|---|---|---|
| **Station** | barcode scanner / keyboard-wedge | act-and-clear, one entity at a time | ephemeral, never URL | `floor` |
| **Workbench** | pointer | pick a record → edit → persist | durable, URL-addressable | `ops` |
| **Monitor** | filters over a stream | observe only, zero edit | none (filters only) | `rollup` |
| **Canvas** | pan/zoom/focus | reshape a graph definition | durable focus in URL | `studio` |

This matters for your research because it means Cycle Forge cannot simply adopt a generic B2B admin
design system wholesale — a real fraction of its screens are optimized for a person standing at a bench
with a barcode scanner and their hands full, which is a materially different interaction contract than
the pointer-driven CRUD screens most 2026 design-system literature (Polaris, Carbon, Atlaskit, Material 3)
is written for. Part of your job is separating "this is a defensible domain-specific deviation" from "this
is the team reinventing something an off-the-shelf system already solved."

**The governance discipline already in force** (from `pattern-evolution.md`, condensed):

> Compose from the named SoT first. Grow the SoT when it's wrong or weaker than a stronger sibling.
> Never fork a page-local twin for the same job. Pair every "don't" with a concrete "do." Recommend
> compound opportunities even when only implementing the asked slice.

This is written as prose law inside files the coding agent (Claude Code) reads at the start of every
session, alongside machine-enforced guard tests (`*.guard.test.ts`) that run in CI (`npm run verify`) and
are supposed to only ratchet stricter, never looser.

---

## 2. The plan under review, compressed

`chrome-sot-compound-PLAN.md` generalizes one successful migration (page-local "mode" tab rails and MRU
chips → a single `HeaderModeSwitcher`/`HeaderRecentsSwitcher` in the global header) into a repeatable
7-step loop, applied to six more chrome families:

```
Discover (≥3 call sites doing the same job) → Name/grow the SoT → Lift to correct altitude
  → Delete the page-local twin → Encode one paragraph of law in .claude/rules/display/*
  → Add/extend a guard test → npm run verify
```

**Phases (A–G), in the plan's own priority order:**

| Phase | Target | Mechanism |
|---|---|---|
| A | 12 `*KpiStrip.tsx` files → compose `KpiTile`/`KpiStrip`/`OpsKpiBand` | manual per-file migration, pilot 2 files first |
| B | Workbench lifecycle tabs + sort chrome → `WorkbenchChromeHeader` / `QueueSortSwitch` | grep audit, classify each `TabSwitch`/`HorizontalButtonSlider` by hand |
| C | Station identity → `StationContextBar`/`StationMoreDetails`; entity slide-overs → `GlobalDetailStackHost` registry | remount remaining stations, shrink an "exempt list" |
| D | Saved-views chrome home (2 faces today) | **Ask-first gate**, explicitly deferred pending a human decision |
| E | Sidebar search → `SidebarShell`'s `search` prop only | guard-driven, described as already near-zero-drift |
| F | 3 independent `OfflineBanner` implementations → 1 subscription + faces | promote the strongest existing pattern |
| G | Identity/chip presentation kinds | opportunistic, low priority |

**Enforcement primitives the plan relies on**, all hand-written per-SoT:

- Prose paragraphs in `.claude/rules/display/*.md` and `ui-design-system.md`.
- `*.guard.test.ts` files — plain Node test-runner files that `grep`/regex the source tree for forbidden
  strings or missing imports (e.g. asserting a component file *doesn't exist*, or that another file's
  source text contains no `search?:` prop declaration).
- "Ratchet baselines" — a stored count of allowed violations that CI checks only shrinks, never grows.
- Manual `grep`/read-based audits at the start of each phase ("Baseline inventory" steps).

The plan explicitly does **not** propose any codemod tooling (jscodeshift/ts-morph), any lint-rule-based
import-boundary enforcement, any visual regression tooling, or any machine-readable component
manifest/catalog. It also explicitly forbids raising a guard baseline to make a phase pass, and forbids
touching the six "explicitly out of scope" nested-facet sliders (§3.8 of the plan) — a deliberate refusal
to over-consolidate.

---

## 3. Grounded current-state facts (pulled from source today — this is the evidence your research should reconcile with, not the plan's prose)

These numbers came from reading the actual files the plan's inventory tables cite, not from the plan doc
or the `.claude/rules/*` prose describing them. They matter because the plan repeatedly asserts "adapters
stay thin" / "law already written" / "guard-driven, near zero drift" as *current* states in some places
and *target* states in others — you should treat every such claim as unverified until a number backs it.

**Phase A (KPI strips) — the "thin adapter" claim is aspirational, not current.**
`OpsKpiBand` (`src/design-system/components/monitor/OpsKpiBand.tsx`, 123 lines) is exactly the shared
horizontal-band primitive Phase A's plan describes creating — except it **already exists** and has
**exactly one consumer** (`UnboxKpiStrip.tsx`, 209 lines, fully migrated — no local band/skeleton
markup). The two other concretely-named adapters in the plan's own worked example (`OutboundKpiStrip.tsx`,
376 lines; `PackKpiStrip.tsx`, 248 lines) both import the leaf `KpiTile` primitive but then **hand-roll
their own band container, skeleton, empty, and error components** locally (`TILE_BAND_CLASS`,
`TILE_CELL_CLASS` and siblings, redeclared in each file) instead of composing `OpsKpiBand`. That is: the
"golden composition" the plan names for Phase A's pilot is the one file in the family that has **not**
adopted the SoT the plan says already exists and should be composed.

**Phase B (workbench chrome) — the twin outnumbers the SoT roughly 3:1.**
The sanctioned primitive, `TabSwitch` (`src/design-system/components/TabSwitch.tsx`), is used directly in
11 files. `WorkbenchChromeHeader` (which wraps `TabSwitch`) is imported in 30 files. The forbidden twin,
`HorizontalButtonSlider` (`src/components/ui/HorizontalButtonSlider.tsx`), is used directly in **36**
files — more than `TabSwitch` and `WorkbenchChromeHeader` combined at the leaf-primitive level, and the
plan's own §3.8 concedes several of those 36 are legitimately out-of-scope nested facets. Notably,
`WorkbenchChromeHeader` itself — treated throughout the plan as a top-tier SoT on par with
`design-system/` primitives — physically lives in `src/components/dashboard/workbench-shell.tsx`, a
feature folder, not in `src/design-system/`. There is no package or folder boundary that would let tooling
(a lint rule, a dependency-cruiser zone) distinguish "the SoT" from "a feature file that happens to be
widely imported."

**Phase C (station identity) — the twin is large and live, not legacy residue.**
`PaneHeader` (the named "twin risk") is imported in **29** files today, including recently-touched
surfaces (`PackerReviewMode.tsx`, `IncomingDetailsPanel.tsx`). `CartonContextCard`
(`src/components/station/entity-context/CartonContextCard.tsx`, 703 lines) — the identity SoT Phase C asks
more stations to adopt — exposes roughly **45 named props** in a single flat interface
(`density`, `isUnmatched`, `showClassifyControls`, `classifyInteractive`, `listingLink`, `listingLinks`,
`poOpenHref`, `trackingOpenHref`, `platformValue`, `onPlatformSelect`, `receivingType`, `onTypeSelect`,
`priorityTier`, `onPrioritySelect`, `onExitToList`, `onSendToTicket`, …). Every new adopter in Phase C adds
another thin adapter mapping its controller's local shape onto this one flat prop surface.

**Phase D (saved views) — the plan's own uncertainty is confirmed correct, and the doc it distrusts is
already wrong.** `useSavedViews.ts` persists via a server API (`GET/POST/PATCH/DELETE /api/saved-views`)
today — **not** localStorage, despite `workbench.md`'s prose describing a "split-brain" between
server-backed and localStorage-backed saved views, and despite the hook's own public parameter still being
named `storageKey` (with an inline comment explaining it's kept only "for call-site stability"). This is a
direct, present-tense confirmation of the plan's own §14 warning ("docblocks lie… grep call sites and the
hook body") — the design-law document that is supposed to be the source of truth about this system is
demonstrably stale about a load-bearing architectural fact (where the data lives) at the moment this brief
was written.

**Phase E (sidebar search) — the strongest phase, mechanically verified, not just asserted.**
`sidebar-search-bar.guard.test.ts` is a genuine negative-regression guard: it asserts a deleted file stays
deleted, that no file imports a retired symbol, that `SidebarShell.tsx`'s own source text contains no
`search?:` prop declaration, and that no file contains a retired CSS-class-name string. All four
assertions pass today by construction. This phase is the one place in the plan where "guard-driven, near
zero drift" is currently true, not aspirational — worth naming as the pattern to replicate.

**Phase F (offline banners) — three fully independent reimplementations of the same primitive.** All
three (`station/OfflineBanner.tsx`, `layout/OfflineBanner.tsx`, `mobile/OfflineBanner.tsx`) hand-roll their
own `navigator.onLine` read plus `window.addEventListener('online'/'offline', …)` wiring. Only the mobile
one uses `useSyncExternalStore` — the React-idiomatic mechanism for exactly this problem, and the one
React's own documentation uses as its canonical `useSyncExternalStore` example (`useOnlineStatus`). None of
the three imports from a shared hook module; the mobile file's own comment claims it shares a "store shape"
with a sibling component, but the store itself is a local, non-exported `subscribe`/`getSnapshot` pair, not
an actual shared module.

**Tooling context that the plan does not mention using:**
- **Design tokens are 100% hand-written TypeScript/`.mjs` modules** (`src/design-system/tokens/*` — colors,
  spacing, typography, z-index, shadows, focus-ring, table-surface, radius, borders, app-surface — roughly
  a dozen category files, each 15–150 lines). There is no W3C Design Tokens Community Group (DTCG)
  `$value`/`$type` JSON anywhere in the repo, and no Style Dictionary (or comparable transform pipeline)
  dependency in `package.json`.
- **Radix UI primitives are already a dependency** (`@radix-ui/react-{alert-dialog,checkbox,context-menu,
  dialog,dropdown-menu,popover,switch}`), wrapped by the house `@/design-system/primitives` layer. The
  house Dialog/DropdownMenu/ContextMenu/Switch/Checkbox SoTs are **not** hand-built from scratch — they sit
  on a standard headless-accessibility foundation already.
- **`dependency-cruiser`** is an existing devDependency, wired to `pnpm diagrams:*` scripts that emit
  Mermaid module graphs and a dead-code report — but it is **not** configured with any forbidden-import
  rule (e.g., "no file outside `WorkbenchChromeHeader.tsx` may import `HorizontalButtonSlider` for a
  primary tab strip"), which is exactly the kind of boundary dependency-cruiser is built to enforce
  mechanically instead of by grep-audit.
- **No Storybook, no Chromatic, no visual-regression tool** was found in `package.json`. Component
  correctness is verified by: TypeScript, unit tests (`node:test`), the guard-test family, and (per
  `.claude/rules/verify.md`) Playwright E2E against a fixed QA tenant. There is no visual-diff gate between
  "the SoT's intended appearance" and "what a migrated adapter now renders."
- **`knip`** (dead-code detection) is already run as part of `npm run verify` and is explicitly named in
  house law as a ratchet-down-only baseline — the same governance shape the plan proposes for its new
  chrome guards, so there is at least one existing precedent for "a whole-repo structural check with a
  shrink-only baseline" succeeding here.

---

## 4. What makes this program's governance model unusual (the thing worth researching)

Most 2026 design-system literature assumes a **human-facing** governance loop: designers file
tokens/components in Figma, engineers implement, a design-system team reviews PRs, Chromatic/visual-diff
gates catch regressions, and a component catalog (Storybook, Backstage) gives humans a place to *discover*
what already exists before they build a twin.

This program's loop is different in a specific way: the **primary reader of the law is an LLM coding
agent**, not a human. `CLAUDE.md` and `AGENTS.md` are loaded into every agent session; `.claude/rules/*.md`
files are read on demand; guard tests exist partly so that an agent which ignores the prose still fails CI.
The "discover ≥3 twins" step in the plan is explicitly a `grep`-driven audit an agent is expected to run
fresh each session, because there is no catalog/registry it can query instead. This is architecturally
closer to "law-as-context-window-content, enforced by cheap regex tripwires" than to any named 2026
design-system governance model. It may be a genuinely novel-for-2026 pattern (an AI-native design system,
optimized for keeping an LLM collaborator from reinventing components across sessions) or it may be a
weaker substitute for tooling that already exists and that the team simply hasn't wired up
(dependency-cruiser rules, an ESLint plugin, a component-usage report). **This is the central question of
this brief.**

---

## 5. Deep research questions — please answer with named systems, specs, and sources

1. **Token pipeline maturity.** For a multi-tenant SaaS with per-org theming (light/dark today, "no
   page-local hex" as hard law) — is a hand-written TS token module family (this repo's shape) a
   reasonable 2026 choice, or has the industry converged enough on the W3C DTCG format + a transform
   pipeline (Style Dictionary, Terrazzo, Cobalt) that skipping it is a real cost? Under what conditions
   (single web platform only, vs. web + native apps, vs. white-label/multi-brand future) does each choice
   win? Name production design systems in each camp with dates.
2. **Anti-fork enforcement at scale.** For an org consolidating N (here: 6+) families of near-duplicate
   components, what do mature design systems (Shopify Polaris, Atlassian Atlaskit, GitHub Primer, IBM
   Carbon, Adobe Spectrum) actually use to *prevent regrowth* of a deleted pattern — ESLint custom
   rule sets, `dependency-cruiser`/`eslint-plugin-boundaries`-style import-zone enforcement, Backstage-style
   component catalogs with usage telemetry, Chromatic visual-diff gates, or hand-written regex guard tests
   like this repo's? Is a fleet of ~15+ bespoke `*.guard.test.ts` files (this repo's current shape, one
   custom regex-assertion file per SoT) a known-good pattern at scale, or a known anti-pattern that a
   single generalized lint-rule engine typically replaces once a design system passes some component-count
   threshold?
3. **Discovery vs. audit.** The plan's "Discover ≥3 twins" step is a manual, per-phase `grep`/read audit.
   Do 2026 design systems generally solve "which of these N implementations is the twin and which is the
   SoT" with tooling (usage-count dashboards, codemod dry-runs, `ts-prune`/`knip`-style reachability
   analysis) instead of a human/agent re-deriving it each time from scratch? Given this repo already has
   `knip` and `dependency-cruiser` installed and configured for *other* purposes, is there a concrete,
   low-effort way to repoint them at "twin detection" specifically (e.g., a dependency-cruiser rule per
   phase, or a `knip`-style report of "imports HorizontalButtonSlider directly")?
4. **Migration mechanism: manual per-file vs. codemod.** Phase A proposes migrating 12 files by hand,
   one at a time, over "1–2 sessions." Given `OutboundKpiStrip.tsx` (376 lines) and `PackKpiStrip.tsx`
   (248 lines) both already import the correct leaf primitive (`KpiTile`) and only need their *local band
   scaffolding* replaced with `OpsKpiBand`'s equivalent named exports — is this a case where 2026 tooling
   (ts-morph/jscodeshift codemod, or even an LLM-authored one-shot transform across all 12 files with a
   human diff review) is standard practice and meaningfully cheaper/safer than 12 manual migrations? What
   is the accepted 2026 threshold (file count × similarity) above which teams reach for a codemod instead
   of hand-editing?
5. **Component API shape: monolithic props vs. compound/slot components.** `CartonContextCard`'s ~45-prop
   flat interface is the thing every new Phase C adopter must map onto via a thin adapter. Compare this
   shape against the compound-component / slot / recipe patterns that dominate 2026 headless-UI practice
   (Radix's composition model — which this repo already partially uses underneath its `primitives/` layer
   — React Aria's render-props/hooks model, Panda CSS / vanilla-extract "recipes," shadcn/ui's
   copy-in-composed-primitives model). Would refactoring `CartonContextCard` toward a compound-component
   shape *before* Phase C spreads it to more consumers reduce the long-run adapter cost, or is a large flat
   prop interface actually the right shape for a single "identity bookmark bar" component that has exactly
   one visual slot arrangement and just varies which facts are present?
6. **Governing an SoT that lives in a feature folder.** `WorkbenchChromeHeader` is treated as house law on
   par with `design-system/` primitives, but physically lives in `src/components/dashboard/`. Do mature
   design systems typically enforce a **package/folder boundary** (a separate workspace, a barrel with
   restricted exports, an architecture-linter zone) between "the design system" and "app code that happens
   to be reused," and is skipping that boundary a known source of exactly the kind of ambiguity (is this
   file the SoT or just popular?) this program is trying to eliminate?
7. **Ratchet-only baselines as a governance primitive.** This repo already uses shrink-only baselines for
   `knip` and for every DS guard test, and the plan proposes the same shape for six new chrome guards. Is
   "a stored violation count that CI only allows to decrease" a named, well-understood pattern in 2026
   tooling (it resembles ESLint's `--max-warnings` ratchets, or SonarQube's "new code" quality gates) or an
   ad hoc reinvention? What failure modes does it have at scale (e.g., baseline files becoming large,
   opaque, or gamed) and how do mature orgs mitigate them?
8. **Design systems as LLM-agent operating manuals.** This repo's `.claude/rules/*.md` files are prose law
   read by a coding agent every session, cross-referenced with guard tests that fail CI independent of
   whether the agent "read and obeyed" the prose. Is there published 2026 practice — from companies known
   for heavy AI-agent-assisted engineering — for structuring a design system explicitly to be legible to
   and enforceable against an LLM collaborator (e.g., machine-readable component manifests consumed by
   coding-agent tools, MCP-based design-system servers, Figma Code Connect as an agent-facing contract,
   or repo conventions specifically documented as "agent context")? Benchmark this repo's approach
   (prose + regex guard + shrink-only baseline, no machine-readable catalog) against that practice and say
   what's missing.
9. **Visual regression's absence.** No Storybook/Chromatic/visual-diff tool exists in this repo; the plan
   relies on TypeScript + unit tests + guard tests + Playwright E2E against one fixed QA tenant to catch a
   Phase A/B/C regression. For a consolidation program that is explicitly about *visual* chrome (KPI tile
   density, tab-strip appearance, identity-bar layout), is skipping visual regression tooling a real risk
   at this program's scale, or is it adequately substituted by the region-contract/density rules already
   encoded as prose plus E2E?
10. **Domain-specific deviation vs. reinvention.** Given the Station region contract's scanner-driven,
    hands-busy, ephemeral-selection interaction model has no close analog in Polaris/Carbon/Atlaskit/
    Material (which assume pointer-driven CRUD), which parts of this program's approach are a defensible,
    necessary departure from generic 2026 design-system practice, and which parts (token pipeline,
    anti-fork tooling, component API shape) have nothing to do with the Station-specific need and are
    simply behind where a generic B2B SaaS design system would be in 2026?

---

## 6. Decisions — take a side on each

### D1 — Guard tests: hand-written regex tripwires, or a generalized lint-rule engine?
**Current:** ~15+ bespoke `*.guard.test.ts` files, one per SoT, each with its own hand-written
grep/regex assertions (e.g. "no file's source text matches `/\bsearch\??:/`").
**Proposed by the plan:** add ~6 more, one per new phase, same shape.
**Counter-argument:** a fleet of one-off regex files is itself a maintenance liability and the exact
"page-local twin of a shared job" anti-pattern this program exists to eliminate — just at the tooling
layer instead of the component layer. Is there a threshold (component count, guard count) past which
`eslint-plugin-boundaries` or a `dependency-cruiser` rule set becomes strictly better, and has this repo
already crossed it?

### D2 — Discovery: manual grep audit each phase, or a persistent twin-detection tool?
**Current:** every phase opens with a "baseline inventory" step where an engineer/agent greps and reads
files fresh.
**Proposed:** same, repeated for Phases B, C, D, F.
**Counter:** the repo already owns `knip` and `dependency-cruiser`; a one-time investment in a
"components matching pattern X, ranked by import count" report would make every future phase (and every
future *new* consolidation opportunity nobody has named yet) cheaper than a fresh grep audit. Is this
worth doing before Phase A, or is manual audit genuinely fine at this codebase's size?

### D3 — Migration mechanism: 12 manual edits, or one codemod?
**Current:** Phase A's steps are per-file, sequenced by risk ("pilot Pack + Shipping… roll the rest…
Outbound last").
**Proposed:** as written.
**Counter:** `OutboundKpiStrip.tsx` and `PackKpiStrip.tsx` are already measured (§3) to have near-identical
local scaffolding (`TILE_BAND_CLASS` et al.) around the same imported primitive — the textbook case for a
mechanical codemod rather than 12 rounds of manual judgment calls, each an opportunity to introduce a
subtle behavior change the plan explicitly warns against ("metrics pure modules unchanged in behavior").

### D4 — Component API: keep `CartonContextCard`'s 45-prop flat interface, or refactor to compound/slot shape before Phase C spreads it further?
**Current:** every new Station adopts the identity bar via a thin adapter mapping onto one large flat
prop interface.
**Proposed:** Phase C adds more adopters onto the same API.
**Counter:** every additional adopter increases the cost of ever changing that API's shape later (more
call sites to touch), and the plan's Phase G ("identity chips, opportunistic") suggests the team already
suspects presentation-kind SoTs like this need to keep growing. Is locking in the current prop shape now,
under migration pressure, the same mistake as the carton-inspector read-surface brief's D6 finding
("compose the same primitives" enforced the wrong invariant) — should the shared thing be a smaller set of
composable slot primitives instead of one growing prop bag?

### D5 — `WorkbenchChromeHeader`'s location: leave it in a feature folder, or promote it into `design-system/`?
**Current:** lives in `src/components/dashboard/workbench-shell.tsx`, imported by 30 files across the app
as if it were a `design-system/` primitive.
**Proposed:** the plan does not address this; it treats the file's current location as settled.
**Counter:** every other named SoT in the plan's Decisions-locked table (§2 of the plan doc) lives under
`design-system/` or a clearly-scoped SoT folder (`station/entity-context/`, `detail-stacks/`). This one
doesn't, and nothing in tooling currently distinguishes "the SoT" from "a widely-imported feature file" —
is that a real risk for Phase B's audit (an engineer might reasonably build a second "chrome header" inside
`design-system/` believing the dashboard one is app-local), or a non-issue because the guard test will
catch it regardless of file location?

### D6 — Offline detection: three raw implementations, or one `useSyncExternalStore` hook?
**Current:** three independent `navigator.onLine` + listener implementations; only the mobile one uses
`useSyncExternalStore`.
**Proposed (Phase F):** "promote mobile's external-store pattern (or shared `lib/offline/online-store.ts`)."
**Counter:** this is close to the textbook `useOnlineStatus` example from React's own
`useSyncExternalStore` documentation — is there any reason for this repo's version to differ from that
canonical shape, or should Phase F simply be "extract the standard hook, point three thin banner
components at it," the lowest-risk and most mechanically obvious phase in the whole plan? Does the plan
under-prioritize this (Phase F, second-to-last) relative to how cheap and unambiguous the fix actually is?

### D7 — Design tokens: stay hand-written TS, or adopt a DTCG-format pipeline?
**Current:** ~12 category files of hand-written TypeScript/`.mjs` token objects, Tailwind-consumed, no
DTCG JSON, no Style Dictionary.
**Proposed:** the plan does not touch tokens at all — chrome consolidation only.
**Counter:** if this program succeeds, every chrome SoT it produces will consume these same hand-written
tokens more widely than before (more call sites depending on the current shape). Is *now* — before token
consumption widens further — a better moment to evaluate a DTCG migration than after, or is "the tokens
already work, don't touch them mid-consolidation" the correct call, deferring that question entirely?

### D8 — Visual regression: rely on E2E + prose density rules, or add a visual-diff gate before this program starts?
**Current:** no Storybook/Chromatic; correctness for a purely visual consolidation program rests on
TypeScript, unit tests, guard tests (which check *code shape*, not *rendered appearance*), and Playwright
E2E against one fixed QA org.
**Proposed:** the plan's "Done" criteria per phase never mention a screenshot or visual check — only
"verify green" and "no second visual language."
**Counter:** a program whose entire purpose is "make N visually-divergent components render the same way"
has no automated check that they actually *do* render the same way after migration — only that they
compile, pass unit tests, and don't reintroduce a forbidden import. Is this an acceptable gap given the
region-contract/density rules are enforced elsewhere, or a real blind spot for exactly this program?

### D9 — Is the ~45-prop `CartonContextCard` pattern, and monolithic props generally, actually wrong here, or is it the right shape for a single fixed-slot bookmark bar?
**Current:** one large flat interface, thin per-station adapters.
**Counter to D4's counter:** this component has exactly one visual arrangement (identity bar, fixed slot
order) and varies only which facts/controls are present — arguably the case where a large prop bag with
liberal optional fields *is* the right shape, and a compound/slot refactor would just move the same
complexity into more files for no behavioral gain. Which is it, and what's the deciding test?

### D10 — Should this brief's own findings (§3) be folded into the plan doc before Phase A starts, or run as-is?
**Current:** the plan's Phase A "golden composition" reference (`OutboundKpiStrip` + `OperationsAnalyticsView`)
is, per §3, not actually representative of the shared-band SoT it's meant to exemplify — `OutboundKpiStrip`
hand-rolls its own band scaffolding. **Proposed:** the plan as currently written would have a session read
that line and reasonably start Phase A by studying the wrong file as "golden."
**Counter:** is this the kind of stale-claim risk the plan's own §14 ("docblocks lie") already anticipates
and handles adequately via "verify by call sites," or does it warrant a one-line correction landed in the
plan doc itself before any phase begins, given that this brief already did the call-site verification and
found the doc wrong?

---

## 7. Constraints — treat these as fixed

- **No code changes are in scope for this research.** The plan is code-free by its own header; this brief
  asks only for a comparative analysis and a recommendation the team can apply to the *plan document*.
- **The region-contract taxonomy (§1) is settled house law**, not up for debate — your answer should
  work within Station/Workbench/Monitor/Canvas, not propose replacing it with a different IA framework,
  though you may note where a named 2026 framework maps onto it for comparison purposes.
- **The six items in the plan's §3.8 ("explicitly out of scope")** — pairing sort, sourcing status
  filters, FBA plan pills, inventory triage filters, claim-wizard steps, Studio zoom levels — are
  deliberately excluded from consolidation and should stay excluded in your recommendation; do not treat
  low nested-facet-slider counts as evidence they should be folded into the header.
- **Phase D (saved views) already has an explicit Ask-first gate** in the plan and should not be resolved
  by this brief — you may inform the gate's decision (D1/D2 choice in the plan) but the plan correctly
  defers it to a human.
- **Ratchet-only baselines are house law across the whole repo** (`knip`, every DS guard), not unique to
  this plan — a recommendation to abandon shrink-only baselines entirely would conflict with an
  established, working repo-wide convention; if you think ratchets are the wrong primitive, say what
  should *replace* the existing ones too, not just the new ones this plan proposes.

---

## 8. What a good answer looks like

- A **named verdict on the central question in §4** — is this repo's prose-law + regex-guard + shrink-only
  baseline governance model a legitimate, perhaps ahead-of-industry, AI-native design-system pattern, or a
  substitute for tooling the team already owns and isn't using? Defend it either way with named systems.
- A **defended position on each of D1–D10**, not a survey of options.
- **Concrete, mechanical recommendations** an engineer can act on immediately — e.g. "add this
  `dependency-cruiser` rule," "extract this hook," "run this codemod before Phase A," "move this file to
  this folder" — not abstract governance advice.
- **A priority-ordered list of what to fix in the plan doc itself** before Phase A starts, given that §3
  already found one of its "Done" criteria pointing at a non-representative reference file.
- **Named 2026 systems and specs** for every comparison, with the conditions under which each pattern
  wins — Polaris/Atlaskit/Primer/Carbon/Spectrum for component governance, DTCG/Style
  Dictionary/Terrazzo/Cobalt for tokens, `eslint-plugin-boundaries`/`dependency-cruiser`/Nx module
  boundaries for import enforcement, Chromatic/Percy/Playwright visual comparisons for visual regression,
  and whatever is actually published (not speculated) about AI-agent-native design-system practice.

An answer that concludes "the plan is fine as written, proceed" is acceptable **only if defended against
the specific measurements in §3** — several of which already contradict claims the plan's own inventory
tables make about current state.

---

## Appendix A — file map (for follow-up questions)

| Concern | Path |
|---|---|
| The plan under review | `docs/todo/chrome-sot-compound-PLAN.md` |
| Region-contract taxonomy | `.claude/rules/contextual-display.md` (+ `.claude/rules/display/*.md`) |
| Composition discipline (compose → grow → compound) | `.claude/rules/pattern-evolution.md` |
| KPI tile SoT | `src/design-system/components/monitor/{KpiStrip,KpiTile,OpsKpiBand}.tsx` |
| Golden-but-unmigrated adapter | `src/components/dashboard/OutboundKpiStrip.tsx` |
| Migrated reference adapter | `src/components/receiving/unbox/UnboxKpiStrip.tsx` |
| Workbench chrome header (SoT, feature-folder location) | `src/components/dashboard/workbench-shell.tsx` |
| Twin tab primitive | `src/components/ui/HorizontalButtonSlider.tsx` |
| Station identity SoT | `src/components/station/entity-context/{StationContextBar,CartonContextCard}.tsx` |
| Detail-stack registry | `src/lib/detail-stacks/registry.ts` |
| Saved views hook | `src/hooks/useSavedViews.ts` |
| Sidebar shell (Phase E reference guard) | `src/components/layout/SidebarShell.tsx`, `src/components/ui/sidebar-search-bar.guard.test.ts` |
| Offline banner triplet | `src/components/{station,layout,mobile}/OfflineBanner.tsx` |
| Design tokens (hand-written, no DTCG) | `src/design-system/tokens/*.ts` |
| Existing but unused-for-this-purpose tooling | `dependency-cruiser` (`.dependency-cruiser.cjs`, `pnpm diagrams:*`), `knip` (`npm run verify`) |
| Verify gate | `.claude/rules/verify.md`, `npm run verify` |
| Sibling research-brief convention (format reference) | `docs/todo/carton-inspector-ux-GEMINI-RESEARCH-BRIEFING.md` |

## Appendix B — raw call-site / size measurements (captured 2026-07-30, via source read + grep)

```
KpiStrip.tsx        40 lines   2 consumers  (IssuesWorkspace, PrimaryKpiGrid)
KpiTile.tsx        102 lines  14 consumers
OpsKpiBand.tsx      123 lines   1 consumer   (UnboxKpiStrip.tsx)
OutboundKpiStrip.tsx  376 lines  imports KpiTile only; hand-rolled band/skeleton/empty/error
PackKpiStrip.tsx      248 lines  imports KpiTile only; hand-rolled band/skeleton/empty/error
UnboxKpiStrip.tsx     209 lines  fully composes OpsKpiBand family

TabSwitch.tsx direct usage:            11 files
WorkbenchChromeHeader direct usage:    30 files
HorizontalButtonSlider direct usage:   36 files

StationContextBar.tsx   81 lines,  3 props   (identity, moreDetails, className)
CartonContextCard.tsx  703 lines, ~45 props
PaneHeader direct usage: 29 files

useSavedViews.ts: 203 lines, server-backed (GET/POST/PATCH/DELETE /api/saved-views),
  `storageKey` param name is a stale label per its own inline comment; 2 consumers
  (TableOptionsMenu.tsx, OutboundSavedViewsList.tsx)

sidebar-search-bar.guard.test.ts: 79 lines, 4 assertions, all passing (deletion guard)

OfflineBanner (station):  64 lines, raw navigator.onLine + addEventListener
OfflineBanner (layout):   65 lines, raw navigator.onLine + addEventListener + queue depth
OfflineBanner (mobile):   97 lines, useSyncExternalStore (the only standards-shaped one)

Design tokens: ~12 hand-written .ts/.mjs category files under src/design-system/tokens/,
  no DTCG ($value/$type) JSON found repo-wide, no Style Dictionary dependency in package.json.
Radix UI already a dependency (7 @radix-ui/react-* packages) underneath house `primitives/`.
dependency-cruiser installed + configured for diagrams/dead-code only, not import-boundary
  enforcement. No Storybook/Chromatic dependency found.
```
