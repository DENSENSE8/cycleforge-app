# HANDOFF — design-system fork / tech-debt consolidation

**Read this first.** It resumes the DS fork-consolidation program without the originating chat.
**Date:** 2026-08-11 · **Status:** briefing + PLAN written; slices **2b**, **2c**, **1c**, **1a**, **1d**, **2e**, **2f**, **2d (scan stations + To-ship)** landed & verified (uncommitted). Remaining Phase 1: **1b** (jscpd — needs an install decision).

**Companion docs (read in this order):**
1. [`design-system-fork-consolidation-2026-GEMINI-RESEARCH-BRIEFING.md`](design-system-fork-consolidation-2026-GEMINI-RESEARCH-BRIEFING.md) — the diagnosis + measured fork inventory (from a 7-way source audit) + the Gemini deep-research answer it was run through.
2. [`design-system-fork-consolidation-2026-PLAN.md`](design-system-fork-consolidation-2026-PLAN.md) — the ratified D1–D12 decisions + 3-phase execution spec with per-item mechanics, files, acceptance criteria, and ask-first flags. **This is the work list; this HANDOFF is the current position in it.**
3. Auto-memory `ds-fork-consolidation-program.md` (same facts, compressed).

---

## 1. The thesis (why the debt persists)

The DS is consolidated at the **primitive / value** layer and drifts at the **assembly / chrome / structure** layer, because 271 guards enforce sameness **by assertion** ("every page imports the same consts") not **by construction** ("one shell nobody can diverge from"); signature-precise ratchets manufacture false-green; and the one debt class no tool sees — a fork where both doors are imported (knip is reachability-only; no Storybook / visual-regression / jscpd) — is exactly that layer.

**Corrective the next session must keep:** distinguish (a) genuine fork, (b) SoT-with-drifted-composition, and (c) deliberate/guard-blessed divergence. The grids, triage band, and right-edge plumbing are **more consolidated than they look** — the "data table is different on every page" feeling is mostly **by-design per-`entityFamily` variation over one shell**, NOT forking. Do not flatten that.

---

## 2. Ratified decisions (D1–D12) — do not re-litigate

Full rationale in the PLAN §1. Compressed:

| # | Ruling |
|---|---|
| D1 | Extract one parametric `<WorkbenchSheetView>` (compound/slot) — sameness by construction. |
| D2 | Unify the Check *face* into `ChromeCheckButton`; guard mandates the shared face; keep the regional split. **← done (2b).** |
| D3 | Broaden the surface-box guard to shape (all radii); codemod ~290 soft-radius shells → `Panel` with per-hunk review. |
| D4 | **Keep** the 271-guard fleet; evolve golden allowlists → repo-wide structural scans; add `dependency-cruiser` `not-to-match` bans for deleted symbols; **do not** delete structural guards or add `eslint-plugin-boundaries`. |
| D5 | Add `jscpd` as a **shrink-only baseline** with a **curated** ignore set (the by-design siblings). |
| D6 | Add Playwright `toHaveScreenshot` at the rendered-surface/cluster level. |
| D7 | Codemod value-shaped debt (`ast-grep`); hand-refactor structure-shaped debt. |
| D8 | "Golden at 100% before next capability" (PR gate) + **manual** ratchet decrement per burndown PR. **No calendar auto-decrement / CI timebomb.** |
| D9 | Land the Inbound↔History C1 P1 merge (one cell registry). |
| D10 | Machine-readable **SoT-by-job** catalog (MCP), discovery-before-build — index feature-folder SoTs too, not just `src/design-system/`. |
| D11 | **Defer DTCG.** Close the vocabulary gap by extending `Button`/CVA semantic intents (`success`/`execute`). |
| D12 | Meta-guard: every "deleted/retired X" in `.claude/rules/*` must have a matching `dependency-cruiser` ban or guard `doesNotMatch`. |

---

## 3. What has LANDED (uncommitted, verified green)

### 2b — Check-button unification (D2) ✅
- **New:** `src/components/receiving/ChromeCheckButton.tsx` — one shared Check face (golden `variant="secondary"`, `ClipboardList`, "Check"); per-surface `ariaLabel`/`testId` props.
- **Edited:** `ReceivingBoxChromeActions.tsx` (Unbox/Arrival) + `IncomingChromeActions.tsx` (Inbound) both compose it. Inbound's hardcoded **`bg-slate-700` graphite override is removed**; unused `ClipboardList` import dropped.
- **Guards:** `receiving-box-chrome-actions.guard.test.ts` (re-anchored Check on `<ChromeCheckButton` + new face-parity `it()`) and `workbench-chrome-cube.guard.test.ts:122` (same re-anchor — it also indexed `data-testid="receiving-box-check"`).
- **Preserved:** the DOM `data-testid="receiving-box-check"` (passed through `testId`) so `tests/e2e/station-right-edge-one-wrapper.spec.ts` still resolves it.
- **Verify:** `receiving-box-chrome-actions` 3/3 · `workbench-chrome-cube` 7/7 · `band1-house-chrome` 38/38 · `workbench-trailing-cluster` 31/31.

### 2c — KPI band forks → `OpsKpiBand` (D5/PLAN 2c) ✅
- **Edited:** `SalesKpiStrip.tsx`, `ReadyKpiStrip.tsx`, `FbaKpiStrip.tsx` — each dropped its local `const TILE_BAND_CLASS = 'flex flex-wrap gap-3'` + `TILE_CELL_CLASS` and now composes `<OpsKpiBand>` / `<OpsKpiBandCell>` from `@/design-system/components/monitor`. `density="default"` (byte-identical class) → **zero visual change**. Cell map: `basis-32`→`OpsKpiBandCell compact`, `basis-40`→default. Sales keeps its own card-shaped `SkeletonKpiTile` (a legitimate Monitor sibling; `aria-busy`/`aria-live` moved to its `<section>`).
- **Guard:** new `describe` block in `workbench-kpi-band.guard.test.ts` locks the 3 default-density strips (compose `OpsKpiBand`, no `const TILE_BAND_CLASS`, no `flex flex-wrap gap-3`).
- **Verify:** `workbench-kpi-band` 12/12 (was 9) · `ready-workspace-sheet` 4/4.

### 1c — SoT-by-job manifest + retrieval tool (D10 / PLAN §2 1c) ✅
Delivered as the PLAN's **retrieval-tool** form (fully additive, zero shared-config edits). The runtime `src/lib/mcp/tool-server.ts` is an **org-permission-gated** MCP over the assistant read-tool registry — the wrong home for a build-time dev catalog — so a dev **MCP server is deferred** (documented, opt-in); the CLI + JSON + skill IS the sanctioned retrieval surface.
- **New (5, all `??` — 1c edits ZERO existing tracked files → zero collision with parallel sessions):**
  - `scripts/build-sot-manifest.mjs` — deterministic ESM parser. Projects **`AGENTS.md` hard-law goldens + `.claude/rules/**` SoT tables** (24 rule files) → `{job, sot, path, guard, symbols, kind, source, line, snippet}`. Two extractors: table-rows (any row naming real code) + AGENTS.md prose bullets (`Golden(s):`/`Guard:`). Exports `buildSotManifest`/`serializeManifest`/`searchManifest`; CLI `--stdout`/`--check`.
  - `sot-manifest.json` — generated catalog, **457 entries** · 165 with a path · 61 with a guard · **30 `src/components/` + 32 design-system paths** (proves not-DS-only, the acceptance).
  - `scripts/sot-lookup.mjs` — ranked-search retrieval CLI (nav-search ladder): `node scripts/sot-lookup.mjs "<job>"` → job · SoT · path · guard · rule:line · snippet; `--json`, `-n N`, `--stats`. No-hit path steers to compose/grow, never fork.
  - `src/lib/sot-manifest/sot-manifest.guard.test.ts` — parity guard (**subprocess-driven**: spawns the real CLIs). Asserts committed JSON == fresh build (regenerate-on-rule-edit contract, D12 applied to the catalog), non-trivial shape, feature-folder coverage (`WorkbenchChromeHeader`, `ReceivingBoxChromeActions`, `NonlinearTableHost`, `OpsKpiBand`, `StackedRowIdentity`, `InspectorActionFloor`, …), and ranked-lookup resolvability. Under `src/` so `verify`'s `src/**/*.test.ts` sweep picks it up (no `verify.mjs` edit).
  - `.claude/skills/sot-lookup/SKILL.md` — agent-facing discovery skill (`user-invocable`) — "run this before composing a chrome/table/KPI/inspector/card surface."
- **Gotcha fixed:** `process.exit()` after a large `process.stdout.write()` **truncates piped stdout at ~65KB** (file-redirect masks it; `execFileSync` pipe caught it). Both CLIs now set `process.exitCode` instead so stdout drains.
- **Verify:** `sot-manifest.guard` 4/4 · `--check` exit 0 · zero tsc errors in any 1c file.

### 1a + 1d — retired-symbol enforcement (D4 / D12) ✅
Unified into **one comment-aware source-text guard** (the `doesNotMatch` mechanism D12 sanctions), not a `dependency-cruiser` ban — deliberately: dep-cruiser reasons over the **import graph** (it can only flag a re-created MODULE path), but the retired items are **symbol names** that reappear as in-file declarations in modules that still exist; a comment-aware identifier scan catches both, runs in the verify `src/**` sweep with **zero wiring**, and needs no install. `diagrams:check` (dep-cruiser) is also **not wired into verify** today, so a dep-cruiser rule wouldn't even be enforced.
- **New (1, `??`, additive — touches NO existing tracked file, NO package.json/verify.mjs/.dependency-cruiser.cjs):** `src/design-system/foundations/retired-symbols.guard.test.ts` — 7 **verified-retired** symbols (each 0 live *code* refs today; residuals are doc comments the guard strips), each citing its retiring rule (the D12 prose→code link). Shrink-only `maxLiveRefs` (all 0). **Negative-tested:** re-introducing `export function parkRail()` in a shipped file trips it with a clear message; the comment mention on the same probe does **not** trip it; removing the probe → 8/8 green.
- **PLAN seed set corrected (verification-first paid off):** dropped **`ContextualSelectionBar`** (it is the LIVE multi-select SoT — 13 consumers, `display/workbench.md`) and **`MobileSelectionBar`** (no evidence it ever existed). Kept the 7 verified: `ToolbarSearchToggle`, `UnboxProcedureRail`, `parkRail`, `salesCartStore`, `StationWorkbenchShell`, `RecordPaneHeader`, `GridFieldsMenu`.
- **Verify:** `retired-symbols.guard` 8/8 · tsc-clean · registry grows as more retirements are confirmed (add a verified entry; never remove enforcement).
- **1b (jscpd) DEFERRED — needs a decision:** `jscpd` is **not installed** (a network `pnpm add -D jscpd` + a `package.json`/`pnpm-lock.yaml` edit — both already dirty from parallel sessions — + `scripts/verify.mjs` wiring). Left for the user to green-light the install. Dep-cruiser module-path tripwires are optional defense-in-depth needing `diagrams:check`→verify wiring; skipped as unenforced-config is worse than none.

### 2e — inspector-header repo-wide scan + the 3 slip-forks (D4/D8) ✅
- **Migrated (3):** `MyDayTaskInspector.tsx`, `FbaBoardDetailPanel.tsx`, `sku-detail/SkuDetailHeader.tsx` → `DeskRailChromeRow` + `PaneHeaderLabel`. Each dropped a hero identity (`text-role-title` h2 / `line-clamp-4 text-lg` h2 / `cardTitle` h1) and a bare `<X>` close for the SoT `→|`. Chrome now sits **outside** the scroll port (it used to scroll away). No `closeTitle` is passed — the component default is composed rather than a third copy variant invented (siblings vary: `"Close details"` ×3 vs the default).
- **Guard → universal scan** (`right-rail-inspector-header.guard.test.ts`, 10 → 13 tests). Three things it had to learn, each recorded in its docblock:
  1. **Follow ONE hop into local children.** The `SkuDetailView` registrar's hero title lived in `sku-detail/SkuDetailHeader.tsx`; a file-only scan reports green with the fork one import away.
  2. **A hero MARKER ≠ a hero TITLE.** Bare `<h2>` / bare `text-lg` false-flags `<h2 className={sectionLabel}>` on the sync dialogs (an eyebrow) and BinDetailFlyout's `text-lg tabular-nums` body stat. Narrowed to hero density **on a heading element** + the identity-only roles anywhere.
  3. **Skip a surface whose CHROME is SoT-composed** — the ban is on hero identity in the chrome, not the body. That spares `ByUnitView` (record content under a correct rail) and `SkuDetailHeader`'s legitimate full-PAGE `<h1>` **by construction, not by allowlist**, which is what keeps it a universal scan.
- **Two bugs found while landing it, both real:**
  - **FBA shipped with no visible dismiss.** Its close routed through `PanelActionBar`, which *drops* `onClose` behind the comment "close lives on RightRailHost (backdrop / Esc)" — untrue since the non-modal flip (no scrim). This is the exact defect `source-of-truth.md` already names for `ShippedDetailsHeader`. `DeskRailChromeRow` restores it; the guard bans FBA re-adopting `PanelActionBar`.
  - **`PaneHeaderActionBar` `variant` DEFAULTS to `'card'`** — the banned pill — and the old ban matched only the literal `variant="card"`, so omitting the prop rendered the banned thing and passed. Textbook signature-precise false-green (briefing §1). New assertion catches defaults; **1 shrink-only entry** (`ReceivingDetailsStack.tsx`) with its reason — flipping it re-paints a station toolbar, so it wants an operator look, not a drive-by.
- **Verify:** 13/13 · negative-tested three ways (hero probe in a registrar trips; the same token in a **comment** does not; removing `variant="flat"` from FBA trips the new default ban).

### 2f — `WorkbenchRefineFacetTabs` ✅
- **Scope correction: 2 copies, not the PLAN's 3.** Both are in `UnboxWorkspaceHeader` (History refine + triage refine) — byte-identical tab classes, the identical keep-open `onMouseDown` preventDefault, the identical hot dot. `HistoryWorkspaceHeader`'s refine is a **flat grouped-row menu** (every group at once, no tabbing) — a different shape, deliberately left alone.
- **New:** `WorkbenchRefineFacetTabs` + `WORKBENCH_REFINE_BODY_CLASS` in `workbench-filter-popover.tsx`, beside its siblings. Generic over the facet id, single-facet renders `null` (a one-tab tablist navigates nowhere). The `preventDefault` is documented as load-bearing: without it the facet click blurs the field and the popover shuts.
- **Guard:** new `it()` in `band3-find-only.guard.test.ts` (14 → 15) — pins the SoT (incl. the preventDefault), asserts **both** Unbox funnels route through it, and bans a second hand-rolled funnel repo-wide. Negative-tested.

### 2d — `<WorkbenchSheetView>` shell, scoped to the scan stations + To-ship (D1) ✅
User-scoped to "the most important pages", so the cohort is **6**, not the PLAN's ~15.

- **New:** `src/components/dashboard/WorkbenchSheetView.tsx` — owns `DashboardScrollShell` + the three-band chrome stack + `WorkbenchKpiBand` wiring + the sheet host + the **opt-in** tab crossfade + one shared `WorkbenchSheetFallback` (Pack and Shipping had each declared that fallback **byte-identically**). Slots take exactly the values they need: `tabs({className})`, `kpi`, `triage({controlsSlotRef,kpiOpen,onToggleKpi})`, `children({controlsEl})`, `overlays`.
- **`useWorkbenchSheetChrome(surface)`** is the local controller; **the controller is injectable, and that is the load-bearing design call.** To-ship takes `controlsEl`/KPI state from `useOrdersViewChrome` **context** because its View cluster lives on the pushing right inspector — a ruled SoT split, not drift. A shell that always owned the state would have forced the golden to fork.
- **Migrated (6):** Testing · Shipping · Pack · Arrival(Triage) · Labels · To-ship. **Net −129 LOC** across the six views (263+/392−).
- **Out-of-cohort, with reasons recorded IN the guard** (not a bare list): **Unbox** renders ONE band in its view — Bands 2/3 live *inside* `UnboxWorkspaceHeader`, so there is no three-band stack to lift; **Scan-out** is single-lane (no `DashboardScrollShell`, no KPI, no Band 3), so the shell would add a scroll shell it does not want.
- **Enforcement inverted (the point of D1).** The five page guards asserted *literal tokens in their own file* — five copies of the recipe and five copies of the check, where a copy is only ever compared to itself. Now the **shell** owns the tokens (asserted once in `workbench-sheet-view.guard.test.ts`) and each page is asserted to **compose** it + hold none of them. A page can no longer drift because it no longer holds the recipe. Page guards keep their genuinely per-surface content (which tabs, which CTAs, which selection plane).
- **Three findings the consolidation surfaced:**
  1. **Four pages were fighting a flush SoT.** `WorkbenchChromeHeader` already applies `cornerClass('flush')` unconditionally, so the stations' call-site `rounded-none` was redundant — and `dashboard-orders-sheet.guard` **already banned it by name** ("no call-site rounded-none fight"). Only To-ship obeyed. The shared token drops it; the shell guard now bans it there too.
  2. **A near-miss on the golden.** My first shell defaulted `className` to `h-full bg-transparent`, but that class lands on the **scroll port** and To-ship passed none — silently adding `h-full` to the golden's port. The prop now has **no default**; each page states what it had (stations `h-full bg-transparent`, Labels `h-full`, To-ship nothing).
  3. `workbench-trailing-cluster` asserted a page-local **variable name** (`labelsControlsEl`) for the ▦ portal. Re-pointed at the shell's render-prop, which is stronger: the shell hands back the same controller it gave the Band-3 slot ref, so the two can no longer be wired to different elements.
- **Verify:** `workbench-sheet-view` 8/8 · `dashboard-orders-sheet` 14/14 · `testing` 8/8 · `shipping` 7/7 · `pack` 6/6 · `triage` 5/5 · `labels` 5/5 · `workbench-trailing-cluster` 31/31 · tsc 0 (excluding a parallel session's `SlicedActionDock` error, below) · lint clean. Guard negative-tested twice (a cohort page re-acquiring a token trips it; the shell re-adding `rounded-none` trips it).
- **Follow-up not taken:** the `source-of-truth.md` Sheets-recipe row should name `WorkbenchSheetView`, but that file is **currently being edited by a parallel session** — left alone per the collision rule.

### Cross-cutting
- `npx tsc --noEmit` → **0 errors as of 2026-08-11**. The previously-pre-existing `src/components/tech/ActiveOrderWorkspace.tsx(334)` `TS2322` `onRemoveSerial` (committed at HEAD `ff83ff0f1`) was **resolved by a parallel session** — not us. Every file this program touched (2b/2c/1c/1a/1d) is tsc-clean; the tree tsc step is now green independent of this work.
- Change sets, all cleanly separable: 2b/2c = **8 modified + 1 new** (`ChromeCheckButton.tsx`); 1c = **5 new, 0 modified**; 1a/1d = **1 new, 0 modified** (`retired-symbols.guard.test.ts`); 2e/2f = **7 modified, 0 new**; **2d = 13 modified + 2 new** (6 views + 6 guards + trailing-cluster guard; `WorkbenchSheetView.tsx` + its guard). Program total: **28 modified + 9 new**, no other session's file touched.
- **Two reds in the tree that are NOT this program's** (verified, do not inherit):
  1. `src/design-system/primitives/SlicedActionDock.tsx(158)` `TS2339 embeddedChrome` — a parallel session's **in-flight** uncommitted edit (they are mid-way through adding an `embeddedChrome` prop). This program never imports or touches that file.
  2. `sot-manifest.guard` parity fails because a parallel session edited `.claude/rules/display/unbox-station.md` + `source-of-truth.md` without regenerating. The diff is entirely their Unbox dock/notes vocabulary (`WorkspaceNotesCard`, `OmnichannelComposerDock`, label-note autocomplete). **Deliberately not regenerated** — `node scripts/build-sot-manifest.mjs` belongs to whoever is editing those rules, and running it here would bake their half-finished prose into the generated file. The guard is doing exactly what 1c built it to do.
- NOTE: the shared tree carries a large volume of *other* sessions' uncommitted work (200+ files) plus a merge-conflict `UU src/app/signin/page.tsx` — **none of it is this program's**; leave it untouched.

---

## 4. What is NEXT (pick one)

Recommended order — the contained, high-value core first (see PLAN §Appendix):

1. ~~**Phase 1 — 1c SoT-by-job manifest.**~~ ✅ **DONE** (see §3). Retrieval-tool form; a dev MCP server is the deferred, opt-in follow-up. The catalog is `sot-manifest.json`; lookup is `node scripts/sot-lookup.mjs "<job>"`. When a future rule edit touches a parsed table/hard-law, run `node scripts/build-sot-manifest.mjs` (the parity guard enforces it).
2. ~~**Phase 1 — 1a + 1d.**~~ ✅ **DONE** (see §3) — unified into `retired-symbols.guard.test.ts` (the sanctioned `doesNotMatch` mechanism; strictly more capable than dep-cruiser for symbols). Registry grows as retirements are confirmed. **`ContextualSelectionBar`/`MobileSelectionBar` were dropped from the seed set** (live / never-existed — verify before banning).
3. **Phase 1 — 1b (jscpd) — the last Phase-1 piece, needs a green-light.** `jscpd` is **not installed** → a network `pnpm add -D jscpd` + `package.json`/`pnpm-lock.yaml` edit (both already dirty from parallel sessions) + `scripts/verify.mjs` wiring + a curated `jscpd-baseline.json` (1b-ignore set per PLAN §2: the ~18 cell registries, ~14 `*-grid-layout.ts`, `makeLedgerGridColumnHeader` configs, `DataTable` + admin consumers, C2 station-vs-desk shells). Ask the user before installing.
4. **2a follow-up (needs a design nod):** unify Inbound's Add hue (`bg-emerald-600` → golden blue-primary, **or** introduce semantic `success`/`execute` `Button` variants applied to both surfaces — which *changes the golden's look*); route Inbound's raw `bg-blue-600` Import popover through `WorkbenchChromeCubeMenu`. Also open: the flush `density="band"` upgrade for the 3 KPI strips (visual change).
5. ~~**2e / 2f**~~ ✅ **DONE** (see §3). Two follow-ups they surfaced, both deliberately NOT taken as drive-bys: (a) `ReceivingDetailsStack.tsx` still defaults its ActionBar variant to the banned `'card'` pill — one word to fix, but it re-paints a station toolbar, so it wants an operator look; (b) `PanelActionBar` still swallows `onClose` and still pairs prev/next with contextual `actions` on one ActionBar (both banned) for its remaining 4 shipped/work-order consumers — a shared-component change with wider blast radius than 2e's scope.
6. ~~**2d — `<WorkbenchSheetView>` shell**~~ ✅ **DONE for the user-scoped cohort** (scan stations + To-ship — see §3). Piloted on Testing + Shipping exactly as planned, then rolled. **Remaining 2d surface area** (not requested, not started): the ~9 other `WORKBENCH_SHEET_CHROME` consumers outside the scan-station / To-ship scope — Pickup, Catalog, FBA outbound, Locations, Units, Warranty, Unfound, Tracking exceptions, Review family, My Day, Support board, Photo library. Each needs the same read-first check (does it have a real three-band stack, or is it a documented divergence like Unbox / Scan-out?) before being added to the guard's `COHORT`.
7. **2g (C1 grid merge) / 2h (station bench)** — grid migrations, medium risk, careful visual testing.
8. **Phase 3** — `ast-grep` codemods for focus rings (828), card shells (~290), neutrals (103), honest-absence; ratchet-flip **only after a family hits 0**.

---

## 5. Constraints / gotchas (non-negotiable)

- **Dev server: ATTACH to `:3050`, never start/kill.** A broken dev server is reported, not repaired.
- **User manages commits.** Stage only your own files; never `git stash`; commit/push only when asked.
- **Do NOT run `scripts/portfolio-sot-sync.mjs`.** The new docs/todo files (briefing/PLAN/this HANDOFF) will make `npm run verify`'s doc-catalog gate want a sync, but `docs/portfolio/DOC-CATALOG.md`/`INDEX.md` carry **another session's uncommitted edits** — regenerating would clobber them. Leave the sync to the user at commit time.
- **Verification is guards + tsc**, not browser eyeballing of auth-gated station pages. Commands: `node --import tsx --test <path>.guard.test.ts` · `npx tsc --noEmit -p tsconfig.json`. When a family is being consolidated, evolve its guard from a golden allowlist to a repo-wide scan (D4).
- **Ratchet-only baselines** — never raise a baseline to pass; a ratchet flips to a hard ban only at 0.
- **Ask-first:** DTCG migration (deferred); the **C2 station-vs-desk right-edge fork stays** (never mount `StationDisplaysPushStack` on `RightRailHost`); **never flatten by-design per-`entityFamily` variation** (protect it in the jscpd ignore set); any change that alters the **golden's** appearance (e.g. 2a Add hue).
- **Pre-existing tsc red** (`ActiveOrderWorkspace.tsx:334`) is a parallel/HEAD issue — report it, don't inherit it.

---

## 6. Start-here checklist for the next session

1. Skim §1–§3 here + the PLAN.
2. Confirm the landed state is intact: run the guards named in §3 — `sot-manifest` 4/4 · `retired-symbols` 8/8 · `receiving-box-chrome-actions` 3/3 · `band1-house-chrome` 38/38 · `workbench-kpi-band` 12/12 · `ready-workspace-sheet` 4/4 · `right-rail-inspector-header` 13/13 · `band3-find-only` 15/15 — and `git status --short` (15 M + 7 ?? for this program).
3. Pick a slice from §4 (remaining: **1b** needs an install green-light; **2a** needs a design nod; **2d** is the XL structural win). Check the target files for parallel-session edits (`git status --short -- <files>`) before editing.
4. Land it to green guards + no new tsc errors; evolve/extend the guard; update the PLAN's status + this HANDOFF + the auto-memory.
