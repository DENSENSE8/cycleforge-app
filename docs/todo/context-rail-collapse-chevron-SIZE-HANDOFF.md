# Receiving context-rail collapse chevron — size polish handoff

**Self-contained.** A new session needs only this file. Paste:

> Read `docs/todo/context-rail-collapse-chevron-SIZE-HANDOFF.md` and start at §3.

**Lane:** stay on the checkout’s branch. User owns commits — do not commit
unless asked. Attach to the user’s dev server on `:3050`; never start /
restart / kill it.

**Status as of 2026-07-30:** Collapse is **wired and low-key**. Chevron clip
was a **shared-host** bug (opaque Unbox/wash sibling), not a missing
`z-raised`. Shared host surface is the SoT — do **not** re-apply panel
`z-raised`. Size polish (glyph legibility) may still follow once unclipped.

---

## 0. What already shipped (do not undo)

| Concern | Where | Keep |
|---|---|---|
| Collapse state | `CONTEXT_PANEL_COLLAPSE` in [`context-panel-column.ts`](../../src/components/sidebar/context-panel-column.ts) | `localStorage` key `context-panel-collapsed`; expand strip |
| Shared host surface | [`context-panel-column.ts`](../../src/components/sidebar/context-panel-column.ts) + [`ContextPanelLayout.tsx`](../../src/components/sidebar/ContextPanelLayout.tsx) | `CONTEXT_PANEL_HOST_RECEIVING_CLASS` (canvas+wash behind rail **and** workspace); `CONTEXT_PANEL_WORKSPACE_OUTSET_GUTTER_CLASS`; Unbox/Triage use `appWorkCanvasLayoutClass` — **no** panel `z-raised` |
| Wiring | [`ContextPanelLayout.tsx`](../../src/components/sidebar/ContextPanelLayout.tsx) | Receiving only; `onCollapse` on the trailing resize handle; width-drawer |
| Edge SoT | [`HorizontalEdgeResizeHandle.tsx`](../../src/design-system/components/HorizontalEdgeResizeHandle.tsx) | Optional `onCollapse` / `collapseLabel`; chevron at **top** of the full-height edge; drag pill stays mid-edge; no white bubble / shadow / ring |
| Guard | [`context-panel-collapse.guard.test.ts`](../../src/components/sidebar/context-panel-collapse.guard.test.ts) | Asserts SoT key, `onCollapse` wiring, shared host, layout-only Unbox/Triage, **no** panel `z-raised`, no `ContextPanelCollapseCue` |
| Law note | [`.claude/rules/display/station-workbench.md`](../../.claude/rules/display/station-workbench.md) row **2a** | Collapse lives on the resize-edge control; outset hangs into shared host ground |

**Deleted on purpose:** `ContextPanelCollapseCue.tsx` (row-follow / scan-band
hover twin). Do not restore a second gutter cue.

**Do not re-apply:** panel `z-raised` to “fix” Unbox covering the chevron —
that is the wrong root cause. Own the shared host plane instead.

---

## 1. The bug the operator sees

Hover the trailing edge of the receiving context rail (Unbox with a PO open).
The collapse control is a left chevron at the **top** of the vertical resize
strip. It is **legally low-key** (gray → darker on hover, no card) but
**visually undersized** — reads as a speck next to the scan-band hairline and
the mid-edge resize pill.

Current call site (too small):

```tsx
// HorizontalEdgeResizeHandle.tsx — onCollapse branch
<IconButton
  size="xs"                         // 24×24 hit box
  icon={<CollapseIcon className="h-3.5 w-3.5" />}  // 14px glyph
  className={cn(
    'absolute top-3.5 left-[calc(50%+3px)] z-10 -translate-x-1/2',
    'text-text-faint hover:text-text-default',
    'opacity-0 … group-hover:opacity-100',
    …
  )}
/>
```

---

## 2. Locked product intent

1. **Still low-key** — glyph only; no white bubble, shadow, or ring.
2. **Still on the resize edge** — same `HorizontalEdgeResizeHandle` hover
   reveal as the pill; not a scan-band or rail-row float.
3. **Still at the top** of the vertical edge (not mid-stacked with the pill).
4. **Bigger / more readable** — glyph and hit target must feel like intentional
   chrome next to the 40px scan band, not a micro decoration.
5. **Unbox-safe via shared host** — outset hangs into `CONTEXT_PANEL_HOST`
   ground + workspace outset gutter; do **not** use panel `z-raised` over an
   opaque Unbox sibling.

---

## 3. Do this (implementation)

Primary file: [`HorizontalEdgeResizeHandle.tsx`](../../src/design-system/components/HorizontalEdgeResizeHandle.tsx).

1. **Bump glyph** from `h-3.5 w-3.5` → at least `h-4 w-4` (try `h-5 w-5` if
   still weak on `:3050` Unbox + PO).
2. **Bump control size** from `size="xs"` → `size="sm"` (28×28) so the hit
   target matches the larger glyph. Do not invent a raw `h-*`/`w-*` on the
   button (control-size ratchet).
3. **Widen the edge hit strip when `onCollapse` is set** if needed
   (`w-7` → `w-8` or `w-9`) so a larger chevron is not clipped by the sash
   width or covered again by the workspace.
4. **Re-check inset** — keep a little left padding from the card
   (`left-[calc(50%+…)]` / top nudge). After enlarging, re-verify Unbox + PO
   does not re-clip the right side; if it does, prefer the shared-host gutter
   (`CONTEXT_PANEL_WORKSPACE_OUTSET_GUTTER_CLASS`) over panel `z-raised` or
   pulling the glyph back into the card.
5. **Idle color stays tokenized** — `text-text-faint` → `hover:text-text-default`
   (or soft → default). No hex, no bubble.
6. **Update the guard** if class strings change (`top-3.5`, `w-7`, glyph
   size assertions).
7. **Verify** — `npm run verify -- --fast` while iterating; full
   `npm run verify` before calling done. Manual: Unbox with PO open, hover
   trailing edge, confirm chevron is clearly readable, click collapses,
   expand strip restores, drag/double-click resize still work.

Do **not**:

- Bring back `ContextPanelCollapseCue` or scan-band-only reveal
- Put collapse in GlobalHeader / MasterNav
- Raise DS ratchet baselines
- Start / restart the dev server

---

## 4. Paste-ready kickoff

```
Read docs/todo/context-rail-collapse-chevron-SIZE-HANDOFF.md and start at §3.

The receiving context-rail collapse chevron (HorizontalEdgeResizeHandle
onCollapse) may still need size polish after the shared-host clip fix. Keep
it low-key (no bubble), on the top of the trailing resize edge. Outset hangs
into CONTEXT_PANEL_HOST ground — do NOT re-apply panel z-raised. Bump
IconButton size + glyph only if still weak once unclipped. Do not restore
ContextPanelCollapseCue. User owns commits.
```
