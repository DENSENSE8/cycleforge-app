# Gemini research briefing — What's missing for Cycle Forge to feel best-in-class premium WMS SaaS

**For:** Gemini deep research
**From:** Cycle Forge engineering
**Date:** 2026-08-08
**Status:** research brief — produce a prioritized parity-gap analysis + roadmap; do NOT write code.
  §5 validated against the tree 2026-08-08 (Incoming resilience **shipped** — see §5.1).
  Adopted research + H1 build brief:
  [`wms-premium-parity-gap-RESEARCH.md`](./wms-premium-parity-gap-RESEARCH.md) ·
  [`wms-premium-parity-gap-H1-HANDOFF.md`](./wms-premium-parity-gap-H1-HANDOFF.md).
**Lane:** current checkout. Attach `:3050`. User owns commits.
**Product frame:** Cycle Forge is multi-tenant **reseller-ops SaaS** for small used-goods / electronics-refurb sellers (eBay · Amazon/FBA · Shopify · Square · Ecwid, on Zoho ERP). USAV is the dogfood tenant. This is **not** a generic enterprise 3PL/distribution WMS — keep that ICP in mind; do not recommend enterprise-3PL bloat that this buyer will never use.

---

## 0. Why this brief exists (the trigger)

An operator screenshot of `/incoming` showed **skeleton placeholder rows that never resolved** — for ~25s the desk looked broken over an empty rail. That is the emotional trigger, but it exposes the real question:

> **Cycle Forge has a strikingly mature architecture on paper (deep domain modules, a design-system constitution, a workflow engine, multi-tenant RLS) — yet in places it still *feels* unfinished. Where, exactly, and what does closing the gap to a Linear/Stripe/Ramp-tier premium SaaS actually require?**

This is a **perceived-quality + capability-depth gap analysis**, not a rewrite. The architecture is largely right; the finish is uneven. Your job is to find the uneven finish and the genuine capability holes, benchmark them, and rank them.

---

## 1. What to produce (deliverable spec)

A single research report with:

1. **A ranked parity-gap register.** Each gap: *what best-in-class does · what Cycle Forge does today (cite our inventory in §4) · the delta · why it matters to this ICP · effort band (S/M/L) · impact band.* Rank by **impact ÷ effort**, perceived-quality-first.
2. **A "trust & finish" section** — the sub-visible things that separate "polished" from "premium" (loading/error/empty resilience, honest liveness, consistency, latency budgets, undo, keyboard-first, bulk ops, notifications). This is where the trigger lives; lead with it.
3. **A capability-depth section** — WMS domain features that are ABSENT or thin (§4), each judged **table-stakes for THIS ICP vs generic-WMS-that-doesn't-apply.** Be ruthless about the difference.
4. **A 3-horizon roadmap** — H1 "stop feeling broken" (weeks), H2 "feels premium" (a quarter), H3 "category-leading for SMB resellers" — mapped to the register.
5. **Benchmarks table** — named comparators (§3) × dimension, with what each does well that we should steal.

Format: decision tables over essays (house norm). Cite our modules by path where you reference current state.

---

## 2. The bar: what "best-in-class premium SaaS" means here

Two reference sets, because the bar is the *intersection*:

- **Premium SaaS UX tier** — Linear, Stripe Dashboard, Ramp, Vercel, Notion, Height. Traits: instant perceived load (SSR/optimistic, skeleton-at-real-geometry that always resolves), honest empty/error/degraded states with recovery, command palette + keyboard-first, sub-pixel visual consistency, undo everywhere, ambient realtime that never lies, thoughtful first-run activation, zero "dead" screens.
- **Best-in-class WMS/ops depth** — ShipHero, Extensiv (3PL Central), Linnworks, Fishbowl, Zoho Inventory, NetSuite WMS, plus the enterprise ceiling (Manhattan, Blue Yonder, Körber) as a *capability yardstick only*. Traits: directed workflows, exception-first dashboards, wave/batch picking, cycle counting, replenishment, multi-carrier rate-shop, deep returns, labor visibility, reporting.

Cycle Forge should read like **"ShipHero's depth with Linear's finish, scoped to an SMB reseller."** Measure against that sentence.

---

## 3. Comparator set (benchmark these by dimension)

| Comparator | Why it's the yardstick |
|---|---|
| **ShipHero** | Closest peer: SMB/e-comm fulfillment WMS, mobile-first picking/packing, returns, multi-carrier. The realistic depth target. |
| **Extensiv (3PL Central) / Linnworks** | Multichannel order/inventory ops; saved views, bulk ops, rules engines. |
| **Zoho Inventory** | Our own ERP's sibling — the baseline the buyer already knows. |
| **Fishbowl / NetSuite WMS** | Cycle count, kitting/assembly, multi-location depth. |
| **Manhattan / Blue Yonder / Körber** | Enterprise ceiling — slotting, labor mgmt, wave optimization. Yardstick, not a target. |
| **Linear / Stripe / Ramp / Vercel** | The *finish* bar — loading/empty/error, keyboard, consistency, activation, honesty of realtime. |

For each Cycle Forge gap, name which comparator does it best and what specifically to emulate.

---

## 4. Grounded current state — the HAVE / PARTIAL / ABSENT map

**Read this before proposing anything.** Recommending we "add" a HAVE is a wasted recommendation. (Inventory produced by a code survey 2026-08-08; paths are evidence.)

### Production-depth (HAVE) — do NOT re-propose
Receiving/triage/unbox (`src/lib/receiving/**`) · serialized-unit inventory + provenance/condition history (`serial_units`, `src/lib/serial/*`) · **cycle counting** (full lifecycle, `src/lib/inventory/cycle-count.ts`, `cycle_count_campaigns`) · locations/bins (`locations`, `bin_contents`) · returns/RMA/warranty/repair loop (`src/lib/{rma,warranty,repair}/**`) · **replenishment** (7-state, `src/lib/replenishment.ts`) · kitting/BOM + prebox/master-carton manifests (`sku_kit_parts`, `label_manifests`) · packing + scan-verify (`src/lib/packing/**`) · **multi-carrier rate shopping + labels** (ShipStation v2 + FedEx/UPS/USPS, `src/lib/shipping/**`) · multichannel + Zoho integrations + Nango connector framework · multi-tenant RLS + granular permissions + audit (`src/lib/tenancy/**`, `permission-registry.ts`) · WebAuthn/PIN/SSO auth · kiosk + scan stations · **workflow engine + Operations Studio + tool-calling assistant + RAG/global search** (`src/lib/{workflow,studio,assistant,rag}/**`).

### Thin / scaffolded (PARTIAL) — depth gaps to assess
| Area | Today | Gap |
|---|---|---|
| Directed putaway | single default-bin rule (`putaway-placement.ts`) | no velocity/zone/multi-rule directed putaway |
| Picking | deadline-ordered queue + pick *sessions* (`src/lib/picking/*`) | **no wave / batch / zone grouping, no pick-path optimization** |
| Cartonization | pack-tier classifier (`pack-tier-classifier.ts`) | no carton/bin-pack optimization |
| Multi-warehouse | schema + resolver (`warehouses`, `src/lib/warehouses.ts`) | most flows assume single default warehouse |
| Labor | KPI/throughput + scheduling (`labor-throughput.ts`, `packer-kpi`) | no task interleaving / directed task mgmt |
| Reporting | 3 canned reports (bin-utilization, dead-stock, velocity) | no report builder / export / scheduled reports |
| ERP breadth | Zoho-only | no QuickBooks/NetSuite/etc. |
| Vision | config-gated LLM identify/classify | narrow |
| Handling units (LPN) | present but light (`/api/handling-units`) | thinner than serial/manifest layers |

### Not present (ABSENT) — judge table-stakes-for-ICP vs not-applicable
ASN / EDI · receiving appointments / dock scheduling · cross-dock · **lot & expiry / FEFO** · carrier **end-of-day manifest / SCAN form** · **slotting/optimization engine** · task interleaving · **3PL client billing / cost-to-serve**.
> ⚠️ Two easy misreads: `src/lib/billing/*` is **SaaS-subscription** billing (Stripe plans), *not* 3PL client billing; `label_manifests` is **kit/prebox assembly**, *not* a carrier manifest.

**Research question for §4:** of the ABSENT/PARTIAL list, which are genuine table-stakes for an SMB used-goods reseller (rank them), and which are enterprise-3PL features this ICP will never pay for (name them so we can stop worrying about them)? *Hypothesis to test: carrier EOD manifest, wave/batch picking, a report builder, and expiry/lot (for graded/dated goods?) matter; ASN/EDI, dock scheduling, cross-dock, slotting, and 3PL billing mostly don't for this ICP.*

---

## 5. The "feels unfinished" evidence (perceived quality — lead here)

A code survey (2026-08-08) found the finish gap is concentrated and fixable. These are the confirmed findings; treat them as the seed of the trust-&-finish section.

### 5.1 The flagship symptom — `/incoming` skeleton-forever

> **VALIDATION (2026-08-08, post-survey):** The flagship `/incoming` resilience fix **shipped**.
> Do **not** re-propose timeouts, SSR seed, or `isError` wiring for the receiving grid.
> Guard: `src/components/station/incoming-resilience.guard.test.ts`.
> Remaining open items for Incoming are narrower: it is still **not** in
> `tier1-paint-order.ts` (Unbox is); paint-order membership + any residual
> perceived-latency polish belong in H2, not a "skeleton forever" H1.

**Original survey claims (STALE — struck):**
- ~~That fetch has no timeout / no `AbortSignal`~~ → **FIXED:**
  `RECEIVING_LINES_FETCH_TIMEOUT_MS = 15_000` + `AbortSignal.timeout(...)` in
  `receiving-queries.ts`; seed uses `SEED_FETCH_TIMEOUT_MS = 3_000` in
  `incoming-seed.server.ts`.
- ~~Error path swallowed (`{ data, isLoading }` only)~~ → **FIXED:**
  `useReceivingLinesData` returns `isError`/`refetch`;
  `ReceivingLinesTable` paints `GridDegradedBox onRetry={refetch}`.
- ~~No SSR seed~~ → **FIXED:** `src/app/incoming/page.tsx` calls `seedIncomingLines()`
  into `HydrationBoundary`.
- Skeleton gate `showSkeleton = loading && isEmpty` still exists on the grid
  engine — that is correct once loading is bounded and errors settle; do not
  treat the gate itself as the bug.

**Still true from the survey:**
- `/incoming` is **not** declared in `src/lib/observability/tier1-paint-order.ts`
  (Unbox is). Promote Incoming to Tier-1 paint when H2 SSR/perceived-latency work
  lands — do not confuse this with the already-closed hang/swallow bug.

### 5.2 Systemic error-swallow (the single most repeated maturity gap)

> **VALIDATION:** The **count pattern** still holds (~28 files match
> `{ data, isLoading }` destructure). **Exclude `/incoming` / receiving grid**
> from the exemplar list — that surface is fixed. The flagship remaining
> swallower is the **operations dashboard**
> (`useOperationsDashboardData.ts` + `OperationsDashboard.tsx`).
> ~25 of the 28 files still have no `isError` usage in-file.

**28 files** (survey count) destructure `{ data, isLoading }` with no
`isError`/degraded state on most of them. A backend blip renders as blank
tiles / empty lists, never a retryable "couldn't load." The four-settled-states
rule (loading → absence vs no-match vs **degraded**) is followed *exquisitely*
in some places (`onboarding/template/page.tsx`, now also Incoming via
`GridDegradedBox`) and dropped in others. **Premium SaaS never shows a blank
where an error occurred.**

### 5.3 Honest realtime — the "Live" pill lies

> **VALIDATION: CONFIRMED (still open).**

`OperationsDashboard.tsx` hardcodes `ablyStatus="connected"`. The `LiveFeedCard`
fully supports `connecting|disconnected` (amber/rose), but the dashboard never
wires real connection state — so the green "Live" pill shows even when realtime
is down. House already has `useRealtimeLink()` /
`src/lib/realtime/connection-health.ts` (used by Operations TV). **A best-in-class
monitor never lies about its own connection.**

### 5.4 Consistency debt under a strong governance regime

> **VALIDATION: PARTIAL.** `RAW_FOCUS_BASELINE = 1075` is the **ratchet ceiling**
> in `focus-ring-tokens.guard.test.ts`, **not** today's live inventory.
> Live count measured **906** (2026-08-08, `FOCUS_LIST=1`). SoT already exists:
> `focusRing()` in `src/design-system/tokens/focus-ring.ts`. Retirement work =
> codemod + **lower** the baseline; never raise it.

DS ratchets forbid *growth* but a large *standing* inventory of one-offs remains:
**~906 raw focus recipes** under a ceiling of **1075** (`RAW_FOCUS_BASELINE`),
plus sibling baselines (control-size overrides, hand-rolled shells, raw event-bus,
raw `<button>`, native `title=`, hand-rolled dialogs, hex utilities). Divergent
focus treatments remain the biggest sub-pixel-consistency liability — exactly
what separates "polished" from "premium."

### 5.5 First-run funnel not enforced

> **VALIDATION: CONFIRMED (still open).**

The pieces are excellent (`/onboarding/template` chooser + AI recommender +
`GettingStartedChecklist` + `src/lib/onboarding/steps.ts`), but there is **no
`/onboarding` index and no routing gate** forcing a new/template-less org into
onboarding. A new owner can land on empty operator desks before ever choosing a
workflow template (`hasActiveWorkflow` is the derived gate in onboarding stats).

**Research questions for §5:** (a) What is the premium-SaaS *standard pattern*
for each — loading (skeleton→resolve, timeouts, streaming/SSR),
degraded-with-retry, honest realtime, activation gating — with named exemplars?
(b) Is there a systematic way to retire the remaining ~906 focus-ring one-offs
(codemod + lower `RAW_FOCUS_BASELINE`) without a 220-file churn?
(c) What perceived-latency budget should Tier-1 operator surfaces hold
(LCP/INP targets), and how do the best hit it?

---

## 6. Gap themes to research (organize the register around these)

| Theme | Prompt for Gemini |
|---|---|
| **A. Loading/error/empty resilience** | The §5.1–5.2 pattern generalized. Standard for timeouts, degraded-with-retry, optimistic + SSR/streaming. Which surfaces in a WMS most need it? |
| **B. Honest, ambient realtime** | §5.3. How do premium ops tools convey live/degraded/stale without lying or nagging? |
| **C. Keyboard-first & bulk ops** | We have ⌘K nav search + saved views. What's the premium bar for command palette depth, multi-select bulk actions, and **undo** across a WMS? Where are we short? |
| **D. WMS domain depth** | §4 PARTIAL/ABSENT. Rank by ICP. Focus: wave/batch picking, carrier EOD manifest, report builder, directed putaway, cartonization. |
| **E. Analytics & decision support** | 3 canned reports + an ops dashboard. What reporting/BI/alerting do peers ship (report builder, scheduled exports, anomaly alerts, cost/margin analytics for resellers)? |
| **F. Activation & empty-tenant** | §5.5. Best-in-class first-run for an ops tool: guided setup, sample data, "empty state that teaches," progressive activation. |
| **G. Consistency & finish debt** | §5.4. The retirement strategy for the DS one-off inventory; the "sub-visible polish" checklist (focus, motion, spacing, tooltips, dialogs). |
| **H. Trust surfaces** | Audit visibility, permissions clarity, data-lineage, "why did this happen" explainability — what an SMB owner needs to trust the system with their inventory. |
| **I. What premium has that we lack entirely** | Free-associate against Linear/Stripe/Ramp: notifications/digest, saved filters everywhere, personalization, in-app changelog, health/status, granular exports, API/webhooks for the tenant. Which apply? |

---

## 7. Constraints — recommendations must fit house law (do not fight it)

Recommendations that violate these are non-actionable. (Full detail in the companions.)

- **Compose, don't fork.** One table engine (`LedgerGrid`), one saved-views store (`useSavedViews`), one search waist (`hybridSearch`), one status machine (`transition()`/`transitionReceivingLine`). Never propose a second.
- **Kinetic Ledger identity** — dense, flush-square ops chrome, tokens only (color/spacing/type/z/focus/motion from the SoT). Not a foreign design kit.
- **Region contracts** — Station (scan, ephemeral) vs Workbench (pick/edit, URL-durable) vs Monitor (observe) vs Canvas. Don't blur them.
- **Exceptions are orthogonal `exception_code`, never a terminal status.** Don't invent lifecycle states.
- **Multi-tenant RLS, permission registry, audit** are non-negotiable on any new surface.
- **Perceived-perf discipline** — Tier-1 routes seed SSR; never gate the LCP element behind `ssr:false`.

Prefer recommendations that **grow an existing SoT** over ones that add a new subsystem.

---

## 8. Prioritization framework (how to rank the register)

1. **Perceived-quality-first.** A fix that stops a flagship surface feeling broken (§5.1) outranks a net-new capability, because trust is the gate to everything else.
2. **Impact ÷ effort**, with a bias toward *patterns that generalize* (fixing the error-swallow once, then applying to 27 sites, beats one bespoke fix).
3. **ICP fit** — weight down enterprise-3PL features this buyer won't pay for; weight up what an SMB reseller hits daily.
4. **Blast radius** — favor low-risk, single-consumer or additive changes over cross-cutting rewrites.

Output the register sorted by this, with the H1/H2/H3 horizon mapping.

---

## 9. Explicit non-goals

- No code, no PRs — this is research.
- Do not re-propose HAVE capabilities (§4).
- Do not recommend a second design system, table engine, saved-views store, search engine, or status machine.
- Do not push generic enterprise-3PL scope (dock scheduling, EDI, slotting, 3PL billing) *unless* you can argue it's table-stakes for THIS ICP — and if you can't, say so explicitly so we stop weighing it.

---

## 10. Companions (read for house context; do not re-litigate)

| Doc | Role |
|---|---|
| `AGENTS.md` · `.claude/rules/source-of-truth.md` | House constitution + SoT invariants |
| `.claude/rules/kinetic-ledger.md` · `ui-design-system.md` | UI identity + design system |
| `.claude/rules/contextual-display.md` (+ `display/*`) | Region contracts (Station/Workbench/Monitor/Canvas) |
| `.claude/rules/display/workbench.md` → four settled states | Loading/absence/no-match/degraded contract (the §5 gap) |
| `src/lib/observability/tier1-paint-order.ts` + `docs/performance/HANDOFF-lcp-streaming.md` | Paint discipline (Incoming Tier-1 membership still open; SSR seed shipped) |
| `.claude/rules/backend-patterns.md` | Route/state-machine/audit/tenant patterns |
| §4 inventory above | The authoritative HAVE/PARTIAL/ABSENT map |
| [`wms-premium-parity-gap-RESEARCH.md`](./wms-premium-parity-gap-RESEARCH.md) | Validated Gemini adoption + stale flags |
| [`wms-premium-parity-gap-H1-HANDOFF.md`](./wms-premium-parity-gap-H1-HANDOFF.md) | Implementation handoff (H1 only) |

---

## 11. Starter research questions (answer these explicitly)

1. Rank the top 10 things that make Cycle Forge feel less than premium, most-impactful first, using §5 as seed and §2 as the bar.
2. For loading/error/empty (§5.1–5.2): what is the exact premium pattern (timeout, degraded-with-retry, skeleton-that-resolves, SSR/streaming), and which WMS surfaces most need it?
3. Of §4's PARTIAL/ABSENT, which are ICP table-stakes vs enterprise bloat? Give a one-line verdict each.
4. What does a best-in-class SMB-reseller WMS ship that isn't anywhere in §4 at all (blind spots)?
5. Reporting/analytics: what's the minimum viable "premium" — report builder? scheduled exports? margin/velocity analytics? alerting?
6. Activation: design the ideal first-run for a new reseller org given the pieces in §5.5.
7. The consistency-debt retirement (§5.4): recommend a strategy that respects the ratchet regime.
8. Give the H1/H2/H3 roadmap.

Ground every current-state claim in the §4 inventory or a cited path; flag anything you're inferring.
