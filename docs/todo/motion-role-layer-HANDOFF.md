# Motion role layer — handoff

**Status: the motion architecture is DONE and enforced.** This document exists for the work
*downstream* of it, plus the two facts a future agent will otherwise re-derive the hard way.

Landed 2026-08-01 across `9dd945010` (boundary + roles), `d5d805032` (adoption), `fbcb98518`
(barrel guard + allowlist retirement).

---

## What is finished (do not redo)

| Thing | Where | Enforced by |
|---|---|---|
| 5 motion roles (`swap.scan` · `swap.focus` · `push.rail` · `gesture.press` · `feedback.pulse`) | `src/design-system/motion/roles.ts` | `roles.test.ts` — `===` identity, not deep equality |
| One import path (`@/design-system/motion`) | `motion/index.ts` + `motion/framer.ts` | `motion-major.guard.test.ts` — package ban **and** deep-path ban |
| Role adoption at every call site | 22 surfaces | `roles.test.ts` adoption ratchet (**no allowlist**) |
| No faked adoption (`void framerPresence.x`) | — | `roles.test.ts` void guard (allowlist empty) |
| Law + region matrix | `.claude/rules/display/motion-crossfade.md` | — |

Every adopted role has **zero** raw call sites and **zero** escapes. Both allowlists are empty
and must stay that way: an entry is a request to keep faking adoption.

---

## Two facts worth not re-deriving

**1. `feedback.pulse` has zero consumers on purpose.** `InlinePillPicker` borrows
`chipCopyFeedback`'s *duration* for a staggered option-chip reveal — a mount animation, not an
acknowledgement flash. It looks like the obvious first consumer and it is not one. A shared
curve is not a shared job; wiring it there encodes a false intent. Leave it until a real flash
site appears (a live grid cell update is the likely one — see D12).

**2. When a surface doesn't fit a role, grow the CATALOG — don't bend the role.**
`OmnichannelComposerDock` is the worked example. Its transition was a byte-equal rebuild of
`workbenchPaneMount`, but its presence genuinely differed (`y 8/4` vs `6/-6`). The wrong fix is
`motionRole.swap.focus` (a silent visual change); the wrong-*er* fix is what it originally
shipped — hand-rebuilding the preset and adding `void framerPresence.workbenchPane` so a text
guard saw the name. The right fix, now in the tree: a **new named pair**
`framerPresence.composerDock` / `framerTransition.composerDockMount` for the dock's own job.

**A sixth role is a claim that a new JOB exists.** Wanting a different duration for an existing
job is the drift the layer prevents — change the preset (and every surface with that job), or
add a catalog pair as above.

---

## Open work, in priority order

### A. Chrome altitude + Fields at the table lip — D5 rank 1, **the highest-value item left**

Not started. From the 2026-08-01 scorecard, *Chrome altitude* scores **2/5** and is one of the
three dimensions that must reach 4 to clear the premium threshold (with Grid/table IP and
Token maturity). Motion was the other primary and is now done.

The claim to test: table-proximal controls (Fields, sort, filters) should cluster at the
**table lip**, not in global chrome. `WorkbenchTrailingCluster` already exists and
`.claude/rules/display/workbench.md` → *Trailing Display & Actions* already rules that Fields
lives in pinned page chrome — so **read that section first and establish whether D5 rank 1
actually contradicts a shipped ruling** before moving anything. Do not move controls on the
strength of the briefing alone; the sticky-band law ("one sticky layer per scroll port") is the
constraint that put them where they are.

### B. Action-plane vocabulary on every queue — D5 rank 2

`.claude/rules/display/workbench.md` → *Action planes* defines four planes (in-cell,
row-scoped, multi-select, record). Audit each `LedgerGrid` surface for exactly one primary
plane per action, and for the superset rule where the in-cell plane is conditionally gated.

### C. Orders parity on resize/reorder — D5 rank 3

`source-of-truth.md` marks Orders **deferred** on the sticky column-header adapter
(resize/reorder recipe). Everything else (Receiving / Incoming / Pickup / Catalog / Repair) is
thin.

### D. Not adopted, on purpose — do not "finish" these

- **D2 (mandate `useMotionPresence` at every call site via AST lint).** Rejected, with the
  reasoning recorded in `motion-crossfade.md` → *REJECTED — D2*. The `<MotionConfig
  reducedMotion="user">` floor already does it, verified frame-by-frame against 12.42.2. A
  mandate buys zero compliance and sends every agent to redo the runtime's work. Reopen only
  with evidence the floor misses a case.
- **D10's durations (150/200/250ms).** The shipped curves are 120/180/240ms, tuned against
  real surfaces. The document was corrected to the code, not the reverse.

---

## Working conditions in this repo (learned the expensive way)

- **The git index is SHARED across concurrent sessions.** It has already been found holding
  another session's staged renames. Always `git diff --cached --name-only` *before* committing
  and unstage anything that is not yours — otherwise you commit their half-finished work.
- **`git diff` on a file you edited may contain someone else's changes too.** Two support
  workspaces did. Check per-file before staging; leave mixed files for their owner to commit
  (your change rides along in theirs).
- **A red `verify` is often not yours.** Run the failing gate and attribute it before fixing.
  Untracked (`??`) files are always another session's.
- **Verify motion changes structurally, not visually.** Roles hold *references* to catalog
  objects, so `===` identity + typecheck + guards prove behaviour is unchanged. Most surfaces
  sit behind auth and cannot be visually diffed from a preview pane; do not claim otherwise.
