---
target: Option A SectionTabsSlider segmented + overflow drawer
total_score: 24
p0_count: 2
p1_count: 2
timestamp: 2026-07-23T04-33-39Z
slug: src-design-system-components-sectiontabsslider-tsx
---
Method: dual-agent (A: 34f41b14-beb4-4cc3-bef3-c67bfdbcf12e · B: dc2b4d62-ac36-4eb2-942b-d974eb50be49)

# Critique — Option A for SectionTabsSlider

**Target:** `src/design-system/components/SectionTabsSlider.tsx` (proposed redesign)
**Proposed:** Labeled segmented control (≤5) + `[⋮ More]` overflow drawer for Investigation tools
**Vs current:** Icon-only recessed pills + HoverTooltip + active eyebrow

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | Active-in-overflow state unspecified |
| 2 | Match System / Real World | 2 | "Investigation tools" ≠ packing/floor language |
| 3 | User Control and Freedom | 3 | Shallow menu still one-click ok |
| 4 | Consistency and Standards | 1 | Risks forking TabSwitch hard rule |
| 5 | Error Prevention | 3 | Labels beat icon mis-taps |
| 6 | Recognition Rather Than Recall | 3 | Labels win; overflow hides recognition |
| 7 | Flexibility and Efficiency | 2 | Extra click for Support/Ticket on Packing |
| 8 | Aesthetic and Minimalist Design | 3 | Strip quieter; drawer not minimal |
| 9 | Error Recovery | 2 | Weak when lost inside More |
| 10 | Help and Documentation | 3 | Labels reduce tooltip dependency |
| **Total** | | **24/40** | **Needs work** |

## Anti-Patterns Verdict

**FAIL if shipped as-specified; PASS if amended.**

LLM: Direction is house-native (labeled segments = TabSwitch family). As-specified tells that flip to fail: generic `⋮ More`, "Investigation tools" taxonomy, new segmented chrome beside TabSwitch, soft drawer for a mode switch.

Deterministic scan: 0 findings on SectionTabsSlider + TabSwitch (exit 0). Detector does not cover DS-ratchet. Source facts: icon-only h-8 w-9 raw buttons, HoverTooltip + aria-label, no focusRing, SectionTab.count unused.

Visual overlays: skipped — localhost auth-gated (/unbox → /signin); browser tab not holdable.

## Overall Impression

Option A correctly kills mystery-meat icons and caps Hick's Law on Packing's 6 peer tabs / Unbox's ~9. As-specified, overflow is over-abstracted: a global Investigation drawer invents a second story and buries Support/Ticket where they are operational paths. Ship the labeled primary strip; rewrite the overflow contract.

## What's Working

1. Text labels replace icon decoding — Kinetic Ledger throughput.
2. Constraining visible peers on Packing (6) / Unbox (9 gated) is the right ops instinct.
3. Larger text segments beat 32×36 icon pills for floor touch targets.

## Priority Issues

**[P0] Overflow IA misnames the work**
- What: Support/Ticket/Timeline dumped under "Investigation tools"
- Why: On Packing these are operational paths; station rules treat them as sibling tabs; burying raises claim latency
- Fix: Station-authored primary vs secondary in tab defs — not a global Investigation drawer
- Command: /clarify then /distill

**[P0] Forks Tab Switcher SoT**
- What: Spec implies new segmented control skin
- Why: DS hard rule: tab-like UI → TabSwitch; two sliding-pill languages banned
- Fix: Grow SectionTabsSlider labeled treatment composing TabSwitch variants; keep content ownership / hidden mount / rightSlot
- Command: /normalize + /extract

**[P1] Drawer is wrong container**
- What: Overflow opens a localized drawer
- Why: Competes with entity chrome, photo peek, terminal dock for a 200ms mode switch
- Fix: Compact popover/menu of labeled rows; overflow only changes value
- Command: /quieter + /harden

**[P1] Active-in-overflow unspecified**
- What: Static More while Ticket selected
- Why: Operators lose "where am I?" — worse than icon mystery meat
- Fix: Overflow trigger becomes active secondary label (e.g. Ticket ▾)
- Command: /adapt

**[P2] Global max 5 / core 3–4 ignores call-site shape**
- What: One numeric cap for all stations
- Why: Shipping often ≤3 (no overflow); Unbox can be 9; Support Orders Ticket/Support ARE primary
- Fix: priority: primary|overflow per tab def; overflow chrome only when needed
- Command: /arrange

## Persona Red Flags

**Floor packer (ops density):** Packing Checklist→Support path gains an extra click under More; if More doesn't rename to active Ticket, loses place mid-claim.

**Scan-floor Unbox operator:** Labeled Overview/Checklist/Units is a clear win vs hover glyphs; if Units animates into overflow after serial scan, primary work path vanishes at the wrong moment.

**Support agent on Support Orders:** Option A as-specified must NOT overflow Ticket/Support — those ARE the job. Generic Investigation drawer fails this persona immediately.

## Minor Observations

- Drop redundant active eyebrow once labels are on-segment
- Preserve rightSlot; More must not steal it
- Dynamic tabs must enter primary/overflow by priority
- Render SectionTab.count on segments (currently declared, unused)
- Nested Timeline Units/Tracking slider (≤2) must not get forced overflow
- Prefer "More displays" / station noun over Investigation; never ellipsis-only without accessible name
- Current touch targets h-8 w-9 below 44px floor token — Option A should fix

## Questions to Consider

- Is Support/Ticket a section display on Packing, or entity/console chrome?
- For Unbox, is Tracking primary or covered by Timeline's Tracking spine?
- Should overflow keep icon+label rows while primary is text-only?
- Does the More trigger need quiet state tone when Ticket is active?

## Verdict

Ship with amendments — do not ship Option A as-specified.
