# Zoho Webhooks Receiver

Single endpoint that ingests Zoho Inventory webhook deliveries, verifies the HMAC signature, dedupes by event id, and mirrors the change into our local `receiving` / `receiving_lines` tables.

Once this is wired up, `/api/receiving/lookup-po` (the per-scan path) should rarely need to hit Zoho — most scans become a pure local DB query.

## What you do once, per organization

### 1. Connect Zoho through OAuth

Complete `/api/zoho/oauth/authorize` for the organization. The callback stores
the Zoho credentials in the encrypted integration vault and returns a one-time
webhook bundle:

```json
{
  "webhook": {
    "url": "https://<your-domain>/api/zoho/webhooks/<opaque-token>",
    "signing_secret": "<per-org-secret>",
    "signature_header": "x-zoho-webhook-signature"
  }
}
```

### 2. Run the dedupe migration

```bash
psql $DATABASE_URL -f src/lib/migrations/2026-05-14_create_zoho_webhook_events.sql
```

### 3. Register the webhook in Zoho

Zoho Inventory exposes outbound webhooks via **Workflow Rules**. Wire one rule per event type:

| Module          | Event           | Action      | URL                                                  |
| --------------- | --------------- | ----------- | ---------------------------------------------------- |
| Purchase Orders | Create / Edit   | Webhook     | The tokenized URL returned by OAuth                   |
| Purchase Orders | Delete          | Webhook     | same                                                 |
| Purchase Receives | Create        | Webhook     | same                                                 |
| Purchase Receives | Delete        | Webhook     | same                                                 |

Steps in Zoho's UI:

1. **Settings → Automation → Workflow Rules → New Rule.**
2. Choose the module (e.g. *Purchase Orders*).
3. **When this rule should be executed**: pick *On a record action → Created* (or *Edited* / *Deleted*).
4. Trigger condition: leave broad (e.g., *All Purchase Orders*) unless you want to narrow.
5. **Action → Add Webhook.**
6. Webhook configuration:
   - **URL**: the returned `/api/zoho/webhooks/<opaque-token>` URL
   - **Method**: POST
   - **Module fields to include**: select all (we only read fields we care about; extras are ignored).
   - **Custom headers**: leave default — Zoho will add the signature header automatically once you set the secret below.
   - **Custom parameters**: leave empty.
7. **Save.** Zoho will prompt for an *Authentication Type*. Choose **Webhook with Secret** and paste the returned per-organization signing secret.
8. Repeat for each rule (Create, Edit, Delete on each module).

### 4. Smoke-test

```bash
# Discovery only; token validity is deliberately opaque.
curl https://<your-domain>/api/zoho/webhooks/<opaque-token>
```

Then from Zoho's *Workflow Rule* page click **Test webhook**. Look at the rule's history pane — a `200 OK` response means the receiver verified the signature and stored the event. The first real PO edit will fire a real delivery.

You can also peek at recent deliveries directly:

```sql
SELECT event_id, event_type, object_id, received_at, processed_at, processing_error
FROM zoho_webhook_events
ORDER BY received_at DESC
LIMIT 20;
```

## How it behaves on failure

| Situation                      | HTTP returned | Zoho behavior              | What you do |
| ------------------------------ | ------------- | -------------------------- | ----------- |
| Signature missing / wrong       | `401`         | Retries on its retry curve | Verify the secret in both places matches |
| Body isn't JSON                 | `400`         | No retry                   | Ignore — Zoho only sends JSON |
| Duplicate delivery (same event_id) | `200 deduped` | Stops retrying             | Nothing — by design |
| Handler throws                  | `500`         | Retries, eventually gives up | Check `zoho_webhook_events.processing_error` |
| All handlers happy              | `200`         | Done                       | — |

## What the handlers do

| Event                          | Side effect                                                           |
| ------------------------------ | --------------------------------------------------------------------- |
| `purchaseorder.created/updated` | Calls existing `importZohoPurchaseOrderToReceiving(id)` — upserts the PO into `receiving` / `receiving_lines`. |
| `purchaseorder.deleted`        | Soft-detaches: stamps the affected rows in `receiving_lines` with `zoho_sync_source = 'deleted'` and appends a note. |
| `purchasereceive.created`      | Calls existing `importZohoPurchaseReceiveToReceiving({ purchaseReceiveId })`. |
| `purchasereceive.deleted`      | Clears the local `zoho_purchase_receive_id` reference + note. |
| anything else (`unknown`)      | Stored in `zoho_webhook_events` and 200'd. Add a case in `handlers.ts` if you want to act on it. |

## Adding a new event type

1. Add the new discriminator to `ZohoWebhookEventType` in `src/lib/zoho/webhooks/types.ts`.
2. Teach `classifyEventType()` in `src/lib/zoho/webhooks/normalize.ts` to recognize Zoho's raw string.
3. Add a `case` to `dispatchWebhookEvent()` in `src/lib/zoho/webhooks/handlers.ts` that returns a `HandlerResult`.
4. (Optional) Register a new Workflow Rule in Zoho to start sending the event.

## Operational tips

- Keep at least one of the Workflow Rules in *Test mode* in Zoho until you've seen a successful real delivery — Zoho's test payloads are easier to debug than live ones.
- If you rotate a tenant's webhook secret, update that tenant's Zoho workflow first and the encrypted vault row second. Deliveries retry while the values differ.
- The `zoho_webhook_events` table grows ~1 row per event. Prune anything older than, say, 90 days with a small nightly job if needed.
