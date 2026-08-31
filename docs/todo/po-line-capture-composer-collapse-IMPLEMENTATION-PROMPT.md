# IMPLEMENTATION PROMPT — PO line capture composer, then per-line collapse

**Paste everything below the horizontal rule into a fresh agent session.**  
Repo: `cycleforge-app` on **`main`**.  
Plan of record: [`po-line-capture-composer-collapse-PLAN.md`](./po-line-capture-composer-collapse-PLAN.md).

This prompt is **only** the Unbox **in-row Serial capture composer** (get it completely right) and then **per-line** expand/collapse.  
**Do not** touch the bottom `StationComposerHost` Label/Ticket dock, Ticket pane, or Displays.

---

You are implementing **left text · right actions** for the Unbox PO-line **capture composer**, then **collapse/expand each line item** around that composer.

## Done when

### Phase 1 — composer first (block Phase 2 until this is signed off visually)

1. Under an active Unbox PO line, the capture bar reads as **one joined composer**:
   - **Far left:** condition Tags / scan glyph (existing `PoLineCaptureRow` leading segment).
   - **Middle:** `SerialScanField` — placeholder **Serial**, grows to fill.
   - **Far right trailing group:** green **exact / no-serial check** (`NoSerialOfferCheck`) then **Photos** (camera). Same height as the field; flush-joined; never mid-field.
2. Text and actions do not swap: identity of the **job** is left; **verification actions** are right.
3. Existing serial commit, ↑/↓ line step, focus helpers (`data-unbox-serial-input`, `focus-unbox-capture-serial.ts`) still work.
4. No layout animation on the bar.

### Phase 2 — per-line collapse

5. Each line can collapse so only `ItemRecordRow` face shows (thumb · title · meta **left**; price / trailing **right**). Expanded line mounts the Phase 1 composer in `body`.
6. **Collapse all** (Items band) collapses every line’s capture body. Expanding one line reveals its composer.
7. Prefer default: **controller-active line expanded**, siblings collapsed (pin in a small unit/DOM test). Instant unmount — **no height tween**.
8. Do **not** revive a second accordion SoT beside `StationCollapsibleBlock` band hairlines; line collapse is face/`body` ownership on `PoLineRow` / `ItemRecordRow`.
9. `npm run verify` green.

## Non-goals

- Bottom notes dock / composer modes / Ticket middle pane  
- Pack, Testing, Arrival line capture redesign (Unbox dogfood only; Testing may share `PoLineRow` later)  
- Restoring labeled chevron accordion per row as the primary disclose  
- Changing band hairline Items/Label/Placement behaviour except calling Collapse all into line pins  
- Branches off `main`; commit only if asked; do not restart `:3050` / `usav-dev`

## Read first

1. `docs/todo/po-line-capture-composer-collapse-PLAN.md`  
2. `AGENTS.md` (no layout animations; interaction budget)  
3. `src/components/receiving/workspace/line-edit/PoLineCaptureRow.tsx` — capture composer SoT  
4. `src/components/receiving/workspace/SerialScanField.tsx` + `NoSerialOfferCheck.tsx` — field + green check  
5. `src/components/receiving/workspace/PoLineRow.tsx` + `ItemRecordRow` — face + `body` slot  
6. `src/components/receiving/workspace/line-edit/focus-unbox-capture-serial.ts`  
7. `src/components/receiving/workspace/po-line-capture-chrome.ts` — row/segment classes  
8. Band collapse (context only): `StationCollapsibleBlock` / `buildUnboxOverview` — do not fork a third disclosure

## Build order (locked)

1. **Composer layout only** — adjust `PoLineCaptureRow` / flush `SerialScanField` trailing column so the green check + camera sit as a **right action cluster**. Screenshot-match: field left of actions; actions flush to the bar’s right edge.  
2. DOM or visual assertion: trailing actions are to the right of `[data-unbox-serial-input]` in document order / layout.  
3. **Then** per-line collapsed flag (active line expanded by default) — unmount `body` when collapsed; wire Items **Collapse all** to set all lines collapsed.  
4. Ensure expand + scan still focuses via existing focus helpers.  
5. `npm run verify`.

## Report back

Paths changed · Phase 1 composer before/after anatomy · how line collapse state is stored · Collapse all wiring · verify result · anything deferred (Testing parity, Label SHOW chrome).
