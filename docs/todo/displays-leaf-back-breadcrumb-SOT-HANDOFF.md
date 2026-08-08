# Handoff — Displays leaf Back + breadcrumbs SoT (one top row)

**For:** next coding agent (paste § Prompt)  
**Date:** 2026-08-08 · **Lane:** current checkout — stay on branch; attach to `:3050` (never start/restart). User owns commits.  
**Status: DONE 2026-08-08** — Inventory secondary drill reports trail via `useDisplaysLeafChrome`; stack owns the single sticky `StationDisplayLeafHeader` (whole-row Back + breadcrumbs). No nested LeafHeader in leaf bodies. Guard: `station-displays-nested-grammar.guard.test.ts` · `station-display-index.guard.test.ts`.  
**Product success (operator):** *One* whole-row Back at the top of the Displays push column. Breadcrumbs update as you drill (Displays → Inventory → PO notes). Tap the row to pop one level. Easy to triage / extend for other leaves that need nested drill.  
**Out of scope:** Redesign Unbox centre · change Root Index row anatomy · invent a second Displays stack · Zoho CRUD (separate handoff).

**Binding rules:**  
[`AGENTS.md`](../../AGENTS.md) · [`.claude/rules/source-of-truth.md`](../../.claude/rules/source-of-truth.md) → *Right-edge PUSHES* · Displays Root-to-Leaf · [`.claude/rules/display/station-workbench.md`](../../.claude/rules/display/station-workbench.md) → Displays Root Index · [`.claude/rules/pattern-evolution.md`](../../.claude/rules/pattern-evolution.md).

---

## Prompt (paste into a new agent session)

```text
Make the Displays right-rail top Back row the single source of truth for leaf navigation + breadcrumbs.

Do not keep a nested StationDisplayLeafHeader inside Inventory (or any other leaf). One sticky whole-row Back at the top of StationDisplaysPushStack; breadcrumbs must be easy to triage and extend for nested drill.

## Mission

Today Unbox Displays → Inventory shows TWO back bands stacked:

  1. Stack leaf header:  ← Inventory     (StationDisplaysPushStack → StationDisplayLeafHeader)
  2. Nested leaf header: ← PO notes      (InventoryDisplayHost mounts StationDisplayLeafHeader again)

That is a chrome fork. Operator hits the wrong Back; Esc / focus restore fight; trust strip can paint between the two rows. Fix by growing the STACK header into a breadcrumb SoT and deleting nested LeafHeaders from leaf bodies.

Attach to the user’s already-running app on `:3050`. Do not start/restart/kill the dev server. Stay on the current branch. User owns commits — do not commit unless asked. Prefer `npm run verify -- --fast` while iterating; full `npm run verify` before claiming done.

## Locked product intent (do not renegotiate)

1. **One top Back row = SoT**
   - Owned by `StationDisplaysPushStack` + `StationDisplayLeafHeader` only.
   - Whole row is ONE control (already: full-width button — keep / harden). Never a tiny IconButton beside a dead title.
   - Title area paints a **breadcrumb trail**, not only the leaf tab label.

2. **Breadcrumb model (editable / triage-friendly)**
   - Segments are data, not hard-coded JSX in Inventory.
   - Shape sketch (grow as needed, keep Zod-light or a typed array in displays/):
       type DisplaysBreadcrumb = {
         id: string;           // 'index' | leaf tab id | leaf-local sub id
         label: string;        // 'Inventory' | 'PO notes' | …
         onPopTo?: () => void; // optional; stack owns default pops
       };
   - Paint: `←  Inventory  /  PO notes` (or chevron separators — match Kinetic Ledger density; flush, no pills).
   - Tap whole row → pop **one** level (deepest segment). Esc matches the same pop contract.
   - Optional later: tap a middle segment to jump — not required for v1 if whole-row pop-one is clear.

3. **How leaves register nested depth (no second header)**
   - Inventory (and future leaves) report sub-path UP to the stack — they do NOT render LeafHeader.
   - Prefer one of (pick the smallest that fits pattern-evolution; do not invent a twin):
     a) React context from PushStack: `useDisplaysLeafChrome().setTrail(segments)` / `setOnBack(fn)`.
     b) Slot / render-prop on the stack: leaf body calls a stable setter via `StationDisplaysLeafChromeProvider`.
   - When Inventory is on its **sub-index** (Information · Lines · PO notes · Activity list): trail = `[Inventory]`; Back → Displays Root Index.
   - When Inventory is on **PO notes** (etc.): trail = `[Inventory, PO notes]`; Back → Inventory sub-index (not Displays index).
   - Clearing the leaf (tab change / close) must reset trail.

4. **Inventory chrome already contextual — keep it**
   - Trust strip only inside Information sub-leaf.
   - Floor (Change PO · Refresh · Save · KeyLegend) only on sub-leaves, not on Inventory sub-index.
   - After this handoff: zero nested `StationDisplayLeafHeader` in `InventoryDisplayHost`.

5. **Esc contract**
   - Pop one breadcrumb level when trail length > 1.
   - When trail is only the leaf tab (e.g. Inventory root of that leaf) → Displays index.
   - On Displays index → close column (existing).

## Already landed (start here — do not reimplement)

| Piece | Path | Notes |
|---|---|---|
| Stack | `src/components/station/displays/StationDisplaysPushStack.tsx` | Mounts ONE LeafHeader with `title={tabLabel}` + `onBack={goIndex}` — grow this |
| Leaf header | `src/components/station/displays/StationDisplayLeafHeader.tsx` | Whole-row button (`data-testid="station-displays-back"`) — extend for breadcrumb segments |
| Inventory drill | `src/components/receiving/workspace/line-edit/InventoryDisplayHost.tsx` | Sub-index + sub-leaves; **delete** its nested LeafHeader once trail API exists |
| Guards | `station-display-index.guard.test.ts` · `unbox-displays-drilldown.guard.test.ts` | Whole-row Back; Inventory drill flags |

## Finish streams (do in order)

### A — Grow LeafHeader API (SoT)
1. Accept `segments: { id, label }[]` (min 1) OR keep `title` as legacy alias for a single segment.
2. Whole-row click = `onBack` (pop one). Aria-label reflects pop target (“Back to Inventory” / “Back to Displays”).
3. Visual: one 24px `STATION_SECONDARY_BAND_FACE` row; segments truncated; no second sticky band.
4. Guard: still exactly ONE `<button>` in the header file; no IconButton.

### B — PushStack owns trail + Esc
1. Local state: `leafTrail` defaulting to `[{ id: activeTab, label: tabLabel }]`.
2. Provide a tiny context (or callback registry) so the active leaf body can `setLeafTrail(segments)` and optionally override pop.
3. `onBack` / Esc: if trail.length > 1 → pop last segment and notify leaf (e.g. Inventory `setSubLeaf(null)`); else `goIndex()`.
4. Reset trail when `activeTab` changes or returning to index.

### C — Inventory consumes SoT (delete nested header)
1. Remove `StationDisplayLeafHeader` import/usage from `InventoryDisplayHost`.
2. On mount / `subLeaf` change, set trail:
   - `subLeaf == null` → `[{ id: 'inventory', label: 'Inventory' }]`
   - else → `[{ id: 'inventory', label: 'Inventory' }, { id: subLeaf, label: SUB_LEAF_META[subLeaf].label }]`
3. Register pop handler: when stack pops the last segment, `setSubLeaf(null)`.
4. Keep trust strip on Information only; floor contextual on sub-leaves.

### D — Guards + verify
- Assert PushStack is the only LeafHeader mount path for Displays leaves (Inventory host must NOT match StationDisplayLeafHeader).
- Assert breadcrumb / trail setter exists (source guard on stack + host).
- `npm run verify -- --fast`; full `npm run verify` before done.
- Never raise knip / DS baselines.

## Done when

- [ ] Manual on `:3050`: Displays → Inventory → PO notes shows **one** top Back row with breadcrumbs (Inventory / PO notes), not two stacked Backs.
- [ ] Whole-row tap pops PO notes → Inventory sub-index; tap again → Displays index.
- [ ] Esc matches the same one-level pop.
- [ ] Trust strip still only under Information; no floor on Inventory sub-index.
- [ ] Guards green; Inventory/Zoho/Displays-touched verify green.

## Anti-goals

- Do not mount a second sticky Back inside any leaf body.
- Do not put breadcrumbs in the Displays column top band (fullscreen / carton cursor) — leaf header row only.
- Do not URL-encode every Inventory sub-leaf unless already required (leaf-local state + trail callback is enough for v1).
- Do not start the dev server.
- Do not commit unless the user asks.
```

---

## Context for humans (not required in the paste)

### Why this broke

Inventory grew a **secondary** Root-to-Leaf (Information · Lines · PO notes · Activity) and reused `StationDisplayLeafHeader` inside the leaf. The stack already paints Back + leaf title. Result: two sticky backs and a trust strip that can sit between them (see 2026-08-08 screenshot).

### Design rule

Displays navigation chrome is **one waist**: `StationDisplaysPushStack` + `StationDisplayLeafHeader`. Leaves supply **trail segments + pop handlers**; they never fork the header. Same pattern-evolution law as “compose the SoT; don’t page-local twin.”
