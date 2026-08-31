# Search display — one source of truth
Verified 2026-08-30 · phases 1–7 complete

## Pinned components

| layer                | THE component            | fed by                        |
|----------------------|--------------------------|-------------------------------|
| centre shape         | `SearchEntityCentre`     | `status` + `items` slots      |
| item face            | `ItemRecordCard`         | `src/lib/item-record/*`       |
| identity strip       | `CartonContextCard`      | per-entity identity builders  |
| collapse             | `StationCollapsibleBlock`| `AutoCollapseController`      |
| Displays photos row  | `displayIndexPhotosRow`  | `{ photoCount, photosSettled }` |
| row commit + a11y    | `searchRowLinkProps`     | hit / active / optionId       |

## Adapters into ItemRecord[] — the item SoT

shipped-order-item-record.ts    pre-existing
receiving-line-item-record.ts   pre-existing
serial-unit-item-record.ts      NEW  (13 tests)
repair-item-record.ts           NEW  ( 5 tests)
fba-item-record.ts              NEW  ( 5 tests)
sku-catalog-item-record.ts      NEW

## IDENTIFICATION NUMBERS — check these yourself

Paste each into ⌘K, or open the URL directly.

ORDERS
  112-4984499-1990656              -> /search?sel=order:12941
  111-2562571-1045803              -> /search?sel=order:12940
  111-2155094-3973057              -> /search?sel=order:12939
  5008                             -> /search?sel=order:12937

TRACKING (resolves to its order)
  9621091390006094377900383435373232 -> /search?sel=order:12941
  9300110990513565737132             -> /search?sel=order:12940

SERIAL UNITS
  024644912010195BC                -> /search?sel=unit:2451
  024644923230171BC                -> /search?sel=unit:2449
  070213922071007AE                -> /search?sel=unit:2447

SKU
  00624                            -> /search?sel=sku:2438
  00053-P-2                        -> /search?sel=sku:2439

CARTON / REPAIR / FBA
  R-52232                          -> /search?sel=receiving:52232
  REP-3365                         -> /search?sel=repair:3365
  FBA-08/28/26                     -> /search?sel=fba:75

Every one of these must show STATUS then ITEMS. Nothing else.

## Live DOM proof (data-testid observed in the browser)

order:12941     -> [search-order-status-block,     search-order-items-block]
unit:2449       -> [search-unit-status-block,      search-unit-items-block]
sku:2439        -> [search-sku-status-block,       search-sku-items-block]
receiving:52232 -> [search-receiving-status-block, search-receiving-items-block]  (verified pre-breakage)
repair:3365     -> [search-repair-status-block,    search-repair-items-block]
fba:75          -> [search-fba-status-block,       search-fba-items-block]

## Guardrail

src/components/search/station/SearchEntityCentre.test.ts
Mounts all six entity types; asserts both bands exist, Status before Items, with
content, and that an empty band still renders. Mounted DOM, not a source regex.
