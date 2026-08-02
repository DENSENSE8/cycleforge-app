# Claude Code prompt — Station realtime + capture visibility SoT

**For:** Claude Code / Cursor Agent implementing session  
**From:** Cycle Forge engineering  
**Date:** 2026-08-01  
**Status:** ready to execute as **four sessions** (0 docs-lock → 1 P0 → 2 P1 → 3 P2). P3 ask-first only.  
**Lane:** current checkout — no ad-hoc branch. Attach to `:3050`. Never start/restart/kill the server. User owns commits.  
**Product frame:** Cycle Forge multi-tenant reseller-ops SaaS (Kinetic Ledger). USAV is dogfood only.  
**Companions:**
- [`station-realtime-capture-visibility-INDEX.md`](./station-realtime-capture-visibility-INDEX.md) — program map + Gemini→Claude gate
- [`station-realtime-capture-visibility-GEMINI-RESEARCH-BRIEFING.md`](./station-realtime-capture-visibility-GEMINI-RESEARCH-BRIEFING.md) — industry research (optional; lean = Locked until amended)
- [`.claude/rules/display/station.md`](../../.claude/rules/display/station.md) — Station contract
- [`unbox-capture-stack-PLAN.md`](./unbox-capture-stack-PLAN.md) — universal capture stack (*all stations migrate*)
- [`docs/integrations/realtime-ai.md`](../integrations/realtime-ai.md) — Ably short reference

**This is a Station-wide SoT, not an Unbox feature.** Triage · Unbox · Testing · Pack · Shipping · Pickup · FBA + shared phone shell share one visibility / pairing / connection grammar.

---

## Paste this into a new Claude Code session

**Run sessions separately.** Session 1 must verify green before Session 2. Attempting P0–P2 in one sprawling diff is a review failure.

### Session 0 — Lock decisions (docs-only, 5–15 min)

```
Read docs/todo/station-realtime-capture-visibility-INDEX.md and
docs/todo/station-realtime-capture-visibility-CLAUDE-CODE-PROMPT.md §Locked decisions.

If Gemini output exists in chat or a saved ruling doc, merge D1–D12 into §Locked
(replace provisional Engineering lean) and append a row to §Gemini amendment log.
If no Gemini output, keep Engineering lean as Locked and proceed.

Do not write app code in Session 0. Stop and report the locked D1–D12 table.
```

### Session 1 — P0 Upload visibility SoT (implement)

```
Read docs/todo/station-realtime-capture-visibility-CLAUDE-CODE-PROMPT.md end-to-end,
then execute §Phases Session 1 (P0) ONLY. Stop at the P0 gate.

GOAL
1. Ship one CaptureUploadStatus compound (name per §Locked / this prompt) under
   src/components/station/ (or capture-stack sibling) — big-card / stack-row status for
   queued | uploading | failed | committed + retry().
2. Wire Receiving PhotoUploadQueue AND one sibling (Packer OR Unit per §Locked D5/P0) —
   prove SoT across ≥2 domains. Unbox-only mounts FAIL.
3. Demote PhotoUploadToaster to optional echo; the card is completion/failure SoT.
4. No Ably/SSE/transport/outbox expansion. No per-station strip twins. No DS baseline raises.

HARD LAWS
- AGENTS.md + .claude/rules/display/station.md (pass/fail = big card, not toast)
- Capture stack grammar: docs/todo/unbox-capture-stack-PLAN.md (all stations migrate)
- Motion only via @/design-system/motion; join station-motion-bridge guard if animated
- Org-scoped channels only via src/lib/realtime/channels.ts
- Attach :3050; never start/restart/kill the server; user owns commits
- npm run verify before done; never raise ratchet baselines
```

### Session 2 — P1 Pairing reliability UI (after P0 green)

```
Read docs/todo/station-realtime-capture-visibility-CLAUDE-CODE-PROMPT.md §Phases Session 2
and §Locked D2/D3/D11.

Grow share-to-phone ACK/timeout into a shared send-to-device waiting state on
Receiving AND Pack (same SoT). Ephemeral Ably only — no durable claim rows.
Desk shows Waiting on phone… / Phone unreachable as active-entity card state.
Do not invent a second handshake event family without updating the channel SoT.
npm run verify before done.
```

### Session 3 — P2 Connection chrome (after P1 green)

```
Read docs/todo/station-realtime-capture-visibility-CLAUDE-CODE-PROMPT.md §Phases Session 3
and §Locked D4/D12.

Extend OfflineBanner SoT (layout) to Ably connectionState with distinct short copy
from browser offline ("Station sync paused" class — not Ably jargon). All stations
+ TV inherit; no per-bench reconnect strip; no upload modals on Monitor.
Expose stable connection state from AblyContext. npm run verify before done.
```

**P3 durable requests:** ask-first only. Not in paste blocks until the operator approves.

---

## 0. One-sentence goal

**One operator-visible capture/upload + pairing + connection-health grammar for every Station bench**, composed into the universal capture stack / active-entity card — Ably stays; toasts stop being the sole completion signal.

---

## 1. Locked decisions (provisional — Gemini may amend)

Engineering lean. Claude Code is runnable without waiting for Gemini. Session 0 merges research if present.

| ID | Provisional lock |
|---|---|
| **D1** | Visibility lives in active-entity / capture-stack card — **one** compound for all stations |
| **D2** | Shared ACK/timeout grown from share-to-phone ≤6s; P1 — Receiving + Pack same UX |
| **D3** | Ephemeral Ably requests through P2; durable claim/outbox = **P3 ask-first** |
| **D4** | OfflineBanner owns Ably degraded state; P2 — no per-bench strip |
| **D5** | One UI compound; three queue singletons remain (`PhotoUploadQueue`, `PackerPhotoUploadQueue`, `UnitPhotoUploadQueue`) — **deferred, not settled**: see note below |
| **D6** | Desk shows capturing/upload status on focused active entity while peer active |
| **D7** | Kill stale “always outbox” guidance when touching those docs; outbox stays narrow; photos stay direct API + Ably |
| **D8** | Delete dead `phone_scan` subscribers (hygiene in Session 1 or 2); do **not** revive |
| **D9** | Paired request → OS haptic on phone where available |
| **D10** | Status compound respects reduced-motion via motion SoT |
| **D11** | Multi-phone same `staffId`: last-active wins (channel is the gate) |
| **D12** | Monitor/TV: read-only connection/status — never upload modals |

**P0 sibling pick (Locked default):** Receiving + **Pack** (both have send-to-phone + dedicated queue + refresh hook). Unit may follow in the same PR if cheap; must not replace Pack as the SoT proof unless Gemini amends.

#### D5 is scope control, not a settled answer

Measured 2026-08-01: after normalizing names, `PackerPhotoUploadQueue` and
`UnitPhotoUploadQueue` differ by **127 lines out of ~330** — the same
`UploadState` union, the same `queued → uploading → done | failed` machine, the
same `patch()` / `retry()` / `subscribe()` / rehydrate walk, three times over.
**The duplication is in the ENGINE, not the UI**, so unifying only the compound
leaves the next capture domain (FBA, Pickup) copying a fourth queue.

D5 is correct **for P0** — the transport is proven and rewriting `processEntry`
under a visibility change would put two risks in one diff. But it must not
harden into house doctrine by inertia: the follow-up is a queue-engine waist
(one state machine + per-domain scope/endpoint config), ticketed when a fourth
consumer appears **or** when P1 lands, whichever is first. Do not cite D5 as
license to fork a fourth queue.

### Gemini amendment log

| Date | Source | IDs changed | Note |
|---|---|---|---|
| — | — | — | No Gemini run yet — lean stands |
| 2026-08-01 | Claude Session 0 | D5 (annotated) | No Gemini output present; **lean = Locked** for all 12. D5 annotated *deferred, not settled* after measuring 90% engine duplication across the three queues. No ruling reversed. |

---

## 2. Hard Always / Hard Never

### Always

- Compose Station card / capture-stack row for upload + pairing status
- Subscribe to existing queue snapshots (`useUploadQueue`, packer/unit `useSyncExternalStore` hooks)
- Stage-aware receiving requests via `publishReceivingPhotoRequest` SoT
- Org-scoped Ably channel names from `src/lib/realtime/channels.ts` only
- Prefer `docs/integrations/realtime-ai.md` over stale “always outbox” maps
- `npm run verify` green before claiming a session done

### Never

- Second realtime bus or SSE for desk↔phone bridges
- Toast as sole completion/failure signal
- Page-local upload strip per route/station
- Raise DS ratchet baselines or `git commit --no-verify`
- Start / restart / kill `:3050`
- Expand `realtime_outbox` to photo requests without ask-first P3
- Unbox-only compound that Pack/Unit cannot mount
- Invent parallel handshake event names beside share-ack without updating SoT docs

---

## 3. Framing facts (do not rediscover)

### 3.1 Three planes

| Plane | Job |
|---|---|
| Vendor webhooks | Ingest ERP/carriers → Postgres |
| Ably (“LB websocket”) | Live UI + desk↔phone bridges |
| Outbox → `/api/webhooks/realtime-db` | Durable DB→Ably for **narrow** tables (not photos) |

### 3.2 Queues (unchanged pipeline)

| Singleton | Path | Refresh hook |
|---|---|---|
| Receiving | `src/components/mobile/receiving/PhotoUploadQueue.ts` | `useReceivingPhotosRealtimeRefresh` |
| Packer | `src/components/mobile/packer/PackerPhotoUploadQueue.ts` | `usePackerPhotosRealtimeRefresh` |
| Unit | `src/components/mobile/unit/UnitPhotoUploadQueue.ts` | `useUnitPhotosRealtimeRefresh` |

States already exist: `queued → uploading → done | failed` + `retry()`. **P0 makes them visible.** Do not rewrite `processEntry`.

### 3.3 Bridges

| Event | Channel | Direction |
|---|---|---|
| `receiving_photo_request` | `staffstation:` | Desk → phone |
| `unit_photo_request` | `staffstation:` | Desk → phone |
| `receiving_share_to_phone` / `_ack` | `staffstation:` | Desk ↔ phone (≤6s ACK — pairing SoT seed) |
| `scan_ready` | `packer:` | Desk → phone |
| `receiving_photo_uploaded` / `unit_photo_uploaded` | `phone:` | Phone → peers (client notifier) |
| `*-photo.changed` | `station:changes` | Server → all |

---

## 4. Phases

### Session 1 — P0 Upload visibility

**Build**

1. **Presentational compound** — e.g. `src/components/station/CaptureUploadStatus.tsx`  
   - Props shape (illustrative): `{ entries: { id: string; state: 'queued'|'uploading'|'failed'|'committed'; error?: string; onRetry?: () => void }[]; density?: 'floor' }`  
   - Readable at ~3 ft; failed state exposes Retry (wires to queue `retry()`).  
   - Motion via `@/design-system/motion` only; if entrance animation is owned here, add the file to `station-motion-bridge.guard.test.ts`.

2. **Adapter hook(s)** — map receiving / packer / unit snapshots → common `entries`. Prefer one hook with a `source` discriminator over three UI forks.

3. **Mount points (minimum)**  
   - **Receiving mobile:** post-capture return / active feed row / photo studio parent so operators see queue after leaving the immersive camera.  
   - **Receiving desktop:** photo pill / active carton photo strip (`ReceivingPhotoButton` vicinity or capture-stack photo step).  
   - **Pack sibling:** packer photo path and/or `PackSendToPhoneButton` / pack identity strip so the same compound appears after send-to-phone uploads.

4. **Toaster** — leave `PhotoUploadToaster` mounted if useful as echo; document in code comment that **card is SoT**. Do not add more toast-only completion paths.

5. **Hygiene (optional in P0 if small):** remove dead `phone_scan` subscribers with no publisher (D8). If risky/large, ticket to Session 2 and say so in the Session 1 report.

**Tests**

- Unit/contract: adapter maps queue states → compound props (including failed → retry callback).
- Prefer behavioral/contract tests over new DS ratchets.
- Manual on `:3050`: send-to-phone (Receiving) → shoot → see card states; force/fail path if feasible → Retry.

**P0 gate (stop here)**

- [ ] Same compound mounted for Receiving **and** Pack (or Unit if Locked amended)
- [ ] `retry()` reachable from UI without DevTools
- [ ] Toast is not the sole completion signal
- [ ] Upload pipeline unchanged (no transport / outbox expansion)
- [ ] `npm run verify` green

### Session 2 — P1 Pairing reliability UI

**Build**

- Shared send-to-device request state machine: `idle → request_sent → peer_active | timed_out` (timeout order-of-magnitude: share-ack’s 6s is the seed; Gemini may amend T).
- Desk active-entity card: “Waiting on phone…” / “Phone unreachable” with operator retry.
- Grow share-to-phone ACK pattern; Receiving `publishReceivingPhotoRequest` + Pack `scan_ready` both participate in the **same** UX grammar.
- Still ephemeral Ably (D3) — no claim table.

**P1 gate**

- [ ] Receiving + Pack show waiting/unreachable
- [ ] No second handshake event family without SoT doc update
- [ ] `npm run verify` green

### Session 3 — P2 Connection chrome

**Build**

- Stable Ably connection state API from `AblyContext` (subscribe without forcing new Realtime clients).
- Layout `OfflineBanner` shows browser offline **or** realtime degraded (distinct copy @ 3 ft).
- Station / mobile OfflineBanner variants compose or stay in sync with layout SoT — **no third banner**.
- Ops TV reuses semantics read-only (D12).

**P2 gate**

- [ ] Ably drop visible while `navigator.onLine === true`
- [ ] One OfflineBanner SoT
- [ ] `npm run verify` green

### P3 — Durable requests (ask-first)

Only if P1 miss-rate remains unacceptable. Possible shapes: server claim row, outbox for request delivery. **Do not implement in Sessions 0–3.**

---

## 5. File touch inventory

| Area | Paths |
|---|---|
| **New (P0)** | `src/components/station/CaptureUploadStatus.tsx` (or agreed sibling) + adapter hook + tests |
| Queues | `src/components/mobile/receiving/PhotoUploadQueue.ts`, `…/packer/PackerPhotoUploadQueue.ts`, `…/unit/UnitPhotoUploadQueue.ts` |
| Toaster | `src/components/mobile/receiving/PhotoUploadToaster.tsx`, `src/app/m/layout.tsx` |
| Bridges | `src/lib/realtime/receiving-photo-request.ts`, `ReceivingPhotoRequestCamera.tsx`, `UnitPhotoRequestCamera.tsx`, `PackSendToPhoneButton.tsx`, `ReceivingShareToPhoneSheet.tsx`, `useUnitPhotoRequestPublisher.ts`, `usePhotoRequestPublisher.ts` |
| Refresh | `src/hooks/useReceivingPhotosRealtimeRefresh.ts`, `usePackerPhotosRealtimeRefresh.ts`, `useUnitPhotosRealtimeRefresh.ts` |
| Desktop mounts | `ReceivingPhotoButton.tsx`, pack identity / `PackSendToPhoneButton.tsx`, claim picker if in scope |
| Chrome (P2) | `src/components/layout/OfflineBanner.tsx`, station/mobile OfflineBanner variants, `src/contexts/AblyContext.tsx` |
| Channels / publish | `src/lib/realtime/channels.ts`, `src/lib/realtime/publish.ts`, `src/app/api/realtime/token/route.ts` |
| Feedback peer | `src/components/station/ActiveOrderScanFeedback.tsx` |
| Laws / docs | `.claude/rules/display/station.md`, this prompt, INDEX, optional D7 doc remediation |

---

## 6. Acceptance checklist (all sessions)

- [ ] One visibility compound; ≥2 station domains mounted (P0)
- [ ] `retry()` reachable without DevTools (P0)
- [ ] Toast not sole completion signal (P0+)
- [ ] Pairing waiting/unreachable on Receiving + Pack (P1)
- [ ] OfflineBanner reflects Ably degraded (P2)
- [ ] No SSE / new bus / outbox expansion
- [ ] Station density readable @ ~3 ft
- [ ] Motion via SoT; reduced-motion respected
- [ ] `npm run verify` green
- [ ] User owns commit; no server restart

---

## 7. Suggested P0 Claude kickoff (≤40 lines — lean default)

Use after Session 0 if Gemini did not supply a replacement:

```
Implement Session 1 (P0) from
docs/todo/station-realtime-capture-visibility-CLAUDE-CODE-PROMPT.md only.

Ship CaptureUploadStatus under src/components/station/ + adapter over
PhotoUploadQueue and PackerPhotoUploadQueue. Mount on Receiving (mobile return
surface + desktop photo strip) and Pack send-to-phone / packer photo path.
Wire retry() on failed. Demote PhotoUploadToaster to echo. No Ably/SSE/outbox
changes. No Unbox-only fork. Motion via @/design-system/motion. Attach :3050;
npm run verify; user owns commits.
```

---

## 8. Out of scope

- Replacing Ably with SSE
- Expanding `realtime_outbox` to photo requests (P3 ask-first)
- Redesigning capture stack geometry (owned by capture-stack plan)
- Photo stage / evidence policy (photo-evidence program)
- DOC-CATALOG portfolio indexing unless separately asked
- Committing / pushing unless the user asks
