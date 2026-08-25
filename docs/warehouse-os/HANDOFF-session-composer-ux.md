# HANDOFF — the session lives in the composer: simplify the shell's UX/UI

**Paste everything below the rule into a fresh session pointed at this worktree
(`.claude/worktrees/warehouse-os-refactor-8f2dc3`, branch
`claude/warehouse-os-refactor-8f2dc3`).**

Written 2026-08-25 from the operator's dictated ruling of the same day,
clarified against the running app. Downstream of
[`00-endgame.md`](00-endgame.md) (D1–D16 still rule) and
[`HANDOFF-ux-overhaul.md`](HANDOFF-ux-overhaul.md); sibling to
[`HANDOFF-orders-first.md`](HANDOFF-orders-first.md) (its tiles are LIVE —
build on them, do not re-litigate C8/C9/I8). Laws C8 · C9 · I8 · F9–F11 in
[`LAWS.md`](LAWS.md) bind everything here. **Tailwind + shadcn/ui only (F11);
`shell.css` may only shrink.**

The operator's screenshot that triggered this: the armed "Bench check"
session rendering as a full-height boxy tile — `SessionTile` in
`src/shell/TileBody.tsx`, still the 2023-prototype placeholder (ARMED chip,
pipeline strip, "AWAITING SCAN" box, hard-coded `C-8842-A · unit 3 of 12`).
That surface, verbatim operator: *"very dated and very bad UI … like two
thousand ten, very boxy."*

---

## The ruling, clarified into scope

### 1 · The session mounts INSIDE the composer display — not as a canvas tile

> *"The composer would always display at the bottom of the session, so the
> Bench check must be mounted in the composer display itself, just at the top
> of it."*

The armed session's surface (identity, stage, scan-await state) moves INTO
the composer pane, sitting at the TOP of the composer display block — the
field stays at the very bottom, the session header directly above it, the
chronology above that. Opening/arming a session therefore does NOT open a
canvas tile any more; the canvas stays free for data tiles (C8), and the
session context travels with the one input it feeds (I8's logic completed:
the wedge lands in the composer, so the session that owns the wedge lives on
the composer).

- Kill the `SessionTile` placeholder in `TileBody.tsx` and the
  `'session'`-type tile mounting for scan sessions in `useShell.openTile` —
  the block/Spaces model (C9) keeps working, but the session's face renders
  in `AssistantFeed` above the field.
- The parked-block rows already pin to the bottom of the chronology
  (measured 2026-08-25, `blockBottom === scrollerBottom`); the session
  header slots between them and the field.

### 2 · The session surface is REDESIGNED, not restyled

The screenshot's boxy internals do not survive conversion — design the
session header as a modern, compact F9 surface: rounded (`--r-surface`
ladder via Tailwind/shadcn), `Badge` for state, no full-height voids, no
fake facts (the hard-coded carton/serial placeholders go; render real
session state or nothing). The work-order QUEUE UI is explicitly praised —
*"the Work Order Q has very good UI"* — treat `StageQueue.tsx` as the house
reference for density and tone.

### 3 · Beam: the name MAKES ROOM for the `+` on hover

> *"When hovering the session on the top left, the name should move over to
> the right, and the plus icon should appear to the left of the session
> title … It should move over, then make room, and display the plus icon."*

This SUPERSEDES today's opacity-in-place treatment (the `+` currently holds
its footprint invisibly). Required behaviour: idle = staff icon then session
name, no gap; hover on the session cluster = the name shifts right and the
`+` renders in the space opened to its LEFT. The shift is an INSTANT layout
change on hover (conditional render) — M1 forbids tweening it. Keep:
single-click = today's-sessions dropdown; double-click = inline rename
(both live, verified 2026-08-25); the `+` still cuts a session (⌘N twin).

### 4 · The left rail is NOT a bar — floating icons on nothing

> *"CSS is hard coded for the left rail as a bar … it should be just blank.
> No solid display at all. No inset left and top. Just a global header bar,
> with floating page icons on the left side."*

- `RailSessions.tsx` is already Tailwind (outlined light-gray `bg-muted`
  plates, search top, pins, this session's pages, the circular `?` pinned
  bottom — all verified live). What still paints a bar is the **legacy
  `.rail` css family — `shell.css:339` (`width: var(--rail-width)`,
  padding, z-index) and every `.rail-btn`/`.rail-label` rule** plus the
  chrome around `.wos-body`. Delete the family as its consumers convert
  (F11 shrink-only); nothing may reintroduce a filled strip.
- End state: the shell is the **global header bar and nothing else** —
  no left inset, no top inset below the beam; the icon stack floats
  directly on the canvas ground at the left edge.

### 5 · Tools move to a RIGHT rail; the beam's `⋯` is the tools entry

> *"The three dots in the top right should be for tools like the readout,
> the timer and the stopwatch. The tools need to be moved into a right rail
> just like the left rail."*

- Rebuild `RailTools` as the left rail's mirror: floating outlined icon
  plates, no bar, no fill — timer, stopwatch, readout, and the rest of the
  `TOOLS` roster. The pushing `ToolPanel` stays the mount for a tool's
  body (T-laws), summoned from those icons.
- The beam's top-right `⋯` (today: `SessionPopover` = session facts +
  park/close) is REPURPOSED as the tools entry (readout · timer ·
  stopwatch). Move park/close somewhere honest first — the session header
  from §1 is the natural home. Do not leave two session mouths.

### 6 · Tile chrome: title + ✕ back on every tile; the radius must survive every state

- Every tile — the work-queue tile included — shows its TITLE in its header
  with an ✕ top-right. (`Tile.tsx` has the header; the queue tile lost its
  face when identity moved to the beam readout — put the title back.)
- *"Hard coded CSS still in the code base … does not support the corner
  radius for the outline of the tile."* `shell.css` is now imported
  `layer(shell)` (globals.css:41-51) so Tailwind radii win in principle —
  **measure which rule still paints a square corner instead of assuming**.
  Candidates, in order: the legacy `.tile` block (`shell.css:586` — dead
  selector or not?), the universal `border-radius: var(--r-none)` reset
  (`shell.css:39`), and the focus ring (`outline-2 -outline-offset-2` on
  `rounded-lg` must follow the curve in every one of the four states:
  hover / focused / dragging / snap-target). Fix at the source, delete the
  dead rules, and pin it the X1 way (a mounted DOM test on computed
  border-radius ≠ 0px in the focused state).

### 7 · HARD LAW — ids display by their LAST 8, and the CopyChip comes over

> *"Ensure that all the different numbers display … only displaying by the
> last eight, just like the main worktree."*

- **Record it as a LAWS row** (Q-section or F-section, next free number):
  every typed identifier face — order #, tracking, serial, PO — renders its
  trailing **8** characters. The display SoT already exists in the main
  tree: `src/lib/copy-chip-format.ts` (`CHIP_DISPLAY_LEN = 8`, `getLast8`,
  `getLast8Serial`, quiet-empty faces) with its own test file.
- **Cherry-pick the id-chip family from the MAIN worktree**
  (`/home/michaelgarisek/Projects/cycleforge-app`):
  `src/lib/copy-chip-format.ts` (+ `.test.ts`) ·
  `src/components/ui/CopyChip.tsx` (1,247 lines) ·
  `src/hooks/useCopyChip.ts` · `src/components/ui/CopyChipHoverMenu.tsx` +
  `copy-chip-hover-menu-chrome.ts` — **2,066 lines total. Do not take it
  whole.** It must land with the correct faces: platform colour, tracking
  colour, per-type icons, the last-8 ruling.
- **Simplify on entry — this is a cherry-pick, not a mirror.** The main
  component exports 12+ variants (OrderIdChip, PoChip, TrackingChip,
  ListingUrlChip, SkuScanRefChip, UnitPriceChip, ConditionGradeChip,
  TrackingOrSkuScanChip, …). The shell needs, today: **OrderIdChip ·
  TrackingChip · PlatformChip · SkuScanRefChip**. Leave the rest behind
  until a surface asks; consider whether the hover menu earns its 429
  lines here or defers; re-express the chrome in this tree's
  Tailwind/shadcn vocabulary (F11) and the `Badge`/`CHIP_TONES` overlap —
  one tone system, not two.
- Wire the chips into: the orders queue rows (order #, tracking), the
  order-detail facts, and the beam's entity readout.

### 8 · The composer's bottom row becomes CONTEXTUAL MODES — planned, then built

> *"The composer would need to be comprehensively detailed, planned out,
> contextually based modes — not tools beneath the composer."*

The `ToolsCombobox` row under the field is WRONG by ruling. What replaces
it is a **mode row driven by context**, and the operator wants it planned
comprehensively before it is built. PLAN FIRST — bring the operator a
written mode map before coding: which modes exist (scan-armed session ·
order write-target · queue focus · no session), what each mode changes
about the field's behaviour and placeholder (I4: the placeholder names the
destination), how the existing 2×2 scan model (I5), the `filter:` grammar,
and the write-target chip fold INTO modes instead of stacking beside them.
The tools themselves live in the right rail (§5) — nothing tool-shaped
remains under the field.

---

## Ground truth (verified 2026-08-25, do not re-derive)

- Live and verified in the Electron window: C8 two-tile rule (queue/detail/
  product, retarget, dedupe) · C9 Spaces (park stows pages, resume restores,
  new session = empty desktop) · I8 one-composer (0 stray textareas;
  `filter:` grammar with queue readout chip; write-target notes) · the `?`
  help tile (circular button, rail-bottom, opens leftmost) · session
  dropdown + dbl-click rename · gray outlined rail plates.
- The dev servers are the operator's: attach to `:3051`, NEVER restart.
  Electron drives via CDP `:9223`; the protocol (mint `cf_sid`,
  `Network.setCookie`, one CDP session per scenario, HMR wipes in-memory
  state) is in project memory `electron-cdp-verification-protocol`.
- Parallel lanes are ACTIVE in this worktree — re-read every shared file
  immediately before editing; their `git add -A` never happens, yours never
  does either (stage only what you changed, commit only when asked).
- Gates: `cd` into the worktree first (cwd resets to main between shell
  calls), `npx tsc --noEmit -p tsconfig.json`, `npx eslint <files>`,
  `npm run verify` before done — known-red inherited suites are the other
  lane's report, not yours to fix.

## Fight this brief where it needs it

1. **§1's composer-mounted session vs the D2 canvas.** If mounting the
   session header in the composer starves the field of height at the
   1918×2095 form factor, bring the pixels and propose the split before
   building around it.
2. **§7's chip import size.** If the four kept variants still drag in >600
   lines of transitive chrome, argue for a fresh 150-line implementation
   against `copy-chip-format.ts` alone — the FORMAT module is the SoT worth
   importing verbatim; the component may be worth rewriting small.
3. **§8 is a plan gate, not a build ticket.** If the mode map collapses to
   two modes, say so and ship the small thing.
