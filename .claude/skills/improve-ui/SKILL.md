---
name: improve-ui
description: >
  Integrated UX/UI audit and refactor for Cycle Forge components. Use when the user
  asks to improve, redesign, polish, normalize, audit, or refactor the UX/UI of a
  specific component, sidebar, panel, station, or page region. Runs critique + audit
  first, pauses for approval, then normalizes to house design system.
user-invocable: true
argument-hint: "[component path or name]"
allowed-tools: Read, Grep, Glob, Edit, Write, Bash, Task
---

# Improve UI — Cycle Forge UX/UI audit + refactor

One chat invocation — e.g. *"improve the UX/UI of ReceivingSidebarPanel"* — runs a
repeatable pipeline: load design context → classify archetype → critique + audit
(read-only) → **stop for approval** → normalize → targeted fixes → polish.

This skill **orchestrates** existing skills and house rules. It does not reinvent
design guidance — it routes to the right ones and enforces the approval gate.

## Hard invariants

1. **Never edit source files before the user approves scope** (Phase 2 → gate).
2. **Never run `bolder`, `delight`, or `overdrive`** unless the user explicitly asks —
   Cycle Forge UI is **Kinetic Ledger** utilitarian ops (see `.impeccable.md` + `.claude/rules/kinetic-ledger.md`).
3. **Compose rails when the job is sidebar pick+edit;** never fork `SidebarRailShell` /
   `RecentActivityRailBase`. Do not force dual-pane when data shape wants table/board/station/rollup.
4. **Colors only from** `src/design-system/tokens/colors/semantic.ts` — no hardcoded hex.
5. **One region contract per region** — never blend station / workbench / monitor / canvas.
6. **Data shape → primary surface** — detail pane is optional context, not identity.
7. **Presentation SoTs** — condition, chips, dates, capabilities, `SearchHit`; views stay dumb.
8. **Pattern evolution + compound DS** (`.claude/rules/pattern-evolution.md`): user prompt is a floor. Scan for
   stronger *house* patterns, recommend promotions, grow single-consumer SoTs — do not
   invent foreign aesthetics or page-local shells. Prefer changes that increase reuse.

---

## Phase 0 — Setup (mandatory, read-only)

Do this once per session for the target. Do not skip.

1. **Resolve the target** to a concrete path under `src/` (component file, directory,
   or route). Prefer a source path over a URL. If the user names a symbol
   (`ReceivingSidebarPanel`), Grep/Glob until you have the primary file path.
2. **Load design context:**
   ```bash
   node .claude/skills/impeccable/scripts/context.mjs --target <resolved-path>
   ```
   If already run this session for this target, skip. **Always** read `.impeccable.md`
   at the project root — it is the Cycle Forge design-context file for this repo.
   `context.mjs` may print `NO_PRODUCT_MD` when `PRODUCT.md` is absent; that is **not**
   a blocker when `.impeccable.md` exists. Continue with `.impeccable.md` + house rules.
3. **Read house rules:**
   - `.claude/rules/kinetic-ledger.md` + `.claude/rules/pattern-evolution.md`
   - `.claude/rules/ui-design-system.md`
   - `.claude/rules/contextual-display.md` (contract → data shape → density)
   - `src/design-system/DESIGN_SYSTEM.md` (north star)
   - If any region is **Monitor rollup**: also `.claude/rules/display/monitor-rollup-blocks.md`
     and compose `@/design-system/components/monitor` (or grow that registry — never invent
     page-local card shells).
4. **Read one representative sibling** in the same feature area (so normalize matches
   local patterns, not a foreign aesthetic). For Monitor rollup, prefer
   `OperationsAnalyticsView.tsx` as the golden composition.
5. **Pattern scan (compound):** inventory stronger siblings, duplicated structures (2+),
   token drift, registry misses, dual primitives for the same job, forced dual-pane where
   table/board/timeline fits. Name each pattern and map to SoT path or “promote to DS” target.

Only if **both** `PRODUCT.md` and `.impeccable.md` are missing, stop and ask the user
to run `/impeccable init` (or restore `.impeccable.md`) before resuming.

---

## Phase 1 — Classify (mandatory, read-only)

**Per region**, record three layers:

### 1) Region contract (Q1→Q4)

| Question (first yes wins) | Contract |
|---------------------------|----------|
| Scanner / keyboard-wedge / barcode? | **station** |
| Observe-only, no durable edit? | **monitor** |
| Node-graph / pan-zoom / semantic zoom? | **canvas** |
| Else (pick → edit → persist) | **workbench** |

### 2) Data shape → primary surface

singleton transient → station card · singleton durable → fact stack · many+pick → list/table/board · stream → timeline · rollup → KPI+SectionCards · graph → canvas.  
**Right pane / inspector = optional secondary.**

### 3) Density

`floor` | `ops` | `rollup` | `studio` (see `.claude/rules/kinetic-ledger.md` / `ui-design-system.md`).

### Conditional skills (read when signals match)

| Signal in target | Also read |
|------------------|-----------|
| Sidebar / `?mode=` / `SidebarShell` / mode rail (master–detail recipe) | `.claude/skills/sidebar-mode/SKILL.md` |
| Station blocks / scan bar / `src/lib/stations` | `.claude/skills/station-block/SKILL.md` |
| Operations Studio / node graph / workflow canvas | `.claude/skills/ops-studio/SKILL.md` |
| KPI strip / analytics / rollup dashboard / Monitor | `.claude/rules/display/monitor-rollup-blocks.md` + design-system `monitor/` |

**Record** (carry into the audit report):

- Contract + data shape + density for each region
- Primary surface + secondary (if any)
- Reference module to **compose** (not fork) — or **grow** if the SoT is the weak sibling
- Any anti-mix violations (e.g. search in the right pane, browse list inside a station, dual-pane forced on a board)
- Compound candidates: do-now / promote-next / deferred (see report template)

---

## Phase 2 — Audit (mandatory, read-only, hard stop after)

Delegate two **isolated** subagents when Task/subagent tools are available. They must
not see each other's output until you synthesize.

| Subagent | Instructions to load | Work |
|----------|----------------------|------|
| **A — Design critique** | `.claude/skills/impeccable/reference/critique.md` (+ product register `.claude/skills/impeccable/reference/product.md`) | Heuristic scoring, AI-slop check, hierarchy/IA, cognitive load. Browser inspect when available. |
| **B — Technical audit** | `.claude/skills/impeccable/reference/audit.md` | Score a11y / perf / theming / responsive / anti-patterns. Run detector: `node .claude/skills/impeccable/scripts/detect.mjs --json <target>` |

If subagents are unavailable, run A then B sequentially and prefix the report with:

`⚠️ DEGRADED: single-context (no subagent tool)`

### Report template (required — use exactly this structure)

```markdown
## Improve UI — audit report: <target>

### Contract: <station|workbench|monitor|canvas>
### Data shape / primary surface / density: …
### Classification notes
- Regions: …
- Secondary context (pane/inspector/none): …
- Compose (do not fork): …
- Anti-mix: none | <list>

### Scores
- Critique: <n>/100 (or heuristic summary)
- Audit dims: a11y <0-4> · perf <0-4> · theming <0-4> · responsive <0-4> · anti-patterns <0-4>

### P0 (must fix)
1. …
2. …

### P1 (should fix)
1. …
2. …

### P2 (nice to have)
1. …
2. …

### Compound opportunities (mandatory)
User prompt is a floor. Prefer house DS compounding over one-off reskins.

| Tier | Finding | Action if approved |
|------|---------|-------------------|
| **Do now** | In-scope / low blast radius (compose missing SoT, or grow single-consumer primitive) | Implement in Phase 3 |
| **Promote next** | Pattern appears ≥2× or stronger sibling exists; multi-file | Include only if user expands scope |
| **Deferred** | Multi-page migrate / new public API | Recommend only |

List 1–5 concrete items with SoT paths (e.g. “Unify MetricRing → GaugeDonut half-gauge in design-system”).

### Recommended refactor commands
- normalize (always)
- grow-sot / unify-sibling (when compound scan finds a weak primitive)
- layout | distill | typeset | colorize | adapt | clarify | animate (only as flagged)

### Proposed scope for approval
- [ ] P0 item 1
- [ ] P0 item 2
- [ ] P1 item 1
- [ ] Compound do-now: …
…
```

### Approval gate — STOP HERE

After posting the report, ask **exactly**:

> Approve this scope for refactor? Reply with: **all** | **P0 only** | **pick: 1,3,5** | **compound+P0** | **stop**

- Numbered items in P0 then P1 (then P2 if listed) form the pick list (`1` = first P0, etc.).
- **Do not** Edit / Write / StrReplace any app source until the user replies.
- If the user says **stop**, end the run. If they re-scope ("P0 only", "pick: …"),
  proceed to Phase 3 with only that subset.

### Follow-up intents (same thread)

| User says | Action |
|-----------|--------|
| Re-audit only / audit again | Re-run Phase 2; skip Phase 3–4 |
| Also run adapt / distill / … | After approval (or re-approval), include that sub-skill in Phase 3 |
| Approve / all / P0 only / pick: … | Continue to Phase 3 |

---

## Phase 3 — Refactor (only after approval)

Scope: **approved items only**. Prefer the smallest diff that closes each finding.

### Always: normalize

Follow the normalize skill workflow (house design system first):

- Replace hardcoded colors with theme / semantic tokens (no page-local hex)
- Apply Kinetic Ledger: one-row anatomy; density-appropriate layout; ban random card soup /
  nested cards-as-rows; allow boards / named rollup grids / station cards when data shape fits
- Resolve presentation kinds via SoTs (condition, typed CopyChips, dates, capabilities)
- Semantic chips: `bg-x-50 text-x-700 ring-x-200` when using the chip recipe
- Compose rails (`SidebarRailShell`, `RecentActivityRailBase`) when using master–detail —
  never fork list infra; do not invent dual-pane for table/board-primary jobs
- Monitor rollup: compose `SectionCard` / `KpiStrip` / `MonitorPageShell` — never local card shells;
  if the registry primitive is the weak sibling of an approved compound item, **grow the SoT**
  then recompose (pattern evolution — not a freeze)
- Fix contract / sidebar-mode violations (e.g. search → sidebar map, not focus pane)
- Icons from `@/components/Icons`, structural and paired
- Crossfade only the singular focus surface (never the collection map / stream / graph)


Load normalize guidance from the available normalize skill path (project or user skills).
If none is present, apply `.claude/rules/ui-design-system.md` as the normalize checklist.

### Grow SoT when approved compound items require it

When an approved item is “unify / promote / grow primitive”:

1. Confirm blast radius (prefer single-consumer or same PR surface).
2. Change the design-system / registry module first.
3. Point the target (and any in-scope callers) at the improved SoT.
4. Do not leave two shapes for the same job on the polished surface.

### Route additional sub-skills only when audit flagged them

| Finding class | Load and apply |
|---------------|----------------|
| Spacing / hierarchy / composition | `.claude/skills/impeccable/reference/layout.md` |
| Clutter / too many actions / noise | distill (impeccable `reference/distill.md` or distill skill) |
| Typography scale / eyebrow misuse | `.claude/skills/impeccable/reference/typeset.md` |
| Token / gray-on-color / flat palette | `.claude/skills/impeccable/reference/colorize.md` |
| Breakpoints / touch targets | `.claude/skills/impeccable/reference/adapt.md` |
| Labels / empty / error copy | `.claude/skills/impeccable/reference/clarify.md` |
| Missing motion / wrong crossfade | `.claude/skills/impeccable/reference/animate.md` **and** `.claude/rules/display/motion-crossfade.md` (use `useMotionTransition` / `useMotionPresence`) |

Do **not** invent new design-system components when an existing primitive covers the need.
Do **extend** an existing primitive when the approved better pattern is a growth of that family.

---

## Phase 4 — Polish

After approved fixes land, load `.claude/skills/impeccable/reference/polish.md` and
run a final pass on the **same target**:

- Alignment / spacing consistency
- Interaction states (hover / focus / disabled / loading)
- Empty / error edge cases that were in scope
- Optical tweaks that don't expand scope

Do not reopen P2 items the user declined.

---

## Phase 5 — Optional extract

If the refactor produced a clearly reusable pattern (token, row renderer, shell wrapper),
**offer** `/impeccable extract <target>` (or load `.claude/skills/impeccable/reference/extract.md`).
**Never** auto-run extract. Prefer extract when Phase 2 listed a **Promote next** item that
is now proven in code.

---

## End-of-run summary

After Phase 4 (or after Phase 2 if the user stopped), output:

1. What was audited / what was changed (file paths)
2. Which approved items closed vs deferred
3. **Compound opportunities** still open (promote next / deferred) — so the system keeps compounding
4. Suggested manual check (route + viewport)
5. Optional extract offer if applicable

---

## Anti-patterns for this skill

- Skipping the approval gate "to save a turn"
- Running `craft` / `shape` / `bolder` / `delight` / `overdrive` by default
- Redesigning an entire page when the user named one component
- Rebuilding sidebar/rail infrastructure instead of composing
- Changing backend routes, permissions, or data models under a UX/UI ask
- Literal reskin only when a stronger house sibling or single-consumer SoT fix exists
- Importing a foreign visual system that fights Kinetic Ledger tokens / region contracts
- Forcing sidebar + right pane when data shape wants table, board, station card, or rollup
- Omitting the Compound opportunities section from the audit report
