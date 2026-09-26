# HANDOFF — To ship ledger readability pass (one change at a time)

Owner: Michael. Surface: `http://localhost:3050/shipping/orders` (desk To ship ledger).
Status as of 2026-09-25: 8 items landed; follow-up 8a retains only black/white initials plus the owner-directed passes (SKU alignment, evidence column, group alignment, add-note slot, avatar and grade inks), 6 queued. Nothing is committed — the owner commits.

## Paste-ready prompt

Paste the SHARED PREAMBLE from `docs/design-system/NEXT-PROMPTS.md` first, then:

```text
PLAN L — To ship ledger readability. Continue docs/design-system/HANDOFF-ledger-readability.md.

Working rule (owner): ONE change per turn. Implement the next queued item only, prove it on
http://localhost:3050/shipping/orders, send the owner a before/after screenshot, then STOP and wait
for his feedback before starting the next item. Never batch items. Owner feedback on the current
item beats the queue order.

For each item:
1. Read the item's "Where" and "Constraints" in the handoff. Measure before changing anything
   (live DOM widths / computed styles via Playwright at :3050, contrast via src/lib/color-contrast.ts).
2. Fix it at the lowest layer that owns it: token package (packages/design-tokens) for values,
   src/design-system/tokens/* for shared faces, the ledger file only for layout.
3. Apply it everywhere the same face renders (desk ledger row + group row + OrdersQueueFirstPaint
   stand-in + OutboundOrderEvidence; phone /m/* record + sheet where the item names them).
4. Proof: screenshot at 1440×900 (deviceScaleFactor 2) into
   docs/design-system/screenshots/ledger-readability/NN-<item>.png (gitignored — local proof only,
   send it to the owner; owner 2026-09-26), plus the measured numbers.
5. Record the ruling in docs/design-system/BRIEF.md (§4 industrial table or §11) in the owner's words.
6. pnpm tokens:build && pnpm tokens:check && pnpm verify:fast must pass.
7. Report in plain language: what changed, where to look on the page, what it cost, what's next.

Start with item 9 (Crisp vertical compartment rules) unless the owner names another.
```

## Screenshot harness

Scripts in `/tmp` can't resolve `@playwright/test`: `ln -sfn "$PWD/node_modules" /tmp/node_modules` once
from the repo root.

Auth: mint a session into `/tmp/cf-ledger-auth.json` (staff `Ajax`, tenant `usav`; `Michael` is not in the
picker). Pattern: `/api/auth/staff-picker` → `/api/auth/signin` with `{ staffId, deviceKind: 'personal' }`
→ `storageState`. Wait for `[data-ledger-open]` visible before shooting.

- `/shipping/*` is hidden below `md` — phone widths render only the shell. Judge phone work on `/m/work`.
- The lane hot-reloads; wait ~5 s after an edit before capturing.
- `pnpm ds:trial-shots <trial> /shipping/orders` exists for `?trial=` comparisons (one trial per page).

## Landed (do not redo)

| # | Change | Where it lives |
|---|---|---|
| 1 | State icon before every lifecycle code (RDY circle-dot, URG alarm-clock, PKD package, OOS package-x, SHP truck, HLD circle-pause) | `LIFECYCLE[state].icon` in `packages/design-tokens/src/lifecycle.ts` (also in Swift/JSON); face `src/design-system/components/record-ledger/LifecycleCode.tsx` |
| 2 | Grain as a depth ladder — rougher = deeper: well 3 % coarse · canvas 7 % · bar 7 % fine · ink fills 12 %; white rows none | `OPERATIONAL_BASE.grain` + `GRAIN_DEPTHS` in `packages/design-tokens/src/modes.ts`; contrast guard `src/design-system/modes/modes.guard.test.ts`. Bar segment labels raised to 11 px (`DESK_BAR_SEGMENT_CLASS`) |
| 3 | No row wash for any state; OOS = hatched spine + code on white | `StateToneClasses.tint` removed from `src/design-system/tokens/lifecycle.ts`; all 8 call sites cleaned |
| — | Band regroup (owner-directed): band 1 = context ··· buyer · LISTING (right, no hairline) · ship-by; band 3 = condition · BIN · SKU ··· pick · pack · next. `BIN`/`SKU` key and value at one size | `OutboundOrdersLedger.tsx` `LedgerRecord`; `RECORD_FACT_KEY_CLASS` in `src/design-system/tokens/industrial-record.ts` |
| 4 | Condition chip: tag icon + short grade, SOLID fill in the grade's colour with white ink (owner 2026-09-25 revised it from a hairline outline), fixed 64×14; empty = well fill, muted `—`; aria `Condition, <grade>` / `Condition, not set`. Popover + commit unchanged. Rendered contrast (Tailwind v4 palette): NEW 5.22 · L-NEW 5.36 (teal-700) · REF 6.46 · A 5.36 (emerald-700) · B 5.25 · C/USED 7.58 · PARTS 9.44 · empty 6.00. Shots `06-condition-chip-*`, `08-rail-after-{rows,evidence}.png` | `RECORD_CONDITION_CHIP_CLASS` in `industrial-record.ts`; fill `CONDITION_GRADE_TONE[grade].solid` in `src/lib/condition-tone.ts`; trigger `LedgerCondition` — ledger band 3, S band and evidence column |
| 5 | Solid state badges: icon + code on the tone's `code` fill in its `codeInk` — white on blue/purple/red/green-700; warning = the urgent spine's orange-500 with gray-900 ink (the trial's amber-500 is not in the palette). Measured: info 6.70 · warning 6.75 · fulfillment 6.98 · danger 6.47 · success 5.02. Badge 44×14 (same box as `NOTE`), no code clipped (icon gap 2 px; at 4 px `RDY` needed 44.4 px). Ledger row, group row (`OOS 2/3`), stand-in and evidence strip (`URG · URGENT`) all wear it. Bare-text codes elsewhere (phone record/sheet, `IndustrialRecord`, paperwork rail, evidence summary words) keep `.state-code-*` ink. Trial `solidCodes` deleted | `STATE_TONES[tone].code` / `.codeInk` + `stateCodeCssText()` in `packages/design-tokens/src/state.ts` (CSS, Swift `Tone.code/codeInk`, JSON); `stateBadgeClass(tone)` in `industrial-record.ts`; face `LifecycleCode.tsx`. Guard: badge ≥ 4.5:1 in `lifecycle.guard.test.ts` |
| — | SKU under the customer (owner-directed): bands 1 and 3 share one lead column (`LEDGER_LEAD_CLASS`, w-106 = 424 px), so band 3's SKU starts at the buyer's x (537 px on every row, was 429). BIN takes the rest of the lead (~324 px, was 224). Band 3 gap 8 → 12 to match band 1. Shots `07-sku-align-solid-codes-{before,after}.png`, `07-solid-codes-evidence-after.png` | `LEDGER_LEAD_CLASS` in `outbound-orders-ledger-geometry.ts`; `LedgerRecord` bands 1 + 3; stand-in band 3 in `OrdersQueueFirstPaint.tsx` |
| — | Evidence column (owner-directed): the state strip's next step (`→ PACK`) is a solid badge in the record's tone (danger when blocked), 14 px like the state badge; the sale price moved from the fact list to one line under `ITEM` in the item block (`evidence-price`). The `Price` panel below (net breakdown) is unchanged | `stateBadgeClass(tone)` in `industrial-record.ts` (also used by `LifecycleCode`); `OutboundOrderEvidence.tsx` |
| 6 | Secondary ink — measured, no token change. A census of every visible text node in the first 12 records found NO `text-soft`/slate/opacity faces: every muted text is `#535650` at 7.46:1. The one muted VALUE (the pick/pack operator name, 12 px) now reads in ink (18.93:1) — label muted, value ink; the empty `—` stays muted. What still reads light is SIZE, not colour: the 9 px regular stamps / `Not yet` (item 10). Shots `09-secondary-ink-{before,after}.png` | `LedgerStageAssign` in `outbound-orders-ledger-editors.tsx` (ledger band 3 + evidence column) |
| — | Owner rulings 2026-09-25: condition icon = tag (approved). L-NEW / A text inks → teal-700 / emerald-700 (5.47 / 5.48:1 on white) everywhere `conditionGradeTextClass` renders. Staff initials ink is COMPUTED (WCAG luminance): white or pure black `#000000`, whichever contrasts more with the staff colour (not YIQ — YIQ > 128 picks white on blue-500 at 3.68:1 and red-500 at 3.76:1). The square (industrial) mark drops the grey ring hairline and sets the initials in mono bold uppercase. A tonal "lighter/darker shade of the staff colour" ink was tried and withdrawn the same day (4.55–4.7:1, too close to the floor under glare) | `IdentityMark.tsx` (app-wide; `shape="square"` users: ledger pick/pack, SKU exceptions, catalog manager, agenda, phone evidence sheet). Shot `13-initials-flip.png` |
| — | Group band on the records' columns (owner-directed): chevron in a photo-width lane (`LEDGER_PHOTO_LANE_CLASS`), then `LEDGER_LEAD_CLASS` (☐ 101 · code 145 · order # 365 — same x as the records; code spans the state + note slots, w-25), location · boxes · lines · QTY under the buyer/SKU column (537), pick · pack · next on band 3's w-32 lanes. At a 1440 desk the middle is ~140 px: the location keeps the room and truncates (`BIN UNAS…`), the box · line count gives way first; full text on hover. Shot `10-group-align-after.png` | `LedgerGroupRecord` in `OutboundOrdersLedger.tsx`; `outbound-orders-ledger-geometry.ts` |
| 7 | Mono labels are really bold: Plex Mono 700 loaded (+14.9 KB latin woff2). Measured ink for the same 10 px label: 600 = 334, 700–900 = 334 before (all rendered 600), 700 = 376 after (+12.6 %). Record faces request an honest `font-bold` (was extrabold/black). Inter and Plex Condensed stay capped at 600 | `src/lib/fonts.ts`; `typography/weights.ts` doc; `RECORD_LABEL_CLASS`, `RECORD_QTY_BADGE_CLASS`, `RECORD_NOTE_BADGE_CLASS`, `RECORD_CONDITION_CHIP_CLASS` in `industrial-record.ts` |
| — | Add-note slot (owner-directed): an un-noted record's note slot is a filled grey `+ NOTE` (well fill, muted ink, same 44×14 box as the amber badge) that opens the inline note editor; the saved note turns it into the amber `NOTE`. Proven: click focuses the editor, the row does not open. Phone record keeps the blank slot. Shots `11-note-add-{rows,editor}.png` | `RecordNoteSlot` `empty="add"` + `RECORD_NOTE_ADD_CLASS`; `LedgerNoteEditor` in `OutboundOrdersLedger.tsx`; stand-in in `OrdersQueueFirstPaint.tsx` |
| 8 | Recessed boxes with rules only (no shadow — none existed; measured `box-shadow: none` on every field): top + left edge in the control ink `#10110f`, right + bottom in the edge grey `#b7b8b0`. QTY box was a 1 px frame in the number's own ink on all four sides; the note field was ink on all four. Fill unchanged (QTY white — orange multi-qty on a well would fail 4.5:1 until item 12; note field on the well). The evidence pickers (platform, SKU home bin) are flush fact-row controls with no box and stay so. The trial (`[data-mode] :is(input, textarea, select)` top edge `#b7b8b0`) would have LIGHTENED the note field's ink top edge — deleted, not folded | `RECORD_RECESS_CLASS` in `industrial-record.ts` → `RECORD_QTY_BADGE_CLASS`, `LedgerNoteField` (row overlay + evidence column). Shots `12-recess-{before,after}-{rows,evidence}.png`, `12-recess-after-note-field.png` |

### 8a. Palette reverted; existing colours with black/white initials

Latest owner instruction: “Revert the staff color changes and just implement the initial
white or black for the existing staff colors.” Removed the palette, display mapping, API
restrictions and added colour controls. Restored the original editors and arbitrary hex
support. `staff.color_hex` remains the source of truth; no database colours were changed.

`blackOrWhiteInk` chooses pure black or white by maximum WCAG contrast in `IdentityMark`
and the staff recipient list. Existing square geometry and typography remain unchanged.
Screenshots `14-*` and `15-*` are superseded palette experiments. Item 9 is unchanged.

Validation: 11 contrast/cache tests and changed-file lint pass. Live `:3050` verification
confirms Sang retains `#a855f7`, Thuc retains `#3b82f6`, both with black initials, and the
added footer colour control is removed. Screenshot: `16-original-staff-colours.png`.

`pnpm verify:fast` remains red in unrelated work: `use-record-view.ts` UUID lint,
four lifecycle badge argument type errors in mobile/outbound order views, six paperwork
boundary crossings, the mobile ground baseline and an unclassified paperwork sheet.
Token generation passes. Full output: `/tmp/cf-staff-revert-verify.log`.

Open trials still registered (`packages/design-tokens/src/trials.ts`): `sectionRules`.
Delete it when its item below lands or is rejected.

## Queue (in order — one per turn)

### 9. Crisp vertical compartment rules (trial `sectionRules`)
- The right-column rules (`.cf-section-rule`, ship-by / QTY / next) use `border-mode-edge`
  `#b7b8b0` (2.00:1 on white). Owner already removed the hairline left of LISTING — do not re-add.
  Decide edge vs ink; delete the trial.

### 10. Pick/pack timestamps to 12 px
- Stamp is `text-[9px]` in `LedgerStageAssign` (`outbound-orders-ledger-editors.tsx`), below BRIEF §8
  (values ≥ 12). Band 3 is 32 px — measure fit before raising; drop "Not yet" (the dashed avatar
  already says unassigned) if space is needed.

### 11. One empty-value mark
- Today: `--` (condition), `—` (date, listing, pick/pack). Pick one (`—`) and apply across the row.

### 12. Neutral ink quantity badge
- `orderRowQtyTone` (`src/lib/condition-tone.ts`) paints qty > 1 in the warning ink, colliding with URG amber. Use ink + heavier weight.

### 13. No-photo icon instead of initials
- Photo lane shows grey initials (`initials(view.title)`) that read as codes. Use a muted
  `ImageOff`-style icon on the well. Same in the evidence column photo slot.

### 14. BIN UNASSIGNED noise — needs an owner ruling first
- 28 of 28 rows read amber `UNASSIGNED`; amber also means urgent. Options: neutral `BIN —` on the
  row + the NO BIN count/filter carries the problem; or keep amber. Ask, don't implement.

## Known facts / traps

- `/shipping` layout already wraps the page in `ModeRegion mode="industrial"`; do not add another.
- Grain uses `:where()` (zero specificity) — a component's own `background-image` wins. No amber text
  on a well (4.54:1 bare). Grain ceiling on bars is 7 % (8 % fails urgent ink).
- The customer name on band 1 is the elastic span; the city truncates first.
- `lifecycle.guard.test.ts` + `modes.guard.test.ts` must stay green.
- Known unrelated reds from the preamble still apply.
