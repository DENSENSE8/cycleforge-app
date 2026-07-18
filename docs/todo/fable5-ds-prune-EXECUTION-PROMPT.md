# EXECUTION PROMPT — Fable 5 SoT DS Prune & Alignment

> Paste everything below the line into a fresh **Fable 5** session at the repo root
> (`/Users/icecube/repos/cycleforge-app`). Model: **`claude-fable-5-thinking-high`** (or the
> user's Fable 5 alias). Read-only audit first; stop at the **APPROVAL GATE** before editing.

**Plan SoT:** [`docs/todo/fable5-ds-prune-alignment-plan.md`](./fable5-ds-prune-alignment-plan.md)

---

# Cycle Forge — SoT DS Prune & Alignment (Fable 5)

You are executing a **prune and alignment** job on the Cycle Forge repo.

**Authoritative plan:** Read and follow
[`docs/todo/fable5-ds-prune-alignment-plan.md`](./fable5-ds-prune-alignment-plan.md)
end-to-end. That document is the SoT for scope, architectural law, golden references, P0–P3
inventory, phases A–E, verification gates, and risk notes. If anything in this prompt conflicts
with the plan, **the plan wins** — except where the human explicitly overrides in chat.

Read-only audit first, then implement approved P0 items. Follow `AGENTS.md` pattern evolution:
compose SoT first, grow registry when a sibling is stronger, never fork page-local shells for
the same job.

## Read first (in this order, before writing)

1. **`docs/todo/fable5-ds-prune-alignment-plan.md`** — **SoT for this run.** Memorize:
   - Architectural law (sidebar for distinct outbound *modes*, content chrome for *facets*)
   - Golden references (Unbox / Testing / Shipping stations + Dashboard)
   - P0–P3 bad-pattern inventory
   - Phases A–E and verification gates
2. **`docs/todo/display-convergence-log.md`** — Axis 5 workbench page shell (especially the
   refined law and outbound course-corrections)
3. **`AGENTS.md`** + **`CLAUDE.md`**
4. **`src/design-system/DESIGN_SYSTEM.md`**
5. **`.claude/rules/ui-design-system.md`** + **`contextual-display.md`** +
   **`display/station-workbench.md`** + **`display/monitor-rollup-blocks.md`**
6. **`.claude/skills/improve-ui/SKILL.md`** — Phase 0 audit → **approval gate** → normalize
7. **`.claude/skills/knip-prune/SKILL.md`** — dead code: grep before delete

## Golden references (DO NOT regress)

Per the plan § "Golden references":

**Stations:** `UnboxWorkspaceView` + `UnboxLineWorkspace`, `TestingWorkspaceView` +
`TestingLineWorkspace`, `ShippingWorkspaceView` + `ActiveOrderWorkspace` — all use
`DashboardScrollShell` + `WorkbenchChromeHeader` + domain `*KpiStrip` + browse/overlay crossfade.

**Facet workbench:** `DashboardOrdersView` = `OutboundWorkspaceHeader` + `OutboundKpiStrip` +
`DashboardScrollShell`.

## Your mission

Execute phases A–E from the plan. Summary:

### Phase A — Audit (read-only)

Scan `src/components` and `src/app` for forked UI vs SoT. Produce
**`docs/audit/fable5-ds-prune-report.md`** with prioritized findings (path, smell, SoT target,
priority P0–P3).

Detection targets (see plan § "Detection heuristics"):

- `PaneHeaderTabs` / `HorizontalButtonSlider` used where `TabSwitch` + `WorkbenchChromeHeader` belongs
- Inline `KpiTile` grids in table toolbars (especially `FbaBoardTable`)
- Missing `DashboardScrollShell` / `WORKBENCH_*` columns
- Missing `AnimatePresence` crossfade on tab/mode switches
- Station regions not using `StationWorkbench` + `CartonContextCard` waist
- knip dead exports in `outbound/`, `fba/`, `tech/shipping/`

Run:

```bash
npm run dead-code:report
npm run knip
```

### APPROVAL GATE

Stop and summarize P0 scope for user approval before any source edits.

### Phase B–D — Implement P0 (after approval)

Follow the plan § "Bad pattern inventory" and § "Implementation phases":

**FBA outbound (`?mode=fba`):**

- Refactor onto `DashboardScrollShell` (`FbaOutboundWorkspace`)
- Extract `FbaWorkspaceHeader` (`WorkbenchChromeHeader` + `TabSwitch`) for plan/combine/shipped — tabs **top left in content chrome**
- Extract `FbaKpiStrip` below chrome; remove inline KPI grid from `FbaBoardTable` toolbar
- Move sub-mode switcher **out of** `FbaWorkspaceSidebar` into content chrome; sidebar keeps ambient I/O
- Dedupe metrics with `ShippingKpiStrip` / `lib/tech/shipping-metrics.ts` or new `lib/fba/fba-metrics.ts`
- Add sub-mode body crossfade (`framerPresence.workbenchPaneSettle`)
- Replace raw search input with DS field + `focusRing`

**Labels outbound (default `/outbound`):**

- Add `LabelsWorkspaceHeader` + `LabelsKpiStrip` (compose `workbench-shell`)
- Wrap labels branch in full `DashboardScrollShell` two-zone layout
- Move KPI/stats from `LabelsModeBody` sidebar into main-pane KPI strip
- Add `AnimatePresence` on outbound **mode** switch in `OutboundWorkspace` (preserve existing queue↔print crossfade)
- **DO NOT** move Labels/Ready/FBA/ScanOut four-mode switch to top tabs — sidebar `ModeRail` stays

**`/test` Shipping:**

- Add tab-body crossfade in `ShippingWorkspaceView`
- Align FBA tab with outbound FBA outcome where sensible

### Phase E — Prune & verify

- Remove confirmed dead code; fix imports to SoT barrels
- Run `npm run verify` — fix all gates
- Append entry to `docs/todo/display-convergence-log.md`

## Hard rules

- **`npm run verify` must pass before done** — never raise DS ratchet baselines
- Never commit `.env`; user manages commits
- Minimize scope — one job per region contract
- Wrapping tables in Panel/card soup is **banned** — gutters + full-bleed table only
- Avoid unrelated in-flight lanes (e.g. kiosk auth) unless audit finds a direct dependency
- Pattern evolution footer in final summary: compound opportunities (do now / promote to DS / deferred)

## Output format

1. Audit report path + top findings table
2. Approval request (P0 list)
3. After implementation: files changed, before/after architecture notes, `npm run verify` output, manual test checklist
