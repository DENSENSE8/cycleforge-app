# Fields altitude — trailing cluster SoT

**Status:** Done (2026-07-30). Research ratified; Wave 1 + Wave 2 + receiving
  prefs split (`incoming` vs `receiving` tableId) shipped.
**Lane:** current checkout — no ad-hoc branch.
**Product frame:** Cycle Forge multi-tenant reseller-ops SaaS. USAV is dogfood only.
**Research:** [`table-action-bar-fields-GEMINI-RESEARCH-BRIEFING.md`](./table-action-bar-fields-GEMINI-RESEARCH-BRIEFING.md)

**Paste for a new session:**

> Read `docs/todo/table-action-bar-fields-PLAN.md` and start at the open phase.
> Do not re-open §1 decisions. Verify claims by **call sites**, not docblocks.

---

## 0. Verdict

The “Sheets-like table action bar” proposal is a **misdiagnosis**. Fields already lives in
Workbench page chrome (`WorkbenchChromeHeader` trailing), not GlobalHeader. The fix is
**proximity / grouping** inside that chrome — not a second sticky plane inside `TABLE_SURFACE`.

> **Keep Fields in page chrome. Harden the trailing cluster into a unified Display & Actions
> zone (`Sort → Fields → Import → Add`) with honest absence. Never invent `TableActionBar`.**

---

## 1. Decisions locked — do not re-open

| ID | Ruling |
|---|---|
| **D1** | Fields altitude = page chrome (`WorkbenchChromeHeader` trailing). Not an in-card bar. |
| **D2** | Grow `WorkbenchTrailingCluster` on existing chrome slots — **do not** invent `TableActionBar`. |
| **D3** | Detached listbox only (`GridFieldsMenu`) — no header-coupling / highlight / pin mode. |
| **D4** | Bulk triage stays on `ContextualSelectionBar` (bottom). Never morph the top bar. |
| **D5** | Filters stay in `right`; Fields stays in trailing. Query ≠ display. |
| **D6** | Shared L→R skeleton with honest absence: **Sort → Fields → Import → Add**. |

**What not to build**

- Sheets-like in-card `TableActionBar` (sticky stacking vs § sticky docking law)
- Fields↔header manage-fields mode
- Top-bar morph for multi-select
- Merging filters into the Fields cluster
- A second column-visibility prefs system
- Raising DS / knip baselines

---

## 2. Chrome order (law)

```
search → right (filters) → controlsSlot (portal) → trailing
  trailing = WorkbenchTrailingCluster:
    before? → Sort → Fields → actions (Import/Add) → after?
```

SoT: `WorkbenchTrailingCluster` in `src/components/dashboard/workbench-shell.tsx`.
Display law: [`.claude/rules/display/workbench.md`](../../.claude/rules/display/workbench.md).
Cursor rule: [`.cursor/rules/workbench-sort-chrome.mdc`](../../.cursor/rules/workbench-sort-chrome.mdc).
Guard: `src/components/dashboard/workbench-trailing-cluster.guard.test.ts`.

---

## 3. Phases

### Phase 1 — Trailing cluster SoT + six direct mounts

- [x] Add `WorkbenchTrailingCluster` composer
- [x] Migrate Outbound, Incoming, History, Repair, Catalog, Pickup
- [x] Encode law + extend sort-chrome rule
- [x] Guard + `npm run verify`

### Phase 2 — Unbox portal cleanup

- [x] Host `UnboxWorkspaceHeader` owns Fields in `trailing`
- [x] `ReceivingLinesTable` portal injects **week pill only** into `controlsSlot`
- [x] Shared `tableId: "receiving"` prefs namespace split — Incoming → `incoming`; History/Unbox keep `receiving`

---

## 4. Risks register

| Risk | Mitigation |
|---|---|
| Sticky stacking | Rejected in D1 — never a second sticky band in the scroll port |
| Shared `receiving` prefs | **Fixed:** Incoming uses `tableId: "incoming"`; Unbox/History keep `receiving`. Pre-split Incoming deltas under `receiving` stay there (History/Unbox only) — operators re-tune Incoming Fields once. |
| Unbox `createPortal` | Portal only week pill; Fields stays in host trailing |
| Selection-plane merge | D4 — `ContextualSelectionBar` remains bottom |

---

## 5. Done definition

`npm run verify` green. Every in-scope `GridFieldsMenu` (except legacy non-Workbench adopters out of scope) renders inside `WorkbenchTrailingCluster` `fields` slot. No `TableActionBar` identifier in the tree.
