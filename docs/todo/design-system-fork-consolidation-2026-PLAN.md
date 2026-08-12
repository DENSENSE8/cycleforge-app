# PLAN — design-system fork & tech-debt consolidation

**Companion to:** [`design-system-fork-consolidation-2026-GEMINI-RESEARCH-BRIEFING.md`](design-system-fork-consolidation-2026-GEMINI-RESEARCH-BRIEFING.md) (the diagnosis + measured inventory) and its Gemini Pro deep-research answer.
**Date:** 2026-08-10
**Status:** Decisions ratified (D1–D12 below). **Landed & verified (uncommitted):** 2b, 2c, 1c, 1a, 1d, 2e, 2f, **2d (scan stations + To-ship)** (see the HANDOFF §3). Remaining Phase 1: **1b** (jscpd — needs an install decision). This is the execution spec; the HANDOFF is the current position in it.
**Owner discipline:** golden-first, ratchet-only, ask-first on the flagged items. Stage only your own files; do not run `portfolio-sot-sync.mjs` while `docs/portfolio/DOC-CATALOG.md` / `INDEX.md` carry another session's uncommitted edits.

---

## 0. The thesis this program acts on

> The design system is consolidated at the **primitive / plumbing / value** layer and drifts at the **assembly / chrome / structure** layer — because 271 guards enforce sameness *by assertion* ("every page must import these constants") rather than *by construction* ("one shell nobody can diverge from"), signature-precise ratchets manufacture false-green, and the one class of debt the toolchain literally cannot see (a fork where both doors are imported) is exactly that un-constructed layer.

Consequence for sequencing: **you cannot migrate while the agent is still forking behind you.** Enforcement + discovery land first (stop the bleeding, equip the author), then structural construction, then value sweeps.

---

## 1. Ratified decisions (D1–D12)

| # | Decision | Ruling |
|---|---|---|
| D1 | Assembly shell | **Extract one parametric `<WorkbenchSheetView>` (compound/slot).** Sameness by construction. |
| D2 | Chrome CTA | **Unify the Check *face* into one `ChromeCheckButton`; invert the guard to mandate the shared face.** Panel is already shared — screenshot the *clusters*, not the panel. Keep the regional split for the rest of the cluster. |
| D3 | Card shells | **Broaden the surface-box guard from signature (`rounded-2xl`) to shape (all radii); codemod ~290 soft-radius shells onto `Panel` with per-hunk review** (nested fields like `WORKSPACE_NESTED_FIELD` are not cards). |
| D4 | Guard architecture | **Keep the 271-guard fleet.** Evolve golden allowlists → repo-wide structural scans. Add `dependency-cruiser` `not-to-match` import-bans for deleted/retired symbols. **Do not** delete structural guards or add `eslint-plugin-boundaries` (extend the tooling you have). |
| D5 | Duplication detector | **Add `jscpd` as a shrink-only baseline** (not a day-one hard gate) with a **curated** ignore set of the by-design structural siblings. |
| D6 | Visual regression | **Add Playwright `toHaveScreenshot` at the rendered-surface / cluster level** (not primitive stories). |
| D7 | Migration mechanism | **Codemod the value-shaped debt (`ast-grep`), hand-refactor the structure-shaped debt.** |
| D8 | Force fan-out completion | **"Golden at 100% adoption before the next capability lands on that surface"** (PR-review gate) + **manual ratchet decrement inside each burndown PR.** No calendar auto-decrement / CI timebomb. |
| D9 | Inbound↔History (C1) | **Land P1 now** — delete the `incoming` cell family, absorb into `receiving-grid/cells/`, one host. |
| D10 | Agent-native governance | **Machine-readable SoT catalog (MCP), discovery-before-build.** Index **SoTs-by-job** (incl. feature-folder SoTs), not just `src/design-system/`. |
| D11 | Tokens / DTCG | **Defer DTCG.** Close the vocabulary gap by extending `Button`/CVA semantic intents (`success` for Add, `execute` for Check). DTCG is a separate ask-first initiative gated on a real white-label / native future. |
| D12 | Prose-vs-code drift | **Meta-guard:** every "deleted/retired X" claim in `.claude/rules/*` must have a matching `dependency-cruiser` ban or guard `doesNotMatch`. |

---

## 2. Phase 1 — Enforcement + Catalog (stop the bleeding, equip the author)

Land these **together**. Adding bans without discovery just makes the agent thrash; discovery without bans lets it keep forking.

| # | Work | Mechanic | Files | Acceptance |
|---|---|---|---|---|
| 1a | **Retired-symbol bans** ✅ **LANDED** (unified with 1d) | **Reversed from dep-cruiser → a comment-aware source-text `doesNotMatch` guard** (D12 sanctions either). dep-cruiser reasons over the import GRAPH so it only flags a re-created MODULE path; a retired SYMBOL reappears as an in-file declaration a graph never sees. The guard catches both, runs in the verify `src/**` sweep, needs no install. `diagrams:check` also isn't wired into verify, so a dep-cruiser rule would be unenforced anyway. | `src/design-system/foundations/retired-symbols.guard.test.ts` | ✅ 7 **verified-retired** symbols at 0 live code refs, each citing its rule; shrink-only `maxLiveRefs`; negative-tested (a live `parkRail` re-intro trips it, a comment does not). **Seed set corrected:** dropped `ContextualSelectionBar` (LIVE SoT, 13 consumers) + `MobileSelectionBar` (never existed) — verify before banning. |
| 1b | **`jscpd` duplication baseline** — ⏸ **DEFERRED (needs install decision)** | `jscpd` in `scripts/verify.mjs`, **shrink-only fingerprint baseline** | `.jscpd.json`, `scripts/verify.mjs`, a `jscpd-baseline.json` | `jscpd` is **not installed** → needs `pnpm add -D jscpd` (network) + `package.json`/`pnpm-lock.yaml` (both dirty from parallel sessions) + verify wiring. Ask-first. New near-duplicate clones fail; existing ones parked; **ignore set curated** (see 1b-ignore). Baseline only shrinks. |
| 1c | **SoT-by-job manifest + retrieval tool** ✅ **LANDED** | Parse `AGENTS.md` hard-law goldens + `.claude/rules/**` SoT tables (24 rule files) → `sot-manifest.json` `{job → {sot, path, guard, symbols, source:line, snippet}}`; ranked retrieval CLI + discovery skill; parity-guarded | `scripts/build-sot-manifest.mjs`, `scripts/sot-lookup.mjs`, `sot-manifest.json`, `src/lib/sot-manifest/sot-manifest.guard.test.ts`, `.claude/skills/sot-lookup/SKILL.md` | ✅ `node scripts/sot-lookup.mjs "<job>"` returns module + path + guard + rule-ref. 457 entries; **30 `src/components/` + 32 design-system paths** (feature-folder SoTs indexed, not only `src/design-system/`). **MCP server deferred** (opt-in): the runtime `src/lib/mcp/tool-server.ts` is org-permission-gated — wrong home for a build-time dev catalog; the CLI is the sanctioned retrieval tool. |
| 1d | **Always #6 meta-guard (D12)** ✅ **LANDED** (unified with 1a) | The enforcement half shipped as the `guard doesNotMatch(/Symbol/)` mechanism: a curated registry of retired symbols, each 0-live-code-ref + citing its retiring rule (the prose→code link). | `src/design-system/foundations/retired-symbols.guard.test.ts` | ✅ Closes `parkRail`/`salesCartStore`/`ToolbarSearchToggle` drift — re-introducing any in shipped code fails the guard. **Follow-up (not fragile-scan yet):** a forward scan of `.claude/rules/*` for *undocumented-enforcement* retirement claims is deferred (prose extraction is fragile); today the registry is curated + verified. |

**1b-ignore (curated — do NOT use a blanket glob):** `src/components/station/**/{receiving-grid,incoming-grid}/cells/**` (~18 cell registries), the `~14` `*-grid-layout.ts` / `dashboard-order-row-layout.ts` modules, the `~18` `makeLedgerGridColumnHeader` configs, `src/design-system/components/DataTable/**` + its ~18 admin consumers, and the C2 station-vs-desk shells (`StationDisplaysPushStack`/`Column` vs `RightRailHost`). These are by-design siblings; a duplication detector must not flag them.

**Phase 1 done:** a new fork cannot land silently (import-ban OR jscpd catches it), the agent has a discovery surface, and prose retirements can no longer go unenforced.

---

## 3. Phase 2 — Structural consolidation (construct sameness)

The un-constructed assembly layer. Hand-refactor; codemods are too brittle here.

| # | Work | Mechanic | Files | Acceptance |
|---|---|---|---|---|
| 2a | **Semantic Button intents (D11 fix)** | Extend `Button` CVA with `variant="success"` (Add) + `variant="execute"` (Check); add a guard/`dependency-cruiser` rule banning raw `bg-<hue>` on `WORKBENCH_CHROME_PILL_CLASS` peers | `src/design-system/primitives/Button.tsx` + a chrome-CTA guard | No `*ChromeActions` hand-paints `bg-slate-*`/`bg-emerald-*`/`bg-blue-*` on the pill; all fills resolve to a variant. |
| 2b | **`ChromeCheckButton` (D2)** | One shared Check face over 2a; **invert** `receiving-box-chrome-actions.guard.test.ts` from "mandate different components" → "mandate the shared face"; keep the cluster's regional split intact | `IncomingChromeActions.tsx`, `ReceivingBoxChromeActions.tsx`, the guard | Inbound + Unbox Check render the same face; `regional-sidebar-split.guard` still green (surfaces stay distinct). Optional: Playwright `toHaveScreenshot` on the *ChromeActions clusters. |
| 2c | **KPI tile-band → `OpsKpiBand` (D5-KPI)** | Fold the 4 byte-identical `TILE_BAND_CLASS` copies onto `OpsKpiBand`; widen `workbench-kpi-band.guard` past its 5-golden allowlist to a repo-wide scan of `KpiTile` band containers | `walk-in/SalesKpiStrip.tsx`, `outbound/ready/ReadyKpiStrip.tsx`, `fba/FbaKpiStrip.tsx`, `receiving/triage/TriageKpiStrip.tsx`, `UnboxKpiCanvas.tsx` | Zero `TILE_BAND_CLASS` copies; guard scans all band containers. |
| 2d | **`<WorkbenchSheetView>` compound shell (D1)** ✅ **LANDED for the scan stations + To-ship** (user-scoped: "most important pages") | Slot shell owns `DashboardScrollShell` + the 3-band assembly + KPI-band wiring + sheet host + the opt-in tab crossfade + the shared fallback. **The chrome controller is INJECTABLE** — that is what let To-ship in without forking (its `controlsEl`/KPI come from `useOrdersViewChrome` context because the View cluster is on the inspector). Per-page overlays (order rails, Triage bulk bar, New-order overlay) stayed at the call site as slots / outer wrappers. | **New:** `WorkbenchSheetView.tsx` + `workbench-sheet-view.guard.test.ts`. **Migrated (6):** Testing · Shipping · Pack · Arrival(Triage) · Labels · **To-ship**. **Guards evolved (6).** | ✅ **−129 LOC net** across the 6 views (263+/392−); tsc 0; every page guard green. **Cohort is 6, not ~15** — scoped by the user to the pages that matter. **Out-of-cohort with stated reasons** (in the guard, not a bare list): **Unbox** renders ONE band here (Bands 2/3 live *inside* `UnboxWorkspaceHeader`) and **Scan-out** is single-lane (no scroll shell / KPI / Band 3). Enforcement inverted: the shell owns the tokens (asserted once) and each page is asserted to **compose** it — a page can no longer drift because it no longer holds the recipe. |
| 2e | **Inspector header repo-wide scan (D4/D8)** ✅ **LANDED** | Guard now scans every registrar surface — **plus one hop into its local children** (the `SkuDetailView` → `SkuDetailHeader` fork sits one import away; a file-only scan reads green). Ban is hero density **on a heading** + the identity-only roles, and it **skips a surface whose chrome is SoT-composed** (composition, not an allowlist). The 3 slip-forks migrated. | `features/my-day/MyDayTaskInspector.tsx`, `fba/FbaBoardDetailPanel.tsx`, `sku/sku-detail/SkuDetailHeader.tsx` → `DeskRailChromeRow`/`PaneHeaderLabel`; guard | ✅ 13/13; universal scan reads 0; negative-tested (hero probe trips, comment does not). **Bonus findings:** (a) crude `<h2>`/`text-lg` markers false-flag `sectionLabel` eyebrows + body stats — the ban had to be narrowed to survive; (b) `ByUnitView` is body content under correct chrome, `SkuDetailHeader`'s `<h1>` is its legitimate PAGE branch — both spared by construction; (c) **FBA had no visible dismiss at all** (`PanelActionBar` drops `onClose`); (d) `PaneHeaderActionBar` `variant` **defaults to the banned `'card'`**, so the old ban's literal `variant="card"` match was false-green — new assertion catches defaults, 1 shrink-only entry (`ReceivingDetailsStack`, reason stated). |
| 2f | **`WorkbenchRefineFacetTabs`** ✅ **LANDED** | Factored the faceted `role="tablist"` funnel into one config-driven component + `WORKBENCH_REFINE_BODY_CLASS`, beside its `WorkbenchFilterPopover` siblings. **Scope correction: 2 copies, not 3** — both in `UnboxWorkspaceHeader` (History + triage refine). `HistoryWorkspaceHeader`'s refine is a flat grouped-row menu (every group at once, no tabbing) — a different shape, deliberately not folded in. | `workbench-filter-popover.tsx` (SoT), `UnboxWorkspaceHeader.tsx`, `band3-find-only.guard.test.ts` | ✅ 15/15; ~60 duplicated LOC → one component; guard pins the SoT (incl. the load-bearing keep-open `onMouseDown` preventDefault) + both Unbox call sites + a repo-wide ban on a second hand-rolled funnel; negative-tested. |
| 2g | **Land C1 P1 (D9)** | Delete `incoming` cell family + `incoming-grid-layout.ts`; route through `receiving-grid/cells/` + one host; keep `tableId` buckets distinct | `src/components/station/incoming-grid/**` | One cell registry for `ReceivingLineRow`; header already unified via `SHARED_LINE_TRACK_META`. |
| 2h | **Station bench → registry** | Migrate `StationListTable`/`StationHistoryTable` onto `NonlinearTableHost` + a `TableDefinition`; retire the hand-rolled `StationRowColumnHeader` + the dense `role="grid"` fallback + `useIsColumnHidden` | `station/StationListTable.tsx`, `StationHistoryTable.tsx`, `dashboard/queue-table/StationRowColumnHeader.tsx` | Last header fork gone; `useIsColumnHidden` drops from 4→3. |

---

## 4. Phase 3 — Value sweeps + ratchet retirement (drain)

Codemod-driven; safe because these are value-shaped (one call expresses the whole behavior).

| # | Work | Mechanic | Baseline today | Acceptance |
|---|---|---|---|---|
| 3a | **Card shells** | Broaden `surface-box-tokens.guard` to shape (all radii); `ast-grep` codemod ~290 soft-radius shells → `Panel` **with per-hunk review** | `HANDROLLED_SHELL_BASELINE=130` + ~290 un-ratcheted | Adoption ≫ ~1.9%; nested-field exceptions (`WORKSPACE_NESTED_FIELD`) preserved via `ds-allow-box`. |
| 3b | **Focus rings** | `ast-grep` codemod `focus:ring/outline/border/shadow` → `focusRing(archetype, tone)`; decrement per burndown PR | `RAW_FOCUS_BASELINE=831` (828 live) | Burn toward 0; the deepest token debt. |
| 3c | **Neutral color** | Codemod raw `gray/slate/zinc` → semantic tokens; retire escape hatches | `RAW_NEUTRAL_BASELINE=43` + **103** `ds-allow-raw-neutral` | Least-migrated axis drained. |
| 3d | **Honest absence** | Replace `"N/A"` (×25) + `animate-pulse` soup (62 files) with `GridCellDash`/`—` + settled-empty copy; add an aggregate `honest-absence.guard` | no aggregate ratchet today | New aggregate guard green; soup drained. |
| 3e | **Ratchet flip** | **Only after a family hits 0**, replace the shrink-only baseline with a hard ESLint/guard ban (as `spacing`/`typography`/`alert` already did) | — | Zero-tolerance bans replace the burned-down ratchets; **never flip while instances remain** (CI would halt). |

---

## 5. Non-negotiables / ask-first

- **DTCG migration is deferred** — do not start a Style Dictionary / Terrazzo pipeline as part of this program. It is orthogonal to the fork debt and risks the Tailwind-v4 `@config` bridge, density `calc(rem × var(--cf-density))`, the CF Type plugin, and per-tenant theming. Separate initiative, ask-first, gated on white-label/native.
- **The C2 station-vs-desk right-edge fork stays** — never mount `StationDisplaysPushStack` on `RightRailHost`, never unify Esc/park chords across hosts. Share the waist (`DisplaysIndexLeafStage`, tokens, resize hook); fork the shell.
- **By-design per-`entityFamily` variation is not debt** — the ~18 cell registries + layout modules over one grid shell are intended. Do not "consolidate" them; protect them in the jscpd ignore set.
- **No calendar auto-decrement / CI timebomb** — decrements land manually inside burndown PRs; completion is forced by the golden-first review gate.
- **Ratchet flip only at 0** — a shrink-only baseline becomes a hard ban only after the family is fully migrated.
- **Golden-first fan-out** — a new capability lands on its golden and reaches 100% adoption before porting; never port N families in one pass; `custom-fields-history-first`-style discipline holds.
- **Commits/verify are the user's** — stage only your own files; do not regenerate `DOC-CATALOG.md`/`INDEX.md` while they carry another session's edits; `npm run verify` must be green before "done".

---

## 6. Sequencing rationale (why this order)

1. **Enforcement + Catalog first** — the author is an LLM agent at same-day velocity; without bans + discovery it re-forks behind every migration. Phase 1 makes new forks fail *and* gives the agent a "does this already exist?" answer.
2. **Structural second** — sameness-by-construction (`<WorkbenchSheetView>`, `ChromeCheckButton`, repo-wide guards) removes the *ability* to drift, so the value sweeps in Phase 3 don't get re-dirtied.
3. **Value sweeps last** — codemods over 828 focus rings / ~290 shells / 103 neutrals are safe and mechanical once the structure can't regrow, and each burns a ratchet down to a hard ban.

---

## Appendix — the highest-value first slice (if executing incrementally)

If not running the whole program at once, the lowest-risk / highest-leverage opening moves, in order:

1. **Phase 1 (1a + 1b + 1c + 1d)** — enforcement + catalog together, scoped per §2. **1c ✅** (SoT catalog + retrieval CLI + skill) and **1a + 1d ✅** (`retired-symbols.guard.test.ts` — the sanctioned `doesNotMatch` enforcement) have landed. Remaining: **1b** (jscpd shrink-only clone baseline) — needs a network install decision.
2. **2a + 2b** — semantic Button intents + `ChromeCheckButton` (fixes the operator-visible reported defect; contained; guarded).
3. **2c** — the 4 KPI band copies → `OpsKpiBand` (contained; widens a too-narrow guard).
4. **2d** — `<WorkbenchSheetView>` (the ~600–750 LOC structural win) as the first real migration.
