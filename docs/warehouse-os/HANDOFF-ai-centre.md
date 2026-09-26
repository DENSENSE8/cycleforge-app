# HANDOFF — the AI centre: one sunken feed, blocks of time

**Paste everything below the rule into a fresh session pointed at this worktree.**

**Current ruling — reinstated by operator ruling 2026-09-26.** The 2026-08-24
D2 overturn is itself reversed: CycleForge is AI-first, and this brief's
inversion ("the AI, pinned in the middle, always"; "the conversation is the
workspace") is the front-door ruling again — the assistant composer stays fixed
in the centre. AI writes follow approval-first + per-automation auto-approve:
each lands as a proposal a named human approves unless the org has flipped
that mutation kind to auto-approve (applied immediately, logged
`actor_kind = 'agent'`, revertable).

Written 2026-08-23, after the desktop pivot (T30) and the Phase 1 input truth
layer landed. Read [`LAWS.md`](LAWS.md) before proposing anything, and
[`HANDOFF-ux-fighting.md`](HANDOFF-ux-fighting.md) for how the operator wants to
be argued with.

**Supersession, stated exactly:** this brief REWRITES the framing of
[`HANDOFF-ai-first.md`](HANDOFF-ai-first.md) — the screen is no longer built
from a tiles perspective at all. What survives from that document: its §1 audit
(still accurate), its Phase 1 (**done** — see *State of the tree*), its paste
correction, and every law it cites. What dies: the feed as the canvas's
zero-tile fallback, and the canvas as the default screen.

---

You are rebuilding the Cycle Forge screen around **the AI, pinned in the
middle, always**. Not a tile that shows the assistant — the assistant IS the
surface. Everything else is a moment inside it or a detail beside it.

## The thesis, in one line

**The conversation is the workspace, and work renders as blocks of time inside
it — never as pages.**

## The scenario that IS the spec

Every design decision below is tested against this walkthrough, one-handed,
while holding a phone:

1. The operator is mid **repair service** — a repair session block is open and
   armed.
2. A customer calls: something they bought is not working.
3. **⌘N** — a new session block opens. The repair block PARKS (S2/S3 —
   losslessly, one keystroke, no dialog, nothing asked).
4. The operator types (or the customer reads out) the **order number** into the
   one composer. The truth layer stamps how it arrived (Phase 1, done).
5. The order's block renders **immediately, in the feed**: the order, the
   items, and the one verdict that decides the call — **in warranty or not,
   can we help or not** — legible at a glance, phone still at the ear. Full
   detail sits in the right panel, not in the feed's way.
6. There is a problem and it is in warranty. The **suggestion row above the
   composer** says so and names the key: *"Sounds like a claim — ⌥T drafts a
   ticket from this order."*
7. ⌥T — a **draft ticket block** appears, prefilled from the order block:
   preview state, editable, visibly a draft.
8. The composer's action button reads **Create ticket** — never "Send". **Enter
   commits.** The draft block seals into a real ticket with its number, inside
   the same block of time. The call ends; **⌘N** or resume — the repair block
   is one keystroke back.

That is the whole product. If a step needs a navigation, a page, a modal, or a
second input, the design is wrong at that step.

## The four rulings this brief adds

### 1 · The feed is the GROUND — sunken, centred, chromeless

- Pinned centre, clamped to a prose measure (the shipped 440–680 clamp is the
  starting point), **always mounted, always the AI**. It never unmounts, never
  yields the centre to a tile, never navigates away.
- **No tile around it. No backdrop. SUNKEN**: the feed reads as recessed into
  the chrome plane, not raised on it. Under this design system that must be
  built from **colour planes and 1px strokes only** — F3 bans shadows, F1
  budgets radius — e.g. the well's ground one plane darker than the chrome
  around it, hairline inner stroke, chrome (beam, rails) sitting visually
  "above". Settle the exact treatment in the prototype and measure it; do not
  invent a shadow or a second radius to fake depth.
- The canvas/tile layer is **not the screen anymore**. `Canvas.tsx` currently
  renders tiles when any are open and the feed only at zero — that inversion
  flips: the feed is permanent; whatever a "tile" used to show is either a
  **block in the feed** or **detail in the right panel**. (Wide tables are
  measured and ruled — see *Fight 1, settled* below: summary block in the
  feed, the table in the widened right panel. A block never expands past the
  measure — a 976px "block" is a tile wearing a block's name.)
- Keep the **left rail** (pages + recents — the mouse/triage path) and the
  **right panel** (context/detail). They frame the well; they never cover it.

### 2 · Blocks of time, not static pages

- A **session is a block of time**, and the feed is the chronology. A block
  opens (⌘N, a scan, an assistant action), carries what happened (lookups,
  drafts, commits, notes — each a line item), and parks or ends. Scrolling up
  is scrolling **back in time**, not visiting a page.
- The schema already says this — the UI finally agrees:
  `work_sessions` is the titled wrapper (06-work-order ruling),
  **`work_session_intervals` is literally the blocks-of-time table** (who
  worked it, when), and `ops_events` (A1, with `session_id`) is what happened
  inside the block. Rendering a block = rendering a session's interval + its
  events. No new model. No new table for the UI's sake.
- Blocks are **collapsible line items** with a collapse-all (absorbed from
  HANDOFF-ai-first Phase 4): a parked repair block collapses to one line —
  title · state · elapsed — and reopens in place.
- **⌘N cuts a new block.** The collision is RE-RULED (2026-08-23, **S12**):
  ⌘N = new session block (the operator's words), the launcher keeps ⌘K
  (T19, R2). The law row is in; the binding is live in `ShellRoot.tsx`.

### 3 · Drafts are blocks; the commit button morphs

- Intent → **suggestion row** (one line above the composer, fed by the same
  CustomEvent bus as `scan-feedback/visual.ts`): states what you seem to be
  doing and the key that does it. Never steals focus, never holds an input
  (I6), never animates geometry (M1).
- The keybind (or typing the intent) opens a **draft block** in the feed:
  prefilled from the block it came from (the order lookup), editable inline,
  visibly draft — an UNCOMMITTED block of time.
- The composer's action button **is the mode**: *Create ticket*, *Print
  label*, *Send to seller* — never a generic Send. **Enter commits** the draft
  through the T28 gate (`agent_mutations` when the assistant fills it, the
  route's own gate when the operator does), and the draft block seals into the
  artifact with its real number. Escape discards the draft; the block of time
  records that too.
- The executing session must confirm the ticket's actual table before wiring
  the commit (`journey.ts` names a ticket source; `entity_threads` carries 7
  entity types) — name it, do not guess it.

### 4 · The AI sets its own keybinds — by proposal, never silently

- "The staff would be very comfortable with the AI. It would set its own
  keybinds." Mechanism: the assistant notices a repeated intent (third ticket
  today) and the suggestion row offers a chord: *"⌥T for ticket drafts from
  now on? Enter to keep it."* Acceptance writes
  `prefs.workspace.keybindings` through the EXISTING overrides schema
  (null = disabled, absent = default) as an **approval-first agent mutation**
  (T28) — visible under Ctrl+I, revertable, `actor_kind: 'agent'` (T13).
- Every proposed chord passes `wedgeReachability()` — a bare or
  scanner-typeable key is refused at proposal time, by name (T20/T21). The AI
  earns keybind autonomy exactly the way it earns every write: measured
  acceptance (`trust-stats.ts`) is the evidence the operator uses to flip
  keybind proposals to the org's **auto-approve** setting (operator ruling
  2026-09-26), after which they apply immediately and stay logged + revertable.

## State of the tree (2026-08-23 — what a fresh session inherits)

| Piece | State | Where |
|---|---|---|
| Input truth layer — scanner/paste/human stamped `{value, source}` | **DONE**, 14/14 tests incl. mounted DOM suite | `src/hooks/useFindFieldScan.ts` (+ `.test.ts`), `src/lib/keyboard/find-field-scan.ts`, wired in `AssistantFeed.tsx` |
| The feed — THE SURFACE (inverted 2026-08-23) | **permanent centre** inside the sunken well; the chronology is BLOCKS OF TIME (Phase 2 done): ⌘N cuts/parks (S12), blocks collapse to title · state · elapsed and resume in place, line items land inside the armed block, collapse-all at top | `src/shell/Well.tsx` (Canvas.tsx deleted), `src/shell/AssistantFeed.tsx` (`BlockView`), state in `useShell.ts` (`feed: FeedEntry[]`, `cutSession`, `resumeBlock`, `parkArmedBlock`, `appendItem`), `SessionBlock` in `model.ts`, beam mirror in `clock.ts` (`syncElapsed`) |
| Shell frame | beam (narrates *starting session / session started*) · rails · canvas · tool panel | `src/shell/*` |
| Desktop app — NATIVE IS THE PRODUCT (T30/T31) | **built + runs**: Linux x64 AppImage, N6 file layer (open folder, CRUD, trash), selftest 7/7 in the packaged binary | `electron/files.js`, `desktop-dist/CycleForge-0.1.1-x86_64.AppImage`, Files tool `src/shell/FilesPanel.tsx` |
| Import mouth (forward-compatible seam) | authenticated, validating, honestly **501** until the documents migration lands (D6) | `src/app/api/imports/desktop-files/route.ts` |
| Session model | ruled: `work_assignments` = unit, `work_sessions` = titled wrapper, intervals = time | [`06-work-order-migration-path.md`](06-work-order-migration-path.md), S-laws (S1 armed-unique is `DB`) |
| Agent loop, 15 UI verbs, T28 mutation gate, trust stats | built | `src/lib/assistant/*` (see `workspace-tools.ts` docblock) |
| Suggestion bus · keybinding registry · wedge machine | built, per the HANDOFF-ai-first §1 audit (spot-verified: `src/lib/keybindings/*`, `wedge-scan-machine` tests pass) | — |
| Dev server for this worktree | running, `:3051`, auth break-glass env flags on (preview only) | launch entry `warehouse-os-worktree`; AuthContext client knob |
| Configurability rulings | modes = states of one tree · snap magnetic · saved layouts = one prefs key away | [`07-configurability.md`](07-configurability.md) |

## Order of work

Each phase shippable alone; do not start one before verifying the last.

1. **The inversion.** The feed becomes the permanent centre — sunken well,
   no tile chrome, no backdrop; canvas demoted out of the default screen;
   right panel = detail. *Verify:* feed mounted and y-stable through every
   state; zero tile chrome around it; M1 audit stays 0.
   **DONE 2026-08-23, measured live on `:3051`:** well 680px, centered, clamp
   holding; ground `--surface-containerLowest` (chrome) vs well `--bg-canvas`
   — darker in BOTH themes; 1px `--border-subtle` hairline; `--r-hud` the one
   radius. Drove message → arm Packing → open Triage: `.tile` count 0
   throughout, both refs landed as rail rows, well rect pixel-identical
   (x300 · y48 · w680 before and after), M1 audit 0 transitions / 0 shadows.
   `Canvas.tsx` deleted; split (⌘\ and the context-menu item) died with the
   canvas. Opens/parks narrate into the feed as line items — Phase 2 turns
   those lines into blocks.
2. **Blocks of time.** Session open/park/end render as collapsible blocks in
   the feed; ⌘N cuts a new block and parks the current (re-bind from
   launcher); collapse-all at top. *Verify:* ⌘N twice mid-work loses nothing;
   a parked block resumes in place with elapsed intact.
   **DONE 2026-08-23, driven live on `:3051`:** ⌘N cut "Session 1" (launcher
   stayed shut), the mid-call message landed INSIDE the block; second ⌘N
   parked it collapsed at **00:00:20** and armed "Session 2"; after a further
   wait the parked line still read 00:00:20 (frozen — interval sum, not wall
   time); Resume re-armed it **in place** (chronology order unchanged:
   collapse-all · Session 1 · Session 2), items intact, elapsed continuing
   20→21s while Session 2 auto-parked. Collapse-all left 0 expanded
   interiors; ⌘K opens the launcher; Escape closes it; M1 audit 0/0
   throughout; the well clamp held at 482px in a narrow pane (≥ the 440
   floor). `SessionBlock.intervals` is the UI twin of
   `work_session_intervals`; the beam clock now MIRRORS the armed block
   (`syncElapsed`) and the prototype's fake 263s seed is dead. Law row:
   **S12**.
3. **The lookup moment.** Order number in (typed / scanned / pasted — sources
   already stamped) → order block with the warranty verdict readable at a
   glance; full detail right. *Verify:* the scenario through step 5 with all
   three input paths.
4. **Draft blocks + morphing commit.** Suggestion row → keybind → prefilled
   draft ticket block → *Create ticket* on Enter through the gate; Escape
   discards. *Verify:* the whole phone-call scenario, one-handed, timed.
5. **AI-proposed keybinds.** The proposal loop, gated writes into keybinding
   overrides, wedge-reachability refusals surfaced by name.

## Hard constraints carried forward

- **T30/T31** — native is the product; GS1 resolvers stay public web.
- **T28** — reads free, writes gated. The ticket commit and the keybind write
  both go through it.
- **S1/S2/S3** — one armed scan session (DB), parking is a work event and is
  lossless. ⌘N leans on this; never weaken it to make the demo smoother.
- **I2/I3, T20/T21** — the wedge detector's contracts; no bare keys, no
  Shift+Tab-class chords, collisions refused by name.
- **M1/M5** — nothing animates geometry, in the well least of all. F1/F3 —
  radius budget, no shadows; "sunken" is planes and strokes.
- **One field.** The composer is the only text input on the default screen.
  No second composer inside a draft block — the draft edits inline, the
  composer commits it.
- **D6** expand → code → contract. **`orgId` from ctx.** Never commit unless
  asked; `npm run verify` before done (know that other lanes' design-system
  deletions keep the full gate red — your files must be clean).

## Fight this brief where it needs it

The operator asks to be argued with (see HANDOFF-ux-fighting). Two premises a
fresh session should test rather than swallow:

1. **"No tiles at all"** vs. the triage queue: a 720px grid inside a 680px
   well does not fit. **Settled 2026-08-23, by measurement.** The 720 was
   real: the queue's fact columns are hard `minmax(X, X)` floors
   (`src/lib/dashboard-order-row-layout.ts`) summing to **45rem = 720px** in
   `fulfillment.default` and **61rem = 976px** in `fulfillment.tested`,
   against a well that tops out at 680. Ruling: **the well carries the
   chronology, not the database.** A summoned queue renders in the feed as a
   summary block (count · verdict · exceptions) and the table itself in the
   **widened right panel**, which meets the prototype's ruled
   `--tile-min-table: 520px` floor and leans on the existing
   `ordersQueueViewportForceHidden` below its floors. The well never widens
   past its clamp; no block expands past the measure.
2. **"Always display the AI"** vs. the manager replay and settings: both are
   blocks or right-panel detail under this model. If one genuinely cannot be,
   bring the measurement, not the assertion.

What is already ruled — T30, T28, the work-order model, magnetic snap, the
suggestion row's job — is not reopened without new evidence (X3).

## The external master plan (2026-08-23) — reconciled

An external model (no codebase access) answered this brief with a "master
plan": sunken well · blocks of time · morphing commit · gated keybinds. Where
it restates the rulings above it is accepted — its five-step sequence IS the
order of work. Where it adds, the laws and the code answer:

- **Fight 1: its ruling stands, now with the measurement** (above). It picked
  the right answer — summary in the feed, table in the widened right panel —
  by assertion; the column floors are what make it stick.
- **Fight 2 accepted.** An asked-for settings change is a T28-gated block in
  the feed; the manual settings surface is right-panel detail. The well never
  unmounts.
- **REFUSED — Shift+Tab as the physical↔admin mode toggle.** Not just banned
  by law: `Tab` is a shipping wedge TERMINATOR
  (`registry.ts` — `WEDGE_TERMINATOR_CODES`), and only ⌘/Ctrl/⌥ are out of a
  scanner's reach — Shift is not. Shift+Tab is a chord real scans type
  (I2/I3, T20/T21); the plan's own keybind section cites the refusal
  machinery this item violates. What it wanted — session variables carried
  into ticketing — is already ruling 3: the draft block is prefilled from the
  block it came from.
- **REFUSED — a permanently mounted search input in the right rail**,
  asserted twice as a "critical override" with no evidence (X3). A standing
  second free-text field is the fork the launcher exists to remove (T11, R2,
  One field), and a permanently focusable field is where a stray wedge burst
  lands. What survives, per I6: a right-panel surface that IS a queue keeps
  its own filter field visible while that panel is mounted.
  Search-as-navigation stays ⌘K.
- **REFUSED — the metrics-loaded global header** (order # · value · type ·
  platform · time-boxing · escalation buttons). The beam's emptiness is a
  measured ruling — bookends, deliberate nothing between (B1, B19).
  Escalation is a session-chip / suggestion-row action, not beam furniture.
- **Corrected — "escalation populates a draft in the composer."** Drafts are
  blocks (ruling 3); the composer holds no draft — its button morphs to
  commit one. One field.
- **Flagged — the left rail re-scoped to sessions only** (Start · Pinned ·
  Recent). Sessions on the left fit R3 ("left is where you go"), but the plan
  silently drops pages — the mouse/triage path. Pages stay until that fight
  is actually fought.
- Its "the well never yields focus" conflates centre with focus. The well
  never yields the **centre** (geometry). Focus follows the work — a queue in
  the right panel takes keyboard focus while the operator drives it.
