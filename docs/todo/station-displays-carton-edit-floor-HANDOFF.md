# Handoff — Station Displays carton Macro bottom actions (Unbox golden)

**For:** implementing / polish agent (Claude Code / Cursor / Codex)
**From:** Cycle Forge engineering
**Date:** 2026-08-09
**Status:** IN PROGRESS on Unbox Displays — icon Macro floor shipped in working tree;
bench-verify + clip polish still need operator confirmation on **`:3050`**. Arrival ·
Testing · Pack not wired yet.
**Lane:** stay on the checkout's branch · attach to **`:3050`** · never
start/restart/kill the dev server · **user owns commits**.
**Product frame:** Cycle Forge multi-tenant reseller-ops SaaS; USAV is dogfood only.

Desk twin (already shipped): History `InspectorActionFloor` on
`HistoryCartonTriagePanel` — labelled CTAs · More · trailing Delete. Station
Displays **must not** mount that desk component (fork — Action vs Context planes).

---

## Paste for a new session

```
Read docs/todo/station-displays-carton-edit-floor-HANDOFF.md.

Continue Unbox Station Displays carton Macro bottom actions (above →|/Filter).

Locked layout (do not "improve" without operator say-so):

  [ ⋯ ][ Sync ][ Print ][ Edit ][ Delete ]   ← h-11 fill-width peers, above hairline
  ─────────────────────────────────────────
  [ Filter displays…                  →| ]   ← absolute bottom close chrome

Shipped face (working tree):
- FlushTerminalFooter layout="spread" + IconButton size="fill"
- FLUSH_TERMINAL_SPREAD_PEER_CLASS / GLYPH_CLASS (h-5) — hit target IS the column
- Zoho inventory Sync = RefreshCw + Loader2 busy (NOT Inventory breadcrumb)
- ⋯ overflow = Resolve when unfound; empty/disabled when matched
- Delete = InspectorFlushDelete far-right (border-l-0)
- Selection underline = inset shadow (never SectionTabs border-b-2 — clips glyphs)

Last known bug (fix if still visible on :3050):
- Glyphs clipped at top when peers used items-stretch — fix landed in
  FlushTerminalFooter spread (items-center + svg overflow-visible). Bench-confirm.

Next (operator priority):
1. Bench on :3050 — open carton → Displays; confirm no clip, Sync spins, Edit
   underline when Linkage open, Delete two-click, Filter/→| still under Macro.
2. If More is disabled empty on matched cartons — decide verbs for ⋯ or hide when empty.
3. Keyboard (optional): panel Enter = Print when matched; no bare letters (wedge).
4. Port actionFloor to Arrival · Testing — station verbs, do not copy Unbox blindly.
5. npm run verify before done. Never raise ratchets/baselines.

Laws:
- NEVER mount desk InspectorActionFloor on Station Displays.
- NEVER put Macro below or instead of →|/Filter footer.
- NEVER floating w-11 islands / justify-between dead air on spread.
- NEVER SectionTabs border-b-2 on fill peers (clips stroke tips).
- Compose FlushTerminalFooter spread; reuse InspectorFlushDelete.
- Attach to :3050 — never start/restart/kill the dev server.
```

---

## What shipped (working tree)

Column stack inside `StationDisplaysPushColumn`:

```
top chrome (fullscreen · carton ↑↓)
body (index / leaf)
actionFloor   ← StationDisplaysActionFloor / UnboxDisplaysActionFloor
footer        ← Filter+→| | leaf-dismiss →| | leaf-command /
```

| Piece | Path |
|---|---|
| Shell | `src/components/station/displays/StationDisplaysActionFloor.tsx` |
| Unbox wiring | `src/components/receiving/workspace/line-edit/UnboxDisplaysActionFloor.tsx` |
| Spread SoT | `FlushTerminalFooter` `layout="spread"` + `FLUSH_TERMINAL_SPREAD_*` |
| Icon size | `IconButton size="fill"` (`src/design-system/primitives/IconButton.tsx`) |
| Descriptors | `src/lib/receiving/station-displays-carton-floor.ts` (`moreItems` · primary) |
| Mount | `StationDisplaysPushStack` `actionFloor` → `StationDisplaysPushColumn` |
| Host | `LineEditPanel` passes sync + editSelected + print/delete |
| Inventory | Refresh **removed** from leaf breadcrumb; Save notes stays in `setLeafTrailing` |
| Guards | `station-displays-action-floor.guard.test.ts` · `FlushTerminalFooter.guard.test.ts` · drilldown / dossier guards updated |
| SoT | `source-of-truth.md` Macro · spread · fill glyph |

**Verbs (Unbox) — order left → right:**

| Control | Test id | Behavior |
|---|---|---|
| More `⋯` | `unbox-displays-floor-more` | Resolve when unfound; disabled when matched (empty) |
| Sync | `unbox-displays-floor-inventory-sync` | `refreshInventoryDossier` + toast; Loader2 while busy; needs Zoho PO id |
| Print | `unbox-displays-floor-primary` | `runPrintLabel` when `canPrint` |
| Edit | `unbox-displays-floor-edit` | Linkage `actions` / `link`; inset underline when Linkage open |
| Delete | `unbox-displays-floor-delete` | `DELETE /api/receiving-logs` + rail mirror + close Displays |

Shell test id: `station-displays-action-floor` · bar: `…-bar`.

---

## Corrections already applied (do not re-litigate)

1. **Wrong:** Macro as absolute bottom / Filter lifted / Delete far-left (Option B).
2. **Right:** Macro **above** close chrome; Delete **far-right**.
3. **Wrong:** Labelled Edit + blue Print primary on gray canvas band.
4. **Right:** Icon peers on `bg-surface-card`; equal fill-width columns.
5. **Wrong:** Refresh text CTA in Inventory leaf breadcrumb.
6. **Right:** Zoho Sync = Macro RefreshCw icon with loading state.
7. **Wrong:** `justify-between` + floating `w-11` / `size="touch"` islands.
8. **Right:** `spread` + `size="fill"` + `FLUSH_TERMINAL_SPREAD_PEER_CLASS`.
9. **Wrong:** `[&>*]:items-stretch` + SectionTabs `border-b-2` → top glyph clip.
10. **Right:** `items-center` + `[&_svg]:overflow-visible` + inset-shadow selection.

---

## Likely next work

1. **Bench verify on `:3050`** (server was down mid-session — attach, do not restart).
   Confirm: no top clip · Sync spinner · Edit underline · Delete arm · Filter under Macro.
2. **More menu policy** — matched cartons currently disable empty `⋯`. Either add
   secondary verbs or hide when `moreItems.length === 0` (ask operator).
3. **Keyboard** — optional panel-scoped Enter = Print; never bare letters (wedge).
4. **Port Arrival · Testing** — same `actionFloor` slot; station-specific verbs.
5. **E2E** — optional QA-org smoke (History has `history-carton-delete.spec.ts`).

---

## Hard bans

- Mount `InspectorActionFloor` on Displays / PushStack / PushColumn.
- Put Macro floor below `footer` or replace close chrome with Macro.
- Far-left Delete on the station Macro row.
- Floating `w-11` / `size="touch"` islands on spread Macro.
- SectionTabs `border-b-2` on fill peers (clips).
- Second print / delete / inventory-sync engine.
- Raise knip / DS / receiving-bus baselines.
- Start / restart / kill the dev server.

---

## Verify

```bash
node --import tsx --test \
  src/components/station/displays/station-displays-action-floor.guard.test.ts \
  src/design-system/primitives/FlushTerminalFooter.guard.test.ts \
  src/lib/receiving/station-displays-carton-floor.test.ts \
  src/components/receiving/workspace/line-edit/unbox-displays-drilldown.guard.test.ts
npm run verify
```

**Note:** Full `npm run verify` may still fail on unrelated WIP on this branch
(`OrdersSyncPopover` typecheck · outbound Views menu · knip
`current-surface-saved-views`). Fix only if you touched those; do not raise baselines.
