# Handoff — Finish Inventory Displays Zoho trust + inbound CRUD

**For:** next coding agent (paste § Prompt)  
**Date:** 2026-08-08 · **Lane:** current checkout — stay on branch; attach to `:3050` (never start/restart). User owns commits.  
**Status:** Trust **view** + leaf chrome landed (Information SoT · Lines focus/SN · PO notes pull · header Refresh/Save). See [`inventory-displays-info-lines-notes-chrome-HANDOFF.md`](./inventory-displays-info-lines-notes-chrome-HANDOFF.md) for the 2026-08-09 leaf + prove checklist. Remaining finish = block-if-stale edge UX, receive/unreceive trail honesty, commercial writes Zoho already supports.  
**Product success (operator):** *“I can see everything from the webapp without opening Zoho — backend already updates fields; I need trust to view the integration state.”*  
**Out of scope this leaf:** Create brand-new Zoho PO (inbound scope carve-out) · remounting Units/serial editors into Inventory · reinventing a second search/receive engine.

**Binding rules:**  
[`AGENTS.md`](../../AGENTS.md) · [`.claude/rules/source-of-truth.md`](../../.claude/rules/source-of-truth.md) → *Station Action vs Context* · *Unboxed ≠ Received* · [`.claude/rules/display/instrument-panel.md`](../../.claude/rules/display/instrument-panel.md) · [`docs/integrations/zoho.md`](../integrations/zoho.md) · [`pattern-evolution.md`](../../.claude/rules/pattern-evolution.md).

---

## Prompt (paste into a new agent session)

```text
Finish Inventory Displays → Zoho trust + inbound write surface.
Do not redesign Unbox centre. Do not build a second Zoho app. Close the remaining trust + Cmd+S + CRUD gaps that the prior session left open.

## Mission

Unbox Inventory Displays (`InventoryDisplayHost`) is the Action-plane leaf for the linked inventory PO. Prior work made it an edge-to-edge keyboard instrument and fixed the worst trust lies (empty lines, broken line-note writes, missing commercial header / activity). Your job: finish so an operator can **trust the view without opening Zoho**, save with **⌘/Ctrl+S under block-if-stale**, and use **receive/unreceive do·undo** with a visible trail — then grow only the writes Zoho + our client already support.

Attach to the user’s already-running app on `:3050`. Do not start/restart/kill the dev server. Stay on the current branch. User owns commits — do not commit unless asked. Prefer `npm run verify -- --fast` while iterating; full `npm run verify` before claiming done. If full verify fails on unrelated dirty-tree (spine nav · GlobalHeader · doc catalog · knip SPINE_ACCENT), fix only Inventory/Zoho-touched regressions.

## Locked product intent (do not renegotiate)

1. **Job of this leaf = trust view of the linked PO + notes/line description writes + sync.**
   - Centre Unbox still owns serial / condition / photos / Receive dock.
   - Serial·condition **do** land in Zoho as text inside line descriptions on Receive (`mark-received-po`) — Inventory must **show** that text after Refresh, not re-host Units editors.
   - There is NO SoT law forbidding serial text on Inventory; the old bug was thin paint + wrong data source.

2. **Commit model**
   - ⌘/Ctrl+S (and floor Save) for PO notes + dirty line descriptions.
   - **Block-if-stale long-term:** on Save, if Zoho `last_modified_time` ≠ base stamp from last pull → refuse overwrite, keep draft, prompt Refresh. Never blind last-write-wins. Never clobber dirty drafts on Refresh.

3. **Traceability = do / undo receive**
   - Receive + Unreceive already exist (`mark-received-po` + `receiveIntent: 'unreceive'` on Unbox menus).
   - Inventory must surface the trail (activity / stamps) so operators trust the undo. Do not fork a second receive engine inside Displays unless you are wiring the existing controller actions into the floor.

4. **CRUD honesty**
   Operator “must” list vs reality:
   | Capability | Reality |
   |---|---|
   | Edit PO header notes | EXISTS (carton `zoho_notes` + push_to_zoho) — harden stale check |
   | Edit line description / notes | EXISTS (fixed → `receiving_line_zoho.zoho_notes` + Zoho PUT) |
   | Edit qty / rate / tax | NOT a Displays write yet — needs Zoho PO line PUT + API |
   | Add / remove lines | NOT yet |
   | Create new PO | OUT OF SCOPE this leaf |
   | Receive / unreceive | EXISTS elsewhere — expose / trail here |
   | Bill / close / void / delete PO / attachments | NO operator routes; OAuth mostly READ + PO UPDATE + purchasereceive CREATE — do not fake UI |

5. **Chrome**
   - Edge-to-edge instrument: trust strip → `InventoryPoHeader` `variant="instrument"` → DenseCompose PO notes → line instruments → Activity. No KeyLegend floor / `/` leaf-commands (stack leaf-dismiss only).
   - Claim sheet-band (`DenseCompose*`) for editable prose — never `WORKSPACE_NESTED_FIELD` cards.
   - Keyboard: F2 Change PO · F5 Refresh · ⌘S Save · Alt+↑/↓ between note instruments.
   - `data-station-action-dossier` required for Displays focus restore.

## Already landed (start here — do not reimplement)

| Piece | Path | Notes |
|---|---|---|
| Chrome leaf (2026-08-09) | [`inventory-displays-info-lines-notes-chrome-HANDOFF.md`](./inventory-displays-info-lines-notes-chrome-HANDOFF.md) | Header mutators · notes pull · Lines ring · Information SoT |
| Host | `src/components/receiving/workspace/line-edit/InventoryDisplayHost.tsx` | Armed sub-index · `setLeafTrailing` Refresh/Save · no KeyLegend floor |
| Header | `src/components/receiving/inventory/InventoryPoHeader.tsx` | `instrument` = PO#·status·total·vendor·ref·dates·modified·pulled |
| Lines | `src/components/receiving/inventory/InventoryPoLineList.tsx` | `inlineNotes` + rate/qty + DenseCompose |
| Activity | `src/components/receiving/inventory/InventoryActivityPanel.tsx` | Receive events + zoho_activity; also desk `PoTab` |
| Dossier fetch | `src/components/receiving/inventory/useInventoryPoDossier.ts` | `['incoming-details']` |
| Refresh | `useZohoSync.refreshInventoryDossier` | sync-one + inventory-sync; LineEditPanel wires `inventoryRefreshing` |
| Line note PATCH | `src/app/api/receiving/lines/[id]/inventory-note/route.ts` | Writes **`receiving_line_zoho.zoho_notes`** (spine column dropped 2026-07-11e) |
| Details lines | `src/app/api/receiving-lines/incoming/details/route.ts` | Prefer `raw.line_items`; **fallback** to rz+rl siblings; prefer `rz.zoho_notes` for description |
| Guards | `unbox-displays-drilldown.guard.test.ts` · `station-action-dossier.guard.test.ts` | Instrument + trust + KeyLegend |
| Zoho receive | `src/app/api/receiving/mark-received-po/route.ts` | Receive + unreceive + SN·condition → Zoho description |
| Integration SoT | `docs/integrations/zoho.md` | Mirror vs receiving sync; OAuth scopes |

## Finish streams (do in order)

### A — Prove trust on a real carton (manual, `:3050`)
1. Open `/unbox` → linked Zoho carton → Displays → Inventory.
2. F5 Refresh — lines must appear even if mirror raw was header-only; descriptions must show post-receive `SN: … · {condition}` when present.
3. Edit PO notes → ⌘S → confirm Zoho (or Refresh round-trip) shows the text.
4. Edit a line note → Save → Refresh → text sticks (local rz + Zoho).
5. Receive from dock → Refresh Inventory → activity + line description update.
6. Unreceive from menu → Refresh → trail / qty honesty.

If any step lies, fix data path first (details / sync-one / inventory-note), not chrome.

### B — Block-if-stale Cmd+S (PO notes first)
1. On Refresh / dossier load, store `base_last_modified_zoho` (and optional notes hash) from details/sync-one.
2. On PO notes save (`useSyncedPoNote` / `PATCH /api/receiving/[id]` with `push_to_zoho`):
   - Re-fetch PO stamp (or sync-one).
   - If Zoho modified ≠ base → **refuse** push; toast “Inventory changed — Refresh”; keep draft dirty.
   - If match → push; update base stamp; clear dirty via `receiving_zoho_notes` dispatch.
3. Same stamp check for line description save when cheap (optional same PR if shared helper).
4. Guard: source asserts block-if-stale / base stamp — no silent last-write.

### C — Receive / unreceive visibility (do not fork domain)
1. Surface carton/PO receive state on the trust strip or a dense fact (received stamp, purchase_receive id if present).
2. **Receive / Unreceive stay on the Unbox dock** (`c.handleReceive` / `mark-received-po`) — Inventory leaf has no Action KeyLegend floor and no `/` leaf-commands (footer = leaf-dismiss only). **Refresh · Save** mount via `setLeafTrailing` on the sticky leaf header; silent F5 / ⌘S also work inside the notes field. Lazy PO-notes pull uses `refreshInventoryDossier` (sync-one + inventory-sync).
3. Activity panel must list receive + unreceive spine events after Refresh (already reads `receive_events` — fix if events missing).

### D — Commercial writes only where Zoho client already can
Only after A–C green. Prefer growing `src/lib/zoho.ts` + thin routes over UI fakery.

Priority order:
1. **Edit rate / qty expected** on a line → Zoho PO line items PUT (reuse `updatePurchaseOrder` patterns from item-description sync). Project into mirror + rz.unit_price / quantity_expected.
2. **Add / remove (cancel) line** — only if Zoho PO editable status allows; hard-disable on billed/closed/void.
3. **Bill / close / void / delete / attachments** — STOP unless OAuth scopes + client methods exist; document gap in zoho.md rather than shipping dead buttons.

### E — Mirror fatness (prevent “None” regressions)
1. Ensure F5 `sync-one` always detail-GETs (fat `raw.line_items`) — already intended; verify list delta cannot wipe fat raw without a follow-up detail (or keep sibling fallback forever — already landed).
2. Optional: after inventory-sync / mark-received-po, invalidate `['incoming-details']` from the client paths that already refresh lines.

### F — Guards + verify
- Extend `unbox-displays-drilldown.guard.test.ts` / small route guard for:
  - inventory-note writes `receiving_line_zoho` (not `receiving_line.zoho_notes`)
  - details fallback / `rz.zoho_notes` preference
  - block-if-stale helper once added
- `npm run verify -- --fast` inner loop; full `npm run verify` before done.
- Never raise knip / DS baselines to pass.

## Done when

- [ ] Manual A checklist passes on `:3050` without opening Zoho UI for read trust.
- [ ] Cmd+S PO notes is block-if-stale (B).
- [ ] Receive/unreceive trail visible on Inventory after Refresh (C).
- [ ] No fake Bill/Void/Delete/Attachment buttons without APIs.
- [ ] Guards green; full `npm run verify` green for Inventory/Zoho-touched files (unrelated dirty-tree noted, not “fixed” by baseline raise).

## Anti-goals

- Do not mount Units explosion / condition pills inside Inventory.
- Do not use `StationActionDossierShell` accordion again.
- Do not read line descriptions only from header-only `raw` without sibling fallback.
- Do not UPDATE `receiving_line.zoho_notes` (column dropped).
- Do not start the dev server.
- Do not commit unless the user asks.
```

---

## Context for humans (not required in the paste)

### Operator interview (locked)

- Success = **see everything / trust the integration view**; backend already updates many fields.
- CRUD “must” list was aspirational; create-PO out of leaf scope; receive already in codebase; unreceive = undo.
- Cmd+S save; wedge scans stay on centre.
- Conflict preference: agent recommended **block-if-stale** — adopted in finish streams.

### #1 historical trust disconnect

Inventory painted from often **header-only** `zoho_po_mirror.raw` while receive/serial/condition wrote into Zoho + `receiving_line_zoho`. Displays looked empty/stale → “integration is lying.”
