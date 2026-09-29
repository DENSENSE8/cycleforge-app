# Shopify AI listing integration — first-principles implementation plan

**Date:** 2026-09-28
**Status:** Proposed
**Owner:** Integrations + Assistant
**Target outcome:** An operator can say “Create a Shopify listing for SKU X,” review a server-built listing card, confirm on a later turn, and receive a link to a Shopify **draft** product whose data came from CycleForge. Publishing live is a separate, explicitly confirmed action.

## 1. Executive decision

CycleForge already has Shopify authentication, connection validation, and incremental order import. It does **not** have a Shopify product writer or an assistant tool that can create a listing.

Build the missing capability as three distinct layers:

1. **Draft assembly:** resolve one exact CycleForge SKU, collect verified catalog, price, inventory, brand, and gallery facts, then generate only the copy that can safely be derived from those facts.
2. **Confirmed draft creation:** after a later-turn confirmation, idempotently upsert a Shopify product with `status: DRAFT`, upload its media, and record all returned Shopify identifiers locally.
3. **Live commerce:** only after location mapping and continuous inventory synchronization are healthy, allow a separate confirmation to activate and publish the product.

Do not make “create listing” mean “immediately sell it.” Product creation and storefront publication have different risk, permissions, scopes, and rollback characteristics.

## 2. Definition of done

The integration is complete when all of the following are true:

- An authorized operator can use the desktop or mobile Omni Composer to identify a catalog SKU and ask for a Shopify listing.
- The assistant renders a listing draft card using server-resolved data; the model never retypes prices, quantities, IDs, or image references.
- Every displayed value identifies its source: catalog, confirmed brand fact, stored channel price, configured rule, inventory position, operator input, or AI-generated copy.
- Missing critical data produces one short, actionable question rather than invented values.
- The assistant cannot perform the external write in Ask-only mode.
- A proposal cannot be confirmed in the same turn in which it was created.
- Confirmation creates or updates exactly one Shopify product, even after timeout, retry, double-click, model retry, or a lost HTTP response.
- The Shopify product is created as `DRAFT`; no sales channel publication happens implicitly.
- The returned product, variant, inventory item, handle, store, and admin URL are persisted in CycleForge.
- Ordered CycleForge listing photos reach Shopify without exposing CycleForge’s auth-gated photo routes.
- The final result card links to the Shopify admin product and shows the actual read-back state.
- A failed external operation is visible, retryable where safe, and never reported as successful.
- Scope readiness, connection health, rate limiting, GraphQL top-level errors, mutation `userErrors`, and unknown outcomes have explicit handling.
- Unit, integration-contract, assistant-tool, permission, mobile, and Shopify development-store smoke tests pass.
- `pnpm verify:fast` is green; use `pnpm verify` for the cross-cutting mutation/artifact/schema work before rollout.

## 3. Current repository baseline

### Already reusable

- `src/lib/integrations/connectors/shopify.ts`
  - Resolves a Nango connection or vault credentials.
  - Calls the Shopify GraphQL Admin API.
  - Validates the shop connection.
  - Incrementally imports Shopify orders.
- `src/lib/integrations/nango.ts`
  - Creates Connect sessions, stores per-org connection markers, and proxies authenticated requests.
- `src/lib/integrations/connectors/registry.ts`
  - Registers Shopify with the `orders` capability.
- `src/app/settings/integrations/registry.ts`
  - Displays Shopify in Settings → Integrations.
- `platform_listings`
  - Already stores platform/account, catalog linkage, external ID, merchant SKU, listing name/description, price, quantity, condition, UPC, categories, thumbnail, sync status/hash/error, and timestamps.
- `listing_photos`
  - Already models an ordered, cover-aware gallery for a SKU, serial unit, or platform listing.
- `readInventoryPositions()`
  - Provides CycleForge’s own on-hand, pickable, allocated, incoming, and available values.
- SKU identity law
  - `sku_catalog` is authoritative for title and identity. External systems are facts, not masters.
- Assistant confirmation framework
  - Existing proposal/confirm/cancel behavior prevents same-turn self-confirmation and enforces permissions.
- Assistant draft-card precedent
  - Manual orders and PO imports persist a structured draft in the conversation and render server-built artifacts.

### Gaps to close

- The Shopify connector advertises only `orders`; it has no catalog/product capability.
- The GraphQL helper is private to the order connector and is pinned to an obsolete direct-call default (`2024-10`).
- No Shopify product, variant, media, publication, location, or inventory mutation exists.
- No granted-scope readiness check exists.
- No assistant listing draft or listing write tool exists.
- No durable external-write operation ledger exists for product creation.
- The current global `SHOPIFY_STORE_HANDLE` is not tenant/account-safe.
- `platform_listings.external_ref_id` is insufficient by itself to retain product, variant, and inventory-item identities.
- Internal photo URLs require a CycleForge session and therefore cannot be handed directly to Shopify.
- Documentation still labels Shopify as a plan even though order import code is built.
- The current lane has no `NANGO_SECRET_KEY`; OAuth cannot be end-to-end tested here until the sidecar/cloud configuration is supplied.

## 4. First-principles laws

These are design constraints, not suggestions.

### 4.1 Identity

1. A listing begins from one exact `sku_catalog.id`; fuzzy search may suggest candidates but may never decide identity.
2. The product title comes from `sku_catalog.product_title` through the existing identity law.
3. The Shopify SKU is `sku_catalog.sku`; the model cannot invent or rewrite it.
4. The external upsert identity is a Shopify unique custom-ID metafield, not a mutable title, handle, or SKU search.
5. The custom ID value is scoped as `organizationId:platformAccountId:skuCatalogId` so retries and multi-store use cannot collide.

### 4.2 Provenance

1. Facts and generated copy are separate.
2. Every draft field carries a provenance enum and, where useful, a source record ID.
3. Internal notes, sourcing notes, packing guidance, costs, and staff-only condition evidence are denylisted from public copy.
4. The model may phrase verified facts; it may not create specifications, compatibility claims, warranty terms, included accessories, condition claims, or certifications.
5. Price and inventory are server-resolved values, never model-typed echoes.

### 4.3 External-write safety

1. “Draft” is read/session state; “create” is an external write; “publish” is a second external write.
2. Create and publish require separate permissions and separate confirmations.
3. No external network call runs while a long-lived database transaction or row lock is held.
4. Every external write has a durable operation row before the request leaves CycleForge.
5. An unknown response is not success and is not immediately retried as a blind create.
6. Creation is an idempotent `productSet` upsert by unique custom ID.
7. The result shown to the operator is built from Shopify read-back plus committed local state.

### 4.4 Inventory safety

1. CycleForge’s `available` inventory position is the source quantity; Zoho is not consulted as authority.
2. Initial inventory is only sent after one Shopify location is explicitly mapped to the CycleForge inventory pool.
3. Live publication is blocked until ongoing inventory export is healthy.
4. Subsequent absolute quantity writes use compare-and-set and Shopify’s required idempotency directive.
5. A configurable nonnegative safety buffer may reduce published availability; it may never increase it.

### 4.5 Ownership and drift

1. CycleForge may fully manage products it created with its custom ID.
2. CycleForge does not silently adopt or overwrite an existing manually managed Shopify product.
3. Shopify list-valued fields are replace semantics under `productSet`; never send partial `variants`, `files`, `collections`, or `metafields` arrays as though they were patches.
4. Manual Shopify changes are detected and surfaced as drift; conflict policy is explicit per field.

### 4.6 Product surface

1. The complete operator verb must work on `/m/*`, not only desktop.
2. The listing card is generated by a registered tool and validated as a typed artifact.
3. The card carries data only; all actions remain registered tools with permission gates.

## 5. Scope and staged product decisions

### MVP: one SKU → one Shopify draft product

Support:

- One active Shopify store account selected per listing.
- One CycleForge catalog SKU.
- One Shopify product with one default variant.
- Title, description HTML, vendor, product type, tags, SKU, barcode, price, inventory policy, optional initial inventory, and ordered images.
- Create-or-update behavior only for CycleForge-managed products identified by the custom ID.
- Product status `DRAFT`.
- Result/admin link and local projection.

Defer:

- Combining several CycleForge SKUs into Shopify variants.
- Bundles, subscriptions, gift cards, selling plans, markets, contextual pricing, compare-at price rules, duties/HS codes, translations, collection automation, and SEO experimentation.
- Automatic adoption of pre-existing Shopify products.
- Automatic public publication.
- Bulk listing creation from an unreviewed list.
- Autonomous price changes after creation.

### Post-MVP

- Separate `publish_shopify_listing` action.
- Continuous inventory export and reconciliation.
- Controlled updates to managed listings.
- Multi-variant product grouping.
- Product webhooks and Shopify-side edit reconciliation.
- Bulk draft generation with one confirmation surface per batch and bounded concurrency.

## 6. Operator journeys

### 6.1 Happy path

1. Operator: “Create a Shopify listing for SKU 00066-P-2 at $79.99.”
2. Assistant calls `draft_shopify_listing` with the user’s identifier and explicit price.
3. Server resolves the exact catalog row, confirmed brand, gallery, account, existing listing, price candidates, and inventory position.
4. A typed Shopify listing card appears with:
   - Shopify account
   - SKU and product title
   - price and its source
   - available quantity and mapped location
   - description preview
   - ordered images
   - warnings/missing fields
   - target state: Shopify draft
5. Operator corrects fields conversationally; each follow-up calls `draft_shopify_listing` again and updates the same conversation draft.
6. Operator: “Create it.”
7. Assistant calls `create_shopify_listing {action:"propose"}`. The server re-resolves mutable facts and presents the exact final diff/write.
8. Assistant asks for confirmation and stops.
9. Operator: “Yes.”
10. Assistant calls `create_shopify_listing {action:"confirm"}`.
11. CycleForge claims a durable operation, upserts the Shopify draft product, uploads/associates media, reads it back, and updates `platform_listings`.
12. Result card links to Shopify Admin and reports actual status, price, quantity, and media count.

### 6.2 Ambiguous product

- Search results may show up to five candidates.
- The assistant asks which SKU; it never selects based on semantic similarity alone.
- A composer mention with `kind: sku` and exact ID bypasses ambiguity.

### 6.3 Missing price

- Price is a required business field for creation even if Shopify technically accepts a zero/default value.
- Ask one question: “What should the Shopify price be?”
- Never derive a price from cost without an explicitly configured pricing rule.

### 6.4 No usable image

- Draft creation may proceed with a visible warning if business policy allows it.
- Live publication is blocked until the configured publication policy is satisfied (recommended default: at least one image).
- Do not generate a product image unless the operator explicitly requests image generation in a separate workflow.

### 6.5 Existing CycleForge-managed listing

- Resolve by local binding and Shopify custom ID.
- Show “Update existing draft/product,” not “Create.”
- Render a field-level diff.
- Reuse the same write tool and identity; never create a duplicate.

### 6.6 Existing unmanaged Shopify match

- A SKU/title/barcode match without CycleForge ownership is only a candidate.
- MVP refuses to overwrite it and returns the Shopify record for manual review.
- A future “adopt listing” flow must be a separate confirmed action that establishes field ownership.

### 6.7 Publish live

- Operator explicitly asks to publish.
- Server verifies product is active-ready, required media exists, location mapping exists, inventory sync is healthy, and the target publication is configured.
- `publish_shopify_listing` proposes the exact product and publication.
- Later-turn confirmation sets product status `ACTIVE` and invokes `publishablePublish`.

## 7. Field-resolution contract

| Shopify field | CycleForge source | Resolution rule | Missing behavior |
|---|---|---|---|
| Store/account | `platform_accounts` + Shopify connection | Exact mentioned account; otherwise the only active Shopify account | Ask when zero or multiple |
| Product identity | `sku_catalog.id` | Exact ID/SKU after org-scoped resolution | Ask operator to choose |
| Title | `sku_catalog.product_title` | Catalog title governs; optional user edit is draft-only until confirmed | Block if blank |
| Handle | Shopify-generated | Do not invent a stable identity from it | Let Shopify create |
| Vendor | Confirmed catalog brand | Use only brand facts at the existing confidence threshold | Leave blank |
| Product type | `sku_catalog.category` | Map text to `productType`; taxonomy GID mapping is later | Leave blank |
| Taxonomy category | Future mapping table | Never treat free-text category as Shopify taxonomy ID | Omit in MVP |
| SKU | `sku_catalog.sku` | Exact and immutable in the draft | Block if blank |
| Barcode | `gtin`, then validated UPC/EAN | Use only normalized valid digits; show source | Omit if absent/invalid |
| Description | Safe public facts + explicit operator text | AI may compose conservative HTML from allowlisted facts | Ask only if publication policy requires it |
| Condition | Explicit condition fact | Store as a typed metafield/tag; Shopify has no general native condition field | Omit, never infer |
| Price | Explicit turn → saved Shopify draft → configured pricing rule → approved channel price | Convert once to integer cents locally and Shopify money string at boundary | Block if absent or nonpositive |
| Compare-at price | Explicit operator input only in MVP | Must exceed price | Omit otherwise |
| Quantity | `readInventoryPositions().available` minus safety buffer | Clamp to integer ≥ 0; attach provenance timestamp | Show but do not push without location mapping |
| Inventory policy | Org setting | Default `DENY`; `CONTINUE` requires explicit configuration | Use `DENY` |
| Location | `shopify_store_settings.primary_location_gid` | Exact configured active Shopify location | Block inventory push/publication |
| Images | Ordered `listing_photos`; then catalog `image_url` fallback | Cover first, dedupe by content hash, stable alt text | Warn/block per publication policy |
| Tags | Deterministic allowlisted facts | Category/brand/condition plus explicit tags; no internal workflow tags | Omit unknowns |
| Status | Integration law | Always `DRAFT` in create tool | Never model-controlled |
| Publications | Store settings | None during create; explicit later tool only | Stay unavailable publicly |
| Custom ID | Server-generated | `org:account:skuCatalogId`, stored in unique app-owned metafield | Mandatory |

### Public-copy allowlist

- Catalog title, SKU, category, validated barcode, confirmed brand.
- Explicit operator-provided public description/condition/accessories.
- Public dimensions/specifications only if a governed product-spec source is added.
- Image-derived alt text may name the product and image position; it may not claim what the image contains unless a verified caption exists.

### Public-copy denylist

- `last_known_cost_cents`, purchase cost, replenish target.
- sourcing notes, pack notes, handling instructions, staff notes.
- supplier identity, order/customer data, internal condition/QC comments.
- guessed compatibility, measurements, warranty, certification, or included items.

## 8. Target architecture

```text
Operator / Omni Composer
          |
          v
draft_shopify_listing  (read/session tool)
          |
          +--> catalog identity + confirmed brand
          +--> listing gallery + photo storage
          +--> price resolver + inventory position
          +--> Shopify account readiness
          |
          v
typed shopify_listing_draft artifact
          |
          v
create_shopify_listing propose -> agent_mutations (proposed)
          |
     later-turn yes
          |
          v
short DB transaction: approve + claim integration_write_operation
          |
          v
Shopify export runner (no DB transaction held)
          |
          +--> staged media uploads
          +--> productSet by unique custom ID, status DRAFT
          +--> read-back
          |
          v
platform_listings + media bindings + operation result + audit/realtime
          |
          v
result artifact with Shopify Admin link
```

## 9. Shopify API contract

### API version

- Centralize the version in `src/lib/integrations/shopify/client.ts`.
- Pin to Shopify Admin GraphQL `2026-07` for this implementation; do not use `latest` at runtime.
- Add `SHOPIFY_API_VERSION` only as an explicit tested override.
- Add a quarterly version review test/checklist because Shopify versions are time-bounded.

### Mutations and queries

- `currentAppInstallation { accessScopes { handle } }` — listing readiness.
- `shop { id name myshopifyDomain }` — tenant-safe store identity.
- `locations` — configure the inventory location.
- `publications` — configure later publication targets.
- `metafieldDefinitionCreate` — install one app-owned product custom-ID definition with `uniqueValues` capability.
- `productSet` — synchronous MVP upsert by custom ID.
- `stagedUploadsCreate` — securely upload internal image bytes.
- `productSet` files input or supported product update path — associate processed media; do not use deprecated `productCreateMedia`.
- `inventorySetQuantities` with required `@idempotent` key and compare quantity — ongoing inventory export.
- `publishablePublish` — later explicit publication.
- Product read query — read back product/variant/media/status/URLs after every write.

### Scopes

Required for draft creation:

- Existing order scope needed by order import.
- `write_products` (includes product read access).
- `read_locations` or the applicable inventory scope needed to enumerate locations.

Required when quantity export is enabled:

- `write_inventory`.

Required only when live publication is enabled:

- `write_publications`.

At connect/validate time, query actually granted scopes. Do not infer readiness from configured scopes or a successful `shop { name }` query. Existing installations must reconnect/approve when scopes expand.

### Client behavior

Extract the current private helper into a tenant-aware client that:

- Supports Nango proxy and vault-direct fallback through one interface.
- Applies request timeout/abort.
- Parses HTTP failures, GraphQL top-level `errors`, mutation `userErrors`, and throttle metadata separately.
- Captures Shopify request ID and GraphQL cost metadata without logging secrets or full descriptions.
- Retries safe reads and idempotent upserts on transient failures with bounded exponential backoff and jitter.
- Honors throttle availability/restore rate; never loops on `ACCESS_DENIED` or validation errors.
- Returns typed domain errors such as `not_connected`, `missing_scope`, `permission_denied`, `validation`, `throttled`, `transient`, and `unknown_outcome`.

## 10. Local data model

### 10.1 `shopify_store_settings` (new, non-secret)

One row per Shopify `platform_account_id`:

- `organization_id`
- `platform_account_id` unique per org
- `shop_gid`
- `myshopify_domain`
- `store_handle`
- `primary_location_gid`
- `publication_gids text[]`
- `inventory_safety_buffer integer default 0`
- `inventory_sync_enabled boolean default false`
- `publication_enabled boolean default false`
- `granted_scopes text[]`
- `scope_checked_at`
- `last_inventory_sync_at`
- `last_inventory_sync_status`
- timestamps / updated-by staff

No access token or client secret belongs here.

### 10.2 `platform_listings` additive columns

Keep the existing table as the channel listing projection. Add generic external identity fields only where they must be queryable:

- `external_variant_ref_id text`
- `external_inventory_item_ref_id text`
- `external_handle text`
- `external_status text`
- `managed_by_cycleforge boolean default false`
- `last_pushed_at timestamptz`
- `last_pulled_at timestamptz`
- `last_provider_updated_at timestamptz`

Use existing `external_ref_id` for the Shopify product GID and existing `sync_status`, `sync_hash`, `sync_error`, and `last_synced_at`. Provider-only diagnostics may remain in `platform_metadata`; identifiers used for joins or recovery may not.

The natural MVP key is `(organization_id, platform='shopify', platform_account_id, merchant_sku_normalized)`. Enforce one active managed row per account/SKU.

### 10.3 `integration_write_operations` (new durable external-write ledger)

Recommended generic table:

- `id uuid`
- `organization_id`
- `provider`
- `platform_account_id`
- `operation_kind` (`product_upsert`, `media_export`, `inventory_set`, `publish`)
- `idempotency_key`
- `resource_key` (custom product ID or listing ID)
- `request_hash`
- `request_snapshot jsonb` (redacted, bounded)
- `status` (`pending`, `running`, `succeeded`, `retryable_failed`, `terminal_failed`, `unknown`)
- `attempt_count`
- `agent_mutation_id`
- `provider_resource_id`
- `provider_request_id`
- `response_summary jsonb`
- `last_error_code`, `last_error_message`
- `started_at`, `completed_at`, timestamps

Unique key: `(organization_id, provider, operation_kind, idempotency_key)`.

This is the equivalent of the shipping-label purchase ledger: it distinguishes “nothing happened,” “succeeded,” and “the response was lost.”

### 10.4 `platform_listing_media_exports` (new)

Map immutable CycleForge photos to Shopify files:

- org, platform listing, photo ID
- source SHA-256 and byte size/content type
- Shopify file/media GID
- status/error/timestamps
- sort order and alt text snapshot

Unique on listing + photo + source hash. A changed/re-uploaded photo becomes a new immutable export; retries reuse a completed export.

### 10.5 Draft schema

Add `src/lib/shopify/listing-draft.ts` with a strict versioned Zod schema:

- target account and SKU identity
- current/existing managed listing identity
- product and variant fields
- currency, price cents, compare-at cents
- inventory snapshot, buffer, effective quantity, location
- ordered photo IDs and source hashes
- generated description/tags/SEO copy
- per-field provenance
- warnings, missing requirements, and readiness states
- source revision timestamps and a deterministic draft hash

Persist it in the assistant conversation artifact, following manual-order/PO-draft precedent. Do not trust the draft at confirmation time; re-resolve mutable inventory, connection, scopes, and existing-listing identity.

## 11. Assistant tools and UI

### `draft_shopify_listing` — read/session tool

Permission: `sku_stock.view` plus Shopify integration visibility.

Responsibilities:

- Read the user message automatically for exact SKU, explicit price, quantity override, condition, and public copy.
- Resolve exact catalog identity or return choices.
- Merge follow-up fields into this conversation’s open Shopify draft.
- Resolve account, connection readiness, existing managed listing, price, inventory, brand, barcode, and gallery.
- Generate safe copy from the allowlisted facts through a forced structured model call.
- Render a branded `shopify_listing_draft` artifact.
- Return one exact “still needed” question when blocked.
- Never call Shopify mutations.

### `create_shopify_listing` — dedicated confirmed write

Permission: new `listings.create_draft`.

Actions:

- `propose`: rehydrate the latest draft, re-resolve mutable facts, calculate final payload/diff, file `shopify.listing.upsert`, render confirmation, and stop.
- `confirm`: only on a later turn; atomically approve and claim the operation, execute outside the DB transaction, then render actual result.
- `cancel`: reject the pending proposal.

Do not route this through generic `propose_mutation`. It owns a provider side effect and requires its own operation ledger and recovery behavior.

### `publish_shopify_listing` — post-MVP confirmed write

Permission: new `listings.publish` with step-up recommended.

- Verifies managed ownership, product readiness, product status, target publication, and inventory-sync health.
- Proposes exactly which product becomes active and where it will be published.
- Later-turn confirmation activates and publishes.

### Tool registry changes

- Register `draft_shopify_listing` with assistant read/session tools.
- Add write builders in `src/lib/assistant/tools/write-tools.ts`.
- Add names/activity labels in `tool-activity.ts`, `tool-labels.ts`, and subsetting phrases in `tool-subsetting.ts`.
- Add pending-confirmation context for both write tools.
- Add explicit system-core guidance: listing request → draft tool; “create it” → propose; later “yes” → confirm; “publish” never aliases create.

### Artifact

Add a server-built `shopify_listing_draft` artifact with:

- mode: `draft | proposal | processing | created | failed`
- account/store face
- product identity and Shopify identity when created
- title, public description preview, vendor/type/tags
- variant SKU/barcode/price/quantity
- photo strip in listing order
- provenance/warning/missing rows
- exact change diff when updating
- Shopify admin link only after a verified result

Implement a compact mobile renderer as part of the same component contract. Follow the order-draft and PO-draft artifact pattern; do not make the model construct the payload.

## 12. Product export algorithm

### Preflight

1. Resolve org, staff, permission, session, platform account, and active integration.
2. Query granted scopes and store identity if readiness cache is stale.
3. Resolve exact SKU and current managed `platform_listings` row.
4. Recompute title/brand/barcode/price and inventory position.
5. Check source revision against proposal; if price, title, account, or effective quantity changed materially, refuse confirmation and render a refreshed proposal.
6. Validate public-copy schema, HTML allowlist, money, barcode, photo count/type/size, and Shopify input limits.
7. Calculate canonical payload JSON and SHA-256.

### Claim

1. In a short transaction, lock the pending `agent_mutations` row.
2. Recheck later-turn confirmation and permission.
3. Mark the mutation `approved`.
4. Insert or reuse `integration_write_operations` under a stable idempotency key.
5. Commit.

### Media export

1. Read full photo bytes server-side with org scope.
2. Use stored SHA-256 or compute it once.
3. Reuse a completed `platform_listing_media_exports` mapping when hash matches.
4. Otherwise call `stagedUploadsCreate`, upload the bytes to the returned target, and create/associate the Shopify file through the supported product update/set path.
5. Poll boundedly for processing status; incomplete processing yields a warning/retry state, not a false success.

### Product upsert

1. Ensure the app-owned unique custom-ID metafield definition exists; setup is idempotent.
2. Call synchronous `productSet` using the custom ID identifier.
3. Set `status: DRAFT` regardless of model/user payload.
4. On create, send the complete owned one-variant/files/metafields set.
5. On update, send only deliberately owned scalar fields; list fields are changed only through a full, server-reconciled set.
6. Inspect both top-level GraphQL errors and `userErrors`.

### Recovery/read-back

1. If the response is lost, mark the operation `unknown`.
2. Query by custom ID before retrying. If the expected resource exists, read it back and finish locally.
3. If no product exists and the failure is classified transient, retry the same idempotent upsert.
4. Persist product/variant/inventory IDs, handle, status, price, quantity, thumbnail, payload hash, sync timestamps, and media mappings.
5. Mark operation succeeded and agent mutation applied in a short transaction.
6. Emit audit, ops/realtime event, and the result artifact.

## 13. Inventory synchronization and publication gate

Creating a draft with an initial quantity is not sufficient for a safe live store. Other channel sales and warehouse changes can alter CycleForge availability after creation.

### Inventory export

- Add Shopify implementation of connector `pushInventory` or a dedicated inventory exporter using the existing contract.
- Enqueue/coalesce updates when the canonical stock ledger changes.
- Key work by org + Shopify account + SKU; only the newest stock version executes.
- Resolve listing → Shopify inventory item and configured location.
- Read current Shopify quantity, then call `inventorySetQuantities` with `compareQuantity` and required idempotency key.
- On compare failure, re-read and retry only if the CycleForge source version is still current.
- Store last exported quantity/source version and operation outcome.
- Add scheduled reconciliation to repair dropped events and report drift.

### Publication readiness predicate

`canPublishShopifyListing` returns true only when:

- product is CycleForge-managed and currently draft/unpublished;
- `write_publications` is granted;
- target publication is configured and active;
- a primary Shopify location is mapped;
- `write_inventory` is granted;
- inventory sync is enabled and its last successful run is within the configured freshness window;
- current listing price is valid;
- required media/copy policy is satisfied;
- no terminal/unknown write operation or unresolved drift exists.

The assistant and any future Products UI must call this same predicate.

## 14. Permissions, audit, and secrets

### Permissions

Add least-privilege permissions rather than reusing broad admin rights:

- `listings.create_draft` — generate/confirm external draft products.
- `listings.publish` — activate and publish publicly; mark step-up/destructive-like.
- `listings.manage_inventory` — enable/configure outbound stock synchronization.

The tools also require `assistant.chat` through the existing assistant session gate. Ask-only mode sees no write tools.

### Audit

Record:

- proposal, confirmation, cancellation;
- provider operation start/end and outcome;
- local listing before/after snapshot;
- Shopify product/variant IDs and request ID;
- field provenance and payload hash;
- actor staff ID and conversation/mutation ID;
- publish/unpublish and inventory configuration changes.

Do not log access tokens, Nango connection secrets, full photo bytes, or unrestricted description text.

### Secrets and tenancy

- Keep OAuth tokens in Nango/vault only.
- All settings, drafts, listing rows, operations, and media exports carry `organization_id` and use tenant helpers/RLS.
- Replace global store-handle assumptions with per-account store metadata.
- The model never supplies org ID, connection ID, Shopify GID, location GID, or publication GID as authority.

## 15. Failure matrix

| Failure | Classification | Operator result | Retry rule |
|---|---|---|---|
| Shopify not connected | setup | Connect Shopify step | No retry |
| Missing `write_products` | setup/scope | Reconnect and approve listing access | No retry until scope changes |
| Shopify staff permission denied | authorization | Explain Shopify-side permission requirement | No retry |
| Missing price | validation | Ask for price | No retry |
| Ambiguous SKU/account | resolution | Show choices | No retry |
| Invalid barcode/HTML/input | validation | Field-level correction | No retry |
| GraphQL `userErrors` | provider validation | Preserve draft and show safe field error | Retry only after correction |
| Throttled | transient | Processing/retry state | Bounded backoff from cost metadata |
| HTTP 5xx/network before known response | transient/unknown | “Could not confirm outcome yet” | Query custom ID first |
| Product exists by custom ID | idempotent success/update | Read back existing managed product | Do not create another |
| Unmanaged SKU/title match | ownership conflict | Refuse overwrite; link for review | No automatic retry |
| Media upload partly succeeds | partial | Product remains draft; show missing media | Retry missing hashes only |
| DB commit fails after Shopify succeeds | recoverable unknown | Operation recovery required | Query custom ID and rebuild local binding |
| Inventory compare mismatch | concurrency | Re-read/recalculate | Retry newest source version only |
| Publication fails | terminal/transient | Product remains draft/unpublished | Safe targeted retry |

## 16. Testing strategy

### Pure/unit tests

- Catalog/account/SKU resolution and ambiguity.
- Field precedence/provenance.
- Public-copy allowlist and internal-data denylist.
- Money conversion, barcode selection, safety buffer, zero quantity.
- Draft merge and missing-field questions.
- Deterministic custom ID, request hash, and idempotency key.
- Shopify input mapping and full-list/patch ownership rules.
- GraphQL error normalization and throttle decisions.
- Admin URL derivation from per-store metadata.

### Assistant/tool tests

- Draft tool is advertised under the correct permission.
- Ask-only mode refuses create/publish.
- “Create it” proposes but performs no external call.
- Same-turn confirm is refused.
- Later “yes” confirms the correct pending proposal only.
- Cancel performs no external write.
- Tool subsetting selects listing tools for representative phrases.
- Artifact bytes come from the server and validate on desktop/mobile.

### Operation/idempotency tests

- Double confirm produces one operation and one Shopify product.
- Timeout after provider success recovers by custom ID.
- Retry after local persistence failure repairs the same row.
- Changed payload under the same key is refused.
- Media retry reuses completed hash exports.
- Concurrent inventory updates coalesce to the newest version.

### Connector contract tests

Use a fake GraphQL transport to cover:

- direct vault and Nango proxy modes;
- HTTP errors, GraphQL errors, `userErrors`, `ACCESS_DENIED`, throttle metadata;
- productSet create/update/read-back;
- staged upload targets and media processing;
- inventory compare failures and idempotency directive;
- publication success/failure.

### Shopify development-store smoke

- Connect with the exact required scopes.
- Validate store identity, scopes, locations, and publications.
- Create a draft with one image and quantity.
- Repeat the same operation and prove no duplicate product.
- Edit title/price in CycleForge and update the managed draft.
- Simulate timeout/recovery.
- Publish only through the separate action, then unpublish manually for cleanup.

### App verification

- Exercise through `http://localhost:3050` only.
- Verify desktop session composer and the relevant `/m/*` composer surface.
- Run `pnpm verify:fast` per slice and `pnpm verify` before rollout.
- Add a focused assistant eval cohort with prompts for create, ambiguity, update, cancel, confirm, and publish confusion.

## 17. Observability and operations

Metrics:

- listing drafts created / blocked by reason;
- proposals / confirmations / cancellations;
- product upsert success, terminal failure, transient failure, unknown outcome;
- duplicate-prevention recoveries;
- Shopify GraphQL requested/actual cost and throttle waits;
- media export success/processing/failure;
- inventory export lag and drift count;
- publication attempts and failures.

Structured logs include org-safe account ID, operation ID, mutation ID, provider request ID, resource key hash, phase, duration, and error code. They exclude tokens and sensitive payload text.

Admin/support surfaces should expose:

- Listing readiness: connected, scopes, location, publication, inventory sync.
- Recent external-write operations and recovery state.
- Per-listing sync status/error and Shopify link.
- A safe “retry” action for retryable/unknown operations that runs recovery first.

Alerts:

- unknown operation older than the recovery SLA;
- repeated scope/permission failures after a previously healthy state;
- inventory sync freshness breach for any published managed listing;
- reconciliation drift above threshold;
- sustained Shopify throttle or mutation error rate.

## 18. Delivery plan and gates

### Phase 0 — decisions and development store

Deliverables:

- Create/configure Shopify app and development store.
- Configure Nango Shopify integration and required scopes.
- Supply Nango runtime configuration to the lane/deployment.
- Confirm whether initial production scope is one store/account.
- Agree on required listing fields and publication media policy.

Gate:

- `currentAppInstallation` reports expected scopes and the app can query shop/locations in a development store.

### Phase 1 — Shopify client and readiness

Files:

- New `src/lib/integrations/shopify/client.ts`
- New `src/lib/integrations/shopify/readiness.ts`
- Refactor `connectors/shopify.ts` to use the shared client
- Update registry capability to include `catalog` only when the path is built
- Settings readiness presentation and stale docs

Deliverables:

- Versioned typed GraphQL client.
- Scope/store/location readiness checks.
- Per-account nonsecret settings.
- Existing order sync unchanged through regression tests.

Gate:

- Order sync still passes; listing readiness accurately distinguishes connected from write-ready.

### Phase 2 — listing draft vertical slice

Files:

- New `src/lib/shopify/listing-draft.ts`
- New `src/lib/shopify/listing-source.ts`
- New `src/lib/shopify/listing-copy.ts`
- New `src/lib/assistant/tools/shopify-listing-tools.ts`
- Extend `ui-artifacts.ts` and session artifact renderer
- Register tool/subsetting/system guidance

Deliverables:

- Exact SKU/account resolution.
- Provenance-aware autofill.
- Safe AI copy generation.
- Typed desktop/mobile draft card.
- No Shopify mutation yet.

Gate:

- Representative prompts produce correct cards and never invent price/specification/identity.

### Phase 3 — confirmed idempotent draft creation

Files:

- Migrations for listing IDs and operation ledger
- New `src/lib/shopify/listing-export.ts`
- New `src/lib/shopify/product-api.ts`
- New dedicated assistant write executor
- Extend surfaces mutation registry, permission registry, audit, activity labels

Deliverables:

- Propose/confirm/cancel.
- Unique custom-ID setup.
- `productSet` draft upsert.
- Durable operation/recovery.
- Local listing read-back and admin link.

Gate:

- Double execution and lost-response tests prove exactly one Shopify product.

### Phase 4 — media export

Files:

- New media export mapping migration/domain module
- Reuse `readPhotoBytesById` and storage SHA-256 facts
- Shopify staged-upload adapter

Deliverables:

- Ordered gallery export, dedupe, processing checks, alt text.
- Partial media failures leave a recoverable draft.

Gate:

- Development-store product shows the exact CycleForge gallery order and retry does not duplicate media.

### Phase 5 — inventory sync and live publication

Files:

- New `src/lib/integrations/shopify/inventory.ts`
- Shopify `pushInventory` wiring
- Inventory outbox/coalescer and reconcile job
- `canPublishShopifyListing`
- New `publish_shopify_listing` tool

Deliverables:

- Location-mapped, idempotent compare-and-set stock updates.
- Health/freshness monitoring.
- Separate confirmed activate/publish action.

Gate:

- Cross-channel stock change reaches Shopify and reconciliation repairs a dropped event before publication is enabled.

### Phase 6 — drift, webhooks, managed updates

Deliverables:

- Product update/delete webhook or Nango-forwarding spike and implementation.
- HMAC/signature and duplicate-delivery verification.
- Managed field drift policy and conflict UI.
- Safe update flow with full-list ownership rules.

Gate:

- Manual Shopify edits are detected and never silently overwritten contrary to policy.

### Phase 7 — controlled rollout

1. Feature flag hidden; development store only.
2. Dogfood org with create-draft only.
3. Enable media after export telemetry is clean.
4. Enable inventory sync with publication still disabled.
5. Observe reconciliation freshness and drift.
6. Grant publish permission to a small admin group.
7. Enable per org/account, with a kill switch that disables all outbound Shopify writes while preserving reads/order import.

## 19. Acceptance scenarios

1. **Exact create:** Exact SKU + explicit price → complete draft → confirm next turn → one Shopify draft product and local binding.
2. **Natural-language autofill:** “List SKU X on Shopify” → catalog/title/barcode/brand/photos/quantity filled; asks only for missing price.
3. **Ambiguity:** Product words match several SKUs → choices, no proposal.
4. **No connection:** Draft reports Connect Shopify; no tool failure stack.
5. **Missing scope:** Connected order import remains usable; listing card says listing access must be approved.
6. **Update:** Same SKU/account later → diff for existing managed product, not duplicate.
7. **Double yes:** Two confirm requests → one external resource.
8. **Lost response:** Shopify succeeds but request times out → recovery finds custom ID and completes locally.
9. **Media partial:** One image fails → product remains draft, successful images remain mapped, failed image is retryable.
10. **Mobile:** Entire draft/propose/confirm/result flow completes from `/m/*`.
11. **Publish confusion:** “Create it” never publishes; “publish it” uses the separate permission/tool.
12. **Stale inventory:** Publication is refused when inventory sync health is stale.
13. **Unmanaged collision:** Similar Shopify SKU/title exists without CycleForge custom ID → no overwrite.
14. **Tenant isolation:** IDs from another org/account cannot be used, even if model-supplied.

## 20. Recommended implementation order

The shortest safe route to user value is:

1. Shared Shopify client + live scope readiness.
2. Draft schema/source resolver/artifact.
3. Dedicated create tool with proposal and durable idempotent product upsert.
4. Media export.
5. Inventory synchronization.
6. Separate publication.
7. Drift/webhooks and managed edits.

Do not begin by adding a raw `productCreate` call to the assistant. That would skip identity, confirmation, recovery, media security, account selection, scope readiness, and inventory safety—the parts that determine whether the integration is trustworthy.

## 21. Authoritative Shopify references used

- [GraphQL Admin `productSet`](https://shopify.dev/docs/api/admin-graphql/latest/mutations/productSet)
- [ProductSetInput](https://shopify.dev/docs/api/admin-graphql/latest/input-objects/ProductSetInput)
- [Working with custom IDs](https://shopify.dev/docs/apps/build/metafields/working-with-custom-ids)
- [Metafield unique-values capability](https://shopify.dev/docs/apps/build/metafields/use-metafield-capabilities)
- [Shopify API access scopes](https://shopify.dev/docs/api/usage/access-scopes)
- [Manage access scopes](https://shopify.dev/docs/apps/build/authentication-authorization/manage-access-scopes)
- [Current app installation / granted scopes](https://shopify.dev/docs/api/admin-graphql/latest/queries/currentappinstallation)
- [Staged uploads](https://shopify.dev/docs/api/admin-graphql/latest/mutations/stageduploadscreate)
- [Inventory set quantities](https://shopify.dev/docs/api/admin-graphql/latest/mutations/inventorysetquantities)
- [Publishable publish](https://shopify.dev/docs/api/admin-graphql/latest/mutations/publishablePublish)
- [Product status](https://shopify.dev/docs/api/admin-graphql/latest/enums/ProductStatus)
- [GraphQL Admin API rate limits](https://shopify.dev/docs/apps/build/apis/graphql-admin/rate-limits)
- [Shopify webhooks](https://shopify.dev/docs/apps/build/webhooks)
