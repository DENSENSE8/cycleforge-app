# Handoff prompt — Kiosk landscape shell: paper document icon (top-right)

**Paste this as the first user message for the next agent.** Do not re-plan the whole kiosk; this task is narrow.

---

## Task (one sentence)

On the landscape kiosk shell (`/kiosk/v2`), put the **repair paperwork paper icon** (`FileText` via `RepairPaperworkSheet`) in the **top-right of the detail pane header**, so the live intake agreement is reachable at any point during repair entry — same acceptance as staff `RepairIntakeForm` (P2-RPR-01).

## Why

Proven `/kiosk` + `RepairIntakeForm` already has:

```477:482:src/components/repair/RepairIntakeForm.tsx
                    <div className="relative z-10 ml-auto flex shrink-0 items-center justify-end gap-1 sm:gap-2">
                        {/* Paperwork — every step (acceptance B). Close is rightmost escape. */}
                        <RepairPaperworkSheet
                            active={showPaperwork}
                            onToggle={() => setShowPaperwork((v) => !v)}
                        />
```

The SoT toggle is [`RepairPaperworkSheet.tsx`](../../src/components/repair/RepairPaperworkSheet.tsx) — **compose it**, do not fork a second paper button.

Landscape [`KioskShell.tsx`](../../src/app/kiosk/KioskShell.tsx) detail header is currently title-only; [`KioskRepairPane.tsx`](../../src/app/kiosk/v2/KioskRepairPane.tsx) only shows `RepairPaperworkCanvas` **after submit**. Operators cannot preview the agreement while filling issue / customer / signature.

## Target UX

```
┌──────────── Left rail ────────────┬──────── Detail header ─────────────────┐
│ Catalog                           │ Repair Details          [📄]           │
│                                   ├────────────────────────────────────────┤
│                                   │ Issue / customer / sign  OR  paper     │
│                                   │ document (toggle via 📄)               │
└───────────────────────────────────┴────────────────────────────────────────┘
                                    │ Bottom dock: Repair | Buy/Sell | Pickup │
```

- **Icon:** top-right of the **detail pane** header (not the global staff header; not the left Catalog header).
- **Toggle behavior:** swap the right-pane **body** between intake form and `RepairPaperworkCanvas` + `RepairServiceForm` with `buildRepairIntakeReceiptProps` from current draft (same as `RepairIntakeForm` / post-submit view). No dialog / sheet / portal.
- **When:** available whenever mode is **Repair** and a product is selected (or always in repair mode with empty-state paperwork copy — prefer “enabled once product selected,” disabled + tooltip otherwise).
- **Sales mode:** hide the paper icon (no repair agreement). Do not invent a sales receipt toggle in this task.
- **Dock:** stays visible (kiosk-shell law: no full-bleed form swap that kills the dock). Paper view replaces **detail body only**.

## Compose — do not invent

| Need | Use |
|---|---|
| Toggle control | `RepairPaperworkSheet` |
| Document surface | `RepairPaperworkCanvas` + `RepairServiceForm` `surface="screen"` |
| Props builder | `buildRepairIntakeReceiptProps` from `@/lib/repair/repair-intake-receipt` |
| Draft fields | Existing `formData` in `KioskRepairPane` (+ signature if present) |
| Display law | `.claude/rules/display/kiosk-shell.md` |
| Preview entry | Header monitor icon / Quick Access “Kiosk shell preview” → `/kiosk/v2` |

## Implementation sketch (preferred)

1. Lift or keep `showPaperwork` state in `KioskRepairPane` (or shell if header lives in `KioskShell`).
2. Detail header in `KioskShell` for repair mode: title left, `RepairPaperworkSheet` right — **or** move the repair detail header into `KioskRepairPane` so the toggle owns its body swap without prop-drilling.
3. When `showPaperwork`, render paper canvas instead of issue/customer/sign stack; when off, current form.
4. After successful submit, keep current success + paper view; don’t fight the Done path.
5. Optional: E2E on `/kiosk/v2` — after pair + select product, assert paperwork button visible and toggles document.

## Out of scope

- Blob upload for attract media  
- Cutover of main `/kiosk` off welcome tiles  
- Dual-display pairing  
- Sales receipt / counter paperwork  
- Changing `RepairPaperworkSheet` API unless a tiny growth is required for density (`size`)

## Done when

- [ ] Repair mode detail header shows paper icon top-right  
- [ ] Toggle shows live agreement from current draft; toggle again returns to form  
- [ ] Sales mode has no paper icon  
- [ ] Bottom dock still visible during paper view  
- [ ] Reuses `RepairPaperworkSheet` (no twin)  
- [ ] `npm run verify` (or `--fast` mid-loop) green  

## Branch / safety

Stay on the current checkout branch. User owns commits. Never start/restart the dev server — attach to `:3050`. Never commit `.env`.

## Verify preview

Staff desktop: global header **monitor** icon or Quick Access → **Kiosk shell preview** → `/kiosk/v2` → Repair → pick a catalog service → paper icon top-right of detail header.
