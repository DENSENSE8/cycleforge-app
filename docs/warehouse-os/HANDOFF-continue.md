# HANDOFF — continue the Warehouse OS shell design

**Written 2026-08-22, at the end of a long design session.** Paste everything
below the line into a fresh session pointed at this worktree.

---

You are continuing the **UX/UI design of the Cycle Forge Warehouse OS shell** in
`/home/michaelgarisek/Projects/cycleforge-app/.claude/worktrees/warehouse-os-refactor-8f2dc3`.

## Read these first, in this order

| File | What it is |
|---|---|
| [`docs/warehouse-os/LAWS.md`](LAWS.md) | **150 numbered laws in 18 sections, plus 9 open questions.** Each carries an enforcement status. This is the index — read it before proposing anything |
| [`docs/warehouse-os/HANDOFF-ux-ui.md`](HANDOFF-ux-ui.md) | The argument behind every law. LAWS.md states; this explains |
| [`docs/warehouse-os/prototype/warehouse-os.html`](prototype/warehouse-os.html) | ~4,100 lines. The clickable shell — **the only file to edit** |

The prototype is published at
<https://claude.ai/code/artifact/80ba3fdf-28de-45ab-831f-12814af86124>.

## How the operator wants to work — this is the important part

**They have asked, repeatedly and explicitly, to be fought on their ideas.**
Not humoured, not agreed with. The value they want is being told when they are
wrong, with evidence.

The loop that has been working:

1. **Fight the premise.** Find the category error, the conflated axis, the
   unstated assumption. Nearly every question this session contained one.
2. **Read the actual code first.** Every strong argument in LAWS.md came from a
   migration header, a schema constraint or a docblock — not from taste. The
   codebase argues for itself better than you will; go find where it does.
3. **Concede fast and loudly when they are right.** They have been right about
   substantial things and it has improved the design each time. Several laws are
   struck through because the operator overturned them.
4. **Build it in the prototype.** Arguments settle in pixels, not prose.
5. **Verify numerically**, not by looking. Measure widths, count DOM nodes,
   assert state transitions via `javascript_tool`. Several real bugs were found
   this way that a screenshot would have missed.
6. **Record the ruling as a numbered law**, with an honest Status.
7. **Republish the artifact.**

Do not skip 2 or 5. They are what make the fighting worth anything.

## Where things stand

**Built and verified in the prototype:** the beam (scan cluster · context ·
one pace readout · `⋮`), both rails with mirrored pin positions, the tiling
canvas with four tile states, per-staff banded recents, session tile spine,
task sessions (FBA batch build), producer tool → exceptions queue, per-staff
manager replay, the assistant with a review queue, saved workspaces, the
settings tile, tool pinning with drag / right-click / keybinds.

**Zero layout animation, zero drop shadows, one radius token.** Verified.

## The single biggest gap

**The wedge detector does not exist** (laws I2, I3). Nothing distinguishes a
scanner burst from human typing. Four separate design decisions now rest on it:

- I1 — one scan/search field, type-to-search while armed
- S3 — searching never parks the session
- T14/T16 — the assistant panel beside an armed session
- T20 — operator keybinds that a barcode cannot fire

It is the highest-leverage unbuilt thing by a wide margin. It belongs with the
keybinding registry (`src/lib/keybindings/`), and it must run **ahead** of the
keybinding matcher.

## Questions the operator has not answered

`LAWS.md` § *Open — not yet law* has all nine. The two that block real work:

- **O1** — the triage table needs ~720px, not the 520px `tableMinWidthPx`. At
  1600 the canvas is ~1504 wide, so `784 + 720` leaves zero room for a sash.
- **O1c** — **D4 has never been ruled**, and `src/lib/canvas/tile-floors.ts`
  says so in its own docblock: *"THIS IS A RECOMMENDATION AWAITING OPERATOR
  CONFIRMATION."* Every geometry decision sits on it.

## ⚠️ Another session is editing the same prototype

Confirmed repeatedly. It has made **three rulings that contradict the laws**:

| Their change | Contradicts |
|---|---|
| Rails' add control is `+`, not `≡` | **R2** — the hamburger *is* the add control |
| `.rail:not(.expanded) .rail-label { display: none }` | **§1** — the vertical label is a *permanent* edge of the HUD |
| `toggleSettings()` — settings as a popover | **U5** — settings is a tile (operator ruling) |

Their work is still in the file (`closeTile`, `toggleSettings`, `rail-edge`,
`rail-slack`, `rail-footer`, `renderSettings`). **Do not revert it.** Report the
divergence and let the operator reconcile.

Because the file is shared, always **re-read before editing** and **regenerate
the twin immediately before publishing** — a rebuild is inherently the merge.
Publishing has needed `force: true`; only use it when the operator asks, and
verify first that your local build still contains both sessions' markers.

## Working rules that bit during this session

- **`node docs/warehouse-os/prototype/build-artifact-twin.mjs`** after every
  prototype edit. The twin is generated; never hand-edit it.
- **Python patch scripts must use the real UTF-8 characters** (`·`, `—`, `→`)
  when matching against the file. `\\u00b7` in a Python literal does not match
  a real middle dot, and the assert will fail.
- **Order your `tileBody` branches most-specific-first.** A generic
  `if (tile.type === 'table')` will swallow a named-tab branch placed after it.
- **Any state a render derives from must trigger that render.** Tool-rail
  availability is derived from session state, so every session transition has to
  repaint it. This caused two bugs.
- The browser pane **stops compositing when hidden** — screenshots time out.
  Verify numerically instead; it is better anyway.

## Hazards

- **Never start, restart or kill a dev server.** The operator owns `:3050`.
- **Never create a branch**; verify `git branch --show-current` is
  `claude/warehouse-os-refactor-8f2dc3`.
- **Never `git add -A`, never `git stash`, never commit unless asked.**
- **Never delete `/01/**`, `/414/**`, `/l/**`, `/p/**`, `/s/**`, `/q/**`** —
  live GS1 resolvers printed on stickers already on boxes.
- **Never add a test that `readFileSync`s a source file and regex-asserts it**
  (LAWS.md **X1**). That pattern was deleted from this repo on purpose.

## Also ready to run, untouched

[`HANDOFF-motion-sweep.md`](HANDOFF-motion-sweep.md) — an executable,
fast-model-safe spec for the mechanical half of law M1 in `src/`: 16 framer
`layout` sites and 101 `transition-all` sites. It contains a trap warning worth
reading even if you do not run it (`layout` is two different props in this
codebase, and only the framer one may be deleted).
