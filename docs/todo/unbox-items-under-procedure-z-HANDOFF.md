# Unbox Items buried under ProcedureDeck · HANDOFF

**Date:** 2026-08-04 · **Lane:** dogfood / current checkout · **Status:** OPEN — display broken  
**Priority:** P0 visual — centre work surface is illegible when scrolled.

**Screenshot (failure):** Items product rows (thumb + title) ghost *between* procedure faces while the faces paint on top. Operator sees “Shipping label / The box / …” floating over the carton contents list.

**False green:** `tests/e2e/unbox-items-sticky.spec.ts` only asserts Items clears the *identity bookmark*. It does **not** assert Items wins the paint war against the procedure. Treat that file as incomplete until the assertions below land red→green.

**Binding rules:**  
[`.claude/rules/display/station-workbench.md`](../../.claude/rules/display/station-workbench.md) ·  
[`.claude/rules/source-of-truth.md`](../../.claude/rules/source-of-truth.md) (z-index tokens · Procedure Focus Deck) ·  
[`src/design-system/tokens/z-index.mjs`](../../src/design-system/tokens/z-index.mjs)

---

## 0. Prompt (paste to the next agent)

```text
You are fixing a P0 Unbox centre-column stacking bug in Cycle Forge.

SYMPTOM (live screenshot): while the workbench scrolls, Unbox Items
(product thumb + title rows) paint UNDER the ProcedureDeck step faces.
Product content ghosts through the gaps between "Shipping label",
"The box", "Packing material", "Contents". Terrible / illegible.

ROOT CAUSE (confirmed in code — verify, then fix):
1. `UnboxItemsPanel` is `sticky top-20 z-base` (z=0) so it stays under the
   floating carton identity (`stationContextBarHostClass` → `z-raised` = 10).
2. `ProcedureDeck` faces are `relative` and the active face uses raw `z-30`
   (same numeric band as token `sticky`). Elevated faces + that z win over
   sticky Items inside the shared scroll port.
3. Result: as the procedure scrolls up through the stuck Items band, faces
   cover the Items list; Items shows only in the gaps between faces.

REQUIRED STACKING LADDER (low → high), named tokens only — never raw z-[N]:
  procedure faces / evidence  <  sticky Items reference  <  floating identity
  (scroll content)               (z-raised or z-sticky)     (must still win)

Do NOT go back to negative margin into the identity band (`-mt-6` was
removed for a reason — it clipped step faces under the bookmark).

LIKELY FIX SHAPE (choose after measuring live stacking contexts):
A. Raise Items sticky above procedure (`z-raised` or `z-sticky`) AND raise
   identity host above Items (`z-sticky` / `z-header`) so identity still
   wins. Update `stationContextBarHostClass` if identity must move.
B. Drop ProcedureDeck's raw `z-30` on the active face (selection is
   outline-only; z bump may be unnecessary) so faces stay at auto/base
   and sticky Items at `z-raised` wins without racing identity.
Prefer the smallest change that restores the ladder. Opaque
`bg-surface-sunken` on Items must continue to shield the deck.

FILES:
- src/components/receiving/workspace/line-edit/UnboxItemsPanel.tsx
- src/design-system/components/procedure/ProcedureDeck.tsx
  (remove raw `z-30` → token or delete)
- src/components/station/entity-context/station-identity-chrome.ts
  (identity host z if ladder requires it)
- tests/e2e/unbox-items-sticky.spec.ts  (rewrite assertions — see ACCEPT)

ACCEPT (Playwright on qa-desktop — geometry / elementFromPoint, not screenshots):
1. Identity still clears Items: itemsTop >= identityBottom − 2px (keep).
2. After scrolling the station body so procedure faces overlap the Items
   sticky Y-band: elementFromPoint at the centre of the Items panel
   (or a known Items thumb/title) MUST resolve to a node inside
   `[data-unbox-items-panel]`, NOT a `[data-procedure-step]`.
3. No procedure face may cover an Items content rect while Items is stuck
   (intersecting rects ⇒ Items computed zIndex / paint winner).
4. npm run verify passes (at least --fast while iterating; full before done).
5. Do not raise DS/knip baselines. Do not restart the :3050 dev server.
6. User manages commits — do not commit unless asked.

OUT OF SCOPE:
- Rebuilding Smart Stack / peek / covered / sticky faces on ProcedureDeck
  (flat foundation stays — see procedure-deck-simplify-HANDOFF.md).
- Triage PoLineRow / POUnboxingSection forks.
```

---

## 1. What’s wrong (one sentence)

**Sticky Items is `z-base`; procedure faces paint above it; the carton contents list disappears under the step chrome when you scroll.**

### Evidence

| Fact | Where |
|---|---|
| Items sticky + `z-base` | `UnboxItemsPanel.tsx` ~`sticky top-20 z-base … bg-surface-sunken` |
| Identity float at `z-raised` | `station-identity-chrome.ts` → `stationContextBarHostClass` |
| Active procedure face raw `z-30` | `ProcedureDeck.tsx` → `isActive && 'z-30 ring-1 …'` |
| Same scrollport | `StationWorkbench` — Items as `entityContext`, deck in tabs/children |
| Prior E2E false green | `unbox-items-sticky.spec.ts` only checks Items vs identity Y |

### Why the previous sticky “fix” made this worse / left it open

Lowering Items to `z-base` (so identity wins) correctly fixed bookmark clipping, but left Items **under** the procedure. The ladder needs **three** rungs, not two.

---

## 2. Acceptance geometry (implement in Playwright)

```ts
// After scroll until a procedure face intersects the Items sticky band:
const winner = await page.evaluate(({ x, y }) => {
  const el = document.elementFromPoint(x, y);
  return {
    inItems: !!el?.closest('[data-unbox-items-panel]'),
    inStep: !!el?.closest('[data-procedure-step]'),
    tag: el?.tagName,
  };
}, { x: itemsCenterX, y: itemsCenterY });
expect(winner.inItems, 'Items must win hit-test under its own rect').toBe(true);
expect(winner.inStep, 'procedure face must not steal Items paint').toBe(false);
```

Keep the identity clearance assert. Delete any assumption that “Items below identity” alone means the display is good.

---

## 3. Done when

- [ ] Live Unbox: scroll the centre column — Items list stays fully opaque over the procedure; no product chrome between step faces.
- [ ] Identity bookmark still fully visible above Items (no clip).
- [ ] `npx playwright test tests/e2e/unbox-items-sticky.spec.ts --project=qa-desktop` red on main-of-bug, green after fix.
- [ ] `npm run verify` green; no raw `z-[N]` / no ratchet raise.
