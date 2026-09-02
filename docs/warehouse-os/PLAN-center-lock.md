# PLAN — Center Lock (repeatable gaze method)

**Written 2026-09-01.** The argument for law **Q5** in [`LAWS.md`](LAWS.md). Agents
query the classifier through `ds_contract` before mounting any desk record form.

---

## The invariant

**Desk:** every edit stays in the center — the slot table is the ground plane;
multi-field forms stack as an overlay on the stage, not a right-rail inspector,
not a XOR walk that hides the grid, not a new route.

**Scan station:** the center holds procedure work and table facts; **Displays**
stay the only right rail. The queue table remains visible under the station
overlay so the operator reads the grid and the tool column at once.

---

## Four questions (classifier)

Ask in order. The answer is always an **existing host**, never a new region.

1. **Shell** — master-nav desk, or floor scan station?
2. **Grain** — one cell (L1) or many fields (L2)?
3. **WIP** — does closing lose draft work? If yes, register on
   `overlay-stack` so Escape is owned by the innermost layer.
4. **Collection** — does the operator still need the grid as a map? If yes,
   never XOR the table away.

### Altitudes

| Alt | Job | Host |
|---|---|---|
| L0 | Read | Slot-table cell |
| L1 | Atomic write (date, qty, text) | `DateRangePickerField variant="compact"`, `InlineEditableValue` |
| L2 | Multi-field record form | `DeskStageOverlay` on the desk stage; same overlay in the 720 center on stations |
| — | Station tools / Look | `StationDisplays` right rail (T2) |

### Forbidden on desks

- `RightRailHost` `detail:*` occupant for record editing
- New `DeskRecordWalkHost` mounts (table XOR + left recents rail)
- Dialog / route as the record plane for queue rows
- Second composer (I8)

---

## Overlay recipe (every L2 iteration)

- **Ground:** slot table still mounted, still sortable.
- **Layer:** `DeskStageOverlay` inside a `relative` wrapper on
  `desk-page-stage` — not `RightPaneOverlay`, not viewport modal.
- **Body:** `TriageScrollLayout` + `useOptimisticMutation`. Flush `TextField`
  stays scan-only.
- **Walk chrome:** identity + `k of n` + prev/next in the overlay header —
  not a 22rem sibling rail.
- **Keyboard:** overlay-stack owns Escape; ↑↓ retargets row content instantly
  (no exit animation).
- **Motion:** opacity only, 80ms (M2). No width/height tween (M1).

---

## design-MCP boarding

| Artifact | Role |
|---|---|
| `DeskStageOverlay.tsx` | Catalogued primitive — `ds_contract` ranks it for desk record jobs |
| `pinned.json` | `useWhen` / `doNot` law |
| `TableRecordPlane` `kind: 'stage-overlay'` | Type SoT for new bindings |
| `kind: 'inspector'` | Legacy — forbidden on new desk bindings |
| `smoke.mjs` | Ranking intents must pin `DeskStageOverlay` first |
| `ds_critique` | Flags new desk `detail:` rail mounts and new XOR walks |

---

## Known debt (do not spread)

Existing XOR walks and right-rail inspectors are **not** migrated in the law
pass. They are pinned `doNot` so agents cannot copy them:

- Exceptions workbench (`DeskRecordWalkHost`)
- Labels paperwork walk (`DeskRecordWalkHost`)
- Incoming add PO intake
- All `recordPlane: { kind: 'inspector' }` bindings (orders, incoming, repair, …)

**Pilot for migration:** To-ship `detail:order` → `DeskStageOverlay` (later lane).

---

## Verify

```bash
node tools/design-mcp/smoke.mjs
node tools/design-mcp/ds.mjs contract "edit a row on the desk table"
node tools/design-mcp/ds.mjs contract "scan station displays"
node "$GARISEK_OS_ROOT/tools/eval-engineering/cursor-eval.mjs" --root . --fast
```
