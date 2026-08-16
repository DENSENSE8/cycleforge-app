---
name: sot-lookup
description: Discover the design-system Source-of-Truth for a UI job BEFORE composing it — the module + path + guard + governing rule text. Use whenever you are about to build or edit a chrome CTA, workbench table, KPI band, right-edge inspector, card/surface shell, station Displays leaf, or any recurring UI surface, so you compose from the SoT (or grow it) instead of forking a page-local twin. Answers "does this already exist, and where?"
user-invocable: true
argument-hint: "<job or symbol> (e.g. \"kpi band\", \"right rail inspector header\", \"StackedRowIdentity\")"
allowed-tools: Bash, Read, Grep
---

# SoT-by-job lookup — discovery before build

The design system is consolidated at the primitive layer and **drifts at the assembly /
chrome / structure layer** because authors re-fork what they can't find. This skill closes
that gap: it turns the SoT knowledge in `AGENTS.md` + live design-system/feature hosts into
a searchable catalog so you find the one shell/waist **before** writing a second one.

## When to use

Run this **first** whenever the task touches a recurring UI surface:
chrome CTAs / Band-1 actions · workbench tables & column headers · KPI bands · right-edge
inspectors & headers · card/surface shells · station Displays · focus rings · honest-absence ·
motion roles · row identity · action floors. If the SoT exists, compose it (or grow it via `AGENTS.md` / the named SoT module).
**Never fork a page-local twin.**

## How

```bash
node scripts/sot-lookup.mjs "kpi band"                 # ranked results (job · SoT · path · guard · rule:line · snippet)
node scripts/sot-lookup.mjs -n 12 "right rail header"   # more hits
node scripts/sot-lookup.mjs --json "table registry"     # machine-readable
node scripts/sot-lookup.mjs --stats                     # catalog summary
```

Each hit gives you:
- **SoT** — the canonical symbol to compose (e.g. `WorkbenchKpiBand`, `NonlinearTableHost`).
- **path** — where it lives.
- **guard** — the test that enforces it (read it to learn the contract).
- **rule:line** — the governing rule; open it for the full law before composing.

Then open the named rule + guard, compose from the SoT, and — if the SoT is wrong or weaker
than a sibling — grow it rather than reskinning beside it.

## No hit?

A no-hit means the job may not be documented as an SoT yet. That is **not** license to fork:
search siblings + `src/design-system/**` + the golden page for the nearest shell (the CLAUDE.md
"compose → grow → compound" discipline), or ask. Try a symbol name or a different phrasing —
the catalog indexes jobs, SoT symbols, module paths, and the rule snippet.

## Keeping the catalog honest

The catalog is `sot-manifest.json`, a **deterministic projection** of the rule files built by
`scripts/build-sot-manifest.mjs`. It is parity-guarded by
`src/lib/sot-manifest/sot-manifest.guard.test.ts` — **edit a rule table/hard-law, then
regenerate**:

```bash
node scripts/build-sot-manifest.mjs        # regenerate after editing AGENTS.md or SoT hosts
node scripts/build-sot-manifest.mjs --check # CI-style staleness check (exit 1 if out of date)
```
