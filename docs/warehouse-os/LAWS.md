# Warehouse OS — LAWS

**Status: living document. Started 2026-08-22 at the operator's instruction.**

The design and architecture laws for the Warehouse OS shell, in one place, so they
can be referenced by number, argued with, and added to.

Most of these govern surfaces that exist **only in the prototype**
(`prototype/warehouse-os.html`) or **only in the database**, not yet in `src/`.
That is recorded per law in the **Status** column rather than argued about — a law
written ahead of its surface is a specification; it becomes an invariant when the
surface lands.

Where a law came out of a discussion, the reasoning lives in
[`HANDOFF-ux-ui.md`](HANDOFF-ux-ui.md) at the § noted. This file is the index and
the statement; that file is the argument.

---

## X · Meta — how this document works

| # | Law | Why | Status |
|---|---|---|---|
| **X1** | **Laws are prose. Guards are banned.** An invariant may be pinned by a DB constraint, a TS type, a required prop with no default, a mounted DOM test, or an ESLint AST rule — **never** by a test that `readFileSync`s a source file and regex-asserts its contents. | A regex over source text cannot tell an import from the same word in a comment, and it pins a shape rather than a behaviour, so it fails the moment a surface legitimately moves. 16 such files, ~2.7k lines, were deleted on 2026-08-22. | `PROSE` |
| **X2** | **A law names its enforcement or admits it has none.** The Status column is part of the law. | "Everyone knows we don't do that" is not enforcement, and the next agent does not know. | `PROSE` |
| **X3** | **Superseding is explicit.** A law is struck through with its replacement's number and a date, never silently edited away. | The deleted constitution is recoverable from git; this one should not need to be. | `PROSE` |
| **X4** | **Numbers are stable and append-only.** Retired numbers are not reused. | So "see F4" keeps meaning F4. | `PROSE` |

**To add a law:** append a row to the right section with the next free number in
that section's prefix. Statement, one-line why, honest status.

**Status vocabulary**

| | Meaning |
|---|---|
| `DB` | A database constraint. Unbreakable from any code path. |
| `TYPE` | Enforceable by the compiler — a required prop with no default, a discriminated union. |
| `TOOLING` | An existing script, hook, or CI gate enforces it. |
| `PROTO` | Holds in the prototype. Nothing in `src/` yet. |
| `PROSE` | No mechanical enforcement exists or is planned. Read and obey. |

---

## M · Motion

> **This is WMS software and it has to be fast.** Show it or do not.

| # | Law | Why | Status |
|---|---|---|---|
| **M1** | **Nothing animates geometry.** No transition and no keyframe may touch `width`, `height`, `top`/`left`/`right`/`bottom`, margin, padding, `transform`, or framer's `layout` / `layoutScroll` / `layoutId`. | A collapse that tweens its height still occupies the space for the length of the tween, which is backwards for an interaction whose only purpose is to hand space back. A row that springs into position delays the paint that tells a scanning operator the scan landed. | `PROTO` — clean in the prototype; **16 framer sites + 101 `transition-all` still live in `src/`**. Sweep is specified and executable: [`HANDOFF-motion-sweep.md`](HANDOFF-motion-sweep.md) |
| **M1a** | **One exception to M1: an operator-fired DISCLOSURE may animate its own height**, 180ms max, on the house ease-out, driven by CSS from a measured var (never JS), and cut to 1ms under `prefers-reduced-motion`. Today that is exactly one surface: the nav spine's section folds (`.spine-collapsible-content`, `globals.css`). | M1's argument is that a tween holds space it is handing back — true of ambient and incidental motion, and of anything the operator did not ask for. A fold is different: the operator aimed at that chevron, the space is the subject of the interaction, and without the tween twelve rows below the header teleport, which reads as a re-render rather than as a fold. `framerPresence.collapseHeight` already carried this exception in code (`motion-framer.ts`: "the one sanctioned layout animation") while this table denied it; the two now agree. Adding a second surface needs its own ruling. | `PROTO` |
| **M2** | **Only colour and opacity may animate**, capped at one token (80ms). No easing-curve token exists, so geometry cannot borrow one. | They composite off the main thread and never move a neighbour. | `PROTO` |
| **M3** | **State is drawn with `outline`, never `border`.** | `outline` does not participate in layout, so a hover/focus ring can be 2px without shifting a pixel of content. | `PROTO` |
| **M4** | **No first-load cascade on any navigator.** | The two rails are reached by muscle memory; a stagger puts time between the reach and the row. Already ruled 2026-08-08 for the sidebar rail. | `PROTO` |
| **M5** | **Nothing schedules a geometry change over time in JS either** — no `setTimeout` that hides a thing, no rAF that eases a size. | M1 is trivially defeated from JavaScript. | `PROTO` |

---

## F · Form

> Planes flush to the viewport stay square. Controls and nested regions round on a named ladder, concentrically (F9), and the curve has to be visible (F10).

| # | Law | Why | Status |
|---|---|---|---|
| ~~**F1**~~ | ~~Radius exists exactly once — `--r-hud`, on the workspace frame.~~ Then ~~radius exists NOWHERE~~ (2026-08-24). **Superseded by F9, 2026-08-24.** Planes-flush-to-viewport staying square was right; interiors of a 16px pane staying 0px was the bug. | | — |
| ~~**F2**~~ | ~~The control radius tokens are deleted, not zeroed. Only `--r-none` and `--r-hud` exist.~~ **Superseded by F9, 2026-08-24.** Tokens `--r-control` / `--r-surface` / `--r-pane` / `--r-keycap` / `--r-avatar` shipped the same day; F2's "absence" was already false. | | — |
| **F9** | **Planes stay square. Controls and nested regions round, on a named ladder, concentrically.** Viewport-flush chrome (beam, rails, well-ground, tool panel) is `--r-none` — a radius jammed against the display corner is a notch. Floating panes take `--r-pane` (16px). Inside a pane, `used = min(role, outer − padding)`. Roles: `--r-keycap` (4px) status marks + short segmented *tracks*; `--r-control` (6px) 28px plates / buttons / fields; `--r-surface` (8px) nested regions (scan well, composer well, bubbles, cards) when pad ≥ 8px; `--r-avatar` is `.identity-mark` only. Round the strip, clip the cells (`overflow: hidden`); never round the cell. Never invent `--r-sm/md/lg/xl/full`. Safari native chrome is still killed with `appearance: none`. | A 16px card full of 0px CAD squares is two products glued together. A per-step radius on a 20px strip is a pill. Concentric math is the shadcn method on this shell's tokens, not a second scale. | `PROTO` — `tokens.css` + `shell.css` CONTROL SURFACES / SEGMENTED STRIPS; shadcn `--radius-sm/md/lg/xl` aliased onto the same ladder in `globals.css` |
| **F10** | **A radius you cannot see is still square.** Hairline tracks do not count as rounded — fill the strip. Dashed strokes are banned on rounded wells (dashes skip the corner and read as the generic dropzone). Side-tabs (a thick colored edge on a rounded card) are banned — tone lives in the badge. Repeatable hint chips become one track; cells stay square and clip. | F9's tokens were right and the golden still looked CAD: 4px on a 1px polyline is invisible, a dashed scan well hides its own 8px, and a 3px urgency bar on a `rounded-lg` card is the frontend-design side-tab tell. Optical radius is the method, not a second scale. | `PROTO` — filled `.pipeline` / `.composer-toggle` / `.feed-hint`; solid `.scan-await`; StageQueue urgency on `Badge` only |
| **F3** | **No drop shadows, anywhere.** Borders carry all structure. | With no radius and no elevation, a 1px stroke is the only thing separating one surface from the next — so strokes are pitched up until they can do that job. | `PROTO` |
| **F4** | **Every indicator mark is a square.** Status dots, pipeline marks, tile marks. | At 5–8px a square is more legible than a circle and it matches the frame. | `PROTO` |
| **F5** | **Segmented strips replace pills.** Hairline-bordered segments with an inverted active cell. | A pill is a radius wearing a disguise. | `PROTO` |
| **F6** | **Tables are grids** — column rules, zebra banding, sticky uppercase condensed header, tabular numerals globally. | The job is reading one row across without losing it. | `PROTO` |
| **F7** | **Naming a typeface is not loading it.** Every face in a stack is linked (Google Fonts) or inlined, and verified with `document.fonts.check()` — never by looking at a screenshot. | The prototype named Inter, IBM Plex Sans Condensed and IBM Plex Mono for weeks and loaded none of them; every condensed label was rendering non-condensed. | `PROTO` |
| **F11** | **Surfaces are styled with Tailwind utilities + shadcn/ui components only** (motion rides the motion.dev feedback util, still under M1/M2). **No new rules enter `shell.css`** — the ported stylesheet is a migration source and may only shrink; a new class in it is a regression, not a convenience. | Operator, 2026-08-25: *"it must only be tailwind and shadcn UI, not css styles."* Two styling systems on one surface is the house-law drift that killed the last constitution — every converted component (Tile, StageQueue, ToolPanel, the orders/product/help/sessions tiles) deletes its css as it lands. | `PROSE` — migration in flight, shrink-only |
| **F8** | **Focus is visible.** One square inset 2px accent outline on `:focus-visible`, everywhere. | | `PROTO` |

---

## B · The beam (global header)

| # | Law | Why | Status |
|---|---|---|---|
| **B1** | **The beam has four zones and no more**: corner cluster (scan · carton) · empty context line · face · session chip. *Revised 2026-08-22 — the `⋮` became the session chip (B20) and the context line was emptied (B19).* | Six zones is what the beam had when it started hiding its own content at 1440px to fit. | `PROTO` |
| **B2** | **The beam reports identity, never verbs.** Operations are tools. | Pairing is something you *do*; the beam says what *is*. | `PROTO` |
| ~~**B3**~~ | ~~The context line is the only place that says what the operator is doing right now.~~ **Superseded by B15, 2026-08-22.** It was transcribed from §2, which was written before the session tile existed. | | — |
| **B15** | **Session identity lives ON the session tile, not in the beam.** The spine carries state · name · pipeline, at full tile width. **Amended 2026-08-22 by B21** — it used to read *state · name · carton · pipeline*; the carton was never a session fact and has gone back to the beam. | S2 rules exactly one session tile, so the identity has a home on the object — and the operator is already looking at it. Repeating it ~700px away in centred chrome is a saccade for nothing. It is also an upgrade, not a relocation: the pipeline gets a real full-width strip instead of four squeezed segments, and that is the level procedure STEPS slot into later (A7 / P1). | `PROTO` |
| **B16** | **The beam carries only what survives the ABSENCE of a session tile.** Global context, the scan cluster, the one readout face, `⋮`. Nothing session-derived. | That is the whole test, and it is why the pipeline, the title, the state badge and the carton context all left. | `PROTO` |
| ~~**B17**~~ | ~~**The scan-armed cell is the one session-adjacent thing that stays in the beam** — welded to the scan field, permanent, in every state. | Two reasons it cannot move to the tile: it must answer *"where does my scan land"* when there IS no session tile (`no session` / `parked`), and it must sit beside the input the scan goes into, at the fixed top-left origin B5 exists to protect. Measured: after `closeSession` the beam reads `Receiving` and the cell reads `no session` — the question is still answered with zero session chrome on screen.~~ **Superseded by B20, 2026-08-22 (operator ruling).** The premise — that session identity must sit *beside* the scan field — was never tested against putting it at the other end of the same 40px row, where it is equally unmissable and does not crowd B5's origin. | — |
| **B19** | **The beam is BOOKENDED: the carton at the left end, the session at the right end, and deliberate nothing between them.** Left bookend = what is in my hands. Right bookend = what work it is against. | Two facts of equal standing, so they get equal treatment and maximum separation — an operator reads one without their eye catching the other. The 768px between them at 1440 is not unspent budget, it is the separation doing the work. Measured at 1440: scan 31 · carton 335 · slack 768 · face 1203 · session 1335, sum 1423 against a 1440 header. Holds to 1024 with 352px of slack and zero overflow. | `PROTO` |
| **B20** | **The session lives in the beam's RIGHT corner, as a chip built from the carton chip** — leading square state mark, mono value, one hover tint, no radius. It is a readout first and a button second: state and name are legible with no action, and clicking opens the session popover already anchored to that corner. | It replaces the `⋮`, so the corner gains a job rather than holding two. Building it from the carton component is what makes the bookends read as a pair instead of two unrelated widgets. Verified: `armed` → *Packing #7* green · `parked` → *parked — no target* amber · `ended` → *no session* grey; popover right edge 1436 = chip right edge 1436. | `PROTO` |
| **B21** | **The carton is a BENCH fact, not a session fact, and it keeps its place in the corner cluster.** | The schema says so and nobody had read it: `work_sessions` (migration `2026-08-22b`) has **no carton, container, or entity column** — and its own comment rules *"state JSONB is for true per-session variant scratch… Queryable business facts stay real columns above."* A carton is a queryable business fact with no column, so it is not a property of the session. It also passes B16's test on its own terms: a box on the table survives the absence of a session tile, and it is the thing that CREATES sessions rather than a thing they own. | `PROTO` — **the beam copy is still hardcoded**; `contextValue` has no writer |
| ~~**B22**~~ | ~~There is no tool overflow in the beam.~~ **Superseded by B23, 2026-08-25 (operator ruling).** | | — |
| **B23** | **The beam's top-right `⋯` is the TOOLS entry** — readout · timer · stopwatch and the rest of the roster, session-scoped tools appearing only while armed (T6). The right rail keeps the full roster; the `⋯` is a second, deliberate door. The session verbs it used to hold (park/close via SessionPopover) moved to the composer's session header. | *Operator ruling, 2026-08-25: "the three dots in the top right should be for tools like the readout, the timer and the stopwatch."* B22's premise — the corner already had a job (B20's session chip) — dissolved when the session's face moved INTO the composer (§1 of the same ruling), leaving the corner free. | `PROTO` — `GlobalHeader`'s tools dropdown |
| **B18** | **No beam fallback for session identity.** | It was hedged for and did not survive measurement: at these floors the session tile cannot be fully scrolled away (max overflow 482px against a 784px tile), and the no-tile case is already answered by B17. Two surfaces answering one question is the fork this refactor exists to remove. | `PROTO` |
| ~~**B4**~~ | ~~Exactly one header-face slot, operator-assigned.~~ **Revised by B7, 2026-08-22** — the slot is not a free choice; it has one canonical occupant. | | — |
| **B7** | **The header face is one fixed-width slot and its occupant is `elapsed / target`.** 128px, tabular, sitting between the context line and `⋮`. | The 40px row is a commons and the context line (B3) always pays first. Fixed width makes that budget a constant instead of a lottery — measured at 1440: cluster 551 + line 713 + face 128 + overflow 28, no overflow. And "how long am I taking" and "is there a limit" are the same question, so one pair answers both. | `PROTO` |
| **B8** | **A readout behind a dropdown is not a readout.** The whole value of a readout is being readable without an action. | A timer you must click to see is a tool with a compact launcher. You would never open it, and when you did the number would surprise you — which is the opposite of the reason for putting it in the beam. | `PROTO` |
| **B9** | **The face IS the button.** Clicking it opens that tool's panel. | The drill-down a dropdown would have provided, without the dropdown's cost, and without a second control. | `PROTO` |
| **B10** | **Targets belong to the WORK, not to the operator.** A target is a property of the task type / pipeline stage. | A per-person target is a performance ranking rendered into the operator's own chrome. If a ranking is wanted it belongs in the manager view (§8.1.2), where a manager reads it — not in the HUD of the person being ranked. | `PROTO` |
| **B12** | **The face has THREE states, not two, and it is a per-staff preference.** `pace` (elapsed / target, coloured) · `elapsed` (the clock only, **never** coloured) · `off`. | "Show it" and "hide it" is not the whole answer. The middle state is the one that matters: an operator who wants to time themselves without being told they are late gets exactly that. Colour is the verdict; `elapsed` is the clock without one. In `elapsed` the target half is REMOVED and the slot narrows (128px → 78px) rather than blanked, so it stops implying a hidden number. | `PROTO` |
| **B13** | **Hiding the readout NEVER affects measurement, and the copy says so in the setting itself.** *"This is a display setting for you alone. Work is recorded either way — it changes what you see, not what is measured."* | Three things get conflated here and only one is a preference: **measurement** (ops_events, always on), **display** (this setting), **enforcement** (not built). A preference that quietly implies it stops the recording is worse than no preference — the operator finds out later, and then nothing in the HUD is trusted. | `PROTO` |
| **B14** | **The mode is reachable when the face is off.** It lives in the timer panel (where clicking the face already lands) *and* in the launcher. | A control whose only entry point is the thing it hides is a one-way door. | `PROTO` |
| **B11** | ⚠️ **Elapsed is not work time, and the denominator is unsolved.** S8 says a session never times out, so wall-clock elapsed keeps running through breaks, bench changes and interruptions. | A target measured against wall clock is wrong the first time anyone steps away, and the operator is shown red for something they did not do. Either measure against `ops_events` density (active time) or keep the target advisory and uncoloured until there is a work-time measure. **Do not ship the red state against wall clock.** | `PROSE` — **unresolved** |
| **B5** | **Scan is the most top-left thing in the app.** | A fixed origin is what lets an operator reach the most-used control without looking. | `PROTO` |
| **B6** | **The context line degrades by dropping the least identifying segment first** — carton, then stage. The session title is last to go. | The title is the only segment that names the work. | `PROTO` |

---

## I · Input & scan

| # | Law | Why | Status |
|---|---|---|---|
| **I1** | **One persistent scan/search field.** No separate search button, no toggle before typing. | Search is a *mode of the input*, not a sibling control — §1 said so before the button was built. Two search fields is a fork. | `PROTO` |
| **I2** | **A wedge burst and human typing are different input paths and both work at once.** A scan lands in the armed session while the operator is mid-search. | This is what makes I1 possible and makes "pause to search" unnecessary. **Nothing implements this yet** — it needs a timing-based wedge detector. | `PROSE` — not built |
| **I3** | **The wedge detector runs ahead of the keybinding matcher.** | Otherwise a barcode containing `\` triggers split-tile. | `PROSE` — not built |
| **I4** | **Mode error is prevented by naming the destination, not by memory.** The placeholder always says where the field's contents go. | Asking an operator to recall which mode they are in is asking for a mis-scan. | `PROTO` |
| **I5** | **Both axes of the 2×2 stay modelled.** `auto \| key` (does my typing count as a scan) × `find \| flt` (search the org / filter the focused tile). | Collapsing them loses hand-entry of a damaged barcode, which is a real bench task. | `PROTO` |
| **I6** | **No instrument floats near the beam.** Anything with a text input opens as a rail panel, never a dropdown or popover. | A focusable text field two inches from the scan indicator is a barcode trap. | `PROTO` |
| **I7** | **There is one keybinding registry.** Do not add a 52nd hand-rolled `window` keydown listener. | 51 exist today with exactly one user-remappable key in the whole app. | `PROSE` — registry started, `src/lib/keybindings/` |
| **I8** | **One composer, ever.** No surface — tile, tool panel, popover, anything — may mount a second composer for any reason; every text-entry job (notes, comments, questions to the assistant, messages) enters through the MAIN composer, which is the one input method for all of it. ~~A tile-local *filter* inside a mounted queue surface stays legal~~ — **struck 2026-08-25 (operator: "remove the queue filter too, it goes through the main composer")**: filtering is composer prose (`filter: …` narrows the focused queue; bare `filter:` clears), and the tile shows a display-only readout chip. Nothing anywhere else has a free-text mouth. | Operator, 2026-08-24: *"never display another composer for any other reason — it must display within the main composer; that would be the main input method for all reasons."* Two composers split where words go: the prototype's per-tile "Add a note…" and the tool panel's "Ask the assistant" were both deleted the day this landed — each was a second mouth whose text went nowhere the main composer's write-target could account for. | **`LIVE`** — both stray textareas deleted 2026-08-24; the main composer's write-target (Phase 7 `target`) carries the note path |

---

## S · Sessions

| # | Law | Why | Status |
|---|---|---|---|
| **S1** | **Exactly one *armed* scan session per org**, app-wide. | The wedge routes every scan to it, so tiles never compete: no `scanFocusTileId`, no per-tile focus, no mount-order race. | **`DB`** — `ux_work_sessions_armed_scan`, partial unique index over the tenant column alone |
| **S2** | **Exactly one scan-session *tile* on the canvas.** Opening another **parks** the current one. | The DB stops two sessions being *armed*; it cannot stop the UI rendering two that look identical while one owns the wedge. A tile you believe is armed but is not is a mis-scan generator, and a mis-scan is physical inventory error. | `PROTO` |
| **S3** | **Parking is a work event, never a lookup.** Triggers: opening another session, explicit park, shift handoff. **Never** a search, a tool, a tile focus change, or a table. | A park drops the arm, bumps `version`, flickers the state badge, and opens a race on the arm index — all to look something up. | `PROTO` |
| **S4** | **Parking is lossless**, so one-session-at-a-time costs nothing. | `state` JSONB holds draft buffers and tile geometry; `parked` is a first-class status; the claim lease exists so *"a lead resumes someone else's parked session."* | **`DB`** |
| **S5** | **Switching type ENDS the old session and OPENS a new one.** It never mutates `scan_type` in place. | In-place mutation rewrites history, orphans the draft buffer, breaks `version` monotonicity for clients applying at `version + 1`, and makes the pipeline strip a lie — progression needs more than one row to be true. | `PROSE` |
| **S6** | **`kind='task'` sessions: N may be open.** They do not own the wedge. | Locking them to one deletes the kind's reason to exist. | **`DB`** — the schema states it |
| **S7** | **`scan_type` is an IFF with `kind='scan'`.** A task session carrying one is as much a corruption as a scan session missing one. | | **`DB`** — `work_sessions_scan_type_chk` |
| **S8** | **Sessions are persistent. No absolute timeout ends a mounted shell.** | A mounted shell is not killed mid-shift. `claim_expires_at` is a lease on who is editing, not a TTL. | **`DB`** — no `expires_at` column exists |
| **S9** | **A session's `version` is monotonic, +1 per accepted mutation**, and a client applies an event only at `version + 1`. | It is the change-detection primitive for every reader, including the manager view. | **`DB`** |
| **S10** | **A session is a WORK ORDER SESSION — a TITLED wrapper, not a typed one.** It carries a free-text `title` in the org's own words ("Unbox", "Goods-in", "Pallet 4471"). Dispatch is a separate field (`surface_key`), and the two must never be conflated. | *Operator ruling, 2026-08-22.* "Unbox" is what one warehouse calls a job, not a fact about the software. Hard-coding it means a migration before another org can name its own bench — and `work_sessions.surface_key` already exists as *"a code registry key, not a FK"*, so the dispatcher is built and only the human name was missing. Title answers *what do I call this*; `surface_key` answers *what renders it*. One is data, one is code, and giving them one column is what made the vocabulary a schema problem. | `PROSE` — `title` lands in the expand step, [`06-work-order-migration-path.md`](06-work-order-migration-path.md) |
| **S11** | **`work_assignments` is the UNIT OF WORK and it survives. The session WRAPS N of them.** One work order session → N assignments, each with its own assignee, entity and status. | *Operator ruling, 2026-08-22, superseding the earlier reading that `work_sessions` absorbs it.* They are different objects: an assignment is what a lead **hands you**; a session is **you doing it**. The evidence is adoption and direction — `work_assignments` is live in **65 files** against `work_sessions`' 20, and `2026-08-08b` was already *"turning work_assignments into a row that can carry a throwable task"* two weeks before `work_sessions` existed. Merging them would have deleted the layer that lets two people work one work order. | `PROSE` — `work_assignments.work_session_id` lands in the expand step |
| **S12** | **⌘N cuts a new session block and PARKS the current one — losslessly, one keystroke, no dialog. The launcher keeps ⌘K.** A block inherits S2's exclusivity: one armed block, ever. Parking closes the block's interval; elapsed is the SUM OF INTERVALS, never wall time; a parked block collapses to one line (title · state · elapsed) and resumes IN PLACE. | *The ⌘N re-rule, 2026-08-23 (HANDOFF-ai-centre §2).* Mid-call at the bench the operator's words are "new session", not "open the launcher" — and the launcher was never entitled to two chords: ⌘K is its law-anchored key (T19, R2). Verified live on `:3051`: ⌘N twice mid-work lost nothing; a block parked at 00:00:20 read 00:00:20 after a further wait and resumed to 00:00:21 — interval math, not wall time. | `PROTO` — `useShell.cutSession` / `SessionBlock.intervals`, the UI twin of `work_session_intervals` |

---

## T · Tools

| # | Law | Why | Status |
|---|---|---|---|
| **T1** | **Tools are classed by input behaviour, not size**: **Readout** (emits state, no keyboard) · **Instrument** (owns a text field) · **Library** (read-only, drag source) · **Actuator** (physical side effect). | Size predicts nothing. A calculator is small and dangerous; a photo library is large and harmless. | `PROSE` |
| **T2** | **Tools push from the right. They never float over the work.** | On a bench, a panel over the work is a panel you cannot read past. | `PROTO` |
| **T3** | **A tool is a descriptor with a lazy factory**, never a live React element owned by a mounted page. | Today a right-rail registration stores a live element, so a tool structurally cannot open from a page that does not already mount it. | `PROSE` — blocker |
| **T4** | **Only Readouts and Libraries may auto-summon.** An Instrument arriving uninvited while a scan is armed is a barcode trap. | | `PROSE` |
| **T5** | **Contextual tools declare `appliesTo`** and appear only while that scan type is armed. Global tools carry no `appliesTo` and never auto-summon. | | `PROTO` |
| **T6** | **`scope` is the ONE availability field.** `global` (always listed, receives no context) · `session` (listed only while a session is armed, and RECEIVES it) · `tile` (listed only while a tile is focused). `appliesTo` narrows a `session` tool to specific scan types. | Availability and context-binding are the same fact, so they are one field. A tool that does not use the session has no reason to hide when there is none — which is why the "contextual + context-free" cell is empty and must stay empty. | `PROTO` |
| **T7** | **Availability and context-awareness are independent of each other.** A tool may be always-available *and* fully context-aware — the assistant is `global` and still receives the session. | Conflating them is what makes people ask whether the AI should be "contextual". It should be always available and always context-aware. | `PROTO` |
| **T8** | **There are three different "always", and they are different fields.** always **available** = `scope: 'global'` · always **visible** = pinned (`prefs.workspace.pinnedTools`) · always **readable** = the one header-face slot (B4). | One word for three mechanisms is how a rail ends up with an unbounded number of permanent things in it. | `PROTO` |
| **T9** | **An empty scope band renders nothing** — no heading, no placeholder. | A heading over an empty band spends the rail's scarcest resource on the statement that there is nothing to say. Same rule as the recents block. | `PROTO` |

| **T10** | **The assistant is its own scope — `agent`, a scope of one — and its own rail band at the top of the right rail.** | It is the only tool that **writes on your behalf**. `agent_mutations.actor_kind` already separates `'agent'` from `'operator'` in the ledger; the rail says the same thing. Sitting it among calculator/photos/manuals implies it is the same kind of thing. | `PROTO` |
| **T11** | **Orchestration is the LAUNCHER, not a second input.** A query with no exact match offers *"Ask the assistant"* rather than "No results". | The launcher is already the one "tell me what you want" surface: one input, keyboard-first, grouped. An AI that opens the layout, pins the tools and starts the session is that surface with natural language. A second free-text box is the fork R2 exists to remove. | `PROTO` |
| **T12** | **A queued proposal badges the rail icon.** The count must be legible without opening the panel. | A proposal the operator never sees is a proposal that never happened. | `PROTO` |
| **T13** | **Approving a queued proposal keeps `actor_kind: 'agent'`.** It does not become an operator action. | `getMutationTrustStats` reads acceptance rate, and that rate is the input to widening a mutation kind's trust class. Re-labelling an approval as operator work destroys the only signal the trust model has. | `PROSE` |
| ~~**T14**~~ | ~~The assistant panel cannot ship before the wedge detector.~~ **Superseded by T16, 2026-08-22.** The dependency was stated in the wrong direction. | | — |
| **T28** | **Tool-calling READS freely. Every WRITE goes through the mutation trust class.** *Operator ruling, 2026-08-22.* An AI-first shell may query anything; it may not silently change inventory. `mutation_kind` → trust class decides apply-now vs. queue-for-review, and the queued case is a human's to approve. | This is the gate that makes an AI-first warehouse app shippable at all. It is also already built (`assistant/mutations/`, `trust-stats.ts`) and already self-correcting: `getMutationTrustStats` reads acceptance rate, and that rate is the input to widening a kind's trust class — so the model earns autonomy from evidence instead of being granted it. Approving a queued proposal keeps `actor_kind: 'agent'` (**T13**) or the signal is destroyed. | **`DB`** — `agent_mutations`, `2026-07-03o` + `2026-08-23a` |
| **T15** | **The assistant is the FIRST SCREEN, and it starts in the CANVAS, not the rail.** The empty slate *is* an assistant prompt at full canvas width. Once anything is open it recedes to its rail band. | Arch drops you at a TTY — not at a window manager with one app in it. A rail panel as "the first thing" would mean shipping the beam, both rails, the canvas frame, the tool registry and the panel host *before* the thing that is supposed to come first. The empty slate already exists and is already the first screen every new operator sees; making it the assistant costs no new surface. | `PROTO` |
| ~~**T29**~~ | ~~The browser is the product. The desktop shell is an OPTIONAL station host and never the distribution.~~ **Superseded by T30, 2026-08-22 (operator ruling).** It was correct as a reading of the *existing* product and wrong as a plan for the one being built — the operator is pivoting, not clarifying. | | — |
| **T30** | **NATIVE IS THE PRODUCT. The application is installed, and it owns the filesystem, the input stack and the model.** *Operator ruling, 2026-08-22 — an explicit pivot, taken after the browser-first case was put and rejected.* | What native buys that a browser cannot: **files** (real paths, direct NAS writes, bulk import/export, label templates, photo capture straight to disk — today `nas-agent-client.ts` reaches the NAS over the network from the server, which is a round trip a local process does not need); **the input stack** (global hotkeys while unfocused, and raw HID so a scanner is read as a *device* rather than inferred from keystroke timing — the wedge heuristic becomes a fallback instead of the mechanism); **the model** (an Ollama box on the same machine, with model files measured in GB, pairing with the BYOK chain `org-provider.ts` already resolves); and **offline as a first-class state** rather than an IndexedDB queue draining on reconnect. | `PROSE` — **the seam is inverted, not extended**; see below |
| **T31** | **The GS1 resolvers stay on the public web, and they are not the operator app.** `/01`, `/414`, `/l`, `/p`, `/s`, `/q` remain small read-only pages, served to anyone with a phone camera. | This is a requirement the pivot *carries*, not an argument against it. Those URLs are **printed on stickers on boxes already in the world** — AGENTS.md lists the paths as never-delete for exactly this reason. A phone camera hands a scanned Digital Link to whatever browser the OS chooses; there is no install prompt in that path, and a sticker that resolves to nothing is a physical asset destroyed. Keeping them costs one thin public surface with no operator features in it, which is a different and much smaller thing than "the product is a web app." | `PROSE` — **must be scoped out of the native migration explicitly** |
| **T16** | **The wedge detector must land before the first SCAN SESSION — not before the assistant.** | The barcode-trap hazard needs something armed to trap a barcode *from*. Shipping the assistant first is the one ordering where the hazard cannot exist, because nothing is armed yet. The constraint is real; it binds the first scan session, not the assistant. | `PROSE` — **hard dependency on S1** |

| **T17** | **Pinned tools are an ORDERED array — the order IS the placement.** `prefs.workspace.pinnedTools`, per staff, per org. | The contract already exists and already states the reasoning: *"a pin is about the person, not the workstation."* Drag inside the rail is the gesture; arrows are the keyboard path, which has to exist anyway. | `PROTO` |
| **T18** | **The assistant is the rail's FIXED HEAD, not a pin.** It cannot be unpinned or reordered, and it is not in the pin list. | This is what makes T17 compatible with D7 (never seed workspace defaults): the pinned band starts **empty** for a new operator, and the shell still has a head to reach for. Structural, like the add/search button — the same argument as T10 and T15. | `PROTO` |
| **T19** | **An unpinned tool is not hidden.** It is one `Ctrl+K` away in the launcher, which is the one index (R2). | Pinning controls *placement*, not *existence*. Otherwise an empty rail on day one would mean an operator who does not know what exists cannot find out. | `PROTO` |
| **T20** | ⚠️ **An operator-assignable chord MUST carry a modifier. A bare key may never be bound.** | A wedge scanner emits keystrokes, so a single-character binding is a scan waiting to fire a tool — the same hazard I3 exists for, arriving through the customization surface instead of the input one. Verified refused: *"F needs a modifier — a bare key can be fired by a scanner."* | `PROTO` |
| **T21** | **Chord collisions are REFUSED, never silently shadowed.** The error names the binding already holding it. | With 51 hand-rolled keydown listeners in the tree, silent shadowing is how a binding "stops working" with nothing to grep for. Verified: *"Ctrl+2 is already tool.printer."* | `PROTO` |

| ~~**T22**~~ | ~~Pinned tools live in a top-right header cluster.~~ **Superseded by T27, 2026-08-22.** Misread: "top left" meant the top of the left RAIL, not the header's corner cluster. | | — |
| **T27** | **Pinned tools sit at the TOP OF THE RIGHT RAIL, directly under the add control — the same position pinned SESSIONS occupy in the left rail** (renamed from Pages, 2026-08-24). | That is the symmetry §3 and §5 already describe: same position, same meaning, same gestures, both sides. The beam stays chrome and never holds pins. Measured: add at y=44 and pins at y=85 on **both** rails — offset 41 either side. | `PROTO` |
| **T23** | **ONE pin surface. The rail does not repeat the beam's pins.** The rail keeps discovery (add / search) and the contextual band; the beam keeps the fixed set. | Two places showing the same pins is T8's confusion made visible, and it is the fork R2 exists to remove. | `PROTO` |
| **T24** | **Pinning is IN LINE: right-click the tool itself, and drag from the overflow list onto the cluster.** Never a settings pane. | The control belongs on the thing it controls. A pin managed three surfaces away is a preference; a pin managed on the icon is an affordance. Both gestures share one drop handler — from the list it PINS, from inside the cluster it REORDERS. | `PROTO` |
| **T25** | **Placement is drag order, and drag is the primary gesture.** Drop a pin onto another to insert before it; drop on the cluster to append. | Arrows in settings remain as the keyboard path (T17), but they are the fallback, not the interface. | `PROTO` |
| **T26** | **The pin ceiling is enforced with a reason, not trusted.** *"The rail holds 10 pins. Unpin one first."* | The rail is a column, so the ceiling is **height**, not beam width — 10 × 28px = 280px, comfortable above the slack on a 900px rail. **Note:** the registry holds fewer than 11 pinnable tools, so the ceiling has never actually fired — written, not proven. | `PROTO` — untriggered |

---

## W · Workspaces (saved arrangements)

| # | Law | Why | Status |
|---|---|---|---|
| **W1** | **A workspace saves geometry + which TABLE and TOOL tabs sit where. It never saves a session.** | | `PROTO` |
| **W2** | **A session is stored as a SLOT, not an id.** `sessionSlot: boolean`. The currently-armed session drops into it. | Storing a session id would make switching workspaces park and arm sessions as a side effect of navigation — S3 (parking is a work event, not a lookup) and a fight with S1's one-armed-scan index. A saved id also goes stale the moment that session ends. | `PROTO` |
| **W3** | **Applying a workspace is navigation: nothing is parked, nothing is armed, nothing mounts a session.** Verified: session tile survives, arm state unchanged. | | `PROTO` |
| **W4** | **A workspace is distinct from a PRESET.** A preset is geometry only (C6) and applies to whatever is open. A workspace is geometry **and** contents. Both exist; neither absorbs the other. | A preset that learns its contents has become a session type (C6). A workspace that drops its contents is just a preset. | `PROTO` |
| **W5** | **Workspaces persist per staff, per org** — `prefs.workspace.saved`. Schema entry, no migration (D1, D3). | | `PROSE` |
| **W6** | **Workspaces live in the launcher, not in new rail furniture.** | R2 — one add/search index per rail, and it already carries search. | `PROTO` |

---

## R · Rails

| # | Law | Why | Status |
|---|---|---|---|
| **R1** | ~~Rails are persistent narrow icon strips.~~ **Amended 2026-08-24, operator ruling — extended to both rails the same day, for parity.** Either rail may fully close (unmount, not just narrow to icons) — `shell.leftRailOpen` / `rightRailOpen`, each pinned by its own header-button click (top-left, top-right) that works with or without hover. A hover hot-zone at the matching viewport edge PEEKS it open without pinning, which is the "hover may preview" half of this law applied to a rail that can now be absent, not just narrow. | Warehouse tablets get the desktop layout and report `(hover: none)`. A hover-only rail is unreachable, and the hover engine opens at 0ms on an evicting registry. The amendment preserves this: the click path never depends on hover support, so a mounted tablet loses nothing — it simply never benefits from the peek. | `PROTO` — `useRailPeek` (shared by `RailSessions` / `RailTools`) |
| **R2** | **One add control per rail — the hamburger**, which carries search. No second `+`. | Two affordances for one job is the fork this refactor exists to remove. | `PROTO` |
| **R3** | **Left is where you go. Right is what you use.** | An operator who learns one rail has learned both. | `PROTO` |
| **R4** | **Both content blocks anchor to a screen edge; the slack lives in the middle.** Tabs grow down from a fixed origin; recents anchor up from a fixed origin above the utility block. | Screen edges are the only targets that cannot be overshot. A centred block's y-position is a function of how many items sit above *and* below it, so opening one tab slides the whole thing. | `PROTO` |
| **R5** | **Each block owns its own scrollport.** A long tab list cannot starve recents; a long history cannot starve the tabs. | This is the answer to rail overflow. | `PROTO` |
| **R6** | **Pins sit above tabs, and above the rail label.** | A pin is a destination always wanted within reach; a tab is something currently open. | `PROTO` |
| **R7** | **Every vertical rail label is uppercase.** | Pick one and apply it everywhere. | `PROTO` |
| **R8** | **A collapsed rail is icons only.** No labels, no text spill past 40px. | | `PROTO` |
| **R9** | **Permanence decreases downward, in BOTH rails.** Stable blocks anchor to the top edge, volatile blocks to the bottom, slack in the middle. Left: pins → tabs → recents. Right: assistant → global tools → session tools. | This is what makes the rails learnable as one rule instead of two layouts that happen to rhyme. §5 already wants symmetry; this is the principle that produces it rather than a coincidence of ordering. | `PROTO` |
| **R10** | **There are no "recent tools."** | Recents solve a *finding* problem: the set of destinations is thousands of cartons and hundreds of tables, so you cannot pin them all. The set of tools is small, fixed, and already entirely visible in the rail — a recent-tools band would list things sitting four rows above it. If the registry ever reaches a size where this stops being true, that is a different problem than a recents band. | `PROSE` |

---

## K · Kinds — the vocabulary

| # | Law | Why | Status |
|---|---|---|---|
| **K1** | **One test separates the containers: DOES CLOSING IT LOSE WORK-IN-PROGRESS?** Page/table: no. Tool: no. **Session: yes** — which is why it is the only one with a DB row, a `version` counter and a claim lease. | Every other distinction people reach for — size, importance, how many steps, whether it has an input — fails on some real case. This one does not. | `PROTO` |
| **K2** | **A FORM is not a peer of tool / session / table.** It is a **view inside a container**, the same level as the grid it hands off to. | Comparing "a form" to "a tool" compares a control to a container. One import session renders a *form* at its `source` step and a *grid* at its `triage` step; neither is a different kind of object. Verified: form only at `source`, grid only at `triage`, one container throughout. | `PROTO` |
| **K3** | **A tool that grows a second step has become a task session.** | A tool is single-act: open it, do the thing, close it, nothing is staged. The moment there is a *procession* — a state you can be halfway through — closing it destroys work, and K1 has already decided what that is. Mirror of C6 ("a preset that needs to know its contents has become a session type"). | `PROSE` |
| ~~**K4**~~ | ~~An import is a task session.~~ **Superseded by K8–K10, 2026-08-22.** Wrong: it assumed a human pastes the rows. Orders arrive by cron. | | — |
| **K8** | **The discriminator is the UNIT OF WORK — the smallest thing meaningful to finish.** Row → **table with row actions**, committing per row. Batch → **task session**, state survives. Physical container → **scan session**. | K1 asks *whether* state must survive; this asks *what the state is about*, and that is what picks the container. "Is there a cron" was never the question. | `PROTO` |
| **K9** | **The PRODUCER is never the session.** Cron, webhook, paste box, file drop — all producers, all feeding one queue. | `orders-sync/client.ts` already streams *"a 400-row exceptions stream"*: the sync resolves what it can and hands the rest over. A manual upload is a fallback producer, not a second workflow — so you build **one** triage surface, not one per source. | `PROTO` |
| **K10** | **An import is a producer TOOL (Actuator) plus an exceptions TABLE.** The human work is one row action, and it commits on its own. | Immediate per-row commit means two operators can work the same queue, a crash loses nothing, and there is no "unsaved changes" dialog on a warehouse floor. Verified: 1 unresolved row → Resolve → queue empty. | `PROTO` |
| **K11** | **FBA shipment build is the canonical task session**, because the unit of work is the batch. | A shipment is one object built from N selected units and half a shipment is not a thing, so the selection must survive closing the tile. Verified: opens beside an armed scan session, arm untouched. | `PROTO` |
| **K5** | **S2's exclusivity is SCAN-ONLY.** One scan-session tile; task-session tiles are N. | They do not own the wedge, so they cannot compete for a barcode — the schema says N may be open. Treating every session as exclusive was a real bug: opening an order import parked the packing bench. Verified fixed: task session opens beside an armed scan session, arm untouched. | `PROTO` |
| **K6** | **A TOOL is a drag SOURCE; a tile is a drag TARGET.** Photo library → support ticket tile. | It works precisely because the tool is stateless (K1). Dragging *out of* a session would mean dragging uncommitted state; a session's outputs become draggable once they are committed entities, which means you drag them from a table. | `PROSE` |
| **K12** | **Operator vocabulary is DATA. Never a Postgres enum, never a CHECK.** Bench names, job names and queue names are org-extensible and belong in rows (or a code registry validated app-side), not in the type system. | Measured: the three `work_assignments` enums have needed **six `ALTER TYPE` migrations** to add vocabulary — `SKU_STOCK`, `STOCK_REPLENISH`, `OPEN`, `FOLLOW_UP`, `SUPPORT_TICKET`. Each one is a migration file, and each needs **two** because PostgreSQL refuses a new enum label used in the transaction that added it (`2026-08-08b` says so in its own header). The repo has reached this conclusion twice more independently: `2026-08-23b` refused a CHECK on `session_type` because *"a CHECK here would mean a migration every time a bench is added"*, and the polymorphic refactor plan names `work_assignments.entity_type` as the *"precedent for don't do this for a tenant-extensible axis."* Three arrivals, one answer. | `PROSE` — contract step |
| **K7** | **A commit step with a side effect is an ACTUATOR, not a tool.** "Publish", "commit N orders", "print". | T1's classes apply inside a session too: the last step of an import is the one that touches the world, and it gets the confirmation an Actuator gets. | `PROSE` |

---

## U · Customization — what a staffer may change

| # | Law | Why | Status |
|---|---|---|---|
| **U1** | **Three tiers, and one question draws the line: DOES CHANGING THIS CHANGE WHAT SOMETHING MEANS?** **Arrangement** (what is open and where) — unrestricted. **Comfort** (density, radius, accent, theme) — bounded. **Meaning** (semantic state colour) — locked. | The empty-slate principle (D7) is about *arrangement*, not about making the design system editable — the same distinction P5 draws for procedures. "Everything is configurable" and "nothing is" are both wrong; the boundary is meaning. | `PROTO` |
| **U2** | **Density is ONE scale, never N padding knobs — and the tile floors consume the same number.** compact / default / roomy, `floorScale` 0.92 / 1.00 / 1.14. | The floors (784 / 520 / 360 / 320) were *measured against a density*. Separate padding values would be an untested combinatorial space in which every measured minimum is silently wrong. Verified: session floor moves 721 → 784 → 894 with the scale. | `PROTO` |
| **U3** | **Comfort radius is the F9 ladder, not a free knob per control.** Density stays an enum; the orphaned `--r-hud` slider is not a licence to grow `--r-sm/md/lg`. | F2's "tokens deleted" premise is gone (F9). A staffer still must not invent a second scale; the named roles are the whole vocabulary. | `PROTO` |
| **U4** | **Semantic colour is a SHARED VOCABULARY and is never a per-staff preference.** ok / warn / err / info, session states, the pace bands. Org-level only, and only for accessibility — never taste. | If two staff recolour their own, they read the same screen differently, and a lead walking the floor cannot read anyone's. Accent hue is personal because it means nothing; state colour is not, because it means everything. | `PROTO` |
| **U5** | **Settings is a TILE.** Not a modal, not a page, not a popover. | It is a view of data you edit, so K1 puts it in a table tile — which means it tiles *beside* the thing being adjusted and the change lands live in the next pane. Operator ruling, 2026-08-22: every window is a tile. | `PROTO` |
| **U6** | **Comfort settings are bounded, not free.** Density is an enum, radius is a clamped range, accent is a set. | An unbounded knob is an untested state that will eventually be someone's bug report. A bounded one is a design with options. | `PROTO` |

---

## C · Canvas & tiling

| # | Law | Why | Status |
|---|---|---|---|
| **C1** | **The canvas is a binary split tree, not a grid.** `CanvasSplit` has exactly two children and one `orientation`. | An N-ary node has no unambiguous answer to *"which sash did I just drag"* — every reference tiling UI (VS Code, tmux, i3) is binary underneath for that reason. A matrix also couples columns across rows: dragging a column edge would move it for every row. | **`TYPE`** — `children: readonly [CanvasNode, CanvasNode]` |
| **C2** | **Both orientations are legal.** `'row' \| 'column'`. Rows are not a lesser case of columns. | The operator's sketch is a two-column split with the right column split again into two rows. A matrix cannot express that without forcing a row line into the left column. | **`TYPE`** |
| **C3** | **Leaves are GROUPS holding N tabs, not one tab per tile** (VS Code's editor-group model). | `MAX_OPEN_TABS` is 24 and `isTabLive()` is true for exactly one tab. One-tile-per-tab would be 24 tiles, and only one subtree may mount anyway. A group is a *window*; the tabs in it are what that window can show. | **`TYPE`** |
| **C4** | **Empty groups are legal and persist.** Closing a group's last tab leaves the pane showing the launcher; closing the *pane* is a separate gesture. | Auto-removing a pane collapses the operator's layout as a side effect of finishing a piece of work — precisely when they are about to start the next one there. It also makes "split this pane" undefined when the source holds one tab. | `PROSE` |
| **C5** | **Constrain by floors, never by a depth cap.** A split is refused when either child cannot meet its minimum; there is no arbitrary "max 2 levels" rule. | Self-limiting, and the same code gives four columns on a 3840 monitor and two on a 1440 laptop without a special case. | `PROSE` — `subtreeMinWidthPx` / `subtreeMinHeightPx` recurse |
| **C6** | **A preset carries geometry and never contents.** If a preset needs to know what is IN a pane, it has stopped being a preset and become a session type. | `unbox-compare-layout.ts` and `orders-compare-layout.ts` were the same tiling model written twice (~313 LOC) because each carried its own geometry *and* its own pane recipes. | `PROSE` |
| **C7** | **Layout operations are pure and take ids from the caller.** No module-level counter, no React, no DOM. | A counter makes the functions impure and their tests order-dependent. The store owns the counter and passes ids down. | `PROSE` |
| **C8** | **A display never overrides a tile.** Opening a display (an order's detail, a product card) never replaces what an existing tile is showing — it lands as its OWN tile; if a tile already shows that display kind, THAT tile is the most relevant one and receives it (same ref → focus; same kind, different subject → retarget that one tile). The surface the operator was reading — the queue above all — is never the landing zone. | Operator, verbatim, 2026-08-24: *"when opening a display it should never override or display instead of one tile — it must always display as another tile only; if another tile is [open], display to the most relevant tile."* A queue that becomes a detail under the operator's eyes loses their place in exactly the moment they chose a row from it. | **`LIVE`** — `order-tile-policy.ts` + unit test; verified in the Electron window 2026-08-24 |
| **C9** | **Pages are per session — the Spaces model.** Every session owns its own set of open tiles (macOS mission control: windows per desktop). Parking a session stows its whole canvas with it and restores the no-session space; resuming restores that session's pages exactly; a NEW session starts on an empty desktop, even when it reuses an ended session's type (S5). | Operator, 2026-08-25: *"the pages would work per session… think mission control, macOS — windows or pages per desktop."* A packing bench's six tiles surviving into a phone-call lookup is the S12 scenario failing visually even when the wedge routing is right. | **`LIVE`** — `useShell.switchSpace` over the workspace store; in-memory until D8 lands durability |

---

## H · History (recents)

| # | Law | Why | Status |
|---|---|---|---|
| ~~**H1**~~ | ~~Recents are per staff, per org. Never per session, never per page, never device-local.~~ | ~~A recent is worth least at t+30s and most at the start of the next shift. Session-scoping deletes the trail on the one action that means "I finished a batch".~~ **Superseded by H1a, 2026-08-24 (X3), operator ruling.** | — |
| **H1a** | **Recents are scoped to the CURRENT SESSION.** Only rows tagged to the armed block's own ref render; parking or ending that block clears the trail from view. Never per staff/org-wide, never device-local. | *Operator ruling, 2026-08-24 — explicit overrule of H1.* Under blocks-of-time (Phase 2), a parked session is resumed from its own block in the well (its "Resume" control) — recents no longer needs to double as a cross-session bookmark list, and a rail-wide shift-long trail read as clutter once the well itself carries the chronology. H1's "worth most at the start of the next shift" argument answered a question the well now answers better: the PREVIOUS session's own recents are one Resume click away inside its own collapsed block, not a duplicate list item here. | `PROTO` — `RailSessions`'s `Recents`, filtered on `armedBlock?.ref` |
| **H2** | **Capped per kind, never globally.** | One global MRU lets a 12-label print run evict every carton, pack and pickup — a background batch destroying the operator's trail. | `PROTO` |
| **H3** | **Banded by kind, band order fixed, MRU inside a band.** | Cartons sit at the same offset from the top whatever happened at another bench. Position stability is the feature. | `PROTO` |
| **H4** | **Exactly one most-recent marker.** Selecting a recent moves the marker; it never moves the band. | The marker exists *because* of the banding: it buys back "the newest thing" without moving a row. Remove one and the other stops making sense. | `PROTO` |
| **H5** | **Two edge devices, on opposite edges.** Leading = touched by the live session (a mark, not a scope). Trailing = the single most recent selection. | So one entry can carry both with no ambiguity. | `PROTO` |
| **H6** | **There are no "pinned recents."** A pin is chosen and permanent; a recent is observed and transient. | Fusing them makes both blocks hold permanent items — R2's fork again. | `PROTO` |
| **H7** | **Recents never merge with the window manager.** They share rail real estate and nothing else. | "Where have I been" is dead references, correct to forget. "What is open" is live objects with a lifecycle. | `PROTO` |

---

## Q · Queues & tables

| # | Law | Why | Status |
|---|---|---|---|
| **Q1** | **A work queue is a table in a tile, not a rail.** | A queue wants width, columns, sort and virtualization. A 208px strip gives it none of those — which is why the rail needed a peek card to smuggle back the identity facts the row had no room for. | `PROTO` |
| **Q2** | **The per-staff dismiss stays DB-backed.** `staff_rail_exclusions`, same writers, server-derived `station`. Never a client-side filter. | The pre-Phase-4 bulk dismiss hard-`DELETE`d the receiving line **for everyone**; the exclusion table is the fix. Device-local forgetting reintroduces a cousin of that bug. | **`DB`** — migration `2026-07-03k` |
| **Q3** | **Domain filter facets become table column filters.** | They only ever made sense per row type. | `PROSE` |
| **Q4** | **Every typed identifier face renders its trailing 8 characters.** Order #, tracking, serial, PO — the display is `getLast8` from `src/lib/copy-chip-format.ts` (the SoT, identical to the main worktree's), the FULL value rides `title` and is what a copy click copies, and every "no value" spelling collapses to the quiet em dash — never `--------`. The shell's faces are the four-variant `id-chip.tsx` family (OrderIdChip · TrackingChip · PlatformChip · SkuScanRefChip); the main tree's 12-variant CopyChip and its hover menu stay behind until a surface asks. | *Operator ruling, 2026-08-25: "ensure that all the different numbers display … only displaying by the last eight, just like the main worktree."* Trailing 8 matches the dock and collides less than leading 8; a full 20-char tracking string in a queue cell is unreadable AND unscannable by eye. | `PROSE` — format pinned by `copy-chip-format.test.ts`; each new face must route through it |
| **Q5** | **Center Lock — desk edits stay on the table tile; scan stations keep Displays on the right.** On a **desk**, the slot table is the ground plane: one cell edits in-cell (L1); a multi-field record form stacks as `DeskStageOverlay` on the stage — never a `RightRailHost detail:*` peek, never a `DeskRecordWalkHost` XOR that hides the grid, never a route that leaves the table. On a **scan station**, procedure tools and Look stay in Displays (T2); table facts use the same L1/L2 center overlay and the queue **stays visible** under focus — do not hide browse to make room. | A right-rail inspector sends the eye to the edge; a XOR walk sends it left and steals the map. Both were measured failures at desk width. The classifier lives in [`PLAN-center-lock.md`](PLAN-center-lock.md) and is boarded in `pinned.json` + `ds_contract`. | `TOOLING` — `DeskStageOverlay` pin + smoke ranking; `PROSE` — legacy inspectors/XOR walks are debt, not templates |

---

## A · Audit & the manager view

| # | Law | Why | Status |
|---|---|---|---|
| **A1** | **`ops_events` is the one spine.** The `journey.ts` UNION branch count is the progress bar. | It is the only spine already shaped polymorphically — `(entity_type, entity_id)` plus a jsonb payload. Currently **13 branches**. | `PROSE` |
| **A2** | **`session_type` stays denormalized on `ops_events`.** | Reporting groups by it, and the classification of a past event is not allowed to change when its session row is cleaned up. | **`DB`** — migration `2026-08-23b` |
| **A3** | **The manager list renders from heartbeats only** — `{sessionId, version, sessionType, stage}`. Event bodies are fetched on demand, and re-fetched only when `version` passes what the client holds. | Streaming raw events means a React render per event per operator, at a rate no human reads. S9 is already the primitive. | `PROTO` |
| **A4** | **Ably is the realtime transport. Do not build a second one.** | Already authenticated per-user, already in production on four surfaces. `ws` in `package.json` is not a second transport; do not promote it into one. | `PROSE` |
| **A5** | **A replay is a `table` tile, never a session tile.** | So it never contends with S2, and a manager may hold several open. | `PROTO` |
| **A6** | **"Why" is structural, never a free-text prompt on every mutation.** Intent comes from the procedure step id; free text is reserved for *deviations* — skipped required step, grade override, post-commit count adjustment. | Prompting on every action produces a column full of `.`. **Deferred entirely for now** (operator, 2026-08-22). | `PROSE` — deferred |
| **A7** | **Stage is the replay's spine today; the procedure step is a finer level inside it.** | Stage grouping works now because `session_type` exists. Steps slot in without re-layout — and past a single shift they are what keeps the replay navigable at all. | `PROTO` |

---

## P · Procedures

| # | Law | Why | Status |
|---|---|---|---|
| **P1** | **A procedure is not a new surface.** It is one object at three altitudes: **authored** in a Procedures table, **run** as the session tile's spine, **summarized** by the beam's pipeline strip. | Stage → steps is one hierarchy, and §2 already rules that scan type *is* the process stage. | `PROSE` — not built |
| **P2** | **Ticking a step writes an `ops_event`.** | A checklist whose ticks record nothing is a poster on the wall. This is also what makes A6 possible. | `PROSE` — not built |
| **P3** | **Org procedure is the default; staff edits are a delta.** Absent = use the default, `null` = explicitly disabled, present = override — the same three-state shape `keybindings` already uses. | Purely per-staff procedures mean two cartons received the same day carry different evidence trails, no org-wide answer to "was the damage check done", and a new hire with no guidance on their first shift. | `PROSE` — not built |
| **P4** | **Steps carry `required: boolean`.** An operator may skip an optional step; a required one is not theirs to delete. | | `PROSE` — not built |
| **P5** | **Seeding an org procedure is not seeding a workspace default.** The empty-slate law governs *arrangement*; a procedure is an operating standard. | | `PROSE` |

---

## D · Persistence & data

| # | Law | Why | Status |
|---|---|---|---|
| **D1** | **Person facts live in `staff_preferences.prefs.workspace`, not localStorage.** Tabs, pins, keybindings, pinned tools, canvas layout, recents. | *"A staffer's remapped chord must follow them to the next bench, which the localStorage mirror cannot do alone."* | **`TYPE`** — `WorkspacePrefs` Zod contract |
| **D2** | **The prefs merge is shallow — send the whole sub-map, never a nested partial.** | Writing `{ workspace: { openTabs } }` REPLACES the whole `workspace` object and drops `pinnedTabs` with it. | `PROSE` |
| **D3** | **A new key in `prefs.workspace` needs a schema entry and nothing else. No migration.** An absent key IS "start from empty". | | **`TYPE`** |
| **D4** | **A localStorage mirror key carries org and staff.** `cf.quickAccess` does not; do not repeat it. | | `PROSE` |
| **D5** | **`orgId` comes from `ctx.organizationId`, never the request body.** Org-scoped writes go through `withTenantTransaction`. | | **`TOOLING`** — `scripts/tenancy-guard.ts` |
| **D6** | **Migrations land before the code that reads them** (expand → code → contract). A nullable `ADD COLUMN` is always safe to ship early; the reverse never is. | | `PROSE` |
| **D7** | **Never seed workspace defaults.** A new operator has nothing pinned and builds their own. | | `PROTO` |
| **D11** | **Polymorphism lives on the EVENT LOG, never on the parent.** `ops_events` carries `(entity_type, entity_id)`; `work_sessions` carries no entity link and must not grow one. | Three independent reasons. **Cardinality**: a receiving session works N `receiving_lines`, so one `entity_id` cannot hold it. **Duplication**: `ops_events.session_id` (`2026-08-23b`) already makes *"what did this session touch"* a query over facts — a column would be a second assertion that can disagree. **External**: [GitLab's database guidelines](https://docs.gitlab.com/development/database/polymorphic_associations.html) advise against `entity_type`/`entity_id` on a parent outright (no FK constraints, planner degrades on two-column filters), the exclusive-arc alternative "gets cumbersome past three types" and there are **nine** `OPS_EVENT_ENTITY_TYPES`, and the 2026 event-sourcing consensus is a single log keyed by aggregate id + type — which `ops_events` already is. | **`DB`** — `ops_events` has the columns; `work_sessions` deliberately does not |
| **D12** | **One container to N polymorphic targets is a JUNCTION, and the junction is usually already there.** `agent_mutation_affects` (`target_kind` + `target_ref`, indexed both ways) is the shipped precedent; for sessions, `ops_events` *is* the junction. | Building `work_session_affects` beside `ops_events` would need writers to keep two records of the same fact in step, and drift is where that always ends. Note `agent_mutation_affects` states its own contract: *"refs may dangle after target deletion by design."* | **`DB`** — `2026-07-03o` |
| **D13** | **Governance artefacts are COLUMNS ON THE ACTION, never a separate compliance table.** Reasoning and approval expiry sit on `agent_mutations` beside the payload they describe. | A governance table puts the compliance answer in a different row from the action it is about, so every reader joins to find out whether the trail is even complete — the thirteen-spine problem (A1) reinvented for audit. It also makes *"which high-risk actions have no recorded rationale"* an `IS NULL` on a column rather than a jsonb probe that cannot tell absent from never-written. | **`DB`** — `2026-08-23f` |

> **Numbering note.** LAWS.md D-numbers jump from D7 to D11 on purpose:
> [`03-decisions.md`](03-decisions.md) already uses D1–D10 for a different set of
> decisions, and D4 in particular is cited by file name elsewhere. Skipping the
> overlap means a bare "D4" is still ambiguous historically but no *new* LAWS
> number ever collides. Per **X4**, D8–D10 are retired here and not reused.

---

## V · Process

Inherited from `AGENTS.md`, restated here so this file is a complete index.

| # | Law | Status |
|---|---|---|
| **V1** | Never commit `.env`. | **`TOOLING`** — PreToolUse hook |
| **V2** | Never start, restart, or kill a dev server. The operator owns `:3050`. A broken dev server is a **report, not a repair**. | `PROSE` |
| **V3** | The tunnel is the operator's too. A dead tunnel URL is a report. | `PROSE` |
| **V4** | Never create a branch. Always work on `main`. An isolated lane is a **worktree**, still on `main`. | `PROSE` |
| **V5** | Stage only files you changed. Never `git add -A`, never `git stash`. Commit/push only when asked. | `PROSE` |
| **V6** | `npm run verify` before done — lint · typecheck · unit. | **`TOOLING`** — pre-push hook |
| **V7** | Never delete `/01/**`, `/414/**`, `/l/**`, `/p/**`, `/s/**`, `/q/**`. They are live GS1 Digital Link and short-URL resolvers printed on stickers already on boxes. | `PROSE` |
| **V8** | Payload budgets ratchet down, never up. Fix a regression; do not re-seed around it. | **`TOOLING`** — `npm run perf:budget` |

---

## Open — not yet law

Recorded so they are not mistaken for settled.

| | Question | Blocks |
|---|---|---|
| **O1** | **Triage table needs ~720px, not the 520px `tableMinWidthPx`.** At 1600 the canvas is ~1504 wide, so `784 + 720 = 1,504` leaves **zero** room for a sash — and at 1440 (~1344) it does not fit at all. Either triage drops columns to reach 520, or it gets its own floor and a gate. | Q1, C5, and any tile work |
| **O1b** | **`sessionSplitMinFramePx` (1920) may be dead under S2.** If only one scan-session tile may exist, session-beside-session is impossible at any width and the gate never fires. Confirm, then delete it — or keep it if task sessions are meant to tile beside a scan session. | S2 |
| **O1c** | **D4 is still unruled and `tile-floors.ts` says so in its own docblock** (*"THIS IS A RECOMMENDATION AWAITING OPERATOR CONFIRMATION"*). The shipped constants are a recommendation, not law. | everything geometric |
| **O2** | What a tile looks like **below its minimum width**, and what it drops first. Today the canvas scrolls instead — honest, but not an answer. | O1 |
| **O3** | How tiles stack against each other without escaping their z-band. | |
| **O4** | Where a `HANDLE` scan lands — a carton is arguably a page *and* an item. | |
| **O5** | Does the second rail auto-collapse when one is expanded? `208 + 40 + 784 = 1,032` fits; expanded-plus-expanded does not. | R4 |
| **O6** | The composer in all four modes (docked · flush · in-cell · expandable). Only docked exists. | |
| **O7** | A summoned tool arriving unrequested — how it announces itself without stealing a scan. | T4 |
