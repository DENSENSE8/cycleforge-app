# Handoff — PO-line Link photo: attach grid face + popover on-screen

**For:** implementing agent (Claude Code / Cursor / Codex)
**From:** Cycle Forge engineering
**Date:** 2026-08-10
**Status:** GAP — item Link ships a rows list and can paint off-screen
**Lane:** stay on the checkout's branch · attach to **`:3050`** · never
start/restart/kill the dev server · **user owns commits**.
**Product frame:** Cycle Forge multi-tenant reseller-ops SaaS; USAV is dogfood only.

Related shipped work (same session):
- PO-line Photos expands in-row → `ItemPhotoCaptureStrip` (Link | Upload | Send)
- Item Link opens `CartonPhotoPairPanel` `stage="unbox_item"` (reassign → line)
- Arrival Link already has the correct **attach grid** face (`ArrivalClaimPicker`)

Operator screenshots (session assets):
- Wrong face (rows + off-screen): Link list of “Unclassified” + per-row **Link**
- Right face (golden): **ATTACH N/M** header · density cluster · photo grid tiles

---

## Paste for a new session

```
Read docs/todo/po-line-link-photo-attach-grid-HANDOFF.md.

Fix Unbox item "Link a photo" popover (PO-line capture strip AND item_photos
dock — both mount ItemPhotoCaptureStrip → CartonPhotoPairPanel stage=unbox_item).

Two bugs, both locked:

1) WRONG FACE — delete the item rows list
   Today `CartonPhotoPairPanel` `isItem` branch paints:
     eyebrow "Link a carton photo…" + <ul> rows
     [ PhotoThumb | Unclassified | Link button ]
   That is debt. Operator wants the SAME face as Arrival Link:
     header ATTACH selected/total · PhotoGridDisplayControls density ·
     refresh · select-all Pencil · scrollable photo GRID tiles with
     SelectionMark · sticky Check footer that commits.
   Golden: ArrivalClaimPicker inside CartonPhotoPairPanel (arrival_package).
   Reuse that picker (extract or share), do NOT fork a third grid.

2) OFF-SCREEN — popover must stay in viewport
   ItemPhotoCaptureStrip opens Popover placement="top-end" from the Link
   segment. On the in-row capture strip (Tags | Serial | strip) near the
   left/center of the work surface, the panel paints clipped / off-screen
   (left edge flush past the viewport / under chrome).
   Fix anchoring so the panel stays fully visible above the strip:
   collide/flip against viewport, prefer top with horizontal clamp, or
   grow Popover SoT collision if missing — never a page-local portal hack.
   Verify from: (a) PO-line Photos expand Link, (b) dock Band 1 item_photos Link.

Commit verb stays:
  selected tiles → PATCH /api/photos/:id/reassign
    { entityType: 'RECEIVING_LINE', entityId: receivingLineId }
  via reassignPhotoToReceivingLine (already wired). Header copy can read
  ATTACH N/M (N = selected, M = candidates). One Check posts all selected
  (Arrival parity) — delete per-row Link buttons.

Guards:
  - carton-photo-pair-panel.guard.test.ts — item face must match Arrival
    claim chrome markers (data-arrival-claim-grid OR shared data-photo-attach-grid);
    assert NO Unclassified row list / per-row Link for isItem.
  - ItemPhotoCaptureStrip popover placement / collision probe if SoT exposes one.

npm run verify before done. Never raise a DS/knip baseline.
```

---

## Why it looks wrong today

| Surface | What operator sees | Code |
|---|---|---|
| Arrival Link (golden) | ATTACH · density · grid tiles · Check | `ArrivalClaimPicker` in `CartonPhotoPairPanel` when `isDoor` |
| Item Link (broken) | Rows: thumb + “Unclassified” + Link | `isItem` branch ~L380 — hand-rolled `<ul>` |
| Item Link placement | Panel clipped / off left of strip | `ItemPhotoCaptureStrip` `Popover` `placement="top-end"` |

Write path for item is already correct (carton list intent → reassign onto
`receivingLineId`). Only the **face** and **popover geometry** are wrong.

---

## Concrete method (locked)

### Job 1 — share the attach grid face

1. Extract or generalize `ArrivalClaimPicker` so Arrival **and** item can mount
   the same chrome (header ATTACH N/M · density · refresh · select-all · grid ·
   sticky Check). Prefer one component; Arrival keeps claim-stage Check,
   item Check calls `reassignPhotoToReceivingLine` for each selected id.
2. Delete the item `<ul>` / per-row Link / “Unclassified” list entirely.
3. Candidates for item = carton-intent rows (already `RECEIVING_PHOTO_LIST_INTENT_CARTON`)
   — same pool Arrival claims from, minus nothing unless already on this line
   (optional filter; do not invent a media-library hop).

### Job 2 — keep the popover on-screen

1. Open from `ItemPhotoCaptureStrip` Link (`linkRef` anchor).
2. Ensure Popover collides with viewport when anchored mid-row / near left:
   flip / shift so the panel is fully visible above the strip.
3. Dogfood width parity with Arrival: Arrival uses `w-[32rem]`; item currently
   `w-[22rem]` — match Arrival once the grid face lands so tiles have room.
4. Smoke on `:3050`: open Photos on a PO line → Link → panel fully on-screen;
   same from dock `item_photos`.

---

## Out of scope

- Carton identity Photos pill / Displays Photos Actions list
- Bench `unbox_carton` aspect-pair rows list (⋯ name shot) — leave alone
- Media library navigation from Link (already banned)

---

## Verify

```bash
npx tsx --test \
  src/components/receiving/workspace/line-edit/steps/carton-photo-pair-panel.guard.test.ts \
  src/components/receiving/workspace/line-edit/unbox-dock-one-shell.guard.test.ts

npm run verify
```
