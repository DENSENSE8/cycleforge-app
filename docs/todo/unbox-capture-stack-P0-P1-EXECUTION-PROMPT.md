# EXECUTION PROMPT — Unbox Capture Stack · Phases 0 + 1

> Paste everything below the line into a fresh session at the repo root
> (`/Users/icecube/repos/cycleforge-app`).
>
> **Plan SoT:** [`docs/todo/unbox-capture-stack-PLAN.md`](./unbox-capture-stack-PLAN.md)
> — if this prompt conflicts with the plan, **the plan wins** (unless the human overrides in chat).

---

# Cycle Forge — Capture Stack, Phases 0 + 1

You are Claude Code in the Cycle Forge monorepo. Two phases, both **pure refactors with zero intended UX change**. Do not start Phase 2+; do not build the timeline UI; do not touch `LineEditPanel`.

## Mission (one line)

**Phase 0:** delete a dead serial-scan tail from the receiving sidebar.
**Phase 1:** promote the mobile feed module into the design system as **`CaptureStack`** — the house bottom-anchored capture primitive that all stations will migrate onto — with behavior byte-identical across its five existing consumers, plus a guard pinning the bottom-anchor contract.

## Read first, in this order

1. **`docs/todo/unbox-capture-stack-PLAN.md`** — SoT for this run. Memorize §1 (motion scan), §2 (promote-don't-build), §8 (corrections).
2. **`AGENTS.md`** + **`CLAUDE.md`** — hard laws.
3. **`.claude/rules/pattern-evolution.md`** — compose → grow → compound; the fork ban.
4. **`.claude/rules/verify.md`** — ratchets only shrink.
5. **`.claude/rules/build-gotchas.md`** — single framer-motion major.

---

## PHASE 0 — remove the dead serial tail

### Established facts (verified — do not re-derive)

- `submitSerialScan` in `src/components/sidebar/receiving/useSerialScan.ts:60` has **zero call sites** in `src/`.
- `ReceivingSidebarPanel.tsx` renders **no serial input** — no `<input>`, no `SerialCard`, no `TextField`. It consumes only `returns` / `dismissReturn` for `ReceivingReturnBanner` (`:273`, `:325`).
- This is therefore **hygiene, not behavior change.** Do not claim in the commit message that it "enforces a single input locus" — it was already single.

### Do

1. In `useSerialScan.ts`, delete: `submitSerialScan`, `serialInput`, `setSerialInput`, `serialSubmitting`, `pendingCandidates`, `setPendingCandidates`, `resetSerialInputs`, the `printOnScan` localStorage read, the `printProductLabel` import, and the `POST /api/receiving/scan-serial` call. Remove now-orphaned imports.
2. **Keep** `returns`, `dismissReturn`, `clearReturns`, and `serialInputRef`.
3. Rename the file + hook → `useReceivingReturnsBanner` / `src/components/sidebar/receiving/useReceivingReturnsBanner.ts`. Update its doc comment to describe what it actually does.
4. Update `ReceivingSidebarPanel.tsx` (`:9` doc line, `:53` import, `:99-104` destructure) and any type in `scan-types.ts` that referenced the removed members.
5. **Keep `serialInputRef` in `scan-types.ts` and keep `scan-apply.ts:74-80` as-is.** It is a no-op today; Phase 3 attaches a real input to it. Add a one-line comment saying so — do not delete it as dead code.

### Do NOT

- Do **not** delete `armedLineId` / `usePoContext`. It is shared: `usePoContext.ts:36-57`, `scan-apply.ts:273`, `useTrackingScan.ts:163/552/646`.
- Do **not** delete the `/api/receiving/scan-serial` route. It stays for mobile and Phase 3.
- Do **not** touch `ReceivingReturnBanner`.

### Phase 0 done when

`npm run verify` is green and `grep -rn "submitSerialScan" src/` returns nothing.

---

## PHASE 1 — promote the feed module to `CaptureStack`

### What moves (as ONE unit)

The bottom-anchor behavior lives in **two files**. Splitting them breaks the pattern.

| From | To |
|---|---|
| `src/components/mobile/feed/MobileFeed.tsx` | `src/design-system/components/capture-stack/CaptureStack.tsx` |
| `src/components/mobile/feed/useMobileFeed.ts` | `src/design-system/components/capture-stack/useCaptureStack.ts` |
| `src/components/mobile/feed/MobileRowCard.tsx` | `src/design-system/components/capture-stack/CaptureStackRow.tsx` |

Keep `src/components/mobile/feed/rows/` (`ScanResultRow`, `PendingOrderRow`) where they are — those are **domain rows**, not the primitive.

### Renames

| Old | New |
|---|---|
| `MobileFeed` | `CaptureStack` |
| `MobileFeedProps` / `MobileFeedRowContext` | `CaptureStackProps` / `CaptureStackRowContext` |
| `useFeedWindow` | `useCaptureStackWindow` |
| `useMobileFeedQuery` | `useCaptureStackQuery` |
| `MobileRowCard` | `CaptureStackRow` |

Export from `src/design-system/components/index.ts` (the barrel; 46 exports today).

### Behavior contract — must remain byte-identical

Do not "improve" any of this while moving it. It is the contract Phases 2–6 depend on:

- `expandLast` default `true`; last row `'expanded'`, all others `'collapsed'` (`MobileFeed.tsx:24`, `:88`).
- The `mt-auto` spacer that pins short lists to the bottom (`:71-77`) — **keep the explanatory comment**, it documents why `flex-col-reverse` is wrong.
- `LayoutGroup` + `layout="position"` + spring `{ damping: 28, stiffness: 340, mass: 0.55 }` (`:81-105`).
- `useReducedMotion()` → `layout={false}`, `initial={false}`, `duration: 0` (`:59`, `:100-104`).
- `anchor: 'bottom'` reverses row order (`useMobileFeed.ts:68-69`).
- **Auto-scroll to bottom** — `scrollTo({ top: scrollHeight })`, `'auto'` on first paint / `'smooth'` after (`useMobileFeed.ts:72-85`). This already exists; do not rewrite it.
- `freshPulse`, `limit`, `getId` defaults unchanged.

### Five consumers to update (all must behave identically)

1. `src/components/mobile/packer/MobilePackingList.tsx:7-8, 36, 54`
2. `src/components/mobile/receiving/MobileReceivingList.tsx:26-27, 142, 194`
3. `src/components/mobile/redesign/PickQueue.tsx:14-16, 35, 39`
4. `src/components/mobile/redesign/Receive.tsx:17-19, 276, 404`
5. `src/components/mobile/redesign/UniversalScan.tsx:18-20, 157, 226`

Plus `CaptureStackRow` consumers: `MobilePackingRow.tsx:8, 51, 110`, `MobileReceivingRow.tsx:17, 97, 224`.

### New guard — `src/design-system/components/capture-stack/capture-stack.guard.test.ts`

Follow the house guard shape (see `src/components/ui/station-motion-bridge.guard.test.ts`). Assert:

1. `CaptureStack.tsx` contains the `mt-auto` bottom-pin spacer.
2. It does **not** contain `flex-col-reverse` (§2.1 — order and auto-scroll are solved elsewhere; this would double-solve and break a11y).
3. `expandLast` defaults to `true`.
4. `useCaptureStackWindow` still performs the bottom auto-scroll (`scrollHeight`).
5. It routes reduced motion (`useReducedMotion`).
6. **No `gsap` / `motion/react` / `moti` import** anywhere under `capture-stack/`.

Register it in the `test:ds-guards` script in `package.json` alongside the other DS guards.

### Motion-bridge compliance

`station-motion-bridge.guard.test.ts` pins primitives that own entrance motion to `useMotionPresence` / `useMotionTransition`. `CaptureStack` currently hand-rolls its variants inline with `useReducedMotion()`.

**Do not refactor that in Phase 1.** It is compliant in effect (it honors reduced motion) and changing it risks the byte-identical requirement. Instead: add a `TODO(capture-stack)` comment noting the bridge migration, and raise it in your report. Migrating to the bridge is Phase 2 work, done with the guard list updated in the same commit.

### Do NOT

- Do **not** add `gsap`, `moti`, `react-spring`, or `motion/react`. `motion-major.guard.test.ts` runs in CI and will fail. GSAP is quarantined to `src/components/ui/card-fan-carousel.tsx` (an image fan) and stays there.
- Do **not** create `StationTimelineShell` or `UnboxStepTimeline`. That is the fork this promotion exists to prevent.
- Do **not** change any visual output. If a screenshot would differ, you have gone too far.
- Do **not** touch `LineEditPanel`, `PoLinesAccordion`, `ActiveLineConditionSerial`, `station.md`, or any station rule file.
- Do **not** raise any ratchet baseline.

### Phase 1 done when

- `npm run verify` green.
- `grep -rn "MobileFeed\|useFeedWindow\|MobileRowCard" src/` returns nothing outside comments.
- The new guard passes and is wired into `test:ds-guards`.
- All five consumers render unchanged — verify at least `Receive.tsx` and `MobileReceivingList.tsx` against the dev server on **`:3050`** (attach; **never start, restart, or kill it** — `.claude/rules/workflow-safety.md`).

---

## Report back

1. Confirm `submitSerialScan` had zero call sites (or correct me).
2. The exact five-consumer diff summary.
3. Whether `station-motion-bridge.guard.test.ts` needed a new entry.
4. Any behavior you could not keep byte-identical, and why.
5. Anything in the plan you believe is wrong.

Commit only when asked. Stage only files you changed — other sessions share this tree.
