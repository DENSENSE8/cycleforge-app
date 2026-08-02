# Research briefing — in-house library maturity → world-class premium Kinetic Ledger SaaS

**For:** Gemini Pro (deep research) — you do **not** have the codebase; every product fact and measurement below is embedded. Do not invent file paths or claim to have inspected source.
**From:** Cycle Forge engineering
**Date:** 2026-08-01
**Subject:** Given the **in-house libraries already shipped** in this exact codebase, what can we already do at premium SaaS altitude — and what are the **exact gaps** that still keep Kinetic Ledger from reading as a must-have, industry-standard 2026 B2B ops product? Use a **structured motion / animation presets upgrade** as the primary worked example of how to close a library gap without inventing a second design language.
**Deliverable:** (a) industry survey of how world-class SaaS products structure *in-house* UI/ops libraries (not vendor kits); (b) forced rulings on D1–D12 against house constraints; (c) a **capability map** (“already unlocked”) + **gap catalog** (“must close”) an engineer can execute without forking SoTs; (d) a premium-threshold scorecard; (e) a paste-ready Claude Code / Motion-upgrade execution brief for the winning motion architecture.

**This brief is NOT “redesign the product identity,” “clone Linear pixels,” or “adopt AG Grid / MUI / a foreign motion kit.”** Cycle Forge already has named identity (**Kinetic Ledger**), region contracts, token SoTs, and a large motion preset file. Your job is to pressure-test **library maturity and composition discipline** — what the house already owns vs. what still feels early-stage — then prescribe a defended upgrade path for *this* product.

---

## 0. How to use this brief

### 0.1 Four deliverables (keep separate)

1. **What is industry standard (2026)** for *in-house* SaaS library maturity in premium B2B / ops / fintech products:
   - Token + primitive + compound component layers
   - **Motion as a first-class design token** (roles / intents, not a grab-bag of named springs)
   - Grid / table shells as product IP
   - Feedback (toast · confirm · scan · save) as one system
   - Chrome altitude (global vs workbench vs table-proximal)
   - Enforcement (guards, ratchets, CI) so the library cannot silently fork
2. **What this codebase can already do** — a capability map grounded in §2. Prefer “compose X + Y” recipes over aspirational frameworks.
3. **Exact gaps to close** — ranked by premium-feel ROI vs blast radius. Separate **library-architecture gaps** (missing SoT / wrong taxonomy) from **adoption gaps** (SoT exists, call sites ignore it) from **product-surface gaps** (domain feature incompleteness — mention only if it blocks the premium threshold).
4. **Motion presets upgrade (worked example)** — a concrete target architecture for `motion-framer.ts` / hooks / CSS motion, with migration phases, enforcement, and a Claude Code prompt. This is the template for how every other library gap should be closed.

### 0.2 Sources to cover (minimum)

Cite **named systems** and **primary sources**. Prefer docs, design systems, changelogs, and research dated **2024–2026**.

| Class | Examples | Use for |
|---|---|---|
| **Premium command / ops SaaS** | Linear, Attio, Plain, Front, Height, Notion (chrome contrast only) | Chrome discipline, motion restraint, command palette |
| **Payments / infra dashboards** | Stripe Dashboard, Vercel, Cloudflare, Datadog | Dense calm, table/tooling maturity |
| **Design systems for B2B** | Shopify Polaris, IBM Carbon, Atlassian, Fluent 2, Radix Themes | Token layers, motion tokens, component composition |
| **Motion as product IP** | Motion (motion.dev) docs + Motion UI catalogue; Apple HIG motion; Material 3 motion; Linear’s transition culture (public writing) | Preset taxonomy, spring vs tween, reduced motion |
| **WMS / warehouse / MES-adjacent** | At least 1–2 named public WMS/fulfillment UIs | Floor-monitor reality — do not force office-SaaS calm onto a scan floor |
| **Research / a11y** | Nielsen Norman (100–300ms feedback), WCAG 2.3.3 Animation from Interactions | Duration floors, reduced-motion forms |

Where industry splits, give **both** positions, the conditions each wins under, then pick one for **this** product and say why.

**Hard fork:** “what a marketing site or consumer app does with motion” ≠ “what a dense warehouse-ops queue on a 1080p floor monitor should do.” This product is the latter — but it still must clear a **premium SaaS threshold**, not an internal-tools aesthetic.

### 0.3 Anti-patterns for your answer

- Recommending a foreign grid (AG Grid, MUI DataGrid, Handsontable) or a second visual language
- Inventing page-local motion springs beside `framerTransition.*` / `framerPresence.*`
- Raising DS ratchet baselines or weakening guards
- Migrating to `motion/react` imports in app code **without** reconciling the house guard that **bans** `motion/react` in `src/` (SoT is still `framer-motion` + `@/design-system/motion` for Motion+)
- Retreating into “it depends” without a forced pick
- Framing Cycle Forge as a five-person shop tool — USAV is dogfood only; answer for sellable multi-tenant SaaS
- Treating “more animation” as “more premium” — Kinetic Ledger premium is **legible throughput + calm chrome**, not decorative motion

### 0.4 Sibling briefs — do not re-answer; reconcile only where decisions collide

| Sibling | Owns | This brief may cite, must not redo |
|---|---|---|
| [`today-chrome-premium-altitude-GEMINI-RESEARCH-BRIEFING.md`](./today-chrome-premium-altitude-GEMINI-RESEARCH-BRIEFING.md) | Global vs workbench vs table chrome altitude | Cite; chrome is one gap class here |
| [`contextual-font-system-GEMINI-RESEARCH-BRIEFING.md`](./contextual-font-system-GEMINI-RESEARCH-BRIEFING.md) | Typeface / role maturity | Cite as the **template** for how a library gap brief should force taxonomy rulings |
| [`unbox-procedure-stack-MOTION-GEMINI-RESEARCH-BRIEFING.md`](./unbox-procedure-stack-MOTION-GEMINI-RESEARCH-BRIEFING.md) | One station surface’s stack motion | Do not redesign that stack; use only as evidence of motion-law pressure |
| [`grid-industry-actions-GEMINI-RESEARCH-BRIEFING.md`](./grid-industry-actions-GEMINI-RESEARCH-BRIEFING.md) | Spreadsheet action ROI inside cells/rows | Out of scope except as a grid-library maturity peer |
| [`chrome-sot-compound-GEMINI-RESEARCH-BRIEFING.md`](./chrome-sot-compound-GEMINI-RESEARCH-BRIEFING.md) | Chrome consolidation governance | Assume compound loop stands |
| `display/motion-crossfade.md` (house law, embedded in §3) | Crossfade recipe, push exception, reduced-motion floor | Treat as ratified law unless you defend overturning a specific clause |

---

## 1. Product vocabulary (mandatory)

**Cycle Forge** — multi-tenant reseller-operations SaaS (receive → unbox → triage → test → repair → catalog → pack → ship → warranty/support). USAV is dogfood only.

**Kinetic Ledger** — UI identity: dense, state-colored, scan-aware; **legible throughput over document calm**. Calm chrome (Linear discipline), not Notion whitespace. Explicit bans: random card soup, nested cards-as-rows, glowing AI dashboards, a second visual language.

**Region contracts** (house law — use these words):

| Contract | Driven by | Job | Selection | Density |
|---|---|---|---|---|
| **Station** | barcode / wedge | act-and-clear | ephemeral | `floor` |
| **Workbench** | pointer | pick → edit → persist | durable, URL-addressable | `ops` |
| **Monitor** | filters over a stream | observe only | none | `rollup` |
| **Canvas** | pan/zoom | reshape a definition | durable focus | `studio` |

**Right-edge modality (ratified 2026-08-01):** the right edge **pushes**; it never floats over the work surface. MasterNav is a push spine; context rails use `ContextPanelLayout`; right-rail inspectors use `RightRailHost` (`modal={false}`).

**Pattern law:** compose named SoT → grow SoT when wrong → never fork page-local twins.

**Physical bench reality (governs Station answers):**

| Fact | Value |
|---|---|
| Display | 1080p monitor, landscape |
| Viewing distance | ~3 ft |
| Posture | standing; hands on product + keyboard-wedge scanner |
| Primary input | scanner, not pointer |
| Session | act-and-clear, minutes not hours |

---

## 2. What you already have — capability map (treat as ground truth)

This section answers: **“With the libraries already in the repo, what premium SaaS behaviors can we ship without inventing anything?”** Grouped by library cluster. Counts measured 2026-08-01.

### 2a. Design-system spine (`src/design-system/`)

| Layer | What exists | What it unlocks today |
|---|---|---|
| **Tokens** | Color semantic maps, spacing + density, radius, borders, shadows/`elevationClass`, z-index, focus-ring, table-surface, app-surface (chrome/canvas/wash), typography presets + CF Type `text-role-*` | Themeable dense UI without page-local hex / raw `z-[N]` / invented focus rings |
| **Themes** | Registry SoT (`light` / `dark` / `mono` / `slate` / `forest` / `ember` …) via `data-theme` + `ThemePalette` contract | Multi-tenant visual skins without forking components |
| **Primitives** | `Button` · `IconButton` · `Panel` · `CardShell` · `SearchField` · `ToolbarSearchToggle` · `Switch` · `Checkbox` · `DropdownMenu` · `ContextMenu` · `Popover` · `StationComposerDock` · `SlicedActionDock` · `StaggerReveal` · spacing primitives (`Stack`/`Inset`/`Row`) | Compose chrome and forms without raw `<button>` / hand-rolled docks |
| **Components** | Dialog/AlertDialog/confirm host, toast theme, TabSwitch, SectionTabsSlider, OverlaySearch, DocumentSlideOver, monitor `SectionCard`, procedure stack/checklist, capture-stack, WorkOrderAssignmentCard, AnimatedStat | Named compounds for common ops jobs |
| **Grid SoT** | `LedgerGrid` / `LedgerGridSurface` + TanStack **state-only** + virtualizer + `GridSurfaceCapabilities` + column visibility/sort + identity pane + justification SoT | Industry-grade ops spreadsheet without AG Grid |
| **Shells** | `detail-stack` layout/resize/collapse tokens; station workbench shell lives under `@/components/station/workbench` | Push inspectors + station right panes with shared geometry |
| **Hooks** | Focus trap, body scroll lock, escape close, horizontal edge resize, more-below lip, vertical split drag | Overlay / rail behavior without reinventing |

**Already unlocked recipes (examples):**

1. New Workbench queue: `LedgerGridSurface` + column model + `GridSurfaceCapabilities` + thin `renderRow` + `useGridColumnVisibility` + URL sort — **no second table shell**.
2. New Station focus card: `framerPresence.stationCard` + `framerTransition.stationCardMount` via hooks; scan bar + goal HUD stay outside `AnimatePresence`.
3. New right-rail inspector: `RightRailHost` push + `framerPresence.detailStackPush` + `HorizontalEdgeResizeHandle` outset — **no float overlay**.
4. New typed identifier: `CopyChip` family + `copy-chip-format` — never invent a fourth chip color for “another ID.”
5. New confirm: `requestConfirm` / `AlertDialog` / station `ConfirmSheet` — never `window.alert()` (scan-focus hazard).

### 2b. Motion library (the exemplar cluster)

| Module | Role |
|---|---|
| `foundations/motion.ts` | CSS durations/easings (`micro` 100ms … `slower` 480ms) |
| `foundations/motion-framer.ts` | **~1,150 lines** — `motionBezier`, `framerDuration`, `framerTransition`, `framerPresence`, `framerGesture`, `framerVariants`, mobile twins, springs |
| `foundations/motion-framer-hooks.ts` | `useMotionTransition` / `useMotionPresence` / `reducePresenceShape` — reduced-motion bridge |
| `motion/plus.ts` | Sole Motion+ import site (`AnimateNumber`) — feature code must not import `motion-plus` directly |
| App floor | `<MotionConfig reducedMotion="user">` via `ReducedMotionProvider` |
| Law | `.claude/rules/display/motion-crossfade.md` — opacity+transform only; one focus-surface crossfade; sanctioned push width tween; spring vs tween division |
| Guard | `motion-major.guard.test.ts` — single `framer-motion` major; **ban `motion/react` imports in `src/`** |

**Measured adoption (2026-08-01):**

| Signal | Count |
|---|---|
| Files importing `framer-motion` | **~220** |
| Files importing `motion/react` | **0** (guarded) |
| Files referencing `framerPresence` / `framerTransition` / hooks | **~117** |
| Files using `AnimatePresence` | **~148** |
| Files using `useMotionPresence` | **~65** |
| Files using `whileHover` / `whileTap` / `layoutId` / `AnimatePresence` broadly | **~171** |

**Already unlocked motion recipes:**

| Intent | Named SoT | Notes |
|---|---|---|
| Station active-card swap | `framerPresence.stationCard` + `stationCardMount` | Canonical 7-step crossfade |
| Workbench detail pane | `workbenchPane` + `workbenchPaneMount` (0.18s) | List stays put |
| Heavy workspace dissolve | `workbenchPaneSettle` (opacity-only, 0.3s) | Pointer-driven heavy panes |
| Station carton→carton | `stationCartonSwap` (exit duration 0) | Scanner cadence sibling — not a retune of settle |
| MasterNav drill | `spineDrill` opacity ≤150ms + `spineRowStagger` | One cascade ladder |
| Push column join/leave | `detailStackPush` + `sidebarNavColumnMount` tween | **Never spring** on push width |
| Overlay flyout | `detailStackOverlay` + x:48 | Overlay branch only |
| Capture stack | spring mount + height-collapse exit | Physical settle; prior UI rejected twice historically |
| Photo hero morph | `photoHeroMorph` (`layoutId`, bounce:0) | Grid→viewer only |
| Command palette | `commandBarDialog` spring top-anchored | Distinct from centered modal spring |
| Mobile sheets / camera / scan feedback | `framer*Mobile` twins | Separate duration ladder |
| Gestures | `framerGesture.tapPress` / `cardHover` / `rowHover` | Thin |

### 2c. Presentation / domain waist (`src/lib/*` + rules)

These are **not UI chrome**, but they are why the product can feel “finished” when composed correctly:

| Concern | SoT |
|---|---|
| Civil day vs instant | `src/utils/date.ts` + warehouse TZ |
| Condition grade label/tone | `conditions.ts` / `condition-tone.ts` |
| Source platform | `source-platform.ts` |
| Receiving type meta | `receiving/receiving-type-meta.ts` |
| Capability / provider nouns | `integrations/capability-labels.ts` |
| Cross-entity search hit | `search/search-hit.ts` |
| Status changes | `transition()` only — never raw status UPDATE |
| Tenant writes | `withTenantTransaction`; `orgId` from `ctx` |
| Right-rail occupancy | `lib/right-rail/store.ts` |
| Escape / overlay stack | `lib/overlay-stack/store.ts` |
| Toast | `@/lib/toast` + DS toast theme |
| Nav / spine | `sidebar-navigation.ts` + section accents + icon SoTs |
| Record cursor / selection planes | emerging SoTs under `record-cursor`, collection action planes |

**~263 top-level entries under `src/lib/`** — this is a domain operating system, not a thin UI kit. Premium SaaS status depends on **composing these waists**, not adding more CSS.

### 2d. Enforcement already present (premium discipline asset)

DS ratchets / guards already shrink-only: raw `<button>`, native `title=`, raw `focus:ring`, `text-[Npx]`, color neutrals, typography weight cap, grid capabilities disk-walk, station-nav membership, header-mode, motion major version, etc. **`npm run verify` is the definition of done.** Any gap-closing plan that raises a baseline is invalid.

---

## 3. Exact gaps — what still blocks “world-class premium must-have”

Ranked for **premium-feel ROI**. Each gap is tagged:

- **A** = architecture (taxonomy / SoT missing or wrong shape)
- **B** = adoption (SoT exists; call sites fork or ignore)
- **C** = product surface (feature incompleteness — only if it blocks premium threshold)

### Gap G1 — Motion intents are a catalog, not a role system (**A**, primary exemplar)

**Symptom:** `motion-framer.ts` is a large *named bag* of surface-specific presets (`signInIdentityChip`, `chatScrollToLatest`, `captureStackFreshPulse` …). World-class systems expose a small set of **motion roles / intents** (e.g. `enter.subtle`, `swap.focus`, `push.geometry`, `gesture.press`, `feedback.pulse`) that map to region contracts + physics class (tween vs spring). Call sites pick a **role**, not a one-off duration.

**Evidence:** ~1,150-line single file; parallel CSS `motionDurations` that do not share names with `framerDuration`; mobile twin namespaces; gesture layer is three keys; CSS `transition-opacity duration-150` still sprinkled in chrome (MasterNav, timelines, auth pads) outside the framer SoT.

**Premium cost:** motion *feels* inconsistent across altitudes even when individual presets are good — “early-stage” tells when sibling surfaces use different personalities for the same job.

**Forced question for you (D1):** Should Kinetic Ledger adopt a **motion-role layer** on top of today’s named presets (like CF Type `text-role-*` over raw sizes), or collapse/rename the catalog into fewer intents? Pick one and defend.

### Gap G2 — Adoption split: `AnimatePresence` without the bridge (**B**)

**Symptom:** ~148 `AnimatePresence` consumers vs ~65 `useMotionPresence` consumers. App-wide `MotionConfig` is the floor (transforms snap; opacity continues), so this is **not** primarily a WCAG bug anymore — but the bridge still owns stronger reduction + height-preserving collapse semantics. Inline presence literals still drift from named presets.

**Forced question (D2):** Is the next ratchet “every new presence must import a named `framerPresence.*`” or “every presence must go through the hook even when MotionConfig covers it”? Pick enforcement shape + phase.

### Gap G3 — Dual motion stacks (CSS Tailwind transitions vs Framer) without a boundary law (**A**)

**Symptom:** CSS `motion.ts` + Tailwind `duration-*` / `transition-*` for chrome micro-interactions; Framer for presence/layout/gestures. House already correctly uses CSS-only for MasterNav icon lift (`SPINE_ICON_LIFT_CLASS`) to avoid framer-per-mousemove cost — that is a *good* split — but the **boundary is tribal knowledge**, not a role table.

**Forced question (D3):** Publish a hard rule: which intents **must** be CSS (`motion-safe:`), which **must** be Framer presets, and which are banned in both (layout thrash). Include performance rationale for spine/list density.

### Gap G4 — Package identity tension (`framer-motion` vs Motion brand) (**A**, constrained)

**Measured house law today:** app code imports `framer-motion`; `motion` + `motion-plus` are installed; Motion+ only via `@/design-system/motion`; guard **fails** if `src/` imports `motion/react`. Motion’s own docs push `motion/react` and deprecate the mental model of “framer-motion.”

**Forced question (D4):** For 2026 premium credibility + maintainability, should Cycle Forge (a) keep `framer-motion` as the public SoT and treat `motion` as an implementation detail, (b) migrate the design-system foundations to `motion/react` behind a re-export barrel so app code never changes import paths, or (c) gradually allow `motion/react` only inside `src/design-system/**`? Pick one; do **not** recommend scattering `motion/react` into features.

### Gap G5 — Chrome altitude / utility clustering (**B/C** — sibling owns depth)

Already under research in the Today chrome brief. Library angle: `GlobalHeaderActions`, `WorkbenchChromeHeader`, `WorkbenchTrailingCluster`, table lip + `GridColumnDetailsPanel` exist — **composition altitude is wrong on Today**, which reads as early-stage even when atoms are correct.

**This brief’s job:** classify chrome altitude as a **composition gap**, not a missing library. Point at the sibling for relocation map; do not redesign.

### Gap G6 — Grid is strong IP; industry actions / Fields lip still mid-migration (**B/C**)

`LedgerGrid` + capabilities + identity pane + justification SoT are already sellable differentiators. Gaps that still feel “internal tool”: Fields living at wrong altitude; uneven in-cell edit / multi-select plane maturity across surfaces; Orders deferred on some resize/reorder recipes.

**Forced question (D5):** Of the grid gaps, which single closure most raises perceived premium: (1) Fields→table lip everywhere, (2) one action-plane vocabulary enforced on all queues, (3) Orders parity on resize/reorder? Rank 1–3.

### Gap G7 — Feedback systems are split (**A/B**)

Toast SoT exists; scan-band glow exists; `AnimatedCheck` / quantity bump / copy-chip flash exist; station pass/fail lives on the active card. Missing: a **unified feedback intent map** (success · warn · block · scan-ok · scan-fail · saved · copied) that binds toast vs inline vs motion vs (future) optional sound — so every station doesn’t invent a flash.

**Forced question (D6):** Should feedback intents live under motion foundations, under `@/lib/toast`, or a new `src/design-system/feedback/` waist? Pick one owner.

### Gap G8 — Empty / loading / skeleton altitude (**B**)

`EmptyState`, `ContextualEmptyState`, `Skeletons`, `RouteLoading`, grid teaching empties exist — adoption uneven; some surfaces still feel blank or “spinner in a white void.”

**Forced question (D7):** Is the premium bar “every LedgerGrid / Station / Monitor mount declares a teaching empty + skeleton via descriptor,” and if so, what is the minimal descriptor extension?

### Gap G9 — Gesture / press / hover vocabulary is underbuilt (**A**)

Only three `framerGesture` keys; spine uses CSS lift; many surfaces use ad-hoc `active:scale-95` / hover translate. Premium products feel “one hand” on press feedback.

**Forced question (D8):** Expand to a small gesture role set (`press.icon`, `press.row`, `press.card`, `hover.lift-css-only`, `hover.none-on-dense-lists`) with performance bans — or forbid hover motion on dense lists entirely except CSS compositor transforms.

### Gap G10 — Domain library depth vs UI library depth asymmetry (**C**, framing only)

`src/lib` is extremely deep (receiving spine, integrations facades, search waist, audit, status machines). UI premium often lags because **pages still fork presentation** instead of composing SoTs. This is a **discipline gap**, not a missing npm package.

**Forced question (D9):** For the next 90 days, is the highest-ROI premium program (a) motion-role upgrade, (b) chrome altitude + Fields lip, (c) “no presentation forks” ratchets on 3 dogfood surfaces (Today / Unbox / Orders)? Pick a primary program and two supporting tracks.

### Explicit non-gaps (do not recommend “building these”)

| Tempting ask | Why it is already solved or banned |
|---|---|
| Foreign data grid | `LedgerGrid` is the product IP |
| Second search engine | `SearchHit` waist |
| Second audit API / status transition | `transition()` + audit SoT |
| Floating right inspectors | Push modality ratified |
| More decorative motion | Violates Kinetic Ledger |
| Raising ratchet baselines | Forbidden |

---

## 4. Worked example — motion / animation presets upgrade

This section is the **structural template** (mirrors how the contextual-font brief forced taxonomy). Answer it in full even if you also cover G5–G10.

### 4.1 Measured current taxonomy (2026-08-01)

**Curves (2):**

| Token | Value | Used for |
|---|---|---|
| `motionBezier.easeOut` | `[0.22, 1, 0.36, 1]` | Discrete swaps |
| `motionBezier.layout` | `[0.25, 0.1, 0.25, 1]` | Soft geometry / push / overlay |

**Duration ladder (framer, seconds — partial):** station card 0.26 · up-next row 0.18 · workbench pane 0.18 · settle 0.3 · carton swap 0.12 · spine drill 0.12 · table row 0.22 · dropdown 0.18 · detail overlay 0.4 · sidebar nav push 0.24 · chip copy 0.15 · scan glow 0.2 / pulse 0.26.

**Physics classes in use:**

| Class | Examples | Law |
|---|---|---|
| Tween easeOut | pane/card/table/dropdown/spine | Default discrete swap |
| Tween layout curve | push width, sidebar expand, detail overlay | Geometry; no spring overshoot |
| Spring (stiffness/damping) | capture stack, modals, command bar, sheets, FAB | Physical / gesture |
| Spring (`visualDuration` + `bounce:0`) | photo hero, viewer paging, board lanes, chip columns | No-overshoot physical reflow |
| Exit-owned transition | capture stack exit, stationCartonSwap exit `duration:0` | Exit ≠ enter personality |

**Presence personalities (compressed):** opacity+y swap · opacity-only settle/drill/push · overlay x-slide · collapseHeight · capture expanded/collapsed · mobile sheet/camera/fab · command bar top-anchored · work-order centered scale.

**CSS twin:** `motionDurations` micro/fast/normal/slow/slower — **names do not align** with framer keys.

### 4.2 Hypotheses under test (do not rubber-stamp)

**H1 — Role layer:** Introduce ~8–12 `motionRole.*` intents that map to existing presets; deprecate direct use of long-tail surface keys except as role implementations.

**H2 — Catalog prune:** Do not add a role layer; instead merge near-duplicates (`workbenchPane` vs `tableRow` vs `statusMessage` y-offsets) into fewer shapes and force call-site migration.

**H3 — Region × intent matrix:** Every motion role must declare legal region contracts (Station may use `swap.scan`; Workbench may not use scan-hard-cut; Monitor forbids list crossfade; Canvas forbids graph fade).

**H4 — CSS/Framer boundary table** is mandatory before any migration.

**H5 — Keep `framer-motion` import SoT**; optional internal re-export from `motion` package only if you prove maintainability win without app-wide churn.

### 4.3 Industry questions you must answer with named evidence

1. How do Linear / Stripe / Polaris / Carbon / Fluent express **motion tokens** in 2025–2026 — duration scales, easing roles, reduced motion — and what maps cleanly onto Kinetic Ledger?
2. What is the 2026 Motion (motion.dev) recommended architecture for **design-system preset libraries** in React (MotionConfig, spring visualDuration, layout rules) that we can adopt **without** violating the house ban on feature-level `motion/react` imports?
3. When does a second spring personality earn its keep vs. become “animation soup”? Give thresholds for ops dashboards vs scan floors.
4. What is the premium-threshold **maximum routine duration** for: icon press, row hover, focus-surface swap, push rail open, modal open, scan success? Numbers, not adjectives.
5. How should mobile (`/m/*`) share desktop roles — parallel `*Mobile` namespaces (today) vs density-parameterized roles?

### 4.4 Forced rulings required (D1–D4 + D10–D12)

| ID | Decision |
|---|---|
| **D1** | Role layer vs catalog prune (see G1) |
| **D2** | Enforcement ratchet for presence adoption (see G2) |
| **D3** | CSS vs Framer boundary law (see G3) |
| **D4** | Package / import SoT (see G4) |
| **D10** | Exact target role list (names + physics class + default duration + reduced form + legal region contracts) |
| **D11** | Migration phases (P0 inventory · P1 roles+docs · P2 migrate dogfood surfaces · P3 ratchet) with stop conditions |
| **D12** | What **never** animates (collection maps, graphs, sticky dual bands, spine row `whileHover`, selection size-shift) — confirm or amend house law |

### 4.5 Success criteria for the motion upgrade

After the winning architecture ships:

1. A new engineer can pick a **motion role** for a new Station/Workbench crossfade without reading 1,150 lines.
2. Two sibling surfaces that share a job share a **role**, not “close enough” literals.
3. CSS micro-interactions and Framer presence stop fighting each other (boundary table enforced by guard or lint recipe).
4. Reduced-motion forms remain crossfade-not-cut; height collapse still works.
5. MotionScore / perceived jank on Unbox carton swap and Orders inspector `j`/`k` do not regress vs today’s specialized presets (`stationCartonSwap`, stable occupant id exception).
6. `npm run verify` stays green; **no baseline raises**.

---

## 5. Capability → gap scorecard (fill this in your answer)

Score each 1–5 (1 = blocks sellability, 5 = industry-leading). Give today’s score and post-upgrade score if your program lands.

| Dimension | What “5” looks like | Today (your score) | After recommended program |
|---|---|---|---|
| Token / theme maturity | Semantic tokens + themes, zero page hex | | |
| Primitive composition | Buttons/inputs/overlays only via DS | | |
| Motion role clarity | ≤12 intents; region matrix; enforcement | | |
| Motion adoption | Named presets everywhere presence exists | | |
| Grid / table IP | One shell; Fields lip; action planes clear | | |
| Chrome altitude | Global utilities quiet; table controls table-proximal | | |
| Feedback unity | One intent map across toast/inline/scan | | |
| Empty/loading | Teaching empties + skeletons declared | | |
| A11y motion | Floor + bridge + no vestibular junk | | |
| Domain waist composition | Views assemble SoTs; no presentation forks | | |
| Enforcement | Guards ratchet down; verify = CI | | |

**Premium threshold claim you must make:** which **minimum set** of dimensions must reach ≥4 before Kinetic Ledger clears “world-class premium must-have” for a reseller-ops buyer — and which can stay at 3 without killing the deal.

---

## 6. What you can do *now* without waiting on research (engineering already unlocked)

List these as **compose-now** recipes in your answer if you agree; amend if you disagree:

1. Ship any new queue on `LedgerGrid` + capabilities bag — do not invent a table.
2. Ship any new detail on `RightRailHost` push — do not float.
3. Ship any new Station swap on `stationCard` / `stationCartonSwap` as appropriate — do not invent durations.
4. Ship identifiers via `CopyChip` family — do not invent chip hues.
5. Ship confirms via DS dialog/confirm — never `alert()`.
6. Ship search hits via `SearchHit` waist — never a second search UI model.
7. Ship status changes via `transition()` — never raw status writes.
8. Prefer growing `framerTransition` / `framerPresence` over inline spring objects — even before a role layer exists.

The research is about **closing the maturity gaps** so these recipes stop competing with forks — not about enabling a greenfield rewrite.

---

## 7. Paste-ready Claude Code prompt (you must supply the winning one)

End your answer with a **≤40-line** Claude Code prompt that implements **only** your winning P0/P1 for the motion upgrade (or your chosen primary 90-day program if you picked chrome/grid over motion in D9 — but still include a 10-line motion appendix). Constraints to hard-code into that prompt:

- Stay on Kinetic Ledger; no foreign kits
- Compose / grow SoT; no page-local twins
- Do not import `motion/react` in features (respect current guard unless D4 explicitly migrates the barrel)
- Do not raise ratchet baselines
- Preserve `stationCartonSwap`, push-tween (no spring), spine opacity drill, `MotionConfig` floor
- Run `npm run verify` (or `--fast` mid-loop, full before done)

---

## 8. Anti-summary (what a bad answer looks like)

- “Use Framer Motion more” / “Add Micro-interactions everywhere”
- A 40-item motion token dump without region legality
- Recommending AG Grid or a second design system
- Ignoring the measured dual-stack (CSS vs Framer) and the `motion/react` ban
- Treating USAV staffing as the product scale
- Refusing to force D1–D12

---

## Appendix A — House motion law (compressed; full text is `display/motion-crossfade.md`)

1. Animate **opacity + small transform only**; never routine `width`/`height`/`padding` (except sanctioned push / collapseHeight).
2. **One** focus-surface crossfade per archetype; never crossfade the collection map/stream/graph.
3. `AnimatePresence mode="wait" initial={false}` + stable entity key (with documented queue-inspector and carton-swap exceptions).
4. Springs for physical/gesture; tweens for discrete swaps; **push width = tween never spring**.
5. Reduced motion = crossfade, not hard cut; `MotionConfig` floor + bridge for stronger cases.
6. Durations mostly **sub-300ms** ease-out.

## Appendix B — Sibling program map (do not expand unless colliding)

| Program | Brief / handoff |
|---|---|
| Today chrome altitude | `today-chrome-premium-altitude-GEMINI-RESEARCH-BRIEFING.md` |
| Fields → table lip | `fields-chrome-to-table-lip-HANDOFF.md` |
| Grid industry actions | `grid-industry-actions-GEMINI-RESEARCH-BRIEFING.md` |
| Type / font maturity | `contextual-font-system-GEMINI-RESEARCH-BRIEFING.md` |
| Unbox procedure stack motion | `unbox-procedure-stack-MOTION-GEMINI-RESEARCH-BRIEFING.md` |
| Right-rail inspector contract | `right-rail-inspector-contract-CLAUDE-CODE-PROMPT.md` |

## Appendix C — File index for implementers (after Gemini answers)

| Path | Why |
|---|---|
| `src/design-system/foundations/motion-framer.ts` | Preset catalog |
| `src/design-system/foundations/motion-framer-hooks.ts` | Reduced-motion bridge |
| `src/design-system/foundations/motion.ts` | CSS duration twin |
| `src/design-system/foundations/motion-major.guard.test.ts` | Import / version ratchet |
| `src/design-system/motion/plus.ts` | Motion+ sole import |
| `src/components/providers/ReducedMotionProvider.tsx` | App floor |
| `.claude/rules/display/motion-crossfade.md` | Law |
| `src/design-system/DESIGN_SYSTEM.md` | DS north star |
| `.claude/rules/source-of-truth.md` | SoT inventory |
| `.claude/rules/kinetic-ledger.md` | Identity + five laws |
