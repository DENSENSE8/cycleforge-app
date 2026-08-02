# Printed code ↔ scan round-trip — HANDOFF

**Date:** 2026-08-02 · `main` · **Lane:** WS-DOGFOOD
**Status:** Not started. This document is the whole brief; there is no separate PLAN.
**Predecessor:** `interop-linkage-standards-HANDOFF.md` (shipped — it deleted the borrowed
`DEFAULT_GLN` and added `locationLabelPayload`, which is *why* there are now two encode
paths to reconcile).

---

## The job in one sentence

Every barcode this product prints must be minted by **one** encoder and resolved by **one**
decoder, every payload form ever printed must keep scanning, and the surfaces that invite a
scan must actually accept one — starting with **Move photos between purchase orders**, where
the box says "type or scan" and a scanned carton sticker currently matches nothing.

---

## The source of truth, stated once

```
        ENCODE                                  DECODE
   encodePrintMatrix()  ─── printed symbol ───► routeScan()
   @/lib/qr/platform-link                       @/lib/barcode-routing
```

- **`encodePrintMatrix`** returns the three coupled decisions — `{ value, symbology, hri }`.
  Nothing else may decide any of them. Guarded by
  [`print-matrix-sot.guard.test.ts`](../../src/lib/qr/print-matrix-sot.guard.test.ts).
- **`routeScan`** turns any scanned/typed/pasted string into `{ type, value, redirect? }`.
  It is the only thing allowed to interpret a scan.
- **The invariant that ties them:** *anything `encodePrintMatrix` can mint, `routeScan` must
  resolve to the right entity.* `barcode-routing.test.ts` → *"every generated handle
  round-trips"* already asserts this for the handle kinds. **Extend that test; do not write a
  second one.**

Neither half is new. The work is closing the places that sit outside them.

---

## What is already true (verified by code read — re-confirm before relying on it)

`encodePrintMatrix` covers **four** kinds — `carton | unit | as_listed | ticket`
([platform-link.ts:89–116](../../src/lib/qr/platform-link.ts)). Three more printers are
**allowlisted out** of it in the guard, each with a stated reason (`repair`, `handling-unit`,
`manifest` — "the path it would point at has no anonymous landing").

Location labels (bin + rack) go through a **different** function —
`locationLabelPayload` ([barcode-routing.ts](../../src/lib/barcode-routing.ts)) — added
yesterday when the borrowed GLN was removed. That is the first thing to reconcile: see P1.

### Payload forms currently in the wild

Every one of these is on a sticker somewhere and **must keep resolving**:

| Form | Example | Minted by |
|---|---|---|
| Absolute platform Digital Link | `https://{slug}.app.cycleforge.ai/m/r/1234` | `encodePrintMatrix('carton')` → `mobileQrUrl` |
| GS1 Digital Link (unit) | `https://…/01/{gtin}/21/{serial}` | `unitPlatformDigitalLink` |
| GS1 element string (unit) | `(01){gtin}(21){serial}` | `gs1UnitAi` — the no-slug fallback |
| GS1 element string (location) | `(414){gln}(254)A0101101` | legacy + licensed-GLN `locationLabelPayload` |
| FNC1 form of either | `414…\x1D254…` | industrial scanners re-emit this |
| Bare flat location code | `A0101101` | `locationLabelPayload`, no-GLN case (**new**) |
| Bare handles | `R-1234` `L-567` `U-CN1A2B3` `H-12` `T-9395` `REP-89` `KIT-…` `RCV-123` | the handle factories |
| Legacy location URL | `/414/{gln}/254/{code}` | pre-DataMatrix printer |

**The borrowed-GLN labels are the important back-compat case.** Every location sticker
printed before 2026-08-02 carries `0614141000005` — GS1's documentation GLN. Nothing is
being re-printed, so `routeScan` must keep resolving them **forever**, and
`barcode-routing.test.ts` already pins all three of their forms. Do not "clean up" those
assertions.

---

## Three defects this lane closes

### D1 — Two encode paths (introduced yesterday, by me)

`locationLabelPayload` is a second `{ value, symbology }` decision living outside
`encodePrintMatrix`. It is correct in behaviour but wrong in shape: the whole point of the
encode SoT is that there is one.

**Do:** fold locations in as `kind: 'location'` on `PrintMatrixArgs`, with
`locationLabelPayload` either deleted or reduced to a thin internal helper the new case
calls. **Or**, if locations genuinely cannot fit (they carry no `orgSlug`, mint no URL, and
have their own rack/bin split), add them to the guard's allowlist **with the reason written
out**, the same way `repair`/`handling-unit`/`manifest` are. Either answer is acceptable.
Silently leaving two encoders is not.

### D2 — Move photos: "type or scan" cannot read a scan

[`MovePhotosBetweenPoPanel.tsx:302`](../../src/components/receiving/workspace/line-edit/MovePhotosBetweenPoPanel.tsx)
places the operator in front of an input labelled **"Type or scan a different PO — not this
carton."** That input is a plain `<input type="search">` whose value goes to
`parsePoListSearch` ([po-list-search.ts](../../src/lib/receiving/po-list-search.ts)), which
accepts **only** `R-{id}` / `RCV-{id}` (with an optional leading `#`).

A carton sticker printed today encodes `https://{slug}.app.cycleforge.ai/m/r/1234`. That
string reaches the box as a text needle, matches no PO, and the operator gets an empty list
with no explanation. The panel never imports `routeScan` (grep: 0 occurrences).

> **Confidence:** this is a code-read conclusion, not a bench observation — I did not scan a
> physical label. **Reproduce it first** (see *Pages to test with*), because if it already
> works there is a code path I did not find and the rest of this section is wrong.

**Do:** route the input through `routeScan()`, accept `type === 'receiving'`, and extract the
id from the `redirect` (`/m/r/{id}`). Keep the typed-text search working — an operator typing
a PO number is the common case and must not regress. `parsePoListSearch` then becomes a
*post*-`routeScan` fallback for human text, not a parallel decoder.

**The general rule this establishes:** *any* input whose placeholder says "scan" routes
through `routeScan` first. There are ~20 components with scan-inviting copy
(`grep -rl 'or scan\|Scan a ' src/components`) and only a handful import the decoder — audit
them, fix the ones that are genuinely scan targets, and **fix the copy** on the ones that are
not. A box that says "scan" and cannot is worse than one that says "type".

### D3 — Station scan bar coverage for the new bare flat code

`locationLabelPayload` now emits a bare `A0101101` for tenants with no licensed GLN. A
`routeScan` branch for it landed with that change (5b, flat-code → `routeLocationCode`), and
`barcode-routing.test.ts` pins bin-vs-rack and case-normalisation. **What is NOT verified is
the bench path**: `StationScanBar` → `useGlobalWedgeScanner` / `resolveTestingScan` /
`/api/scan/resolve`.

`/api/scan/resolve` runs its **own** cascade (`classifyInput`, `parseScannedUrl`,
`parseGs1AiPayload`) *before* `routeScan`. Confirm a bare flat code is not swallowed by an
earlier arm and mis-classified as a serial fragment — `classifyInput`'s
`serial_partial` bucket is the risk. If it is, the fix belongs in the cascade order, not in a
new branch.

---

## Phases

Each ships alone.

### P1 — one encoder

Fold locations into `encodePrintMatrix` (or allowlist them with a written reason). Extend
`print-matrix-sot.guard.test.ts` so the location printers are covered by the same
"adapters delegate / no hardcoded symbology" assertions the other four kinds already carry.
No behaviour change — the six printer call sites keep rendering exactly what they render now
(`location-label-encoding.guard.test.ts` is the pin for that).

### P2 — one decoder at every scan-inviting input

Fix Move photos (D2). Then audit the rest of the "type or scan" inputs and either wire them
to `routeScan` or correct their copy. Prefer a small shared hook over N call sites repeating
the same parse-then-branch — but **do not** invent a second resolver; the hook wraps
`routeScan`.

### P3 — round-trip completeness

Extend `barcode-routing.test.ts`'s existing round-trip test so **every kind
`encodePrintMatrix` can emit** is asserted to scan back to the right `type` — including the
URL forms, not just the bare handles it covers today. The current test only walks the
`*Handle()` factories, which is why the carton-URL gap in D2 was invisible.

### P4 — bench + server cascade

Verify D3 end-to-end: bare flat code and legacy GLN label both resolve through
`/api/scan/resolve` and through the station wedge. Extend
[`receiving-scan-resolution.spec.ts`](../../tests/e2e/receiving-scan-resolution.spec.ts) —
it is the existing home for exactly this.

---

## Pages to test with

Grouped by what they prove. Dev server is the operator's, on **`:3050`** — attach, never start.

**Print / preview the codes**
| Page | Proves |
|---|---|
| `/warehouse?tab=labels` | Bin label printer — preview + print. With no GLN configured expect a **plain** DataMatrix of `A0101101`; with a licensed GLN, `(414)…(254)…`. |
| `/warehouse?tab=racks` | Rack printer, same two cases, position=00. |
| `/unbox` → carton → Print | Carton sticker (absolute platform URL) + As-listed (`L-{id}`). |
| `/products?view=labels` | Unit labels — GS1 Digital Link vs `(01)(21)` element string. |

**Scan them back**
| Page | Proves |
|---|---|
| `/m/scan` | Universal mobile scan — the widest decode surface; paste each payload from the table above. |
| `/unbox` → tool push → **Move photos between purchase orders** | **D2.** Paste a carton's printed URL into "Type or scan a different PO". |
| `/shipping/scan-out` | Scan-out station wedge. |
| `/api/scan/resolve?value=…` | **D3.** The server cascade, in isolation from any UI. |

**Landing pages a scan redirects to** — each must render, not 404
| Payload | Lands on |
|---|---|
| `A0101101` / `(414)…(254)A0101101` | `/inventory?bin=A0101101` |
| `A0101100` (position=00) | `/warehouse?tab=racks&code=A0101100` |
| `R-1234` / carton URL | `/m/r/1234` |
| `L-567` | `/m/l/567` → proxy-rewritten to `/receiving/lines/567` (there is no `/m/l` directory — [proxy.ts:136](../../src/proxy.ts)) |
| `U-CN1A2B3` | `/m/u/CN1A2B3` |
| `H-12` | `/m/h/12` |
| `T-9395` | `/support?ticket=9395` |
| `(01){gtin}(21){serial}` | `/01/{gtin}/21/{serial}` |
| `/414/{gln}/254/{code}` | legacy location DL — must still resolve |

**Read surfaces** — `/carton/[id]` and `/inventory/units?unit={id}` are where a scan of a
carton or unit ultimately lands; confirm the record actually opens rather than an empty state.

---

## Do NOT

- **Add a third encoder or a second decoder.** The entire lane is subtraction.
- **Break a payload form in the table above.** Nothing is being re-printed; a warehouse full
  of stickers is the installed base. Every removal needs a positive test that the old form
  still resolves.
- **Re-introduce a default GLN.** `interop-vocabulary.guard.test.ts` asserts
  `barcode-routing.ts` exports no `DEFAULT_GLN`, and `isLicensedGln` (`@/lib/interop/gs1-keys`)
  is the one licensed/placeholder answer — including the mod-10 check digit, without which
  bwip-js throws `GS1badChecksum` at render and blanks the label.
- **Widen `parsePoListSearch` into a general scan parser.** It is a human-text helper; the
  scan path is `routeScan`.
- **Loosen `LOCATION_FLAT_RE`** (`^[A-Z]\d{7,8}$`) to catch more shapes. It is deliberately
  narrow so existing short bin barcodes (`A12`, `B04`) keep their old behaviour.
- **Raise a ratchet baseline.** Guards shrink only.
- **Start, restart, or kill the dev server.** The user's runs on `:3050` — attach.

---

## Done when

- `npm run verify` green, no baseline raised, no new migration.
- One encoder: either locations are a `kind` on `encodePrintMatrix`, or they are allowlisted
  with a written reason. `print-matrix-sot.guard.test.ts` covers whichever answer shipped.
- Scanning a printed carton label into **Move photos** selects that PO.
- The round-trip test walks every kind `encodePrintMatrix` can emit, URL forms included.
- Every payload in the wild-forms table resolves, pinned by a test — legacy borrowed-GLN
  labels included.

## Report back

1. Which answer P1 took (fold in vs allowlist), and why.
2. Whether D2 reproduced as described — and if not, what the real path was.
3. Any scan-inviting input you found that could not read a scan, and whether you fixed the
   input or the copy.
4. Whether `/api/scan/resolve`'s cascade mis-classifies a bare flat location code.
5. Anything above you believe is wrong.

---

## Reference

- Encode SoT: [`platform-link.ts`](../../src/lib/qr/platform-link.ts) ·
  guard [`print-matrix-sot.guard.test.ts`](../../src/lib/qr/print-matrix-sot.guard.test.ts)
- Decode SoT: [`barcode-routing.ts`](../../src/lib/barcode-routing.ts) ·
  tests [`barcode-routing.test.ts`](../../src/lib/barcode-routing.test.ts)
- Location payload: `locationLabelPayload` + [`location-label-encoding.guard.test.ts`](../../src/components/barcode/location-label-encoding.guard.test.ts)
- Licensed-GLN predicate: `isLicensedGln` [`gs1-keys.ts`](../../src/lib/interop/gs1-keys.ts)
- Stored-config migration: `sanitizeStoredGln` + [`stored-gln-sanitize.test.ts`](../../src/components/barcode/stored-gln-sanitize.test.ts)
- Symbology renderer: [`dataMatrixSvg.ts`](../../src/lib/barcode/dataMatrixSvg.ts) ·
  [`Gs1DataMatrix.tsx`](../../src/components/barcode/Gs1DataMatrix.tsx)
