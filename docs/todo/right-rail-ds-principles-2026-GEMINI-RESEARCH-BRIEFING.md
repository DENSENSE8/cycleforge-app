# Research briefing — 2026 industry-standard design-system principles for right rails (Displays · Inspector · Intake)

**For:** Gemini Pro (deep research) — **you have read access to this repository.** Paths below are pointers; open the real files. Do not invent modules or claim behaviors you did not verify.
**From:** Cycle Forge engineering
**Date:** 2026-08-09
**Subject:** What **exact industry-standard design-system principles (2024–2026)** must a dense B2B ops **right-edge plane** meet — and how should Cycle Forge **audit + close gaps** across (1) Station **Displays**, (2) Desk **Inspector** peeks, and (3) **Intake / create** overlays that share `RightRailHost`?
**Status:** OPEN — research + gap gate. Not an implementation plan yet.
**Dogfood surfaces (priority order):**
1. Unbox **Station Displays** — `StationDisplaysPushStack` / `StationDisplaysPushColumn` (golden Action plane).
2. Desk **selected-order inspector** — `detail:order` / `ShippedDetailsPanel` + History twin `detail:history`.
3. **New Order intake** — `detail:new-order` / `SidebarIntakeFormShell` (chrome family without ↑↓ queue walk).

**This brief is NOT** “clone Linear’s drawer,” “merge Displays into RightRailHost,” “redesign Kinetic Ledger from scratch,” or “add a fourth host.” It is a **standards + acceptance gate** for the **right-edge family split** so every new occupant picks the correct host + chrome + navigation affordances — especially **when ↑↓ queue walk is required vs forbidden**.

---

## 0. Method — read before answering

### 0.1 Three deliverables (keep separate)

1. **Industry principles catalog (2026).** A named, citable taxonomy of design-system principles that mature products apply to **right panels / inspectors / drawers / split panes / create sidebars** in dense B2B admin + ops SaaS. Prefer primary sources dated **2024–2026**. Group by principle class (see §0.3). Each principle gets: name · one-sentence rule · who ships it · when it applies · when warehouse-ops SaaS may deviate.
2. **Codebase audit of Cycle Forge right-edge planes.** Map every principle onto the **current** hosts + chrome families. Quote file + line / symbol. Verdict per principle: `PASS` / `PARTIAL` / `FAIL` / `N/A (defended deviation)` with evidence.
3. **Gap-close backlog + acceptance gate.** A concrete checklist: what to grow in SoT modules (not page forks), what automated guards / unit tests / E2E / manual floor checks prove the bar, and an explicit **GO / NO-GO** for adding new right-rail occupants (especially create/intake without queue nav).

### 0.2 Repo verification (mandatory)

Prior briefs in this repo failed when paths were inferred. Rules:

- Every path you name must be one you opened. Mark guesses `[UNVERIFIED]`.
- Load-bearing claims need a quote: symbol, type field, or line.
- Prefer reading SoT + guards over re-deriving from component names.
- If a sibling brief already ruled something, **cite and extend** — do not re-litigate (see §0.5).
- **Law supersessions matter.** Older briefs may say “inspectors float”; current hard law is **resident edges PUSH** (2026-08-01). Always prefer `AGENTS.md` + `.claude/rules/source-of-truth.md` over stale handoffs.

### 0.3 Principle classes you must cover (minimum)

Produce a principle for each row. Add rows only if industry evidence is strong; do not invent fluff axes.

| Class | What “industry standard” means here |
|---|---|
| **A. Information architecture** | When detail is a push column vs overlay vs dedicated route; one vs many right slots; create vs inspect vs tool; selection→panel coupling |
| **B. Host / shell taxonomy** | Named panel kinds (inspector · drawer · sheet · dialog · side nav tool); modality; push vs float; resize; collapse/park |
| **C. Header & chrome grammar** | Close glyph semantics; identity density; optional queue prev/next; contextual actions; when create chrome differs from inspect chrome |
| **D. Body & density** | Fact lists vs forms; nested cards ban; flush sheet-band fields; index→leaf vs tabs; action floors / sticky CTAs |
| **E. Keyboard & a11y** | `dialog` vs `region`; Escape / park / dismiss; focus restore; live region for row change; reduced motion; WCAG 2.2 |
| **F. Visual system** | Tokens (type, space, color, elevation, focus); flush-square ops chrome; hairline resize; depth-as-planes |
| **G. Occupancy & exclusivity** | Priority between AI assistant and record detail; multi-select → compare/batch bodies; stable occupant ids vs per-record remount |
| **H. Governance** | One SoT host; anti-fork; chrome-family allowlists; DS lint/ratchets; golden-page dogfood before fan-out |

### 0.4 Sources to search (minimum — cite primary docs)

| Class | Named systems / specs (start here; expand with 2024–2026 sources) |
|---|---|
| Design systems — panels / drawers | Shopify Polaris (Sheet / Modal / IndexTable selection) · IBM Carbon (Tearsheet / SidePanel / Modal) · Atlassian / Atlaskit drawers · Fluent 2 Panel / Dialog · Material 3 side sheets · Adobe Spectrum Dialog / Tray · GitHub Primer |
| Ops / productivity shells | Linear issue panel · Notion side peek · Stripe Dashboard detail drawers · Retool / Salesforce record panels · Claude / Cursor-class floating/push chrome (interaction grammar only) |
| WMS / fulfillment admin | ShipStation / ShipBob / Extensiv-class inspectors (density + queue walk lessons — cite what you can verify) |
| A11y / APG | WAI-ARIA APG Dialog · Disclosure · Window Splitter · WCAG 2.2 (focus visible, target size, motion) |
| Research | Nielsen Norman Group (side panels / overlays / progressive disclosure) · inclusive-design guidance for dense UIs |

**Hard fork (state it in every contested ruling):**  
“What a general admin Sheet does” ≠ “what a scan-adjacent warehouse-ops Station Displays column + desk queue inspector on a ~1080p floor monitor should do.” Cycle Forge is the latter (**Kinetic Ledger**).

### 0.5 Related briefs — cite, do not redo

| Brief | Already owns |
|---|---|
| `docs/todo/right-panel-sheet-band-flush-GEMINI-RESEARCH-BRIEFING.md` | Flush “column = the card” form/list chrome; nested-box playbook |
| `docs/todo/detail-surface-IA-GEMINI-RESEARCH-BRIEFING.md` | Slide-over vs dedicated page across entities (partially superseded on order search feedback) |
| `docs/todo/receiving-details-float-push-GEMINI-RESEARCH-BRIEFING.md` | **Stale modality framing** — Model B float; superseded house-wide by push law 2026-08-01; use only for historical decisions on `detail:receiving` station opt-out |
| `docs/todo/dashboard-inline-detail-editing-GEMINI-RESEARCH-BRIEFING.md` | Non-modal desk order inspector modality fight |
| `docs/todo/import-add-order-right-rail-HANDOFF.md` | Intake → `RightRailHost` `modal={false}` metric (shipped Phase 0–1) |
| `docs/todo/carton-inspector-ux-GEMINI-RESEARCH-BRIEFING.md` | Read-only `/carton/[id]` job taxonomy (not Station Displays) |
| `docs/todo/displays-character-select-game-feel-GEMINI-RESEARCH-BRIEFING.md` | Displays Root Index cursor feel |
| `docs/todo/engineering-instrument-panel-UX-GEMINI-RESEARCH-BRIEFING.md` | Instrument-panel density laws that feed fact rows |
| `docs/todo/chrome-sot-compound-GEMINI-RESEARCH-BRIEFING.md` | DS governance vs 2026 practice |
| `docs/todo/workbench-table-ds-principles-2026-GEMINI-RESEARCH-BRIEFING.md` | Sibling method for Workbench **tables** — mirror structure, different surface |

Your job is the **cross-cutting 2026 DS principle bar + right-edge family gap gate**, not reopening sheet-band conversion recipes or table fan-out.

### 0.6 Closed forever (do not recommend unless Ask-first with strong evidence)

- Mounting **Station Displays** as a `RightRailHost` occupant (or renaming Displays “inspector”)
- Dual permanent right columns (AI + record detail side-by-side) without a budget gate + SoT growth
- Re-adopting **modal + scrim** as the default for desk queue peeks
- Putting **`SidebarIntakeFormShell`** on record inspectors (hero-title anti-pattern)
- Putting **↑↓ queue walk** on create/intake overlays that have no queue
- Cargo-culting Unbox `stationMoreDetailsPaneHostClass` absolute chrome **inside** a Desk `RightRailHost` card
- Soft radius / pill chrome on ops rails (flush-square law)
- Motion via `framer-motion` / `motion/react` outside `src/design-system/motion/**`
- Raising DS ratchet baselines to “pass”
- Page-local `fixed right-0 z-panel w-[420px]` panels (one host only)

---

## 1. Product context (read these laws)

| Concern | Path |
|---|---|
| Portable hard laws | `AGENTS.md` |
| SoT index + right-edge laws | `.claude/rules/source-of-truth.md` → **Displays vs inspector** · **Right-rail modality** · **Frame column budget** · Panel header grammar |
| Right-rail inspector recipe | `.claude/rules/display/right-rail-inspector.md` |
| Station Displays recipe | `.claude/rules/display/station-workbench.md` (+ Displays Root Index) |
| Pattern evolution | `.claude/rules/pattern-evolution.md` |
| Kinetic Ledger identity | `.claude/rules/kinetic-ledger.md` |
| Density / type / focus | `.claude/rules/ui-design-system.md` |
| Region contracts | `.claude/rules/contextual-display.md` |
| Design-system overview | `src/design-system/DESIGN_SYSTEM.md` |

**Cycle Forge** = multi-tenant reseller-ops SaaS (sellable product; USAV = dogfood tenant only). Right edge is **ops instrumentation**, not marketing chrome.

**Region vocabulary:** Station (scan, ephemeral) · Workbench (pointer, durable URL selection) · Monitor · Canvas.

**Operator nouns (do not conflate):**

| Noun | Region | Opens | Operator copy |
|---|---|---|---|
| **Displays** (plural) | Station scan | `StationDisplaysPushStack` | **Open displays** / Hide right panel (`←|` / `→|`) |
| **Inspector** | Desk / History table | `RightRailHost` peek | Band 3 **Show / Hide inspector**; chrome park `→|` |
| **Intake / create** | Workbench overlay on same host | `SidebarIntakeFormShell` occupants | Add / Import / New — **no** queue ↑↓ |

Chord split: Station Displays = **⌘/Ctrl+]**; desk inspector park = **⌘\** + bare **]**. Owner: `src/components/station/displays/displays-toggle-hotkey.ts`.

---

## 2. Ground-truth inventory (verified pointers — reconcile against tree)

Treat current tree as authority if this brief drifts. Open and confirm.

### 2.1 Two hosts (the hard split)

| Host | Path | Job |
|---|---|---|
| **Station Displays push** | `src/components/station/displays/StationDisplaysPushStack.tsx` · `StationDisplaysPushColumn.tsx` | Index→leaf Action plane beside scan middle; **not** a rail occupant |
| **App right slot** | `src/components/right-rail/RightRailHost.tsx` + `src/lib/right-rail/store.ts` | One crossfading occupant; priority `detail: 100` > `assistant: 10` |

Frame math: `src/lib/right-rail/frame.ts` (`resolveRightRailFrame`, `MIN_WORK_SURFACE_PX`, `STATION_PUSH_CENTER_FLOOR_PX` = 720). Station dual-rail: `src/lib/right-rail/station-dual-rail.ts`.

### 2.2 Three chrome families on `RightRailHost` (do not cross)

From `.claude/rules/display/right-rail-inspector.md` → **Two chrome families** (practically three including AI):

| Family | Chrome SoT | Use for | ↑↓ queue walk? |
|---|---|---|---|
| **Record / queue inspector** | `DeskRailChromeRow` (+ optional `DeskInspectorIndexShell`) | Selected row peeks: Orders · History · Incoming · Repair · Unfound · Bin · Support-context · My Day | **Yes when** a queue exists — pass `onPrev` / `onNext`; **omit** when not |
| **Intake / create** | `SidebarIntakeFormShell` | Empty-form create / import / prefs (`detail:new-order`, Import eBay/CSV, FBA create, grid column prefs) | **Never** |
| **Ambient assistant** | Assistant dock / occupant | Header Sparkles; yields to detail | N/A |

**Optional ↑↓ is already API-shaped** — `DeskRailChromeRow` only mounts chevrons when `onPrev` / `onNext` are passed:

- With walk: `ShippedDetailsPanel`, `IncomingDetailsHeader`, `HistoryCartonTriagePanel` (when not view-only).
- Without walk: `UnfoundQueueDetailsPanel`, `MyDayWatchRail` (`onClose` only).

Create golden: `src/components/orders/NewOrderEntryOverlay.tsx` → `detail:new-order` → `ShippedIntakeForm` / `SidebarIntakeFormShell`.

### 2.3 Selection → body cardinality (Orders golden)

`src/lib/right-rail/selection-occupancy.ts`:

| Selected | Occupant id | Body |
|---|---|---|
| 0 | none | Rail unmounts |
| 1 | `detail:order` | Inspect |
| 2 | `detail:order-compare` | Compare |
| 3+ | `detail:order-batch` | Batch attention |

Receiving / repair mirror: `receiving-selection-occupancy.ts`, `repair-selection-occupancy.ts`.

**Stable per MODE, never per record** — AnimatePresence keys on occupant id; row→row must not remount the host (D5 motion law). Exception debt: `detail:bin:${identity}` is still per-entity — audit whether industry + our motion law want that collapsed.

### 2.4 Occupant census (non-exhaustive — expand by grepping `DetailStackRailRegistrar` / `id="detail:`)

**Inspect / triage (DeskRailChromeRow family expected):**  
`detail:order` · `detail:orders-view` · `detail:order-peek` · `detail:order-compare` · `detail:order-batch` · `detail:history` · `detail:incoming` · `detail:unfound` · `detail:repair` · `detail:repair-batch` · `detail:receiving-line-batch` · `detail:my-day` · `detail:catalog-link` · `detail:import-exception` · `detail:fba-plan` · `detail:zoho-po` · `detail:bin:*` · Support-context · Inventory inspector · SKU panel

**Intake / create / prefs (`SidebarIntakeFormShell` or flush intake twins):**  
`detail:new-order` · `detail:incoming-import-ebay` · `detail:incoming-import-csv` · `detail:incoming-bulk-tracking` · `detail:grid-column-details` · FBA create form · sync progress (`detail:order-sync`, `detail:incoming-sync`)

**Station-edge / float-frozen (`push={false}` allowlist in `right-rail-push.guard.test.ts`):**  
`detail:receiving` (`ReceivingDetailsStack`) · Testing sidebar · Support ticket nest · `detail:receiving-audit` · `detail:photo-note` · `detail:move-photos` · assistant

**Never on RightRailHost:** Station Displays leaves (Ticket · Photos · Pairing · Inventory · …).

### 2.5 Anatomy contracts (audit against these)

**Desk queue inspector (Orders / Incoming family):**

```text
[→|] ……… [ N / M ] [↑][↓] [trailing?]     ← DeskRailChromeRow
index → leaf (DeskInspectorIndexShell)   ← topics, not PaneHeaderTabs
optional InspectorActionFloor            ← Macro CTAs + flush Delete
```

**Station Displays:**

```text
Top band · index or leaf body · footer stages
(index-filter | leaf-dismiss | leaf-command)
Carton ↑↓ lives on station pane host — NOT inspector prev/next
```

**Intake:**

```text
SidebarIntakeFormShell (title + subtitle + close)
form body + footer CTA
NO DeskRailChromeRow ↑↓, NO DeskInspectorIndexShell as primary create nav
```

### 2.6 Guards already pinning the contract

| Guard | Path |
|---|---|
| Header / intake allowlist | `src/components/right-rail/right-rail-inspector-header.guard.test.ts` |
| Push / float-only allowlist | `src/components/right-rail/right-rail-push.guard.test.ts` |
| Collapse / park | `src/components/right-rail/detail-stack-collapse.guard.test.ts` |
| Desk index shell | `src/components/right-rail/desk-inspector-index.guard.test.ts` |
| Action floor | `src/components/right-rail/inspector-action-floor.guard.test.ts` |
| History / Orders topics | `history-carton-triage.guard.test.ts` · `order-inspector-topics.guard.test.ts` |
| Displays ≠ host | `station-action-dossier.guard.test.ts` · `unbox-displays-drilldown.guard.test.ts` · `station-displays-reachability.guard.test.ts` |
| Displays toggle chord | `station-displays-toggle-hotkey.guard.test.ts` |

Note: `INTAKE_SHELL_WITH_REGISTRAR_ALLOWLIST` in the header guard is currently **empty** (shrink-only migration). Confirm whether intake registrars still import `SidebarIntakeFormShell` via child forms (e.g. `ShippedIntakeForm`) without the registrar file itself importing the shell — that split matters for the audit.

### 2.7 Known tensions to force in the audit (not settled by this brief)

1. **Intake chrome altitude:** `SidebarIntakeFormShell` still uses left-circle **X** close + wrapping uppercase `<h2 title>` — record peeks use `→|` (`ArrowRightToLine`). Is industry “create drawer” allowed to keep X, or should Kinetic Ledger unify dismiss glyphs while keeping separate title density?
2. **Station `push={false}` residual occupants** on benches that already have Displays — are they defended dual-edge debt or industry-wrong?
3. **View controls rails** (`detail:orders-view`) vs record peeks — does industry separate “sheet layout chrome” from “record inspector” the way we do?
4. **Per-entity bin ids** vs stable mode ids — motion remount cost vs deep-link clarity.
5. **CompactOrderPeek** (`detail:order-peek`) vs full `detail:order` — when does industry use a reduced peek vs full inspector?
6. **Action floor presence** — History identity-primary CTA vs Orders `OrderUpdateDock` vs no floor on empty select-a-row — is that one principle or three?

---

## 3. What “meeting industry standard” means for *this* gate

A principle is **met** when **all** of the following are true on the relevant golden:

1. **Industry:** You can cite a 2024–2026 primary source that names the principle (or a clear split with a defended pick).
2. **SoT:** The behavior is owned by a named module / recipe / guard — not re-decided in a one-off panel.
3. **Observable:** An operator or automated test can fail the surface if it regresses.
4. **Portable:** The same decision rule applies to the next entity’s right-edge occupant without inventing a fourth chrome family.

`PARTIAL` = principle exists in industry and partly in code, but ownership is split or untested.  
`N/A (defended deviation)` = industry admin pattern Kinetic Ledger / Station law correctly rejects (document why).

**Goldens for scoring:**

| Golden | Must PASS classes (minimum) |
|---|---|
| Station Displays (Unbox) | A, B, D, E, F, H |
| Desk `detail:order` | A–H |
| Intake `detail:new-order` | A, B, C, D, E, F, H (↑↓ must be N/A or PASS-as-absent) |

---

## 4. Forced audit questions (answer each)

### D1 — Panel taxonomy
What panel kinds do Carbon / Polaris / Fluent / Material 3 publish in 2026 (Sheet, SidePanel, Tearsheet, Dialog, Drawer…)? Map Cycle Forge’s **Displays · Inspector · Intake · Assistant** onto that taxonomy. Where do we invent a needed kind? Where do we misuse one?

### D2 — Push vs overlay vs modal
What is the 2026 dominant pattern for “inspect a queue row while keeping the list live”? Does our **non-modal in-flow push** (`modal={false}`, push default true) match a named system, or are we ahead/behind industry? When is modal+scrim still correct for ops SaaS?

### D3 — One right slot vs dual
Industry stance on assistant + record detail simultaneous visibility. Defend or attack our **single slot + priority** (`RIGHT_RAIL_PRIORITY`).

### D4 — Create vs inspect chrome split
Do mature systems use **different header shells** for “New …” vs “Open row …”? Cite. Does `SidebarIntakeFormShell` vs `DeskRailChromeRow` match that split, or should create migrate to PaneHeader with a create-mode recipe?

### D5 — Queue prev/next
Industry patterns for ↑↓ / J-K / “N of M” on inspectors (Linear, Gmail, Zendesk, ShipStation-class). Rules for when **not** to show next/prev (create, prefs, compare, batch, single orphan). Does optional `onPrev`/`onNext` on `DeskRailChromeRow` meet the bar? Any occupants that show ↑↓ incorrectly or omit it incorrectly?

### D6 — Index→leaf vs tabs
2026 guidance for dense inspectors: vertical topic index, underline tabs, segmented control, scroll-spy. Does `DeskInspectorIndexShell` / Station Displays Root Index match? Where do leftover `PaneHeaderTabs` / `SectionTabsSlider density="icon"` violate?

### D7 — Close / park / collapse semantics
Industry meaning of X vs chevron vs “dock”. Our `→|` park glyph + Band 3 Show/Hide + Displays footer dismiss — is that one coherent model or three? Accessibility of park vs destroy?

### D8 — Resize & width budgets
Window splitter patterns (APG) vs our inset 4px hairline (`HorizontalEdgeResizeHandle` placement=`inset`). Center-floor yield ladder vs industry “panel steals space until min content.” Gaps?

### D9 — Body density / nested cards
Reconcile industry “comfortable admin padding” with Kinetic Ledger flush sheet-band. Cite when nested cards are still correct. Audit residual nested-box debt on intake + Displays claim compose (pointer: right-panel-sheet-band brief).

### D10 — Forms in rails
Create/edit form patterns in side panels: sticky footer CTA, validation placement, dirty-state dismiss, Esc behavior. Compare `SidebarIntakeFormShell` + `InspectorActionFloor` + Displays `FlushTerminalFooter`.

### D11 — Keyboard complete path
Can an operator open Displays, drill index→leaf, Esc pop, park inspector, walk ↑↓ rows, and open New Order — without a mouse — on Unbox + Orders desk? Where does APG Dialog guidance conflict with wedge-safe nav-keys law (`src/lib/keyboard/nav-keys/`)?

### D12 — Focus & a11y roles
`role="dialog"` default vs `role="region"` for `modal={false}`. Focus trap absence as honest non-modal. Screen reader announcements on row change with stable occupant id. Failures?

### D13 — Motion
Push opacity-only tween (`motionRole.push.rail`) vs overlay x-slide. Reduced motion. Crossfade on mode change vs in-place node update on row change. Any illegal motion imports on rail surfaces?

### D14 — Occupant id stability
Industry + performance: remount on every record vs stable mode id. Audit `detail:bin:*` and any other per-entity ids. Recommend SoT rule.

### D15 — Governance (meta)
What do mature 2026 design systems require before **promoting a golden panel recipe to N surfaces**? Map onto our guards + chrome-family checklist in `right-rail-inspector.md`. Missing visual/regression artifact (Chromatic / story / E2E fixture)? Is the empty intake allowlist a governance win or a blind spot?

### D16 — Decision rule for the next occupant
Deliver a **one-page decision tree** an engineer uses when adding a right-edge surface:

```text
Station Action tool? → Displays host
Desk queue row peek? → RightRailHost + DeskRailChromeRow (± ↑↓)
Empty create/import/prefs? → RightRailHost + SidebarIntakeFormShell (no ↑↓)
Ambient AI? → assistant priority
Dedicated read dossier? → route (carton-read), not rail
```

Validate/fix that tree against industry + our SoT. Call out every current occupant that lands on the wrong branch.

---

## 5. Scoring model (mandatory for upgrade candidates)

Every proposed upgrade (not every principle) scores 1–5 on:

| Axis | Meaning |
|---|---|
| **Floor throughput** | Faster decide/act on scan or desk queue? |
| **Scannability** | Tired operator, 1080p, still legible in the narrow column? |
| **SoT fit** | Grows RightRailHost / DeskRailChromeRow / Displays stack / tokens vs page fork? |
| **Blast radius** | 5 = single chrome SoT tweak; 1 = multi-host rewrite |
| **Sellable SaaS** | Tenant-safe, a11y-defensible, not dogfood folklore? |
| **Fan-out safety** | Makes the next occupant safer (5) or riskier (1)? |

**Priority ≈ (Floor × Scannability × SoT fit × Sellable × Fan-out safety) / (6 − Blast).**  
Rank upgrades. Cut anything that invents a fourth chrome family without killing an existing one.

---

## 6. Required output shape

Return **one markdown report** with these sections in order:

1. **Executive verdict** — Are right-edge families GO or NO-GO for adding new occupants? One paragraph + top 5 blockers / gaps.
2. **Principles catalog** — Table: `ID` · `Principle` · `Industry sources (links)` · `Cycle Forge SoT owner` · `Displays verdict` · `Inspector verdict` · `Intake verdict` · `Notes`.
3. **Evidence pack** — For every `FAIL` / `PARTIAL`, quote code and describe the minimal SoT fix (file-level, not a redesign essay).
4. **Occupant misplacement list** — Current `detail:*` (and Displays leaves) that sit on the wrong host/chrome branch per D16.
5. **Upgrade backlog** — Ordered by §5 score; each item: change · test · done-when.
6. **Acceptance checklist** — Copy-pasteable gate before registering a new right-edge occupant:
   - Decision tree outcome (Displays / Inspector±↑↓ / Intake / Route / Assistant).
   - Automated: which `*.guard.test.ts` must stay green (name after verify).
   - Manual floor: 8–12 operator steps on Unbox Displays + Orders desk inspector + New Order intake.
7. **Defended deviations** — Industry patterns we correctly refuse (list + why).
8. **What NOT to clone** — Explicit “do not copy this debt” list so fan-out does not clone fails (e.g. per-entity ids, X-close intake if you recommend unifying, float-only station residuals).

---

## 7. Success criteria for *your* research

- Principles are **exact and testable**, not slogans (“be consistent,” “delight users”).
- Every FAIL has a **SoT-shaped** fix path (grow `DeskRailChromeRow` / `RightRailHost` / Displays stack / tokens / guards — never “fix Incoming specially”).
- The **create-without-↑↓** split is either ratified as industry-correct or given a concrete migration (with glyph + title rules).
- No recommendation that mounts Displays on `RightRailHost`, restores default modal scrims for desk peeks, or adds a second permanent right column beside AI + detail.
- Explicit GO/NO-GO for **registering a new intake overlay** and for **registering a new desk inspector** under the current chrome families.

---

## 8. Paste targets after you answer

Implementers will turn your report into:

- Gaps → issues / handoff under `docs/todo/` (right-rail / Displays scoped).
- New laws → one line in `AGENTS.md` + detail in `source-of-truth.md` / `display/right-rail-inspector.md` **only** when a principle is ratified and enforceable.
- New guards beside existing `src/components/right-rail/*.guard.test.ts` / `src/components/station/displays/*.guard.test.ts`.

Do **not** write those law edits in your research response unless a principle is already true in code and merely undocumented — then propose the exact one-liner.

---

## 9. Seed context from recent operator ask (do not treat as research conclusion)

Product framing that triggered this brief (for orientation only — your audit may refine):

> Scan-station right edge already has dismiss (`→|`) + push + ↑↓ navigation. **Adding a new order** should share the push/dismiss metric but **must not** carry up-and-down queue navigation (and related queue-only chrome). The codebase already encodes that as **chrome family split** (`DeskRailChromeRow` optional prev/next vs `SidebarIntakeFormShell`), not as a second host.

Your job is to say whether that split is **industry-complete**, what **additional splits** (if any) are still missing vs 2026 DS practice, and which **gaps** must close before the next occupant ships.

---

*End of briefing.*
