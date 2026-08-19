---
name: improve-ui
description: >
  Integrated UX/UI audit and refactor for Cycle Forge components. Use when the user
  asks to improve, redesign, polish, normalize, audit, or refactor the UX/UI of a
  specific component, sidebar, panel, station, or page region. Runs SoT discovery +
  design/technical audit first, pauses for approval, then normalizes to Kinetic Ledger.
user-invocable: true
---

# MISSION: Surface Refactoring & Alignment Protocol

You are executing a strict, phase-by-phase refactor of a UI surface. You must enforce the
Kinetic Ledger identity, respect the `v2-spine` firewall, and prevent component forking.

**Do not proceed to Phase 3 until the user replies to the Phase 2 prompt.**

> **Repo state (2026-08):** `src/v2-spine/` does not exist yet — it is a planned add-on.
> Until it lands, every `v2-spine/` clause below resolves to the **legacy `src/components/`
> tree**: the firewall check reports "N/A — no v2-spine", the boundary import ban is inert,
> and Phase 5 extracts to the existing `src/design-system/` primitives. Token intents come
> from `src/design-system/tokens/colors/semantic.ts` today; CVA `intents` arrive with v2.
> The conditional phrasing ("*if* inside `v2-spine/`") means the protocol activates
> automatically once the firewall exists — do not delete those clauses.

## Phase 0: Setup & JIT Discovery (Read-Only)
1. Resolve the target path.
2. Determine the core job of the surface (e.g., "triage header", "kpi band", "station action row").
3. **DO NOT bulk-read markdown.** Run `node scripts/sot-lookup.mjs "<job>"` to retrieve the exact
   Source of Truth (SoT) and current architectural constraints. Try several phrasings (job name,
   symbol, module) if the first misses.
4. Check `.dependency-cruiser.cjs` to confirm whether the target path is inside the `v2-spine/`
   firewall or the legacy `components/` directory. (No `v2-spine/` yet ⇒ legacy tree; still read
   the station firewall rules — `use-the-scan-host-not-the-utility-rail`,
   `use-the-panel-root-not-the-ambient-wash`, `use-the-sheet-not-the-scroll-shell` — they apply now.)

## Phase 1: Classify & Route
1. **Region Contract:** Classify as `station` (hardware-driven, flush-square `floor` density),
   `workbench` (pointer-driven, `ops` density), `monitor`, or `canvas`.
2. **Boundary Check:** If the target is inside `v2-spine/`, it MUST NOT import anything from the
   legacy `components/` or `design-system/` folders. (Inert until v2-spine exists.)
3. **Strategy:** Determine whether to *compose* the SoT (wrap it) or *grow* it (add semantic
   variants). Never fork.

### Conditional deep-reads (only when signals match)
| Signal in target | Also read |
|------------------|-----------|
| Sidebar / `?mode=` / `SidebarShell` / mode rail | `.claude/skills/sidebar-mode/SKILL.md` |
| Station blocks / scan bar / `src/lib/stations` | `.claude/skills/station-block/SKILL.md` |
| Operations Studio / node graph / workflow canvas | `.claude/skills/ops-studio/SKILL.md` |
| KPI strip / analytics / Monitor rollup | `AGENTS.md` Monitor hosts + `src/design-system/components/monitor/` |

## Phase 2: Audit & Report (HARD STOP)
1. Run internal sub-routines (Design Critique + Technical/AST Audit) to identify debt (e.g., raw
   `bg-` hacks, duplicate assemblies, flex/geometry violations). When Task/subagent tools are
   available, delegate two isolated subagents (critique + audit) and synthesize; otherwise run
   sequentially and prefix the report `⚠️ DEGRADED: single-context`.
2. **Synthesize and Output the Audit Report:**
   - **P0:** Structural violations, firewall breaches, or hardware contract failures.
   - **P1:** Token/identity drift (raw Tailwind colors instead of semantic tokens / CVA intents).
   - **P2:** Minor typescript/cleanup issues.
   - **Compound Opportunities Table:** List areas where extracted `<Winner.Slot>` components (or,
     pre-v2, shared `design-system` primitives) can replace boilerplate.
3. **HALT.** Ask the user verbatim:
   > *"Execute: all | P0 only | pick: 1,3,5 | compound+P0 | stop"*
   **Do not write or edit any source files before receiving this reply.**

## Phase 3: Refactor (Approved Items Only)
1. Execute the user's exact selection.
2. Normalize all styling to Kinetic Ledger tokens (no raw hex, no arbitrary `rounded-*` unless
   mapped to primitives; colors from `semantic.ts`).
3. Compose or grow the SoT defined in Phase 0. Never fork a page-local twin.

## Phase 4: Verify & Polish
1. Run `npm run verify` to ensure no `dependency-cruiser` firewall breaches or AST clone (`jscpd`)
   violations were introduced, and that guards/lint/typecheck stay green.
2. Run standard formatters.

## Phase 5: Extract (Optional)
If a new reusable primitive was discovered and approved during Phase 2, extract it to
`v2-spine/ui/primitives/` (or, pre-v2, the matching `src/design-system/` primitive) and document
its hardware-target constraints.

---

## Hard invariants
- **Never edit source before the Phase 2 reply.**
- **Never run `bolder` / `delight` / `overdrive`** — Cycle Forge is Kinetic Ledger utilitarian ops.
- **Compose rails** (`SidebarRailShell` / `RecentActivityRailBase`) for sidebar pick+edit; never fork.
- **One region contract per region** — never blend station / workbench / monitor / canvas.
- **Colors only from `semantic.ts`;** presentation kinds via SoTs (condition, chips, dates, `SearchHit`).
- **Pattern evolution** — the user prompt is a floor; scan for stronger house patterns, never a foreign aesthetic.
