# Station realtime + capture visibility — program index

**Date:** 2026-08-01  
**Product:** Cycle Forge multi-tenant reseller-ops SaaS (Kinetic Ledger). USAV is dogfood only.  
**Frame:** Source of Truth for **all Station-contract benches** (Triage · Unbox · Testing · Pack · Shipping · Pickup · FBA + shared phone shell). Unbox is a measured exemplar, not the product owner of this program.

---

## One-sentence goal

Make paired desk↔phone evidence capture **operator-visible and always-on** across every Station bench — upload state, send-to-device pairing, and Ably connection health — without inventing a second realtime transport.

---

## Package files

| File | Audience | Job |
|---|---|---|
| [This INDEX](./station-realtime-capture-visibility-INDEX.md) | Human + agents | Program map, read order, Gemini→Claude gate |
| [`station-realtime-capture-visibility-GEMINI-RESEARCH-BRIEFING.md`](./station-realtime-capture-visibility-GEMINI-RESEARCH-BRIEFING.md) | Gemini Pro | Industry research + force D1–D12 |
| [`station-realtime-capture-visibility-CLAUDE-CODE-PROMPT.md`](./station-realtime-capture-visibility-CLAUDE-CODE-PROMPT.md) | Claude Code / Cursor Agent | **Paste-ready execution handoff** |

---

## Read order

1. [`.claude/rules/display/station.md`](../../.claude/rules/display/station.md) — Station contract (pass/fail = big card, OfflineBanner singleton).
2. **This INDEX** — ownership and gates.
3. [`station-realtime-capture-visibility-GEMINI-RESEARCH-BRIEFING.md`](./station-realtime-capture-visibility-GEMINI-RESEARCH-BRIEFING.md) — paste to Gemini Pro (or skip and keep Engineering lean).
4. Merge Gemini D1–D12 into Claude prompt **§Locked decisions** (Session 0), *or* keep provisional lean.
5. Paste Claude Code **Session 1** from [`station-realtime-capture-visibility-CLAUDE-CODE-PROMPT.md`](./station-realtime-capture-visibility-CLAUDE-CODE-PROMPT.md) into a fresh agent session.
6. Session 2 / Session 3 only after Session 1 `npm run verify` is green.

---

## Status

| Track | Status |
|---|---|
| Docs package (INDEX + Gemini brief + Claude prompt) | Ready 2026-08-01 |
| Gemini research run | Pending operator paste |
| Claude Session 0 (lock decisions) | **Done 2026-08-01** — no Gemini run; lean = Locked (D5 annotated *deferred*) |
| Claude Session 1 (P0 upload visibility) | In progress |
| Claude Session 2 (P1 pairing UI) | Gated on Session 1 verify green |
| Claude Session 3 (P2 OfflineBanner + Ably) | Gated on Session 2 verify green |
| P3 durable photo requests | Ask-first — not in paste blocks |

**Do not start Session 2 or Session 3 until Session 1 verify is green.**

---

## Decision ownership

| Owner | Owns |
|---|---|
| **Gemini Pro** | Industry pattern language; attack/validate D1–D12; sketch ≤40-line P0 Claude prompt |
| **Engineering lean** (Appendix A in Gemini brief) | Provisional Locked until Gemini amends — Claude Code is runnable without waiting |
| **Claude Code** | Implementation Sessions 0–3; no transport invention; compose SoTs |
| **Operator** | Commits, Gemini paste, green-light P3, lane/server |

---

## Framing law (all package docs)

- **Region:** Station — [`.claude/rules/display/station.md`](../../.claude/rules/display/station.md)
- **Universal capture grammar:** [`unbox-capture-stack-PLAN.md`](./unbox-capture-stack-PLAN.md) — *all stations migrate*; one stack grammar phone + desktop
- **Compose, don’t fork:** one upload-visibility compound · one OfflineBanner · one pairing/ACK pattern · one Ably channel taxonomy; benches = thin adapters
- **“LB websocket” = Ably** (not Neon WS pool, not a generic load-balancer)
- **Non-goals:** no Ably→SSE swap; no second realtime bus; no toast-as-completion; no per-station upload-strip twins; no DS baseline raises; no Unbox-only solution

---

## Sibling map (cite — do not redo)

| Sibling | Owns | This program |
|---|---|---|
| [`unbox-capture-stack-PLAN.md`](./unbox-capture-stack-PLAN.md) | Universal bottom-anchored capture stack | Visibility compound composes into this grammar |
| [`mobile-unbox-photo-flow-GEMINI-RESEARCH-BRIEFING.md`](./mobile-unbox-photo-flow-GEMINI-RESEARCH-BRIEFING.md) | Phone unbox display model | Named the toast-vs-queue gap; we generalize to all stations |
| [`photo-evidence-chain-INDEX.md`](./photo-evidence-chain-INDEX.md) | Stage / evidence SoT | Stage routing stays; transport unchanged |
| [`home-ops-tv-collab-surfaces-plan.md`](./home-ops-tv-collab-surfaces-plan.md) | Monitor/TV Ably degrade intent | Session 3 OfflineBanner semantics |
| [`docs/integrations/realtime-ai.md`](../integrations/realtime-ai.md) | Accurate Ably short reference | Prefer over stale Feature_Interaction_Map outbox claims |
| [`.claude/rules/display/station.md`](../../.claude/rules/display/station.md) | Station display contract | Hard law for all sessions |

---

## Operator workflow (after docs land)

1. Paste the Gemini briefing → Gemini Pro → get D1–D12 rulings + P0 Claude sketch.
2. Merge rulings into Claude Code prompt §Locked (or accept Engineering lean if skipping Gemini).
3. Paste Claude Code **Session 1** into a fresh agent session → implement P0.
4. Later: Session 2 (pairing), Session 3 (connection chrome); P3 ask-first only.

---

## Out of scope for this package

- App code (starts when Session 1 is pasted)
- DOC-CATALOG / portfolio index updates (unless separately asked)
- Expanding `realtime_outbox` to photo requests
- Replacing Ably with SSE
