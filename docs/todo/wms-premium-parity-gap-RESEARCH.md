# WMS premium parity gap — research adoption (validated)

**Date:** 2026-08-08  
**Source:** Gemini response to
[`wms-premium-parity-gap-GEMINI-RESEARCH-BRIEFING.md`](./wms-premium-parity-gap-GEMINI-RESEARCH-BRIEFING.md)  
**Status:** Research **adopted with corrections**. Briefing §5.1 Incoming claims are
**stale** (resilience already shipped). Do **not** re-run Gemini on the uncorrected
brief. Implementation starts at
[`wms-premium-parity-gap-H1-HANDOFF.md`](./wms-premium-parity-gap-H1-HANDOFF.md).  
**Lane:** stay on checkout branch · attach `:3050` · user owns commits.  
**Product frame:** Cycle Forge multi-tenant reseller-ops SaaS (SMB used-goods /
electronics refurb). USAV is dogfood only — not enterprise 3PL scope.

---

## 1. Executive adoption

| Gemini theme | Adoption |
|---|---|
| Lead with trust & finish (loading / error / realtime / activation / consistency) over net-new WMS depth | **Adopt** |
| Four-settled-states + localized Retry (Linear/Stripe) across error-swallowers | **Adopt** — start Ops Dashboard; Incoming already fixed |
| Honest Ably status on `LiveFeedCard` | **Adopt** — H1 |
| Activation gate → onboarding before empty desks | **Adopt** — H1 |
| Focus-ring retirement via `focusRing()` + ratchet **down** | **Adopt** — H1 (codemod batches); SoT already exists |
| Wave/batch picking, carrier EOD SCAN forms, report builder | **Adopt as H2–H3** — real ICP table-stakes; park until H1 trust work lands |
| Slotting, ASN/EDI, dock scheduling, 3PL billing, FEFO as non-goals for this ICP | **Adopt** — stop weighing |
| “5s AbortSignal as *the* premium timeout” | **Reject as house SoT** — budgets are surface-specific (Incoming client 15s, seed 3s); do not invent a global 5s rule |
| “Seed SSR for `/incoming` in H2” as if absent | **Reframe** — SSR seed **exists**; remaining work is Tier-1 paint-order membership + residual latency |

### Critique we accept

1. **Blank-where-error** is the most repeated maturity gap and generalizes once one degraded pattern is locked.
2. **Hardcoded green Live** destroys ambient trust for zero product gain.
3. **Optional GettingStartedChecklist** without a routing gate lets empty tenants feel broken.
4. **ICP filter** on ABSENT/PARTIAL is correct — do not chase Manhattan/Blue Yonder modules.

### Critique we refine (do not over-claim)

| Gemini / briefing claim | Validated note |
|---|---|
| `/incoming` hangs forever; no timeout; swallows `isError`; no SSR | **STALE** — fixed + guarded (`incoming-resilience.guard.test.ts`) |
| “28 files including `/incoming`” as the lead exemplar | **PARTIAL** — count ~28 still; Incoming is **out** of the exemplar set |
| “1075 hand-rolled focus rings” as live inventory | **PARTIAL** — baseline ceiling **1075**; live **~906** (`FOCUS_LIST=1`) |
| AbortSignal **5s** as the standard pattern | **EMBELLISHMENT** — not in briefing as a house constant; do not codify |

---

## 2. Ranked parity-gap register (validated)

| Gap | Best-in-class | Cycle Forge today | ICP | Effort | Impact | Validation | Horizon |
|---|---|---|---|---|---|---|---|
| Systemic error swallows | Localized degraded + Retry | ~28 `{ data, isLoading }` sites; Ops Dashboard still swallows; Incoming **fixed** | High | M | High | **PARTIAL** — pattern real; Incoming exemplar struck | **H1** |
| Activation funnel | Guided first-run before ops desk | No `/onboarding` index; no routing gate; checklist dismissible | High | S | High | **CONFIRMED** | **H1** |
| Honest realtime | Truthful connecting/connected/disconnected | `OperationsDashboard` hardcodes `ablyStatus="connected"`; `useRealtimeLink` already exists | Med | S | Med | **CONFIRMED** | **H1** |
| Consistency debt (focus) | Tokenized `focusRing()` everywhere | Ceiling 1075 / live ~906; SoT in `focus-ring.ts` | Med | M | Med | **PARTIAL** — ceiling ≠ live | **H1** (ratchet batches) |
| Wave / batch picking | Grouped paths (ShipHero) | Deadline queue + pick sessions only (`src/lib/picking/*`) | High | L | High | **CONFIRMED** | **H3** |
| Carrier EOD manifests (SCAN) | Automated cutoff SCAN forms | Absent; `label_manifests` = kit/prebox only | High | M | High | **CONFIRMED** | **H2** |
| Analytics & reporting builder | Margin / velocity / scheduled export | 3 canned reports (bin-utilization, dead-stock, velocity) | Med | L | Med | **CONFIRMED** | **H3** |
| Multi-select & bulk ops | ⌘K depth + LedgerGrid bulk transitions | Basic ⌘K nav; limited bulk | Med | M | Med | **CONFIRMED** (thin) | **H2** |
| `/incoming` Tier-1 paint membership | SSR spine + declared LCP order | SSR seed **exists**; **not** in `tier1-paint-order.ts` | Med | S | Med | **REFRAMED** (was “no SSR”) | **H2** |
| Directed putaway | Velocity/zone multi-rule | Single default-bin (`putaway-placement.ts`) | Low | M | Low | **CONFIRMED** | Later / opportunistic |

### Explicit non-goals (enterprise bloat — do not schedule)

- Slotting / optimization engines  
- ASN & EDI  
- Dock scheduling & cross-docking  
- 3PL client billing / cost-to-serve (`src/lib/billing/*` is SaaS subscription)  
- Lot & expiry / FEFO (serial provenance covers graded electronics)

---

## 3. Trust & finish — Gemini narrative (kept, with corrections)

### Loading & resilience

Premium surfaces paint structural spine via SSR, bound client fetches with
`AbortSignal`, and resolve skeletons into data without layout shift.

**Correction:** Incoming already has SSR seed + 15s client timeout +
`GridDegradedBox`. Generalize that pattern to remaining swallowers; do **not**
re-implement Incoming.

### Systemic error-swallow fix

Surfaces that drop `isError` must implement four settled states
(loading → absence vs no-match vs **degraded**) with a localized, non-blocking
Retry that preserves navigation context. Golden references:

- `onboarding/template/page.tsx` (briefing)
- Incoming: `useReceivingLinesData` + `GridDegradedBox` (shipped)
- Target H1 flagship: `useOperationsDashboardData` → Ops Monitor tiles/feed

### Honest realtime

Wire real connection state into `LiveFeedCard` — never hardcode `"connected"`.
Map from house realtime health (`useRealtimeLink` /
`classifyRealtimeState`) into the card’s
`'connecting' | 'connected' | 'disconnected'` prop. Ambient pill only — no modal.

### Consistency debt

Retire raw focus recipes via `focusRing(archetype, tone)` from
`@/design-system/tokens/focus-ring`. Codemod in batches; after each batch
**lower** `RAW_FOCUS_BASELINE` in `focus-ring-tokens.guard.test.ts`. Never raise.

### Activation gate

Empty / template-less tenants must not land on broken empty desks. Gate on
derived onboarding truth (`hasActiveWorkflow` from `OnboardingStats` /
`GET /api/onboarding/stats`) and redirect to `/onboarding/template` (or a thin
`/onboarding` index that forwards there) until the workflow step is done.
Compose `GettingStartedChecklist` — do not fork a second checklist.

---

## 4. Capability-depth (ICP filter — adopted)

### Table-stakes (schedule later)

| Capability | Grow this SoT |
|---|---|
| Wave / batch picking | `src/lib/picking/*` (queue + sessions today) |
| Carrier EOD / SCAN forms | New shipping/manifest module — **not** `label_manifests` |
| Reporting builder (margin, velocity, dead-stock, exports) | Extend `/api/reports/*` + `src/app/reports` |

### Not recommended for this ICP

Slotting · ASN/EDI · dock scheduling · cross-dock · 3PL billing · FEFO.

---

## 5. Benchmarks (kept)

| Comparator | Steal | Apply |
|---|---|---|
| Linear / Stripe | Degraded resilience + sub-pixel consistency | Four-settled-states; `focusRing()` |
| ShipHero | Mobile-first wave picking + EOD manifesting | Extend picking; carrier SCAN |
| Vercel | Progressive activation | Onboarding routing gate + checklist |
| Linnworks | Automation / bulk rules | Operations Studio triggers (later) |
| Zoho Inventory | Familiar reporting bridge | Margin/velocity dashboards via report builder |

---

## 6. 3-horizon roadmap (corrected)

### Horizon 1 — Stop feeling broken (weeks) → see H1 HANDOFF

1. Honest Ably status on Ops `LiveFeedCard`  
2. Four-settled-states + Retry on remaining swallowers (Ops Dashboard first)  
3. Activation gate for orgs without `hasActiveWorkflow`  
4. Focus-ring codemod batches that **lower** `RAW_FOCUS_BASELINE`  

**Struck from Gemini H1:** “fix `/incoming` swallow / add timeouts / add SSR”
— already shipped.

### Horizon 2 — Feel premium (quarter)

- Declare `/incoming` in `tier1-paint-order.ts` and close residual LCP gaps  
- Carrier EOD manifests (SCAN forms)  
- LedgerGrid multi-select + bulk state transitions + deeper ⌘K  

### Horizon 3 — Category-leading for SMB resellers

- Wave / batch picking in `src/lib/picking/*`  
- Reporting & analytics builder  
- Deeper Operations Studio automation triggers  

---

## 7. Remaining swallowers (seed list for H1)

Files matching `{ data, isLoading }` with **no** in-file `isError` (survey
2026-08-08). Prefer Monitor/ops-visible first.

| Priority | File |
|---|---|
| P0 | `src/features/operations/components/useOperationsDashboardData.ts` |
| P0 | `src/features/operations/components/OperationsDashboard.tsx` |
| P1 | `src/components/mobile/redesign/PickQueue.tsx` |
| P1 | `src/components/mobile/packer/MobilePackingList.tsx` |
| P1 | `src/components/mobile/checklist/MobileChecklistOrderQueue.tsx` |
| P2 | `src/features/signals/SignalsHistoryWorkspace.tsx` |
| P2 | `src/components/receiving/ZohoInboundStatusBanner.tsx` |
| P2 | `src/components/shipped/OrderDocumentsSection.tsx` |
| P2 | `src/components/shipped/OrderTimelineSection.tsx` |
| P2 | `src/components/order-record/OrderReturnsCard.tsx` |
| later | Admin / sourcing tabs, capture-stack, labels popovers, NAS folders, etc. |

Three siblings already mention `isError` in-file (`QueuePane`,
`BoseModelsManagementTab`, `SuppliersManagementTab`) — verify they paint a
retryable degraded UI before counting them done.

---

## 8. Paste for planning sessions

```
Read docs/todo/wms-premium-parity-gap-RESEARCH.md and
docs/todo/wms-premium-parity-gap-H1-HANDOFF.md.

Do NOT re-fix /incoming resilience (already guarded).
Do NOT invent a global 5s AbortSignal SoT.
Do NOT raise RAW_FOCUS_BASELINE — lower it after each focusRing() batch.
Do NOT schedule ASN/EDI, dock scheduling, slotting, 3PL billing, or FEFO.

H1 only: honest Ably LiveFeedCard · Ops Dashboard degraded+retry · onboarding
gate · focus-ring ratchet-down batches.
```
