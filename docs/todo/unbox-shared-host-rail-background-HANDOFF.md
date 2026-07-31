# Unbox shared-host rail background — Claude Code handoff

**Self-contained.** A new session needs only this file. Paste:

> Read `docs/todo/unbox-shared-host-rail-background-HANDOFF.md` and start at §3.

**Lane:** stay on the checkout’s branch. User owns commits — do not commit
unless asked. Attach to the user’s dev server on `:3050`; never start /
restart / kill it.

**Status as of 2026-07-31:** Shared host wash already sits behind rail + workspace
(`CONTEXT_PANEL_HOST_RECEIVING_CLASS`). The visible seam is the **receiving rail
card’s opaque `bg-surface-card`**, not a missing workspace fill. A failed pass
stripped workspace / `StationPanelRoot` fills with `bg-transparent` — that was
reverted. Do not repeat it.

---

## 0. What already shipped (do not undo)

| Concern | Where | Keep |
|---|---|---|
| Shared host ground | [`context-panel-column.ts`](../../src/components/sidebar/context-panel-column.ts) + [`ContextPanelLayout.tsx`](../../src/components/sidebar/ContextPanelLayout.tsx) | `CONTEXT_PANEL_HOST_RECEIVING_CLASS` = `appCanvasClass` + `appWashClass` behind **both** rail and workspace; `CONTEXT_PANEL_WORKSPACE_OUTSET_GUTTER_CLASS` |
| Unbox/Triage layout-only roots | `UnboxLineWorkspace` / `TriageLineWorkspace` | `appWorkCanvasLayoutClass` — **no** full-bleed `appWorkCanvasClass` sibling under the rail |
| Overlay zero-flash | `UnboxLineWorkspace` | `unbox-overlay-plate` + overlay `bg-surface-canvas`; sync + hard-cut carton→carton; **not** card white |
| Station panel fill | `StationPanelRoot` / `ReceivingLineWorkspace` | Default `bg-surface-canvas` + `StationAmbientWash` on the workbench — do not strip |
| Collapse / outset | collapse handoff + guard | Outset chrome hangs into shared host; **no** panel `z-raised` |

**Do not re-apply / do not repeat:**

- `bg-transparent` on `StationPanelRoot` or other station roots
- Removing `unbox-overlay-plate` / overlay `bg-surface-canvas`
- Panel `z-raised` to “fix” chevron clip
- Stripping workspace fills to “let wash show through” — wrong layer

---

## 1. The bug the operator sees

Open Unbox with a carton selected and the receiving context rail expanded.

- **Workspace** shows mint/host wash + ambient blobs under glass cards.
- **Rail** is a full-height solid white (or light-gray) slab — `CONTEXT_PANEL_COLUMN_CLASS` → `bg-surface-card` + border + left cast.
- A sharp vertical seam where the rail card meets the shared host.

Goal: the shared host wash is the single page ground and is **visible behind the
rail** (rail content floats on that ground). Workspace station canvas stays.

---

## 2. Locked product intent

1. **One page ground** — `CONTEXT_PANEL_HOST_RECEIVING_CLASS` (canvas + Appearance
   wash) behind rail **and** workspace.
2. **Rail is not a second page background** — drop or soften the full-bleed white
   plate on the receiving rail column only. Scan band + feed keep their own
   chrome (cards / bands as today).
3. **Non-receiving context panels keep the floating card** — Products / Media /
   etc. still use `CONTEXT_PANEL_COLUMN_CLASS` as a white card. Split a receiving
   variant if needed; do not gut every route’s rail.
4. **Workspace station contract stays** — `StationPanelRoot` canvas +
   `StationAmbientWash`; Unbox overlay plate/canvas for zero-flash. Do not use
   `bg-transparent` on station roots.
5. **Collapse/resize outset** still hangs into shared host ground — no
   `z-raised` bandaid.
6. **`StationAmbientWash` stays workspace-local** unless a follow-up explicitly
   moves it onto the host after rail chrome is fixed. Host wash is the page SoT.

---

## 3. Do this (implementation)

### 3a. Receiving rail column — remove opaque page fill

Primary SoT: [`src/components/sidebar/context-panel-column.ts`](../../src/components/sidebar/context-panel-column.ts).

Today:

```ts
export const CONTEXT_PANEL_COLUMN_CLASS = cn(
  'relative',
  CONTEXT_PANEL_OUTER_MARGIN,
  'flex w-[360px] shrink-0 flex-col overflow-hidden',
  'border border-border-soft bg-surface-card rounded-2xl',
  elevationCastClass('left'),
);
```

Change for **receiving only** (via a new export or a receiving modifier class
composed in [`ContextPanelLayout.tsx`](../../src/components/sidebar/ContextPanelLayout.tsx)
when `isResizable` / `routeKey === 'receiving'`):

- No full-bleed `bg-surface-card` on the rail column.
- Keep layout: width, margin, overflow, relative for outset grip.
- Border / radius / left cast: drop or soften so the column does not read as a
  second white page. Prefer no plate; if a hairline is needed for focus, keep it
  minimal and token-based.
- Scan band (`appChromeClass` / scan tokens) and rail feed rows keep their own
  surfaces so content stays readable on wash.

Non-receiving routes continue to use the existing card column class unchanged.

### 3b. Guards

Update / extend [`context-panel-collapse.guard.test.ts`](../../src/components/sidebar/context-panel-collapse.guard.test.ts)
(or a small sibling guard) so receiving’s column class does **not** carry a
full-bleed `bg-surface-card` page plate, while shared host + layout-only Unbox
asserts remain.

Do **not** assert that Unbox overlay lacks `bg-surface-canvas` — overlay canvas
is required for zero-flash.

### 3c. Visual QA on `:3050`

1. Unbox + carton open + rail expanded — wash continuous in rail gutter; no white
   full-height rail slab; workbench cards readable.
2. Rail collapsed — expand strip still on shared host; chevron not sheared.
3. Triage twin — same receiving rail chrome.
4. A non-receiving context rail (e.g. Products) — still a floating white card.

### 3d. Verify

`npm run verify` green before done. Do not raise ratchet baselines.

---

## 4. Acceptance

- [ ] Receiving rail no longer paints a full-height white page plate
- [ ] `CONTEXT_PANEL_HOST_RECEIVING` wash reads behind rail + workspace seamlessly
- [ ] Unbox overlay plate / `StationPanelRoot` canvas unchanged (no `bg-transparent`)
- [ ] Collapse/resize outset still works; no panel `z-raised`
- [ ] Non-receiving context panels still card-elevated
- [ ] `npm run verify` green

---

## 5. Files to start from

| Role | Path |
|---|---|
| Column / host tokens | `src/components/sidebar/context-panel-column.ts` |
| Layout wiring | `src/components/sidebar/ContextPanelLayout.tsx` |
| Scan / rail chrome | receiving scan bands, `SidebarRailShell`, `ReceivingSidebarPanel` |
| Guards | `src/components/sidebar/context-panel-collapse.guard.test.ts` |
| Do not touch for this fix | `UnboxLineWorkspace` overlay plate, `StationPanelRoot` default fill |

Related prior art: [`context-rail-collapse-chevron-SIZE-HANDOFF.md`](./context-rail-collapse-chevron-SIZE-HANDOFF.md),
[`station-depth-surface-handoff.md`](./station-depth-surface-handoff.md),
`.claude/rules/source-of-truth.md` (app chrome / canvas / wash),
`.claude/rules/display/station-workbench.md` §2a.
