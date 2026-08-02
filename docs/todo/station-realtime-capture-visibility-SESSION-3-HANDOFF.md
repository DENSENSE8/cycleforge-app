# Session 3 handoff — P2 connection chrome

**Date:** 2026-08-02  
**Program:** [`station-realtime-capture-visibility-INDEX.md`](./station-realtime-capture-visibility-INDEX.md) ·
[`station-realtime-capture-visibility-CLAUDE-CODE-PROMPT.md`](./station-realtime-capture-visibility-CLAUDE-CODE-PROMPT.md)  
**Prereqs:** Sessions 0–2 done; `npm run verify` **PASSED** at handoff time.  
**Locked rulings in scope:** **D4** (OfflineBanner owns Ably degraded state; no per-bench strip) · **D12** (Monitor/TV read-only connection status, never upload modals).

This file exists because P2's spec rests on a premise that **is not true of the
current code**, and because the obvious implementation re-triggers a documented
production incident. Read §2 and §3 before writing anything.

---

## 1. What Sessions 1–2 already built (do not rebuild)

| Surface | Where | Answers |
|---|---|---|
| Capture upload status | `src/components/station/capture-upload/` | "what happened to the photo I took" — queued / uploading / failed(+Retry) / committed |
| Send-to-device handshake | `src/lib/realtime/device-handshake.ts` + `src/components/station/send-to-device/` | "did a phone hear me" — Waiting / Open on your phone / Unreachable(+Retry) |

P2 answers the **third, different** question: *is this station's realtime link
healthy at all?* Keep them separate. A dropped Ably connection is not an upload
failure and not an unreachable phone, and collapsing any two of the three makes
one of them undiagnosable.

Both existing compounds are presentational, take plain props, and are registered
in `src/components/ui/station-motion-bridge.guard.test.ts`. Follow that shape.

---

## 2. TRAP #1 — D4's premise is false: there are FOUR offline surfaces

D4 says *"OfflineBanner owns Ably degraded state — no per-bench strip."* That
reads as though one component exists. Measured 2026-08-02:

| # | File | Mounted by | Basis |
|---|---|---|---|
| 1 | `src/components/layout/OfflineBanner.tsx` | `src/app/layout.tsx:109` — **the live global one** | `navigator.onLine` + `useOfflineWriteQueue().depth` |
| 2 | `src/components/mobile/OfflineBanner.tsx` | `src/design-system/components/mobile/MobileShell.tsx:88` | `navigator.onLine` (own reconnect toast) |
| 3 | `src/components/station/OfflineBanner.tsx` | **NOTHING** | `navigator.onLine` + a Retry button |
| 4 | `src/features/operations/workspace/OperationsTvBoard.tsx:42` | inline, not a component | `navigator.onLine` |

Three of the four are already the twin-for-one-job that the SoT rules ban, and
#4's own comment admits it "reused OfflineBanner's semantics inline."

**So the first decision in Session 3 is consolidation, not Ably.** Wire the new
degraded state into any single one of these and the other three keep telling the
operator the old, now-incomplete story — a bench showing "online" while the
station's realtime link is dead is worse than no banner, because it is
confidently wrong.

Specific notes:

- **#3 is dead code.** It is imported by nothing; the only reference in the repo
  is the motion-bridge guard allowlist (`station-motion-bridge.guard.test.ts:22`),
  which is what has kept it looking alive. **Deleting it is in scope** — remove
  its guard entry in the same change. It also imports `lucide-react` directly,
  which violates the icon SoT (`@/components/Icons`), so it should not be the
  one you keep.
- **#1 is the real SoT** — it is the app-root mount and the only one that knows
  about the offline write queue. Grow this one.
- **#4 is a Monitor surface and D12 applies**: read-only status, never an
  upload/pairing modal. It may compose the shared state *hook*, but a TV wall
  40 feet away needs its own scale — do not force the desk banner's geometry
  onto it.
- **#2 may legitimately survive** as the mobile-shell placement of the same
  state, but it must read from the shared source, not its own listener.

Deciding to keep more than one *placement* is fine. Keeping more than one
*source of truth* for "are we degraded" is the thing to eliminate.

---

## 3. TRAP #2 — do NOT widen the `AblyContext` value (documented incident)

`src/contexts/AblyContext.tsx` exposes exactly one thing:

```ts
interface AblyContextValue {
  getClient: () => Promise<any | null>;
}
```

`getClient` is a `useCallback` with empty deps, and the file carries this comment:

> Without this, every parent re-render minted a new `getClient` → new context
> value → all consumer effects that listed `getClient` in their deps re-fired,
> which is how the packer wizard publish-state effect ended up **flooding Ably at
> >1000 msg/s**.

**`useAblyClient()` has 23 consumers.** Adding `connectionState` to that same
context value makes the value change on *every* connection transition
(`connecting → connected → disconnected → suspended …`), which re-renders all 23
and re-fires exactly the effects that comment is about. That is the single most
likely way to turn P2 into an outage.

**Do instead:** publish connection state through a channel that does not disturb
the existing value — a separate context/provider, or (preferred, and consistent
with how the capture queues are read) a module-level store consumed via
`useSyncExternalStore`, subscribed with `client.connection.on(...)`. Surfaces
that only render status then re-render on transitions; the 23 `getClient`
consumers do not.

Also note: the client is created inside a `useEffect` via dynamic
`import('ably')` and held in a **ref**, not state — so there is no existing
render-visible signal to hang off. Connection state must be lifted deliberately,
and it must have an honest value *before* the client resolves (treat pre-init as
`connecting`/unknown, never as `connected`).

---

## 4. Copy discipline — the thing that makes or breaks P2

The banner must distinguish **browser offline** from **realtime degraded**, in
words an operator can act on at ~3 ft, without Ably jargon.

- Browser offline: the existing copy is fine — the device has no network.
- Realtime degraded: something like **"Station sync paused"** — the app works,
  scans still record, but live updates and phone pairing are not flowing.
- **Never** surface `suspended` / `connecting` / channel names / error codes to
  an operator. `docs/integrations/realtime-ai.md` is where the mechanism is
  documented; the banner is where the *consequence* is stated.

**Debounce the transient.** Ably reconnects routinely. A banner that flashes on
every blip trains operators to ignore the one signal that matters when the link
is genuinely down — the same failure mode this whole program exists to close.
Hold a short grace period before showing degraded (and prefer `suspended` over
first `disconnected` as the trigger); clear it promptly on recovery.

---

## 5. Guards, gates, and where things live

- **Motion:** any new/animated banner registers in
  `src/components/ui/station-motion-bridge.guard.test.ts` (`REQUIRED_BOTH`) and
  routes presets through `useMotionPresence` / `useMotionTransition`. The two
  P0/P1 compounds are already listed there as examples.
- **Z-index:** `zIndex.banner = 350` already exists — the global banner uses the
  `z-banner` band. Never hardcode.
- **Icons:** `@/components/Icons`, never `lucide-react` directly.
- **Tests:** put the degraded-vs-offline decision in a **pure** module with unit
  tests (the pattern both prior sessions used: `capture-upload-model.ts`,
  `device-handshake.ts`). Debounce/precedence logic is exactly the kind of thing
  that should not be provable only by clicking.
- **Gate:** `npm run verify` green. Never raise a ratchet baseline.

---

## 6. Environment realities (cost prior sessions real time)

- **Dev server:** the operator's runs on **`:3050`** — attach, never start /
  restart / kill. It is **auth-gated**: `/m/*` and desk routes redirect to
  sign-in, so browser verification of these surfaces is limited unless the
  operator provides a signed-in session. Prior sessions verified via typecheck /
  lint / unit tests and said so plainly. Do the same rather than claiming visual
  confirmation you did not get.
- **The tree moves under you.** A concurrent session is editing and committing
  the same checkout, sometimes with `git add -A` — Session 1's files were swept
  into commit `92fdb3593` (an unrelated unbox change). Stage only your own
  files; expect `knip` findings and typecheck errors that are not yours, and
  attribute them (`git status` / `git log -- <path>`) before fixing.
- **An automated dead-export pass strips `export`** from new symbols that
  nothing imports yet. It silently de-exported five symbols in
  `device-handshake.ts` mid-session and broke its tests. If a new module's
  exports vanish, that is what happened — re-export and make sure a consumer or
  test references them.

---

## 7. P2 gate (from the program prompt)

- [ ] Ably drop is visible while `navigator.onLine === true`
- [ ] **One** OfflineBanner SoT (see §2 — this is the real work)
- [ ] Monitor/TV shows read-only status; no upload/pairing modals (D12)
- [ ] Distinct, jargon-free copy for offline vs degraded; transient blips debounced
- [ ] `AblyContext`'s existing value is unchanged (§3)
- [ ] `npm run verify` green

---

## 8. Paste-ready kickoff

```text
Implement Session 3 (P2 connection chrome) of the station realtime + capture
visibility program. Read, in order:

  docs/todo/station-realtime-capture-visibility-SESSION-3-HANDOFF.md   ← start here
  docs/todo/station-realtime-capture-visibility-CLAUDE-CODE-PROMPT.md  §Phases Session 3, §Locked D4/D12
  .claude/rules/display/station.md                                     §8 station-down

GOAL
1. Expose Ably connection state WITHOUT changing the existing AblyContext value
   (23 consumers; a documented >1000 msg/s incident — handoff §3). Separate
   provider or a useSyncExternalStore module store.
2. Consolidate the FOUR offline surfaces onto one source of truth (handoff §2):
   layout/OfflineBanner (keep + grow) · mobile/OfflineBanner (placement, shared
   source) · station/OfflineBanner (DEAD — delete + drop its motion-guard entry)
   · OperationsTvBoard inline (Monitor, read-only per D12).
3. Show browser-offline vs realtime-degraded distinctly, in operator language
   ("Station sync paused" class, no Ably jargon), debounced against routine
   reconnects.
4. Put the degraded/offline precedence + debounce in a PURE module with unit
   tests.

HARD LAWS
- AGENTS.md + .claude/rules/display/station.md; motion only via
  @/design-system/motion + the reduced-motion bridge; register any animated
  banner in station-motion-bridge.guard.test.ts
- Icons from @/components/Icons (never lucide-react); z from the z-index scale
- No second realtime bus, no SSE, no outbox expansion (P3 is ask-first)
- Attach :3050; never start/restart/kill the dev server; it is auth-gated
- The tree has concurrent work — stage only your own files, attribute failures
- npm run verify before done; never raise a ratchet baseline
```

---

## 9. Out of scope

- P3 durable photo requests (claim row / outbox) — **ask-first**, unmeasured.
- Reworking the capture-upload or send-to-device surfaces from Sessions 1–2.
- The D5 queue-engine consolidation (three near-identical upload queues) — still
  open, still deferred; see the prompt's §1 D5 note.
- Committing or pushing. The operator owns commits.
