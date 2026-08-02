# Handoff — MasterNav kinetic grain (selection · hover icon · page stagger · color depth)

**For:** Gemini Pro (**research-only, no codebase**) → then implementing agent (Cursor / Claude Code / `animate` + `improve-ui`)
**From:** Cycle Forge engineering
**Date:** 2026-08-01
**Status:** **SHIPPED 2026-08-01** (uncommitted — user owns commits). Gemini research returned, folded in, guards + E2E green, `npm run verify` green. See §6 Done when + §9 Shipped shape for the two places the shipped answer DIVERGES from this doc's original guess.
**Lane:** current checkout — no ad-hoc branch. Attach to `:3050`. User owns commits.
**Product frame:** Cycle Forge multi-tenant reseller-ops SaaS. USAV is dogfood only.
**Agent split:** Gemini returns a recipe only. The coding agent owns call sites, SoT growth, guards, `:3050`, and `npm run verify`.

**Prerequisite shipped (do not re-do):**
[`sidebar-master-nav-ux-polish-HANDOFF.md`](sidebar-master-nav-ux-polish-HANDOFF.md) — ChartPie / ScanBarcode / FileSpreadsheet / Workflow section icons; `spineAccentFor` (sky · amber · emerald · violet + neutral blue); opacity `spineDrill` + filter fade + active-wash + **mode-only** stagger; idle labels default ink.

---

## Paste for a new implementation session

```
Read docs/todo/sidebar-master-nav-kinetic-grain-HANDOFF.md and start at §2
(Locked map) then §3 (Work) then §4 (Research brief results → ship). Confirm
against call sites in SidebarNavList.tsx + motion-framer.ts +
spine-section-accent.ts — not docblocks alone.

Grow MasterNav kinetic grain only:
1) richer selection animation (active wash with section-accent grain, not a hard pop)
2) hover: icon travels + lifts (y-up), named framerGesture / presence — not CSS-only twins
3) drill pages enter with the SAME stagger formula already used for mode rows
4) deepen section accent color (hover hairline / icon tint / wash steps) — tokens only

Do NOT reopen spine membership, section icons, Labels aliases, or typefaces.
Attach to :3050; never start/restart/kill the dev server. User owns commits.
npm run verify before done.
```

---

## Paste for Gemini Pro deep research (run BEFORE implement)

**Audience:** Gemini Pro is **research-only**. It has **no repo, no local files, no
`:3050`.** Do not ask it to open paths, run commands, or verify call sites. Every
fact it needs is in the paste below. It returns a **motion + color recipe**; a
separate coding agent folds that recipe into the app.

```
ROLE
You are a deep-research agent for interaction design / motion / color systems.
You do NOT have access to any codebase, Figma file, or running app. Work only from
the product brief below and publicly known patterns (Linear, Raycast, Arc, Stripe
Dashboard, IBM Carbon side-nav, Apple HIG / Material motion, WCAG reduced-motion).
Return a concrete recipe an engineer can implement later — not “explore the repo”
advice and not vague mood boards.

PRODUCT
Cycle Forge — multi-tenant reseller-ops / warehouse fulfillment SaaS (2026).
USAV is only the dogfood tenant; design for sellable B2B ops, not a 5-person shop toy.
UI identity = “Kinetic Ledger”: utilitarian, direct, calm under load, high-density
legibility, Linear-grade chrome discipline, Carbon-like density. Facts and state
drive chrome; motion clarifies feedback — it must not decorate for decoration’s sake.

SURFACE UNDER STUDY — MasterNav (left push spine)
- Fixed ~240px-wide resident navigator (not a modal drawer).
- Density: caption-size labels (~12–13px), ~14×14px leading icons, compact rows,
  no card soup, no size-shifting selection (row height stays fixed).
- Structure (locked — do not redesign IA):
    TOP PIN: Home · Search · Media · Chat  (neutral blue when active)
    SECTION DRILLS (root shows 4 buttons; click replaces body with that section):
      Analytics Monitor   — accent personality: cool sky / observe
      Scan Stations       — accent personality: amber / floor energy
      Triage Desk         — accent personality: emerald / workbench
      Workflow Studio     — accent personality: violet / canvas
    FOOTER: Admin · Settings  (neutral blue)
- Inside a drill: back control + compact “Filter pages…” field + list of pages.
  Multi-mode pages show child mode rows always expanded under the page.
- Typography family is locked to IBM Plex (weight ≤600). Do not propose Inter /
  Geist / system stacks or a second foundry.

WHAT ALREADY FEELS TRUE TODAY (baseline — improve, don’t reverse)
- Root ↔ drill body swap: fast opacity crossfade only (~120ms). No horizontal
  slide on the 240px spine (feels heavy for repetitive ops jumps).
- Active page: solid fill in that section’s accent + a soft opacity settle
  (~150ms). Top pin / footer stay blue. Modes under an active page use a light
  accent wash, not a second solid.
- Mode rows under a page already cascade in with a short opacity stagger
  (~40ms between children, ~140ms per item fade, total cascade aimed ≤200ms).
- Section hover today: icon nudges ~2px to the right via CSS only — too thin;
  pages/modes don’t lift yet.
- Filter field fades in when entering a drill; clearing/back resets the query.

OPERATOR ASK (translate into a precise kinetic grammar)
1) “More detailed grain-like animation for display selection”
   → When a page (or equivalent row) becomes the selected display, the active
     treatment should feel finely resolved — not a hard color pop. Think layered
     settle: fill → optional hairline/ring → icon tint, still ops-calm.
2) “On hover, icon traveling and hovering up”
   → Leading icon should travel slightly toward the label AND lift upward on
     hover (and optionally settle on press). Apply to section, page, and mode
     icons. Whole row must not translate; height must not change.
3) “Pages appearing with the same stagger display formula”
   → When a section drill opens, PAGE rows (and subgroup headers like Receiving)
     should cascade with the SAME timing recipe already used for mode children —
     one formula, not a second stagger system. Typing in the filter must NOT
     re-trigger the cascade every keystroke.

RESEARCH QUESTIONS — answer all three with numbers

A) SELECTION GRAIN
   For a dense ops sidebar row (icon + caption) becoming active, what is a
   best-in-class “grain” settle?
   - Compare Linear, Raycast, Arc, Stripe Dashboard, Carbon side-nav (cite
     pattern traits, not unpaid screenshots as proof of shipping).
   - Specify layers (fill / hairline / icon / wash), enter vs exit timing
     (exit ~75% of enter is a common house bias), easing (prefer ease-out
     quart/quint; BAN bounce and elastic), and properties limited to opacity,
     transform, border-color, tokenized shadow/ring — NEVER width/height/padding.
   - Cap routine feedback ≤200ms; avoid scale >1.02 on the whole row.

B) HOVER — ICON TRAVEL + LIFT
   At ~14px icon size, what rest → hover → press deltas (px) for translateX
   (toward label) and translateY (up = negative) read as alive but not toy-like
   on a warehouse floor?
   - Duration band 100–150ms; recommend one easing curve.
   - Framer-style whileHover vs CSS transition: which and why for this density.
   - Reduced-motion: how to keep accent tint feedback when transforms collapse.
   - Call out risks: subpixel blur, layout shift, chevron collision on the right.

C) SHARED STAGGER FORMULA (pages = modes)
   Design one stagger recipe reused for (1) mode children under a page and
   (2) page rows when a drill mounts.
   - Propose stagger step, item duration, total cap for ~8–12 rows (≤200ms ideal).
   - Opacity-only vs opacity+1–2px rise: recommend one; reduced-motion form.
   - Critical: how to structure mount keys so FILTER TYPING does not re-cascade;
     drill open / Back should cascade once per altitude change.
   - Whether root’s four section buttons should use the same recipe (optional).

COLOR DEPTH (support motion, don’t invent a rainbow)
   For each section accent (sky / amber / emerald / violet) plus neutral blue,
   propose idle → hover wash → active solid → active-child wash steps using
   common Tailwind-like hue steps (e.g. sky-600 solid, sky-600/10–15 wash).
   Top pin + footer stay neutral. No purple-on-white marketing gradient, no
   raw hex poetry, no per-row random hues.

HARD CONSTRAINTS (reject any recommendation that violates these)
- No GSAP, Lottie, particle/confetti, continuous shimmer loops.
- No horizontal slide for root ↔ drill.
- No second typeface; no weight >600.
- No row height / padding animation for selection.
- Honor prefers-reduced-motion: transforms collapse; opacity/tint may remain.
- Prefer named motion presets an engineer can centralize (suggest short names
   like selectGrain, iconHoverLift, listStaggerContainer/Item) — names are
   suggestions for a later implementer, not claims about existing code.

OUT OF SCOPE
- Redesigning IA, labels, icon metaphor choices, or mobile nav trees.
- Auth, data fetching, or backend.
- Writing production code or inventing file paths as if you read the repo.

DELIVERABLE (use exactly these headings)
1. Executive recommendation (≤8 sentences)
2. Motion recipe table
   columns: Moment | Properties | From→To | Duration | Easing | Reduced-motion form
   rows must cover: select enter, select exit, icon hover, icon press (optional),
   list stagger container, list stagger item, drill opacity swap (leave as-is or
   tiny refine only)
3. Shared stagger formula (one numbered recipe pages AND modes both use)
4. Color depth recipe (per accent: idle / hover / active / active-child)
5. Anti-patterns to reject (bullets)
6. Handoff checklist for a coding agent (8–12 imperative bullets, no “open the
   repo and discover” steps — assume they already know where MasterNav lives)
7. Open questions / Ask-first items (only if a choice truly needs a human)

Tone: precise, ops-product, skeptical of decorative motion. Prefer one sharp
system over five clever variants.
```

## Lineage (read when blocked; do not re-open closed IA)

| Doc / module | Role |
|---|---|
| [`sidebar-master-nav-ux-polish-HANDOFF.md`](sidebar-master-nav-ux-polish-HANDOFF.md) | Prior polish — icons + accent map + first motion pass |
| [`sidebar-spine-validation-simplification-HANDOFF.md`](sidebar-spine-validation-simplification-HANDOFF.md) | Locked spine membership |
| `.claude/rules/display/workbench.md` § Section drills | Spine grammar |
| `.claude/rules/display/motion-crossfade.md` | Opacity drill law + reduced-motion floor |
| `.claude/rules/kinetic-ledger.md` | House identity |
| `src/design-system/foundations/motion-framer.ts` | Named motion SoT |
| `src/lib/nav/spine-section-accent.ts` | Section accent SoT |
| `src/components/sidebar/master-nav/SidebarNavList.tsx` | Render consumer |
| `main-nav-groups.guard.test.ts` / `station-nav-groups.guard.test.ts` | Guards |

---

## 0. One-sentence goal

Make MasterNav selection and hover feel **grainy and intentional** — icon that travels and lifts on hover, active fill that settles with accent-aware detail, and **drill pages that cascade in with the same stagger recipe as modes** — still Kinetic Ledger, still named framer SoT, still ops-safe.

---

## 1. Operator ask (translate → house)

| Operator language | House translation |
|---|---|
| “More detailed grain-like animation for display selection” | Grow **active-row settle** beyond today’s flat `spineActiveWash` opacity: section-accent wash + optional 1px hairline / icon tint fade, named `spineSelectGrain*` (or grow `spineActiveWash`). No bounce; no row height change. |
| “On hover … icon traveling and hovering up” | Replace CSS-only `group-hover:translate-x-0.5` with named **`framerGesture` / `whileHover`** (or presence) that does **x-travel toward label + y-lift**. Same recipe for section / page / mode icons. Reduced-motion → tint/color only. |
| “Pages appearing with the same stagger display formula” | **Reuse** `spineModeStaggerContainer` / `spineModeStaggerItem` (or extract a shared `spineListStagger*`) for **page rows + subgroup headers** on drill enter. Do **not** invent a second stagger timing. Do **not** re-fire on filter keystrokes. |
| “More colors” (follow-on) | Deepen `SPINE_SECTION_ACCENTS` steps (idle → hover wash → active solid → mode wash) — still Tailwind theme hues; top/footer stay neutral. |

---

## 2. Locked map (do not change membership / icons)

```text
TOP PIN
  Home · Search · Media · Chat

SECTION DRILLS (order + icons locked)
  Analytics Monitor     ChartPie      accent: sky
  Scan Stations         ScanBarcode   accent: amber
  Triage Desk           FileSpreadsheet accent: emerald
  Workflow Studio       Workflow      accent: violet

FOOTER
  Admin · Settings      accent: neutral blue
```

Membership (Desk flat L1, Dashboard under Desk, Labels aliases, carrier Labels under Shipping) stays as shipped. Compact `SearchField` (“Filter pages…”) stays.

---

## 3. Work (priority order)

### 3.1 Selection grain (must ship)

**Today:** active page wraps in `motion.div` with `framerPresence.spineActiveWash` (`opacity 0.72 → 1`, 150ms). Solid fill from `accent.activePage`.

**Ship:** a richer **grain** that still reads as one selection, not a second UI language:

| Layer | Direction |
|---|---|
| Fill | Keep section solid (`sky-600` / `amber-600` / `emerald-600` / `violet-700` / neutral `blue-600`) |
| Settle | Named presence: opacity settle **and** optional 1px inset hairline or soft outer glow via **token shadow** (Ask-first if no token exists — prefer border/ring from accent, not raw `shadow-[…]`) |
| Icon | Active icon already white; optional 20–40ms delayed opacity settle so fill leads icon |
| Exit / switch | When selection moves, prior row fades wash out faster than enter (~75% duration) |

**Hard bans:** elastic/bounce easing; `scale` on the whole row >1.02; animating `height` / `padding` (selection never size-shifts); particle / shimmer loops.

Grow SoT in `motion-framer.ts` — e.g. `framerPresence.spineSelectGrain` + `framerTransition.spineSelectGrain` — or evolve `spineActiveWash` in place with a comment + guard update. Prefer **one** named pair, not three competing actives.

### 3.2 Hover — icon travel + lift (must ship)

**Today (call site):** section icon only —

```text
transition-transform duration-150 ease-out group-hover:translate-x-0.5
```

Page / mode icons: color change only via accent classes.

**Ship:**

| Property | Rest | Hover | Press (optional) |
|---|---|---|---|
| `x` | 0 | +2px toward label (travel) | +1px |
| `y` | 0 | −2px (lift / hover-up) | 0 |
| duration | — | 100–150ms | ≤100ms |
| easing | — | ease-out (named SoT) | ease-out |

Wire through **named** `framerGesture.spineIconHover` (grow `framerGesture`) or `whileHover` targets consumed in `SidebarNavList` — **not** a page-local twin of the CSS translate. Apply to:

1. Root section icons  
2. Drill page header icons  
3. Mode / subgroup child icons (slightly smaller travel OK: x+1 / y−1)

**Reduced-motion:** strip `x`/`y` via `useMotionPresence` / MotionConfig floor; keep `group-hover` accent **tint** from `spine-section-accent.ts`.

**Do not** translate the whole row (that fights the 240px spine + chevron). Icon only.

### 3.3 Page stagger = mode stagger formula (must ship)

**Today:** only `page.modes` use:

```text
framerVariants.spineModeStaggerContainer  // staggerChildren: spineModeStagger (0.04s)
framerVariants.spineModeStaggerItem       // opacity 0→1, duration spineDrillFilter (0.14s)
```

Drill **page list** mounts instantly inside the opacity `spineDrill` swap.

**Ship:**

1. Extract or alias a **shared** list stagger (`spineListStaggerContainer` / `spineListStaggerItem`) used by **both** mode rows and drill page rows — same numbers, one formula.  
   - OR document that pages import the existing `spineModeStagger*` names (acceptable if renamed comments say “list stagger, not mode-only”).
2. On drill enter (`renderDrill`), wrap the page `<ul>` (or each page block including Receiving subgroup header) in the stagger container; each page row / subgroup header = stagger item.
3. **Filter safety:** typing in “Filter pages…” must **not** remount the stagger container in a way that re-cascades every keystroke. Patterns:
   - `initial={false}` after first drill paint, **or**
   - key stagger container on `drillId` only (not on `drillFilter`), **or**
   - animate only when `drillFilter` is empty / on drillId change.
4. Cap: with ≤12 visible rows, total cascade ≤200ms (current 40ms × n + 140ms item). If a section has more rows, keep step at 40ms but prefer opacity-only (already).

Root section list may optionally use a **one-shot** stagger on first sidebar open — Ask-first / lower priority than drill pages.

### 3.4 Color depth (should ship with motion)

Grow `SPINE_SECTION_ACCENTS` / `SPINE_NEUTRAL_ACCENT` with explicit hover steps if missing:

| Step | Purpose |
|---|---|
| `idlePage` / `sectionIdle` | default ink + quiet hover wash (already) |
| stronger hover wash | e.g. `/15` instead of `/10` where wash feels invisible |
| `activePage` | solid (already) |
| `modeActive` | wash + ink (already) |
| optional `activeHairline` / `hoverIcon` | if selection grain needs a class string from SoT |

Top pin + footer stay **neutral blue**. Do not rainbow Home/Search/Media/Chat.

No raw hex. No purple-on-white landing gradient. No second brand.

### 3.5 Explicit non-goals

- Reordering / renaming sections or swapping ChartPie / ScanBarcode / FileSpreadsheet / Workflow again  
- Second typeface; weight >600  
- Horizontal slide for root ⇄ drill (`spineDrill` stays opacity-only)  
- Reviving `SidebarSearchBar`  
- Mobile `/m` tree redesign  
- Starting / killing `:3050`; committing / pushing (user owns)

---

## 4. After Gemini research — how to fold results in

Gemini never touches the repo. Paste its deliverable (recipe table + stagger
formula + color steps + checklist) into the implementing session, then:

1. If Gemini’s numbers conflict with house caps (≤200ms / no bounce / opacity-only
   drill / no size-shift selection), **house wins** — keep Gemini’s layering intent,
   clamp the timing/easing.
2. Add named entries to `motion-framer.ts` first; then wire `SidebarNavList.tsx`.
3. Extend guards:
   - Named icon hover SoT — **not** bare `group-hover:translate-x-0.5` alone
   - Drill page list uses the **same** stagger variant ids as modes
   - No lone `bg-blue-600 text-white` hardcode in the list (accent SoT)
4. Eyeball `:3050`: Show sidebar → hover each section (icon lift+travel) → open each
   drill (page cascade) → select a page (grain settle) → type filter (no re-stagger)
   → Back.
5. `npm run verify` green; short agent-log line.

---

## 5. Files to touch

| Layer | Paths |
|---|---|
| Motion SoT | `src/design-system/foundations/motion-framer.ts` (+ hooks if needed) |
| Accent SoT | `src/lib/nav/spine-section-accent.ts` |
| Render | `src/components/sidebar/master-nav/SidebarNavList.tsx` |
| Guards | `main-nav-groups.guard.test.ts` (motion + accent asserts) |
| Law one-liners | `.claude/rules/display/workbench.md`, `motion-crossfade.md` if stagger/hover become spine law |

---

## 6. Done when

- [x] Active selection shows accent-aware **grain settle** — fill **plus** `ring-1 ring-inset ring-{hue}-400/30` (mode wash `/20`), asserted on computed `box-shadow` in a browser
- [x] Section / page / mode icons **travel + lift** on hover; reduced-motion keeps tint only — **shipped as CSS, not framer** (see §9)
- [x] Drill **pages** cascade with the **same** stagger formula as mode rows; filter typing does not re-cascade
- [x] Accent map deepened — inset hairlines + `floor` fill moved `amber-600 → amber-700` for WCAG AA (see §9)
- [x] Guards green; `npm run verify` green; no knip / DS baseline raised
- [x] Agent-log + `:3050` eyeball (Playwright on `qa-desktop`; the in-app preview browser has no session)

---

## 9. Shipped shape — where it DIVERGES from this doc

Both divergences are §4.1 in action ("if the research conflicts with house caps,
keep the layering intent and clamp"), plus one defect the research predicted.

### 9.1 Hover is CSS, not `framerGesture` — §3.2 reversed

§3.2 asked for a named `framerGesture.spineIconHover` / `whileHover`. The Gemini
recipe rejected that on performance grounds and it is right: `whileHover` on a
spine row re-renders React on **every `mousemove`** across a 20-row list, to move
2px that the compositor gives free. Shipped as **`SPINE_ICON_LIFT_CLASS`** in
`spine-section-accent.ts` — still a named SoT with one definition and one guard,
just CSS rather than framer.

Consequence worth knowing: the framer `MotionConfig` reduced-motion floor does
**not** cover CSS transforms, so the class carries its own `motion-safe:` gate.
That is asserted in a real browser under `reducedMotion: 'reduce'`, not inferred.

Travel is `(+2px, −1px)`, not §3.2's `(+2px, −2px)`: at a 28px row a 2px lift
visibly breaks the icon's optical baseline against its own label.

### 9.2 `floor` fills at `amber-700` — a contrast defect, not a taste change

`amber-600` on white is ≈2.9:1, under the WCAG AA 4.5:1 floor for the 12px
caption these rows use. Scan Stations is the section read across a warehouse
aisle. `amber-700` clears it at ≈4.7:1. Do not restore 600 for hue symmetry with
sky/emerald/violet — those pass at 600, amber does not.

### 9.3 The filter gate is "touched", not "active"

§3.3's option list offered "animate only when `drillFilter` is empty". Shipped
and then **caught in the browser**: that re-arms the cascade the instant the
operator *clears* the box, so backspacing re-fades the whole list they had just
narrowed. Clearing a filter is still filtering. The gate is a `filterTouched`
flag that resets with the **section**, so a fresh drill still cascades. Pinned by
`spine-row-motion.spec.ts` → "CLEARING is still filtering".

### 9.4 Root section list stays instant

§3.3 marked a root one-shot stagger Ask-first. Verdict: **no.** The root map is
painted on every cold load; a cascade there is time-to-interactive spent on four
buttons whose position the operator already knows.

### 9.5 Rejected outright

The research's closing checklist asked to "hardcode typography references to IBM
Plex; strip any fallback fonts". Declined — `typography/families.ts` is the
typeface SoT and its stacks are mirrored byte-for-byte in `globals.css`; a
fallback-less stack renders nothing (not a substitute) while `next/font` loads,
and this doc's own §3.5 lists typefaces as a non-goal.

---

## 7. Current call-site snapshot (verify against code, not this block alone)

As of 2026-08-01 polish pass:

| Moment | Implementation |
|---|---|
| Root ⇄ drill | `framerPresence.spineDrill` + `framerTransition.spineDrill` (opacity-only) |
| Filter mount | `framerPresence.spineDrillFilter` |
| Active page | `framerPresence.spineActiveWash` wrapping active header |
| Mode list stagger | `framerVariants.spineModeStaggerContainer` / `spineModeStaggerItem` |
| Section icon hover | CSS `group-hover:translate-x-0.5` only (gap this handoff closes) |
| Accents | `spineAccentFor(sectionId)` → `SPINE_SECTION_ACCENTS` / `SPINE_NEUTRAL_ACCENT` |

---

## 8. Execution prompt (implementer copy)

```
You are deepening Cycle Forge MasterNav kinetic grain + color.

1. The user will paste Gemini Pro’s research deliverable (recipe table — Gemini
   had no repo access). Fold it into docs/todo/sidebar-master-nav-kinetic-grain-HANDOFF.md
   §3; house caps win on conflict.
2. Selection grain: grow named selectGrain / activeWash SoT.
3. Hover: named icon travel (x) + lift (y); replace CSS-only translate twin.
4. Drill pages: same stagger formula as modes; no filter re-stagger.
5. Deepen spine-section-accent hover/active steps if the recipe calls for it.
6. Extend guards; eyeball :3050; npm run verify before done.
```
