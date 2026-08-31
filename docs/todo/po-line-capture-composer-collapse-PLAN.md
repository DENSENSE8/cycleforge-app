# PLAN — PO line item collapse + capture composer (Unbox)

**Status:** plan of record · **Written:** 2026-08-30 · **Branch:** `main`  
**Companion prompt:** [`po-line-capture-composer-collapse-IMPLEMENTATION-PROMPT.md`](./po-line-capture-composer-collapse-IMPLEMENTATION-PROMPT.md)  
**Screenshot:** operator Unbox centre — Items band + under-row Serial capture (tag · Serial · green check · camera) · SHOW LABEL / LABEL · PLACEMENT

---

## THIS SHIP

**Scope lock:** Unbox (dogfood) centre **PO line items** only. Get the **in-row capture composer** completely right first; then wire **per-line** expand/collapse around it.

**Must work when done:**

1. **Capture composer anatomy (Phase 1 — must ship first):** one joined bar under the active line:
   - **Left:** mode/context glyph (condition Tags / barcode) + `Serial` field (placeholder names the job).
   - **Right trailing actions, far right, same height as the field:** exact-verification / no-serial green check (`NoSerialOfferCheck`) then Photos (camera). Never actions floating mid-bar; never check/camera left of the text.
2. **Per-line collapse (Phase 2):** each PO line can collapse so only the identity face shows (thumb · title · meta left; price / trailing chrome right). Expanding a line reveals that line’s capture composer. Instant — **no height tween**.
3. **Collapse all** on the Items band still collapses every line (and may keep today’s band body unmount if it already does). Expanding one line must not fight band-level collapse without an explicit expand.
4. `npm run verify` green.

**Out of this ship:**

- Bottom raised notes dock / `StationComposerHost` Label·Ticket modes (already shipped; do not restyle here).
- Restoring the old per-line accordion chevron fork in `PoLinesAccordion` as a second disclosure system — extend `ItemRecordRow` body + one collapse controller, or a thin line-local pin on top of existing capture mount rules.
- Pack / Shipping / Arrival line faces.
- Layout animations on expand/collapse.
- Redesigning identity meta chips (qty · SKU · condition · serials · price) beyond left/right alignment rules.

---

## Current state (do not reinvent)

| Piece | Path | Notes |
| --- | --- | --- |
| Line face | `ItemRecordRow` via `PoLineRow` | Thumb · title · meta; `body` slot already mounts capture under the row |
| Capture composer | `PoLineCaptureRow` → `SerialScanField` + `NoSerialOfferCheck` + Photos | Tags · Serial · Photos grammar; green check = no-serial offer (exact waiver), camera = photos |
| Focus SoT | `focus-unbox-capture-serial.ts` | `[data-unbox-serial-input]` |
| Band hairline | `StationCollapsibleBlock face="hairline"` in `buildUnboxOverview` | Items / Label / Placement — **band** level, not per-line |
| Old accordion | `PoLinesAccordion.accordionBootstrap` | Inert; do not resurrect chevron-per-row as a second SoT |

**Operator screenshot reading:** ITEMS + COLLAPSE ALL sit on the Items hairline; the Serial bar is the composer to fix first; SHOW LABEL is the Label band collapsed face (separate from this ship’s Phase 1).

---

## Anatomy lock (Phase 1)

```text
┌─ ItemRecordRow face ─────────────────────────────────────────────┐
│ [thumb] Title………………………………… meta…                    [$price] │
└──────────────────────────────────────────────────────────────────┘
┌─ Capture composer (body) ────────────────────────────────────────┐
│ [Tags/glyph]  Serial……………………………  │ ✓ exact │ 📷 photos │
│ ← text / field grows left          trailing actions FAR RIGHT → │
└──────────────────────────────────────────────────────────────────┘
```

- One horizontal joined shell (existing flush capture chrome).
- Field takes remaining width; trailing cells are fixed squares/rects, right-aligned as a group.
- Placeholder still says **Serial** (I4 — names the destination).
- No second textarea; Enter still commits serial through existing `SerialScanField` path.

---

## Phase 2 — per-line collapse

- Collapsed: render `ItemRecordRow` face only (`body={null}` / unmount capture).
- Expanded: mount `PoLineCaptureRow` as today.
- Default: active (controller) line expanded; siblings collapsed — or all expanded until Collapse all (pick one and pin in a unit/DOM test). Prefer **active expanded, others collapsed** so Ticket-mode vertical budget stays honest.
- Toggle hit target: prefer a hairline / far-right control on the **line face**, not a chevron that steals title clicks from serial arming. Title click may still arm capture when expanding.
- Shared “Collapse all” on the Items band sets every line collapsed (and can call existing `bandCollapse.collapseAll`).
- **No layout animation.**

---

## Laws

- Work on `main`; operator owns commits.
- Do not restart `:3050` / `usav-dev`.
- No height/width tweens.
- Do not regex-lint source; pin with DOM + existing focus helpers.
- Interaction budget: see primary info ≤ 2; primary act (scan serial / exact check) ≤ 3.

---

## Verify

- `npm run verify`
- Browser Unbox: one-line carton — composer field left, ✓ + camera far right, same bar height; Collapse all hides capture; expand line brings Serial back and focus still lands via `data-unbox-serial-input`.
