# Welded feedback panel — port from Unbox to the sibling stations

**Status:** plan · Unbox (P0) shipped 2026-08-21, nothing else built · **Created:** 2026-08-21
**Golden surface:** Unbox — [`LineEditPanel.tsx`](../../src/components/receiving/workspace/LineEditPanel.tsx)
**Governing laws:** [`AGENTS.md`](../../AGENTS.md) → region contracts · [`pattern-evolution.md`](../../.claude/rules/pattern-evolution.md) → compose → grow → compound, and *golden-first* · [`kinetic-ledger.md`](../../.claude/rules/kinetic-ledger.md) → law 1 (facts drive chrome)
**Recipes this touches:** [`display/unbox-station.md`](../rules/display/unbox-station.md) · [`display/station.md`](../rules/display/station.md) · [`display/workbench-service.md`](../rules/display/workbench-service.md)

---

## 0. What this builds, in one paragraph

Unbox's terminal verdict is now a **welded panel**: a state strip that shares one
silhouette with the notes composer below it, hinges up out of the composer's top
edge, and holds one truncated line plus its actions. It replaced a bottom-right
toast, because feedback belongs where the operator's eyes already are. **Every
sibling station still toasts.** Arrival's "Could not save for unbox", Testing's
"Marked as listed", Support's send confirmation — all of them fire into the
corner of a screen the operator is not looking at, on a bench where they are
holding product. This plan moves the station-neutral half of the panel into the
design system and ports it station by station, golden-first, retiring each
station's toasts in the same change that gains it the panel.

**What this is NOT:** a generic "feedback component" with a config object. The
panel is station-neutral; **what it says is not.** Each station derives its own
phase steps from its own facts, and a station that cannot name a fact does not
get a ticker.

---

## 1. What exists today

| Station | Composer | Terminal verb | Verdict surface today | Gap |
|---|---|---|---|---|
| **Unbox** | `WorkspaceNotesCard` (raised) | Print · Receive | **Welded panel** — 4 tones, real-phase ticker, ⓘ replay | — (golden) |
| **Arrival / Triage** | `ArrivalCartonNotesEntry` → same dock | Save for unbox | `toast.success` / 4 × `toast.error` ([TriagePanel.tsx:246-281](../../src/components/receiving/triage/TriagePanel.tsx)) | No inline verdict at all |
| **Testing** | `WorkspaceNotesCard` ([TestingPanel.tsx:428](../../src/components/tech/TestingPanel.tsx)) | QC verdict · Mark as listed | 3 × toast ([:189](../../src/components/tech/TestingPanel.tsx), [:343](../../src/components/tech/TestingPanel.tsx), [:349](../../src/components/tech/TestingPanel.tsx)) | Same |
| **Support** | `SupportChatComposer` / `SupportTicketComposerDock` | Send reply | toast | Different region (Workbench `service-workspace`) |
| **Mobile receiving** | native sheet, no dock | Complete carton | own sheet + `foldSyncVerdict` | Already has a *better* reconciler than desktop — see §4 |
| **Kiosk v2** | `counterCorner()` scale | Submit | own face | **Excluded** — see D8 |

Both Arrival and Testing already mount `WorkspaceActionFeedbackSlot` for
*non-terminal* saves (item description, PO note). So the inline slot exists on
those stations; what is missing is the terminal verdict, and the weld.

---

## 2. Locked decisions

| # | Decision | Why |
|---|---|---|
| **D1** | **The weld is a contract between a panel and a dock, not a component pair.** A station qualifies for `WeldedFeedbackPanel` only if its terminal verb sits on an `OmnichannelComposerDock`. A surface with no dock (Monitor blocks, Workbench grids, the right rail) gets `InlineActionFeedbackCard` — the same tones, no weld. | `weldTop` flattens a *specific* shell's radius. Welding to something that is not that shell means inventing a second weld contract, which is the fork the SoT bans. |
| **D2** | **One tone machine, repo-wide: `INLINE_ACTION_FEEDBACK_TONE`.** A ported station never writes a local hue map. `ReceiveResponsePanel`'s private `toneStyles` (emerald/amber/rose, [:66](../../src/components/receiving/workspace/ReceiveResponsePanel.tsx)) is deleted as part of P1 — it is the last surviving copy. | Four states existed and only two had names; that is how the other two got hand-rolled. A fifth copy would restart the drift. |
| **D3** | **Phase steps are DERIVED, per station, in that station's own module.** There is no shared ticker and no shared string list. A station's `*-phase-steps.ts` follows the same law as [`receive-phase-steps.ts`](../../src/components/receiving/workspace/receive-phase-steps.ts): every string is a fact the client holds, and a phase with one fact gets one step, not a script. | This is the whole reason the panel is honest. A generic ticker with configurable strings is a scripted ticker with extra steps — it makes inventing narration the default. |
| **D4** | **One reconciler, and failure is STICKY.** `foldSyncVerdict` ([complete-carton.ts:80](../../src/components/mobile/receiving/complete-carton.ts)) becomes the shared fold; the desktop's last-verdict-wins is deleted. | Desktop is wrong today — see §4. The mobile module already documents the correct semantics and nothing else uses them. |
| **D5** | **Golden-first: one station per change, dogfood-verified before the next.** No two ports in one pass. | Same law that governs table-engine fan-out (`pattern-evolution.md` → *Never*). Multi-surface ports in one pass are a named regression class here. |
| **D6** | **The ⓘ replay ports with the panel, keyed to the entity the station owns.** Unbox keys on `receiving_line.id`. Testing keys on the unit; Arrival on the carton. **Never a global "last verdict"** — the panel does not name its subject, so a verdict replayed above a different subject is a lie. | Already built and enforced by the line guard in `LineEditPanel`. The port must carry the guard, not just the feature. |
| **D7** | **Toast retirement happens in the same change as the port, not after.** A station that gains the panel loses its terminal toasts in that PR. | `pattern-evolution.md` law 6: a retirement is not done until the old path is deleted. Two verdict surfaces for one action is worse than either alone. |
| **D8** | **Kiosk v2 is excluded, permanently.** | It is the one customer-facing surface, resolves radius/touch through `counterCorner()` / `COUNTER_*` rather than `cornerClass()`, and its face already strips cost basis. "Inventory sync cooldown — retry in ~42s" is not a sentence to show a customer. |
| **D9** | **Non-terminal saves keep `WorkspaceActionFeedbackSlot`.** The weld is for the verb the operator pressed to finish. | Welding every save turns the composer's top edge into a flicker surface. |

---

## 3. Phase 1 — extract the station-neutral half (no behaviour change)

Everything currently sits under `src/components/receiving/workspace/`, which
makes Testing importing it read as borrowing. Same problem, same fix, as
`StationComposerDock` → `OmnichannelComposerDock` (2026-08-01).

**Moves to `src/components/composer/` (staff mouth reaction SoT):**

| File | Note |
|---|---|
| `inline-action-feedback-tone.ts` | already React-free; the guard test moves with it |
| `WeldedFeedbackPanel.tsx` | the peel, the row, the disclosure, `edgeProgress`, `WeldedStack` |

**Stays in receiving** (domain, not chrome): `ReceiveFeedbackRegion`,
`receive-phase-steps.ts`, `classify-receive-response.ts`, `ReceiveResponsePanel`.

**Also in P1:** delete `ReceiveResponsePanel`'s local `toneStyles` (D2) and
point it at the shared map via `toneFromVerdictHue`.

Motion presets (`framerPresence.weldedPanelPeel`) already live in the DS
catalogue and do not move.

**Done when:** `npm run verify` green, no import of the panel resolves into
`components/receiving/`, and the golden surface is pixel-unchanged.

`InlineActionFeedbackCard` stays in receiving for dockless saves (D9); it imports the shared tone from composer.

---

## 4. Phase 2 — fix the multi-line reconcile (a real bug, ports nothing)

`ReceiveSuccessPanel` settles on **every** matching verdict:

```ts
settle(verdict === 'ok' ? 'confirmed' : 'failed');
```

A carton with lines A and B publishes two `zohoReceive` verdicts. If A **fails**
and B **succeeds**, and A arrives first, the panel ends on `confirmed` — a green
"Confirmed in inventory" for a carton that had a line fail. The mobile module
already names this exact hazard in its docblock and solves it; desktop never
adopted the fix.

**Fix:** lift `foldSyncVerdict` to a shared module, fold instead of overwrite,
sticky failure. It is pure and already unit-tested on the mobile side — extend
those tests rather than writing a second set.

**Do this before any port**, so no station inherits the wrong semantics.

---

## 5. Phases 3–6 — the ports, one per change

Each port is the same five steps. The variable is the phase-step derivation.

1. Write `<station>-phase-steps.ts` + its test (D3). **Start here** — if the
   station has no facts to report, the answer is a static line, and you have
   learned that before building anything.
2. Write `<Station>FeedbackRegion` — the switcher that maps the station's
   result union onto tone + steps + CTA.
3. Mount it in the dock float stack with **no margin**, and pass
   `weldTop={showFeedback}` down the composer chain.
4. Carry the ⓘ replay memory with its entity guard (D6).
5. Delete that station's terminal toasts (D7).

### P3 · Arrival / Triage — smallest, do it first

- Files: [`TriagePanel.tsx`](../../src/components/receiving/triage/TriagePanel.tsx) · [`ArrivalCartonNotesEntry.tsx`](../../src/components/receiving/triage/ArrivalCartonNotesEntry.tsx)
- Verb: **Save for unbox**. Result union today is bare — `handleSaveForUnbox`
  either toasts success or one of four errors. Build the union first.
- Facts available: already-staged (a real distinct state, currently a toast at
  [:246](../../src/components/receiving/triage/TriagePanel.tsx)), no `receiving_id` yet, server error text.
- **No reconcile phase** — nothing async settles after the response. So: no
  ticker, `loading` while in flight with one step, then a settled tone. This is
  the phase-step law paying off; do not add steps to make it feel busier.
- Note grain is `carton`, so the replay memory keys on `receiving.id`.

### P4 · Testing

- File: [`TestingPanel.tsx`](../../src/components/tech/TestingPanel.tsx)
- Verbs: QC verdict slot ([:378](../../src/components/tech/TestingPanel.tsx)) and **Mark as listed** ([:343](../../src/components/tech/TestingPanel.tsx)).
- Two terminal verbs on one dock is new. **Decide before building:** one panel
  that reports whichever verb last ran (replay memory keyed by unit + verb), or
  the panel only serves Mark-as-listed and the verdict slot keeps its own
  in-centre affordance. Lean to the second — the verdict slot is *step work* in
  the centre by that station's own contract, not a terminal.
- Facts: `recordTestVerdict` → `VERDICT_TO_STATUS`, the ticket note write at
  [:349](../../src/components/tech/TestingPanel.tsx) (which currently fails silently into a toast).

### P5 · Support — the generalization test

- Files: [`SupportChatComposer.tsx`](../../src/components/support/zendesk/chat/SupportChatComposer.tsx) · [`SupportTicketComposerDock.tsx`](../../src/components/support/zendesk/chat/SupportTicketComposerDock.tsx)
- Different region contract (Workbench `service-workspace`, not Station), same
  dock. **This is the phase that proves D1 or breaks it.** If the weld needs a
  second contract here, stop and re-plan rather than adding a variant.
- Facts: send → provider ack → Zendesk id. A genuine reconcile window, so this
  is the second station that earns a ticker.

### P6 · Mobile receiving — decide, do not assume

- File: [`complete-carton.ts`](../../src/components/mobile/receiving/complete-carton.ts) + its sheet
- Mobile has no `OmnichannelComposerDock`, so by D1 it does **not** weld. The
  open question is whether its result sheet should compose
  `InlineActionFeedbackCard` for tone parity, or stay native. Answer it with the
  bench, not in this document.

---

## 6. Out of scope / ask first

- **A generic `<FeedbackRegion config={…}>`.** Named in D3 as the anti-goal.
- **Porting `weldTop` to `compact` or `bare` dock density.** Both are already
  square; a weld there is a no-op that reads as a feature.
- **Persisting the ⓘ replay memory** (localStorage / server). It is "what did I
  just do", not an audit trail — the durable record is the carton timeline, one
  click away through the same glyph. Persisting it makes it a second history
  store, which `agent-fs` bans.
- **Reviving the deleted dev tester.** Removed 2026-08-21 at the operator's
  instruction. The scenario fixtures (18 states, incl. the two only reachable via
  a `demoStatus` hatch on `ReceiveResult`) are recoverable at **`308cd4983`** —
  `ReceiveFeedbackTester.tsx` + `receive-feedback-scenarios{,.test}.ts` — if a
  port wants a harness. That is an ask, not a default.

---

## 7. Verification per phase

`npm run verify` is three gates and does **not** catch a forked twin, a page-local
tone map, or a scripted ticker (the hygiene gates were deleted 2026-08-20). So
each phase carries its own checks:

| Check | How |
|---|---|
| Tone map is not forked | grep for `bg-emerald-50` / `bg-amber-50` / `bg-rose-50` outside `design-system/components/feedback/` — should be zero after P1 |
| Steps are derived | the station's phase-step test asserts on what **cannot** appear (see `receive-phase-steps.test.ts` — the zero-descriptions case) |
| Weld holds | measure in Playwright, not the preview pane (`verify.md` → *Measure in the real runner*): panel `border-bottom-width: 0`, composer `border-top-left-radius: 0` while the panel is mounted |
| Truncation holds | 375px viewport, longest headline in the station's union, assert the CTA's right edge is inside the scrollport |
| Reduced motion | `rotateX` absent, height still collapses |
| Toasts are gone | grep the ported file for `toast.` — only non-terminal calls may remain |

E2E goes on `qa-desktop` against `QA_ORG_ID`, never the dogfood tenant.

---

## 8. Open questions

1. **P4** — one panel for two terminal verbs, or leave the verdict slot alone?
   (Recommendation in §P4: leave it alone.)
2. **P5** — does Support's right-rail-adjacent layout leave room for a welded
   strip, or does the composer sit too close to the frame floor
   (`MIN_WORK_SURFACE_PX`)?
3. **P6** — native sheet or shared card on mobile?
