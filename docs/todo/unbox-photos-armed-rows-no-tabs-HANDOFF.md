# Handoff — Unbox Photos: armed rows only (no nested tabs)

**Status:** Tabs removed + SoT ruling locked (2026-08-08). Photos drill trail wired.  
**Lane:** main Unbox Displays · Photos leaf  
**Do not** reintroduce `TabDisplay` under `PhotosDisplayHost`.  
**Cohort debt:** Linkage · Units still parent-underline — see [`displays-leaf-verbs-armed-rows-SOT-HANDOFF.md`](./displays-leaf-verbs-armed-rows-SOT-HANDOFF.md).

---

## Done

1. **Nested tabs removed** — Actions · Compare · Move · Send underline strip deleted from [`PhotosDisplayHost.tsx`](../../src/components/receiving/workspace/line-edit/PhotosDisplayHost.tsx).
2. **Default body** = [`PhotosActionsArmedList`](../../src/components/receiving/workspace/line-edit/PhotosActionsArmedList.tsx) — keyboard ↑↓ / Enter via `useArmedCursorList`.
3. **URL drill-downs** (no tabs): `?photoAction=compare|move|send` still mount Compare / Move Macro / Send Macro; onClose → `actions` list.
4. **Armed rows include Compare** (plus View · Phone · Upload · Download · Media · Move · Send · Details).
5. **Identity Photos pill** — click stays **send-to-phone**; hover toolbar suppressed (`suppressPhotoHoverGallery`).
6. Guards updated: `station-displays-nested-grammar`, `tab-display-displays-hosts`, `move-photos-terminal`, `listing-photo-compare`, `photos-actions-armed`.

---

## Operator contract

| Control | Behavior |
|---|---|
| Identity Photos pill click | Send to phone |
| Displays → Photos (default) | Armed verb rows |
| Row → Compare / Move / Send | URL drill-down body |
| Esc / Back | Drill → Actions list → Index → close (stack owns Esc) |
| Nested TabDisplay on Photos | **Forbidden** |

---

## Claude Code / agent prompt (copy)

```
Unbox Photos Displays must stay rows-only — no nested TabDisplay under
PhotosDisplayHost.

Context:
- PhotosDisplayHost shows PhotosActionsArmedList by default.
- photoAction=compare|move|send are URL drill-downs from armed rows.
- Identity ReceivingPhotoButton: suppressHoverGallery on Unbox; click =
  send-to-phone only (never open Displays on pill click).
- UNBOX_PHOTO_ACTION_ORDER lists legal surfaces (default actions first),
  not a horizontal tab strip.
- Guards: station-displays-nested-grammar.guard.test.ts,
  photos-actions-armed.guard.test.ts, listing-photo-compare.guard.test.ts,
  move-photos-terminal.guard.test.ts, tab-display-displays-hosts.guard.test.ts.

Finish / polish if needed:
1. Confirm Compare drill has a clear return to the armed list (Back /
   onClose → actions). If Compare lacks Back affordance, wire
   useDisplaysLeafChrome trail or an explicit Back that calls
   onActionChange('actions').
2. Align SoT one-liners in station-workbench.md if any still say
   "Photos nests … TabDisplay".
3. Manual: Open Displays → Photos → ↑↓/Enter View, Compare, Move, Send;
   Esc pops correctly; identity camera pill still sends to phone.
4. npm run verify (or --fast + the Photos guards above).

Never:
- Re-add PHOTO_TABS / TabDisplay density=nested under PhotosDisplayHost.
- Teach CopyChipHoverMenuPanel ↑↓.
- Change pill click away from send-to-phone.
```

---

## Key files

| File | Role |
|---|---|
| `src/components/receiving/workspace/line-edit/PhotosDisplayHost.tsx` | Leaf shell — list vs drill body |
| `src/components/receiving/workspace/line-edit/PhotosActionsArmedList.tsx` | Armed verb rows |
| `src/components/receiving/workspace/line-edit/unbox-side-tabs.ts` | `UnboxPhotoAction` · `UNBOX_PHOTO_ACTION_ORDER` |
| `src/components/receiving/workspace/LineEditPanel.tsx` | `suppressPhotoHoverGallery`; item_photos → compare |
| `src/components/receiving/workspace/line-edit/ReceivingPhotoButton.tsx` | Phone click · suppress hover |

---

## Verify

```bash
node --test --import tsx \
  src/components/receiving/workspace/line-edit/photos-actions-armed.guard.test.ts \
  src/components/receiving/workspace/line-edit/move-photos-terminal.guard.test.ts \
  src/components/receiving/workspace/line-edit/listing-photo-compare.guard.test.ts \
  src/components/station/displays/station-displays-nested-grammar.guard.test.ts \
  src/design-system/components/tab-display-displays-hosts.guard.test.ts

npm run verify -- --fast
```
