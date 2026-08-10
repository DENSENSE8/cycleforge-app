# Handoff — Inventory Displays: Information SoT · Lines focus · PO notes load · header mutators

**For:** next coding agent (paste § Prompt)  
**Date:** 2026-08-09 · **Lane:** current checkout — stay on branch; attach to `:3050` (never start/restart). User owns commits.  
**Status:** Chrome + trust-paint leaf for Unbox Displays → Inventory is **landed in code**. Next session = **prove on a real Zoho-linked carton**, then continue the broader finish streams in [`inventory-displays-zoho-trust-FINISH-HANDOFF.md`](./inventory-displays-zoho-trust-FINISH-HANDOFF.md) (block-if-stale edge cases · commercial writes).  
**Parent / next:** Zoho trust finish handoff (receive trail · CRUD honesty · fat mirror).  
**Prior chat:** [Inventory Displays chrome](c37ecac7-4094-47bc-90e7-21b24585d09a)

**Binding rules:**  
[`AGENTS.md`](../../AGENTS.md) · [`.claude/rules/display/instrument-panel.md`](../../.claude/rules/display/instrument-panel.md) (Inventory Information golden) · [`.claude/rules/source-of-truth.md`](../../.claude/rules/source-of-truth.md) → Station Action vs Context · Displays Root-to-Leaf · [`docs/integrations/zoho.md`](../integrations/zoho.md).

---

## Prompt (paste into a new agent session)

```text
Continue Unbox Displays → Inventory leaf: prove + finish the Information / Lines / PO notes / header-mutator use case.

Do not redesign Unbox centre. Do not remount Units/serial/condition editors into Inventory. Do not restore Mark received / Unreceive / painted KeyLegend / `/` leaf-commands on this leaf. Receive stays on the Unbox dock.

## Mission

Operator opened Inventory Displays and reported:
1. Information looks good → keep / SoT (done in code — do not regress).
2. Lines need work — highlight the middle-workspace line and show item → SN → notes trust text (done in code — prove).
3. PO notes empty though Zoho Inventory has full notes (fixed pull path — prove Refresh fills).
4. Primary actions (Refresh · Save) belong in the sticky leaf header bar, not a body/floor strip (done — do not move back).

Your job: **manual prove on `:3050`**, fix any remaining data-path lies, then pick up unfinished trust streams from `docs/todo/inventory-displays-zoho-trust-FINISH-HANDOFF.md` only after A is green.

Attach to the user’s already-running app on `:3050`. Do not start/restart/kill the dev server. Stay on the current branch. User owns commits — do not commit unless asked. Prefer `npm run verify -- --fast` while iterating; full `npm run verify` before claiming done. Never raise knip / DS ratchet baselines.

## Locked chrome (do not renegotiate)

| Surface | Law |
|---|---|
| Inventory index | `StationArmedVerbList` secondary drill (Information · Lines · PO notes · Activity) — trail/pop via `useDisplaysLeafChrome` |
| Information | `InventoryPoHeader` `variant="instrument"` + `StationDenseFactStrip layout="rows"` — facts only; no canvas wash; no `grid-cols-*` |
| Lines | Same list as trust view; active middle line = `QUEUE_ROW.selectedStationClass` + accent ring + `aria-current` + scroll-into-view; SN eyebrow from `parseSerialFromLineDescription` on Zoho description / draft — **read-only trust text**, not a serial editor |
| PO notes | DenseCompose sunken band; seed from `receiving_zoho_notes` / dossier `po_notes` after real pull |
| Mutators | Refresh · Save notes via `setLeafTrailing` on sticky leaf header. Silent F5 + ⌘/Ctrl+S work even inside the notes textarea (`StationActionKeyLegend` editable exception for F-keys / ⌘S). Footer = leaf-dismiss `→|` only |
| Out of leaf | Receive / Unreceive · Change PO (Linkage / empty Pair) · Units explosion |

## Already landed (2026-08-09 — do not reimplement)

| Piece | Path | Notes |
|---|---|---|
| Host | `src/components/receiving/workspace/line-edit/InventoryDisplayHost.tsx` | Armed sub-index · `setLeafTrailing` Refresh/Save · auto-refresh empty notes leaf · F5 → `onSyncFromInventory` · block-if-stale stamp seed |
| PO notes state | `…/terminal/usePoNoteTabState.ts` | `syncKey` carton switch; `onLoadZohoNotes` → `refreshInventoryDossier`; never clobber dirty draft; don’t reseed over dirty |
| Wire | `LineEditPanel.tsx` | `onLoadZohoNotes: () => c.refreshInventoryDossier()`, `syncKey: row.receiving_id ?? row.id` |
| Lines | `InventoryPoLineList.tsx` | Active line ring + `data-inventory-line-id` + SN face |
| Information SoT | `.claude/rules/display/instrument-panel.md` | Golden rows instrument |
| Key bindings | `StationActionKeyLegend.tsx` | F-keys + ⌘S allowed in editables |
| Guards | `unbox-displays-drilldown.guard.test.ts` · `station-action-dossier.guard.test.ts` | `setLeafTrailing` · Save notes-only · no painted KeyLegend · `base_last_modified_zoho` · `onLoadZohoNotes` → refresh |

Data path reminder:
- Zoho `purchaseorder.notes` → `receiving_carton.zoho_notes` → UI draft / `receiving_zoho_notes`
- Pull = `useZohoSync.refreshInventoryDossier` (sync-one + `/api/receiving/[id]/inventory-sync`) — **not** a weak list-only sync
- Line SN text lives in Zoho line description / `receiving_line_zoho.zoho_notes` — never fork dock `receiving_line.notes` editors here

## Finish streams (this use case first)

### A — Prove on a real carton (`:3050`)
1. `/unbox` → Zoho-linked carton with known PO notes in Zoho Inventory.
2. Displays → Inventory → **Information** — stacked rows match screenshot quality; no Sync/Save under facts (Refresh may show in header when paired).
3. **Lines** — middle active item number is ringed/highlighted; SN eyebrow shows when description has `SN: …`; line notes editable DenseCompose still works.
4. **PO notes** — if empty on open, auto-pull or header **Refresh** must fill Zoho notes; edit → header **Save notes** / ⌘S → round-trip survives Refresh.
5. If notes stay empty after Refresh: inspect `inventory-sync` response + `receiving_carton.zoho_notes` + whether Zoho field is truly `purchaseorder.notes` — fix data path, not chrome.

### B — Only if A green — resume parent finish handoff
Open `docs/todo/inventory-displays-zoho-trust-FINISH-HANDOFF.md` streams B–F:
- Harden block-if-stale refuse UX (toast + keep draft) if any gap remains
- Activity receive/unreceive trail after dock receive
- Commercial writes only where Zoho client already can
- Fat mirror / details sibling fallback regressions

## Anti-goals

- No Units / condition pills / serial dock inside Inventory Lines.
- No painted `StationActionKeyLegend` floor; no `/` leaf-commands; no body Save strip under the notes band.
- No Mark received / Unreceive CTAs on Inventory (dock owns them).
- No second LeafHeader; trail/pop only via Displays stack chrome.
- Do not UPDATE dropped `receiving_line.zoho_notes` column.
- Do not start the dev server; do not commit unless asked.

## Done when (this leaf)

- [ ] Manual A checklist green on a carton whose Zoho PO notes are non-empty.
- [ ] Lines ring matches middle focus; SN trust text visible when present.
- [ ] Refresh / Save only in leaf header trailing (not body/floor).
- [ ] Guards + `npm run verify` green for touched Inventory/Zoho paths.
```

---

## Context for humans (not required in the paste)

### Operator screenshots that drove this leaf

- **Information** — PO # · RECEIVED chip · total · vendor · ref · dates · Last pulled — accepted as golden.
- **Lines** — item `00602` / ACTIVE / qty / price / UNBOXED + gray `SN: … · Used — A` band; wanted middle-line highlight + clear item→SN→notes story without duplicating the left/middle workspace editors.
- **PO notes** — empty sunken band + “No inventory notes yet — F5 to pull…” while Zoho had full notes; Save was mid-body — moved to header.

### Root cause (PO notes empty)

Local `zoho_notes` / dossier `po_notes` stay empty until a real pull. Lazy load used a weak sync; floor Refresh was removed with KeyLegend cleanup; silent F5 was blocked inside the autofocused textarea (`isEditableKeyTarget`). Fixed via `refreshInventoryDossier` + header Refresh + F-key exception in editables.
