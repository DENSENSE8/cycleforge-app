# Research briefing — Competitive SoT extension + Linear-class keyboard ROI

**For:** Gemini Pro (deep research) — you do **not** have the codebase; every product fact and measurement below is embedded. Do not invent file paths or claim to have inspected source.
**From:** Cycle Forge engineering
**Date:** 2026-08-08
**Subject:** Identify SaaS / WMS platforms **similar in job** to Cycle Forge; compare and contrast against the **Kinetic Ledger** architecture already shipping in this exact codebase; prescribe what to **pull**, what to **reject**, and which **source-of-truth (SoT) modules to extend before migrating** call sites — with a forced ranking of **highest-ROI Linear-class keyboard / chrome** takeaways.
**Deliverable:** (a) peer map + compare/contrast matrix; (b) pull vs reject per peer class; (c) ranked SoT-extension backlog (grow before migrate); (d) Linear-class top-8 ROI scorecard; (e) 8–12 forced architecture D-rulings; (f) paste-ready phased execution brief an engineer can turn into HANDOFFs.

**This brief is NOT** “redesign the product identity,” “clone Linear pixels,” “adopt AG Grid / a foreign kit,” or “become a classic WMS.” Cycle Forge already has a named identity (**Kinetic Ledger**), four region contracts, a large SoT inventory, CI guards, and recent landings (table engine, Displays grammar, optimistic URL paint, motion roles, station consolidation). Your job is to pressure-test **what to absorb from peers so we extend SoT first**, then migrate — not to propose a second design language.

---

## 0. How to use this brief

### 0.1 Six deliverables (keep separate)

1. **Peer map (compare/contrast)** — named products × domain jobs × station-vs-desk × keyboard maturity × table/grid IP × multi-tenant ops, vs Cycle Forge. Explicit verdict: *are we a WMS, a reseller-ops OS, or something else?*
2. **Pull vs reject** — per peer class, ≤5 transferable patterns and ≤5 anti-patterns that would fight Kinetic Ledger / region contracts.
3. **SoT extension before migration** — ranked backlog of **SoT growth** (named modules, keyboard ownership taxonomy, compounds, presentation kinds) that should land **before** broad call-site migration. Prefer grow → guard → golden migrate → sibling port.
4. **Linear-class highest ROI** — top 8 pulls ranked by `(operator throughput × fit to existing SoT × 1/blast-radius)`. Map each onto **already shipped vs gap**.
5. **Overarching architecture D-rulings** — force D1–D12 (or your equivalent 8–12). No retreat into “it depends.”
6. **Paste-ready execution brief** — ordered phases for Claude Code / Cursor HANDOFFs.

### 0.2 Two research axes (one product)

| Axis | Peer class | Use for |
|---|---|---|
| **A — Product / domain** | Enterprise WMS (SAP EWM, Manhattan Active WM, Blue Yonder, Oracle WMS Cloud); mid-market ecommerce/3PL WMS (ShipHero, Extensiv/Skustack, ShipBob ops UI, Cin7, Softeon / Made4net); any public **refurb / reseller / reverse-logistics** ops UIs | Job coverage, directed work, RF/station HMI, ASN→putaway→pick→pack, inventory truth |
| **B — Interaction / chrome** | Linear, Attio, Height, Plain, Front; Stripe Dashboard / Vercel / Cloudflare (dense calm); Notion only as **chrome contrast** (not a target shape) | Command palette, chord namespaces, focus ownership, selection paint, quiet chrome, keyboard help |

**Hard fork you must keep:** office-SaaS calm ≠ **1080p scan-floor act-and-clear** with a USB wedge scanner. Keyboard ROI for Station must reconcile with wedge-first input. A sibling brief already owns Unbox arrow-axis grammar — cite it; do not re-litigate the ←/→ vs ↑/↓ map unless industry evidence **overturns** it.

### 0.3 Sources to cover (minimum)

Cite **named systems** and **primary sources**. Prefer docs, design systems, RF key maps, changelogs, and research dated **2024–2026**.

| Class | Examples | Use for |
|---|---|---|
| Enterprise WMS / RF | SAP EWM RF / ITS Mobile; Manhattan; Blue Yonder; Oracle WMS Cloud RF; Körber/HighJump | Directed work steps, line vs LPN navigation, F-keys |
| Mid-market WMS SaaS | ShipHero, Extensiv, ShipBob, Cin7 | Sellable SaaS density, desk+floor split |
| Premium command SaaS | Linear, Attio, Plain, Front, Height | Keyboard grammar, palette depth, chrome quiet |
| Dense ops dashboards | Stripe Dashboard, Vercel, Datadog, Cloudflare | Table maturity, calm density |
| Design-system governance | Shopify Polaris, IBM Carbon, Atlassian, Fluent 2 | Token layers, anti-drift — only as **governance** peers, not visual targets |
| Research / a11y | Nielsen Norman feedback timing; WCAG 2.3.3 | Duration floors, reduced motion |

Where industry splits, give **both** positions, conditions each wins, then pick one for **this** product and say why.

### 0.4 Anti-patterns for your answer

- Recommending a foreign grid (AG Grid, MUI DataGrid, Handsontable) or a second visual language
- Cloning Linear’s soft radius / pastel document calm onto Station floors
- “Become SAP EWM” feature parity as a roadmap
- Raising DS ratchet baselines or weakening guards
- Migrating N call sites **before** naming the SoT those sites should compose
- Framing Cycle Forge as a five-person shop tool — USAV is dogfood only
- Re-answering sibling briefs listed in §0.5
- Treating “more animation” or “more pages” as premium

### 0.5 Sibling briefs — do not re-answer; reconcile only where decisions collide

| Sibling | Owns | This brief may cite, must not redo |
|---|---|---|
| [`in-house-libraries-premium-gap-GEMINI-RESEARCH-BRIEFING.md`](./in-house-libraries-premium-gap-GEMINI-RESEARCH-BRIEFING.md) | Library maturity + motion-role worked example | Cite capability map; do not re-score motion library internals |
| [`chrome-sot-compound-GEMINI-RESEARCH-BRIEFING.md`](./chrome-sot-compound-GEMINI-RESEARCH-BRIEFING.md) | Chrome consolidation governance loop | Assume compound loop stands |
| [`unbox-middle-keyboard-axes-WMS-GEMINI-RESEARCH-BRIEFING.md`](./unbox-middle-keyboard-axes-WMS-GEMINI-RESEARCH-BRIEFING.md) | Unbox ←/→ steps · ↑/↓ lines grammar | Cite; do not redesign the two-axis map unless overturning with evidence |
| [`optimistic-url-paint-industry-GEMINI-RESEARCH-BRIEFING.md`](./optimistic-url-paint-industry-GEMINI-RESEARCH-BRIEFING.md) | Mount-gated URL paint SoT | Already shipping; cite as keyboard/selection peer only |
| [`page-consolidation-station-first-GEMINI-RESEARCH-BRIEFING.md`](./page-consolidation-station-first-GEMINI-RESEARCH-BRIEFING.md) | Page count vs station-first IA | Do not re-open page-collapse unless peer map forces it |
| [`grid-industry-actions-GEMINI-RESEARCH-BRIEFING.md`](./grid-industry-actions-GEMINI-RESEARCH-BRIEFING.md) | Spreadsheet action planes | Out of scope except as table-IP peer |
| [`nonlinear-data-table-engine-GEMINI-RESEARCH-BRIEFING.md`](./nonlinear-data-table-engine-GEMINI-RESEARCH-BRIEFING.md) + [`ledgergrid-unified-table-sot-RESEARCH-HANDOFF.md`](./ledgergrid-unified-table-sot-RESEARCH-HANDOFF.md) | Table engine / LedgerGrid unification | Cite as in-flight SoT growth; do not redesign column model |
| [`displays-character-select-game-feel-GEMINI-RESEARCH-BRIEFING.md`](./displays-character-select-game-feel-GEMINI-RESEARCH-BRIEFING.md) | Displays leaf commit feel | Cite `feedback.hitMarker`; do not invent a second hit-marker role |
| Handoffs (context only) | `station-sot-consolidation-HANDOFF.md`, `cmdk-identifier-find-triage-HANDOFF.md`, `operator-label-vocabulary-HANDOFF.md`, `regional-sidebar-split-HANDOFF.md`, `masternav-spine-color-and-motion-HANDOFF.md`, `optimistic-url-paint-MIGRATE-HANDOFF.md` | Current program pressure — not research to redo |

---

## 1. Product vocabulary (mandatory)

**Cycle Forge** — multi-tenant **reseller-operations SaaS** (receive → unbox → triage → test → repair → catalog → pack → ship → warranty/support). USAV is the first dogfood tenant only. Vendor integrations (Zoho, Zendesk, eBay, …) sit behind **capability facades** — never hardcoded as the product itself in operator copy (except Integrations hub).

**Kinetic Ledger** — UI identity: dense, state-colored, scan-aware; **legible throughput over document calm**. Calm chrome (Linear discipline), not Notion whitespace. Ops density = **exact flush + plane depth** (surface steps · elevation · nest on one shared canvas) — not floating column islands. Ops chrome is **zero-radius industrial** (`cornerClass('flush')`); soft radius / horizontal pill bands are debt. `rounded-full` survives only for status dots · avatars · Switch tracks.

**Industry blend already declared in house law:** ops density (Carbon / Stripe Dashboard) + Linear chrome + POS/scan floors + Studio canvas.

**Region contracts** (house law — use these words; they are I/O + persistence, not layout skins):

| Contract | Driven by | Job | Selection | Density |
|---|---|---|---|---|
| **Station** | barcode / wedge | act-and-clear | ephemeral (entity not URL-durable as selection) | `floor` |
| **Workbench** | pointer | pick → edit → persist | durable, URL-addressable | `ops` |
| **Monitor** | filters over a stream | observe only | none | `rollup` |
| **Canvas** | pan/zoom | reshape a definition | durable focus | `studio` |

**Workbench branches** (Layer C recipes on Workbench only — not a fifth archetype): `ops-queue` · `master-detail` · `board` · `fact-stack` · `service-workspace`.

**Pattern law (pattern-evolution):** compose named SoT → **grow SoT when wrong** → compound. Never fork a page-local twin for the same job. A retirement is not done until the old path is **deleted** or a **guard allowlist** names surviving call sites (shrink-only).

**Physical bench reality (governs Station answers):**

| Fact | Value |
|---|---|
| Display | 1080p / 1440p monitor, landscape |
| Viewing distance | ~3 ft |
| Posture | standing; hands on product + keyboard-wedge scanner |
| Primary input | scanner (wedge types into focused field + Enter), not pointer |
| Session | act-and-clear, minutes not hours |

**Right-edge modality (ratified):** the right edge **pushes**; it never floats over the work surface. AI (header Sparkles) and record/ticket details share **one** right-edge slot — detail outranks assistant.

**Operator copy law (in flight):** Station **Open displays** ≠ Desk Band 3 **Show inspector** — never “details editor” on the Station `←|`.

---

## 2. What this codebase already is (ground truth — measured 2026-08-08)

Treat §2 as factual. Do not contradict with invented architecture.

### 2.1 Scale

| Metric | Count (2026-08-08) |
|---|---|
| `src` files (`.ts` / `.tsx`) | **5,680** |
| `src` LOC (`.ts` / `.tsx`) | **~825k** |
| Next.js `page.tsx` | **146** |
| API `route.ts` | **921** |
| `*.guard.test.ts` files | **214** |
| Git HEAD (local main) | `831669c18` — ahead of `origin/main` by 8 commits at measure time |

### 2.2 Operator surface registry (`SURFACE_REGISTRY`)

Closed set of first-class surfaces (compile-enforced):

| Key | Label | Route | Archetype | Workbench branch | Scan policy |
|---|---|---|---|---|---|
| `unbox` | Unbox | `/unbox` | station | — | `unbox` |
| `triage` | Arrival | `/triage` | station | — | `triage` |
| `incoming` | Inbound | `/incoming` | workbench | `ops-queue` | — |
| `pickup` | Local Pickup | `/pickup` | workbench | `ops-queue` | `pickup` |
| `repair` | Repair | `/repair` | workbench | `ops-queue` | — |
| `history` | Receiving History | `/receiving/history` | monitor | — | — |
| `pack` | Packing | `/pack` | station | — | — |
| `test` | Testing | `/test` | station | — | — |
| `outbound` | Shipping | `/shipping` | station | — | — |
| `support` | Support | `/support` | workbench | `service-workspace` | — |

**Note:** Support was corrected from a false `station` archetype (2026-08-01) — scan was already `null`; nav section ≠ region contract.

### 2.3 Unbox golden composition (main dogfood Station — 2026-08-07+)

```text
Identity (carton context sticky)
└─ Centre ledger: PO lines + label preview
   · PO meta = condition · serial LEDGER (click focuses dock — no under-row editor)
   · Centre ProcedureDeck PARKED
└─ Bottom UnboxDockHost (command locus)
   · Leading: step CTA · Notes · Print · Receive
   · Capture trio: Serial → Condition → Photos
   · Under-page: procedure pager | progress ring
└─ Displays push column (Pairing · Photos · Ticket · Units · Timeline · …)
   · Reference / Action plane beside middle — NEVER centre advisory tabs
```

**Laws that bind peers:**

- Scan-station centre = **ops-flow only** (lines + station I/O). Advisory / dossier / ticket history = Displays.
- Arrival carve-out: centre = door-flow plane (items without units chrome + Classify + Staging); Displays = Pairing only.
- Frame: middle lock **`STATION_PUSH_CENTER_FLOOR_PX = 720`**; Displays `flex-1` fills leftover (Flex-Grow Sandwich). Desk inspectors keep `MIN_WORK_SURFACE_PX = 784`.
- Received meters mean **inventory-confirmed** qty (`inventoryReceivedDisplayQty`) — Unboxed ≠ Received.

### 2.4 Design-system / SoT spine (already unlocked)

| Layer | What exists |
|---|---|
| Tokens | Color semantic, spacing/density, radius (`flush` law), elevation, z-index, focus-ring, table-surface, app-surface |
| Themes | `data-theme` registry (light/dark/mono/slate/forest/ember…) |
| Primitives | Button, IconButton, Panel, CardShell, SearchField, Switch, Checkbox, menus, OmnichannelComposerDock, spacing primitives |
| Grid IP | `LedgerGrid` / `LedgerGridSurface` + capabilities bag + column visibility/widths/sort + drill host + justification SoT |
| Table engine (new) | `NonlinearTableHost` + `table-definition-registry` — Receiving/Incoming + **10 GridViews** bound (commit `e8795764e`) |
| Motion | Import path `@/design-system/motion` only; `motionRole` jobs: `swap.scan` · `swap.focus` · `push.rail` · `gesture.press` · `feedback.pulse` · `feedback.hitMarker` · `procedure.advance` (**deferred**) — ~39 files already consume `motionRole.*` |
| Shells | `RightRailHost`, `ContextPanelLayout`, `StationDisplaysPushColumn` / `StationDisplaysPushStack`, detail-stack tokens |
| Presentation kinds | dates, condition, source-platform, carrier, CopyChip family, SearchHit, capability labels, stacked/compact activity rows |
| Backend waists | `transition()` for status; `orgId` from ctx; hybrid search; barcode encode/decode pair; audit |

### 2.5 Keyboard / focus ownership already shipped

| Chord / mechanism | Owner | Job |
|---|---|---|
| ⌘K / Ctrl+K | `CommandBar.tsx` **sole binder** (`cmdk-owner.guard.test.ts`) | Nav palette + **identifier find mode** when `looksLikeIdentifier` → `commitIdentifierFind` |
| ⌘] / Ctrl+] | `displays-toggle-hotkey.ts` | Station Displays open/close (= `←|` / `→|`); stands down for overlays |
| ⌘B / Ctrl+B | `context-panel-toggle-hotkey.ts` | Left context rail park/restore; MasterNav spine stays **click-only** |
| Escape / ambient | `overlay-stack/store.ts` | Overlay ownership — Escape not free-for-all |
| Insert (default) | `DEFAULT_FOCUS_SCAN_HOTKEY` + scan-hotkey store | Re-arm StationScanBar focus (staff-preference overrideable) |
| ← / → | `useUnboxProcedureArrowKeys` | Procedure step paging (Unbox) |
| ↑ / ↓ / j / k | `useRecordCursorKeyboard` + `CursorScope` (`record` vs `sibling`) | Queue vs in-carton line cursor |
| list-key-scope | `data-list-key-owner` / `data-list-key-region-open` | Ambient list keys stand down when Displays / list owns focus |
| Desk inspector | ⌘\ + bare `]` (desk History / To-ship — distinct from Station Displays ⌘]) | Desk right-rail |

**Measured adoption:**

| Signal | Count |
|---|---|
| Files referencing `useOptimisticUrlParam` | **20** |
| Files referencing `StationDisplaysPush*` | **35** |
| Files referencing `LedgerGridSurface` | **62** |
| Files referencing `NonlinearTableHost` | **22** |
| Files with `useRecordCursorKeyboard` / `useUnboxProcedureArrowKeys` | **14** |

### 2.6 Recent landings that change the competitive frame (July–Aug 2026)

| Landing | Why it matters for peer research |
|---|---|
| `motionRole` barrel + guard | Motion intent layer exists — peers should advise **roles**, not new springs |
| Optimistic URL-param paint SoT | Selection paint solved for mount-gated opens — Linear-like “instant open” already has a house answer |
| NonlinearTableHost registry | Table IP is growing into a registry engine — do not recommend a third table shell |
| Displays one-nav grammar | Every declared Station Display reachable; index + hotkeys |
| Yield-ladder 3-column resize | Frame math is product IP — peers that float overlays lose |
| Station SoT consolidation (“Unbox is the pattern”) | Migration program exists; research must feed **SoT growth**, not parallel station languages |
| Dead-surface / knip burn-down | Prefer delete + guard over “keep twin for later” |
| Spine vocabulary: modes = child pages | Nav IA already evolving toward Linear-like nested destinations |
| ⌘K identifier find | Palette is not only nav — find mode for durable IDs |

### 2.7 In-flight / working-tree pressure (do not treat as settled law)

| Theme | Doc / signal |
|---|---|
| MasterNav spine color + motion | `masternav-spine-color-and-motion-HANDOFF.md` |
| ⌘K find triage metrics | `cmdk-identifier-find-triage-HANDOFF.md` |
| Operator label vocabulary | `operator-label-vocabulary-HANDOFF.md` |
| Regional sidebar split | `regional-sidebar-split-HANDOFF.md` |
| LedgerGrid unified table SoT | `ledgergrid-unified-table-sot-RESEARCH-HANDOFF.md` |
| Displays character-select game feel | Displays briefing + `feedback.hitMarker` |
| Optimistic paint migrate remaining surfaces | `optimistic-url-paint-MIGRATE-HANDOFF.md` |

---

## 3. What “similar” means for this product (force a definition)

Before naming peers, define similarity on **jobs**, not marketing category.

Cycle Forge’s durable jobs (operator-facing):

1. **Inbound carton walk** — scan → identify → photograph → serial/condition → label → receive
2. **Exception / claim / ticket** — evidence + helpdesk without leaving the bench (Displays)
3. **QC / testing** — pass/fail + ticket auto-open, still Station middle ops-flow
4. **Pack / ship** — order-centric scan loops
5. **Desk queues** — Incoming / Orders / History as Workbench ops-queue + LedgerGrid
6. **Marketplace identity** — platform-aware order/PO chips (last-8 face, full-id hover, bare copy)
7. **Support service workspace** — list | thread | context on Workbench physics
8. **Multi-tenant capability facades** — integrations are connectors, not the product noun

**Forced ask:** Rank which peer products share ≥4 of these jobs. Products that only share “has inventory” are **weak peers** — say so.

**Forced verdict you must give in one sentence:**  
> Cycle Forge is / is not a WMS; it is best classified as ________ because ________.

---

## 4. Research questions (answer all)

### A. Peer catalog + compare/contrast

Build a matrix (rows = peers; columns at minimum):

| Column | Meaning |
|---|---|
| Domain coverage | Which of jobs 1–8 above |
| Floor vs desk | Dedicated RF/station UI vs single web UI |
| Keyboard maturity | Documented chords / palette / RF key map |
| Table / queue IP | Spreadsheet-grade queues or form lists |
| Multi-tenant SaaS | Sellable tenant model vs on-prem/enterprise project |
| Closest Cycle Forge surface | Unbox / Incoming / Pack / Support / … |
| Transferability 1–5 | Fit to Kinetic Ledger without fighting region contracts |

Minimum peer set (expand with primary sources):

**Enterprise / industrial:** SAP EWM RF, Manhattan Active WM, Blue Yonder WMS, Oracle WMS Cloud, Körber.

**Mid-market SaaS WMS / fulfillment:** ShipHero, Extensiv (Skustack / Softsteel lineage), ShipBob merchant/ops UI, Cin7, Softeon or Made4net.

**Reseller / reverse / refurb (if public):** any documented reverse-logistics or refurb WMS UI — say if the category is thin.

**Interaction peers (Axis B):** Linear, Attio, Plain, Front, Stripe Dashboard, Vercel.

For each peer class, write **≤6 bullets** of compare/contrast vs Cycle Forge (not a brochure paraphrase).

### B. Pull vs reject (per class)

For each of: (1) enterprise WMS, (2) mid-market WMS SaaS, (3) Linear-class command SaaS, (4) dense dashboard (Stripe/Vercel):

- **Pull (≤5):** pattern name · why ROI · which Cycle Forge SoT it should **grow** · migration blast radius
- **Reject (≤5):** pattern name · why it fights Kinetic Ledger / Station wedge / flush planes / one-right-edge

### C. SoT extension before migration (the core ask)

Assume this governance loop is law:

```text
Discover twin job → Name/grow SoT → Guard (shrink-only) → Migrate golden → Port siblings → Delete twin
```

Produce a **ranked backlog (P0 → P3)** of SoT **growth** items that should exist **before** large migrations. Each item:

| Field | Required |
|---|---|
| Name | Proposed SoT module / compound / ownership map |
| Job it owns | One sentence |
| Evidence from peers | Which product proves the job |
| Why before migrate | What breaks if we migrate first |
| Golden consumer | Unbox / Incoming / Support / GlobalHeader / … |
| Guard shape | What a `*.guard.test.ts` would forbid |
| Non-goals | What this SoT must not absorb |

**Force at least one item in each bucket:**

1. Keyboard / focus ownership taxonomy (global)
2. Station Displays vs Desk inspector vocabulary + chords
3. Command palette depth (nav vs find vs actions)
4. Table / queue shell unification (LedgerGrid vs NonlinearTableHost roles)
5. Operator label / copy vocabulary
6. Frame / rail geometry (already strong — only grow if peers show a missing job)
7. Feedback / hit-marker / scan acknowledgement unity
8. Selection / optimistic paint (mostly shipped — only gap-close)

**Explicit ban:** “Migrate all stations to look like Unbox” without naming the shared SoT modules Unbox already is.

### D. Linear-class highest ROI (top 8)

Score each candidate pull 1–5 on: throughput impact · SoT fit · low blast radius. Rank by product of scores (or your defended weighted formula — state it).

Candidates you **must** score (add more if ROI is higher):

1. Command palette as **typed find + nav** (we have both — deepen?)
2. Chord **namespace** / conflict matrix (documented Linear-style)
3. Keyboard **cheat-sheet / help** surface (`?` overlay) vs none
4. Instant selection paint (we have optimistic URL paint — what’s left?)
5. Quiet global chrome vs work-proximal controls
6. List ownership / focus trapping for ↑↓ (we have scopes — gaps?)
7. Undo / toast action affordances
8. “Issue/entity open is URL-durable” on Workbench (already law) vs Station ephemeral
9. Nested destinations / child pages in spine (in flight)
10. Reduced-motion + motion-role discipline (already strong)

For each top-8 entry: **Already shipped / Partial / Missing** → exact next SoT growth (not a feature dump).

### E. When WMS RF grammar beats Linear

Force a ruling: which keyboard/interaction patterns should come from **industrial WMS/RF** rather than Linear for Station regions? Which must stay Linear-like for Workbench / Monitor? Produce a **region × peer-source** matrix.

### F. Overarching system architecture — forced decisions

Take a side on each:

| ID | Decision |
|---|---|
| **D1** | Are we a WMS, a reseller-ops OS, or a hybrid — and which peer class is the **north-star product** for the next 12 months of SoT growth? |
| **D2** | One keyboard-ownership SoT module vs today’s distributed hotkey files — grow a registry or keep per-chord modules? |
| **D3** | ⌘K depth: nav+find only vs also **actions** (Linear command menu) — when? |
| **D4** | Station Displays vs Desk inspector: one chrome family with two vocabularies, or permanently split chords + labels? |
| **D5** | LedgerGrid vs NonlinearTableHost: one SoT with two faces, or two jobs — name the boundary |
| **D6** | Should MasterNav gain any keyboard jump beyond click + ⌘K nav mode? |
| **D7** | Undo: product-level undo stack vs mutation toasts only — for floor vs desk |
| **D8** | Should we expose a Linear-like `?` shortcuts overlay before or after keyboard taxonomy SoT? |
| **D9** | Port Unbox SoT to sibling stations: order of surfaces (force a sequence) |
| **D10** | What must **never** be pulled from enterprise WMS UIs (list ≥5) |
| **D11** | What must **never** be pulled from Notion / document SaaS (list ≥5) |
| **D12** | 90-day success metric: how do we know SoT extension beat peer-cloning? (measurable) |

### G. Execution brief

End with a phased plan an engineer can paste:

```text
Phase 0 — SoT grow (named modules + guards), zero call-site vanity
Phase 1 — Golden migrate (Unbox / one desk queue)
Phase 2 — Sibling port (Testing · Pack · Incoming · …)
Phase 3 — Delete twins / shrink allowlists
```

Each phase: ≤8 bullets, file-level targets using paths from §2, verify gate (`npm run verify`), no foreign kits.

Also supply a **≤40-line Claude Code prompt** for Phase 0 only (SoT growth), hard-coding house constraints from §0.4.

---

## 5. Constraints Gemini must not violate

1. **Compose / grow SoT; never fork twins** for the same job.
2. **Station centre = ops-flow;** Displays = reference/action push — never centre advisory strip.
3. **One right-edge slot;** push not float; middle lock 720 on scan stations.
4. **Motion only via `@/design-system/motion` / `motionRole`** — no new page-local springs; `framer-motion` / `motion/react` banned outside the motion package.
5. **⌘K sole owner** — no second binder; identifier find shares `commitIdentifierFind`.
6. **Optimistic URL paint** for mount-gated opens — do not invent feature-local pending twins; do not unify with sync-guard.
7. **Flush ops chrome** — reject soft pill bands as “premium.”
8. **Capability nouns** in operator copy — not hardcoded vendor product sentences.
9. **`npm run verify` / never raise ratchet baselines.**
10. **USAV is dogfood** — design for sellable multi-tenant SaaS.

---

## 6. Scorecards Gemini must fill

### 6.1 Peer transferability (1–5)

| Peer | Domain fit | Keyboard fit | Table fit | Visual/chrome fit | Overall transferability | Top pull | Top reject |
|---|---|---|---|---|---|---|---|
| SAP EWM RF | | | | | | | |
| Manhattan | | | | | | | |
| Blue Yonder | | | | | | | |
| Oracle WMS Cloud | | | | | | | |
| ShipHero | | | | | | | |
| Extensiv | | | | | | | |
| ShipBob | | | | | | | |
| Cin7 | | | | | | | |
| Linear | | | | | | | |
| Attio | | | | | | | |
| Plain / Front | | | | | | | |
| Stripe Dashboard | | | | | | | |
| Vercel | | | | | | | |
| *(add 2–4 if ROI)* | | | | | | | |

### 6.2 Linear-class ROI ranking

| Rank | Pull | Throughput | SoT fit | Low blast | Product score | Shipped/Partial/Missing | Next SoT growth |
|---|---|---|---|---|---|---|---|
| 1 | | | | | | | |
| … | | | | | | | |
| 8 | | | | | | | |

### 6.3 SoT-before-migrate backlog

| Priority | SoT name | Golden | Guard | Blocks which migration |
|---|---|---|---|---|
| P0 | | | | |
| P0 | | | | |
| P1 | | | | |
| … | | | | |

---

## 7. Anti-summary (what a bad answer looks like)

- A feature parity roadmap with SAP EWM
- “Make it look like Linear” (soft cards, spacious whitespace, pill chrome)
- Recommending AG Grid / Retool / foreign DS
- Migrating Testing/Pack/Shipping to Unbox chrome **without** naming shared SoTs + guards
- Re-litigating Unbox ←/→ · ↑/↓ without new industrial evidence
- Ignoring optimistic URL paint / Displays push / motionRole as already-shipped answers
- “It depends” on D1–D12 without a forced pick
- Treating USAV headcount as product scale

---

## Appendix A — File index for implementers (after Gemini answers)

| Path | Why |
|---|---|
| `src/design-system/DESIGN_SYSTEM.md` | Kinetic Ledger north star |
| `.claude/rules/kinetic-ledger.md` | Five laws |
| `.claude/rules/source-of-truth.md` | SoT inventory |
| `.claude/rules/pattern-evolution.md` | Compose → grow → compound |
| `.claude/rules/contextual-display.md` + `display/*` | Region contracts |
| `src/lib/stations/surface-keys.ts` | SURFACE_REGISTRY |
| `src/components/CommandBar.tsx` | ⌘K sole owner |
| `src/lib/search/commit-identifier-find.ts` | Identifier find commit |
| `src/components/station/displays/displays-toggle-hotkey.ts` | Displays ⌘] |
| `src/components/sidebar/context-panel-toggle-hotkey.ts` | Context ⌘B |
| `src/lib/overlay-stack/store.ts` | Escape ownership |
| `src/hooks/useOptimisticUrlParam.ts` | Mount-gated paint |
| `src/lib/routing/optimistic-url-param.ts` | Paint helpers |
| `src/components/tables/NonlinearTableHost.tsx` | Registry table host |
| `src/components/tables/table-definition-registry.ts` | Table definitions |
| `@/design-system/components/grid` | LedgerGrid IP |
| `src/design-system/motion/roles.ts` | motionRole jobs |
| `src/lib/right-rail/frame.ts` | 720 / 784 floors |
| `src/hooks/useRecordCursorKeyboard.ts` | Record/sibling cursor |
| `AGENTS.md` | Portable hard laws |

## Appendix B — Recent commit anchors (context for “most recent updates”)

Use as evidence of direction, not as tasks to re-implement:

- `e8795764e` — registry-driven table engine (`NonlinearTableHost`)
- `a759e9a02` — every declared Station Display reachable; one nav grammar
- `3f7edbba8` — yield-ladder 3-column frame resize
- `873018472` — saved-views rail + regional sidebar split guard
- `905ee4ffe` — station SoT consolidation handoff (Unbox is the pattern)
- `d5d805032` / `fbcb98518` — motionRole adoption + barrel-only motion imports
- Optimistic URL paint SoT + migrate handoffs (2026-08-07)
- ⌘K identifier find + guards + e2e (2026-08-07)

## Appendix C — Paste template for Gemini’s final section

Your answer’s last section should be copy-pasteable as:

```markdown
# Execution brief — Competitive SoT extension (Cycle Forge)

## Verdict
<one paragraph>

## D-rulings (D1–D12)
...

## P0 SoT growth (this week)
...

## Phase plan
...

## Claude Code prompt (Phase 0 only)
...
```
