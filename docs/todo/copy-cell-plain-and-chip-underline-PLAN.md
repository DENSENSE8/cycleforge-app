# Click-to-copy cells + drop CopyChip underline

**Date:** 2026-08-04 · **Status:** ✅ Phases 1–4 done (2026-08-04) · **Lane:** main

## Done

- Quiet CopyChip faces (no `border-b-2`); `CHIP_TONES.underline` + `underlineClass` removed
- Empty-add = option **A** (icon + muted label, no dashed rule)
- `CopyableCellValue` on `useCopyChip`; `CopyableId` re-exports it
- Guard: `src/components/ui/copy-chip-quiet-face.guard.test.ts`
- Docs: SoT copy-chip section + `DESIGN_SYSTEM.md` table
- **Phase 3 mounts** — Catalog SKU · bins barcode · receiving location · Ready trail · Warranty SKU · Tech All subtitle · Unfound ticket
- **Phase 4**
  - Keyboard: focused chip/cell face + ⌘/Ctrl+C copies full value (`useCopyChip.handleKeyDown`)
  - Right-click: secondary copy on chip/cell (preventDefault; richer Open/Edit stay on hover menus)
  - Selection TSV: bins bulk **Copy** + catalog **CatalogBulkActionBar** via `toTsvBlock` / `formatBinsCopyRow` / `formatCatalogCopyRow`

## Out of scope / later

- Full right-click menu with Copy row · Open (surface-specific; hover menus already cover Open/Edit)
- Receiving “Copy details” → migrate from bullet lines to TSV header block (behavior change)
- Repair ticket-list → full TSV schema

---

_Original plan body below retained for context._

## Product frame

Two related gaps, one SoT:

1. **Cell extraction default** — operators already get click-to-copy on typed `CopyChip`s. Plain mono cells (catalog SKU, bin barcode, location, title-trail ids) often do not. Those cells should use the **same click-to-copy ritual**, without becoming a second chip family.
2. **Underline is optional noise** — the colored `border-b-2` on chip faces was the old “this is copyable” cue. Icon + mono + hover tooltip + click already carry that. Drop the solid underline from the chip face.

**Non-goals**

- No right-click-as-primary copy (secondary context menu can come later).
- No bulk TSV changes (`format-station-copy-row` stays selection-bar only).
- No teaching `UnderlineValue` / `StatusText` as identity chips — those keep their own jobs.
- No second clipboard/tooltip stack — grow `useCopyChip`, do not invent a twin of `CopyableId`.

---

## Current state (cite, do not rediscover)

| Layer | Path | Today |
|---|---|---|
| Format | `src/lib/copy-chip-format.ts` | last-8, `--------`, normalize |
| Behavior | `src/hooks/useCopyChip.ts` | click → clipboard + site tooltip “Copied” + history |
| Typed face | `src/components/ui/CopyChip.tsx` | icon + mono + **`border-b-2` tone underline** |
| Parallel plain copy | `…/product-hub/CopyableId.tsx` | full-value click-to-copy; **does not** use `useCopyChip`; `hover:underline` |
| Bulk extract | `src/lib/station/format-station-copy-row.ts` | selection → TSV |
| Flush guard | `copy-chip-grid-flush.guard.test.ts` | asserts `data-chip-face` pad flush — **not** underline |

Ops queues (Incoming / Receiving / Orders) already mount chips for order · tracking · serial. Gaps are plain mono columns and trails.

---

## Architecture — one behavior, two faces

```
                    useCopyChip (SoT)
                   /                \
          CopyChip face          CopyableCellValue face
     (typed id · last-8 ·        (full string · mono ·
      optional icon ·            no icon by default ·
      NO solid underline)        NO underline)
```

| Face | When | Display | Gesture |
|---|---|---|---|
| **CopyChip** | Typed identity columns (order · tracking · serial · FNSKU · ticket · price) | last-8 (or amount) + tone icon (or `plain`) | click → copy full value |
| **CopyableCellValue** | Plain cells that are still extractable ids (SKU · barcode · location · trail meta) | full visible string | click → copy full value |

Both:

- `stopPropagation` so row select / open still works on the rest of the cell
- site tooltip on hover (full value) + “Copied” flash on click
- `recordCopy` / history kind when known
- stay flush in grids (`data-chip-face` on chip faces; plain face is text-only, no extra `px`)

**Fold `CopyableId` into `CopyableCellValue`** (same module or re-export) so product-hub stops owning a parallel clipboard path.

---

## Phase 0 — SoT decisions (lock before code)

1. **Underline:** remove solid `border-b-2` from filled chip faces + group-count + skeleton + empty-SKU solid face.
2. **Empty “add” signal:** `AddValueChipFace` today uses **dashed** underline to mean “nothing here yet.” After solid underlines die, dashed alone is weaker. Replace with one of:
   - **A (prefer):** muted mono placeholder + tone icon only (no bottom rule), or
   - **B:** keep dashed **only** on `AddValueChipFace` as the sole remaining bottom-rule exception (document it).
3. **Tone registry:** keep `CHIP_TONES.*.underline` keys temporarily as **legacy aliases** renamed/repurposed, or delete and migrate `underlineClass` callers to icon-only overrides. Prefer **delete the underline key** and drop `underlineClass` from the public chip API once callers are clean.
4. **Do not** strip underlines from `UnderlineValue` / `StatusText` / scan-bar inputs — different vocabulary.

---

## Phase 1 — Quiet CopyChip (underline off)

**Grow:** `src/components/ui/CopyChip.tsx` (+ docs that name the border as the tone language).

1. Remove `border-b-2 pb-0.5` + `${resolvedUnderline}` from the base mono label span.
2. Same for sibling faces in the same file: `EmptySkuChipFace`, `SerialChipSkeleton`, `GroupCountChip`, `PlatformChip` (unless Platform keeps a non-copy underline — decide in Phase 0; default = quiet).
3. Resolve empty-add per Phase 0 (A or B).
4. Delete or deprecate `CHIP_TONES.*.underline` and `underlineClass` prop; migrate overrides (`ConditionGradeChip`, `IdentityLinkChip`, `NoSerialControl`, platform borders, etc.).
5. Update `.claude/rules/source-of-truth.md` (copy-chip section), `DESIGN_SYSTEM.md` CopyChip table (colors = icon/dot, not `border-*`), and any “border-b” comments in Po-line meta.
6. Add a small guard: filled `CopyChip` face must **not** include `border-b-2` (ratchet down). Exception allowlist only if Phase 0 picked B for `AddValueChipFace`.

**Verify:** visual spot-check Incoming / Receiving / Orders / Unbox meta row; `npm run verify`.

---

## Phase 2 — `CopyableCellValue` (plain cell click-to-copy)

**Grow:** prefer a thin export next to the chip family, e.g. `CopyableCellValue` in `CopyChip.tsx` **or** `src/design-system/components/CopyableCellValue.tsx` that **only** calls `useCopyChip`.

API sketch:

```ts
type CopyableCellValueProps = {
  value: string | null | undefined;
  /** Optional shorter face; clipboard always uses normalized full value. */
  display?: string;
  historyKind?: string;
  className?: string;
  dense?: boolean;
  disableCopy?: boolean;
};
```

Implementation notes:

- Button (or `role="button"`) with mono classes; **no** hover text-underline (that was `CopyableId`’s cue — drop it when underline philosophy is quiet).
- Cursor / hover: slight `text-text-soft → text-text-default` or `opacity` is enough; do not reintroduce underlines.
- Re-export / replace `CopyableId` to call this.

**Guard:** `CopyableId` (or its successor) must import `useCopyChip` — no direct `navigator.clipboard` twin.

---

## Phase 3 — Opt-in cell mounts (priority order)

Wire `CopyableCellValue` only where the column is an **extractable identity**, not every string cell.

| Priority | Surface | Cell | Notes |
|---|---|---|---|
| P0 | Catalog grid | SKU | full-value mono today, no copy |
| P0 | Bins grid | barcode | print/export exist; cell copy missing |
| P1 | Receiving | location / staging | plain mono / pill — copy barcode or label string |
| P1 | Ready / Warranty / Tech All | title-trail sku · serial · fnsku · asin | prefer promoting to real chip columns long-term; short-term wrap trail tokens |
| P2 | Unfound | ticket id | **careful** — editable; click-to-copy must not steal edit focus (menu chip or explicit copy control) |

Do **not** double-wrap cells that already render `OrderIdChip` / `TrackingChip` / `SerialChip`.

Row click: chip/cell button already `stopPropagation`; keep that. Selection checkbox remains independent.

---

## Phase 4 — Optional later (out of this plan’s critical path)

- Keyboard: focus cell face + Enter/⌘C copies (a11y polish).
- Right-click menu: Copy · Copy row · Open — secondary only.
- Selection “Copy” TSV on more `multiSelect` grids (reuse `toTsvBlock` schemas per family).

---

## Integration recipe (for a single plain cell)

Before:

```tsx
<span className="font-mono truncate">{row.sku}</span>
```

After:

```tsx
<CopyableCellValue value={row.sku} historyKind="sku" className="…" />
```

Typed column (already shipped — only loses underline in Phase 1):

```tsx
<OrderIdChip value={row.orderId} plain />
```

---

## Done when

- [ ] Filled CopyChip faces have no solid bottom rule; empty-add signal is explicit (A or B).
- [ ] `CHIP_TONES` / docs no longer describe tone as `border-*` underline.
- [ ] `CopyableCellValue` uses `useCopyChip`; `CopyableId` is folded or re-exported.
- [ ] Catalog SKU + bins barcode click-to-copy work; hover shows full value + Copied flash.
- [ ] Flush + new no-`border-b-2` guards green; `npm run verify` green.
- [ ] SoT docs updated in the same change.

---

## Ask-first checkpoints

1. Empty-add: **A** (no rule) vs **B** (dashed-only exception)?
2. Condition grade / platform chips: quiet with the rest, or keep a non-copy underline vocabulary?
3. Title-trail ids: wrap in place (P1) or force real columns + typed chips first?
