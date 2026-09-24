# HANDOFF — You own the SKU components: bring bay C-04 into the system, temp SKUs for everything unpaired, photos later (2026-09-24)

Paste this whole file into a fresh session in `~/Projects/cycleforge-lanes/prod`
(branch `prod/worktree-2026-09-11`, last pushed `4489e5692`). Read first, in order: `AGENTS.md`,
`docs/handoff/mobile-ds-law-exoskeleton-HANDOFF.md` (the mobile law and the SKU-exception state it
describes), `docs/design-system/HANDOFF-industrial-record-ledger.md` (desk record law),
`docs/mobile-first/SURFACE_LAW.md`. Do not commit unless the owner says so; when you push, the
pre-push hook runs `verify` (fix reds; `--no-verify` only with the owner's OK).

## The owner's ask (verbatim)

> "you are now in charge of — updating all the sku components now — gather all the inventory and
> the data and for no SKU for SKU create a temp SKU allow me to add photos later"

Plus a bin sheet for bay **C-04** (ITEM / SKU / QTY / NOTE per location). It is parsed into
**`docs/handoff/data/c04-bin-sheet-2026-09-24.json`** — 46 cells: 14 catalog-style SKUs, 9 bare
numbers, 1 `[OLD]-` SKU, 2 marked WRONG SKU, 11 with no SKU, 9 empty. Every cell keeps its raw
text; the parsed fields are a proposal. Do not re-type the sheet from the chat.

## What "done" means

1. Every non-empty C-04 cell is a real `(location, SKU, qty)` in the system:
   - a SKU that resolves to a Zoho catalog item → stock at that location under that SKU;
   - anything else (no SKU, WRONG SKU, a number / `[OLD]-` that does not resolve) → a **temp SKU**
     (`TMP-…`, on-hold placeholder) titled from the ITEM cell, with the sheet's SKU text and NOTE
     kept in its description, stocked at that location.
2. The owner can add photos later to every temp SKU from the phone (`/m/on-hold/[sku]/photos`) and
   the desk (`/inventory/sku-exceptions?sku=…` evidence column) — already built; verify it.
3. The SKU components the owner touches for this job all follow the current law (phone = repair-hub
   exoskeleton; desk = record ledger), and a temp SKU can be created **without a barcode** from both
   clients (today it cannot — see Step 2).
4. A dry-run report the owner approved before any write to the USAV org, and a post-write report
   that matches it.

## What already exists (don't rebuild)

- Temp SKU backend: `src/lib/neon/provisional-sku-queries.ts` (`createProvisionalSku`,
  `listProvisionalSkus`, `getProvisionalSkuDetail`, `updateProvisionalSku`, `mergeProvisionalSku`
  — merge moves bins, ledger and photos onto the real SKU), routes under
  `src/app/api/sku-catalog/provisional/**`, schema `src/lib/schemas/provisional-sku.ts`,
  migration `2026-09-24_on_hold_provisional_sku_description.sql` (applied). A temp SKU is a
  `sku_stock` row + an inactive `sku_catalog` row (`is_provisional`); its photos link as
  `SKU_STOCK` / `sku_stock.id`.
- Stock writes: `adjustBinQty` in `src/lib/neon/location-queries.ts` (ledger row + realtime
  `STOCK_DELTA_*`), `PATCH /api/locations/[barcode]`, phone keypad `putaway.adjust` over the WMS
  socket (fixed today: `z.guid()` org ids — the adapter runs under
  `garisek-wms-gateway.service`; restart it after touching `src/lib/realtime/wms-*`).
  `upsertBinContent` (`action: 'set'`) writes **no** ledger row — do not use it for a count.
- Phone: `/m/on-hold` queue, `/m/on-hold/[sku]` hub (+ `/info`, `/photos`, `/locations`, `/pair`),
  create sheet `src/components/mobile/scan/ProvisionalCreateSheet.tsx` (reached from
  `/m/pair/[code]` when the search has no hit).
- Desk: `/inventory/stock` and `/inventory/sku-exceptions` on
  `src/design-system/components/record-ledger/` (tabs Stock · SKU Exceptions · Ledger · Locations).
- Catalog search: `GET /api/sku-catalog/search?searchField=zoho_catalog` (Zoho items mirror).
  SKU identity law: read titles through `resolveSkuIdentityTitle`, join with
  `SKU_CATALOG_JOIN_ON_SQL` (`ds_sku_identity` / `sku-identity-guard` enforce it).

## Step 1 — decisions to put to the owner FIRST (one message, numbered, with defaults)

Do not write stock until these are answered. Recommended defaults in brackets.

- **D1 Location codes.** The sheet says `C-04-15-1` (4 segments); stored bins look like
  `C0409200` / face `C-04-09-2-00` (5 segments). Resolve each sheet code against `/api/locations`
  (or `locations` via `tenantQuery`) and list every code that does not match exactly one bin.
  [Map `C-04-RR-L` → the bin whose face starts `C-04-RR-L`; if none or several, ask.]
- **D2 `p` suffix** (`8+4p`, `9p`, `15 + 18p`). [`p` = parts: stock the units under the item's SKU
  and the parts under a separate temp SKU titled "<item> — parts", same location.]
- **D3 bare `+ n` and `bad`** (`13 + 3`, `16 + 6`, `72 + 1 bad`). [`+ n` = ask per row; `bad` =
  not stocked, noted in the description.]
- **D4 Bare numbers** (`736`, `86`, `847`, `1012`, `681`, `672`, `892`) and `[OLD]-01138`.
  [Resolve against the Zoho mirror (exact SKU, then item number); unresolved → temp SKU with the
  number in the description.]
- **D5 Same SKU, different titles** (`672` on three items; `00148-P-3-BK` on "Cable, Array extended
  black" and "AM input cable (Blank)"; `00148-P-3-WY` on "AM input cable 6 speaker (White)" and
  "Cable, Array extended white"; `00046-P-6` units vs "RM cover Parts"). [Trust the SKU, stock it;
  list the title mismatches for the owner — never rename a Zoho item (the Zoho item title governs).]
- **D6 WRONG SKU** (`45-P-2-BK`, C-04-13-1 and C-04-11-1, same product). [ONE temp SKU for both
  locations; description carries "Sheet SKU 45-P-2-BK marked WRONG; NEW, not used; in box".]
- **D7 Colour split** (C-04-07-1 "White: 2, Gray: 15"). [Two temp SKUs or two Zoho SKUs if they
  resolve; else one stock line of 17 with the split in the description.]
- **D8 Count semantics.** The sheet is a count, not a delivery. [Write `delta = sheet − current`
  per (location, SKU) through `adjustBinQty` with reason `CYCLE_COUNT` and a note
  "C-04 bin sheet 2026-09-24"; never blind `put`.]
- **D9 Empty-looking cells with a title but no qty** (C-04-15-1/2/6). [Create the temp SKU, no
  stock, flag "count needed".]
- **D10 Title cleanup** ("Boss" → "Bose", "(Blank)" → "(Black)"). [Temp SKU titles only; leave the
  raw text in the description.]

## Step 2 — temp SKU without a barcode (SKU components update)

Today `createProvisionalSku` derives the SKU from a scanned barcode (`TMP-<barcode>`) and the POST
body requires `barcode`. Sheet rows have no barcode, and the owner wants to create a temp SKU from
a name alone and add photos later.

- Make `barcode` optional in `ProvisionalCreateBody`; when absent, mint a stable key
  (recommend `TMP-` + a short base32 of a new sequence or of `(org, normalized title)` so a re-run
  of the import is idempotent — state the choice). `provisional_barcode` stays NULL (the partial
  unique index already allows that). Title uniqueness is NOT a key — two different boxes can share a
  name; the importer passes its own idempotency key (see Step 3).
- Phone: `ProvisionalCreateSheet` — barcode becomes optional ("No barcode" path), title required,
  description + photos optional (already). Desk: a **New temp SKU** action on
  `/inventory/sku-exceptions` (evidence-column form: title, description, optional barcode,
  optional location + qty) → same route. A later scan of the real barcode can be attached from
  `/info` (add `PATCH` support for `barcode` when the placeholder has none; conflict → 409).
- Tests: route/domain unit tests for the no-barcode path and the idempotent re-run
  (`skill://domain-unit-test` if a Deps seam exists; otherwise a focused SQL-level test like the
  others under `src/lib/neon/*.test.ts`).
- Follow the mobile law in `mobile-ds-law-exoskeleton-HANDOFF.md` and the desk record law; run
  `node tools/design-mcp/ds.mjs critique <file>` and `boundary` on every UI file you touch.

## Step 3 — the importer

`scripts/import-bin-sheet.ts` (tsx, `--conditions=react-server` like `provision-qa-org`):

- Input: the JSON above + the owner's D1–D10 answers encoded as a small overrides file next to it.
- `--dry-run` (default) prints one line per cell: location code → bin barcode, resolved SKU or
  "TMP (new|existing <sku>)", current qty, sheet qty, delta, flags. Nothing is written.
- `--apply --org <uuid>` writes through the domain functions only (`createProvisionalSku`,
  `adjustBinQty`, `updateProvisionalSku`) inside `withTenantTransaction`/`tenantQuery` with an
  explicit org; idempotent — a second `--apply` writes nothing (temp SKUs found by an import key
  stored in the description or a `provisional_source_ref` column — if you add a column, author the
  migration with `skill://db-migration-author` and get the owner's OK to apply).
- Every write is audited (`recordAudit`, source `bin-sheet-import`, reason `CYCLE_COUNT` /
  `PROVISIONAL_CREATE`) and publishes realtime so open desks/phones refresh.
- Run order: **QA sandbox first** (`00000000-0000-0000-0000-000000000002`, fixture bins exist —
  create C-04 test bins there only if needed and remove them after), show the owner the USAV
  dry-run, apply to USAV (`00000000-0000-0000-0000-000000000001`) only after an explicit "go".

## Step 4 — verify

- Desk: `/inventory/stock?q=C-04` shows every C-04 cell with the sheet qty; `/inventory/sku-exceptions`
  lists every new temp SKU (HLD, `→ Photo`). Phone: `/m/on-hold` lists them; open one, add a photo
  (QA sandbox), confirm it appears on the desk without reload.
- `pnpm verify:fast` green (report other lanes' reds separately); screenshots desk 1440×900 and
  phone 390×844 under `/tmp`.
- Final report to the owner: table of every C-04 cell → SKU (real or TMP) → qty written, the
  title-mismatch list (D5), and the "count needed" list (D9).

## Working rules

- Dev origin `http://localhost:3050` only; never start `next dev`; lane unit `cycleforge-lane@prod`.
- QA sandbox sign-in for probes: `POST /api/auth/signin`, header `x-tenant-slug: cycleforge-qa`,
  body `{"staffId":67,"deviceKind":"personal"}`. Never write to USAV without the owner's explicit
  go for that exact dry-run.
- The tree carries other lanes' work; touch only what this job needs; never revert others' hunks.
- Migrations only through `scripts/run-pending-migrations.mjs` with the owner's OK (`--only` refuses
  to reorder past other lanes' pending files).
