# Research briefing — Station multi-section scroll host (Items + Procedure above floating dock)

> **RULED 2026-08-04 — see [`station-multi-section-scroll-host-RULING.md`](./station-multi-section-scroll-host-RULING.md).**
> This brief and its research response are provenance; that doc is the terminal artifact and is
> now pinned into `.claude/rules/ui-design-system.md` (Scroll ownership) and
> `.claude/rules/display/station-workbench.md` (Multi-section scroll host). Read the ruling before
> implementing — it corrects three of the research findings below.

**For:** Gemini Pro (deep research). Genuine open question — **do not treat any candidate
architecture below as ratified.** Engineering needs industry-standard product/UX evidence before
pinning Source-of-Truth law. **The Motion-API half of this question is already answered — read
[`station-multi-section-scroll-host-MOTION-FINDINGS.md`](./station-multi-section-scroll-host-MOTION-FINDINGS.md)
first.** It is validated, cited, quote-for-quote against the live Motion+ docs (2026-08-04) and
against this repo — do not re-derive or second-guess the Motion mechanics it settles. This brief
has been trimmed to what that doc could **not** answer: product information architecture, browser/
CSS behavior outside Motion's surface, and industry precedent.

**From:** Cycle Forge engineering
**Date:** 2026-08-03 (product brief) / revised 2026-08-04 (trimmed against Motion findings)
**Branch context:** WS-DOGFOOD (`main`), working tree may differ
**Subject:** How a **Station** centre column should host **N named stacks** (Unbox golden:
**Items** reference + **Procedure** Smart Stack) under one divider **above a floating composer /
terminal dock**, such that:

1. Clicking a stack **fully expands** that section for triage / work (its own honest scroll).
2. Sibling stacks collapse to **chrome headers** (not competing scrollports).
3. The **selected / focus surface never paints behind** the absolute bottom dock.
4. Procedure **Smart Stack** card modes stay a **separate layer** from section expand.

**Status of code:** Candidate only. **Do not implement** until this brief returns decisions an
engineer can type into constants and rule files. Prior internal plan
(`StationSectionHost` + clearance CSS var) is a **hypothesis to validate or replace**, not a ship
order. Its Motion-animation mechanism (bare `layout` + `LayoutGroup` + single `activeId`, not a
shared-element modal) is now settled — see the findings doc §2. What remains open is everything
below.

**Companion briefs (do not contradict without naming the amendment):**

| Brief | Relationship |
|---|---|
| [`station-multi-section-scroll-host-MOTION-FINDINGS.md`](./station-multi-section-scroll-host-MOTION-FINDINGS.md) | **Read first.** Validated Motion API answers this brief no longer asks for — corrections to `layoutAnchor`/`layoutRoot`/`layoutScroll` claims, the settled animation mechanism, a live P0 bug found along the way |
| [`procedure-focus-deck-smart-stack-GEMINI-RESEARCH-BRIEFING.md`](./procedure-focus-deck-smart-stack-GEMINI-RESEARCH-BRIEFING.md) | **Shipped** Procedure Focus Deck + Smart Stack + `procedure.advance` motion — this brief **extends** the *host above the deck*, does not re-open HIDING / RE-SORTING |
| [`unbox-procedure-stack-MOTION-GEMINI-RESEARCH-BRIEFING.md`](./unbox-procedure-stack-MOTION-GEMINI-RESEARCH-BRIEFING.md) | Older motion/depth brief; Smart Stack is now shipped — use for refused pile history only |
| [`scan-station-procedure/LANE-B-deck-motion-scroll.md`](./scan-station-procedure/LANE-B-deck-motion-scroll.md) | Scroll ownership, nested-port traps, clearance variants — **binding failure modes** |
| [`scan-station-procedure/LANE-G-dock.md`](./scan-station-procedure/LANE-G-dock.md) | Dock zones + clearance travel together (aspirational declaration) |
| [`dock-receiving-vs-unbox-GEMINI-RESEARCH-BRIEFING.md`](./dock-receiving-vs-unbox-GEMINI-RESEARCH-BRIEFING.md) | Dock shell vocabulary (separate question) |

**Binding law today (do not contradict without naming the amendment):**

- `.claude/rules/source-of-truth.md` → **Scan-station procedure focus deck** (prominence: deck > items > checklist > dock)
- `.claude/rules/display/station-workbench.md` → Procedure Focus Deck · dock scroll clearance · **exactly ONE scroll port** (today)
- `.claude/rules/ui-design-system.md` → **Scroll ownership** — child is CONTENT; orphan `flex-1 overflow-y-auto` in `space-y-*` is a known Unbox void bug
- `.claude/rules/display/motion-crossfade.md` → sanctioned layout #2 = `procedure.advance` only on Procedure Focus Deck step advance
- `.claude/rules/display/station.md` → Procedure cockpit
- `.claude/rules/display/instrument-panel.md` → P2 Procedure is the product

---

## 0. How to use this brief

You do **not** have the codebase. Every constant and path below was measured on **2026-08-03/04**.
Where we say "shipped", an engineer can grep the path. Where we say "candidate", nothing is built.
Where a section says **"ANSWERED — see findings doc"**, do not spend research budget on it; a short
acknowledgment that you read it is enough.

**Six deliverables remain**, priority order (two of the original eight — layer-separation mechanism
and the "which Motion prop" half of scroll ownership — are now settled by the findings doc and
removed from this list):

1. **Rule on floor ownership** (§3) — pick or name the industry idiom for N sections under one
   column with click-to-maximize one section above a persistent bottom chrome. **Still fully open.**
2. **Rule on browser/CSS scroll behavior** (§4) — `scroll-padding-bottom` + sticky `bottom`
   interaction with an absolute floating dock; nested-scroll CSS contract. **Still open — this is
   NOT a Motion API question**, see findings doc §3.
3. **Rule on dock clearance SoT** (§5) — one rem token driving body pad + sticky inset +
   scroll-padding vs live `ResizeObserver` of dock height. Named product evidence. **Still open.**
4. **Rule on default hero** (§7) — procedure owns floor by default vs split resting state; when
   Items may temporarily outrank the deck. **Still open — a product question.**
5. **Rule on motion DURATIONS** (§8) — not the mechanism (settled), the actual industry-standard
   numbers for a panel-maximize interaction. **Narrowed, still open.**
6. **Refuse / accept the refuse list** (§9) — keep, amend, or replace each ban with named precedent.
   **Two rows pre-settled** by the findings doc; the rest still open.

Answer the surviving §11 numbered questions with **named products + measured patterns** — not "some
apps do this." Prefer a decision an engineer can **type into a constant or rule file**.

---

## 1. Product vocabulary

**Cycle Forge** — multi-tenant reseller-ops SaaS (B2B warehouse/fulfillment). UI identity **Kinetic
Ledger**: dense, scan-aware, quiet chrome. Dogfood tenant USAV; product framing is sellable SaaS.

**Region:** **Station** workbench — scanner-driven, act-and-clear, one carton at a time.

| Fact | Value |
|---|---|
| Display (desktop bench) | 1080p landscape, ~3 ft viewing distance |
| Centre column width | ~720px workbench column |
| Posture | Standing; hands on product + keyboard-wedge scanner |
| Primary input | Barcode scanner (focus-locked wedge), not pointer |
| Eyes | On product most of the time; screen glanced between acts |
| Session | One carton, ~7–13 capture steps, minutes not hours |
| Bottom chrome | Floating absolute dock (`z-fab`) — step CTA + notes + Print/Receive — **not** in document flow |

---

## 2. What shipped (2026-08-03) — measured anatomy

### 2.1 Centre column today — ONE scrollport, two content siblings

| Slot | Component | Mount | Geometry |
|---|---|---|---|
| Identity | `StationContextBar` | Absolute float above canvas | Top clearance via `reserveIdentityClearance="stacked"` |
| Items | `UnboxItemsPanel` | `StationWorkbench` `entityContext` | `mb-auto` top-pin against `bodyAlign="end"` |
| Procedure | `UnboxProcedureDeck` → DS `ProcedureDeck` | `StationWorkbench` `children` | Bottom-packed; Smart Stack pile |
| Dock | `UnboxDockHost` + pager + step CTA + terminal | Sibling of scrollport | `slicedActionDockWrapperClass({ docked: false })` — `absolute inset-x-0 bottom-0 z-fab` |

**Host:** `StationWorkbench` — single `overflow-y-auto` port; when `bodyAlign="end"`, inner column is
`min-h-full flex flex-col justify-end gap-4` (not `space-y-*`, so `mb-auto` survives).

**Clearance today:** `reserveScrollClearance="pager"` → `STATION_TERMINAL_PAGER_SCROLL_CLEARANCE` =
`pb-40` (**10rem**) body padding only. Default float docks use `pb-32` (**8rem**).

**Focus sticky (SHIPPED — known bug class):** Procedure focus card uses `sticky bottom-0 z-30` +
`scrollIntoView({ block: 'end' })`. Sticky and `scrollIntoView` target the **scrollport floor** —
the same edge the absolute dock paints over (`z-fab` = 90 > card `z-30`). Body `pb-40` clears
**in-flow** end content only; it does **not** inset sticky or `scrollIntoView`. Observed failure:
active step label / evidence card slides **behind** the dock ("Face is right" / "Print label").
**Confirmed via findings doc §3: this is a pure CSS/browser interop question — Motion's `useScroll`
only reads scroll position, it never touches `scrollIntoView` or `scroll-padding` itself, so no
Motion prop resolves this. It stays entirely a §4/§11 question below.**

There is **no** `scroll-padding-bottom` on the Station scrollport today. There is **no** sticky
`bottom` offset matching clearance.

**Separately, and independent of everything in this brief:** the findings doc §1.4 identifies a
live, unrelated defect — `StationWorkbench.tsx:142`'s scroll port is a plain `<div overflow-y-auto>`
missing Motion's `layoutScroll` prop, while `ProcedureDeck` runs `layout="position"` inside it. Five
other places in this repo already do this correctly. **This should be filed and fixed as its own
ticket; it does not block or depend on anything in this research round.**

### 2.2 Procedure Smart Stack (SHIPPED — do not re-litigate membership)

Pure function `layoutProcedureStack` in `procedure-stack-layout.ts`:

| Constant | Value |
|---|---|
| Face height | **4.5 rem** — inactive full/peek faces share ONE height |
| Peek sliver | **0.875 rem** |
| Gap between fulls | **0.75 rem** |
| Focus body | **Natural height** (eyebrow + evidence) |
| Covered | `h-0` zero flow, mounted, vocabulary order preserved |

**Law:** Hover **arms** crown wheel scrub; it does **not** expand the pile. HIDING and RE-SORTING
remain banned (`UnboxCaptureStack` deleted at `33a3eb609` — hid pending / re-sorted completed).

**Motion on step advance:** `motionRole.procedure.advance` — slow layout settle (house law cites
**0.55s** `motionBezier.layout` / Motion `layout` FLIP into rem targets; validate against the
companion Smart Stack brief if durations disagree). Content crossfade via `swap.scan`.

### 2.3 Items panel (SHIPPED — pin only, no expand)

`UnboxItemsPanel` is a **static reference list** (what is in the box) — not a procedure step, not a
live progress accumulator. Ruled 2026-08-02: `contents` stays a deck step; Items stays chrome.
**No** click-to-expand, **no** immersive triage mode, **no** nested scroller.

### 2.4 Ascii — current vs desired (operator ask)

**Current (shipped):**

```
┌─ StationContextBar (float) ─────────────────────────────────────┐
├─ UnboxItemsPanel (always visible, mb-auto pin) ─────────────────┤
│  … free space …                                                  │
│  [procedure Smart Stack — focus sticky bottom-0]                 │
│  ┌─ focus evidence ───────────────────────────────────────────┐ │
│  └─────────────────────── often under dock ───────────────────┘ │  ← BUG
╞═ absolute floating dock (z-fab) ═════════════════════════════════╡
│  [step CTA]  [notes]  [Print · Receive]                          │
└──────────────────────────────────────────────────────────────────┘
```

**Desired (operator / engineering ask — NOT shipped):**

```
┌─ StationContextBar (float) ─────────────────────────────────────┐
├─ SECTION HOST (one divider / one floor owner) ──────────────────┤
│  ▢ Items chrome (collapsed)     OR   ▣ Items IMMERSIVE scroll   │
│  ▣ Procedure IMMERSIVE / work   OR   ▢ Procedure chrome         │
│     (Smart Stack lives ONLY inside Procedure section)            │
│  Focus / expanded body ALWAYS fully visible above dock plane     │
╞═ absolute floating dock (z-fab) — clearance plane ═══════════════╡
└──────────────────────────────────────────────────────────────────┘
```

Click Items → Items fills floor, own scroll, triage everything. Click Procedure → Procedure fills
floor, Smart Stack works. Never two competing immersive scrollers. Never focus behind dock.

**Mechanism for the section-swap animation itself is now settled** (findings doc §2.2–2.3): bare
`layout` on each section (a flex/grid item whose size changes via class/style swap), both siblings
wrapped in one `LayoutGroup`, floor ownership driven by a single `activeId` state value in the shape
of Radix `Accordion.Root type="single"` (one value, one setter, `isOpen = value === id`). **Do not
design a shared-element (`layoutId`) modal/overlay mechanism** — Motion's own closest example for
"card expands to detail" (`app-store`) uses exactly that, and it's the wrong grammar here: it
produces a full-screen scrim takeover, which conflicts with Kinetic Ledger's non-modal pick+edit law
for this class of surface. This is settled; do not revisit the *mechanism*. What §3 below asks is
the *product* question — **when**, **by default**, and **how much** a section should claim.

### 2.5 Near-misses already in-tree (compose vs invent)

| Pattern | Path / note | Fit? |
|---|---|---|
| `CaptureStack` | DS bottom-anchored feed; **owns** its own `overflow-y-auto`; mobile | Cousin for one feed — **not** multi named sections |
| `UnboxCaptureStack` | **Deleted** — hid/re-sorted steps | **Refuse revival** |
| `ExpandableSection` | Deleted 2026-07-31 | Gone |
| `CollapsibleGroupRow` / `PoLinesAccordion` | Row disclosure | Not viewport floor ownership |
| `ContextPanelLayout` | Horizontal width resize/collapse | Wrong axis |
| Workbench master–detail | Map \| detail horizontal | Wrong recipe |
| CSS scroll-snap on nested procedure port | Tried; dead port / empty voids | **Refuse** without definite height + host snap |
| `SELECTION_BAR_SCROLL_INSET` | Named pad for pinned bulk bar | Closest **clearance SoT** analogue |

---

## 3. Floor ownership — industry idiom research ask (fully open)

### 3.1 Candidate model (hypothesis — validate or replace; mechanism settled, shape is not)

**`StationSectionHost`** (name free to change): vertical host between identity and dock.

- **Sections:** named (`items`, `procedure`, …); each has **chrome** (collapsed) + **body** (floor).
- **Exactly one floor owner** at a time.
- **Default (work mode):** `activeId = procedure` — preserves prominence law (deck is hero).
- **Immersive:** click section chrome → that section `min-h-0 flex-1 overflow-y-auto` fills space
  above dock; siblings → `shrink-0` chrome only.
- **Escape:** click other chrome or explicit return-to-procedure.
- **Animation mechanism (settled — see findings doc §2.2–2.3):** bare `layout` per section +
  `LayoutGroup` wrapping both + single `activeId` state, Radix `type="single"` shape.

### 3.2 Industry analogues to measure (name products + behavior)

Research and compare at least these classes — cite **which product**, **what expands**, **what
scrolls**, **whether bottom chrome stays**:

| Class | Examples to investigate | Question |
|---|---|---|
| IDE panel maximize | VS Code / JetBrains panel maximize, Cursor | Does maximize steal the editor scrollport or nest? |
| Issue / doc peek→full | Linear issue peek, Notion toggle/full page, Height, Plane | Click expand → own scroll? Sibling chrome? |
| Mail conversation | Apple Mail, Superhuman, Outlook reading pane | Multi-pane + focused scroll |
| Chat + thread | Slack thread panel, Discord, Teams | Composer dock + thread scroll clearance |
| POS / ticket | Shopify POS, Square, Toast, Lightspeed | Ticket lines vs pay dock; expand line list |
| WMS directed workflow | Manhattan, Blue Yonder, Fishbowl mobile, Cin7, Zebra apps | Steps + reference list + bottom action |
| Apple system | watchOS Smart Stack (card layer only), iOS Mail, Finder column | Do **not** conflate Smart Stack with section host |
| Design tools | Figma left panels, Adobe | Panel collapse + single active scroll |

**Deliverable:** Name the **closest honest idiom** for a 720px Station column at 3 ft. If none fit,
name a **hybrid** and say which half is Station-shaped. **Explicitly rule out** (or defend, with
evidence, overriding) the shared-element full-screen-takeover pattern — it is the one Motion's own
docs would suggest by default, and engineering has already decided against it (§2.4); only reopen
that if you have a strong, named reason.

### 3.3 Open product questions

1. Is **default procedure floor + Items chrome** correct, or should resting state be a **split**
   (both partially visible) until click? Split is what Unbox ships today (`mb-auto` + bottom pack).
2. When Items is immersive, should Procedure chrome sit **above** Items, **below** Items (against
   dock), or as a **thin bottom strip** above the dock only?
3. Must section chrome remain **scanner-safe** (no focus steal)? Wedge owns focus — any expand
   control must hand focus back like Unbox face clicks do today.

---

## 4. Scroll ownership — browser/CSS geometry research ask (NOT a Motion API question)

**Confirmed by the findings doc (§3):** Motion has no opinion on any of this. `useScroll` only reads
scroll position as motion values; it never calls `scrollIntoView`, never sets `scroll-padding`, and
is layout-model-agnostic (grid vs flex is a pure CSS-authoring choice, not an animation-compatibility
one). Everything below is genuinely open and belongs to MDN/browser-engine research and named product
precedent, not Motion.

### 4.1 House failure mode (measured)

Orphan `flex-1 overflow-y-auto` inside a `space-y-*` / non-definite-height ancestor:

- Port never height-constrains → does not scroll
- `h-full` / `snap-*` / `min-h-*` become dead CSS that still occupies space
- Unbox procedure column shipped this once (2026-08-02) — empty white voids

Law today: **exactly ONE scroll port**; deck is CONTENT. Candidate model **amends** this to:
**exactly one ACTIVE immersive scrollport**, legal only inside a height-constrained section floor.

**One new wrinkle from the findings doc:** if a section's floor ever hosts a `layout`-animated child
(the Procedure section will, via `ProcedureDeck`), the SCROLLABLE ancestor around it must carry
Motion's `layoutScroll` prop or Motion's projection math for anything inside will silently be wrong
on scroll (§1.4 of the findings doc). This is a **constraint on whichever CSS pattern you recommend
below** — whatever scrollable element you land on for the Procedure section's immersive floor, it
must become (or be wrapped in) a `motion.div layoutScroll`, not a plain `<div>`. Factor this into
your CSS recommendation; it is not itself a Motion research question (the prop is settled), just a
"remember to apply it here" note.

### 4.2 React / CSS patterns to evaluate (industry standard)

Tell us which are **best practice for 2026 React** (Next.js / App Router irrelevant) for this exact
geometry — with **when they fail**:

| Pattern | Mechanism | Research ask |
|---|---|---|
| Flex definite height | Parent `h-full min-h-0 flex flex-col`; child `min-h-0 flex-1 overflow-y-auto` | Is this the canonical "nested scroll is legal" recipe? Cite MDN / Chrome / React docs or major design systems |
| CSS grid `1fr` floor | `grid-template-rows: auto 1fr auto` (chrome / floor / chrome) | Prefer over flex for section host? |
| `scroll-padding-bottom` | On scrollport, rem = dock clearance | Does it fix `scrollIntoView({ block: 'end' })` under absolute docks? Browser quirks? |
| Sticky `bottom` inset | `position: sticky; bottom: var(--clearance)` | Correct for focus card above absolute dock? Interaction with `overflow` ancestors? |
| Content `padding-bottom` only | Today's `pb-40` | Confirm: **insufficient** for sticky / scrollIntoView — or are we wrong? |
| CSS custom property | `--station-scroll-clearance` set by host, read by sticky + padding | Industry precedent (safe-area, toolbar height vars)? |
| Container queries | `@container` for section chrome density | Useful or overkill at 720px fixed column? |
| `dvh` / `svh` / safe-area | Mobile later | Desktop 1080p — ignore or still set env? |
| Radix / React Aria Disclosure / Accordion | A11y expand | Right for **viewport floor** ownership, or only for in-flow disclosure? (Note: findings doc §2.3 already validates Radix's `type="single"` **state shape** for floor ownership — this row is now only about whether its **height mechanism**, `height:auto`, has any role here. It does not; §2.2 settled that bare `layout` on a flex/grid item is the height mechanism.) |
| `overscroll-behavior` | Contain scroll chaining | Needed when immersive port sits inside outer port? |

### 4.3 Dual-port hazard

If outer `StationWorkbench` keeps `overflow-y-auto` **and** immersive section also scrolls:

- Which port receives wheel when cursor is over Items chrome vs floor?
- Procedure crown scrub today `preventDefault`s wheel on the deck while hover-armed — how does that
  compose with an immersive Items port?
- **Should immersive mode disable the outer port** (outer becomes `overflow-hidden`, only floor
  scrolls)? Prefer a typed rule.

**Deliverable:** A paste-ready **Scroll ownership amendment** (≤10 lines) suitable for
`ui-design-system.md`, stating when a nested port is legal and when it is banned. Include the
`layoutScroll` reminder from §4.1 as a one-line footnote if the recommended pattern lands inside a
`layout`-animated region.

---

## 5. Dock clearance SoT — research ask (fully open, not a Motion question)

### 5.1 Measured constants

| Token | Class | Rem |
|---|---|---|
| `STATION_TERMINAL_SCROLL_CLEARANCE` | `pb-32` | 8 |
| `STATION_TERMINAL_PAGER_SCROLL_CLEARANCE` | `pb-40` | 10 |
| Fallback (no reserve) | `pb-6` | 1.5 |

House leaning: **named fixed rem**, over-reserve when notes composer collapses; **do not** live-measure
dock height per frame (stick point would jump when notes open). Analog:
`SELECTION_BAR_SCROLL_INSET` (`pb-20`) for workbench bulk bar.

### 5.2 Candidate three-consumer clearance (hypothesis)

One rem token drives:

1. Scroll-body padding (`pb-*`)
2. Scrollport `scroll-padding-bottom`
3. Sticky focus `bottom: var(--station-scroll-clearance)`

**Research ask:**

1. Do best-in-class chat/composer UIs (Slack, Intercom, Linear, iOS Messages, WhatsApp Web, Discord)
   use **fixed reserve**, **measured composer height**, or **both**?
2. Is CSS `scroll-padding-bottom` reliably honored by `Element.scrollIntoView({ block: 'end' })` in
   Chromium (warehouse browsers)? Cite known bugs or safe alternatives.
3. Should sticky inset and scroll-padding be **the same rem**, or sticky slightly larger (gap above
   dock hairline)?
4. When notes expand the dock band, is **over-reserve (collapsed height)** still correct, or do
   Material bottom sheets teach a better pattern?

**Deliverable:** Accept three-consumer named rem, replace with measured height, or hybrid — with
product names and the constant an engineer should ship first.

---

## 6. Layer separation — mostly settled, one product question remains

**The mechanism is no longer in question.** Findings doc §2.2–2.4 settles: Layer B (section host)
is bare `layout` + `LayoutGroup` + a single `activeId`; Layer C (Procedure Smart Stack) is the
already-shipped `layoutProcedureStack` pure function + `procedure.advance` motion role, wholly
independent props/code paths from Layer B. They **cannot** structurally conflate — they don't share
a mechanism to conflate. Layer A (dock clearance) is CSS, also structurally separate.

What's left is purely a **product/cognitive-load** question, not an implementation one:

| Layer | Owns | Must not own |
|---|---|---|
| **A — Dock clearance plane** | Rem → pad + sticky + scroll-padding | Which section is active |
| **B — Section host** | Which stack owns the floor; chrome vs immersive | Smart Stack card modes |
| **C — Procedure Smart Stack** | full / peek / covered inside procedure section | Items triage expand |

**Research ask:** Do industry multi-panel products keep these three **concepts** visually/behaviorally
distinguishable to an operator, or do they blend them into one mental model ("one stack" abstraction)
even when the code is separate? Is teaching operators "section expand ≠ card expand" a cognitive
cost at scan cadence, independent of whether the code shares a mechanism?

**Refuse conflation regardless of research outcome** (this part is non-negotiable, not a research
question): Smart Stack hover must **not** become "click expands the pile"; section click must **not**
re-sort or hide procedure steps.

---

## 7. Default hero / prominence — research ask (fully open)

**Shipped prominence** (`source-of-truth.md`):

1. ProcedureDeck (primary)
2. UnboxItemsPanel (reference)
3. Checklist (navigation)
4. Dock (action / hand zone)

**Tension:** Click-expand Items for triage **temporarily** makes Items the visual floor owner —
does that violate “deck must not be outranked,” or is temporary operator-driven triage an allowed
exception (like opening Displays)?

**Research ask:** In directed-workflow / POS / WMS UIs, when a reference list is maximized:

- Does the procedure / ticket / pay dock stay visible?
- Is maximize a **mode** (explicit exit) or a **momentary overlay**?
- What % of session time is the reference list maximized vs the task card? (If rare, chrome+click
  is enough; if frequent, split resting state may be better.)

**Deliverable:** A one-line prominence amendment (or “no amendment — Items immersive is a mode,
default hero unchanged”).

---

## 8. Motion — durations only; mechanism is settled

**Do not re-litigate WHICH Motion API to use** — findings doc §2 settles bare `layout` +
`LayoutGroup`, tween-only (no spring) per the existing `motion-crossfade.md` house law, which the
findings doc independently confirms is the right call for a layout-push job (§2.5: springs are safe
only when nothing else lays out against the animated value's resting position — a section resize is
exactly the case where something does). What's still open is the **actual number**.

| Event | Candidate channel | Must not use |
|---|---|---|
| Step pointer advance inside Procedure | `motionRole.procedure.advance` (shipped, 0.55s) | Section expand motion |
| Section chrome → immersive | New `layout` tween, duration TBD by this research | `procedure.advance` |
| Dock terminal label | Instant / no animate (shipped ban) | Layout tween |
| Crown scrub | Transform+opacity only until notch | Layout |

**Research ask:**

1. Duration/easing for **panel maximize** in VS Code / Linear / Notion / Figma — real numbers, not
   guesses. (One data point already in hand, NOT industry evidence on its own: Motion's own toggle-
   switch and Radix-accordion examples default to `{ type: "spring", visualDuration: 0.2, bounce: 0.2
   }` for a comparable-scale UI change — but per §2.5 that's a spring, and the house has already
   ruled out springs for this job class. Use it only as a rough scale reference, not a value to copy
   wholesale.)
2. Should section expand be **instant** under `prefers-reduced-motion`, or opacity-only?
3. If both section expand and step advance can fire close together, which wins / queues?

---

## 9. Refuse list — keep, amend, or replace

**Two rows below are now pre-settled by the findings doc (marked)** — do not spend research budget
re-opening them; everything else is still open.

| Ban | Why it exists today | Your ruling |
|---|---|---|
| Orphan nested `flex-1 overflow-y-auto` without definite height | Empty voids; snap never engages | Keep? Amend to allow only inside section host floor? |
| Two immersive scrollports at once | Operator cannot know which scroller | Keep absolute? |
| Raise focus `z-*` above `z-fab` to “fix” dock occlusion | Covers CTAs | Keep? |
| Live ResizeObserver dock height for sticky every frame | Stick point jumps; notes open | Keep ban? Allow on notes toggle only? |
| Revive `UnboxCaptureStack` / hide or re-sort steps | Rejected twice | Keep absolute |
| Smart Stack click-expand pile | Hover arms wheel only | Keep? |
| Per-step collapsed face heights | Layout math assumes one `faceRem` | Keep |
| Scroll-linked `animation-timeline` / Motion `useScroll` on step list | Lag at scan cadence; reduced-motion trap | Keep (imperative top-compress exception already carved) |
| Animating dock trailing Print/Receive on step change | Hand zone ≠ hero | Keep |
| **SETTLED — Reach for `layoutAnchor` to fix dock occlusion or scroll clearance** | It corrects nested-`layout`-animation projection math between differently-timed parent/child, unrelated to scroll or `sticky` (findings doc §1.2) | **Refused — do not re-open** |
| **SETTLED — Add `layoutRoot` to the floating dock reflexively** | `layoutRoot` is documented for `position: fixed`; the dock is `position: absolute` (findings doc §1.3) | **Refused unless a specific observed drift bug names it — do not re-open speculatively** |

---

## 10. SoT pin checklist (what engineering will write after you answer)

After research, engineers will pin **only** what you ratify. Expected artifacts:

| Artifact | If you accept candidate | If you replace |
|---|---|---|
| Clearance module | rem + CSS var + pad classes (like `selection-bar-geometry.ts`) | Your named alternative |
| Host | `StationWorkbench` sets var + `scroll-padding-bottom` | … |
| Deck | Sticky consumes var; `availableRem` subtracts clearance | … |
| Section host | New `StationSectionHost` (or your name) — bare `layout` + `LayoutGroup` + single `activeId` (settled mechanism) | Different primitive / no host, if you have strong evidence against the floor-ownership premise itself |
| Law files | `station-workbench.md`, `source-of-truth.md`, `ui-design-system.md` scroll ownership, `.cursor/rules/station-workbench.mdc` | Same files, your wording |
| Guards | No bare `bottom-0` under float dock; ≤1 floor `overflow-y-auto`; new immersive floor must carry `layoutScroll` if it hosts `layout`-animated content | Your invariants |
| Separate ticket (not gated on this research) | `StationWorkbench.tsx:142` needs `layoutScroll` — file independently | — |

**Do not** add a new `AGENTS.md` hard law unless the pin is a one-line portable invariant; depth
belongs in `.claude/rules/*`.

---

## 11. Numbered questions — answer with named product evidence

**Questions 3 and 5 below are the only ones that touch Motion's surface at all, and Motion's docs
explicitly do not answer them (findings doc §3) — they remain full open questions for browser/CSS
research, not Motion research.**

1. **Idiom:** What is the closest industry name for “N section chromes + one maximized floor above a
   persistent bottom action bar” on a desktop ops console? Cite 2–3 products and the measured
   interaction (click / drag / keyboard).

2. **Default owner:** Should work mode default to **procedure floor** or **split** (Items +
   Procedure both partially visible)? Cite warehouse/POS evidence for glanceable reference vs
   immersive triage frequency.

3. **Nested scroll legality:** Write the exact flex/grid CSS contract that makes a nested
   `overflow-y-auto` safe. Cite MDN or a major design system (Adobe Spectrum, Fluent, Material 3,
   Apple HIG Web) that documents it. (Remember the `layoutScroll` footnote from §4.1 if your answer
   lands inside the Procedure section's floor.)

4. **Outer vs inner port:** In immersive mode, should the outer workbench scroller be
   **disabled** (`overflow-hidden`)? Cite products that nest scroll regions under a bottom composer.

5. **`scroll-padding-bottom`:** Does it reliably inset `scrollIntoView({ block: 'end' })` in
   Chromium for absolute overlays? If not, what do Slack/Linear/Intercom use instead?

6. **Sticky + absolute dock:** Is `position: sticky; bottom: <clearance>` the correct pattern for
   “last card above composer,” or should the focus card be **non-sticky** and only the host
   `scroll-padding` + `justify-end` keep it adjacent? Cite chat UIs.

7. **Clearance model:** Named fixed rem (over-reserve) vs ResizeObserver composer height — which
   do best-in-class chat products use in 2025–2026? Give one constant recommendation for Unbox
   pager dock first ship (`10rem` keep / change to X).

8. **Items immersive vs prominence:** Is temporary Items floor ownership compatible with “Procedure
   Deck is the hero,” or must Items triage be a **right-rail / Displays** surface instead? Cite
   products that maximize a reference list without demoting the primary task.

9. **Motion duration:** Recommended duration + easing (as a tween — springs are ruled out for this
   job class, see §8) for section maximize/collapse at standing 3 ft glance; confirm it must **not**
   share `procedure.advance`'s 0.55s.

10. **A11y:** For section expand controls at a scan station (wedge focus-locked), should expand be
    pointer-only, or also keyboard — and how do you avoid stealing scan focus? Cite WCAG + one
    industrial UI.

11. **Mobile later:** When the same section host ports to phone + bottom thumb dock, does the
    desktop definite-height flex contract transfer, or do mobile products use a different pattern
    (full-screen route per section)?

12. **Failure mode:** If immersive Items list is long and Procedure chrome is a 40px strip above
    the dock, is that strip enough for “return to work,” or do products use a persistent FAB /
    back chevron? Cite.

---

## 12. Files to cite if you get repo access later

| Concern | Path |
|---|---|
| Workbench host + clearance wiring | `src/components/station/workbench/StationWorkbench.tsx` |
| Clearance tokens | `src/components/station/terminal/StationTerminalDock.tsx` |
| Float dock placement | `src/design-system/primitives/SlicedActionDock.tsx` → `slicedActionDockWrapperClass` |
| Unbox composition | `src/components/receiving/workspace/LineEditPanel.tsx` |
| Items panel | `src/components/receiving/workspace/line-edit/UnboxItemsPanel.tsx` |
| Procedure adapter | `src/components/receiving/workspace/line-edit/UnboxProcedureDeck.tsx` |
| DS Smart Stack | `src/design-system/components/procedure/ProcedureDeck.tsx` |
| Layout math | `src/design-system/components/procedure/procedure-stack-layout.ts` |
| CaptureStack cousin | `src/design-system/components/capture-stack/CaptureStack.tsx` |
| Selection bar clearance analogue | `src/design-system/components/selection-bar-geometry.ts` |
| Scroll ownership law | `.claude/rules/ui-design-system.md` |
| Station workbench law | `.claude/rules/display/station-workbench.md` |
| Focus deck prominence | `.claude/rules/source-of-truth.md` → Scan-station procedure focus deck |
| LANE-B scroll traps | `docs/todo/scan-station-procedure/LANE-B-deck-motion-scroll.md` |
| **Motion API findings (read first)** | `docs/todo/station-multi-section-scroll-host-MOTION-FINDINGS.md` |

---

## 13. Non-negotiable invariants (Never) — even after research

Unless you explicitly amend them with evidence and we update rule files:

- Procedure steps: every step mounted, vocabulary order, never filtered/sorted
- One derivation hook for all procedure views (`useUnboxProcedureSteps`)
- Scan wedge owns focus — no `autoFocus` / `.focus()` on deck or section expand without hand-back
- Card reads; dock acts — step cards never carry the action button
- Bench photos ≠ arrival photos (stage/aspect separation)
- Do not raise procedure focus above `z-fab` to paint over CTAs
- Do not revive `UnboxCaptureStack`
- Do not model the Section Host as a shared-element (`layoutId`) full-screen modal/overlay
  (findings doc §2.1 — Motion's own closest example does this, and it's the wrong grammar here)

---

## 14. Paste-ready prompt (for Gemini Deep Research)

Copy everything below this line into Gemini:

---

You are researching **industry-standard ops-console UX and browser/CSS scroll behavior** for a B2B
warehouse scan station. **This is explicitly NOT a Motion/Framer Motion animation-API question** —
that half was already answered by reading Motion's live documentation directly; do not propose
Motion API solutions, and do not second-guess the settled mechanism below.

**Product:** Cycle Forge — Kinetic Ledger. Operator stands at a 1080p bench (~3 ft), wedge barcode
scanner focus-locked, one carton at a time. Centre column ~720px.

**Shipped UI (2026-08-03):**
- One `StationWorkbench` scrollport.
- **Items** panel pinned top (`mb-auto`) — static line reference, no expand.
- **Procedure Focus Deck** bottom-packed — watchOS-like Smart Stack: one focus card (natural
  height), inactive faces locked at 4.5rem, peeks 0.875rem, covered zero-flow; hover arms wheel
  scrub (does not expand pile).
- **Floating absolute bottom dock** (`z-fab`) with step CTA + Print/Receive.
- Focus card uses `sticky bottom-0` + `scrollIntoView(block: end)` → **slides under the dock**.
  Body `pb-40` does not inset sticky.

**Operator / engineering ask (NOT shipped):**
- A **main wrapper** for multiple child stacks (Items, Procedure, future).
- Click a stack → that stack **fully expands** above the dock with **its own scroll** for triage.
- Siblings collapse to chrome headers.
- Selected content **never** displays behind the dock.
- Smart Stack card modes stay inside the Procedure section — separate from section expand.

**Animation mechanism — already settled, do not research this part:** bare Motion `layout` prop on
each section (a flex/grid item whose size changes via a class/style swap), both sections wrapped in
one `LayoutGroup`, floor ownership driven by a single `activeId` state value (same shape as Radix
`Accordion.Root type="single"` — one value, one setter). Explicitly NOT a shared-element (`layoutId`)
full-screen modal/overlay pattern.

**What's genuinely open — your job:**
1. Name the closest industry idiom (2–3 named products) for multi-section maximize above a
   persistent bottom action bar, on a dense desktop ops console (not a consumer app).
2. Paste-ready CSS scroll-ownership rule: when nested `overflow-y-auto` is legal vs banned in a
   flex/grid definite-height contract. Cite MDN or a named design system.
3. Whether `scroll-padding-bottom` reliably insets `Element.scrollIntoView({ block: 'end' })` under
   an absolutely-positioned sibling overlay in Chromium — with citations. If unreliable, what do
   Slack/Linear/Intercom-class products use instead to keep the last item above a composer?
4. Rule on fixed rem clearance vs measured composer height for absolute docks; recommend a first
   constant for a ~pager-height dock (current candidate: `10rem`).
5. Default floor owner: procedure vs split — with warehouse/POS evidence.
6. Real animation DURATION/easing numbers (as a CSS-tween, not a spring) for a panel-maximize
   interaction in VS Code / Linear / Notion / Figma-class products.
7. Answer all 12 numbered questions in
   `docs/todo/station-multi-section-scroll-host-GEMINI-RESEARCH-BRIEFING.md` §11 with **named
   product evidence and engineer-typeable constants**.

Prefer decisions over frameworks. If it depends, name the variable and the threshold.

---

*End of briefing.*
