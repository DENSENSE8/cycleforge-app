# Research briefing — transform `/kiosk` into a **landscape-native iPad app shell** (always-on attract, left product nav, bottom transaction dock, industry-standard repair intake)

**For:** Gemini Pro (deep research) — **you have read access to this repository.** Every path below is a pointer, not an excerpt. Open the real files.
**From:** Cycle Forge engineering
**Date:** 2026-07-30
**Scope:** a **complete UX/IA redesign** of the customer-facing front-desk tablet at `/kiosk` so it reads and behaves like a **2026 landscape iPad app** — not a centered responsive web form. Covers: (1) always-on / waiting / attract display with **org-uploadable media**, (2) **left-rail product / category navigation**, (3) **bottom transaction-type dock** (Repair · Sales · Pickup · …), (4) **split-pane repair intake** (nav left, detail right), (5) elevating the whole surface to industry-standard 2026 tablet design.

**Prior research (do not redo):** [`kiosk-sales-intake-GEMINI-RESEARCH-BRIEFING.md`](./kiosk-sales-intake-GEMINI-RESEARCH-BRIEFING.md) → answered in [`kiosk-counter-transaction-PLAN.md`](./kiosk-counter-transaction-PLAN.md). That work landed the **transaction composition / catalog projection / device-auth intake** half. **This briefing is the shell + UX half.** Do not reopen D1–D7 from that plan unless a UI recommendation forces a schema change — and if it does, say so explicitly.

**Out of scope:** back-of-house receiving/unbox, staff `/pickup` Workbench chrome (except as a **pairing** target), native Swift/SwiftUI rewrite (ask: PWA-under-MDM vs Capacitor — §9.5), payment credential collection on-device (forbidden), inventing a second Station archetype for a non-scanner counter.

---

## Deliverable — five separate answers

1. **Industry answer — landscape counter tablet IA (2024–2026).** What is the standard layout for a **landscape iPad (or Android tablet) front-desk / POS / repair intake** app? Cover named systems with primary sources:
   - Retail POS: Square for Retail / Square Appointments tablet, Shopify POS, Toast, Clover, Lightspeed Retail, Revel, Loyverse.
   - Repair / service: RepairShopr/Syncro, RepairDesk, mHelpDesk, Jobber field tablet, ServiceTitan, Asurion / uBreakiFix counter flows, Apple GSX / Genius Bar–style intake (publicly documentable pieces only).
   - Attract / idle / digital signage: BrightSign, ScreenCloud, Rise Vision, Square idle/receipt screens, Toast idle, museum/retail kiosk attract loops — what media types, timeouts, accessibility, and brand-upload models are standard?
   - Cite **Apple HIG** (iPadOS multitasking, split view, tab bars, sidebars, always-on display guidance where relevant) and **Material 3 adaptive / large-screen** patterns for landscape tablets.
2. **Target IA for this repo.** Propose the **exact landscape shell** for Cycle Forge `/kiosk`: zones, breakpoints, what lives in the left rail vs main canvas vs bottom dock vs floating chrome, how attract → active transaction transitions, and how orientation (portrait vs landscape) is handled when MDM still allows both.
3. **Always-on / attract media model.** Org-uploadable waiting display: storage, settings UX, tenancy, formats, fallback defaults, idle timeout, tap-to-wake, accessibility (reduced motion, captions), and how it composes with existing `organizations.settings.brand` + letterhead without forking branding.
4. **Repair intake redesign.** Transform today’s 4-step centered wizard into an **industry-standard landscape intake**: left product/category nav + right detail pane (issue, customer, serial, price, agreement). Map every current field and every `kioskMode` suppression onto the new layout. Say what dies, what grows, what is reused (`ProductSelector`, `RepairIntakeStepper`, `SignaturePad`, `submitRepairIntake`).
5. **Phased path + measurement.** A build sequence that does not break live Repair + Buy/Sell on enrolled tablets, with E2E hooks (`tests/e2e/kiosk-intake-flow.spec.ts` already covers iPad-landscape), design-system compliance, and a critique → improve-ui gate.

---

## 0. Method — read this before answering

### 0.1 Verify in the repo before you assert. Not optional.

- **Every file path you name must be one you opened.** If you are inferring a path from a naming convention, mark it `[UNVERIFIED]`.
- **Every claim about what a module does must come from reading it.** The welcome floor comment in `src/app/kiosk/page.tsx` still says Sales/Pickup are WIP in one older doc — **code is live for Sales**; verify against the current `SERVICES` array.
- **Quote your evidence** for load-bearing claims: line numbers, prop names, schema columns.
- **Do not attribute a rationale to this brief that is not written in it.** If you supply your own reasoning, say "my reasoning:".
- Statements marked **[verify]** must be confirmed against live code / migrations before building on them.

### 0.2 Search the web for the industry half. Also not optional.

- Prefer **2024–2026** primary docs, design systems, and product screenshots / release notes.
- Where practice splits (e.g. bottom tab bar vs left sidebar for primary modes; attract video vs still carousel; web-in-Guided-Access vs native wrapper), present **both**, the conditions each wins under, then pick one for this repo and defend it.
- Distinguish "what a multi-location QSR tablet does" from "what a small reseller/repair-shop SaaS counter tablet should do." This repo is the latter — multi-tenant, sellable, USAV is dogfood only.

### 0.3 Read these house rules first — they constrain every recommendation

| Rule | Why it binds this work |
|---|---|
| `AGENTS.md` → Product + Hard laws | Vendor names are connectors, never customer-facing copy; Kinetic Ledger tokens only |
| `.claude/rules/contextual-display.md` + `display/station.md` | Kiosk is **not** a Station — no scanner, no `StationWorkbench`. See §7.1 |
| `.claude/rules/display/auth-step-panel.md` | Compact multi-step form motion — still relevant for step transitions **inside** a pane; may need a **new** landscape-shell display contract if you recommend one |
| `.claude/rules/kinetic-ledger.md` + `ui-design-system.md` | Density, chips, type roles, focus, spacing — no page-local hex / raw `z-[N]` |
| `.claude/rules/pattern-evolution.md` | Compose SoT first; grow it; never fork a second picker / cart / branding pipeline |
| `.claude/rules/source-of-truth.md` | Dates, tokens, shells, search, grids — cite and extend, do not twin |
| `.claude/rules/backend-patterns.md` | Tenant GUC, `Deps`, audit, idempotency for any new media / session APIs |
| `.claude/rules/verify.md` | `npm run verify`; DS ratchets only shrink |
| `docs/security/kiosk-device-lockdown.md` | MDM / Guided Access — the app cannot force single-app mode |

---

## 1. Product context

**Cycle Forge** is multi-tenant reseller-operations SaaS. The dogfood tenant (USAV) is a used-audio reseller that also runs a brand repair service at a physical front desk. An enrolled **iPad** sits on the counter; a team member fills intake **with** the customer (attended blend — not pure self-service).

Two hard laws:

- **Vendor integrations are tenant connectors behind capability facades.** Customer UI never says "Square" / "Ecwid" / "Zendesk" unless the Integrations hub or a deep link.
- **Tenant-from-birth.** Any new media / attract / session table carries `organization_id UUID NOT NULL`, org-led indexes, and `enforce_tenant_isolation()` in its birth migration.

---

## 2. The experience this brief is about

### 2.1 The aspiration (owner brief, restated precisely)

Completely transform the kiosk into a **native landscape iPad app display** that:

1. Has a **waiting / always-on display** — full-bleed branded idle — with media **uploadable per organization** (not a hard-coded Cycle Forge default only).
2. Has a **proper left-side select-products navigation bar** (category / catalog drill, favorites, search) while the **right side** shows rich detail for the selected product / step / customer context.
3. Has **bottom buttons** for the exact type of transaction: Repair, Sales (Buy/Sell), Pickup, and future Service/Warranty — a persistent transaction dock, not a one-shot welcome-tile floor that disappears when a form opens.
4. **Completely transforms the repair intake form** into an industry-standard landscape composition: navigation on the left, more details on the right — like a regular landscape iPad app — with UX/UI elevated to **2026 design principles** (clarity, thumb reach, motion with purpose, accessibility, brand presence without clutter).

### 2.2 What "native iPad app display" means here (decide explicitly)

The device today is a **chromeless Next.js page** under MDM Guided Access / single-app lock (`docs/security/kiosk-device-lockdown.md`). "Native" in this brief means **native-feeling landscape IA + chrome**, not necessarily an App Store binary — unless your research concludes a Capacitor/WKWebView shell is required for always-on, offline attract, or haptics. **Answer §9.5.**

### 2.3 What already shipped (do not regress)

As of 2026-07-30, verify against code:

| Capability | Status | Primary files |
|---|---|---|
| Device principal auth | Live | `withKioskAuth.ts`, `kiosk-device.ts`, `kiosk-host.ts`, migration `2026-07-17_kiosk_devices.sql` |
| Welcome tile floor | Live | `src/app/kiosk/page.tsx` — square stage sized to shorter viewport edge |
| Repair intake (kioskMode) | Live | `RepairIntakeForm.tsx` → `/api/kiosk/repair/submit` → `submitRepairIntake` |
| Buy/Sell counter transaction | Live | `CounterIntakeForm.tsx` → `/api/kiosk/intake` → `submitCounterTransaction` |
| Pickup tile | WIP in `SERVICES` | same page — status flip when ready |
| Catalog projection (local prices) | Landed / landing | `docs/todo/kiosk-counter-transaction/02-catalog-projection.md` + `catalog-projection.ts` — **[verify]** apply state |
| Org brand stub | Settings only | `organizations.settings.brand` (`name`, `logoUrl`, `primaryColor`) in `settings.ts` — **not rendered on `/kiosk`** |
| Letterhead | Print | `letterhead.ts` — repair paperwork / receipts, not attract |
| Attract / idle / dual-display | **Not built** | Wave F in `highest-roi-ops-ui-execution-plan.md`; master-plan F1 / PR-12 |

---

## 3. Honest inventory of the current UX (verify, then redesign)

### 3.1 Welcome floor — centered square stage, not landscape chrome

Read `src/app/kiosk/page.tsx` end-to-end. Today:

- Modes: `ready` | `pair` | full-screen service form overlay.
- `SERVICES` SoT tiles: Repair (live), Buy/Sell (live), Pickup (wip).
- Layout comment (load-bearing): *"square stage sized to the shorter viewport edge — iPad portrait / landscape / near-square all get one composed floor surface, not a landscape card floating in empty canvas."*
- Opening a service **replaces the whole surface** (`fixed inset-0`); `onClose` returns to welcome. There is **no persistent bottom dock**, **no left product rail**, **no org logo**, **no idle timeout → attract**.

**Gap vs aspiration:** the floor is a **chooser**, not an **app shell**. The transaction type disappears when work starts. Product navigation lives **inside** the form step, not as a permanent left chrome.

### 3.2 Repair intake — 4-step centered wizard

Read:

- `src/components/repair/RepairIntakeForm.tsx`
- `src/components/repair/RepairIntakeStepper.tsx`
- `src/components/repair/repair-intake-logic.ts`
- `src/components/repair/ProductSelector.tsx`
- `src/components/repair/CustomerInfoForm.tsx`
- `src/components/repair/SignaturePad.tsx`

Current steps (`REPAIR_STEP_COPY`): **product → issue → contact → review+sign**.

`kioskMode` suppressions (must preserve intent even if chrome changes):

- No technician assignment
- No existing-customer PII search
- No Zendesk deep link / print
- Catalog via `/api/kiosk/repair/*`; `hideManualEntry` + `flowInPage`
- Favorites read-only from `/api/kiosk/repair/favorites`
- Wider column `max-w-[960px]` vs staff `720px` — still a **single centered column**, not a split pane

Required fields today: product, issue-or-notes, name, phone, serial, price, signature. Email optional. Default price still **`'130'`** in `buildInitialFormData` — **[verify]** whether catalog projection removed the need for this default.

### 3.3 Counter / sales form — sibling wizard, same full-bleed swap

Read `src/components/counter/CounterIntakeForm.tsx` + `counter-intake-steps.ts`. Steps: **identity → cart → review → payment (stage)**. Signature only if a service line is present. PIN step-up for `takePayment`. Same structural problem: it is a **modal takeover**, not a shell region.

### 3.4 Product selection — capable picker, wrong altitude

`ProductSelector` already supports category tree, breadcrumbs, search, pagination, multi-select, and tablet density (`flowInPage`). It is parameterized by `apiBasePath`. **It is not a left-rail navigation chrome** — it is step content. The redesign should almost certainly **grow** this SoT into a rail-capable composition (or extract a `CatalogNavRail` that `ProductSelector` and the counter cart both consume) — not invent a third picker.

### 3.5 Branding & media — stubs without a kiosk renderer

| Concern | Where | Kiosk today |
|---|---|---|
| Platform brand | `src/lib/branding/constants.ts` | Product name only |
| Org brand | `settings.brand` (`logoUrl`, `primaryColor`, `name`) | Editable in Settings; **no `/kiosk` consumer** — branding spec says unwired |
| Letterhead | `letterhead.ts` | Print surfaces |
| Photos / NAS | `/ops/photos`, photo servers | Evidence, not attract assets |
| Plan flag | `customBranding` in `billing/plans.ts` | Capability gate only |
| Attract media upload | — | **Does not exist** |

Wave F proposal (aspirational): org-scoped object storage keyed by `organization_id`; settings upload; idle → Sales | Repair | Service. Route proposal in that doc (`/walk-in/kiosk`) is **stale relative to live `/kiosk`** — redesign against `/kiosk`, do not invent a parallel host without justification.

### 3.6 Staff sibling — do not confuse audiences

- `/pickup` + `WalkInStationSidebar` / `WalkInStationPane` = **staff** counter Workbench.
- `/repair` + `RepairSidebarPanel` = **staff** repair mode.
- Dual-display pairing (kiosk session mirrored on staff bench) is Wave F / PR-12 — **not built**. Mention it as an optional Phase N dependency, not as a prerequisite for the landscape shell unless research says otherwise.

---

## 4. Structural findings — verify each, then build on them

### 4.1 The display region contract does not yet name a "landscape kiosk shell"

`.claude/rules/contextual-display.md` Q1: scanner ⇒ Station. Owner refinement: *"The counter is a form, not a scanner station."* So today the kiosk inherits **auth-step / welcome-stage grammar**, not Station.

A left-rail + bottom-dock + right-detail **app shell** is a **new composition altitude**. Your recommendation must say:

- Does this get a **new** `.claude/rules/display/kiosk-shell.md` (or similar) contract?
- Or does it grow `auth-step-panel.md` beyond recognition (likely wrong)?
- What is explicitly **forbidden** so agents do not "Station-ize" the counter (scan bar, focus-lock, `StationWorkbench`, ambient wash copy)?

### 4.2 Square-stage welcome fights landscape-first IA

The current stage deliberately equalizes portrait and landscape. A landscape-native app usually:

- Treats **landscape as primary** (iPad in landscape dock / stand).
- Degrades gracefully to portrait (stacked rail above detail, or collapsed nav).

**Question:** Keep dual-orientation parity, or declare landscape primary with a documented portrait fallback? What do Square / Shopify POS / RepairDesk do on iPad rotation?

### 4.3 Full-screen form swap destroys persistent transaction chrome

When `activeService` is set, the welcome (and any future dock) unmounts. Industry tablet POS keeps **mode / job type** visible (bottom tabs or segmented control) while the main canvas changes. RepairShopr / Square Retail keep department or mode chrome reachable mid-flow.

**Question:** Should switching Repair ↔ Sales mid-draft confirm-discard, or support a staged draft per mode? What does the industry do for attended blend?

### 4.4 Attract / idle is entirely missing

No timeout, no media loop, no tap-to-wake, no org asset pipeline. Highest-ROI plan Wave F and master-plan PR-12 describe it; code does not.

**Questions for the industry answer:**

- Typical idle timeout at a attended counter (30s? 2m? never while staff PIN session warm?)?
- Video vs image carousel vs Lottie vs CSS motion — battery, Guided Access, Safari quirks on iPadOS?
- Should attract be **customer-facing marketing** only, or also show **queue / "we'll be with you shortly"** ops state?
- Accessibility: `prefers-reduced-motion`, captions, contrast against brand video?

### 4.5 Org media upload has no SoT

Settings logo is a **URL string**, not an upload. Photo evidence pipeline is a different concern (chain of custody, NAS). Attract media needs:

- Upload API (multipart or direct-to-blob) with org tenancy
- Allowed MIME / max size / aspect guidance (landscape 16:10 / 4:3)
- CDN / Blob URLs readable by the **device principal** (kiosk token can fetch org attract config — no staff session)
- Plan gating via `customBranding` or a new capability — **decide**

Match house patterns: Vercel Blob already used for repair signatures (`submitRepairIntake`); photos use org-scoped storage. Pick one and extend — do not invent a third blob convention without saying why.

### 4.6 Cart SoT may still be incomplete on the kiosk path

`counter-transaction-types.ts` comments say the kiosk should compose `salesCartStore`. **[verify]** whether `CounterIntakeForm` actually imports it or still maps `ProductSelector` selections into local `draft.retailLines`. The landscape cart rail must bind to **one** cart SoT — recommend which, and delete the twin.

### 4.7 Hardcoded repair price default is a UX and audit smell

`buildInitialFormData` seeds `price: '130'`. Industry repair POS shows catalog price from the selected service SKU, with staff override audited. Catalog projection work was meant to fix price authority — **verify** and require the new UI to show **source of price** (catalog vs override).

---

## 5. Target experience sketch (hypothesis — challenge or adopt)

This is a **starting hypothesis** for you to stress-test against industry 2026 practice, not a locked decision.

```
┌──────────────────────────────────────────────────────────────────────────┐
│ ATTRACT (idle) — full-bleed org media · logo · soft CTA "Tap to start"   │
└──────────────────────────────────────────────────────────────────────────┘
                                    │ tap / start
                                    ▼
┌────────────┬───────────────────────────────────────────────┬─────────────┐
│ LEFT RAIL  │ MAIN / DETAIL                                 │ (optional)  │
│ Catalog /  │ Selected product detail · issue · customer ·  │ context     │
│ favorites  │ serial · price · agreement / signature        │ strip       │
│ search     │                                               │             │
│ categories │                                               │             │
├────────────┴───────────────────────────────────────────────┴─────────────┤
│ BOTTOM DOCK —  [ Repair ]  [ Buy / Sell ]  [ Pickup ]  · status / close  │
└──────────────────────────────────────────────────────────────────────────┘
```

**Challenge this sketch.** Alternatives you must evaluate:

| Pattern | Used by | Pros | Cons for this repo |
|---|---|---|---|
| Bottom tab bar for modes + left sidebar for catalog | Many iPadOS apps (HIG sidebar + tab bar) | Matches owner brief | Two chrome bands consume vertical space on 10.9" |
| Left mode rail + top catalog breadcrumbs | Some POS | Strong mode persistence | Worse thumb reach for mode switch |
| Floating mode FAB / segmented control over canvas | Minimal chrome | More canvas | Weaker "app" presence |
| Attract as separate route vs in-shell state | Signage vs POS | Clear lifecycle | Pairing / draft continuity |

Also decide:

- Does the **left rail change meaning** by mode? (Repair = `-RS` services; Sales = retail catalog; Pickup = order lookup.)
- Is the left rail **always catalog**, or does it become **step list** (Product / Issue / Contact / Sign) on smaller widths?
- Where does **signature** live — right pane sheet, full-bleed takeover, or Apple Pencil–optimized overlay?

---

## 6. Industry research prompts (must answer with citations)

### 6.1 Landscape tablet POS / repair IA

For each of Square Retail tablet, Shopify POS iPad, Toast, RepairDesk, Syncro/RepairShopr (2024–2026):

1. Where is **transaction type / ticket type** selected?
2. Where is **catalog / category navigation**?
3. Where is **line detail / customer / notes**?
4. How do they handle **attended** vs **customer-facing** screens (dual display)?
5. What is the **empty / waiting** state?

### 6.2 Attract / always-on

1. Media formats and max duration.
2. Org self-serve upload vs agency-managed CMS.
3. Interaction model: tap anywhere, big CTA, QR, none until staff unlocks.
4. Burn-in / always-on display considerations for iPad (including newer always-on hardware if relevant to MDM kiosk mode).
5. Privacy: does attract ever show customer PII or queue names? (Default should be no.)

### 6.3 Repair intake field order (industry standard)

Map a recommended field order and grouping for:

- Device / service selection
- Symptoms / reasons / photos
- Serial / condition / accessories
- Customer identity (attended: staff-assisted entry without PII fishing)
- Estimate / price / authorization
- Signature / terms

Compare to Cycle Forge’s current product → issue → contact → review. Say what to reorder and why.

### 6.4 2026 design principles that apply (and which are hype)

From Apple HIG, Material 3 large screens, and leading POS:

- Spatial / liquid glass / translucency — **use or reject** for a warehouse counter under bright lights?
- Large touch targets, thumb zones, bottom-weighted actions
- Content-first typography; avoid dashboard clutter
- Motion: purposeful transitions between attract → shell → submit confirmation
- Reduced motion, Dynamic Type / text-role scaling
- High contrast for outdoor-adjacent retail lighting

Tie recommendations to Kinetic Ledger tokens already in-repo — do not propose a parallel design language.

---

## 7. Constraints — non-negotiable

### 7.1 Still a form, not a Station

No scan bar, no focus-lock loop, no `StationWorkbench`, no Unbox ambient wash copy. If you need a named display contract, write the contract; do not borrow Station by analogy.

### 7.2 Compose, don't fork

- One catalog navigation SoT — grow `ProductSelector` / extract a shared rail.
- One cart SoT — `salesCartStore` or justify replacing it once.
- One submit path per domain helper — `submitRepairIntake` / `submitCounterTransaction` stay principal-agnostic.
- One branding/media pipeline for attract + logo — extend `settings.brand` / letterhead / Blob; do not add `kioskTheme` as a disconnected twin.
- Capability copy via `capability-labels.ts`.

### 7.3 Device principal + attended blend

Base intake stays headless of staff identity. PIN step-up only for privileged actions (`walk_in.take_payment`). Attract and catalog reads must work with `cf_kiosk` only. Customer PII search stays off the device principal unless you design an explicit, audited step-up — default is keep it off.

### 7.4 No card data on the tablet

Staging + Terminal / hosted checkout only. Attract and shell redesign must not create a card-entry surface.

### 7.5 Tenancy & media safety

Org A’s attract video must never appear on Org B’s device. Device token → `organizationId` is the only scope key. Upload routes: staff permission (`walk_in.enroll_kiosk` or a new `org.manage_branding` — **recommend**); read routes: kiosk auth.

### 7.6 MDM reality

`docs/security/kiosk-device-lockdown.md`: Guided Access / MDM single-app mode is **OS-side**. Safari/PWA quirks (autoplay muted video, wake locks, fullscreen) constrain attract — research iPadOS 18–26 kiosk behaviors and state requirements clearly.

---

## 8. Codebase touch map (expected — refine after research)

You will likely propose changes in roughly these layers. Confirm or correct:

| Layer | Likely files / new modules |
|---|---|
| Shell | `src/app/kiosk/page.tsx` → extract `KioskShell`, `KioskAttract`, `KioskTransactionDock`, `KioskCatalogRail` |
| Repair UI | `RepairIntakeForm.tsx` landscape variant or `RepairIntakeLandscape.tsx` composing existing step logic |
| Counter UI | `CounterIntakeForm.tsx` same shell regions |
| Product nav | `ProductSelector.tsx` + possible `CatalogNavRail.tsx` |
| Branding / media | `settings.ts`, Organization settings section, new `/api/org/kiosk-media` (name TBD), Blob writer |
| Attract config API | device-authed `GET /api/kiosk/attract` (or under existing kiosk API tree) |
| Display contract | new `.claude/rules/display/kiosk-shell.md` + pointer from `contextual-display.md` |
| E2E | extend `tests/e2e/kiosk-intake-flow.spec.ts` for attract timeout, dock persistence, rail selection |
| Docs | update Wave F / PR-12 to point at this plan once answered |

**Do not** touch receiving, unbox, or MasterNav for this work.

---

## 9. Decisions this research must lock

Answer each with a recommendation, alternatives considered, and failure modes.

### 9.1 Shell chrome
Persistent **bottom transaction dock** + **left catalog rail** + **right detail** — adopt, invert, or replace? Portrait fallback?

### 9.2 Attract lifecycle
Timeout value, media types, tap target, whether confirmation (“All set”) returns to attract or welcome shell, reduced-motion fallback.

### 9.3 Org media model
Table vs settings JSON vs Blob-only; upload UX; plan gate; default Cycle Forge pack when org has no media.

### 9.4 Repair intake information architecture
Keep 4 logical steps but present as **master-detail**, or collapse into a single scrollable right pane with left catalog always mounted? Where does signature sit?

### 9.5 Web-under-MDM vs native wrapper
Stay on Next.js `/kiosk` in Guided Access, or add Capacitor/WKWebView for always-on / offline attract / haptics? Cost vs benefit for a multi-tenant SaaS.

### 9.6 Dual-display pairing
In-scope for v1 of this redesign, or Phase 2 after the single-tablet shell ships? (Wave F couples them — you may decouple.)

### 9.7 Shared shell across Repair and Sales
One `KioskShell` with swappable main panes, or separate full layouts per mode that only share the dock? Fork risk vs mode-specific density.

### 9.8 Display-region SoT
New `kiosk-shell.md` contract — yes/no. If yes, draft the Q1–Q4 picker answers and the Always / Never list.

---

## 10. Anti-goals

- Do not redesign device enrollment / pairing (it works — quiet footer is fine; may move into settings overflow).
- Do not merge staff `/pickup` Workbench into the customer tablet.
- Do not reopen counter-transaction join model (D1–D7) unless the UI is impossible without it.
- Do not introduce a second search engine, second audit API, or raw `UPDATE current_status`.
- Do not hardcode USAV creative into the default attract pack beyond a neutral Cycle Forge fallback.
- Do not raise DS ratchet baselines to ship glassmorphism or raw `<button>` forests.

---

## 11. Success criteria

The research answer is done when Cycle Forge engineering can implement without re-asking:

1. A **wireframe-level IA** (zones + states: attract, idle-shell, repair-active, sales-active, pair, confirmation) with explicit component ownership.
2. An **org media upload + serve** contract (schema or settings shape, APIs, permissions, tenancy tests).
3. A **repair intake layout migration plan** that reuses `repair-intake-logic.ts` / `submitRepairIntake` and lists deleted UI.
4. A **phased PR sequence** (attract+branding → shell chrome → repair landscape → sales landscape → pairing optional) with E2E checkpoints.
5. A **display-rule diff** — new or amended `.claude/rules/display/*` text ready to paste.
6. Cited **industry references** (named products + URLs/docs) for every major chrome choice.

---

## 12. Suggested research query pack (paste into Gemini as follow-ups if needed)

Use these only after reading the repo paths in §3–§4:

1. `iPadOS HIG sidebar tab bar landscape POS 2025 2026`
2. `Square for Retail iPad layout catalog navigation transaction types`
3. `Shopify POS iPad home screen grid vs sidebar 2024`
4. `RepairDesk Syncro RepairShopr tablet intake workflow signature`
5. `restaurant POS idle screen branded attract loop timeout best practices`
6. `digital signage CMS tenant upload video Safari iPad Guided Access autoplay`
7. `Material 3 adaptive navigation rail bottom bar large screens`
8. `Capacitor vs PWA kiosk single app mode iPad MDM 2026`
9. `repair shop intake form UX serial number estimate authorization signature order`
10. `dual screen customer facing display POS Square Toast pairing protocol`

---

## 13. Output format for your answer

Return a single markdown plan with these sections, in order:

1. **Executive recommendation** (≤15 lines)
2. **Industry findings** (cited)
3. **Target IA** (zones, states, ASCII or mermaid)
4. **Attract + org media design** (schema/API/settings)
5. **Repair intake redesign** (field map old→new, reuse list, delete list)
6. **Sales / shared shell notes** (how CounterIntakeForm fits)
7. **Decisions 9.1–9.8** locked
8. **Phased implementation** (PRs, risks, E2E)
9. **Display-rule draft**
10. **Open questions that still need a human** (max 5)

Mark every repo claim with a path you opened. Mark every industry claim with a source. Mark uncertainty as `[UNVERIFIED]` or `[LOW CONFIDENCE]`.
