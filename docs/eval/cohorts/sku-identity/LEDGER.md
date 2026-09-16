# SKU-identity cohort — eval ledger

**SoT:** the **ZOHO item**. The cohort is every reader AND writer of a product
title, SKU or photo — `src/lib/sku/sku-identity-cohort.ts`. Not one desk: the
defect WAS the set disagreeing (the PO desk painted a soundbar while Move
photos painted a wall mount for the same line, PO `10-15153-01528`).

Run: `pnpm run eval:cohort sku-identity`

Law: `src/lib/sku/sku-identity-law.ts` · Gate: `Sku identity` (`always`) in
`verify:fast` · CLI: `npx tsx scripts/sku-identity-guard.ts` · MCP:
**`ds_sku_identity`** (`node tools/design-mcp/ds.mjs sku-identity`)

### Read law

<!-- eval-ledger:auto:read-law -->
- **key** — sku_catalog is reached by SKU_CATALOG_JOIN_ON_SQL — exact, org-scoped. Never zero-stripped, never similarity-gated, never tenant-blind.
- **title** — resolveSkuIdentityTitle: zoho_item_title → catalog_product_title → item_name → sku → zoho_item_id. Returns '' when nothing is present; the caller keeps its own last resort.
- **photo** — RECEIVING_LINE_IMAGE_URL_SQL — Zoho item photo when the item exists, catalog image only when it does not. Never select bare sc.image_url beside a line.
- **ownership** — A Zoho-twinned row's product_title / image_url belong to Zoho. A platform sync writes them only behind skuCatalogNoZohoTwinPredicateSql(). Marketplace copy lives in sku_platform_ids.display_name / listing_title.
- **stub** — The 'Unfound PO' stub is a placeholder, not a product — a real later field outranks it on every surface.
<!-- /eval-ledger:auto:read-law -->

---

## Locked wins

- Exact + org-scoped catalog join (`SKU_CATALOG_JOIN_ON_SQL`); the read-path
  `similarity(product_title, …) >= 0.25` predicate is DELETED at all 3 sites
  plus its byte-parity fixture
- One ladder (`resolveSkuIdentityTitle`): Zoho item name governs; the
  marketplace title is the no-Zoho-item fallback (755 of 2862 lines need it)
- Photo precedence via `RECEIVING_LINE_IMAGE_URL_SQL`; no bare `sc.image_url`
  beside a line (`lookup-po` fed 7 response paths from one)
- Platform writes fenced by `skuCatalogNoZohoTwinPredicateSql()`
- Data cleaned by `2026-09-15g_sku_identity_zoho_sot` (994 provider ids, 132
  titles, 132 shadowing images; idempotent re-run = 0/0/0)
- Tripwires: `src/lib/sku/sku-identity-law.test.ts` + `sku-identity-cohort.test.ts`

## Operator verdict

_Human edits after walking the desks. Agents do not invent this._

- **Status:** initial scaffold — awaiting first operator walk
- **Approved:**
- **Changes:**
- **Do not regress:**

## Open gaps

_Agents: do not invent gaps. The machine queue is Known debt below. Judgment
stays human._

1. _(machine queue is Known debt / Violations below)_

---

## Machine gates

<!-- eval-ledger:auto:machine-gates -->
| Date | Gate | Result | Snapshot |
|------|------|--------|----------|
| 2026-09-16 | verify:fast | _skipped (--skip-verify)_ | — |
| 2026-09-16 | sku-identity-guard | pass | `docs/eval/cohorts/sku-identity/snapshots/2026-09-16-guard.json` |
<!-- /eval-ledger:auto:machine-gates -->

## Tripwire result

<!-- eval-ledger:auto:tripwire-result -->
**pass** — snapshot `docs/eval/cohorts/sku-identity/snapshots/2026-09-16-tripwire.log`
<!-- /eval-ledger:auto:tripwire-result -->

## Peer matrix (reader/writer × engine opt-in)

<!-- eval-ledger:auto:peer-matrix -->
| Peer | File | Uses engine | Surface |
|---|---|---|---|
| po-desk | `src/lib/receiving/lines/build-sql.ts` | yes | PO / line desk + list |
| po-desk-fixture | `src/lib/receiving/lines/legacy-route-sql.fixture.ts` | yes | byte-parity fixture for build-sql |
| move-photos | `src/lib/receiving/photo-move-targets.ts` | yes | Move photos carton picker |
| carton-api | `src/app/api/receiving/[id]/route.ts` | yes | carton lines API |
| lookup-po | `src/app/api/receiving/lookup-po/route.ts` | yes | scan lookup + line image_url (7 response paths) |
| label-identify | `src/lib/receiving/label-identify.ts` | yes | label OCR → catalog match |
| ecwid-title-sync | `src/app/api/sku-catalog/sync-ecwid-titles/route.ts` | yes | write-side: Zoho-twin predicate |
| pairing | `src/lib/neon/sku-catalog-queries.ts` | yes | write-side: Zoho-twin predicate |
| sku-resolver | `src/lib/inventory/resolve-sku-catalog.ts` | yes | leading-zero-stripped operator input resolution |
<!-- /eval-ledger:auto:peer-matrix -->

## Engine contract

<!-- eval-ledger:auto:engine-contract -->
| Predicate | Result |
|---|---|
| joinConstantExact | pass |
| ladderZohoFirst | pass |
| twinPredicateOrgAligned | pass |
| imageLadderRefusesCatalog | pass |
| imageLadderPrefersZoho | pass |
| absent:similarityTitleGate | pass |
| absent:marketplaceTitleFirst | pass |
| absent:bareCatalogImage | pass |
<!-- /eval-ledger:auto:engine-contract -->

## Violations

<!-- eval-ledger:auto:violations -->
_No violations across 7315 scanned files._

_Snapshot:_ `docs/eval/cohorts/sku-identity/snapshots/2026-09-16-guard.json`
<!-- /eval-ledger:auto:violations -->

## Known debt (shrink-only)

<!-- eval-ledger:auto:known-debt -->
- sku_catalog_sku_key UNIQUE (sku) — tenant-blind; blocked by fk_bin_contents_sku → sku_catalog(sku)
- provider_item_id colour-variant mispairs (8 rows, e.g. catalog 00031-WY → Zoho 00031-CW) — operator decision, never a backfill guess
<!-- /eval-ledger:auto:known-debt -->

## Graph impact matrix (engine symbols)

<!-- eval-ledger:auto:graph-matrix -->
| Symbol | node_key | files_affected | snapshot |
|---|---|---|---|
| resolveSkuIdentityTitle | — | no match | `docs/eval/cohorts/sku-identity/snapshots/2026-09-16-find-resolveSkuIdentityTitle.json` |
| skuCatalogNoZohoTwinPredicateSql | — | no match | `docs/eval/cohorts/sku-identity/snapshots/2026-09-16-find-skuCatalogNoZohoTwinPredicateSql.json` |
| receivingProductTitle | `function:src/lib/receiving/po-group-title.ts:receivingProductTitle` | 14 | `docs/eval/cohorts/sku-identity/snapshots/2026-09-16-impact-receivingProductTitle.json` |
| resolvePhotoMoveTargetTitle | `function:src/lib/receiving/photo-move-targets-shared.ts:resolvePhotoMoveTargetTitle` | 2 | `docs/eval/cohorts/sku-identity/snapshots/2026-09-16-impact-resolvePhotoMoveTargetTitle.json` |
<!-- /eval-ledger:auto:graph-matrix -->

## Design critique

<!-- eval-ledger:auto:design-critique -->
- `src/lib/sku/sku-identity-law.ts` — `docs/eval/cohorts/sku-identity/snapshots/2026-09-16-critique-sku-identity-law.txt`
```
{
  "file": "src/lib/sku/sku-identity-law.ts",
  "summary": "1 problem, worst first: Renders components but imports none from the design system",
  "problems": [
    {
```
- `src/lib/receiving/po-group-title.ts` — `docs/eval/cohorts/sku-identity/snapshots/2026-09-16-critique-po-group-title.txt`
```
{
  "file": "src/lib/receiving/po-group-title.ts",
  "summary": "2 problems, worst first: Renders components but imports none from the design system",
  "problems": [
    {
```
- `src/lib/receiving/photo-move-targets-shared.ts` — `docs/eval/cohorts/sku-identity/snapshots/2026-09-16-critique-photo-move-targets-shared.txt`
```
{
  "file": "src/lib/receiving/photo-move-targets-shared.ts",
  "summary": "1 problem, worst first: 2 hardcoded hex where the color axis exists",
  "problems": [
    {
```
- `src/lib/receiving/lines/sql-receiving-image.ts` — `docs/eval/cohorts/sku-identity/snapshots/2026-09-16-critique-sql-receiving-image.txt`
```
{
  "file": "src/lib/receiving/lines/sql-receiving-image.ts",
  "summary": "No design-system problems found. That is not a claim the component is GOOD — only that it does not fork or drift.",
  "problems": [],
  "design_system_used": [],
```
<!-- /eval-ledger:auto:design-critique -->

## graph_stats

<!-- eval-ledger:auto:graph-stats -->
- project: `cycleforge-app`
- status: `ready`
- last_built_at: `2026-09-06T22:48:33.312Z`
- nodes: 41038 · edges: 191462 · embedded: 41038
- snapshot: `docs/eval/cohorts/sku-identity/snapshots/2026-09-16-graph-stats.json`
<!-- /eval-ledger:auto:graph-stats -->

---

<!-- eval-ledger:auto:last-run -->
_Updated 2026-09-16T15:05:16.594Z · cohort `sku-identity` · run id `2026-09-16T15-04-48-539Z`_
<!-- /eval-ledger:auto:last-run -->


<!-- eval-ledger:auto:graph-impact -->
- **resolveSkuIdentityTitle** — no match (`docs/eval/cohorts/sku-identity/snapshots/2026-09-16-find-resolveSkuIdentityTitle.json`)
- **skuCatalogNoZohoTwinPredicateSql** — no match (`docs/eval/cohorts/sku-identity/snapshots/2026-09-16-find-skuCatalogNoZohoTwinPredicateSql.json`)
- **receivingProductTitle** — 14 files, 18 symbols (`docs/eval/cohorts/sku-identity/snapshots/2026-09-16-impact-receivingProductTitle.json`)
- **resolvePhotoMoveTargetTitle** — 2 files, 2 symbols (`docs/eval/cohorts/sku-identity/snapshots/2026-09-16-impact-resolvePhotoMoveTargetTitle.json`)
<!-- /eval-ledger:auto:graph-impact -->


<!-- eval-ledger:auto:tripwires -->
- `src/lib/sku/sku-identity-law.test.ts`
- `src/lib/sku/sku-identity-cohort.test.ts`
<!-- /eval-ledger:auto:tripwires -->
