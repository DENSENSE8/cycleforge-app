# Research briefing — receiving details: modal slide-over + scrim → Claude-style floating push overlay

**For:** Gemini Pro (deep research)
**From:** Cycle Forge engineering
**Date:** 2026-07-30
**Subject surface:** `ReceivingDetailsStack` (`src/components/station/ReceivingDetailsStack.tsx`) — the carton / receiving **details panel** opened from Unbox (Info / more-details), Incoming row click, and related receiving overlays. Mounted via `DetailStackRailRegistrar` → single `RightRailHost`.

## Verdict (locked 2026-07-30)

**Model B.** Same inset floating card; `modal={false}` on `ReceivingDetailsStack`; keep `elevated`; do **not** push layout. Scrim dies for this inspector. House law: **navigators push, inspectors float** (see `.claude/rules/source-of-truth.md` Right-rail modality). Resize comes free from `RightRailHost` once non-modal. Out of scope: dashboard push, new floatDock geometry, carton-inspector retirement, Escape focus-within host change.

**Status (pre-verdict):** Product owner rejects the **modal slide-over + darkened backdrop**. Desired target: a **top-level floating panel that pushes (or coexists with) the layout**, in the spirit of **Claude’s desktop/web floating chrome** and this app’s own **left spine push column / Recents popover** grammar — not a dimmed dialog that buries the queue underneath.
**Deliverable:** (a) 2026 industry benchmark of inspector modality + spatial models with named systems and citations; (b) a defended verdict on the decisions in §7 for *this* receiving details surface (and whether the shared `RightRailHost` should change house-wide); (c) answers to §8 with sources.

**Sibling briefs (do not re-answer; reconcile):**
- [`dashboard-inline-detail-editing-GEMINI-RESEARCH-BRIEFING.md`](./dashboard-inline-detail-editing-GEMINI-RESEARCH-BRIEFING.md) — same modality fight on **Dashboard** orders (`RightRailHost` measured there).
- [`detail-surface-IA-GEMINI-RESEARCH-BRIEFING.md`](./detail-surface-IA-GEMINI-RESEARCH-BRIEFING.md) — slide-over vs dedicated page across entity types.
- [`carton-inspector-ux-GEMINI-RESEARCH-BRIEFING.md`](./carton-inspector-ux-GEMINI-RESEARCH-BRIEFING.md) — read-only `/carton/[id]` (superseded on visual IA; useful for *job* taxonomy only).

---

## 0. How to use this brief

You do **not** have this codebase. Measurements and file paths below are literal inventory from the running repository on 2026-07-30. Inferences are labeled **(inferred — verify)**.

Three deliverables, kept separate:

1. **What is industry standard in 2026** for “inspect one operational record beside a live queue / station without burying the queue under a scrim”? Name real systems (ops SaaS, WMS/WES, Linear/Notion/Claude-class productivity shells, Shopify/Stripe admin, ShipStation-class fulfillment). State when **modal + scrim**, **non-modal floating overlay**, **in-flow push/squeeze**, and **dedicated route** each win. Explicit dominant pattern — not “it depends.”
2. **Take a side on each decision in §7.** Current shape, strongest case against it, admission where we already know the answer.
3. **Answer §8** with sources.

The reader is the engineer who will change `RightRailHost` / `ReceivingDetailsStack` registration. Prefer a concrete target architecture (modality contract + geometry + motion) over a decision framework.

**Product-frame reminder:** Cycle Forge is multi-tenant reseller-ops SaaS. USAV is dogfood only — do not frame recommendations as “for a 5-person shop.”

---

## 1. Product vocabulary (use these words)

| Term | Meaning here |
|---|---|
| **Station** | Scanner-driven act-and-clear (Unbox). Selection ephemeral. |
| **Workbench** | Pointer pick → edit → persist (Incoming table). Selection URL-durable. |
| **Detail stack / right rail** | Shared right-edge slot: one occupant, `RightRailHost`. |
| **Elevated** | `elevated` flag on the registrar — higher z + **deeper** scrim (used by receiving details over Unbox/Triage workspaces). |
| **Modal occupant** | Default: `role="dialog"`, `aria-modal`, body scroll lock, clickable scrim, Escape closes. |
| **Non-modal occupant** | Already supported: `modal={false}` → no scrim, `role="region"`, no scroll lock, optional drag-resize. Assistant dock uses a related non-modal path. |
| **Push column** | In-flow width that **moves** the work canvas (MasterNav spine: `SidebarNavColumn`, 240px). Opening expands the frame rather than covering it. |
| **Floating top-level** | Portaled / fixed chrome that sits above the app shell with its own card elevation — **without** claiming full-app modal ownership (Claude chat side panel / project sidebar; this app’s Recents `AnchoredLayer` popover is a lightweight cousin). |

House visual identity: **Kinetic Ledger** — dense, state-colored, legible throughput; calm Linear-like chrome; ban random card soup.

---

## 2. The operator complaint (verbatim intent)

Observed on Unbox when opening receiving details (Info → details panel):

1. A **right-edge card** slides in.
2. The **entire app darkens / blurs** behind it (elevated scrim).
3. The queue / station context the operator was using becomes visually “closed,” even when the job is still “glance at this PO’s progress, maybe copy the order #, close, keep working.”

**Desired feel (operator language):** more like **Claude** — a **floating, top-level panel** that reads as its own surface — and more like this app’s **left navigation / Recents** grammar: chrome that **pushes or floats without burying** the work under a modal dim. Not “you are trapped in a dialog until you dismiss.”

Screenshot reference (2026-07-30): panel header shows Order # · Progress / Items · Delete footer; primary “Search Zoho PO” CTA has since been removed from the header (Edit PO already removed). The spatial complaint remains about **modality + scrim**, not those buttons.

---

## 3. What shipped — measured anatomy

### 3.1 Mount path

```
ReceivingDetailsStack
  └─ DetailStackRailRegistrar({ elevated: true })   // default modal=true
       └─ useRegisterRightPanel → right-rail store
            └─ RightRailHost (single global slot in app shell)
                 ├─ motion backdrop (only if modal)  ← elevated = deeper scrim
                 └─ motion.aside (inset rounded card)
```

Key files:

| File | Role |
|---|---|
| `src/components/station/ReceivingDetailsStack.tsx` | Panel content (Progress / Items / delete) |
| `src/components/right-rail/DetailStackRailRegistrar.tsx` | Registers node; `elevated` / `modal` flags |
| `src/components/right-rail/RightRailHost.tsx` | Sole render owner: backdrop + aside + Escape + scroll lock |
| `src/design-system/shells/detail-stack/layout.ts` | Geometry + backdrop class tokens |
| `src/lib/right-rail/store.ts` | Priority stack; one visible top occupant |

### 3.2 Geometry tokens (literal)

From `DETAIL_STACK_LAYOUT` / backdrop classes:

| Token | Value |
|---|---|
| Aside width | **420px** (fixed for modal occupants) |
| Viewport inset | **12px** on all sides (`top/right/bottom/left` via style) — card floats over the (dimmed) global header, not under it |
| `headerOffsetPx` | **40** — used by **assistant dock** flush layout only, not by the inset detail card |
| Modal backdrop | `bg-scrim/55 backdrop-blur-[2px]` @ `z-panelBackdrop` |
| **Elevated** backdrop (receiving) | `bg-scrim/70 backdrop-blur-md` @ `z-detailStackBackdrop` — **darker** than default |
| Aside surface | `rounded-2xl border … shadow-2xl` floating card |
| a11y (modal) | `role="dialog"` · `aria-modal="true"` · body scroll lock · Escape + backdrop click dismiss |
| Non-modal path (already coded) | `modal={false}` → no backdrop, `role="region"`, optional `useHorizontalEdgeResize`, width persist |

Receiving details today: **`elevated: true`, `modal` unset → modal + deepest scrim.**

### 3.3 In-house spatial cousins (already in production)

| Pattern | Where | Spatial model | Scrim? |
|---|---|---|---|
| MasterNav page list | `SidebarNavColumn` / `MasterNavView` | **Push column** (240px) — moves the frame | No |
| Recents | `HeaderRecentsSwitcher` → `AnchoredLayer` | **Floating popover** under header icon | No (layer only) |
| Mode switcher | `HeaderModeSwitcher` → `AnchoredLayer` | Same | No |
| Assistant dock | `RightRailHost` id `assistant` | Flush right dock, non-modal by identity | No |
| Receiving details | `ReceivingDetailsStack` | Inset floating **card** | **Yes (elevated)** |
| Order details (dashboard) | Same host | Same card | Yes (default) |

**House history note:** MasterNav explicitly **killed** an `AnchoredLayer` flyout that overhanged the canvas and standardized on **push**. Product is now asking the **right** edge to feel more “Claude floating / push” and **less** modal. Name whether that is one principle (“navigators push, inspectors float non-modally”) or a contradiction with the left-edge decision.

### 3.4 What the panel is for (job, not chrome)

Primary jobs when this panel opens from Unbox / Incoming:

1. Confirm **identity** (Order # / PO) — now hover/click-to-copy.
2. Read **pipeline progress** (Scanned → Unboxed → Received) and stamps.
3. Skim **items** on the carton.
4. Occasionally jump to **Unbox** workspace (CTA only when readiness = `continue_unbox`).
5. Rarely **delete** the carton.

It is **not** the primary line-edit surface (`LineEditPanel` / Unbox workspace). Matching Zoho / editing PO lines was deliberately removed from this header. Treat the panel as **inspect + light navigation**, not a claim wizard or full editor.

---

## 4. The research question

Strip product names:

> Given a dense ops queue or station, how should a **secondary inspect surface** for one record appear in 2026 — as a **modal slide-over with full-app scrim**, as a **non-modal floating card** (Claude-like top-level chrome), as an **in-flow push that squeezes the collection**, or as a **dedicated route** — when the operator’s next action is usually “close and continue the queue,” not “complete a blocking decision”?

Named comparison targets (minimum set — expand with citations):

| Class | Examples to research |
|---|---|
| AI / productivity shells | **Claude** (desktop + web side/project panels), ChatGPT sidebar, Cursor agent panel, Notion AI side peek |
| Issue / work trackers | Linear issue peek / full view, Height, Jira, Asana |
| Databases / ops grids | Notion database side peek / center peek, Airtable expand, Retool drawer |
| Commerce / billing admin | Shopify admin resource sidebar, Stripe Dashboard detail |
| Fulfillment / WMS | ShipStation, Locad/ShipBob-class consoles, Manhattan/Blue Yonder operator UI patterns (published UX where available) |
| Accessibility law | WAI-ARIA APG dialog vs non-modal window / complementary patterns; when `aria-modal` is a lie |

Also answer: has 2024–2026 fashion moved **away** from scrimmed drawers for *inspectors* while keeping scrims for *destructive / multi-step decisions*?

---

## 5. Candidate models (force a ranking)

Rank these for **ReceivingDetailsStack** specifically (not for File-a-claim, not for new-order entry):

| ID | Model | Sketch |
|---|---|---|
| **A** | Keep modal + elevated scrim | Status quo |
| **B** | Same floating card, **drop scrim** (`modal={false}`) | Cheap; host already supports it; card still overlays |
| **C** | Claude-like **floating top-level** card with larger inset / shadow, non-modal, Escape closes, **map stays interactive** | Overlay without burial |
| **D** | **Push/squeeze** the workbench/station column (in-flow width) | True layout push; motion-law conflict (see §6) |
| **E** | Dedicated route (`/carton/[id]` already exists for read) | Leave station/workbench; open canonical page |
| **F** | Hybrid: non-modal float ≥ breakpoint X; modal or full-route below X | Breakpoint rule required |

For each ranked option, state: modality, whether the collection stays readable/clickable, resize behavior, Escape ownership, and how it composes with an already-open Unbox `LineEditPanel` / workspace overlay (`elevated` was invented for that stacking case).

---

## 6. Hard constraints (do not hand-wave)

### 6.1 Shared host blast radius

`RightRailHost` is **house SoT** for ~11+ occupants. Changing default modality or turning every elevated panel into a push column affects Dashboard orders, FBA, repair, SKU, unfound, support, etc.

**Prefer:** a **per-occupant** contract (`modal` / geometry variant) or a **receiving-only** elevated recipe — unless industry + product say the whole host should flip.

### 6.2 Motion law

House rule: motion is **opacity + transform**; avoid animating layout `width`/`height` for major presence. A literal push/squeeze of the main column is a **layout animation**. Resolve explicitly: instant reflow, `grid-template-columns` transition, transform fake-push, or reject push for that reason.

### 6.3 Viewport arithmetic (reuse dashboard brief’s logic)

At **1440px** with sidebar/context open, a **420px** in-flow push often **starves** the collection below usable width. Any “yes, push” verdict must say what yields: auto-collapse context panel, narrower inspector (≤320), persisted resize, or overlay-not-push below a breakpoint.

Receiving Unbox often has a **context panel + station column** already — push math is tighter than a bare dashboard table **(inferred — verify typical Unbox viewport with spine + rail open)**.

### 6.4 Stacking with workspace overlays

`elevated` exists because details open **over** Unbox/Triage workspace overlays. A non-modal float must still **clear** those layers in z-order without needing a scrim to “win” focus. State the z-band contract.

### 6.5 a11y

If the map stays interactive, **`aria-modal="true"` is false advertising**. Non-modal ⇒ no focus trap, no scroll lock, careful Escape (cell editors / popovers already claim Escape via `useAnyOverlayOpen`).

---

## 7. Decisions — take a side on each

### D1. Primary spatial model for ReceivingDetailsStack

**Current:** Modal elevated slide-over card + deep scrim (A).  
**Ask:** Pick A–F as primary. If hybrid, state the breakpoint.

### D2. Scrim policy

**Current:** Elevated scrim always when this panel is open.  
**Ask:** Never / only for delete confirm / only when a workspace overlay is also open / always. Defend with ARIA + ops UX.

### D3. Claude-likeness — what to copy vs ignore

**Ask:** Which Claude (or Cursor/ChatGPT) traits are load-bearing for this ops panel — floating card elevation, no dim, push of chat transcript, persistent dock, rounded inset from viewport edge — and which are chat-product accidents that would fight Kinetic Ledger density?

### D4. Relationship to MasterNav push + Recents float

**Ask:** State one principle that covers left spine push, Recents popover, and this right details surface — or say the product requests are inconsistent and which request to refuse.

### D5. Host strategy

**Ask:** (i) Flip only `ReceivingDetailsStack` to `modal={false}` (+ optional geometry tweak); (ii) add a third host variant (“floatDock”) for inspect panels; (iii) migrate all detail occupants to non-modal; (iv) leave host alone and route receiving inspect to `/carton/[id]`. Pick one.

### D6. Interaction with Unbox workspace

**Ask:** When LineEditPanel / workspace overlay is open and operator opens details, should details replace, stack above non-modally, or refuse and deep-link? Today elevated modal stacks with scrim.

### D7. Resize

**Ask:** Modal keeps fixed 420px. Non-modal host already supports edge resize + localStorage. Should receiving details become resizable when non-modal?

### D8. Motion

**Ask:** Keep `framerPresence.detailStackOverlay` scale+opacity; or switch to a push-keyed reflow with no scale; or Claude-like fade+slide with no scrim fade.

---

## 8. Open questions (answer with sources)

1. What is the **2026 dominant pattern** for inspect-one-record beside an ops queue — cite ≥6 named products and whether they dim.
2. When is a **scrim correct** for a record inspector vs a multi-step decision dialog?
3. How do **Claude / Cursor / Notion side peek** treat the content underneath (interactive? dimmed? pushed?) — measured behavior, not marketing.
4. Does WAI-ARIA APG endorse non-modal “inspector windows,” and what role/name pattern do mature products use?
5. For **warehouse / receiving** desks specifically, do published WMS UX patterns prefer overlay, split, or full-page for carton/PO inspect?
6. Given §6 arithmetic on Unbox (spine + context + station), is **push** implementable without auto-collapsing chrome? Show the math.
7. Is **`modal={false}` on the existing card** sufficient to match the operator’s “Claude-like” ask, or is a distinct float geometry required (inset, max-height, shadow, gap from GlobalHeader)?
8. Should `/carton/[id]` absorb inspect-from-search while Unbox keeps a **non-modal** peek — CQRS-style — and if so how do you avoid the carton-read UX failure already documented?
9. **Phasing:** what can ship in one engineer-day that operators feel (scrim off?) vs multi-day host/layout work?
10. **Verdict one-liner** for ReceivingDetailsStack + recommended house rule for other `elevated` detail stacks.

---

## 9. Response format

1. **Executive verdict** (≤10 lines): primary model + modality + whether scrim dies.
2. **Industry benchmark table** (product × pattern × dims? × pushes?).
3. **§7 decisions** — one subsection each, pick a side.
4. **§8 answers** with links/citations.
5. **Implementation sketch** for Cycle Forge: exact props/flags on `DetailStackRailRegistrar` / `RightRailHost`, z-bands, Escape, resize, and what *not* to change for Dashboard yet (or say flip house-wide).
6. **Explicit disagreements** with house motion law, MasterNav push history, or the dashboard sibling brief — name and resolve.

---

## 10. Out of scope

- Restoring Edit PO / Search Zoho PO header CTAs (removed by product).
- Claim modal architecture ([`receiving-claim-modal-auto-ticket-GEMINI-RESEARCH-BRIEFING.md`](./receiving-claim-modal-auto-ticket-GEMINI-RESEARCH-BRIEFING.md)).
- Redesigning Progress/Items tab content.
- Committing / branching — research only until product ratifies a verdict.
