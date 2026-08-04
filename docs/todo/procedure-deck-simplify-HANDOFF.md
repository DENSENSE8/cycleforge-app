# Procedure deck Smart Stack — simplify · HANDOFF

**Date:** 2026-08-03 · **Lane:** dogfood / `main` worktree · **Status:** DONE — flat foundation (no peek / layout motion)  
**Priority:** Fix the Unbox centre work surface so it is legible and calm again.

**Binding rules (after this handoff amends them):**  
[`.claude/rules/display/station-workbench.md`](../../.claude/rules/display/station-workbench.md) → *Procedure Focus Deck*  
[`.claude/rules/display/station.md`](../../.claude/rules/display/station.md) → Procedure cockpit  
[`.claude/rules/source-of-truth.md`](../../.claude/rules/source-of-truth.md) → Procedure views row

**Do not** continue the space-budget / crown-scrub / sticky-anchor feature pile. That path produced ghosting, width dip, crushed mid-cards, focus traveling, and runtime `PROCEDURE_STEP_FACE_REM is not defined`. **Simplify.**

---

## 0. Prompt (paste to the next agent)

```text
You are fixing Cycle Forge Unbox ProcedureDeck. It was overbuilt into a
"space-aware Smart Stack" (layoutProcedureStack, crown scrub, top-compress,
sticky focus, multi-mode full/peek/covered). Visually broken: crushed/ghosted
mid-cards, inconsistent gaps, focus not reliably against the dock.

GOAL: Make it much simpler. Prefer a calm, readable deck over Apple Watch
fidelity.

SIMPLER TARGET (ship this, not more motion):
1. Every step stays mounted in vocabulary order (no filter/sort — still law).
2. ONE focused step: its face + its evidence body (however the current nesting
   works — keep eyebrow+body if already shipped, but ONE clear active card).
3. History ABOVE focus = full-height face rows with normal gaps (mt-3). No
   history pile, no history peek, no covered history, no sticky.
4. Queued BELOW focus = at most ONE peek sliver (negative margin pull-up,
   full column width, NO scale). Everything after that peek is covered:
   invisible + zero flow (h-0), pointer-events-none, aria-hidden.
5. Host StationWorkbench owns scroll (bodyAlign=end). Deck adds NO overflow-*,
   NO nested scrollport, NO sticky, NO scroll-linked compress.
6. Optional: hover-armed wheel still advances focus via onSelectStep (Digital
   Crown). If wheel path is buggy, DELETE scrub paint and keep click + pager +
   checklist only — simpler is better.
7. Delete or stop calling layoutProcedureStack capacity math. Replace with
   fixed geometry: history=full, focus=full(+body), queued=one peek + covered.

AMEND SoT in the same change to match (station-workbench.md Procedure Focus
Deck invariants): remove "space-aware N full cards", "sticky bottom-anchored
focus", "host-scroll top-compress", "history peek pile". Restore: full-title
history rows in flow; exactly one queued peek; covered invisible.

FILES:
- src/design-system/components/procedure/ProcedureDeck.tsx  (main simplify)
- src/design-system/components/procedure/procedure-stack-layout.ts  (delete
  or reduce to peek pull-up helpers only — no availableRem budget)
- procedure-deck-order.guard.test.ts + procedure-stack-layout.test.ts (rewrite
  to the simple contract)
- .claude/rules/display/station-workbench.md (+ source-of-truth / station.md
  one-liners if they still advertise space-aware stack)

ACCEPT:
- No ghost labels through cards; no crushed mid-row; no stair-step width inset.
- Focus card sits next to the pager/dock (bottom of the deck content); history
  reads as a normal list above.
- npm run verify passes (at least --fast while iterating; full before done).
- Do not raise DS/knip baselines. Do not restart the :3050 dev server.
```

---

## 1. What’s wrong (symptoms)

From live Unbox screenshots (2026-08-02 → 2026-08-03):

| Symptom | Likely cause |
|---|---|
| Ghost label / icon through a card (e.g. Packing material through The box) | Covered cards painted at peek opacity / shared scale |
| Stair-step narrower edges under focus | `scale-[0.97]` on peeks/covered |
| Crushed mid-card (“Contents” pinched between full faces) | Negative margin pull-ups + space-budget modes fighting each other; sticky + scroll |
| Focus “traveling” mid-column | FULL cards allocated **below** focus; scrollIntoView / sticky fights justify-end |
| `PROCEDURE_STEP_FACE_REM is not defined` | Const renamed to `PROCEDURE_STACK_FACE_REM` while stale Turbopack chunks / leftover refs still used the old name |
| Hard to reason about | Too many systems: `layoutProcedureStack(availableRem)`, crown scrub DOM paint, top-compress, sticky, history peek + queued peek, covered zero-flow |

**Root cause:** treating watchOS Smart Stack as a product requirement on a scan bench. The bench needs a **legible procedure**, not a collision compressor.

---

## 2. Simpler contract (the only geometry)

```text
┌─────────────────────────────────────┐
│  History faces (full height, mt-3)  │  ← as many as exist; always readable
│  History faces …                   │
│  ┌───────────────────────────────┐  │
│  │ FOCUS face (+ evidence body)  │  │  ← one; sits at bottom of deck content
│  └───────────────────────────────┘  │
│  ░░░ queued peek sliver ░░░░░░░░░  │  ← exactly one; full width; no scale
│  (covered queued — invisible)       │
└─────────────────────────────────────┘
         ↑ adjacent to pager / dock
```

**Hard laws that stay:**

- HIDING / RE-SORTING banned — every step mounted, vocabulary order  
- Deck is content, not a viewport — no nested `overflow-*`  
- Transform + opacity only for any remaining motion; no layout animation on step advance  
- Checklist + pager remain reachability for covered queued steps  
- `orgId` / scan focus handoff unchanged (adapter still returns focus to scan bar)

**Laws to revert in SoT (this change):**

- Space-aware `availableRem` full-card budget  
- History peek / covered history pile  
- Sticky bottom focus  
- Host-scroll top-compress paint  
- Crown in-notch scrub (optional delete if it fights simplicity)

---

## 3. Implementation sketch

### 3.1 `ProcedureDeck.tsx`

- For each index relative to `activeIndex`:
  - `index < active` → history face, `mt-3` if `index > 0`, always visible  
  - `index === active` → focus (face + body); **not** sticky  
  - `index === active + 1` → peek (`marginTop: -(FACE - PEEK)rem`, opacity soft, `z` under focus)  
  - `index > active + 1` → covered (`invisible opacity-0 h-0 overflow-hidden`, no button)  
- Remove: `availableRem` state, `ResizeObserver` budget, sticky classes, top-compress effect, scrub paint (or keep wheel→`onSelectStep` only with no interim DOM transforms).  
- Keep: `motion-safe:` settle on opacity if peeks change; evidence crossfade via existing `swap.scan` if still present.

### 3.2 `procedure-stack-layout.ts`

Prefer **delete** and inline the three-line margin math, **or** shrink to:

```ts
export function queuedPullUpRem(depth: 1 | 'covered', faceRem, peekRem): number
```

No `availableRem`, no `allocateFullBesideFocus`.

### 3.3 Guards

Rewrite `procedure-deck-order.guard.test.ts` to assert the simple contract:

- `steps.map` only (no filter/sort/slice)  
- one queued peek (`depth === 1` or `index === activeIndex + 1`)  
- covered = invisible + zero flow  
- no `sticky`, no `layoutProcedureStack(` / no `availableRem`  
- no `overflow-y-auto` / `snap-y` on the deck  
- `PROCEDURE_STEP_FACE_HEIGHT` / rem constants agree  

### 3.4 SoT amend (same PR / same session)

In `station-workbench.md` *Procedure Focus Deck* invariants, replace space-aware / sticky / top-compress / history-peek bullets with the simple contract in §2. Update the Procedure views one-liner in `source-of-truth.md` if it still names `layoutProcedureStack` capacity.

---

## 4. Out of scope

- Redesigning the dock / pager / checklist  
- New motion roles or Motion+ toast-stack ports  
- Flatten-on-hover  
- Multi-layer translucent peeks  
- Nested scroll snap on the deck  
- Raising knip / DS ratchet baselines  

---

## 5. Verify

```bash
node --import tsx --test \
  src/design-system/components/procedure/procedure-deck-order.guard.test.ts
npm run verify -- --fast   # while iterating
npm run verify             # before calling done
```

Bench check on Unbox (attach to `:3050`, do not restart): open a carton with several pending steps — history readable, one peek under focus, no ghost/crush, focus above pager.

---

## 6. Files checklist

| Path | Action |
|---|---|
| `src/design-system/components/procedure/ProcedureDeck.tsx` | Simplify geometry |
| `src/design-system/components/procedure/procedure-stack-layout.ts` | Delete or gut |
| `src/design-system/components/procedure/procedure-stack-layout.test.ts` | Delete or rewrite |
| `src/design-system/components/procedure/procedure-deck-order.guard.test.ts` | Rewrite to simple contract |
| `src/design-system/components/procedure/index.ts` | Drop dead exports |
| `.claude/rules/display/station-workbench.md` | Amend Focus Deck invariants |
| `.claude/rules/source-of-truth.md` / `display/station.md` | Align one-liners |

Adapter `UnboxProcedureDeck.tsx` should need little or no change if the DS deck API stays `steps / activeKey / face / renderActive / onSelectStep`.
