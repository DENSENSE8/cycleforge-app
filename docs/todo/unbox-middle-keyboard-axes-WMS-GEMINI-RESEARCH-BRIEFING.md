# Gemini Deep Research brief — Unbox middle keyboard axes (←/→ steps · ↑/↓ lines)

**Paste everything below the line into Gemini Pro deep research.** It is self-contained;
the researcher has **no access to this repo** — treat every path, constant, and behaviour
below as **embedded facts**, not things to invent or “look up” in our tree.

**Deliverable:** a decision brief we can execute as a keyboard SoT + ownership rules
(not an essay). Format is specified at the end.

**Companion briefs (context only — do not re-open parked work):**

| Doc | Relation |
|---|---|
| `docs/todo/unbox-input-locus-inversion-GEMINI-RESEARCH-BRIEFING.md` | Established: bottom dock = command locus; middle = ledger/display |
| `docs/todo/unbox-bottom-dock-procedure-FINISH-HANDOFF.md` | Shell + dock procedure walk (Serial→Condition→Photos) |
| `docs/todo/unbox-dock-roi_*.plan` / Unbox dock finish (2026-08-07) | Condition stamp + multi-qty cue honesty landed |

**Date:** 2026-08-07  
**From:** Cycle Forge engineering  
**Subject:** Industry-standard **keyboard / RF grammar** for a desktop scan-station
receiving bench with **two orthogonal axes** — procedure steps (horizontal) and
carton contents / line selection (vertical) — while a wedge scanner owns the
primary input field.

---

## Who is asking

I own the **Unbox scan station** of **Cycle Forge**, a multi-tenant SaaS for
used-goods reseller operations (receiving → testing → listing → fulfillment).
Operators work on warehouse benches (typically **1080p / 1440p** desktop monitors,
**USB wedge barcode scanners**, mouse optional, dense Kinetic Ledger UI). USAV is
the dogfood tenant only — design for a **sellable** multi-tenant product.

Product identity: **Kinetic Ledger** — dense, scan-aware, act-and-clear Station
region. Hands hold product + scanner; the keyboard is for **navigation between
jobs**, not for typing serials (serials come from the wedge into a focused field).

---

## The problem, stated plainly

On Unbox with a carton open, the operator has **three navigable dimensions** that
today compete for the same physical arrow keys:

| Axis | What it means | Current binding (ground truth) |
|---|---|---|
| **A — Procedure steps** | Carton capture walk: arrival → carton photos → contents → **serial → condition → item photos** → label | **← / →** already pages previous / next step via `useUnboxProcedureArrowKeys` (window listener; skips text fields; mirrors under-dock pager) |
| **B — Lines inside the carton** | Select which PO line / SKU is active (sibling lines on one receipt) | Mouse / meta click on ledger; **`sibling` cursor scope exists in the record-cursor SoT but is not the ambient ↑/↓ owner while middle is open** |
| **C — Cartons in the queue** | Previous / next carton in the station list | Chrome buttons `ScanStationCartonCursor` (↑ = prev, ↓ = next); ambient **↑ / ↓ / j / k** drive `useRecordCursorKeyboard` with `scope: 'record'` while the receiving table publishes |

**Proposed grammar (working lean — overturn with industry evidence):**

> While the **Unbox middle work surface is selected / open** (carton open, centre
> ledger + bottom Action Dock visible):
>
> - **← / →** = previous / next **procedure step** (positional; same as pager)
> - **↑ / ↓** = previous / next **PO line** on this carton (`sibling` scope)
> - **Carton** next/prev stays on **chrome buttons** (and/or only when middle is
>   closed / table owns focus) — do **not** let ambient ↑/↓ hop cartons while
>   the operator is inside a carton walk

We need **WMS / RF / industrial HMI validation**: is this two-axis split
industry-standard for receiving/putaway/QC benches, or do professional systems
use a different key map (function keys, Tab-only, RF soft keys, voice, etc.)?

---

## Current house state (ground truth — do not contradict)

### Unbox golden composition (2026-08-07)

```text
Identity (carton context sticky)
└─ Centre ledger: POUnboxingSection (dockOwnsCapture) + UnboxLabelPreview
   · PO meta = condition · serial LEDGER (click → focusStep into dock)
   · No under-row ActiveLineConditionSerial editor
└─ Bottom UnboxDockHost (command)
   · Leading: UNBOX_STEP_DOCK_CONTROLS[activeKey]
   · Notes toggle · Print · Receive
   · Under-dock: UnboxProcedurePager (label · ‹ ›) | progress ring
└─ Displays push column (Pairing · Photos · Ticket · …) — reference, not centre
```

Centre `ProcedureDeck` is **parked**. Capture order SoT for item trio:
**Serial → Condition → Photos** (`FOUND_CAPTURE` / `RETURN_CAPTURE`).

### Keyboard / focus plumbing already shipped

| Mechanism | Behaviour |
|---|---|
| `useUnboxProcedureArrowKeys` | ←/→ → `focusStep(prev\|nextNeighbour)`; bail if typing target; then `receiving-focus-scan` |
| `UnboxProcedurePager` | Same positional neighbours as ←/→ / checklist |
| `useRecordCursorKeyboard` | Capture-phase window: ↑↓/jk step publisher; Escape closes; yields to overlays + `list-key-scope` |
| `CursorScope` | `'record'` = cartons in queue; `'sibling'` = lines inside open carton — **two scopes by design** |
| `list-key-scope` | `data-list-key-owner` (focus-within) + `data-list-key-region-open` (Displays open) — ambient list keys stand down |
| Dock serial surface | Owns wedge focus when serial step active; notes close returns focus via `receiving-focus-scan` |
| Text entry bail | INPUT / TEXTAREA / SELECT / contenteditable never steal arrows for nav |

### Explicit non-goals (do not recommend)

- Remounting centre `ProcedureDeck` / `UnboxItemsPanel`
- Dual live serial inputs (centre + dock)
- Modal wizards that gate the scan loop
- Making ↑/↓ mean **units on a multi-qty line** as the *primary* ambient axis
  (nested unit rows may use **focus-local** roving tabindex later — Phase 3)
- Phase 3 true per-unit Serial→Condition→Photos×N loop
- Voice-directed picking as a required dependency
- Handheld RF gun as the only target device (we are **desktop wedge + monitor** first;
  RF/tablet may be a secondary matrix row)

### Operator constraints (must keep in mind)

- **Wedge scanners** type into whatever has focus + usually send Enter.
- Hands are often **not on the mouse**; keyboard nav must work with dirty/gloved
  hands and without looking away from the product for long.
- Wrong ambient ↑/↓ that hops **cartons** mid-walk is a **data-integrity hazard**
  (operator grades the wrong receipt).
- Wrong ←/→ that advances a **procedure step** while typing in notes is a hazard —
  already mitigated by text-target bail; keep that invariant.
- Multi-qty Phase 2: fill **all serials** (or waive), then **one** line-level
  condition + item photos — cues say “Once for line”, not per-unit trio.

---

## Research questions (answer all)

### A. Industry keyboard / RF grammar for receiving benches

Catalog how **named** WMS / warehouse systems bind navigation on a
**desktop or vehicle-mount workstation** (not only handheld RF):

| Product / framework (examples — expand with primary docs) | How do operators move between **steps** of a guided task? | How do they move between **lines** on an open ASN/receipt/carton? | How do they move to the **next carton / LPN**? |
|---|---|---|---|
| SAP EWM RF / ITS Mobile | ? | ? | ? |
| Manhattan Active WM / SCALE | ? | ? | ? |
| Blue Yonder (JDA) WMS | ? | ? | ? |
| Oracle WMS Cloud RF | ? | ? | ? |
| HighJump / Körber | ? | ? | ? |
| Softeon / Made4net / similar mid-market | ? | ? | ? |
| Zebra / Honeywell Wedge + DataWedge profiles | What do OEMs recommend for arrow keys vs F-keys? | | |
| Voice (Vocollect / Lydia) — only for contrast | Confirm voice uses **confirm / skip / next line** verbs, not arrows | | |

For each, cite **primary documentation** (RF menu trees, key maps, “directed work”
guides). Separate **documented spec** from **shop-floor folklore**.

**Specific ask:** Does industry treat **task step** and **line within task** as
**orthogonal axes** (different keys), or as **one stack** (Enter = next step,
arrows only for lists)?

### B. Arrow-key orthography — validate or overturn our lean

Evaluate these candidate maps against industry + human factors (ISO 9241-110,
ANSI/HFES workstation guidance, NN/g scanner UX if any, Fitts for glance cost):

| Map ID | ← / → | ↑ / ↓ | Carton change | Verdict needed |
|---|---|---|---|---|
| **M1 (our lean)** | Procedure step | Sibling PO line | Chrome only / table owns when middle closed | Keep / modify / reject |
| **M2** | Procedure step | Carton | Lines via Tab / click only | |
| **M3** | Line (horizontal rare) | Procedure step | Modifier+↑↓ or F-keys | |
| **M4** | Unused (F7/F8 or soft keys for steps) | Lines | F9/F10 or chrome for carton | Classic RF soft-key style |
| **M5** | Step | Unit on multi-qty line | Carton on Shift+↑↓ | Nested-unit first |

For **M1**, call out failure modes:

1. Operator expects ↑/↓ = next carton (chrome teaches that glyph) but ambient
   keys move lines → confusion.
2. Displays open: index list also wants ↑/↓ — we already have
   `LIST_KEY_REGION_OPEN_ATTR`; is that enough?
3. Single-line carton: ↑/↓ becomes a no-op — is that honest or dead?
4. Procedure on actionless step (`arrival_check`): ←/→ still pages; leading dock
   empty — industry OK?

### C. “Middle selected” ownership — when do ambient keys apply?

We need a **scope model**, not just a key map. Critique:

1. **Region-open** (carton open ⇒ middle grammar) vs **focus-within** middle DOM
   vs **explicit arm** (press a key to “grab” the middle).
2. How do industrial HMIs resolve **competing global keyboards** (queue + task +
   detail pane)? Name patterns (modal RF screens, “locked” task sessions,
   soft-key ownership).
3. Should opening **Displays** fully suspend middle ↑/↓ (current lean via
   list-key region), or only when focus is inside the Displays list?
4. After ←/→ step change we re-focus the scan field (`receiving-focus-scan`).
   Is **always return focus to the scan/dock field** industry-standard after
   nav, or does focus stay on the list?

### D. Wedge-scanner interaction with arrow navigation

1. Do wedge devices ever emit arrow keycodes / prefix characters that would
   false-trigger nav? (DataWedge keystroke output, Honeywell suffix config.)
2. Should nav keys be **disabled while a scan burst is in flight** (inter-key
   timing), or is “bail if focus in INPUT” sufficient?
3. Enter = submit scan vs Enter = advance step — industry resolution when both
   exist on one bench.

### E. Accessibility + density

1. WCAG / 2.2 keyboard operable: is a window-level arrow listener acceptable if
   focus is in a non-widget “canvas,” or must middle expose a **roving tabindex
   listbox** for lines + a **toolbar** for steps?
2. Screen-reader announcement: step change vs line change — what do RF UIs
   announce (or beep)?
3. Minimum discoverability: under-dock pager already shows ‹ ›; do we need a
   one-line key legend, or is that noise on a scan floor?

### F. Implementation recommendation for Cycle Forge

Given our SoT modules (embedded names — do not invent new twins):

| Module | Role today |
|---|---|
| `useUnboxProcedureArrowKeys` | ←/→ procedure |
| `useRecordCursorKeyboard` + `CursorScope` | ↑/↓ ambient; `record` vs `sibling` |
| `list-key-scope` | Yield rules for Displays / focused lists |
| `ScanStationCartonCursor` | Visible carton ↑/↓ chrome |
| `dispatchSelectLine` / sibling publishers | Line selection bus |
| `receiving-focus-scan` | Hand-back to dock/scan |

Recommend the **smallest durable change**:

- Wire ↑/↓ to `sibling` while middle open + demote `record` ambient — yes/no?
- Stamp a `data-station-middle-key-region` (or reuse list-key attrs) — yes/no?
- Keep carton chrome buttons only — yes/no?
- Focus-local unit-row arrows later — defer?
- Guard tests that pin the map (like `unbox-right-edge-chrome` pins ↑=prev carton
  on chrome) — what exact assertions?

Call out anything that would **break** wedge focus, Print/Receive, or the
dock-owns-capture SoT.

---

## Constraints the answer must respect

- Compose from named SoT; never fork a second procedure pointer or second line
  selection bus.
- Dock = command; middle = ledger; Displays = reference.
- Never dual live serial inputs.
- Never raise DS/knip baselines to “pass.”
- Scale: small multi-tenant reseller warehouse — **not** a 3PL with a WES and a
  gun per door. If a recommendation requires RF soft-key hardware or voice
  infrastructure, label it **aspirational** and give a desktop-wedge fallback.
- Answers must be **executable**: key map table + ownership predicates + which
  module owns them.

---

## Deliverable format (strict)

Return markdown with these sections only:

1. **Verdict** (≤10 lines) — adopt / modify / reject **M1**; one sentence on
   carton-key ownership while middle is open.
2. **Industry catalog** — table of named WMS/RF systems × (step nav · line nav ·
   carton nav) with citations.
3. **Recommended key map** — final ←→ / ↑↓ / carton / Enter / Escape matrix for
   Cycle Forge Unbox middle, including “while Displays open” and “while typing.”
4. **Ownership predicates** — boolean rules an engineer can implement
   (`middleOpen && !isListKeyRegionOpen() && !isTypingTarget` …).
5. **Failure modes** — ranked hazards (wrong carton, swallowed scan, SR
   confusion) + mitigations.
6. **Implementation delta** — concrete changes to the named modules above (or
   “document only”); include guard-test bullets.
7. **Breakpoint / device matrix** — desktop wedge · tablet kiosk · handheld RF
   (RF may be “out of scope / stack”).
8. **Citations** — primary links (vendor docs, ISO/HFES, OEM wedge guides).
9. **Open risks** — what we must still measure on a real bench with a live
   wedge (list the stopwatch / confusion tests).

Do **not** propose a visual redesign of Unbox.  
Do **not** remount `ProcedureDeck`.  
Do **not** invent a third serial input.  
Do **not** recommend persistent looping animations for selection feedback.  
Do **not** collapse `record` and `sibling` into one cursor scope.

---

## Optional appendix — exact behaviours to preserve

```text
← / → (today):
  if key in {ArrowLeft, ArrowRight}
  && !meta/ctrl/alt
  && !isTextEntryTarget
  && procedure.settled
  → focusStep(prevStep | nextNeighbour)
  → defer receiving-focus-scan 60ms

↑ / ↓ chrome carton (today, buttons):
  ChevronUp → onPrevCarton   (label "Previous carton")
  ChevronDown → onNextCarton (label "Next carton")
  Same glyph→direction as DeskRailChromeRow (never invert)

Ambient record cursor (today, when table publishes scope:record):
  ArrowDown | KeyJ → next carton
  ArrowUp   | KeyK → prev carton
  Yields: overlay open | focusWithinListKeyOwner | isListKeyRegionOpen

Multi-qty Phase 2 cue (today):
  serial summary "n of N" (serials + waived)
  condition / item_photos "Once for line" until stamped
```

If industry says ambient ↑/↓ must remain carton-step while a receipt is open,
say so explicitly and propose how **line** selection gets an equally fast path
without the mouse (Tab? `[` / `]`? `Alt+↑↓`?).

---

# Claude Code handoff (after Gemini returns)

**Status:** wait for research §1–§9. Then paste below into Claude Code.

> Read `docs/todo/unbox-middle-keyboard-axes-WMS-GEMINI-RESEARCH-BRIEFING.md` and
> the Gemini decision brief (attach or paste §1–§9). Implement **only** the
> **Implementation delta** that preserves Unbox golden:
> - dock owns capture; middle is ledger; ProcedureDeck stays parked
> - ←/→ remain positional procedure neighbours (pager twin)
> - ↑/↓ ownership follows the brief’s predicates (sibling vs record)
> - yield to typing targets, overlays, and Displays list-key region
> - re-arm dock/scan focus after step changes (`receiving-focus-scan`)
> - add/extend guards that pin the key map (chrome carton ↑=prev stays;
>   ambient middle map cannot silently invert)
>
> Attach to `:3050`; never start/restart/kill the dev server. User owns commits.
> Prefer `npm run verify -- --fast` while iterating; full `npm run verify` before
> done. Never raise ratchet baselines.
>
> Non-goals: Phase 3 per-unit trio loop; remounting ProcedureDeck; Arrival/Testing
> dock keyboards; voice picking; handheld-only redesign.
