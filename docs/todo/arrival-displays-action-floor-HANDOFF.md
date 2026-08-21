# Arrival Displays — icons-first action floor port (HANDOFF)

**Status:** OPEN — ready to execute.
**Date:** 2026-08-09
**Goal (verbatim use case):** *port the right rail to the Arrival scan station* —
give Arrival's right-edge **Station Displays** the same **icons-first carton Macro
floor** (`⋯ · … · 🗑`, equal fill-width peers) that Unbox already has, so the
right rail matches the golden across scan stations.

This is the **station** half of the icons-first action-floor work that just shipped
on the desk rails + Unbox. Arrival is a scan station, so its "right rail" is
**Station Displays** (`StationDisplaysPushStack`) — **not** the desk
`RightRailHost` inspector. Per C2 (scan vs desk right-edge, `source-of-truth.md`),
the two hosts stay forked; they share the **display method**, never the shell.

---

## 1. Scope — what's already done vs the one gap

Arrival's scan station is **`src/components/receiving/triage/TriagePanel.tsx`**. It
is already ported onto the Unbox method (see its docstring + `station-port-from-unbox.md`):

| Right-edge layer | Arrival today | Status |
|---|---|---|
| Flush Unbox dock (`UnboxDockHost` two-band, `data-arrival-dogfood-terminal`) | ✅ present | done — *the station-port scorecard row saying "Omnichannel float / advisory remains" is STALE* |
| `StationDisplaysPushStack` (index→leaf) | ✅ `TriagePanel.tsx:524` | done |
| Displays leaves | Pairing only (`linkage`) — `build-triage-displays.tsx` | done |
| Utility rail (index icons, whole-strip open) | ✅ `StationDisplaysUtilityRail` | done — the `←|` footer and the carton `↑↓` were removed 2026-08-19 |
| **Icons-first `StationDisplaysActionFloor` (carton Macro floor)** | ❌ **MISSING** — `StationDisplaysPushStack` mounts with **no `actionFloor`** | **THIS PORT** |

So the entire deliverable is: add an **`ArrivalDisplaysActionFloor`** and pass it to
`StationDisplaysPushStack`'s `actionFloor` prop — mirroring how Unbox does it.

---

## 2. Golden reference (copy this shape, station-side)

- **Wiring:** `LineEditPanel.tsx:1092` →
  ```tsx
  <StationDisplaysPushStack …
    actionFloor={<UnboxDisplaysActionFloor receivingId={…} isUnfound={…}
                   canPrint={…} runPrintLabel={…} openDisplays={…}
                   onDeleted={closeDisplays} editSelected={activeSideTab==='linkage'}
                   onInventorySync={…} inventorySyncing={…} canInventorySync={…} /> }
  />
  ```
- **Station shell (SHARE this):** `StationDisplaysActionFloor`
  (`src/components/station/displays/StationDisplaysActionFloor.tsx`) — `h-11` ·
  `FlushTerminalFooter layout="spread"` · `bg-surface-card` · **null when empty**.
  Sits **above** the column close chrome (the PushStack `actionFloor` slot does this).
- **Unbox adapter (MIRROR this, don't reuse):**
  `src/components/receiving/workspace/line-edit/UnboxDisplaysActionFloor.tsx` — the
  peer recipe: `IconButton size="fill" tone="neutral"` + `FLOOR_ICON_CELL`
  (`cn(cornerClass('flush'), FLUSH_TERMINAL_SPREAD_PEER_CLASS, SECTION_TAB_ICON_CELL_IDLE_CLASS)`)
  + glyphs at `FLUSH_TERMINAL_SPREAD_GLYPH_CLASS`, wrapped in `HoverTooltip`; delete =
  `InspectorFlushDelete className={cn(FLUSH_TERMINAL_SPREAD_PEER_CLASS,'border-l-0')}`.
- **Pure descriptors (SHARE):** `src/lib/receiving/station-displays-carton-floor.ts`
  — `stationDisplaysFloorMoreItems({unfound})` (Resolve-when-unfound overflow).
- **PushStack prop:** `StationDisplaysPushStack.tsx` `actionFloor?: ReactNode`
  (renders it above the close footer).

---

## 3. C2 — share the METHOD, fork the HOST (do NOT cross the streams)

| Do (station) | Do NOT |
|---|---|
| Compose `StationDisplaysActionFloor` + raw `IconButton size="fill"` peers + `InspectorFlushDelete` (the Unbox adapter pattern) | Import the **desk** peers `FloorIconButton` / `FloorOverflowButton` / `InspectorActionFloor` from `@/components/right-rail/*` into the station |
| Reuse the shared classes (`FLUSH_TERMINAL_SPREAD_PEER_CLASS`, `SECTION_TAB_ICON_CELL_*`) + `InspectorFlushDelete` + descriptors | Mount `InspectorActionFloor` (desk shell) on a station, or `StationDisplaysActionFloor` on `RightRailHost` |
| Keep the floor carton-scoped (applies regardless of which Displays leaf is open) | Re-label the dock terminal ("Save for unbox") from a Displays click — cross-region action-at-a-distance |

`InspectorFlushDelete` and the `FLUSH_TERMINAL_SPREAD_*` classes are the sanctioned
shared presentational waist — both hosts already use them. That is allowed; the
desk **shell/peers** are not.

---

## 4. The port (ordered)

1. **Create `src/components/receiving/triage/ArrivalDisplaysActionFloor.tsx`** —
   thin, mirroring `UnboxDisplaysActionFloor`. Props: `receivingId`, `isUnfound`,
   `openDisplays`, `onDeleted`, `editSelected`, `onInventorySync`,
   `inventorySyncing`, `canInventorySync`.
2. **Verb set (Arrival — decided below in §5), left→right:**
   `⋯ More` (Resolve when unfound) · `Sync` (Zoho inventory, when a PO is paired) ·
   `Edit` (Pencil → `openDisplays('linkage')`, `selected` while linkage open) ·
   `🗑 Delete carton` (far-right, `InspectorFlushDelete`, `DELETE /api/receiving-logs`
   — copy Unbox's `handleDelete` incl. `removeReceivingRailByCarton` +
   `receiving-lines-table` invalidate + `emitReceiving('receiving-entry-deleted')`).
   **No Print** at Arrival — see §5.
3. **Wire it into `TriagePanel.tsx`** — add `actionFloor={<ArrivalDisplaysActionFloor …/>}`
   to the `StationDisplaysPushStack` (line ~524). Pass `onDeleted={closeDisplays}`,
   `editSelected={activeSideTab==='linkage'}`, `openDisplays`,
   `onInventorySync={() => c.refreshInventoryDossier?.()}` (the controller already
   backs Unbox's), `canInventorySync = receiving_id != null && !!row.zoho_purchaseorder_id`.
4. **Guards** (§6).
5. **Verify** (§7).

---

## 5. Open decisions to confirm before/while porting

- **Print: OMIT at Arrival (recommended).** Arrival is the door/identify pass —
  there is no printable label yet (label lives on the Unbox bench). So the Arrival
  floor is `⋯ · Sync · Edit · Delete` (4 peers), not Unbox's 5. If a stakeholder
  wants a carton sticker at arrival, that's a separate product call.
- **Delete carton at Arrival is NEW capability.** Today Arrival has no carton
  delete (cursor is navigation only). Adding it matches Incoming/History/Unbox and
  is the natural far-right peer — but confirm it's wanted on the arrival pass. If
  not, drop the delete peer and the floor becomes `⋯ · Sync · Edit` (and note that a
  floor with no delete still renders — it's carton macro, not a delete bar).
- **Sync gating:** only enable when a PO is paired (`zoho_purchaseorder_id`),
  exactly like Unbox's `canInventorySync`.

---

## 6. Guards

- **Extend `src/components/receiving/triage/arrival-displays-push.guard.test.ts`** —
  add an `it()` asserting `TriagePanel` passes `actionFloor` to
  `StationDisplaysPushStack`, and that `ArrivalDisplaysActionFloor` composes
  `StationDisplaysActionFloor` + `IconButton size="fill"` + `InspectorFlushDelete`,
  and does **not** import desk `InspectorActionFloor`/`FloorIconButton` (C2).
- **`station-displays-action-floor.guard.test.ts`** already pins the spread golden
  for `StationDisplaysActionFloor` — no change unless you broaden its consumer list.
- Baselines only shrink; never raise one to land this.

---

## 7. Acceptance

- [ ] Arrival Displays column shows an `h-11` icon row above the `→|`/Filter close chrome.
- [ ] Row = `⋯ More` · `Sync` · `Edit(→Pairing)` · `Delete carton` (no Print), equal fill-width columns, delete far-right, no dead air.
- [ ] Delete removes the carton + refreshes rail/grid; Edit opens Pairing with `selected` underline; Sync gated on a paired PO; `⋯` disabled unless unfound (Resolve).
- [ ] No desk `InspectorActionFloor`/`FloorIconButton` import in the station (C2 guard).
- [ ] `npm run verify` green; `arrival-displays-push` + `station-displays-action-floor` guards green; a Playwright smoke on the QA org opening an Arrival carton's Displays.

---

## 8. Traps

- **`IconButton size="fill"`**, never `size="touch"` + `justify-between` (dead air), never micro `h-4` glyphs on an `h-11` floor — the hit target IS the column (`FLUSH_TERMINAL_SPREAD_PEER_CLASS`).
- **Floor returns `null` when empty** — `StationDisplaysActionFloor` already does; don't force an empty bar.
- **Delete grain** is the carton (`DELETE /api/receiving-logs`) — copy Unbox's handler verbatim (rail mirror + query invalidate + `receiving-entry-deleted`).
- **Do not add a Print peer** without resolving §5.
- **Carton-scoped, not leaf-scoped:** the floor is the same whether Pairing is open or the index is showing — it lives at the column bottom via the PushStack `actionFloor` slot.

---

## 9. Collision note (shared main tree, 2026-08-09)

The icons-first floor files are under active parallel-session edit:
`InspectorActionFloor.tsx` (a parallel session repeatedly re-adds a dead cluster
path — desk-only, ignore), plus uncommitted churn across `station/displays/*` and
DS primitives. Before starting, receive/commit that in-flight work or take a
worktree lane; the station golden (`StationDisplaysActionFloor`,
`UnboxDisplaysActionFloor`, `station-displays-carton-floor.ts`) is currently
**untracked-new**, so a worktree from HEAD would strand this port without it.

Reference: `.claude/rules/display/station-port-from-unbox.md` (identify → remove →
compose) · `source-of-truth.md` → Displays vs inspector · Scan vs desk right-edge (C2).
