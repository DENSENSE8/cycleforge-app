# Handoff — Unbox dogfood Print · Receive + always-on label note strip

**Date:** 2026-08-09  
**Surface:** `/unbox` · `LineEditPanel` float (`data-unbox-dock-float`)  
**Status:** Dogfood validation lane — promote or remove after bench sign-off.

## What shipped

Top commit strip above `UnboxDockHost` (`data-unbox-dogfood-print`):

```
[ + insert | label field …………………… ][ ▾ | Print · Receive ]
```

| Zone | Behavior |
|---|---|
| `+` (`NoteComposerInsertRail` `trigger="dock"`) | Flush left, `h-11 w-11`, **transparent at rest**, **white only while menu open**. Menu = LineNotesCard insert set (stamp · last notes · ticket · price · PO notes · title · serials). |
| Label field (`UnboxDockNotesEntry`) | Always-on single-row draft. Writes `receiving_line.notes`; live-drives carton sticker center; print stamps `label_note`. Never auto-focuses (wedge law). |
| Print · Receive | Compact embedded `StationTerminalDock`, scan-themed via `useStationTheme({ staffId })`. Band 1 `trailing={null}`. |

Band 1 = step studio only (photo thirds etc.). Band 2 pager stays mounted. Displays Print remains secondary.

## Key files

- [`LineEditPanel.tsx`](../../src/components/receiving/workspace/LineEditPanel.tsx) — mounts strip
- [`UnboxDockNotesEntry.tsx`](../../src/components/receiving/workspace/line-edit/UnboxDockNotesEntry.tsx) — always-on field + insert actions
- [`NoteComposerInsertRail.tsx`](../../src/components/receiving/workspace/NoteComposerInsertRail.tsx) — `trigger="dock"`
- [`note-composer-helpers.ts`](../../src/components/receiving/workspace/note-composer-helpers.ts) — `NOTE_INSERT_TRIGGER_DOCK_*`
- [`StationTerminalDock.tsx`](../../src/components/station/terminal/StationTerminalDock.tsx) — `useStationTheme` tint
- Guard: [`unbox-dock-one-shell.guard.test.ts`](../../src/components/receiving/workspace/line-edit/unbox-dock-one-shell.guard.test.ts)

## SoT notes

Documented as dogfood in `AGENTS.md` · `source-of-truth.md` · `display/station-workbench.md` · `display/unbox-station.md`. Clearance: `STATION_TERMINAL_PAGER_SCROLL_CLEARANCE` = `pb-56`.

## Next prompts (copy-paste)

1. **Promote or kill:** After dogfood, either ratify the above-dock strip as the permanent Print · Receive home (update SoT “settle-only trailing” history) or restore Band 1 trailing XOR and delete `data-unbox-dogfood-print`.
2. **Nav keys:** Confirm middle `print` / `receive` chords still feel right with always-on strip mid-procedure.
3. **Label grain:** Optional — dedicated “apply draft → `label_note`” without printing (today stamp is print-time only).
4. **Quieter polish:** If `+` still reads loud, drop hover text step further; keep white **only** on `aria-expanded`.

## Verify

```bash
node --require ./scripts/register-server-only-shim.cjs --import tsx \
  --test src/components/receiving/workspace/line-edit/unbox-dock-one-shell.guard.test.ts
npm run verify -- --fast
```
