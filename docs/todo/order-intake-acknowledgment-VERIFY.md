# Order Intake & Acknowledgment — verification checklist

**Ship:** [`order-intake-acknowledgment-PLAN.md`](./order-intake-acknowledgment-PLAN.md)  
**Prompt:** [`order-intake-acknowledgment-IMPLEMENTATION-PROMPT.md`](./order-intake-acknowledgment-IMPLEMENTATION-PROMPT.md)

**Automated gate:** `npm run verify` (lint · typecheck · unit). Playwright is **not** in that gate — run the e2e file against a live authenticated desk (`qa-admin` storage, same as `tests/e2e/add-order-to-ship-pending.spec.ts`).

---

## Locked testids

Do not rename. Old triage ids must keep working.

| id | Surface |
|---|---|
| `order-triage-form` | Existing form root (keep) |
| `order-intake-form` | Alias on the same root (add) |
| `triage-start` | Create + cage |
| `triage-release` | Release |
| `triage-docs-not-required` | G2 exempt |
| `triage-open-labels` | Escape hatch |
| `triage-jump-identity` … `triage-jump-review` | Section rail (keep; add assignment jump if you add a section) |
| `intake-order-number` | Order number field |
| `intake-platform-inferred` | Inferred mark/label region |
| `intake-platform-chosen` | Platform select (unknown shape) |
| `intake-fulfillment-channel` | ShipStation / link-only |
| `intake-item-number` | Item number |
| `intake-sku` | SKU |
| `intake-qty` | Quantity |
| `intake-weight` | Weight oz |
| `intake-dim-l` `intake-dim-w` `intake-dim-h` | Dimensions |
| `intake-label-link` | Link-label control |
| `intake-label-buy` | Host around composed BuyLabelSection |
| `intake-assign-tech` | Fulfillment/test assignee |
| `intake-assign-packer` | Pack assignee |
| `intake-bulk-grid` | CSV staging grid body |
| `csv-import-staging-identity` | Staging/board identity band (file name or synced sheet tab) |
| `csv-import-staging-confirm` | Batch CTA (`Confirm N ready` on a file draft, `Accept N approved` on a sheet board) |
| `sheet-triage-tally` | Sheet board's approved / rejected / to-review count (sheet origin only) |
| `import-triage-approve` | Per-row approve square — pressed = approved, press again unapproves |
| `import-triage-reject` | Per-row reject square — pressed = rejected, press again clears |
| `orders-desk-add` | Tab-band Add |

---

## REQ → proof

| REQ | Proof |
|---|---|
| REQ-ID-01 | Unit: unicode dashes normalize. E2E-ID-* paste into `intake-order-number` |
| REQ-ID-02 | E2E-ID-AMZ / E2E-ID-EBAY: `intake-platform-inferred` named Amazon / eBay |
| REQ-ID-03 | E2E-ID-UNK: `intake-platform-chosen` required / enabled |
| REQ-ID-04 | Origin not a typed field; manual path does not claim `synced` |
| REQ-ID-05 | Buy disabled + reason when ShipStation mocked disconnected; Link still enabled |
| REQ-LINE-01–05 | E2E-LINE; add payload includes qty/sku/condition |
| REQ-LINK-01 | Tracking paste; G1 reason names tracking when blank |
| REQ-PAIR-01–03 | E2E-EXEMPT; manuals pair if fixture exists else skip named |
| REQ-SHIP-01–03 | Parcel columns; order-rates body has dimensions; E2E-BUY one purchase |
| REQ-WHO-01–02 | E2E-WHO; `work_assignments` TEST + PACK |

Gates G1–G3: existing `src/lib/orders/release-gates.test.ts` must stay green. Do not weaken.

---

## Unit (must land)

- `inferMarketplaceFromOrderId` already tested — **do not duplicate the regex**. Add tests only for form-level helpers (e.g. `projectCsvRowToCanonicalIntake`, `intakePlatformState(orderNumber)`).
- `classifyCsvOrderStagingRow`: unknown-shaped order number + blank platform → `action_required` / missing `platform`. Amazon-shaped id + blank platform → **ready** (inferred).
- Rate mapping: weight + L×W×H inch → `ShipmentSpec.parcels[0]`.
- `evaluateReleaseGates` matrix unchanged.

---

## E2E matrix

File: `tests/e2e/order-intake-acknowledgment.spec.ts`  
`test.use({ storageState: tests/.auth/qa-admin.json })`  
Skip webkit + mobile. Probe `/api/orders/queue-counts`; skip with `no QA session` if unauthenticated.

Mock `/api/shipping/order-rates` and `/api/shipping/order-labels/purchase` in the buy test (route intercept). Assert **exactly one** purchase POST.

| Test id | Given | When | Then |
|---|---|---|---|
| E2E-ID-AMZ | To-ship Add → triage | Paste `111-1234567-1234567` into order number | `intake-platform-inferred` = Amazon; chosen not required |
| E2E-ID-EBAY | same | Paste `03-15100-78272` | Inferred eBay |
| E2E-ID-UNK | same | Paste `CFLOOP-{stamp}` | Platform select required (`intake-platform-chosen`) |
| E2E-DUP | Order number already in org | Blur / Start triage | No second row; UI acknowledges existing (409 or open-existing). Count of that `order_id` remains 1 |
| E2E-LINE | Catalog fixture **or** typed sku+title+qty | Pair / fill | Qty default 1 visible; title present; Start triage succeeds |
| E2E-EXEMPT | Caged order, no docs | Check exempt, fill G1 tracking if needed | G2 green in Review |
| E2E-LINK | Tracking present; skip buy | Link path / tracking on record | G3 linked **or** G3 still red if no label doc — **honest**: if Link without a label document cannot close G3, the test asserts the **named** G3 reason, not a fake pass |
| E2E-BUY | Weight+dims filled; ShipStation mocked 200 | Buy | One purchase POST; after Re-check, G3 green (mock must set purchased fact the gates read — if gates only see DB, the mock handler must be a real QA path or the test drives a fixture that stamps `shippingLabelPurchased`). If you cannot close G3 without DB, skip **named**: `gates need label document fixture` and still assert the purchase POST fired with weight+dims |
| E2E-WHO | Staff picker | Assign tech + packer | Subsequent GET/work-order snapshot or row paint shows both |
| E2E-CAGE | Missing G3 | Start triage | Not on default pending grid; visible in Caged facet ≤2 interactions |
| E2E-REL | All gates green (exempt + tracking + label fixture or mocked purchased) | Review → Release | Row on pending: `data-order-row-id` + `data-marketplace-order-id`; rail closes |
| E2E-BULK | CSV: Amazon id, eBay id, `CFLOOP-x` without platform column | Stage | Two ready (inferred), one action_required; inspector has `order-triage-form` / `intake-order-number` |
| E2E-BUDGET | Form open, gates already green | Jump Review, Release | Two clicks after form is open (section rail + Release) |
| E2E-DS | Form visible | Snapshot | Buy lives under `intake-label-buy`; no second dialog titled as a second engine. Fields are textboxes/comboboxes (DS), not page-local `<input class="border rounded-xl">` forks |
| E2E-HAND | Control | Existing `add-order-to-ship-pending` still passes | Uncaged hand-entry not broken |

**Honesty rule:** a skip must name the missing fixture (token, label document, staff). A skip named `flaky` is a fail.

---

## Manual floor pass (after e2e)

1. To-ship → **Add** → Identity: paste a real Amazon-shaped id from dogfood if available — mark paints, no extra click.  
2. Paste an internal id — platform combobox required.  
3. Fill title, qty 2 (warning tone on queue after release is existing `orderRowQtyTone` — do not regress).  
4. Exempt docs, add tracking, buy **or** link per environment. Review lists green gates. Release. Row appears on Pending with imported rows still visible.  
5. Open Caged facet: empty (or not this order).  
6. CSV import of a 3-line file: inferred platforms on the two marketplace ids.  
7. Scan Unbox: chrome unchanged (no desk Add band).  
8. **Add order manually** leaf still creates an **uncaged** live row.

---

## Regression must stay green

- `tests/e2e/add-order-to-ship-pending.spec.ts`  
- `src/lib/orders/release-gates.test.ts`  
- `src/lib/marketplace-order-id` tests (if present)  
- CSV import unit tests (`csv-order-import.test.ts`) — extend, don’t invert Ready meaning for Amazon-shaped rows

---

## Interaction budget audit

| Flow | Budget | Count |
|---|---|---|
| See which gate is red | ≤2 from form open | Section rail or scroll to Review |
| Release when green | ≤3 from form open | Jump Review + Release (open Add was entry) |
| See caged set | ≤2 | Existing Caged facet |
| Bind platform on unknown id | 1 select | Not a nested modal |
