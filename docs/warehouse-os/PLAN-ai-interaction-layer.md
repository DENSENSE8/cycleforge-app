# PLAN — the AI interaction layer, ranked by ROI

**Status: SUPERSEDED for ordering — see [`PLAN-scan-shell.md`](PLAN-scan-shell.md) (v2, 2026-09-04).**
The inventory (§1), the fights (§2, §7, §8) and the P0.2a build status (§8.6)
in this file still hold and are cited by v2; the ranked plan in §3–§6 is not
the current order.

**Status: PLAN (propose).** Written 2026-09-03 from the operator's brain dump,
checked against the tree the same day. No code in this file.
Read [`LAWS.md`](LAWS.md), [`HANDOFF-ai-first.md`](HANDOFF-ai-first.md),
[`PLAN-companion-composer.md`](PLAN-companion-composer.md) and
[`PROPOSE-composer-action-registry-om.md`](PROPOSE-composer-action-registry-om.md)
before touching anything it names.

---

## 0 · Verdict on the idea

**The idea is validated — by the repo, not by argument.** "One composer, never
unmounted, AI in front, data behind" is already law (T11, T15, T28, R2 "one
field") and already the parent narrative of CYC-34 (the One AI Composer
architecture note, 2026-09-03). Roughly 70% of the infrastructure is in the
tree. So this is **not a new bet**. It is a convergence problem with three
real risks:

1. **Three sessions are building the same mouth right now.** The companion
   composer (BUILDING), the composer Ask stage / desk Ask lane (uncommitted),
   and the OM action registry (propose) all touch `AssistantDock`,
   `StationComposerHost` and the header. One owner per seam or the "one field"
   law dies by accident.
2. **"Nothing in the UI" is the wrong sentence for the floor.** See §2A.
3. **Every brain-dump item wants to become a new surface.** A Miro board, an
   ops page, a shipping page, a rules page. The winning move is the opposite:
   each becomes a **tool** (what the model may call) plus a **registered
   viewport** (what the model may paint into).

The sentence to keep: **you manage the vocabulary, the model manages the
screen.** The vocabulary is a closed set of tools + viewports, exactly the
invariant `ai-template-vocab.ts` already enforces for workflow templates. That
closed vocabulary *is* the product. It is what makes the AI-first WMS
shippable to a second tenant without a second UI.

---

## 1 · Brain dump → inventory

Every row was checked against code on 2026-09-03. EXISTS means built and
wired; PARTIAL means the data or a non-AI path exists; MISSING means no tool,
table or component. Gate is the T28 trust class (GREEN read · YELLOW gated
write · RED confirm card).

| # | You said | What exists today | Gap | ROI |
|---|---|---|---|---|
| 1 | One main composer that never unmounts | `AssistantFabHost` circle on every signed-in route (`PLAN-floating-assistant-composer`, LIVE) · `DeskComposerAskLane` inline on desks when no station mouth is mounted (uncommitted) · `StationComposerHost` on every floor station · `useStationComposerStationCount` presence guard | The circle is a **door**, not a dock. R2 says one field docked to the bottom, never moved. Two mouths are currently reachable on a desk (circle + ask lane). One ruling needed. | **High / low cost** |
| 2 | Phone → computer over a socket, talk by voice | `PLAN-companion-composer` BUILDING: `composer_handoff` / `composer_draft` / `composer_submit` on the per-staff Ably bridge · `GlobalHeaderPhoneButton` mounted · `/m/companion` · `useCompanionComposerDesk` sink · `POST /api/ai/transcribe` + `useVoiceDictation` · **8/8 tests pass** | Never validated on a real bench. Desk-side voice: none (phone only). Locked-phone nudge: inbox channel has 0 subscribers. | **Very high / near zero cost** |
| 3 | Mouse fallback, or type it out | Composer, ⌘K launcher, every desk table | nothing | done |
| 4 | Miro-style home: drop notes, AI makes checklists | Composer `note` mode · `entity_threads` on 7 entity types · `tasks` and `my-day` product tables · `search_notes` tool | No spatial board. The tiling canvas store `07-configurability` cites (`src/lib/canvas`) is **not in this checkout**. "Note → checklist" needs one YELLOW tool (`task.create`). | Low for the floor, medium for the owner |
| 5 | Ops page on the phone: configure each station's flow, talk the AI into a flow, use templates | Workflow engine (`src/lib/workflow`) · `station_definitions` · `/studio` read-only (ST1; edit gated at ST4) · Template platform phases 1–5: `install-template` (always a draft), `import-package`, `recommend-template`, `ai-template-vocab`, `review-template` · `mobile-display-config` (bottom-nav only) | No phone UI for it. No composer tools wrapping `recommend` / `install`. "Configure the packing display" on a phone = `station_definitions` write, YELLOW, draft-then-publish. | Medium / medium (data layer done) |
| 6 | Community publishes templates back into the OS | `submit` → `review-template` approve/reject → `visibility: public`, curated catalog listing — **built at the data layer** | Public catalog UX, non-tenant contributor identity, licence, moderation staffing | Later, demand-gated |
| 7 | Shipping page = composer left, whatever you asked for on the right | The architecture note's shell (task strip · composer · viewport). Client UI tools `navigate`, `highlight`, `focus_node`, `set_lens`, `set_zoom`. Product tables `orders`, `orders-import`, `import-exception`, `catalog-link`, `tracking-exceptions`, `tasks`, `my-day`, `sessions`. `/shipping/fba` exists as a page. | **`emit_table` is MISSING and is the keystone** (registry §5 #1). Nothing in the loop can put a table spec into a viewport. No FBA read tool. | **Highest / low–medium cost** |
| 8 | Forms die; drag a label or packing slip onto the composer | `PLAN-to-ship-paperwork-ui`, `OrderShippingPanel`, `CsvImportStagingHost`; photo tools exist | No file-attach path on the mouth. No `order.*` mutation kind at all (registry §1 note). `order.attach_document` is YELLOW. | High / medium |
| 9 | "Show me the picker ↔ packer pairing rules; if X isn't scheduled, fall back to Y" | `staff-availability-rules.ts` · `AvailabilityRulesSection` · `apply-listing-assignment.ts` · `get_assignments` | One GREEN read tool over the rules. Whether a **fallback-staff** rule is modelled anywhere is UNKNOWN — do not invent it. | Medium / low once #7 lands |
| 10 | Scan stations: empty UI, just the station context, AI front and center | Stations already have exactly one mouth (`StationComposerHost`, `showModeFaces={false}`) and Displays on the right (`SCAN_STATION_OVERLAY_COHORT`) | **Refuse the literal reading** — §2A. What is missing is the *exception* path by voice, and #2 already delivers it. | Negative if literal |
| 11 | Highlight a tile and it becomes the context | `highlight` UI tool · `AssistantPageContext.selection` in `context-store.ts` · `PageContextSection` paints it | Viewport rows do not push selection into the context store yet. One binding, not a component. | High / low |

Two things in the dump cost nothing because they are already law: reads are
free and writes are gated (T28), and the destination of every action is named
in words (I4).

---

## 2 · The fights — three corrections before any build

### A · The floor is scan-first. Voice is the exception path, not the mechanism.

| Input | Latency to a committed action |
|---|---|
| Scanner (HID or wedge) | ≈ 0 ms |
| Keybind | ≈ 0 ms |
| Typed sentence → tool | 2–5 s (model round trip) |
| Voice on the phone → desk → tool | 3–7 s (STT ≈ 1 s, bridge, model) |

At 300 cartons a shift, a 4-second voice action per carton is **20 minutes of
dead air per operator per shift**, before noise, accents and a forklift going
past. This was already ruled in `HANDOFF-ai-first.md`: *language is the
on-ramp, the keybind is the destination.* So on a scan station:

- the gun stays the primary input, the mouth stays the one text field,
  Displays stay on the right (cohort law — never delete `visibility` /
  `zIndex.panel` to make a station "empty");
- **voice is for the moments the gun cannot express**: "this one's damaged,
  open a ticket", "where does this go", "what's next for Tuan". Those are
  exactly the companion-composer path (#2), so the floor gets voice for free
  once #2 is validated.

"Empty UI with the context in the middle" is what a station already looks
like *between* scans. Do not strip it further.

### B · "I don't want to manage the UI" is right — but the model needs something to emit into.

Custom screens die. Registered viewports do not. Every "show me X" in the
dump resolves to `{ viewport, spec }`:

| You say | Viewport | Spec |
|---|---|---|
| top pending orders to fulfil first | `orders` table | sort ship-by asc, filter not-shipped |
| the Amazon FBA plan | FBA table (needs a GREEN read tool) | plan id |
| picker/packer pairing rules | rules table (needs a GREEN read tool) | staff id |
| this note → checklist | `tasks` table | rows the model proposed (YELLOW) |
| the packing station's flow | station definition tile | definition id (YELLOW to change) |

That is one client UI tool (`emit_table`, then `emit_tile`) bound to the
slot-table engine and the tile registry. **The UI you still manage is the
registry.** That is a much smaller thing than screens, and it is the thing a
second tenant inherits.

### C · The Miro home is a fourth surface for a job the composer already owns.

T15 already says the assistant *is* the first screen, at full canvas width.
A freeform sticky-note board is a new spatial editor with its own persistence,
selection model and mobile story, for a job ("organize my notes into a
checklist") that is: `note` mode → one YELLOW `task.create` tool → the
`tasks` table in the viewport. Ship that. Revisit a spatial board only after
`emit_tile` exists, because at that point tiles on the canvas **are** the
board and nothing new has to be invented.

---

## 3 · The plan, ranked

Each phase has a validation gate. Nothing moves to the next phase on
assertion.

### P0 — close the loops that are already built *(this week)*

**P0.1 · Validate the companion voice loop on a real bench.** It is built and
green in unit tests; it has never been proven on the floor.
- Script: one staffer, one phone, one desk. Ten utterances (five reads, five
  exceptions). Measure phone-speak → desk-submit latency and STT accuracy.
- Gate: ≥ 8/10 land as intended, median latency ≤ 4 s. Record the numbers in
  the plan, not in a chat.
- Cheap add-on: subscribe the phone to `getInboxChannelName` so a locked phone
  gets the handoff nudge (registry calls it the cheapest win in the repo).

**P0.2 · `emit_table` against `orders` only, zero row actions.** Registry §8
first choice. Shape: `{ tableId, columns?, sort?, filters? }` bound to the
slot-table engine so the viewport *is* the existing To-ship table.
- Fixture: 12 prompts → expected `{tableId, sort, filters}` (the eval harness
  already has the goal-run fixture pattern).
- Gate: ≥ 10/12 exact; a wrong `tableId` is a fail, a wrong sort is a fail.
  `pnpm run eval:cohort slot-table` stays green.
- Graph first: `find_symbol` → `impact_analysis` on `PRODUCT_TABLES`,
  `queueSortForColumnKey`, `AssistantDock`.

**P0.3 · Rule the dock.** One field, docked bottom, never unmounted (R2). The
circle becomes the *thread* latch; it does not own a second field. On a
station the station mouth **is** the dock. Decide it, write it into LAWS, and
tell the two in-flight sessions before either commits.
- Gate: `useStationComposerStationCount() + desk mouths === 1` on every route;
  dock `y` unchanged after expanding every collapsible (the HANDOFF's own
  test).

### P1 — the shipping desk becomes composer + viewport *(weeks 2–3)*

**P1.1 · Selection is context.** A highlighted viewport row writes
`AssistantPageContext.selection`; "why is this one late?" arrives with the
ref. Binding only. The mouse plane of this (Shift-hold reticle, pick count,
hold list, Ctrl wheel, context capture) is specified in §7 and slices as
P1.1a / P1.1b / P1.5 / P2.3.
**P1.2 · GREEN read tools** the dump asks for: pending desk read (registry
O1), FBA plan, staff availability / assignment rules. Wrap existing modules;
no new queries where a table already answers.
**P1.3 · First YELLOW kinds:** `work_assignment.assign` / `reassign` /
`priority` and `order.link_tracking`. Reuse `applyAgentMutation`; class
`review`; widen on measured acceptance (T28).
**P1.4 · Files on the mouth.** Drag-drop a label / packing slip onto the
composer → `order.attach_document` (YELLOW). Kills the paperwork form.
- Gate: an operator does a day of To-ship from the composer with no other
  page. Count the times they had to leave. Zero is the target; each leave is a
  missing tool, logged.

### P2 — the floor and the phone *(weeks 4–6)*

**P2.1 · Voice exceptions on stations** — no new component; the companion
loop plus the station mouth. Gate: exceptions per shift handled without
leaving the bench; scan throughput not down.
**P2.2 · Ops on the phone** = composer tools over what exists:
`recommend_template`, `install_template` (always a draft — human publishes),
`station_definition.update` (YELLOW). The phone UI is the same mouth plus
`emit_tile` for the definition. Gate: an owner installs the packing SOP from a
phone; a draft appears; publish stays a human click.

### P3 — demand-gated

- **Community template catalog.** Submit / review / public visibility already
  exist. Build the public UX only when a second tenant asks for a third
  tenant's template.
- **Spatial home board.** Only after `emit_tile`; then tiles on the canvas are
  the board.
- **Desk microphone, raw HID, local model.** The native track (T30) — separate
  plan, separate owner.

---

## 4 · First thing to implement, first thing to validate

**Superseded by §8 (third dump, same day).** First thing to implement is
now **P0.2a — paste a screenshot or a CSV onto the mouth and stage it**,
because the ingest path is the ruled Floor #1 (CYC-82) and its viewport
already exists. `emit_table` moves to P1.

*Original text, kept for the record:* Implement `emit_table` (P0.2). It
unlocks #7, #9, #4 and half of #5. It is one client UI tool and a fixture.

**Validate:** the companion voice loop (P0.1). It is the selling point in the
dump ("talk to it from your phone and get anything done"), it is already
built, and a ten-utterance test on a real bench is an afternoon. If it fails
the gate, the fix is in `useVoiceDictation` / transcribe, not in architecture.

Run them in parallel. They share no files.

---

## 5 · Questions only the operator can answer — do not invent

| # | Question | Blocks |
|---|---|---|
| Q1 | Does the floating circle survive P0.3, or does the docked field replace it everywhere? | P0.3 |
| Q2 | Is "fall back to staff Y when X is not scheduled" a rule that exists today anywhere (sheet, head, code)? If not, it is a new domain rule, not an AI feature. | P1.2 |
| Q3 | The RED confirm card (send, money, delete, customer contact) has no design. Which one confirms — the mouth's `WeldedFeedbackPanel` reaction, or a viewport tile? | P1.3, #8 |
| Q4 | Who owns the composer seam this week: the companion lane, the Ask-stage lane, or this plan? | P0 |

---

## 6 · Session overlap — read before editing

Uncommitted in the working tree from concurrent sessions (2026-09-03):
`AssistantDock`, `AssistantProvider`, `useAssistantChat`, `ComposerAskStage`,
`DeskComposerAskLane`, `StationComposerHost`, `ComposerModeRow`,
`GlobalHeaderActions` (Sparkles button deleted, phone button added),
`MobileCompanionComposer`, `/m/companion`. This plan adds **no code**. Whoever
picks up P0.2 coordinates with the companion lane first, as the registry
already instructs.

---

## 7 · Second dump (2026-09-03, later): the inline selection layer

> Hold a key, the thing under the cursor gets an outline and becomes context.
> Click the outline: a list of verbs (Ask · Move · Link · Delete). Walk it
> with WASD. Or hold Ctrl and the verbs bloom around the pointer as a wheel:
> move up-right = one verb, right = another. The cursor counts "1 selected,
> 2 selected" as you shift-click rows or photos. A screenshot chord drags a
> marquee, and the capture is bound to the data under it and lands on the
> composer. Think Miro / Figma creation bubbles, or the DevTools inspector,
> built into every component.

### 7.1 · How to describe it, and what it is most similar to

**One sentence:** *a quasimodal, cursor-anchored command layer — hold a
modifier and whatever is under the pointer becomes selected context, drawn
with an outline and counted on the cursor; act on it where it sits, by list
or by direction, and every verb lands in the one composer.*

Working name: **the Reticle.** The outline is the reticle; the list, the
wheel and the capture are three things you can do while it is armed.

| Piece of the dump | Prior art (the real name) | Why it is the right cousin |
|---|---|---|
| Hold Shift → the layer is live only while held | **Quasimode** (Raskin, *The Humane Interface*, 2000) — Photoshop's spacebar hand, Figma's Alt-measure | A held mode cannot be forgotten. Release and you are out. No sticky "selection mode" the operator has to remember to leave. |
| Hold Ctrl → verbs by direction | **Pie / marking menu** (Hopkins 1988; Kurtenbach & Buxton, Maya) — Blender pie menus, GTA weapon wheel | Direction is remembered by the hand. After ~20 uses the gesture is performed without looking ("mark-ahead"). This is *language is the on-ramp, the keybind is the destination* for the mouse: the list teaches, the wheel is the destination. |
| Outline + label on the thing under the cursor | **DevTools inspect overlay** | Names what is under the pointer without the pointer leaving it. |
| "2 selected" riding the cursor | **Figma / Miro cursor labels and cursor chat** | The repo already has the seat: the `useCursorLabel` chip on `MorphCursorLayer`. |
| Wheel on empty canvas | **Miro / Figma creation bubbles** | Same wheel, "create" verbs instead of "act on" verbs. |
| WASD through a held list | **Comms wheel / hold-to-browse radial** (Overwatch, Apex) | Held key + relative navigation; commit on release or on a key. |
| Drag-a-marquee capture bound to data | macOS ⌘⇧4, but **semantic**: the payload is the refs under the marquee, the PNG is for the human | "A screenshot built into the data itself" is exactly this: capture *refs*, attach pixels. |

### 7.2 · What already exists — do not rebuild

| You will want | It already is |
|---|---|
| One desk cursor layer, staff colour, gated `(pointer: fine)` ∧ ¬reduced-motion | `MorphCursorLayer` in `WarehouseShell` (`PLAN-morph-cursor-reliability.md`, LIVE). Invariant 1: **one layer, app-wide** — a second mount is two cursors. |
| The cursor wearing an element's box | `cursorMorphTarget()` → `data-cursor="morph"`, spring `motionRole.cursor.morph`. Today only scrub tracks opt in. **This is the reticle mechanic, already shipped.** |
| A label chip riding the pointer | `useCursorLabel` / `data-cursor-label` — one black chip below-right, flips at edges. **This is the "2 selected" seat.** |
| A verb list anchored beside a row, no confirm step, a hotkey glyph per verb | `MorphingRowActionMenu` (CYC-82): `left-start` against the ROW, outside the table; `morphingHotkeyForIndex`. **This is the Shift list, already ruled on placement.** |
| Shift-click multi-select on photos | `PhotoCard` `onSelect({ shift })`; `PhotoContextMenu` cursor-anchored right-click |
| "Point at this record" from the model side | `highlight` UI tool → handler in `useAssistantChat`; `AssistantPageContext.selection`; `PageContextSection` paints it |
| Counting numbers that animate | `AnimateNumber` from Motion+, already wrapped in `design-system/motion/plus.ts` |
| Motion stack | `motion` 12.x + `motion-plus` 2.x, roles in `design-system/motion/roles.ts` (`cursor.follow` = duration 0, `cursor.morph` = travelling-marker spring) |
| Chord safety | `wedgeReachability()` in `keybindings/registry.ts`; T20 (bare keys never bound) |

### 7.3 · Two fights

**A · Shift and WASD are scanner keys.** A wedge scanner types capitals *with
Shift held*, and W/A/S/D are bare keys. On any surface with an armed scan
session, Shift-hold + WASD is a barcode trap (I3, T20). Ruling proposed:

- The Reticle is **desk-plane only**, gated exactly like the cursor layer it
  lives in: `(pointer: fine)`, not reduced-motion, **and no armed scan
  session**. On a station it never mounts. A gloved touchscreen pays nothing.
- **Arm threshold 150 ms.** A wedge holds Shift for one keystroke (< 50 ms);
  a human holding Shift for a beat is unmistakable. Below the threshold Shift
  is just Shift.
- WASD walk the list **only while Shift is held**; arrow keys always work.
- Ctrl is wedge-unreachable, so the wheel is safe by construction — still
  desk-only, because it needs a pointer.

**B · M1 bans geometry animation, and a reticle that glides and a wheel that
blooms are geometry.** But the shipped `MorphCursorLayer` already springs the
cursor's box (`cursorMorph`), and it was allowed for a reason that
generalises: **a pointer-glued overlay occupies no layout and moves no
neighbour.** Proposed amendment, filed by name as RESKIN.md requires:

> **M6 (proposed)** — A pointer-glued overlay (cursor, reticle, wheel) may
> animate `transform`, because it is not content, occupies no layout, and
> moves no neighbour. Content never does. Reduced motion → hard cut.

The reticle is painted **in the cursor layer**, as an outline over the
target's rect — never on the element. Items do not re-render when picked.
`layoutId` stays banned; one element with springs is cheaper anyway.

### 7.4 · Mechanics (buildable spec)

1. **Reticle.** Shift held ≥ 150 ms → the nearest ancestor of the pointer
   target with a `data-ref` (the same canonical ref string the `highlight`
   tool takes) gets a 2 px staff-colour outline drawn by the cursor layer over
   its bounding rect. Cursor chip reads the kind and name ("photo ·
   IMG_2231", "order 04-1234"). Rect re-measured on scroll / resize.
2. **Pick.** Click while held toggles the ref in the selection set. Chip
   counts via `AnimateNumber` ("2 selected"). The set is written to
   `AssistantPageContext.selection` — this **is** P1.1, the mouse plane of
   "selection is context". Esc, or release without a pick, clears.
3. **Hold list (Shift).** Click the reticle, or Space → verb list anchored
   outside the item (`left-start` for rows like `MorphingRowActionMenu`,
   below for photos). Verbs = **the registered tool list filtered by the
   selection's kind** — the same closed vocabulary the model composes (§0).
   "Ask about this" is always first and seeds the composer with the refs.
   W/S or ↑/↓ walk, D/Enter commit, A/Esc back. Hotkey glyph per verb.
4. **Wheel (Ctrl).** Press → up to 8 sectors bloom around the pointer
   (opacity + scale, one overlay). Pointer angle selects the sector; release
   commits; release inside the dead zone cancels. **Sectors are fixed per
   kind** so "up-right = Move to PO" becomes muscle memory. Same verbs as the
   list: the list is the discoverable form, the wheel is the fast form.
5. **Context capture (Ctrl+Shift+4).** Drag a marquee. Payload = every
   `data-ref` whose box intersects the marquee (the data); attachment = a PNG
   of the region (for the human). Native: `webContents.capturePage(rect)`
   through a scoped preload capability (T30 — never blanket access). Browser
   fallback: refs only, no pixels. Lands on the composer as an attachment with
   the refs in context; "do X to these" then tool-calls against exact refs.
6. **Every verb is a tool.** Ask = GREEN, seeds the mouth. Move photo to PO,
   link, re-assign = YELLOW `propose_mutation`, trust class decides. Delete =
   the `MorphingRowActionMenu` rule (same row re-labels, second press), and
   anything RED confirms in the mouth (Q3). No new write path.

### 7.5 · How to use motion.dev for it

- **Extend the one layer.** Add a `ReticleLayer` surface *inside*
  `MorphCursorLayer`, sharing its springs. Do not mount a second cursor
  system (reliability invariant 1). Do not adopt Motion+ `<Cursor />` — the
  repo deliberately re-implemented its hide sheet as `useHideOsCursor` so the
  desk has one cursor.
- **Reticle:** `useSpring` on x / y / width / height driven by the hovered
  `[data-ref]` rect, transition `motionRole.cursor.morph`. One `motion.div`,
  `outline` not `border` (M3), `pointer-events: none`.
- **Count chip:** `AnimateNumber` (already exported from `plus.ts`) inside
  the existing `useCursorLabel` chip.
- **Wheel:** `AnimatePresence` + one `motion.div` (opacity, scale 0.94 → 1,
  80–160 ms). Pointer angle → `useMotionValue` → `useTransform` → the active
  sector index → `data-active` on the sector — no per-sector React
  re-render while the pointer moves.
- **Hold list:** reuse `MorphingRowActionMenu`'s Popover anchoring and
  `AnimatePresence`; do not fork a second menu primitive.
- **Never `layoutId`.** M1 names it, and the reticle does not need it.
- Motion docs surfaced four Motion+ examples that are close cousins (Create
  Button, Family-style dialog, Modal shared layout, Typewriter); their source
  needs the Motion+ MCP server signed in — it is configured here but not
  authorised in this session.

### 7.6 · Where it slots in the ranked plan

This is the **mouse plane of P1.1** and the highest-leverage desk feature in
both dumps: it makes "selection is context" visible, and it makes every
viewport row act-able **without a new component per table**.

| Slice | Scope | Gate |
|---|---|---|
| **P1.1a** | Reticle + pick + "Ask about this" on the photo library and the orders table | Shift-pick 3 photos, ask "which PO are these from?" — the model receives 3 refs (assert on the context store). Zero re-renders of `PhotoCard` on pick. |
| **P1.1b** | Hold list = registered verbs by kind, reusing `MorphingRowActionMenu` | Every verb resolves to a tool name that exists in `tools/index.ts`. |
| **P1.5** | Wheel, after the list has proven the verb set | 20 reps on one verb: time-to-commit on the wheel beats the list by rep 10. |
| **P2.3** | Context capture — native path under T30 | Marquee over 4 rows → 4 refs in context; PNG attached in the desktop build only. |

### 7.7 · New questions for the operator

| # | Question | Blocks |
|---|---|---|
| Q5 | Desks still have scan-capable find fields (`find-field-scan`). Is the 150 ms arm threshold enough, or must the Reticle also disarm while any text field has focus? | P1.1a |
| Q6 | M6 amendment: accept "pointer-glued overlays may animate transform" as the one geometry exception, or keep M1 absolute and make the reticle a hard cut? | P1.1a |
| Q7 | Fixed wheel sectors per kind are the whole point (muscle memory). Who owns the sector map — the registry (code) or the staffer (prefs)? Registry is recommended: U1 says arrangement is free but *meaning* is locked. | P1.5 |

---

## 8 · Third dump (2026-09-03, later): ingest without a connection — and the re-rank

> Take a screenshot of the orders page on Amazon or eBay, or paste a CSV, and
> the system ingests it. No integration, no marketplace login. It shows
> exactly what is missing (an item number), you tell the AI the item number,
> it resolves the row and imports the order. Then, with the AI, set the
> item-number → picker / packer pairings, assignments and workflow rules.

### 8.1 · Verdict: yes, this is the highest ROI, and it outranks §3 P0.2

Three reasons, in order of weight:

1. **It is already the ruled Floor #1.** The One AI Composer note and
   `PROPOSE-composer-action-registry-om.md` both say: *CYC-82 Order
   Management ingest → one pending desk. One module to 100% before the
   next.* This dump is CYC-82 in the operator's own words.
2. **It is the onboarding wedge.** Zero integration and zero marketplace
   login means any prospect can put real orders into the product in the
   first five minutes. Nothing else in the three dumps shortens
   time-to-value that much.
3. **Most of the pipeline exists**, and the piece that does not is the
   piece that proves the thesis: the *conversation* over a caged row.

It also demotes `emit_table`: the viewport for this slice **already
exists** (the `orders-import` staging grid in `CsvImportStagingHost`).
`emit_table` returns in P1, the moment a question leaves the staging table.
The companion voice validation (P0.1) still runs in parallel — no shared
files.

### 8.2 · What exists — checked 2026-09-03

| You will want | It already is | State |
|---|---|---|
| Screenshot → structured order | `src/lib/inbound/extract-po-llm.ts` + `POST /api/receiving/inbound/extract-po`: multimodal (image and/or pasted text), forced tool call, emits platform · order id · line items with qty · tracking; multi-image = pages of one order; *never invents values*. Built for the **Incoming** (inbound purchase) desk. | **EXISTS** — points at the wrong desk |
| CSV → orders for any tenant | `POST /api/orders/import-csv` (client parses, posts rows + mapping) → `CanonicalOrderLine[]` → `ingestCanonicalOrders`. Backfills on re-upload, never overwrites an operator's correction. | EXISTS |
| AI header binding | `POST /api/orders/import/suggest-mapping` — proposes canonical-field mappings the alias map did not claim; operator confirms; nothing writes. | EXISTS |
| Staging before the write | `CsvImportStagingHost` over `orders-import.staging`: Ready / Action-required facet, row fix and column mapping on the right rail, one Confirm. | EXISTS |
| Rows missing an item number | `order_import_exceptions` + `resolveImportException(orgId, { id, itemNumber })` — re-runs the **exact** import path with the value filled in; never hand-builds an order. `ignoreImportException`, `listOpenImportExceptions`. | EXISTS (non-AI) |
| "What was imported today" | `GET /api/orders/imports` (`import-history.ts`). *Registry row I2 says MISSING — it is stale.* | EXISTS |
| One writer | `ingestCanonicalOrders` — shipment links, catalog identity, customer match, duplicate collapse, deadline assignment row, cache bust, realtime publish. | EXISTS |
| Assignments | `work_assignments` (`assigneeStaffId`, `priority`, `deadlineAt`), `get_assignments` read, `apply-listing-assignment.ts`, `staff-availability-rules.ts` | PARTIAL — no AI write |
| No marketplace connection needed | The CSV and screenshot paths touch no `organization_integrations` row. | by construction |
| "Without any login" | `POST /api/auth/signup` — self-serve org + first admin + PIN, 14-day trial, public. | EXISTS (a Cycle Forge sign-in; see 8.4) |
| Paste on the mouth | **Zero** `paste` / `clipboardData` handling anywhere in `src/` (HANDOFF-ai-first §2, still true). | MISSING |
| AI tools over the exception queue | none — registry I6 | MISSING |
| `order.*` / `work_assignment.*` mutation kinds | none — registry §1 note | MISSING |

### 8.3 · Revised P0 — "ingest without a connection"

Replaces §3 P0.2. P0.1 (companion validation) and P0.3 (rule the dock)
stand.

**P0.2a · Paste anything onto the mouth.** One `paste` listener on the
composer (the HANDOFF §2 listener, stamped `source: 'paste'`). CSV text →
the existing browser parse → `suggest-mapping` → staging. Image on the
clipboard, or a dropped PNG → `extract-po-llm` **re-targeted to emit
`CanonicalOrderLine[]`** → the same staging. One draft shape, two intakes,
zero new tables.
- Gate: 10 real captures (Amazon Seller Central orders list, eBay Seller
  Hub orders, one phone photo of a screen) → rows staged. ≥ 8/10 carry the
  correct order id, quantity and title. **Zero invented item numbers** — a
  missing one must cage, never guess.

**P0.2b · The caged row becomes a conversation.** Two tools: GREEN
`list_open_import_exceptions`, YELLOW `import_exception.resolve` wrapping
`resolveImportException` (class `review` first; widen on acceptance). The
model says *"row 4, order 112-…, has no item number — what is it?"*, the
operator answers in the mouth (or by voice from the phone), the tool
re-runs the real import.
- Gate: 5 caged rows resolved by chat with zero hand edits on the grid;
  every resolve visible under `get_mutation_history` with
  `actor_kind: 'agent'` (T13).

**P0.2c · Confirm → To-ship, and the pending desk read.** Confirm stays a
human press on the staging host (I4 names the destination: "Accept 96 into
the intake record"). Add the GREEN pending-desk read (registry O1: stage ·
owner · exception per row) so the next question — "what do I ship first?" —
has a tool.
- Gate: pasted orders are on To-ship, and `GET /api/orders/imports` shows
  them under today.

**P0.2d · Pairings and rules by chat.** YELLOW kinds
`work_assignment.assign` / `reassign` / `priority` (registry O2) over the
existing chokepoint, plus a GREEN read over `staff-availability-rules`.
"Tuan packs everything from eBay, Thuy packs Amazon" resolves to assignment
writes the operator approves once and the model earns.
- Gate: one day's imported orders assigned by chat; acceptance rate
  recorded (it is the input to the trust class).
- **Q2 still holds:** "fall back to Y when X is not scheduled" is not a
  modelled rule anywhere. It is a domain rule to design, not an AI feature.

**Moves to P1:** `emit_table` (first question that leaves the staging
grid), `order.attach_document`, the Reticle (§7).

### 8.4 · One reading to settle

"Without any login" is read as **no marketplace login and no integration**.
A Cycle Forge sign-in stays: every writer takes `orgId` from
`ctx.organizationId`, and tenant isolation is the thing a second customer
is paying for. The existing self-serve signup is a company name, a name, an
email and a PIN — that is the whole gate.

If the intent was a **public paste-and-see demo** with no account at all,
that is a separate, cheap P1 item: the extractor is pure and GREEN, so a
landing page can parse a screenshot into a preview table and write nothing.
It is marketing, not ingest, and it should not be confused with the write
path.

### 8.5 · Order of work, restated

```
P0.1 companion voice — validate on a bench          (parallel, no shared files)
P0.2a paste → staging (CSV + screenshot)            ─┐
P0.2b caged row → conversation → resolve             ├─ CYC-82 to 100%
P0.2c confirm → To-ship, pending-desk read           │
P0.2d assignments + rules by chat                   ─┘
P0.3 rule the dock                                  (a ruling, not a build)
P1   emit_table · files on the mouth · the Reticle
```

### 8.6 · P0.2a status — BUILT 2026-09-04, gate open

| Piece | Where | State |
|---|---|---|
| Paste classifier + capture → staging rows (pure) | `src/lib/orders/import/paste-intake.ts` | built, 12 unit tests green |
| Orders-list extractor (multi-order, never invents) | `src/lib/orders/import/extract-orders-llm.ts` | built, 6 unit tests on the shaper |
| `POST /api/orders/import/extract-capture` | `orders.import`, rate-limited, org from ctx | built, in the security manifest |
| Document-level paste / drop listener | `src/hooks/useOrderPasteIntake.ts` | built; scope = the mouth or the bare desk, never another field |
| Desk mount | `OrderPasteIntake` in `OutboundOrdersDesk` beside the CSV picker | built |

**Verified in a real browser (Chromium via the repo's Playwright, signed in
as staff 1):** paste a 2-row CSV on `/shipping/orders` → `?import=csv`,
"Pasted CSV · 2 rows", both order ids on the grid, Confirm 2 ready. Screenshot
in the session scratchpad.

**Not yet verified — the P0.2a gate (10 real captures) is open:** the image
path ran end to end to the provider boundary and every provider timed out
(`platform: TimeoutError`, ~11 s). The existing Incoming extractor
(`/api/receiving/inbound/extract-po`) fails identically on this box, so the
chat provider behind `AI_CHAT_BASE_URL` is down, not the route. Re-run
`capture-smoke` once the provider answers, then the ten real captures.

**Deliberately left for later:** a `paste` value in `TableImportOrigin`
(today the draft says "Pasted CSV" / "Screenshot · N orders" in `fileName`);
feedback on the mouth's `reaction` slot instead of the toast rail (blocked on
P0.3, the dock ruling); paste on desks other than To-ship.
