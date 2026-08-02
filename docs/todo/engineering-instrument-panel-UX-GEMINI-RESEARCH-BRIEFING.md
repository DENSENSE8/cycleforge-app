# Research briefing — Engineering instrument-panel UX (SoT + Design System expansion)

**For:** Gemini 2.5 Pro (deep research / architecture adjudication)
**From:** Cycle Forge engineering
**Date:** 2026-08-02
**Repo:** `cycleforge-app` (Next.js App Router · React 19 · Tailwind v4 · Postgres/Neon · TanStack Query)
**Lane:** dogfood `main` — dev server is operator-owned on `:3050`; research only, no server access assumed

> **You do NOT have the codebase.** Every path, rule, component API, and measured behavior in this document is embedded. **Do not invent file paths.** Do not claim to have inspected source. If something is marked **(inferred — verify)**, treat it as a hypothesis.

> **What we want back is a RULING plus paste-ready doc text, not a mood board.** Where this brief poses a question, answer with a decision and reasoning that forecloses the alternative. Where it states a house law, treat the law as binding and design inside it — or argue explicitly that the law is wrong and say what replaces it. **"It depends" is not an answer we can build from.**

**Deliverable:** (a) 2024–2026 industry survey with named systems + citations; (b) **forced rulings on D1–D12** (§8); (c) an **engineering UX scorecard** with pass thresholds (§10); (d) **full markdown subsections** ready to paste into the SoT + DS files listed in §9; (e) phased P0–P3 map + ≤40-line Claude Code P0 prompt (§12).

**Subject:** Codify **“mission-control instrument panel”** UX — SpaceX checklist rigor + Iron Man workshop HUD *translated into* the existing **Kinetic Ledger** identity — and expand Source-of-Truth + Design System docs so **Station scan benches** and **right-rail record inspectors** port consistently.

**Primary surfaces under review:**
1. **Station procedure cockpits** — Unbox is golden; Testing / Triage / Pack / Shipping are port targets.
2. **Right-rail record inspectors** — `RightRailHost` occupants on Workbench pages.
3. **Station Displays push column** — Unbox right-edge reference displays (checklist, pairing, units, …).

**This brief is NOT:** sci-fi HUD cosplay, a second visual language, chat-bubble primary surfaces, a third right-edge grammar, hand-ticked checklists, or "redesign Linear."

---

## 0. How to use this brief

### 0.1 Three deliverables (keep separate)

1. **Industry standard (2026)** for procedure-driven operator UIs: checklist rigor, live telemetry, inspector panels, progress affordances, identifier typography, floor-monitor density. Name real systems; cite 2024–2026 sources.
2. **What is right for Cycle Forge.** Reconcile recommendations against §3–§7 embedded laws. Translate "Iron Man / SpaceX" metaphors into **instrument-panel vocabulary** (§4).
3. **SoT + DS expansion.** Ship paste-ready subsection text for every file in §9. An implementing agent must be able to land docs **without opening the repo**.

### 0.2 Non-goals (DO NOT PROPOSE)

- Neon arcs, holographic grids, faux-3D glass, decorative telemetry unrelated to live state.
- A second design language beside Kinetic Ledger semantic tokens.
- Chat bubbles as the primary ops record surface.
- A third right-edge grammar (only two exist — §5.3).
- Org-editable hand-ticked procedure lists (deleted 2026-08-01; stay deleted).
- Forking a second progress ring (`GoalRing` is a different product concept).
- Raising Design System ratchet baselines to pass guards.
- Document-calm `rollup` density on scan floors.

### 0.3 Paste prompt (give this entire file to Gemini)

```
Read the embedded briefing end-to-end: engineering-instrument-panel-UX-GEMINI-RESEARCH-BRIEFING.md.

You do not have the codebase. Use ONLY facts embedded in the brief.

Deliver:
1. Industry survey (§7 asks) with named systems + citations (2024–2026).
2. Forced rulings on D1–D12 (§8) — one pick each, no "it depends."
3. Filled engineering UX scorecard (§10) for Unbox today vs target.
4. Paste-ready markdown for EVERY file in §9 (full subsections, house voice: Always/Never tables).
5. Phased P0–P3 + §12 Claude Code P0 prompt verbatim (you may refine P0 scope only).

Reconcile with embedded house laws. Where industry conflicts, pick a side for Cycle Forge and defend it.
Do not invent file paths not listed in §5.
```

---

## 1. Product context (embedded — do not re-derive)

**Cycle Forge** — multi-tenant **reseller-operations SaaS** sold B2B. Workflow: receive → unbox → triage → test → repair → catalog → pack → ship → warranty/support. **USAV** (Bose audio reseller, ~1–15 person warehouse) is the **dogfood tenant only** — answer for sellable SaaS, not an internal tool.

**Vendor integrations** (Zoho, Zendesk, Ecwid, UPS, …) are **tenant connectors behind capability facades**. Operator copy uses capability nouns or runtime provider labels — never hardcoded vendor product sentences (except Integrations hub / deep links).

### 1.1 Physical bench reality

| Fact | Value |
|---|---|
| Primary desktop | 1080p–1920p landscape at a standing bench |
| Viewing distance | ~3 ft (≈1 m) |
| Posture | Hands on product + scanner/camera |
| Primary input | Barcode wedge / handheld scanner / phone camera |
| Session | Minutes, high repetition |
| Phone | Second terminal for capture (paired desk↔phone — sibling brief on realtime) |

### 1.2 Region contracts (binding architecture vocabulary)

Every UI region is exactly **one** of four contracts:

| Contract | Driven by | Job | Selection | Density mode |
|---|---|---|---|---|
| **Station** | barcode / wedge / camera | act-and-clear | ephemeral, not URL | `floor` |
| **Workbench** | pointer (mouse) | pick record → edit → persist | durable, URL-addressable | `ops` |
| **Monitor** | filters over a stream | observe only | none | `rollup` |
| **Canvas** | pan/zoom | reshape a definition | durable focus in URL | `studio` |

**Discriminator:** Does this region react to a **scanner** or a **pointer**? Scanner → Station wins over every other signal.

### 1.3 Kinetic Ledger — binding UI identity (embedded verbatim core)

From `.claude/rules/kinetic-ledger.md` and `src/design-system/DESIGN_SYSTEM.md`:

> Cycle Forge UI is **Kinetic Ledger**: data-first reseller ops — dense, state-colored, scan-aware, multi-tenant. **Legible throughput over document calm**; calm chrome (Linear discipline), not document whitespace as the product shape.
>
> Industry blend: **ops density (Carbon / Stripe Dashboard) + Linear chrome + POS/scan floors + Studio canvas.**

**Five laws (all binding):**

1. **Facts and state drive chrome** — chrome never invents a second story.
2. **Archetypes are region contracts** (I/O + persistence), not layout skins.
3. **Data shape chooses the primary surface** — table | list | board | card | timeline | KPI zones | canvas.
4. **Presentation kinds resolve via SoT modules** — labels, tones, chips, dates; views stay dumb.
5. **Compose named shells/blocks; grow the SoT when wrong; compound every UI task.**

**Always ban:** random card soup · nested cards-as-rows · a second visual language beside Kinetic Ledger tokens · a fourth typography slot (sans / condensed / mono only).

### 1.4 The metaphor we are formalizing

| Pop-culture / ops cue | Cycle Forge term | Status in product |
|---|---|---|
| Iron Man helmet HUD | **Instrument panel** — state-colored chrome from live facts | Partial |
| Jarvis readout | **Fact telemetry** — label/value rows, mono IDs | Partial (`OrderFactRow`) |
| SpaceX launch checklist | **Derived procedure** — steps done when evidence exists | Yes on Unbox |
| Mission sequence map | **Focus deck + checklist** — *what now* vs *where am I* | Yes on Unbox |
| Telemetry ring | **Scan progress chrome** — bare SVG ring | Yes |
| GO / NO-GO | **Step gates + terminal dock** — one primary commit per beat | Partial by station |

**Design north star (one sentence):**

> **Mission-control instrument panel, not a document or a chat app** — expressed entirely through Kinetic Ledger tokens and existing region contracts.

---

## 2. What we are NOT building (contrast table)

| Tempting "Iron Man" move | Why it fails here | Correct Kinetic Ledger expression |
|---|---|---|
| Glowing circular HUD with numerals | Second visual language; fights `floor` density | Bare 16px slate ring, **no numeral inside** |
| Holographic card stacks | "Card soup" ban | Rows + dividers; one focus card in procedure deck |
| Chat with the machine | Support brief rejects chat-primary | Grounded suggestion **strip** (Workbench only), collapsible |
| Hand-checkable todo list | False completion; deleted 2026-08-01 | Evidence-derived step states |
| Hero product title in header | Right-rail law | Eyebrow + short key; title in body fact rows |
| Always-visible procedure column | Third right-edge grammar | Checklist as **operator-picked display** via ring |
| Sci-fi monospace everywhere | Mono is for **retypable identifiers** only | `text-role-*` sans + `font-mono` on IDs |

---

## 3. Embedded typography + token law

From `.claude/rules/ui-design-system.md` — **three cuts, one face each, weight capped at 600:**

| Cut | Face | Job | How to apply |
|---|---|---|---|
| **Sans** | Inter | display · title · body · data · caption | Default via `text-role-*` |
| **Condensed** | IBM Plex Sans Condensed | eyebrow · micro labels | Intrinsic in `text-role-eyebrow` / `text-role-micro` |
| **Mono** | IBM Plex Mono | serial · FNSKU · tracking · SKU | `font-mono` / `CopyChip` family |

**Rules:**
- Pick a **role**, not a family. Never add a fourth display/heading face.
- **600 is the ceiling** — no `font-bold` / `font-extrabold` (banned; renders faux-bold).
- Emphasis = contrast + tracking, not weight.
- Tabular numerals on data roles; mono never ligates (serials must be retypable).

**Semantic color (no page-local hex):**
- Surfaces: `bg-surface-card`, `bg-surface-canvas`, `bg-surface-sunken`, …
- Text: `text-text-default`, `text-text-muted`, `text-text-soft`, `text-text-faint`
- Borders: `border-border-soft`, `border-border-hairline`, …
- Status triads: `bg-surface-success` + `text-text-success` + `border-border-success` (and warning/danger/accent analogs)
- Themes via `data-theme` + `src/design-system/themes/*` (`light`, `dark`, `mono`, `slate`)

**Field group pattern (fact telemetry cell):**

```tsx
<div className="space-y-1">
  <p className="text-role-micro uppercase">LABEL</p>
  {value}
</div>
```

**One-row anatomy (checklist rows, queue rows):**
- Left-aligned: title → meta → chips(right)
- Title: `truncate text-role-caption font-semibold text-text-default`
- Meta: `truncate text-role-eyebrow uppercase tracking-widest text-text-soft`
- Selection: background + ring only — **never a height/size shift**

---

## 4. Instrument-panel principles (candidate — ratify in D1)

| # | Principle | Operator question | Chrome expression |
|---|---|---|---|
| P1 | State is telemetry | "What is true right now?" | Chips, rings, step faces tied to server/realtime evidence |
| P2 | Procedure is the product | "What step am I on?" | Focus deck centre + checklist map on edge + ring entry |
| P3 | Identifiers are instruments | "Can I retype this serial?" | Mono + `CopyChip`; end-aligned in grids |
| P4 | Headers are labels, not stories | "What subsystem?" | Eyebrow + short truncated key |
| P5 | One commit per beat | "What advances work?" | Terminal dock / step composer — not competing primaries |
| P6 | Live or silent | "Did my scan land?" | Realtime checklist; laggy display worse than none |
| P7 | Calm instrument stroke | "Procedure or daily goal?" | Slate progress ring — **not** `GoalRing` semantic hues |

---

## 5. Repo map — paths Gemini must know (embedded)

### 5.1 Rule files (house law — target of §9 expansions)

| Path | Role |
|---|---|
| `AGENTS.md` | Constitution map (~45 lines); links to detail rules |
| `.claude/rules/kinetic-ledger.md` | Product UI identity + five laws |
| `.claude/rules/ui-design-system.md` | Density, typography, one-row anatomy, chips |
| `.claude/rules/contextual-display.md` | Region contracts + `pickArchetype()` |
| `.claude/rules/source-of-truth.md` | Invariant list incl. right-rail modality |
| `.claude/rules/display/station.md` | Station scan loop contract |
| `.claude/rules/display/station-workbench.md` | Unbox-family column shell + procedure rules |
| `.claude/rules/display/right-rail-inspector.md` | Record inspector header anatomy |
| `.claude/rules/display/workbench.md` | Pointer-driven pick+edit |
| `.claude/rules/display/workbench-service.md` | Support service-workspace branch |
| `.claude/rules/verify.md` | CI gates + DS ratchets |

### 5.2 Design system code SoT

| Path | Role |
|---|---|
| `src/design-system/DESIGN_SYSTEM.md` | DS north star doc (tokens, primitives — **Procedure* not yet registered**) |
| `src/design-system/components/procedure/ProcedureDeck.tsx` | Focus deck work surface |
| `src/design-system/components/procedure/ProcedureChecklist.tsx` | Whole-job checklist display |
| `src/design-system/components/procedure/types.ts` | `ProcedureStepRow`, `ProcedureStepState` |
| `src/design-system/components/procedure/index.ts` | Public exports |
| `src/design-system/shells/detail-stack/layout.ts` | `DETAIL_STACK_LAYOUT`, resize, collapse tokens |
| `src/design-system/primitives/PanelRow.tsx` | Base row primitive |
| `src/design-system/foundations/motion-framer.ts` | Named motion presets (stations use these) |

### 5.3 Right rail

| Path | Role |
|---|---|
| `src/components/right-rail/RightRailHost.tsx` | THE wrapper — one app-wide occupant |
| `src/lib/right-rail/store.ts` | Occupant stack; priority bands |
| `src/components/ui/pane-header/` | `PaneHeader`, `PaneHeaderLabel`, `PaneHeaderActionBar`, `PaneHeaderCloseButton` |
| `src/components/order-record/RecordPaneHeader.tsx` | Unified order inspector header |
| `src/components/order-record/order-record-card.tsx` | `OrderFactRow`, `OrderFactList`, `OrderRecordCard` |

### 5.4 Station / Unbox golden reference

| Path | Role |
|---|---|
| `src/components/station/ScanStationProgressRing.tsx` | Bare procedure progress ring |
| `src/components/station/ScanStationProgressControl.tsx` | Ring + hover peek host |
| `src/components/receiving/workspace/UnboxScanProgressControl.tsx` | Unbox adapter → opens checklist display |
| `src/components/receiving/workspace/line-edit/UnboxProcedureDeck.tsx` | Domain wrapper → `ProcedureDeck` |
| `src/components/receiving/workspace/line-edit/UnboxProcedureChecklist.tsx` | Domain wrapper → `ProcedureChecklist` |
| `src/components/receiving/workspace/line-edit/useUnboxProcedureSteps.ts` | **Single derivation** hook |
| `src/lib/receiving/procedure-focus-store.ts` | Ephemeral focus pointer (carton-keyed) |
| `src/lib/receiving/procedure-pointer.ts` | `resolveActiveStep` pointer SoT |
| `src/components/receiving/workspace/LineEditPanel.tsx` | Unbox golden panel composition |
| `src/components/receiving/workspace/ReceivingDisplaysPushStack.tsx` | Right-edge Displays push column |
| `src/components/station/workbench/StationWorkbench.tsx` | Station column shell SoT |
| `src/components/station/entity-context/StationContextBar.tsx` | Bookmark identity over canvas |
| `src/components/station/workbench/station-workbench-chrome.guard.test.ts` | CI enforcement for station chrome |

### 5.5 Guards (mechanical enforcement — docs must match)

| Guard path | What it enforces |
|---|---|
| `src/components/station/workbench/station-workbench-chrome.guard.test.ts` | 720px column, `StationPanelRoot`, tier allowlists |
| `src/components/receiving/workspace/line-edit/procedure-step-body.guard.test.ts` | Every procedure step has body + dock control |
| `src/components/receiving/workspace/line-edit/procedure-step-face.guard.test.ts` | Every step has icon + hue |
| `src/components/receiving/workspace/line-edit/procedure-divergence.guard.test.ts` | Every step has a gate |
| `src/components/right-rail/right-rail-inspector-header.guard.test.ts` | Header contract on rail occupants |
| `src/components/ui/typography-tokens.guard.test.ts` | Weight cap, role bindings, no raw px type |

---

## 6. Embedded house law — right edge (verbatim summary)

From `.claude/rules/source-of-truth.md` → **Right-rail modality** (2026-08-02):

**Exactly TWO right-edge grammars — no third:**

1. **App push column** — `RightRailHost` occupant. App-wide, one at a time, pushes work surface.
2. **Station push column** — `UnboxPushColumn` (and peers). In-flow within one station bench; never a rail occupant.

**Retired (do not resurrect):** `procedure-store.ts` + `RightRailProcedureRegion` + always-on procedure region. **Replaced by:** checklist as a **Displays body** the operator opens via the **scan progress ring**.

**Two views, ONE derivation:** centre `UnboxProcedureDeck` + edge `UnboxProcedureChecklist` both read `useUnboxProcedureSteps`.

**Non-modal record inspectors (`modal={false}`):** no scrim, no scroll lock, collection stays live. Known occupant ids (embedded):

| Occupant id | Typical use |
|---|---|
| `detail:order` | Dashboard / shipped order inspector |
| `detail:receiving` | Receiving line detail (elevated z) |
| `detail:incoming` | Incoming PO row |
| `detail:claim` | Repair claim |
| `detail:unfound` | Unfound queue |
| `detail:fba-plan` | FBA board |
| `detail:sku:<sku>` | SKU variant |
| `detail:support-context:<ticketId>` | Support context panel |
| `detail:catalog-link` | Catalog link review |
| `detail:new-order` | Create order (intake shell — different chrome family) |
| `detail:incoming-import-ebay` | Import wizard |
| `box:<id>` / `manifest:<ref>` | Testing bench workbenches |

**Close control:** mandatory on non-modal push columns. Glyph is **`>|` (`ArrowRightToLine`)**, not `X` — "park panel back against edge." Trailing cluster when queue-walking: **`>| · ↑ · ↓`**.

---

## 7. Embedded house law — right-rail inspector header

From `.claude/rules/display/right-rail-inspector.md` (full anatomy):

```text
┌─────────────────────────────────────────────────────────────┐
│ Row 1 — icon action row (ONLY secondary action surface)     │
│ [ contextual icons … ]              [ >| · ↑ · ↓ ]          │
├─────────────────────────────────────────────────────────────┤
│ Row 2 — dense identity (PaneHeaderLabel)                    │
│ [badge?]  eyebrow (mode / entity kind)                      │
│           value = SHORT durable key (truncate)              │
├─────────────────────────────────────────────────────────────┤
│ optional belowSlot — tabs / status pills                    │
├─────────────────────────────────────────────────────────────┤
│ Body — scrollable facts · forms · long titles · prose       │
├─────────────────────────────────────────────────────────────┤
│ optional footer — ONE primary CTA band (submit / resolve)   │
└─────────────────────────────────────────────────────────────┘
```

**Hard Always:** `PaneHeaderLabel` identity · long titles in **body only** · `RecordPaneHeader` for orders · contextual icons per occupant.

**Hard Never:** `SidebarIntakeFormShell` on record inspectors · wrapping hero title · `text-role-title` in header · page-local `fixed right-0` panels.

**Two chrome families (do not cross):**

| Family | Component | Use |
|---|---|---|
| Record / queue inspector | `PaneHeader` + blocks | Picked row detail |
| Intake / create overlay | `SidebarIntakeFormShell` | Empty-form wizards |

**Gap this brief closes:** Body "fact telemetry" pattern exists in code (`OrderFactRow`) but is **not named** as mandatory inspector body grammar in DS docs.

---

## 8. Embedded house law — Station + Unbox procedure (golden reference)

### 8.1 Station top-level anatomy

From `.claude/rules/display/station.md`:

| Part | Module | Rule |
|---|---|---|
| Focus-locked scan bar | `StationScanBar` | Auto-focused; only primary control |
| Entity-context header | `StationContextBar` + `CartonContextCard` | Absolute-float bookmark identity |
| Procedure progress chrome | `ScanStationProgressControl` + ring | Pane top-right always; ring-only checklist entry |
| Active-entity card | varies by bench | One card; new scan replaces previous |
| Goal HUD | `StationGoalBar` | Ambient throughput only — not a control |
| Station-down | `OfflineBanner` | Singleton at app root |

### 8.2 Unbox layout (ASCII — embedded)

```text
┌──────────────────────────────────────────────────────────────────────────┐
│ [ Station scan bar — sticky, auto-focus ]                                │
├──────────────────────────────────────────────────────────────────────────┤
│ ┌─ StationContextBar (absolute bookmark identity over canvas) ──── [○] ─┐│
│ │  CartonContextCard  ·  displays · pairing · …              ring     ││
│ └──────────────────────────────────────────────────────────────────────┘│
│                                                                          │
│  CENTRE (720px column)                                                   │
│  ┌────────────────────────────────────────┐  ┌─ Displays push (optional)─┐
│  │ ProcedureDeck — focus card BOTTOM      │  │ Icon strip: Classify ·    │
│  │  · completed steps transcript ↑        │  │ Pairing · Listings ·      │
│  │  · one queued peek below focus         │  │ Units · Zoho · ⋯          │
│  │  · step body + composer dock           │  │                           │
│  │  (NO tab strip in body)                │  │ Body: checklist / pairing │
│  └────────────────────────────────────────┘  │ / units / timeline / …    │
│                                              └───────────────────────────┘
│  [○] = ScanStationProgressRing — ONLY checklist entry (not on strip)     │
└──────────────────────────────────────────────────────────────────────────┘
```

### 8.3 Procedure two-view model (ruled 2026-08-02)

| Where | Surface | Answers | SoT |
|---|---|---|---|
| **Centre** | `ProcedureDeck` | *What do I do right now?* | `src/design-system/components/procedure/ProcedureDeck.tsx` |
| **Right edge (Displays)** | `ProcedureChecklist` | *Where am I in the whole job?* | `src/design-system/components/procedure/ProcedureChecklist.tsx` |
| **Pane top-right** | Progress ring | Opens/closes checklist display | `ScanStationProgressRing` |

**Single derivation:** `useUnboxProcedureSteps` — subscribes to photo realtime channel so phone captures appear immediately.

**Focus pointer:** `procedure-focus-store.ts` — ephemeral, carton-keyed. Checklist row click moves centre focus.

**Deleted forever:** org-editable `checklist_templates` + `/api/checklists` + hand ticks in localStorage.

### 8.4 ProcedureDeck invariants (embedded — do not relitigate)

From `ProcedureDeck.tsx` docblock + `display/station-workbench.md`:

1. **Occlusion of a BODY is allowed. Occlusion of the RECORD is not.** Completed step labels/times must stay legible.
2. **HIDING and RE-SORTING are banned.** Every step mounted from frame one in vocabulary order.
3. **Exactly ONE queued card peeks** below the focus card (not a multi-layer pile).
4. **Dimming is a FOCUS channel, not a state channel** — state = glyph + tone on step face.
5. **Height never animates** — no `min-h-*` floors on bodies that didn't ask for height.
6. **Bottom-pinned focus** — active step sits above composer dock; host uses `bodyAlign="end"`.
7. **Checklist coupling is a precondition** — if checklist is de-defaulted, deck reverts to flat column.

### 8.5 Procedure step vocabulary (embedded types)

From `src/design-system/components/procedure/types.ts`:

```ts
export type ProcedureStepState = 'done' | 'active' | 'pending' | 'skipped';

export interface ProcedureStepRow {
  key: string;
  label: string;
  state: ProcedureStepState;
  summary?: string;      // e.g. "3 photos"
  position: number;      // 1-based; shown on active marker
  at?: string;           // completion instant — absent while pending
  skipReason?: string;   // only when skipped — NOT done
}
```

**Critical:** `skipped` is **not** `done`. Skipped = human waiver without evidence. Never render skipped with a check mark.

### 8.6 Scan progress ring (embedded implementation)

From `src/components/station/ScanStationProgressRing.tsx`:

- **16px** bare SVG circle, **no numeral**, no card plate behind ring
- Track stroke: `#E2E8F0` · Progress idle: `#94A3B8` · Selected: `#334155`
- **NOT `GoalRing`** — GoalRing is daily goal pace in GlobalHeader
- Props: `percent` 0–100, `tone: 'idle' | 'selected'`
- **`selected`** = checklist display is live on screen

**Ring interaction matrix (locked):**

| Current state | Ring click |
|---|---|
| Displays closed | Open checklist display |
| Displays open on checklist | Close Displays |
| Displays open on another tab | Switch to checklist (don't close) |

**Hover peek:** 2 checklist rows when Displays closed; hover **off** while any push rail open.

### 8.7 Fact telemetry primitive (embedded — target for right-rail body)

From `src/components/order-record/order-record-card.tsx`:

```tsx
export function OrderFactRow({ label, value, mono, span, omitWhenEmpty }) {
  // label: text-role-eyebrow uppercase text-text-faint
  // value: text-role-caption font-medium; mono → font-mono tabular-nums
  // empty → em dash unless omitWhenEmpty
}

export function OrderFactList({ children, cols = 1 | 2 }) {
  // dl grid — cols=1 for narrow rails
}
```

This is the **closest existing SoT** for "instrument readout" body content.

### 8.8 Station workbench tiers (embedded)

From `display/station-workbench.md`:

| Tier | Stations | Procedure UX expectation for this brief |
|---|---|---|
| **A** | Unbox, Triage, Testing | Full chrome + **should** port procedure instrument pattern |
| **B** | Shipping, Pack, Pickup, Labels, Packer review | 720 column + `StationWorkbench`; procedure parity TBD (D4) |
| **C** | Support ticket, Support orders, Pack terminal exempt | Documented exceptions — do not force Unbox chrome |
| **D** | Repair intake | Must adopt shell or demote |

---

## 9. Current gaps (why documentation expansion is the deliverable)

| Gap | Symptom for implementers |
|---|---|
| No **instrument-panel** sub-identity in kinetic-ledger | "Engineering feel" is implicit on Unbox only |
| `DESIGN_SYSTEM.md` omits Procedure* + ScanStationProgress* | Agents grep instead of compose |
| Right-rail doc lacks **body telemetry** section | Card soup / hero titles persist on some occupants |
| Station.md lacks unified **Procedure cockpit** section | Testing/Triage ports re-litigate deck+ring rules |
| No cross-station **procedure port checklist** | Chrome guards pass while UX diverges |
| `GoalRing` vs scan ring confusion | Wrong ring copied to stations |

---

## 10. Research sources (minimum — answer with named systems)

| Class | Examples | Research for |
|---|---|---|
| Mission / procedure UX | SpaceX public MC UI, aviation QRH/checklists, NASA ops terminology | Sequence maps, GO/NO-GO, evidence gates |
| WMS / MES | Manhattan, Blue Yonder, ShipHero, Flexport, Körber | Scan-first loops, step procedures |
| Field service / MES apps | Tulip, Parsable, UpKeep, ServiceMax | Photo-as-proof, step evidence |
| Premium B2B density | Linear, Stripe Dashboard, IBM Carbon | Inspector panels, fact density |
| HUD / sci-fi (contrast) | FUI postmortems, Iron Man interface analyses | What **not** to copy |
| a11y @ density | WCAG 2.2 target size, contrast for state-only color | Floor monitor legibility |

Where industry splits (modal vs push inspector), give both positions, then **pick for Cycle Forge** citing §6 right-rail law.

---

## 11. Sibling briefs (cite — do not redo)

| Brief filename | Owns |
|---|---|
| `scan-progress-ring-checklist-selected-HANDOFF.md` | Ring-only checklist entry + selected face |
| `station-realtime-capture-visibility-GEMINI-RESEARCH-BRIEFING.md` | Live capture/upload/reliability cross-station |
| `right-rail-inspector-contract-CLAUDE-CODE-PROMPT.md` | Header SoT, dirty state, collapse |
| `support-ticket-premium-upgrade-GEMINI-BRIEFING.md` | Support record — not chat-primary |
| `carton-inspector-ux-GEMINI-RESEARCH-BRIEFING.md` | Read-only adjudication vs throughput density |
| `today-chrome-premium-altitude-GEMINI-RESEARCH-BRIEFING.md` | Global chrome altitude |
| `unbox-procedure-stack-MOTION-GEMINI-RESEARCH-BRIEFING.md` | Procedure deck motion budget |

---

## 12. Forced decisions D1–D12

Answer each with **one pick** + rationale. Unbox-only answers fail where cross-station SoT is requested.

### D1 — Sub-identity vs pattern-only docs
**Current:** Kinetic Ledger names density; "instrument panel" is emergent on Unbox.
**Options:** (A) Named sub-identity in identity docs + new `display/instrument-panel.md`; (B) Patterns only under existing `display/*`; (C) Both — thin map + detail file.
**Deliverable:** Pick A, B, or C; if new file, full outline.

### D2 — Right-rail body grammar
**Options:** (A) Mandatory `OrderFactList`/`OrderFactRow` for all record inspectors; (B) Segmented "systems" panels with eyebrows (`EVIDENCE`, `FULFILLMENT`); (C) Hybrid — segments as `<section>` eyebrows within one scroll.
**Deliverable:** Pick one; specify when multi-field forms break out.

### D3 — Inspector density on Station-adjacent rails
**Question:** Should `detail:incoming` opened from a Station bench use `floor` or `ops` density?
**Deliverable:** Forced pick + class/token mapping.

### D4 — Procedure port minimum for Tier A
**Candidate minimum:** derived steps hook · focus deck (or documented exempt) · progress ring · live channel · terminal registry · checklist display.
**Deliverable:** Table: Unbox / Triage / Testing — must / exempt / alternate for each row.

### D5 — Progress ring on non-procedure stations (Pack, Shipping)
**Options:** Same ring · no ring · alternate instrument (unit checklist %, ship stepper).
**Deliverable:** Per Tier B station ruling.

### D6 — Checklist hover peek depth
**Current:** 2 rows at ~40px each (`PROCEDURE_CHECKLIST_ROW_PX = 40`).
**Deliverable:** Defend 2 vs 3 vs ring-only on 1080p @ 3ft.

### D7 — Completed step history compression
**Current:** Full title rows for all completed steps in deck transcript.
**Options:** Always full · collapse after N · session summary row.
**Deliverable:** Pick with dispute-evidence rationale.

### D8 — AI / assistant placement
**Options:** (A) Collapsible instrument strip below header; (B) Right-rail tab; (C) Forbidden on Station `floor`.
**Deliverable:** Region-specific ruling.

### D9 — Identifier presentation
**Deliverable:** Is every inspector identifier required to use `CopyChip`? List exceptions.

### D10 — Instrument-selected token
**Current:** Ring selected = `#334155` stroke; icon rail uses `bg-surface-sunken`.
**Deliverable:** Unify into one named token recipe in DS docs — yes/no + exact Tailwind classes.

### D11 — Read-only records (carton read `/carton/[id]`)
**Deliverable:** Same instrument-panel vocab or sibling "adjudication panel" sub-vocab?

### D12 — Documentation file placement
**Deliverable:** Final file list for §13 with one-line purpose each.

---

## 13. Required doc additions (PRIMARY OUTPUT — paste-ready markdown)

Ship **complete subsections** in house voice (Always / Never tables, ruled dates). An engineer pastes these without reading the repo.

### 13.1 Target files

| File | Action |
|---|---|
| `.claude/rules/kinetic-ledger.md` | Add instrument-panel paragraph + link |
| `.claude/rules/display/instrument-panel.md` | **CREATE** (if D1/D12 picks) — full contract |
| `.claude/rules/display/station.md` | Add § Procedure cockpit |
| `.claude/rules/display/station-workbench.md` | Add § Cross-station procedure port checklist |
| `.claude/rules/display/right-rail-inspector.md` | Add § Body — fact telemetry |
| `.claude/rules/ui-design-system.md` | Add § Instrument typography & telemetry rows |
| `src/design-system/DESIGN_SYSTEM.md` | Add § Procedure & scan progress components |
| `.claude/rules/source-of-truth.md` | One-liner cross-links only — no prose duplication |
| `.claude/rules/contextual-display.md` | Index link if new display rule file |

### 13.2 Minimum content each file must contain

**`instrument-panel.md` (if created):**
- One-sentence definition
- P1–P7 principles (refined from §4)
- Always / Never tables
- Composition map (table: job → component path)
- Metaphor translation table (§2)
- Link to ProcedureDeck invariants by reference

**`station.md` — Procedure cockpit:**
- Two views / one derivation table (§8.3)
- Ring placement + interaction matrix (§8.6)
- Live checklist requirement
- Anti-patterns: third edge grammar, hand ticks, strip checklist tab

**`right-rail-inspector.md` — Body fact telemetry:**
- Default body = `OrderFactList` + `OrderFactRow`
- Segment eyebrows rules (per D2)
- Long product titles → body rows only
- Footer single CTA
- Anti-patterns: card soup, chat bubbles

**`ui-design-system.md` — Instrument typography:**
- Telemetry row anatomy (label eyebrow + value + optional mono)
- Instrument-selected surface recipe (per D10)
- Ban: numerals inside scan progress ring
- Ban: `font-bold` / fourth typeface

**`DESIGN_SYSTEM.md` — Procedure & scan progress:**
- Register `ProcedureDeck`, `ProcedureChecklist`, types
- Register `ScanStationProgressControl`, `ScanStationProgressRing`
- Explicit negation vs `GoalRing`
- Export path for fact list primitives

---

## 14. Engineering UX scorecard (deliver filled)

Score **Unbox today** (from §8 embedded facts) and **target** 1–5. **Pass = all P0 rows ≥ 4.**

| Criterion | Definition |
|---|---|
| Scan-to-visible-state | Phone capture → checklist updates without refocus |
| Procedure clarity | Operator names current step without scrolling centre |
| Identifier retypability | 100% serials/SKUs in mono + copy affordance |
| Header noise | Zero long product titles in any rail header |
| Control duplication | Zero second entries for same display (ring vs strip) |
| Live truth | Zero hand-tick procedure steps |
| Primary commit clarity | One obvious advance CTA per active step |
| Right-rail fact density | Facts per viewport in order inspector — define threshold |

---

## 15. Phased execution map

| Phase | Scope | Acceptance |
|---|---|---|
| **P0 — Docs** | Land §13 paste-ready text | Agent ports without guessing |
| **P1 — Right rail** | Wave-2 occupants → fact telemetry body | No hero titles in guarded rails |
| **P2 — Station** | Testing/Triage procedure parity | Same hook shape; domain steps |
| **P3 — Polish** | Instrument-selected token unified | Scorecard ≥4; `npm run verify` green |

---

## 16. Claude Code P0 prompt (deliver ≤40 lines, verbatim)

```
Read docs/todo/engineering-instrument-panel-UX-GEMINI-RESEARCH-BRIEFING.md §13.

Land the documentation slice ONLY (no feature ports):
1. Create .claude/rules/display/instrument-panel.md from Gemini §13 (if D12 creates it).
2. Patch kinetic-ledger.md, station.md, station-workbench.md, right-rail-inspector.md,
   ui-design-system.md per §13.
3. Add Procedure & scan progress section to src/design-system/DESIGN_SYSTEM.md.
4. Add one-liner cross-links in source-of-truth.md + contextual-display.md index.

HARD LAWS: AGENTS.md · no second visual language · no third right-edge grammar ·
compose ProcedureDeck/ScanStationProgress* · npm run verify · user owns commits · attach :3050.
Do not port Testing/Triage in this slice. Do not raise ratchet baselines.
```

---

## 17. Open questions for product owner (flag in research, don't block)

1. Should **Pack** / **Shipping** use full procedure deck or lighter stepper-only instrument?
2. Should **`themes/slate.ts`** or **`themes/mono.ts`** be recommended default for floor stations?
3. Should order/support rails use **segment eyebrows** (D2 hybrid) or pure fact lists?

---

*End of briefing. Everything needed to research and write SoT/DS expansions is embedded above.*
