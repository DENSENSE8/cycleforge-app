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
| [`station-realtime-capture-visibility-SESSION-3-HANDOFF.md`](./station-realtime-capture-visibility-SESSION-3-HANDOFF.md) | Claude Code / Cursor Agent | **Session 3 (P2) start here** — measured code state + the two traps the prompt does not know about |

---

## Read order

1. [`.claude/rules/display/station.md`](../../.claude/rules/display/station.md) — Station contract (pass/fail = big card, OfflineBanner singleton).
2. **This INDEX** — ownership and gates.
3. [`station-realtime-capture-visibility-GEMINI-RESEARCH-BRIEFING.md`](./station-realtime-capture-visibility-GEMINI-RESEARCH-BRIEFING.md) — paste to Gemini Pro (or skip and keep Engineering lean). Historical: Session 0 locked lean without a Gemini run.
4. [`station-realtime-capture-visibility-CLAUDE-CODE-PROMPT.md`](./station-realtime-capture-visibility-CLAUDE-CODE-PROMPT.md) — full program + Sessions 0–3 paste blocks.
5. **Next implement:** [`station-realtime-capture-visibility-SESSION-3-HANDOFF.md`](./station-realtime-capture-visibility-SESSION-3-HANDOFF.md) — Session 3 (P2) only; do not rebuild P0/P1.

---

## Status

| Track | Status |
|---|---|
| Docs package (INDEX + Gemini brief + Claude prompt) | Ready 2026-08-01 |
| Gemini research run | Still optional — Sessions 0–2 shipped on Engineering lean |
| Claude Session 0 (lock decisions) | **Done 2026-08-01** — no Gemini run; lean = Locked (D5 annotated *deferred*) |
| Claude Session 1 (P0 upload visibility) | **Done 2026-08-02** — `CaptureUploadStatus` + shell dock; toaster demoted to failure echo |
| Claude Session 2 (P1 pairing UI) | **Done 2026-08-02** — `station_device_ack` handshake; Receiving + Pack waiting/unreachable |
| Claude Session 3 (P2 OfflineBanner + Ably) | **Ready to paste** — start at [`SESSION-3-HANDOFF`](./station-realtime-capture-visibility-SESSION-3-HANDOFF.md) |
| P3 durable photo requests | Ask-first — not in paste blocks |

**Gate:** Session 1 and Session 2 are green. Only Session 3 (P2) remains in the paste path.
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

## Operator workflow (current)

1. *(Optional)* Still paste the Gemini briefing anytime to amend D1–D12; merge into Claude prompt §Locked + amendment log before changing shipped P0/P1 behavior.
2. **Now:** paste [`SESSION-3-HANDOFF`](./station-realtime-capture-visibility-SESSION-3-HANDOFF.md) into a fresh agent session → Session 3 (P2 OfflineBanner + Ably).
3. P3 durable photo requests — ask-first only after P2.

Historical (already done): Session 0 lean lock → Session 1 P0 → Session 2 P1.

---

## Out of scope / non-goals (still)

- DOC-CATALOG / portfolio index updates (unless separately asked)
- Expanding `realtime_outbox` to photo requests (P3 ask-first)
- Replacing Ably with SSE / inventing a second realtime bus
- Rebuilding Session 1–2 compounds in the Session 3 run
