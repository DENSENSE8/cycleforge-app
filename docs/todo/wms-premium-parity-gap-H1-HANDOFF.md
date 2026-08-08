# Handoff — WMS premium parity · Horizon 1 (trust & finish)

**For:** implementing agent (Claude Code / Cursor / Codex)  
**From:** Cycle Forge engineering  
**Date:** 2026-08-08  
**Predecessor:**
[`wms-premium-parity-gap-RESEARCH.md`](./wms-premium-parity-gap-RESEARCH.md)
(validated Gemini adoption) · briefing
[`wms-premium-parity-gap-GEMINI-RESEARCH-BRIEFING.md`](./wms-premium-parity-gap-GEMINI-RESEARCH-BRIEFING.md)
(§5.1 Incoming claims **struck** — resilience already shipped).  
**Status:** SPEC LOCKED for H1 only. Do **not** start H2/H3 (wave picking, SCAN
forms, report builder, Tier-1 paint membership) in this handoff.  
**Lane:** stay on the checkout's branch · attach to **`:3050`** · never
start/restart/kill the dev server · **user owns commits**.  
**Product frame:** Cycle Forge multi-tenant reseller-ops SaaS; USAV is dogfood only.

**Paste for a new session:**

```
Read docs/todo/wms-premium-parity-gap-H1-HANDOFF.md and execute Phases A→D in order.
Also skim docs/todo/wms-premium-parity-gap-RESEARCH.md §1–§2 for validated/stale flags.

Do NOT re-fix /incoming resilience (guarded by incoming-resilience.guard.test.ts).
Do NOT invent a global 5s AbortSignal SoT — surface budgets stay local.
Do NOT raise RAW_FOCUS_BASELINE — lower it after each focusRing() batch.
Do NOT schedule ASN/EDI, dock scheduling, slotting, 3PL billing, or FEFO.
Do NOT build wave/batch picking, carrier SCAN forms, or a report builder in this H1.

Attach to :3050. npm run verify before done (never raise knip / DS baselines).
```

---

## 0. Locked decisions

| # | Decision | Ruling |
|---|---|---|
| 1 | **Scope** | H1 trust & finish only: honest realtime · error swallows · activation gate · focus ratchet-down. |
| 2 | **Incoming** | Closed. Do not touch timeouts / SSR seed / `GridDegradedBox` wiring except to **reuse** the pattern. |
| 3 | **Degraded UI** | Prefer existing SoT: `GridDegradedBox` for grid surfaces; localized non-blocking Retry for Monitor cards/tiles. Never a full-page error that kills nav. |
| 4 | **Ably status** | Derive from `useRealtimeLink()` / connection store — never hardcode `"connected"`. Map health → `LiveFeedCard` prop (see Phase A). |
| 5 | **Activation gate** | Server redirect when `!stats.hasActiveWorkflow`. Destination `/onboarding/template` (thin `/onboarding` index may forward). Allowlist onboarding + auth + settings paths. |
| 6 | **Focus migration** | `focusRing(archetype, tone)` from `@/design-system/tokens/focus-ring` via `cn()`. Batch + lower baseline. Escape only with same-line `ds-allow-focus`. |
| 7 | **Timeouts** | When adding fetches to swallowers, use a **local** named `*_TIMEOUT_MS` constant (Incoming uses 15s). Do not invent a repo-wide 5s law. |
| 8 | **Verify** | `npm run verify` green; never raise `RAW_FOCUS_BASELINE` or other DS ratchets. |

---

## 1. Non-goals (this handoff)

- Re-implementing `/incoming` SSR / timeout / `isError` (done)
- Declaring `/incoming` in `tier1-paint-order.ts` (H2)
- Wave / batch picking, carrier EOD SCAN forms, report builder (H2–H3)
- Enterprise bloat listed in the research doc
- Forking a second checklist, table engine, or realtime health model

---

## Phase A — Honest realtime on Ops LiveFeedCard (S)

**Files**

- [`src/features/operations/components/OperationsDashboard.tsx`](../../src/features/operations/components/OperationsDashboard.tsx)
  — remove `ablyStatus="connected"`
- [`src/features/operations/components/LiveFeedCard.tsx`](../../src/features/operations/components/LiveFeedCard.tsx)
  — already accepts `'connected' | 'connecting' | 'disconnected'`
- [`src/hooks/useConnectionHealth.ts`](../../src/hooks/useConnectionHealth.ts)
  — `useRealtimeLink()` (same source as Operations TV / `NetworkChip`)
- [`src/lib/realtime/connection-health.ts`](../../src/lib/realtime/connection-health.ts)
  — pure classifier

**Map** (keep in one small helper next to the dashboard or LiveFeedCard — do not
fork a second health model):

| `RealtimeLink` | `LiveFeedCard` `ablyStatus` |
|---|---|
| `health === 'healthy'` and not `degraded` | `'connected'` |
| `health === 'wobbling'` and not yet `degraded` | `'connecting'` (grace — Ably reconnects routinely) |
| `degraded === true` OR `health === 'degraded'` | `'disconnected'` |
| `health === 'unknown'` | `'connecting'` (never claim Live) |

**Acceptance**

- [ ] No hardcoded `ablyStatus="connected"` in OperationsDashboard
- [ ] Pill shows Live / connecting / disconnected from real store state
- [ ] Ambient only — no modal / toast spam on wobble
- [ ] Guard test: source scan asserts OperationsDashboard does not contain the
      string `ablyStatus="connected"` (or wires a helper)

---

## Phase B — Four settled states on Ops Dashboard + P0/P1 swallowers (M)

**Flagship**

1. [`useOperationsDashboardData.ts`](../../src/features/operations/components/useOperationsDashboardData.ts)
   — surface `isError` + `refetch` (and keep existing Ably channel invalidation).
2. [`OperationsDashboard.tsx`](../../src/features/operations/components/OperationsDashboard.tsx)
   — when `isError` and no usable `data`, paint a localized degraded band with
   Retry (nav chrome stays). When partial data exists, prefer showing data + a
   non-blocking retry chip over blanking the Monitor.

**Pattern to copy**

- Incoming golden: `useReceivingLinesData` → `GridDegradedBox onRetry={refetch}`
- Four settled states law:
  `.claude/rules/display/workbench.md` (loading · absence · no-match · degraded)

**Then** walk the P1 list in
[`wms-premium-parity-gap-RESEARCH.md`](./wms-premium-parity-gap-RESEARCH.md) §7
(mobile PickQueue / PackingList / Checklist queue). Same contract: destructure
`isError`/`refetch`, paint Retry, never blank-as-empty.

**Optional fetch bound:** if a swallower's `queryFn` has no timeout, add a local
`AbortSignal.timeout(NAME_MS)` constant in that module. Do not change Incoming's
15s constant as part of this phase.

**Acceptance**

- [ ] Ops Dashboard: failed `/api/dashboard/operations` shows Retry, not empty KPIs
  that look like a quiet warehouse
- [ ] P1 mobile queues show degraded+retry
- [ ] No new `{ data, isLoading }`-only destructure on touched files
- [ ] `npm run verify` green

---

## Phase C — Activation gate (S)

**Goal:** A brand-new org without an active workflow never lands on an empty
operator desk as the first paint.

**Pieces already excellent (compose, don't fork)**

- `/onboarding/template` chooser
- `GettingStartedChecklist` + `src/lib/onboarding/steps.ts`
- `getOnboardingStats()` → `hasActiveWorkflow`

**Implement**

1. Add thin [`src/app/onboarding/page.tsx`](../../src/app/onboarding/page.tsx)
   that redirects to `/onboarding/template` (index for the activation funnel).
2. Server gate in the authenticated app shell (preferred — **this repo has no
   `middleware.ts` today**; do not invent a parallel auth stack). Call
   `getOnboardingStats(orgId)` once per navigation boundary that owns desk
   routes; if `!hasActiveWorkflow`, `redirect('/onboarding/template')`.
3. **Allowlist** (never redirect loops): `/onboarding/**`, auth/sign-in/sign-up,
   `/settings/**` (integrations + org admin needed to unblock), public/marketing
   if any, and API routes (gate is page-level).
4. Existing dogfood orgs with `hasActiveWorkflow === true` are unaffected.
5. Soft dismissal of `GettingStartedChecklist` must **not** bypass the workflow
   gate — checklist dismissal ≠ template chosen.

**Acceptance**

- [ ] `/onboarding` resolves (forwards to template)
- [ ] New org without active workflow cannot open `/incoming` / Ops Live / shipping
      desks until template install sets `hasActiveWorkflow`
- [ ] Orgs with an active workflow see no redirect
- [ ] Guard test covering allowlist + redirect condition (source or unit on the
      pure predicate)

---

## Phase D — Focus-ring ratchet-down (M, batchable)

**SoT (already exists — do not create a twin)**

- [`src/design-system/tokens/focus-ring.ts`](../../src/design-system/tokens/focus-ring.ts)
  — `focusRing(archetype, tone)`
- Guard: [`src/components/ui/focus-ring-tokens.guard.test.ts`](../../src/components/ui/focus-ring-tokens.guard.test.ts)
  — `RAW_FOCUS_BASELINE = 1075` (ceiling); live ~**906** as of 2026-08-08

**Method**

1. `FOCUS_LIST=1 npx tsx --test src/components/ui/focus-ring-tokens.guard.test.ts`
   to list offenders (largest first — note `utils/staff-colors.ts` alone is huge;
   prefer interactive controls over color maps if a map is false-positive-ish).
2. Codemod / migrate call sites to `cn(..., focusRing('control'|'field'|'wrapper'|'cell', tone))`.
3. After each batch, **lower** `RAW_FOCUS_BASELINE` to the new measured count.
4. Genuine one-offs: same-line `ds-allow-focus` only.
5. Ship in multiple PRs if needed — each PR must leave the ratchet strictly lower.

**Acceptance**

- [ ] At least one meaningful batch landed with baseline lowered
- [ ] No raise of `RAW_FOCUS_BASELINE` or sibling DS baselines
- [ ] Primitives still import `focusRing` (keystone test stays green)

---

## 2. Verify gate

Before calling H1 done:

```bash
npm run verify
```

Plus targeted guards as added:

```bash
npx tsx --test src/components/station/incoming-resilience.guard.test.ts
npx tsx --test src/components/ui/focus-ring-tokens.guard.test.ts
# + any new ops-ably / onboarding-gate / degraded-state guards from this handoff
```

---

## 3. Out of scope reminders (parked)

| Item | Horizon | SoT to grow later |
|---|---|---|
| `/incoming` → `tier1-paint-order.ts` | H2 | `src/lib/observability/tier1-paint-order.ts` |
| Carrier EOD SCAN forms | H2 | New shipping manifest — **not** `label_manifests` |
| LedgerGrid bulk + ⌘K depth | H2 | Table definition registry + CommandBar |
| Wave / batch picking | H3 | `src/lib/picking/*` |
| Report builder | H3 | `/api/reports/*` + reports UI |

---

## 4. Done when

- Phases A–C complete with guards  
- Phase D has landed ≥1 baseline-lowering batch (full 906→0 not required in one pass)  
- Research doc §6 H1 checklist items are checkable as true  
- `npm run verify` green · no ratchet raises  
