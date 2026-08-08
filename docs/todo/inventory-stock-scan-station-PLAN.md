# Plan — Inventory / stock scan station (putaway · relocate · pre-box stock)

**For:** product + implementing agent  
**From:** Cycle Forge engineering  
**Date:** 2026-08-08  
**Status:** decision plan — **do not implement until §0 is locked**  
**Lane:** `main` checkout — attach to `:3050`. User owns commits.  
**Product frame:** Cycle Forge multi-tenant reseller-ops SaaS. USAV is dogfood only.

---

## 0. Verdict (read this first)

### Do you need a new page?

| Job you described | Already owned by | New Scan Station? |
|---|---|---|
| **First-issue product/unit label after a QC Pass** | Testing · Quality Control — dock **Pass · Print Label** | **No.** Never fork a twin. |
| **Bulk / reprint SKU barcodes** | Catalog → SKU Barcodes (`/products?view=labels`) | **No.** |
| **Kit / multi-serial master sticker (“prebox” as combine)** | Unbox Displays → Units · Prebox (`PreboxWizard` · `label_manifests`) | **No.** |
| **FBA vs “Pre-box & stock” channel decision** | Amazon Prep · Ready disposition (`PREBOX_STOCK`) — mostly **display today** | Wire CTA later; not a second print bench. |
| **Scan unit → scan destination bin / shelf (move stock)** | APIs + mobile only (`POST /api/serial-units/[id]/move`, `/m/u/[id]`) | **Yes — this is the real gap.** |
| **After test: put labeled unit into warehouse stock (pre-box shelf)** | Nowhere as a wedge scan station | **Yes, as putaway of TESTED units** — compose move + optional reprint. |

**One-liner:** Testing already prints the label. What you are missing is a **stock putaway / relocate** bench — not another Pass · Print surface.

If the only daily pain is “I forget to print after Pass,” fix Testing dock / training — **do not** add a floor station.  
If operators routinely **walk tested (or restock) units to bins** with a scanner, add the station below.

---

## 1. Name the job (operator vocabulary)

Avoid the word **Inventory** as the Scan Station parent — Inventory is already a **domain desk** (ledger · locations · pulse). One word → one job.

| Candidate face | Fit | Notes |
|---|---|---|
| **Stock** | Best short parent | “Stock” = put units where they live. Leaves Inventory desk alone. |
| **Putaway** | Best if move-to-bin is 90% of the job | Warehouse noun; clear after Testing. |
| **Relocate** | Narrow | Good leaf verb; weak as the only L1 if you also reprint. |
| **Stage** | Risky | Collides with pack-stage / FBA stage language. |
| **Pre-box** | Avoid as L1 | Already a disposition (`PREBOX_STOCK`) and an Unbox kit wizard. Overloaded. |

**Recommended IA:**

```
Scan Stations
  Receiving · Walk-In
  Testing
  Stock          ← NEW (between Testing and Packing)
  Packing
  Scan out
```

**Stock L2 (if you need more than one leaf later):**

| Leaf | Job |
|---|---|
| **Putaway** (default) | Scan unit → scan bin → confirm move. Optional **Reprint** unit label. |
| **Transfer** (later) | SKU qty bin→bin (`/api/transfers`) — not serial wedge; may stay Inventory desk. |

Ship **one modeless station** first (`/stock` or `/putaway`). Add L2 only when Transfer proves it needs a scanner home.

Wire id suggestion: `stock` (or `putaway`). Permission: start with `sku_stock.view` / a dedicated `stock.move` if you want tighter gates — **ask before inventing a permission**.

---

## 2. Why between Testing and Packing

Pipeline today:

```
Arrival → Unbox → Testing (Pass · Print) → [gap] → Packing → Scan out
```

Physical truth after Pass:

1. Unit is `TESTED` (domain: **testing changes no placement** — `recordTestVerdict` keeps `binId: null`).
2. Unit sticker may already be on the unit (Pass · Print).
3. Operator still must **put the unit somewhere** (stock shelf / pre-box area / FBA staging) **or** send it straight to Pack if an order is waiting.

So the new bench sits **after QC geography starts** and **before Pack assumes a ready unit**. Nav placement between Testing and Packing matches that. Walk-In stays parallel (counter), not in this pipeline.

**Not a substitute for Packing.** Pack consumes `TESTED` / ready queues. Stock owns **where the physical unit sits**.

---

## 3. What Testing QC already does (do not re-own)

Concrete flow (`TestingPanel` · `useTestingLineController`):

1. Scan / attach serial on carton line  
2. Works-as-listed / Not-as-listed  
3. Verdict → Pass sets unit `TESTED` (**no bin write**)  
4. Dock **Pass · Print Label** → mint unit id → `printProductLabel` (unit sticker) → advance slot  

Fail never prints. Location / shelf / pre-box are **not** in Testing Displays.

**Hard law for this plan:** Stock station may **reprint** via existing `printProductLabel` / Catalog kinds. It must **not** mint a second “Pass · Print” verdict path or duplicate `TESTING_LABEL_KINDS` ownership.

---

## 4. What “pre-box” means in this repo (three different jobs)

| Sense | Where it lives | Stock station role |
|---|---|---|
| **A. Channel: Pre-box & stock** | `PREBOX_STOCK` disposition · Amazon Prep Ready chip | Optional: after putaway, paint/confirm disposition — or leave Ready as the decision surface and Stock as the execute move |
| **B. Kit / master label** | Unbox `PreboxWizard` · `prebox_master` manifests | Stay on Unbox Displays — do not move kit combine into Stock |
| **C. Operator slang: “label it and shelf it for later pack”** | Missing as one wedge flow | **This is Putaway** — reprint optional; move required |

When operators say “pre-box station,” they usually mean **C**, sometimes **A**. Confirm which before building.

---

## 5. Recommended surface contract (if you green-light a station)

### Archetype
**Scan Station** (Station region) — same host grammar as Arrival / Unbox / Testing:

- Centre = ops flow only (identity + move steps)  
- Displays = Action tools (history · reprint · location map peek) — not a desk inspector  
- Bottom dock = terminal CTA (Confirm move · optional Reprint)  
- Compose `StationScanPaneHost` / Displays push — never a floating right rail twin  

### Primary wedge loop (Putaway)

```
1. Scan unit label / serial  → resolve serial_unit (must exist; prefer TESTED or STOCKED)
2. Show identity: SKU · serial · unit id · current location · status
3. Scan destination bin barcode → resolve location
4. Confirm → POST /api/serial-units/[id]/move  (compose — do not fork)
5. Toast + clear for next unit (act-and-clear)
```

**Optional dock trailing:** Reprint unit label (same `printProductLabel` path Testing uses — no new printer stack).

### What it is not
- Not QC verdicts  
- Not order packing  
- Not FBA plan/combine  
- Not Locations map editor (Inventory desk keeps Bin Tags / Racks printers)  
- Not SKU qty transfer v1 (desk or later L2)

### Empty / error honesty
- Unknown unit → unmatched, don’t invent  
- Destination bin unknown → refuse move  
- Same bin → no-op toast  
- Unit on open order / locked status → explicit block with reason (define matrix in implementation)

---

## 6. Compose map (reuse — don’t rebuild)

| Need | Compose from |
|---|---|
| Serial → bin move | `POST /api/serial-units/[id]/move` (+ events already emitted) |
| Mobile reference UX | `/m/u/[id]` move + `PrepackedProductSheet` (scan unit → scan bin) |
| Unit label print / reprint | `printProductLabel` · `unitLabelCore` · existing print job logging |
| Barcode decode | `routeScan` / station scan bar SoT — never a second decoder |
| Station chrome | Unbox/Testing golden: dock · Displays · centre ops-flow only |
| Nav | `APP_SIDEBAR_NAV` + `SIDEBAR_PAGE_NAV` + `STATION_*` icons · insert **after** `tech`, **before** `packer` |
| Channel pre-box (later) | `ChannelDisposition` / Ready grid — link “execute putaway” → `/stock?unit=` |

**Delete / avoid:** new print pipeline, new status machine for “preboxed”, page-local move API twin.

---

## 7. Decision tree (lock before code)

```
Is the daily pain “label after Pass”?
  YES → improve Testing only. STOP.
  NO  ↓

Is the daily pain “put this unit in a bin / shelf with a scanner”?
  NO  → stay on mobile /m/u + Inventory desk. STOP (or phone-first polish).
  YES ↓

Is kit combine (multi-serial → one master sticker) in scope?
  YES → that stays Unbox Prebox; Stock does not own it.
  NO  ↓

GREEN-LIGHT: modeless Stock / Putaway Scan Station between Testing and Packing.
```

**Open questions for you (answer before Phase 0):**

1. Is v1 **only** serial putaway, or must it also print when the unit has **never** been labeled (skip Testing)?  
2. Should Putaway accept only `TESTED`, or also Unboxed / restock / returns?  
3. Is “Pre-box & stock” disposition a **required write** on confirm, or leave Ready alone?  
4. Desktop-first or is mobile `/m/u` enough for 6 months?

---

## 8. Phased delivery (only after §7 answers)

### Phase 0 — Spec lock (½ day)
- Lock name (**Stock** vs **Putaway**), route (`/stock` or `/putaway`), permission  
- Lock unit status allow-list + error matrix  
- Confirm reprint is optional trailing, not primary CTA  

### Phase 1 — Thin station shell (1–2 days)
- Floor nav row between Testing and Packing  
- `RouteShell` + scan bar + identity card + dock Confirm  
- Wire `serial-units/[id]/move` only  
- Guards: station centre ops-flow; no dual right columns  

### Phase 2 — Operator completeness (1–2 days)
- Recent moves rail / Displays history leaf  
- Reprint unit label from dock  
- Deep-link `?unit=` / `?serial=` from Ready “Pre-box” chip (if disposition wiring wanted)  
- Prefetch + barcode routing entries  

### Phase 3 — Only if proven
- Stock L2 Transfer (qty) **or** keep on Inventory  
- Disposition write `PREBOX_STOCK` on putaway  
- Goal chip / shift KPI for putaways  

### Explicit non-goals for v1
- Replacing Testing Pass · Print  
- Moving PreboxWizard off Unbox  
- Bin/rack **label design** (stays Locations)  
- Auto-putaway on Pass (keeps Testing fast; putaway stays intentional)

---

## 9. Nav sketch (target)

```
Scan Stations
  Receiving
    Arrival · Unbox
  Walk-In
    Local Pickup · Repair
  Testing          (QC owns first label)
  Stock            ← NEW — putaway / relocate (+ optional reprint)
  Packing
  Scan out
```

Header page switcher: Stock is modeless (like Packing / Scan out) unless L2 appears later.

---

## 10. Success criteria

- Operators no longer use Inventory tables or ad-hoc `/m/u` as the primary **scanner putaway** home (if desktop stock is green-lit).  
- Testing Pass · Print call volume / ownership unchanged (no twin CTA elsewhere for first issue).  
- Every Stock confirm is one `serial-units/.../move` (audit/event parity with mobile).  
- Floor order reads as physical pipeline: test → stock → pack.  
- `npm run verify` green; station centre + Displays guards hold.

---

## 11. Recommendation summary

1. **Do not** add a station whose headline job is “print labels after testing.”  
2. **Do** add a **Stock / Putaway** Scan Station **if** bin relocate is a real floor rhythm — place it **between Testing and Packing**.  
3. Treat “pre-box” carefully: shelf putaway ≠ Unbox kit prebox ≠ Ready `PREBOX_STOCK` chip.  
4. Compose move + optional reprint; grow Ready → Stock deep-links only after the wedge loop works.

**Next step:** answer §7 questions (especially 1–3). Then Phase 0 naming/route lock → Phase 1 shell.
