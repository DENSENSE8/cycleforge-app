# Research briefing — design-system fork & technical-debt consolidation vs. 2026 practice

**For:** Gemini Pro (deep research)
**From:** Cycle Forge engineering
**Date:** 2026-08-10
**Subject:** House-wide technical-debt cleanup — inventory the forked/duplicated component families across every page, and design the program that ports them onto one source of truth (SoT). This brief was assembled by a 7-way parallel source audit of the live tree (not the `.claude/rules/*` prose that describes it), so the numbers are what the code says today.
**Status:** Diagnosis complete; no consolidation code written. This brief exists to (a) pressure-test the diagnosis against how mature design systems actually prevent and remove forks in 2026, and (b) get a defended, sequenced remediation program before we spend N sessions executing it — because this repo has already spent ~90 research briefings and 271 guard tests on this class of problem and the forks persist anyway. That persistence *is* the thing to explain.

**Deliverable:** (a) a benchmark of this repo's anti-fork governance model (prose law + 271 hand-written regex guard tests + shrink-only ratchets, *no* component catalog, *no* visual regression, *no* duplication detector) against named 2026 design-system tooling and organizational practice; (b) a defended verdict on each decision in §6, not a survey; (c) sourced answers to §5; (d) a priority-ordered remediation program an engineer can execute, distinguishing the genuine forks from the by-design variation this audit found masquerading as debt.

---

## 0. How to use this brief

You do not have the codebase. Every count below was pulled from source today by parallel audit agents (grep consumer counts, guard-baseline constants, per-file inspection) — not estimated. Items we could not fully verify are labeled **(inferred — verify)**.

This brief is deliberately skeptical of its own commissioning prompt. The request that started it was "there are a ton of forked components and technical debt across all the pages — the search bar is different on inbound vs unbox, the data table is different across pages, the Check button differs between the two context bars." The audit **confirmed** some of that precisely (the Check button is a true fork; the chrome CTAs are one job in three fill dialects) and **contradicted** other parts (the "data table is different on every page" symptom is mostly *sanctioned per-entity-family variation over one shared shell*, not forking; the inbound-vs-unbox search bar is the *same* component with drifted composition plus a deliberately-guarded regional split). A good answer must keep that distinction — genuine fork vs. by-design variation vs. deliberate divergence — because a consolidation program that flattens the last two would *destroy* working design-system discipline while chasing a symptom.

Three deliverables, kept separate:

1. **What is 2026 industry standard** for (a) preventing and removing near-duplicate component forks in a large in-house design system, (b) the "one growing prop-bag vs. compound/slot composition" API question, (c) enforcing sameness *by construction* vs. *by assertion*, (d) governing a design system whose primary author-and-reader is an **LLM coding agent** (this repo's `CLAUDE.md`/`AGENTS.md`/`.claude/rules/*` are loaded into every agent session; much of the code — and much of the debt — is agent-written at same-day velocity). Name real systems, specs, tools, and the conditions under which each wins. Do not retreat into "it depends."
2. **Take a side on D1–D12 (§6).** Each states the current approach, the strongest counter, and where a measurement already contradicts the optimistic framing.
3. **Answer §5's open questions with sources.**

---

## 1. Product & architecture vocabulary (condensed — you need this to judge fit, not to re-derive it)

**Cycle Forge** is multi-tenant reseller-operations SaaS (eBay + other channels; USAV is the dogfood tenant). One warehouse crew works multiple physical scan "stations" and desk workflows in the same session. It has a named visual identity — **Kinetic Ledger**: dense, state-colored, scan-aware, flush-square "industrial" chrome, explicitly *not* document-calm — and a formal region-contract taxonomy enforced in code:

| Contract | Driven by | Job | Selection | Density |
|---|---|---|---|---|
| **Station** | barcode scanner / keyboard-wedge | act-and-clear, one entity at a time | ephemeral, never URL | `floor` |
| **Workbench** | pointer | pick a record → edit → persist | durable, URL-addressable | `ops` |
| **Monitor** | filters over a stream | observe only, zero edit | none (filters only) | `rollup` |
| **Canvas** | pan/zoom/focus | reshape a graph definition | durable focus in URL | `studio` |

This matters because a real fraction of the surfaces are optimized for a person standing at a bench with a scanner and their hands full — a materially different interaction contract than the pointer-driven CRUD screens most 2026 design-system literature (Polaris, Carbon, Atlaskit, Material 3, Fluent) is written for. Part of your job is separating "defensible domain deviation" from "the team is behind where a generic B2B SaaS design system would be in 2026."

**The governance discipline already in force** (`.claude/rules/pattern-evolution.md`, condensed):

> Compose from the named SoT first. Grow the SoT when it's wrong or weaker than a stronger sibling. Never fork a page-local twin for the *same* job. A genuinely different job earns a new sibling that *composes* the shared primitive. Pair every "don't" with a concrete "do." **Always #6: a retirement is not done until the old path is DELETED, or a guard names the exact surviving call sites — "a rules file cannot fail."**

The last clause is the repo's own admission of the central failure mode: prose law drifts from reality because nothing makes it fail.

**Scale (measured today):** 1,424 components under `src/components`; 129 `.tsx` under `src/design-system`; 147 route `page.tsx`; 935 API routes; 29 `.claude/rules/*.md`; **271 `*.guard.test.ts`**; **90 `*GEMINI-RESEARCH-BRIEFING.md`** already in `docs/todo/`.

---

## 2. The paradox this brief must explain

This is not a codebase with *no* design system, and not one with *no* governance. It has an unusually sophisticated one:

- **271 guard tests** run in `npm run verify` (mirrors CI). They split into ~20–30 **shrink-only token ratchets** (a stored violation count CI only lets decrease) and ~200 **fixed structural invariants** (`deepEqual`/banned-regex/reachability asserts).
- **~203 `ds-allow-*` escape-hatch comments** in-code (per-line, reviewed exemptions), dominated by `ds-allow-raw-neutral` (103), `ds-allow-title` (30), `ds-allow-hex` (20).
- **7 codemods** (`scripts/codemods/*`) — all on the mechanically-rewritable token axes (font weight, color, spacing, text-role).
- **`dependency-cruiser`** with exactly **one** boundary rule (`design-system-stays-generic`: the DS may not import app/feature code). It has **no anti-fork rule** and its own comment references a `COMPONENT_DEDUP_PLAN.md`.
- **`knip`** dead-code gate with a **2,354-entry baseline**.
- A **`scripts/debt-ledger.mjs`** whose own header states the failure outright: shrink-only ratchets *forbid new debt but never force cleanup — "10,540 LOC sat orphaned across 82 files while every gate stayed green."*

And yet: the Check button is forked, 6 chrome-action clusters render one job in three fill dialects, ~290 hand-rolled card shells sit outside the one ratchet that names cards, focus-ring debt has moved from 831→828 raw recipes, and every lifecycle page re-wires an identical 3-band chrome scaffold ~15 times. **Extensive research + extensive enforcement + persistent forks** is the paradox. The two things this repo does *not* have are the two things that would catch this exact class of debt: (1) a way to see a fork where *both doors are imported* (knip is reachability-only — it cannot tell "this is duplicated" from "this is used"), and (2) any check on *rendered appearance* (no Storybook, Chromatic, Percy, Loki, or Playwright visual baselines were found).

---

## 3. Grounded current-state facts (what the audit found — reconcile your research with these, not with the prose)

### 3.1 What is already consolidated (the corrective — do not "fix" these)

The audit found several families at or near total adoption. A consolidation program that touches them is destroying working discipline.

- **Value-shaped identity leaves — near-total adoption, zero twins.** `CopyChip`/`OrderIdChip`/`TrackingChip`/`PoChip`/`SerialChip` (one `CHIP_TONES` registry) and `PlatformMark` (platform paint resolved only at the `color-contrast.ts` boundary). The hunt for page-local `platform→color/hex` maps returned **empty**; ~50 files consume the SoT. `StackedRowIdentity` (~15 golden consumers, banned single-line twin returns **0**), `CompactActivityRow`, and `RailSelectionRoster` (3 consumers) are similarly converged.
- **Grid mount path — effectively closed.** **Zero** hand-wired `<LedgerGridSurface>` mounts survive outside the design system; every virtualized ops queue mounts through `NonlinearTableHost` + a registry `TableDefinition` (**~18 bindings / 16 host files**). The notorious `OrdersQueueColumnHeader` fork was **genuinely retired** (358 lines → a 69-line `makeLedgerGridColumnHeader` config, verified in code today). `GridFieldsMenu` is deleted/banned; `useIsColumnHidden` is fenced to exactly **4** sites. Grid geometry/freeze/width/align/visibility helpers are **one implementation each**.
- **Triage band + scoped search field — single SoT, strong guard.** Every workbench page mounts one `<WorkbenchTriageBand>`; the `*TriageBand` names are thin per-page *wrapper functions*, not reimplemented band trees. `band3-find-only.guard.test.ts` **walks disk** and asserts ≥15 mounts follow the recipe. `TechRailSearchBar` (chrome/rail variants) is the one scoped field. `UnboxTriageBand` and `ToolbarSearchToggle` were deleted.
- **Right-edge plumbing — single-sourced.** One occupant store (`src/lib/right-rail/store.ts`, priority `assistant:10 < detail:100`), one index→leaf waist (`DisplaysIndexLeafStage`), one resize hook (`useHorizontalEdgeResize` — exemplary, all page-local `fixed right-0` asides migrated to docstrings recording their deletion), one order-editor SoT (`ShippedDetailsPanel`, context-parameterized and *wrapped* by Unshipped/Dashboard/Staged rather than forked).
- **Workbench chrome primitives + sheet host — fully fenced.** `WorkbenchChromeHeader` (20-entry guarded `BAND_CONSUMERS`), `WorkbenchKpiBand` snap-collapse dock, `DashboardScrollShell` + `WORKBENCH_SHEET_CHROME/HOST` (16 `*-sheet.guard.test.ts`). The retired framed-gutter recipe is grep-banned everywhere.

**The load-bearing observation:** the families that converged are the ones a guard can *count raw call sites of*, and whose whole behavior a single call expresses (a chip, a mount path). The families that drift are structural — they keep their own resting chrome/wiring, so each site re-types the shell.

### 3.2 The genuine debt inventory (ranked; this is the program)

| # | Fork family | What's actually forked | Measured evidence | Guard reality | Severity |
|---|---|---|---|---|---|
| D-1 | **Chrome-action CTA fill** | 6 `*ChromeActions` render one job (Band-1 trailing CTA cluster) in **3 incompatible fill dialects**: house `Button` variants (Receiving/Outbound/Pickup), the cube (Repair), **hardcoded hex** (Incoming `bg-slate-700`/`bg-blue-600`/`bg-emerald-600`, Support `bg-emerald-*`) | The **Check button**: Unbox/Arrival = `Button variant="secondary"` (white card+ring); Inbound `/incoming` = `Button` overridden with `bg-slate-700` (solid graphite). Same label, same `ClipboardList` glyph, **same underlying panel** (`IncomingBulkTrackingPanel`). "Add" is blue-`primary` on Unbox, `bg-emerald-600` on Inbound. `WorkbenchChromeCubeMenu` (the "tabs in one cube" SoT) has **1 adopter**; Incoming's Import hand-rolls the exact violation it exists to prevent | `receiving-box-chrome-actions.guard.test.ts` **mandates the two surfaces use *different* components**; **no guard checks the two faces match** — the drift is green by construction | **HIGH** (user-visible; the exact reported defect) |
| D-2 | **Assembly boilerplate** | The 3-band sheet scaffold is factored at the *primitive* level but **never at the assembly level**, so ~15 lifecycle pages copy the identical wiring | ~20 `*WorkspaceHeader` + ~10 `*TriageBand` + ~16–24 `*WorkspaceView` hosts. `*WorkspaceView` files are **~75–90% boilerplate**; `*WorkspaceHeader` Band-1 ~85%. A parametric `<WorkbenchSheetView>` could delete **~600–750 LOC across ~15 surfaces** and collapse 30 wrappers into config objects | Guards enforce **sameness by assertion** (each page must import the same constants + mount the same components), not **by construction** (one shell nobody can diverge from) | **HIGH** (leverage) |
| D-3 | **Card / surface shells** | Hand-rolled `rounded-* border bg-surface-card shadow-sm` instead of `Panel`/`SectionCard`/`CardShell` | Census: **~1,264 hand-rolled shells vs ~25 primitive uses (~1.9% adoption)**. Ratchet pins **only** the exact `rounded-2xl` triple (`HANDROLLED_SHELL_BASELINE=130`, ~77 live); the visually-identical **~290 `rounded-xl`/`rounded-lg` shells have no ratchet at all** | `surface-box-tokens.guard.test.ts` measures the signature, not the job | **HIGH** (volume) |
| D-4 | **Focus rings** | Raw `focus:ring/outline/border/shadow` recipes instead of `focusRing(archetype, tone)` | `RAW_FOCUS_BASELINE=831`, **828 live** across ~220 files — the deepest token debt, essentially unmoved | shrink-only; forbids new, doesn't force old | **HIGH** (volume) |
| D-5 | **KPI tile-band container** | 4 byte-identical `const TILE_BAND_CLASS = 'flex flex-wrap gap-3'` copies (Sales/Ready/Fba/Triage) + own skeleton/empty, bypassing `OpsKpiBand` | `UnboxKpiCanvas` is a partial (imports the empty/error states, hand-rolls the row) | `workbench-kpi-band.guard.test.ts` pins **only the 5 golden strips**; the 4 copies are unguarded | **MED** |
| D-6 | **Inbound↔History two cell registries (C1)** | Two cell maps + two layout modules over the **same `ReceivingLineRow`**: `receiving-grid/cells/` (17 files, 13 components) vs a separate `renderIncomingGridCell` switch + `incoming-grid-layout.ts` | Header grammar **already unified** via `SHARED_LINE_TRACK_META`; the ruling to merge the rest (one `entityFamily`, one host) is **approved but P1 unlanded** | ruled in `source-of-truth.md` (2026-08-10); guarded per-family, not yet unified | **MED** (highest-value grid target) |
| D-7 | **Pre-LedgerGrid station bench** | `StationListTable` (**dual path**: `LedgerGrid` when virtualized, else a hand-rolled dense `role="grid"`), `StationHistoryTable`, hand-rolled `StationRowColumnHeader` (139L, the last header fork), still calling `useIsColumnHidden` | Consumers: `PackerTable`, `TechTable`, `StationPipelineBoard` | "migrates with its surface" (prose), no forcing guard | **MED** |
| D-8 | **Inspector header grammar** | 3 hand-rolled record-inspector headers slip the allowlist guard: `MyDayTaskInspector` (`<h2 text-role-title>` + bare `<X>` close — both banned), `FbaBoardDetailPanel` (4-row hand-roll, `<h2>` hero, `px-6`), `SkuDetailHeader` (page `<h1>` reused as rail chrome). Plus within-family drift (Repair/CompactOrderPeek use `PaneHeader`+badge, non-golden) | The C2 "share the waist, fork the shell" line is respected for *plumbing* everywhere; **violated only at the header-shell edge**, in newer/peripheral features | `right-rail-inspector-header.guard.test.ts` **allowlists a golden set** rather than scanning all registrar files → the 3 forks are invisible to it | **MED** |
| D-9 | **Refine funnel** | The faceted `role="tablist"` filter popover is hand-rolled **twice inside `UnboxWorkspaceHeader`** (history + triage variants, near-identical) and again in `HistoryWorkspaceHeader` | `WorkbenchFilterPopover` primitive is shared; the funnel *composition* on top is not factored | `band3-find-only` pins where refine sits, not that the funnel is one component | **MED** |
| D-10 | **Honest-absence / skeleton soup** | `"N/A"` literal (**25 survivors**) and `animate-pulse` skeleton blocks (**62 files**, worst offenders ×6–7 each) instead of `GridCellDash`/`—` and settled-empty copy | No aggregate ratchet; only per-surface guards | **MED** |
| D-11 | **Neutral color** | Raw `gray/slate/zinc` utilities instead of semantic tokens | `RAW_NEUTRAL_BASELINE=43` + **103 `ds-allow-raw-neutral`** escape hatches → by far the least-migrated axis | shrink-only | **MED** |
| D-12 | **Sidebar recent-rail hand-rolls** | Two pages hand-roll the recent list instead of wrapping `SidebarRecentRailBase`: `SupportTicketsRecentRail`, `DashboardRecentsPanel` | The engine (`useSidebarRail` → `SidebarRailShell` → base) has ~7 clean consumers | no guard forces pages to wrap the base | **LOW-MED** |

Minor residue also found (LOW): per-station `*DisplaysActionFloor` re-declare their `FLOOR_ICON_*` constants 3× instead of reusing the desk's `FloorIconButton`; `FbaOutboundWorkspace` mounts `SlicedActionDock` directly, bypassing the single `StationTerminalDock` path; `SlicedActionDock` vs `StickyActionBar` are drifting near-twins (declared different lanes); `SkuDetailView` uses a per-record occupant id (`detail:sku:${sku}`) deviating from the stable-id contract; ~`ds-raw-button` appears across **379 files** (most sanctioned Radix `asChild` triggers).

### 3.3 The user's three named examples, adjudicated

1. **"The search bar is different for inbound vs unbox."** — **Same component, drifted composition + deliberate split.** Both mount the identical `<WorkbenchTriageBand>` + `<TechRailSearchBar variant="chrome">`. `/incoming` adds post-field hot chips + an icon-cluster refine + pagination/sort; `/unbox` uses a single "Refine" funnel + a KPI toggle + no right zone. `regional-sidebar-split.guard.test.ts` **deliberately** keeps them physically distinct "so muscle memory holds." Genuine residue: the refine *funnel* (D-9), not the band.
2. **"The data table is different across pages."** — **Mostly by-design, not forked.** One shell (`LedgerGridSurface` via the registry) renders ~18 sanctioned per-`entityFamily` cell vocabularies. Genuine residue: the Inbound↔History second cell registry (D-6) and the pre-LedgerGrid station bench (D-7).
3. **"The Check button differs between the inbound and unbox context bars."** — **True fork, and worse than described:** a guard actively *mandates* the two surfaces use different components (`ReceivingBoxChromeActions` vs `IncomingChromeActions`) while no guard checks the faces match, so a `variant="secondary"` and a `bg-slate-700` override both pass green (D-1).

---

## 4. The unifying diagnosis — the central research question

Across all seven audits, the same shape recurs, and it is the thing to benchmark:

> **This design system is consolidated at the primitive / plumbing / value layer and drifts at the assembly / chrome / structure layer, because its enforcement asserts sameness rather than constructs it — and the one class of debt its tooling literally cannot see (a fork where both doors are imported) is exactly that un-constructed layer.**

Three mutually-reinforcing mechanisms produce it:

1. **Sameness by assertion, not by construction.** 271 guards say "every page must import these constants and mount these components." That makes primitives un-forkable but leaves the *composition* of them as a per-page recipe that is copied ~15× and can drift (chrome CTA fill, KPI tile-band container, 3-band assembly, inspector header). Worse, the guards **allowlist golden surfaces** rather than universally scanning a structural role, so any new/peripheral surface the allowlist never enumerates slips entirely (`MyDayTaskInspector`, `FbaBoardDetailPanel`, `SkuDetailHeader`; the 4 KPI-band copies).
2. **Signature-precise ratchets manufacture false-green.** A shrink-only baseline measures the narrow thing it can name — the exact `rounded-2xl` triple (77/130) — while ~290 visually-identical soft-radius shells accrue with no ratchet, and focus-ring debt reads "passing" at 828/831 having barely moved. The guard measures the token signature, not the job.
3. **Golden-first / fan-out-later that structurally stalls.** Capabilities land on a golden (History-first, Unbox-first) and port "one family at a time," but shrink-only ratchets forbid *new* debt without *forcing* migration completion — so the fan-out dies mid-flight (`RAW_FOCUS 828/831`, `control-size 141/178`, 103 neutral escape hatches, C1 approved-but-unlanded, station bench un-migrated). The repo's own `debt-ledger.mjs` says it: "10,540 LOC sat orphaned … while every gate stayed green."

Layered on top is an **AI-agent-native** wrinkle absent from most 2026 design-system literature: the SoT prose (`.claude/rules/*`) is loaded into every coding-agent session and *much of the code and the debt is agent-authored at same-day velocity* — the rules read as a dated changelog of same-day builds and retirements ("built and retired within a day"). Enforcement is prose-heavy (29 rule files, 90 briefings) and structurally-light, so prose retirements silently go stale: `parkRail`, `salesCartStore`, `ToolbarSearchToggle`, the hand-ticked checklist, `UnboxProcedureRail` are all declared "deleted/retired" in the rules with **no guard** — and the `navMode` regression shipped with *mode-string guards green through the entire regression* (guard presence ≠ guard correctness). The question your research must answer: **is this repo's prose-law + bespoke-regex-guard + shrink-only-baseline model a legitimate, perhaps ahead-of-industry, AI-native governance pattern — or a substitute for tooling (import-boundary linters, a component catalog, a duplication detector, visual regression, codemods) it mostly already owns and isn't pointing at the problem?**

---

## 5. Deep research questions — answer with named systems, specs, and sources

1. **Sameness by construction vs. assertion.** For consolidating N near-duplicate *assemblies* (this repo's 3-band chrome, the chrome-action cluster, the inspector header), do mature systems prefer (a) a single parametric shell / layout component nobody can diverge from, (b) compound/slot composition with a fixed contract, or (c) allowlist guard tests asserting each site composes the right parts? Name production systems for each (Polaris, Carbon, Atlaskit/Atlassian Design System, GitHub Primer, Adobe Spectrum, Material 3, Fluent 2) and the conditions under which each wins. Is an allowlist guard a known anti-pattern once a system passes a component-count threshold?
2. **Preventing regrowth of a deleted fork.** What do those systems actually use to stop a deleted pattern from coming back — ESLint custom rules, `eslint-plugin-boundaries`, `dependency-cruiser` forbidden-import rules, Nx module boundaries, `sheriff`, `ts-arch`, Backstage component catalogs with usage telemetry, Chromatic visual gates, or hand-written regex guards like this repo's 271? Is a *fleet of bespoke per-SoT regex guards* itself a fork of the enforcement job that a single generalized rule engine replaces at scale? Given the repo already runs `dependency-cruiser` (with only a generic-DS rule) and `knip`, is there a concrete, low-effort repoint of them at *twin detection* and *anti-fork import zones*?
3. **The invisible-fork class.** knip is reachability-only and, per this repo's own experience, "cannot see a fork whose doors are both imported." What is the 2026 standard for detecting structural/semantic component duplication where both copies are imported — `jscpd`, `similarity-ts`, AST-similarity (`ast-grep`), a usage-count/twin report, or a component catalog that forces discovery-before-build? Name tools and their false-positive behavior on legitimate per-domain siblings (this repo's ~18 by-design cell registries must *not* trip a duplication detector).
4. **Visual regression's absence, for a visual program.** No Storybook/Chromatic/Percy/Loki/Argos/Playwright-visual baselines exist. A consolidation program whose entire point is "make N visually-divergent components render the same" has *no automated check that they do* — only that they compile and don't reintroduce a banned import. Is that an acceptable gap given region-contract/density rules + E2E against one fixed QA tenant, or a hard blind spot? What 2026 setup would you add (component-level Storybook + Chromatic? Playwright `toHaveScreenshot` on rendered surfaces? Argos?) and at what cost/benefit for a dense, themed (light/dark, per-tenant) UI?
5. **Migration mechanism by debt shape.** The repo has 7 token-axis codemods already. For the *value-shaped* sweeps (828 focus rings, ~290 card shells, 103 neutral utilities), is a codemod (`jscodeshift`/`ts-morph`/`ast-grep`/Grit/OpenRewrite) standard practice and meaningfully safer than manual, and what's the accepted 2026 file-count × similarity threshold above which teams reach for one? For the *structure-shaped* debt (assembly boilerplate, chrome CTA), is codemod the wrong tool (extract-a-shell/compound-refactor instead)? Where is the line?
6. **Component API: growing prop-bag vs. compound/slot.** The assembly layer is the cost center. Compare a single parametric `<WorkbenchSheetView props>` shell against compound-component/slot/recipe patterns dominant in 2026 headless UI (Radix composition — already partially used here — React Aria, Ark UI, Panda/vanilla-extract "recipes," CVA, shadcn copy-in-composed). Which reduces long-run drift for a fixed-slot-order chrome that varies only *which* controls are present? When does a large flat prop interface become the right shape instead?
7. **Ratchets that forbid but never force.** Shrink-only baselines (this repo's `knip` + every token guard) are ESLint-`--max-warnings`/SonarQube-"new-code-gate" shaped. But they demonstrably let fan-outs stall (828/831; "10,540 LOC orphaned, gates green"). What is the named 2026 practice that *forces completion* — scheduled ratchet decrements, burn-down owners, time-boxed "debt sprints," a SonarQube "new code" + "overall coverage floor" combo, or "the golden must be at 100% adoption before the next capability lands"? What failure modes do large opaque baselines have and how is each mitigated?
8. **Design systems as LLM-agent operating manuals.** This repo's law is prose read by a coding agent every session, backed by regex guards that fail CI whether or not the agent "read" the prose. Much debt is agent-authored velocity outrunning enforcement. Is there *published* 2026 practice (from AI-agent-heavy engineering orgs) for structuring a design system to be legible to and enforceable against an LLM collaborator — machine-readable component manifests consumed by agent tools, MCP-based design-system servers, Figma **Code Connect** as an agent-facing contract, a "does this component already exist / what is the SoT for job X?" retrieval tool, or repo conventions explicitly documented as agent context? Benchmark this repo (prose + regex + shrink-only baseline, *no* machine-readable catalog) against it and say precisely what's missing.
9. **Tokens & a semantic-intent gap.** The Button variant vocabulary (`primary`/`secondary`/`danger`) doesn't cover the palette stations reach for (emerald "Add", slate "Check"), so authors hand-paint `bg-<hue>` on the shared pill — the direct cause of D-1. Is the right 2026 answer (a) extend the semantic-intent set (more Button variants / CVA recipes), (b) adopt a DTCG-format token pipeline (Style Dictionary / Terrazzo / Tokens Studio) so intents are generated not hand-typed, or (c) both? The repo's tokens are 100% hand-written TS/`.mjs`, no DTCG JSON, no Style Dictionary. Under what conditions (single web platform vs. web+native vs. white-label multi-brand future) does adopting DTCG win over extending the hand-written set?
10. **Keeping prose law from lying.** `parkRail`/`salesCartStore`/`ToolbarSearchToggle` are "deleted" in prose with no guard; a "Two chrome families" rules table still lists a `SectionTabsSlider density=icon` grammar the guard bans. Always #6 ("not done until deleted or a guard names survivors") is the repo's own fix — is it the right law, and what do mature orgs use to keep design-law docs executable and non-drifting (Code Connect, doc-lint/`doc-catalog` gates, "docs generated from the component registry," literate/executable specs)?
11. **Domain deviation vs. reinvention.** The Station scanner-driven, hands-busy, ephemeral-selection contract has no close analog in Polaris/Carbon/Atlaskit/Material. Which parts of this program are a *defensible, necessary* departure from generic 2026 practice (the C2 station-vs-desk right-edge fork; per-`entityFamily` cell registries; flush-square Kinetic Ledger identity), and which parts (assembly boilerplate, chrome CTA fill, card-shell drift, focus-ring debt, no visual regression, no duplication detector) have nothing to do with the Station need and are simply behind where a generic B2B SaaS design system would be?
12. **Sequencing under agent velocity.** Given the debt is partly re-generated each session by an LLM agent, what is the correct *order* of interventions so the program converges instead of the agent re-forking behind it — enforcement-first (add the detectors/boundaries so new forks can't land), migration-first (burn down the goldens to 100%), or catalog-first (give the agent discovery so it composes)? Cite how real orgs sequence a "stop-the-bleeding then drain" design-system consolidation.

---

## 6. Decisions — take a side on each

- **D1 — The assembly shell.** Extract one parametric `<WorkbenchSheetView surface header={…} kpi={…} triage={…} body={(tab)=>…}/>` (sameness *by construction*, ~600–750 LOC deleted, 30 wrappers → config) **vs.** keep per-page recipes fenced by allowlist guards. If construction, what is the right seam so per-page overlays (Shipping order rail, Triage bulk bar) still fit without re-forking? Counter: the golden-composition briefing this repo already wrote (`chrome-sot-compound`) chose per-file manual migration and did *not* propose a shell — was that right?
- **D2 — Chrome CTA.** Introduce semantic `Button` intents (or CVA recipes) for the station palette (emerald "Add", slate "Check") **and** a guard banning raw `bg-<hue>` on `WORKBENCH_CHROME_PILL_CLASS` peers, then collapse the Check button to one `ChromeCheckButton` shared by Inbound + Unbox — **vs.** accept per-surface hand-paint as intentional regional identity. The receiving guard *mandates different components*; should that guard be inverted to *mandate the same face*?
- **D3 — Card shells.** Broaden `surface-box-tokens.guard` from the `rounded-2xl` signature to *shape* (all radii) and codemod the ~290 soft-radius shells onto `Panel` — **vs.** accept the long tail (a `rounded-lg` inset is sometimes genuinely not a `Panel`). Where's the line between "hand-rolled `Panel`" and "legitimately not a card"?
- **D4 — Guard architecture.** Convert allowlist guards (inspector header, KPI band, chrome actions) to **repo-wide structural scans** of role-bearing files (all `DetailStackRailRegistrar`/`useRegisterRightPanel`; all `*ChromeActions`; all `KpiTile` band containers) — **vs.** keep golden allowlists. And the bigger question: is a fleet of **271 bespoke regex guards** itself the enforcement-layer fork, and past what threshold does `dependency-cruiser`/`eslint-plugin-boundaries`/`ts-arch` strictly dominate it?
- **D5 — The missing detector.** Wire a duplication/twin detector (`jscpd`/`similarity-ts`/`ast-grep`) + a component-usage report + `dependency-cruiser` anti-fork rules into `verify` — **vs.** keep manual grep audits per phase. Must not false-positive the ~18 by-design cell registries; how?
- **D6 — Visual regression.** Add Storybook+Chromatic (or Playwright `toHaveScreenshot`/Argos) before a *visual* consolidation program — **vs.** rely on structural guards + E2E. If added, at what granularity (primitive stories vs. rendered surface screenshots) for a themed, dense UI?
- **D7 — Migration mechanism.** Codemod the value-shaped sweeps (focus rings, card shells, neutrals) and hand-refactor the structure-shaped assemblies — **vs.** one uniform approach. Confirm or refute the shape-based split and give the threshold.
- **D8 — Force fan-out completion.** Replace "shrink-only, no deadline" with a completion-forcing primitive (scheduled decrement / burn-down owner / "golden at 100% before next capability" / SonarQube new-code gate) — **vs.** keep shrink-only and accept stalls. Which, concretely, for `RAW_FOCUS 828`?
- **D9 — Inbound↔History (C1).** Land P1 now (delete the `incoming` cell family, absorb into `receiving-grid/cells/`, one host) — **vs.** leave the honest-sibling split until the golden proves more. It's ruled-to-merge and approved; is there any reason not to be next?
- **D10 — Agent-native governance.** Add a machine-readable component catalog / "what is the SoT for job X?" retrieval surface (MCP DS server, registry manifest, Code Connect) the coding agent must consult before building — **vs.** rely on prose in the session context + post-hoc guards. Is discovery-before-build the highest-leverage single change given agent velocity?
- **D11 — Tokens/DTCG.** Extend the hand-written semantic-intent set **vs.** migrate to a DTCG + Style Dictionary/Terrazzo pipeline. Given per-tenant theming today and a plausible white-label future, is *now* (before consolidation widens token consumption further) the moment, or is "don't touch tokens mid-consolidation" correct?
- **D12 — Prose-vs-code drift.** Enforce Always #6 mechanically (a meta-guard: every "deleted/retired X" claim in `.claude/rules/*` must have a `doesNotMatch(/X/)` guard) and generate the "Two chrome families"-style tables from the registry — **vs.** accept prose drift as cheap. Is a doc-that-cannot-lie worth the tooling?

---

## 7. Constraints — treat these as fixed

- **The region-contract taxonomy (§1) is settled house law** — Station/Workbench/Monitor/Canvas. Work within it; map named 2026 frameworks onto it for comparison but don't propose replacing it.
- **Kinetic Ledger identity is fixed** — dense, state-colored, flush-square, no foreign design kit, no second visual language, no fourth typeface. "Better" means stronger *within* this family, not adopting Polaris/Carbon wholesale.
- **The C2 station-vs-desk right-edge fork is deliberate and correct** — two interaction shells over a thin shared waist. Do not recommend merging the station push column onto the desk `RightRailHost`; that is explicitly ask-first mode-error territory.
- **By-design per-`entityFamily` variation is not debt** — ~18 cell registries + layout modules over one grid shell is the intended fan-out. A duplication detector or consolidation recommendation that flattens these is wrong.
- **Ratchet-only baselines are repo-wide house law** (`knip` + every token guard). If you argue ratchets are the wrong primitive, say what replaces the *existing* ones too, not just the new ones — and reconcile with the measured stall.
- **AI coding agents are first-class authors and readers** — any recommendation must survive an LLM agent executing it session-by-session, and ideally make the agent *compose* rather than re-fork.

---

## 8. What a good answer looks like

- A **named verdict on §4's central question** — is the prose-law + 271-regex-guard + shrink-only-baseline + no-catalog/no-visual-regression model a legitimate AI-native governance pattern or a substitute for tooling the team already owns? Defend it with named systems and dates.
- A **defended position on each of D1–D12**, not a menu.
- **Concrete, mechanical recommendations** an engineer runs immediately — "extract `<WorkbenchSheetView>` with this seam," "add these two `dependency-cruiser` rules," "codemod the 828 focus rings with this transform," "invert the receiving Check-button guard," "wire `jscpd` with these thresholds excluding the cell registries," "add a `stories`-less Playwright visual baseline on these N surfaces" — not abstract governance advice.
- A **priority-ordered remediation program** that distinguishes genuine forks (D-1…D-12) from the by-design variation in §3.1/§3.3, and states the sequencing (enforcement-first vs. migration-first vs. catalog-first) with a rationale that accounts for agent velocity.
- **Named 2026 systems and specs for every comparison**, with win-conditions: Polaris / Atlaskit / Primer / Carbon / Spectrum / Material 3 / Fluent 2 for component governance & API shape; DTCG / Style Dictionary / Terrazzo / Tokens Studio for tokens; `eslint-plugin-boundaries` / `dependency-cruiser` / Nx / `sheriff` / `ts-arch` for import boundaries; `jscpd` / `similarity-ts` / `ast-grep` for duplication; Chromatic / Percy / Loki / Argos / Playwright for visual regression; `jscodeshift` / `ts-morph` / Grit / OpenRewrite for codemods; and whatever is *actually published* (not speculated) about AI-agent-native design-system practice — MCP DS servers, Code Connect, registry manifests.

An answer concluding "the current model is fine, just finish the migrations" is acceptable **only if defended against the specific measurements in §3/§4** — the 828/831 stall, the ~1.9% card adoption, the guard that mandates the Check-button fork, and the "10,540 LOC orphaned, gates green" admission.

---

## Appendix A — file map (for follow-up questions)

| Concern | Path |
|---|---|
| Region-contract taxonomy | `.claude/rules/contextual-display.md` (+ `.claude/rules/display/*.md`) |
| Composition discipline (compose → grow → compound; Always #6) | `.claude/rules/pattern-evolution.md` |
| SoT invariant list | `.claude/rules/source-of-truth.md` |
| **Chrome CTA fork (the Check button)** | `src/components/receiving/ReceivingBoxChromeActions.tsx` (`variant="secondary"`) vs `src/components/sidebar/receiving/incoming/IncomingChromeActions.tsx` (`bg-slate-700`); guard `src/components/receiving/receiving-box-chrome-actions.guard.test.ts` |
| Chrome-action siblings | `OutboundOrderChromeActions`, `PickupChromeActions`, `RepairChromeActions`, `SupportTicketChromeActions`; cube SoT `src/components/dashboard/workbench-chrome-cube-menu.tsx` (1 adopter: `unshipped/OrdersSyncPopover.tsx`) |
| Button primitive (variant vocabulary) | `src/design-system/primitives/Button.tsx` |
| Assembly boilerplate | `*WorkspaceView`/`*WorkspaceHeader`/`*TriageBand` across `src/components/{dashboard,receiving,tech,packer,outbound,fba,sidebar}` |
| Workbench chrome SoT | `src/components/dashboard/workbench-shell.tsx` (`WorkbenchChromeHeader`, `WorkbenchTriageBand`, `WorkbenchTrailingCluster`), `DashboardScrollShell.tsx` |
| KPI SoT + forks | `src/design-system/components/monitor/OpsKpiBand.tsx` vs `TILE_BAND_CLASS` copies in `walk-in/SalesKpiStrip.tsx`, `outbound/ready/ReadyKpiStrip.tsx`, `fba/FbaKpiStrip.tsx`, `receiving/triage/TriageKpiStrip.tsx` |
| Card/surface SoT + ratchet | `src/design-system/primitives/{Panel,CardShell}.tsx`; `src/components/ui/surface-box-tokens.guard.test.ts` (`HANDROLLED_SHELL_BASELINE`) |
| Focus ring SoT + ratchet | `src/design-system/tokens/focus-ring.ts`; `src/components/ui/focus-ring-tokens.guard.test.ts` (`RAW_FOCUS_BASELINE`) |
| Grid SoT (mount path) | `src/components/tables/NonlinearTableHost.tsx` + `table-definition-registry.ts`; `src/design-system/components/grid/*`; retired fork now-config `src/components/dashboard/orders-queue/OrdersQueueColumnHeader.tsx` |
| Inbound↔History C1 | `src/components/station/receiving-grid/cells/` vs `src/components/station/incoming-grid/cells/`; unifier `src/lib/receiving/shared-line-tracks.ts` |
| Pre-LedgerGrid bench | `src/components/station/{StationListTable,StationHistoryTable}.tsx`, `src/components/dashboard/queue-table/StationRowColumnHeader.tsx` |
| Right-edge host + waist | `src/lib/right-rail/store.ts`, `src/components/right-rail/DeskInspectorIndexShell.tsx`, `src/components/station/displays/{StationDisplaysPushStack,DisplaysIndexLeafStage}.tsx` |
| Inspector header SoT + slip forks | `src/components/right-rail/DeskRailChromeRow.tsx`; forks `features/my-day/MyDayTaskInspector.tsx`, `fba/FbaBoardDetailPanel.tsx`, `sku/sku-detail/SkuDetailHeader.tsx`; guard `right-rail-inspector-header.guard.test.ts` |
| Resize primitive (exemplary) | `src/design-system/hooks/useHorizontalEdgeResize.ts` + `HorizontalEdgeResizeHandle.tsx` |
| Verify gate | `scripts/verify.mjs`, `.github/workflows/ci.yml`, `.claude/rules/verify.md` |
| Debt ledger (the admission) | `scripts/debt-ledger.mjs` |
| Dep-cruiser (one boundary rule) | `.dependency-cruiser.cjs` (`design-system-stays-generic`; references `COMPONENT_DEDUP_PLAN.md`) |
| knip baseline | `knip-baseline.json`, `scripts/knip-gate.mjs` |
| Codemods (token-axis only) | `scripts/codemods/{cap-font-weight,color-tokens,spacing-intents,text-*}.mjs` |
| Prior briefings on this problem (format + prior art) | `docs/todo/{chrome-sot-compound,ops-table-simplification,nonlinear-data-table-engine,workbench-chrome-band-density,in-house-libraries-premium-gap}-GEMINI-RESEARCH-BRIEFING.md` |

## Appendix B — raw measurements (captured 2026-08-10, via 7-way source audit + direct grep)

```
SCALE
  src/components/*.tsx          1,424
  src/design-system/*.tsx         129
  route page.tsx                  147
  api route.ts                    935
  .claude/rules/*.md               29
  *.guard.test.ts                 271
  *GEMINI-RESEARCH-BRIEFING.md     90   (in docs/todo/)

RATCHET BASELINES (shrink-only ceilings; live where measured)
  RAW_FOCUS_BASELINE       831   (live 828 — deepest, ~unmoved)
  OVERRIDE_BASELINE        178   (IconButton box overrides; live 141)
  HANDROLLED_SHELL_BASELINE 130  (rounded-2xl triple; live ~52–77)
  RAW_NEUTRAL_BASELINE      43   (+103 ds-allow-raw-neutral escape hatches)
  HEX_UTILITY_BASELINE      24   (live ~16)
  ALERT_BASELINE             0   (migration finished)
  spacing / typography       0   (zero-tolerance, clean)

CARD / SURFACE SHELLS
  hand-rolled shells (census)  ~1,264   vs primitive uses ~25  (~1.9% adoption)
  rounded-2xl+border+bg-surface-card   ~77   (ratcheted)
  rounded-xl  + …                      ~147  (NO ratchet)
  rounded-lg  + …                      ~144  (NO ratchet)   → ~290 outside any ratchet

CHROME ACTIONS  (6 files, 3 fill dialects)
  house Button variant : ReceivingBoxChromeActions, OutboundOrderChromeActions, PickupChromeActions
  cube                 : RepairChromeActions
  hardcoded hex        : IncomingChromeActions (bg-slate-700/blue-600/emerald-600), SupportTicketChromeActions (emerald)
  Check button         : variant="secondary" (Unbox) vs bg-slate-700 (Inbound); SAME panel IncomingBulkTrackingPanel
  WorkbenchChromeCubeMenu adopters: 1 (OrdersSyncPopover)
  ds-raw-button appears across 379 files (most sanctioned Radix asChild)

GRID
  hand-wired LedgerGridSurface outside DS : 0
  registry bindings / host files          : ~18 / 16
  LedgerGrid hand-wired (bag, no descriptor): 2 (FbaBoardTable, StationListTable)
  DataTable (non-virtualized admin)        : ~18 (legit)
  per-entityFamily fan-out                 : ~18 column models + 18 cell maps + ~14 layout modules (by design)
  OrdersQueueColumnHeader                   : 358L fork → 69L factory config (retired, verified)
  GridFieldsMenu                            : deleted;  useIsColumnHidden fenced to 4
  Inbound↔History                           : receiving-grid/cells (17 files, 13 comps) vs incoming-grid/cells (2nd switch+layout); header unified via SHARED_LINE_TRACK_META; C1 P1 unlanded

WORKBENCH CHROME / KPI
  Band-1 tab header forks                   : 0 (all compose WorkbenchChromeHeader; 20-entry BAND_CONSUMERS guard)
  KPI snap-collapse dock forks              : 0
  KPI tile-band container forks             : 4 (TILE_BAND_CLASS='flex flex-wrap gap-3' copies; guard pins only 5 golden)
  *WorkspaceView boilerplate                : ~75–90%   → parametric shell saves ~600–750 LOC / ~15 surfaces
  sheet-chrome host guards                  : 16 *-sheet.guard.test.ts

TRIAGE / SEARCH
  WorkbenchTriageBand                       : single SoT; band3-find-only.guard walks disk, asserts ≥15 mounts
  TechRailSearchBar                         : single SoT (chrome/rail variants)
  deleted (guarded)                         : UnboxTriageBand ;  deleted (comment only, no guard): ToolbarSearchToggle
  refine funnel                             : hand-rolled 2× in UnboxWorkspaceHeader + 1× History
  inbound vs unbox                          : same band; prop/composition drift + regional-sidebar-split.guard

RIGHT-EDGE
  host                                      : RightRailHost + store (assistant:10 < detail:100) vs StationDisplaysPushStack (C2 deliberate)
  page-local fixed-right asides             : all migrated (docstrings record deletion)
  index→leaf waist                          : DisplaysIndexLeafStage (shared, respected)
  inspector header forks (slip allowlist)   : MyDayTaskInspector, FbaBoardDetailPanel, SkuDetailHeader
  order surface                             : ShippedDetailsPanel editor SoT, context-wrapped (best-consolidated)
  resize grip                               : ONE impl (useHorizontalEdgeResize) — exemplary
  fact rows                                 : OrderFactList SoT; <dl> drift in CompactOrderPeek/FBA/MyDay

GOVERNANCE
  verify.mjs                                : lint → tsc → unit+guards → knip → route-perm drift → route-auth → tenancy → schema drift → schema parity → doc-catalog drift
  knip baseline                             : 2,354 parked findings (reachability-only — blind to both-doors-imported forks)
  ds-allow-* escape hatches                 : ~203 (raw-neutral 103, title 30, hex 20, control-size 12, spacing 11, focus 9, radius 6, box 3, alert 3, weight 2, dialog 2)
  dependency-cruiser rules                  : 1 boundary (design-system-stays-generic); NO anti-fork rule; references COMPONENT_DEDUP_PLAN.md
  Storybook / Chromatic / Percy / visual regression / jscpd : ABSENT
  codemods                                  : 7, all token-axis
  prose "deleted/retired" with NO guard     : parkRail, salesCartStore, ToolbarSearchToggle, hand-ticked checklist, UnboxProcedureRail
  debt-ledger.mjs (self-admission)          : "10,540 LOC sat orphaned across 82 files while every gate stayed green"
  guard-correctness caveat                  : navMode regression shipped with mode-string guards green through the whole regression
```
