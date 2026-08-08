# Research briefing — Unbox bottom dock as a **flush floor instrument**: zero pad · serial-dominant · ticket-grade edge-to-edge entry

**For:** Gemini Deep Research / Gemini Pro — **you have read access to this repository.** Paths below are pointers; open the real files.
**From:** Cycle Forge engineering  
**Date:** 2026-08-08  
**Repo state:** `main` @ `16d13846e` (dogfood lane; attach `:3050`, never start/restart)  
**Product frame:** Cycle Forge multi-tenant reseller-ops SaaS. USAV is dogfood only.

**Sibling briefs (read; do not merge deliverables):**

| Doc | Owns |
|---|---|
| [`unbox-input-locus-inversion-GEMINI-RESEARCH-BRIEFING.md`](./unbox-input-locus-inversion-GEMINI-RESEARCH-BRIEFING.md) | *Where* input lives (bottom vs middle) — largely shipped as dock-owns-capture |
| [`unbox-dock-step-studio-only-GEMINI-RESEARCH-BRIEFING.md`](./unbox-dock-step-studio-only-GEMINI-RESEARCH-BRIEFING.md) | Kill Print·Receive / vanity metrics during capture — **commit home**, not geometry |
| [`right-panel-sheet-band-flush-GEMINI-RESEARCH-BRIEFING.md`](./right-panel-sheet-band-flush-GEMINI-RESEARCH-BRIEFING.md) | Displays / claim **sheet-band** flush grammar (column = the card) |
| [`dock-receiving-vs-unbox-GEMINI-RESEARCH-BRIEFING.md`](./dock-receiving-vs-unbox-GEMINI-RESEARCH-BRIEFING.md) | Arrival vs unbox stage boundary |

> **This brief owns chrome geometry + entry modes for the Unbox procedure dock only.**  
> Not: remounting centre `ProcedureDeck` · Arrival/Testing docks · Archive|Reticle|Queue · Electron print.

---

## The report that started this (operator + engineering vibe)

Operator / product ask for the **exact Unbox procedure display**, distilled:

1. **The bottom dock mounts to the floor.** No decorative padding. No island spacing. No floating “chat bubble” card hovering above the canvas with horizontal gutters. It is a **floor instrument** — flush to the bottom edge of the work column (safe-area inset only when the OS requires it).
2. **On the serial step, the serial field owns the dock.** Most of the band width / visual weight is the scan/type entry — not a tiny leading CTA beside Print · Receive · FileText.
3. **When the operator must enter text manually** (notes, typed serial recovery, long paste, any step that stops being a one-shot scan), the surface becomes a **text editor** — but **not** a floating chat composer. The precedent is the **Ticket / Claim receiving display**: edge-to-edge, host `px-0`, sheet-band / sunken plane, content owns its own inset if needed. Column = the card.

The engineering vibe we want validated: **MES / RF-station chrome**, not consumer chat UI. Think instrument panel bolted to the bench lip — not iMessage docked over a document.

**Bias of this brief:** prefer **deleting chrome** (raised `Panel`, `rounded-2xl`, float `px-4`/`sm:px-6`, nested composer card) over adding a second entry mode. If you add a mode, say what it **replaces**. Compose named SoT (`DenseComposeFields`, Displays flush host, `OmnichannelComposerDock` `chrome="bare"`) — never fork a page-local twin.

---

## Deliverable — keep these separate

| # | Deliverable |
|---|---|
| **D1** | **Industry ruling** — name the grammar for a scanner-driven floor dock in 2026 WMS / RF / MES / reseller-ops UIs. Where do flush floor instruments win vs floating raised composers? Cite primary vendor docs + HCI (Fitts, thumb-zone transferability to **standing desk + wedge**, GOV.UK one-thing, ISO 9241-110). |
| **D2** | **Anti-chat ruling** — is a floating rounded elevated composer (`rounded-2xl` + shadow) the wrong metaphor for carton capture? When is chat-dock chrome correct (ticket reply) vs wrong (serial / procedure step)? Forced pick. |
| **D3** | **Serial-dominant anatomy** — ASCII + width budget for `activeKey === 'serial'`: what % of the band is the field vs trailing chrome? What dies (FileText? terminal? both)? |
| **D4** | **Manual-entry mode** — when does the dock escalate from single-line floor field → edge-to-edge editor? Trigger taxonomy (notes open · paste length · no-wedge · step type). Visual target = Ticket Displays / Claim sheet-band, **not** Omnichannel raised shell. |
| **D5** | **Codebase reconcile** — deletion-ordered path against §2–§4 with `file:line`. Every path opened. |
| **D6** | **SoT / guard rewrites** — paste-ready paragraphs for laws that currently **require** raised Panel / float gutters / dual chrome; plus guard flip list. |
| **D7** | **Claude Code P0 prompt** ≤40 lines for `:3050` dogfood after your ruling. |

### Paste prompt (give this entire file to Gemini)

```
Read docs/todo/unbox-dock-flush-floor-entry-GEMINI-RESEARCH-BRIEFING.md end-to-end.
Open every cited repo path. Deliver D1–D7 as separate sections.
Prefer deleting raised/floating chat chrome over adding a second dock.
Forced picks only — no “it depends” without choosing.
Mark inference [UNVERIFIED]. Quote file:line for load-bearing claims.
```

---

## 0. Method — read before answering

### 0.1 Verify in the repo (mandatory)

A prior brief in this series produced phases targeting files that do not exist.

- Open every path in §2–§4 before asserting.
- Quote `file:line` for load-bearing claims.
- Mark inference `[UNVERIFIED]`.
- If a line has moved since `16d13846e`, say so — that is a finding.

### 0.2 Search the web (mandatory for D1–D2)

Industry RF / MES / WMS station chrome 2024–2026:

- SAP EWM RF UI / ITSmobile · Manhattan Active WM mobile · Blue Yonder · Oracle WMS Cloud RF · Zebra Workstation Connect / Enterprise Browser guidance
- “persistent bottom action bar” vs “floating FAB / composer” in industrial UIs
- Keyboard / wedge focus ownership at standing benches
- Dense B2B SaaS floor docks (Linear bottom composer? Notion AI? — **only if you argue transfer**; warehouse RF may reject SaaS chat metaphors)

Distinguish **documented spec** from **shop-floor practice**. Label which.

### 0.3 Scale discipline

This is small multi-tenant reseller SaaS: one warehouse, handful of operators, thousands of serialized units. Not a 3PL RF-gun fleet. Recommendations that assume dedicated gun UIs or a WES must say so explicitly.

### 0.4 Established facts — do not re-litigate

| Claim | Status |
|---|---|
| Input locus is the **bottom dock** (middle = ledger) | **Shipped direction.** See locus-inversion brief + `dockOwnsCapture`. Do not reopen “put serial back in the accordion.” |
| Centre `ProcedureDeck` stays **parked** on main | **Locked.** Checklist is Displays / ring. |
| Procedure pointer is **one derivation** | `useUnboxProcedureSteps` — dock · pager · checklist share it. |
| Checklist must highlight the **exact** `activeKey` | Already wired (`activeKey` into `ProcedureChecklist`). |
| Ops chrome is flush-square (`cornerClass('flush')`) | House law — soft pill docks are debt (`source-of-truth.md` → Workbench chrome flush). |
| Host vs content pad | Outer hosts `p-0`; content pad on the row (`source-of-truth.md` → Host vs content pad). **This dock currently violates the spirit** — see §2.1 float gutters + raised Panel. |
| Ticket Displays = edge-to-edge host | `TicketDisplayHost` + `DISPLAYS_FLUSH_HOST`; stream/composer own inset — **the golden for “not a nested chat island.”** |
| Print·Receive-in-dock during capture | Owned by **step-studio-only** sibling brief — coordinate, don’t duplicate the full D2 there. This brief may **assume** commit can leave the band if that sibling kills it; still name blast radius if flush geometry requires it. |
| Motion | `@/design-system/motion` only — no page-local Framer. |

---

## 1. Product frame

**Cycle Forge** — multi-tenant reseller-ops SaaS. `/unbox` is the **Station** golden: scanner-driven, one active carton, Displays push for reference tools, bottom dock for **action**.

Three regions in scope (context from the procedure-display gather):

| Region | Job today | Job under this ask |
|---|---|---|
| **Middle** | PO-line ledger + label (`dockOwnsCapture`) | Unchanged — display what the dock wrote |
| **Right rail (Displays)** | Checklist ring-only + Ticket / Photos / … | Checklist still the map; Ticket flush grammar is the **visual precedent** for manual entry |
| **Bottom dock** | Raised floating `Panel` + gutters + mixed leading | **Flush floor instrument** · serial-dominant · escalate to edge-to-edge editor |

House pattern evolution (`.claude/rules/pattern-evolution.md`): compose named SoT → grow SoT when wrong → compound. **Expect SoT growth** if current “raised Panel owns the dock” is the blocker.

---

## 2. What the code does today — the gap this brief exists to close

### 2.1 Float geometry — still an island

`LineEditPanel.tsx` mounts the dock as an absolute float:

```text
data-unbox-dock-float
  className includes: absolute inset-x-0 bottom-0 z-fab
                      px-4 … sm:px-6
                      pb-[env(safe-area-inset-bottom,0px)]
```

(Verify exact class string at the `data-unbox-dock-float` site in `LineEditPanel.tsx` — ~848–850 on `16d13846e`.)

**Product ask:** that `px-4` / `sm:px-6` horizontal island gutter is **wrong**. Floor instrument = `inset-x-0` with **no** decorative horizontal pad (column already owns measure via `STATION_WORKBENCH_COLUMN`). Safe-area bottom only.

Sibling float recipe `slicedActionDockWrapperClass({ docked: false })` in `SlicedActionDock.tsx` still ships `px-4` / `sm:px-6` plus a `max(1rem, env(safe-area-inset-bottom))` padding-bottom — Unbox already forked a tighter safe-area-only float, but **kept the horizontal gutters**.

### 2.2 Shell — raised chat card

`UnboxDockHost.tsx` wraps the action row in:

```text
Panel  padding="sm"  radius="2xl"  elevation="raised"
  └── h-11 row: leading | FileText | trailing terminal
under-dock: pager (left) · progress ring (right)   ← px-1 on the under-row
```

This is the **consumer chat / FAB island** look: soft radius, elevation, inset padding. House flush law + Host-vs-content-pad say the **column** should be the card — the dock is currently a floating card *on* the column.

`OmnichannelComposerDock` already has `chrome="bare"` for “body zone inside a host shell — no second raised card” (`OmnichannelComposerDock.tsx` docblock ~130–134). Notes path may already want bare; the outer `Panel` still elevates the whole band.

### 2.3 Serial does **not** dominate the band today

| Piece | Path | Reality |
|---|---|---|
| Serial surface | `line-edit/steps/UnboxSerialStepSurface.tsx` | Mounted as dock leading via `SerialDockControl` / `buildUnboxStepDock` — shares the `h-11` row with FileText + Print·Receive |
| Wedge waist (non-serial) | `UnboxDockScanEntry.tsx` | Single-line entry; **hidden** when `activeKey === 'serial'` so serial surface owns focus |
| Notes | `UnboxDockNotesEntry.tsx` | Swaps leading inside the **same** raised `h-11` Panel — not a full edge-to-edge editor |

**Product ask:** on serial, the field should consume **most** of the floor band (visual + hit-target). Trailing chrome must shrink, demote, or leave (coordinate with step-studio-only on Print·Receive).

### 2.4 Manual entry — chat metaphor vs ticket flush golden

| Surface | Path | Grammar |
|---|---|---|
| Ticket Displays host | `TicketDisplayHost.tsx` | Host flush (`DISPLAYS_FLUSH_HOST` / `px-0`); stream + composer own `DISPLAYS_BODY_INSET` — **never pad the whole detail** |
| Claim / sheet-band | `DenseComposeFields.tsx` | Underline subject · full-bleed sunken body — **no nested rounded cards** |
| Carton notes (historical) | `OmnichannelComposerDock` raised | Elevated white shell — correct for **ticket reply**, contested for **procedure floor** |
| Unbox notes mode | `UnboxDockNotesEntry` inside `Panel` | Single-line inside raised island — **not** ticket-grade |

**Product ask:** when manual typing is the job, escalate to the **Ticket / Claim flush editor** grammar (edge-to-edge sunken or underline band), not a taller floating chat bubble.

### 2.5 Procedure sync (context — already mostly correct)

Do not re-solve these; they constrain the geometry work:

- One pointer: `useUnboxProcedureSteps` + `procedure-focus-store` (clears on carton change — new tracking / new order resets).
- Checklist: `UnboxProcedureChecklist` — ring-only leaf; `activeKey` highlight.
- Under-dock: `UnboxProcedurePager` names the exact step (returns `null` until settled + active).
- Capture order: `src/lib/stations/procedure.ts` `FOUND_CAPTURE` / `UNFOUND_CAPTURE` / `RETURN_CAPTURE`.

**Open product tension (out of geometry but adjacent):** checklist does **not** auto-open on new carton scan — only the under-dock face + ring. This brief may note whether a flush floor dock makes auto-opening checklist more or less necessary; do not expand into a Displays IA redesign unless D1 requires it.

---

## 3. Locked visual target (for validation — not yet law)

```text
┌─────────────────────────────────────────────────────────────┐
│  Middle: PO ledger + label (unchanged)                      │
│                                                             │
├─────────────────────────────────────────────────────────────┤  ← hairline only
│ SERIAL  [████████ wedge / type field ████████████████]  [?] │  ← floor band
│ · Shipping label · ‹ ›                              (ring)  │  ← under-row flush
└─────────────────────────────────────────────────────────────┘
        ↑ no px-4 island · no rounded-2xl card · no elevation
        ↑ serial owns ~70–90% width on serial step (your D3 pick)

Manual-entry escalate (notes / long type / paste):

┌─────────────────────────────────────────────────────────────┐
│  (scroll body above — unchanged)                            │
├─────────────────────────────────────────────────────────────┤
│ NOTE / ENTRY                                     [commit]   │  ← eyebrow, flush
│ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │  ← sunken plane
│ ░ edge-to-edge editor (DenseCompose / ticket grammar)    ░ │     edge-to-edge
│ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │     no outer pad
└─────────────────────────────────────────────────────────────┘
```

**Anti-models (ban unless D2 overturns):**

- Floating `rounded-2xl` + `elevation="raised"` chat card over the canvas
- Horizontal float gutters (`px-4` / `sm:px-6`) that inset the dock from the work column
- Nested `OmnichannelComposerDock` **raised** chrome inside another raised Panel
- Serial as a small leading chip beside a dominant Print label CTA
- Growing a second mid-canvas editor that re-creates accordion input locus

---

## 4. Forced product questions (one pick each)

**Q1 — Floor mount.** The Unbox dock float becomes:  
(A) `inset-x-0` flush to `STATION_WORKBENCH_COLUMN` (no horizontal pad; safe-area bottom only) ·  
(B) flush to the full `StationPanelRoot` / Displays sandwich width ·  
(C) keep gutters “for breathing room.”  
**Product bias: A.** Overturn only with industry + Fitts evidence.

**Q2 — Shell.** Default capture band chrome:  
(A) delete outer `Panel` — hairline top border + `bg-surface-card` flush plane ·  
(B) keep Panel but `radius="none"` + `elevation="flat"` ·  
(C) keep raised `2xl` (status quo).  
**Product bias: A or B.**

**Q3 — Serial dominance.** On `activeKey === 'serial'`:  
(A) field ≥80% width; hide FileText; demote/hide terminal (per step-studio sibling) ·  
(B) field ≥60%; icon chrome stays ·  
(C) status quo share with terminal.  
**Product bias: A.**

**Q4 — Manual escalate trigger.** Edge-to-edge editor opens when:  
(A) notes mode only ·  
(B) notes **or** typed paste > N chars / multi-line ·  
(C) any non-wedge step that needs free text ·  
(D) always for notes + serial-absent waiver copy.  
Pick one; define dismiss + focus return (`receiving-focus-scan`).

**Q5 — Manual escalate grammar.** Visual SoT:  
(A) `DenseComposeFields` sunken body (Claim golden) ·  
(B) Ticket Displays composer inset ownership (`DISPLAYS_BODY_INSET` on editor only) ·  
(C) `OmnichannelComposerDock` `chrome="bare"` full-bleed under a flush host ·  
(D) new primitive.  
Prefer A/B/C compose over D.

**Q6 — Height.** Floor band height:  
(A) stay fixed `h-11` for scan steps; grow only in escalate mode ·  
(B) grow for serial to `h-14`/`h-16` ·  
(C) always auto-grow like chat.  
**Product bias: A** (instrument = predictable geometry).

**Q7 — Family blast.** Flush floor instrument applies to:  
(A) Unbox only ·  
(B) every Tier-A station dock that copies UnboxHost ·  
(C) Unbox now; ratchet siblings via guard later.  
Name blast radius + which guards.

**Q8 — Under-dock pager + ring.** Stay under the floor band flush (no `px-1` island), or fold into the band, or move ring solely to Displays?

---

## 5. SoT / guard blockers you must face (D6)

Open and quote. Either rewrite or prove the product ask is wrong.

| Law / artifact | Why it blocks flush floor |
|---|---|
| `UnboxDockHost` `Panel` `radius="2xl"` `elevation="raised"` | Forces chat-island chrome |
| `LineEditPanel` `data-unbox-dock-float` `px-4` / `sm:px-6` | Forces horizontal island gutters |
| `slicedActionDockWrapperClass` float recipe | Sibling stations inherit gutters — family SoT |
| `source-of-truth.md` Omnichannel composer dock row | Documents **elevated white shell** as the shared notes/ticket face — may over-apply to procedure floor |
| `station-workbench.md` dock LEADING / TRAILING | Assumes composer-shaped dock; may need flush-instrument language |
| Host vs content pad / Workbench chrome flush | Already **favor** the product ask — call out the regression honestly |
| `unbox-dock-one-shell.guard.test.ts` | Likely asserts Panel / float shape — flip list required |
| `unbox-right-edge-chrome.guard.test.ts` | Under-dock / Host expectations |
| Ticket / claim flush guards | Goldens to **compose toward**, not fight |

Related commit-home blockers (Print·Receive always trailing) live in the **step-studio-only** brief — cross-link; don’t re-adjudicate the full terminal relocation here unless Q3/Q1 require empty trailing.

---

## 6. Key files (open these)

| Concern | Path |
|---|---|
| Float mount | `src/components/receiving/workspace/LineEditPanel.tsx` (`data-unbox-dock-float`) |
| Host shell | `…/line-edit/UnboxDockHost.tsx` |
| Step CTA / serial mount | `…/line-edit/UnboxStepDock.tsx` · `…/steps/UnboxSerialStepSurface.tsx` · `…/steps/dock/` |
| Keyboard waist | `…/line-edit/UnboxDockScanEntry.tsx` |
| Notes single-line | `…/line-edit/UnboxDockNotesEntry.tsx` |
| Under-dock face | `…/line-edit/UnboxProcedurePager.tsx` |
| Progress / checklist open | `…/UnboxScanProgressControl.tsx` · `…/UnboxProcedureChecklist.tsx` |
| Ticket flush golden | `…/line-edit/TicketDisplayHost.tsx` · `SupportChatComposer.tsx` |
| Sheet-band golden | `src/design-system/components/DenseComposeFields.tsx` |
| Composer primitive | `src/design-system/primitives/OmnichannelComposerDock.tsx` (`chrome` raised\|bare) |
| Float recipe | `src/design-system/primitives/SlicedActionDock.tsx` |
| Column measure | `src/components/station/workbench/workbench-layout.ts` (`STATION_WORKBENCH_COLUMN`) |
| Procedure order | `src/lib/stations/procedure.ts` |
| Derivation | `…/useUnboxProcedureSteps.ts` · `procedure-focus-store.ts` |
| Laws | `.claude/rules/source-of-truth.md` · `display/station-workbench.md` · `ui-design-system.md` |
| Guards | `unbox-dock-one-shell.guard.test.ts` · `unbox-right-edge-chrome.guard.test.ts` · claim/ticket flush guards |

---

## 7. Out of scope / do not propose

- Remounting `UnboxProcedureDeck` / Items-under-deck stacking
- Auto-open checklist as the *primary* answer to “show the step” (may be a one-line note in D1; not this brief’s redesign)
- Second live serial field in the middle accordion
- Bare digit hotkeys / second search engine
- Raising DS / knip baselines
- Starting/restarting the `:3050` dev server
- Hardcoded vendor product sentences in operator copy

---

## 8. Done when Gemini returns

- [ ] D1–D7 as separate sections with forced picks on Q1–Q8  
- [ ] Industry citations for flush floor vs floating chat composer  
- [ ] Deletion-ordered code path with verified `file:line`  
- [ ] Paste-ready SoT paragraphs + guard flip list  
- [ ] ≤40-line P0 implement prompt that assumes attach-to-`:3050` and user-owned commits  

---

## 9. One-sentence success test (dogfood)

Open `/unbox`, scan a fresh tracking number: the bottom edge of the work column is a **flush instrument** (no floating card gutters). Advance to **serial**: the scan field visually owns the band. Open **notes** (or the escalate trigger you ruled): the editor is **edge-to-edge like Ticket/Claim**, not a taller chat bubble floating over the ledger.
