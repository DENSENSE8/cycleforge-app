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
   Cycle Forge ops UI is utilitarian (see `.impeccable.md`).
3. **Compose rails; never fork** `SidebarRailShell` / `RecentActivityRailBase`.
4. **Colors only from** `src/design-system/tokens/colors/semantic.ts` — no hardcoded hex.
5. **One archetype per region** — never blend station / workbench / monitor / canvas.

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
   - `.claude/rules/ui-design-system.md`
   - `.claude/rules/contextual-display.md`
4. **Read one representative sibling** in the same feature area (so normalize matches
   local patterns, not a generic aesthetic).

Only if **both** `PRODUCT.md` and `.impeccable.md` are missing, stop and ask the user
to run `/impeccable init` (or restore `.impeccable.md`) before resuming.

---

## Phase 1 — Classify (mandatory, read-only)

Run the contextual-display Q1→Q4 algorithm **per region** in the target:

| Question (first yes wins) | Archetype |
|---------------------------|-----------|
| Scanner / keyboard-wedge / barcode? | **station** |
| Observe-only, no durable edit? | **monitor** |
| Node-graph / pan-zoom / semantic zoom? | **canvas** |
| Else (list → select → detail → update) | **workbench** |

### Conditional skills (read when signals match)

| Signal in target | Also read |
|------------------|-----------|
| Sidebar / `?mode=` / `SidebarShell` / mode rail | `.claude/skills/sidebar-mode/SKILL.md` |
| Station blocks / scan bar / `src/lib/stations` | `.claude/skills/station-block/SKILL.md` |
| Operations Studio / node graph / workflow canvas | `.claude/skills/ops-studio/SKILL.md` |

**Record** (carry into the audit report):

- Archetype for each region
- Reference module to **compose** (not fork)
- Any anti-mix violations (e.g. search in the right pane, browse list inside a station)

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

### Archetype: <station|workbench|monitor|canvas>
### Classification notes
- Regions: …
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

### Recommended refactor commands
- normalize (always)
- layout | distill | typeset | colorize | adapt | clarify | animate (only as flagged)

### Proposed scope for approval
- [ ] P0 item 1
- [ ] P0 item 2
- [ ] P1 item 1
…
```

### Approval gate — STOP HERE

After posting the report, ask **exactly**:

> Approve this scope for refactor? Reply with: **all** | **P0 only** | **pick: 1,3,5** | **stop**

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

- Replace hardcoded colors with `src/design-system/tokens/colors/semantic.ts`
- Apply one-row anatomy, linear scaffold (`space-y-*` / `divide-y`), `HoverTooltip`
- Semantic chips: `bg-x-50 text-x-700 ring-x-200`
- Compose rails (`SidebarRailShell`, `RecentActivityRailBase`) — never fork list infra
- Fix archetype / sidebar-mode violations (e.g. search → sidebar, not right pane)
- Icons from `@/components/Icons`, structural and paired

Load normalize guidance from the available normalize skill path (project or user skills).
If none is present, apply `.claude/rules/ui-design-system.md` as the normalize checklist.

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
**Never** auto-run extract.

---

## End-of-run summary

After Phase 4 (or after Phase 2 if the user stopped), output:

1. What was audited / what was changed (file paths)
2. Which approved items closed vs deferred
3. Suggested manual check (route + viewport)
4. Optional extract offer if applicable

---

## Anti-patterns for this skill

- Skipping the approval gate "to save a turn"
- Running `craft` / `shape` / `bolder` / `delight` / `overdrive` by default
- Redesigning an entire page when the user named one component
- Rebuilding sidebar/rail infrastructure instead of composing
- Changing backend routes, permissions, or data models under a UX/UI ask
