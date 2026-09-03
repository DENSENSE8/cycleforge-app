/**
 * Application webhook replay — NOT provider-authentic.
 *
 * Replays a sanitized stored payload against dispatchWebhookEvent (the same
 * handler production uses after signature verification). Signature, timestamp
 * tolerance, and provider headers are NOT re-checked here. A successful
 * application replay is not proof the real Zoho webhook integration works.
 */

import { withTenantTransaction } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { normalizeZohoWebhook } from '@/lib/zoho/webhooks/normalize';
import { dispatchWebhookEvent, type HandlerResult } from '@/lib/zoho/webhooks/handlers';
import type { ZohoWebhookEnvelope } from '@/lib/zoho/webhooks/types';
import { redactRecord } from './redact';

export type WebhookReplayMode = 'once' | 'twice' | 'out_of_order';

export interface StoredWebhookEvent {
  eventId: string;
  eventType: string;
  objectId: string | null;
  eventTime: string | null;
  receivedAt: string;
  processedAt: string | null;
  processingError: string | null;
  /** Redacted envelope summary — never the raw credential-bearing body. */
  summary: Record<string, unknown>;
}

export interface WebhookReplayResult {
  mode: WebhookReplayMode;
  authentic: false;
  label: 'Application replay — not provider-authentic';
  attempts: Array<{ pass: number; action: string; skipped?: boolean; detail?: Record<string, unknown> }>;
}

interface EventRow {
  event_id: string;
  event_type: string;
  object_id: string | null;
  event_time: Date | null;
  received_at: Date;
  processed_at: Date | null;
  processing_error: string | null;
  raw_payload: unknown;
}

function mapRow(row: Omit<EventRow, 'raw_payload'> & { raw_payload?: unknown }): StoredWebhookEvent {
  const raw = (row.raw_payload && typeof row.raw_payload === 'object'
    ? row.raw_payload
    : {}) as Record<string, unknown>;
  return {
    eventId: row.event_id,
    eventType: row.event_type,
    objectId: row.object_id,
    eventTime: row.event_time ? new Date(row.event_time).toISOString() : null,
    receivedAt: new Date(row.received_at).toISOString(),
    processedAt: row.processed_at ? new Date(row.processed_at).toISOString() : null,
    processingError: row.processing_error,
    summary: redactRecord({
      event_type: raw.event_type ?? row.event_type,
      organization_id: raw.organization_id ?? null,
      object_id: row.object_id,
    }),
  };
}

export async function listStoredWebhooks(orgId: OrgId, limit = 40): Promise<StoredWebhookEvent[]> {
  const cap = Math.max(1, Math.min(100, limit));
  return withTenantTransaction(orgId, async (client) => {
    const r = await client.query<EventRow>(
      `SELECT event_id, event_type, object_id, event_time, received_at, processed_at,
              processing_error, raw_payload
         FROM zoho_webhook_events
        WHERE organization_id = $1
        ORDER BY received_at DESC
        LIMIT $2`,
      [orgId, cap],
    );
    return r.rows.map(mapRow);
  });
}

function cloneEnvelope(raw: unknown): ZohoWebhookEnvelope {
  return JSON.parse(JSON.stringify(raw ?? {})) as ZohoWebhookEnvelope;
}

function modifyNonSecret(envelope: ZohoWebhookEnvelope): ZohoWebhookEnvelope {
  const next = cloneEnvelope(envelope);
  next.event_time = new Date().toISOString();
  const obj = (next.data ?? next.payload ?? next.purchaseorder ?? {}) as Record<string, unknown>;
  if (obj && typeof obj === 'object') {
    if (typeof obj.notes === 'string') obj.notes = `${obj.notes} [qa-replay]`;
    else obj.qa_replay_mark = true;
  }
  return next;
}

export async function loadStoredWebhookEnvelope(orgId: OrgId, eventId: string): Promise<EventRow> {
  return withTenantTransaction(orgId, async (client) => {
    const r = await client.query<EventRow>(
      `SELECT event_id, event_type, object_id, event_time, received_at, processed_at,
              processing_error, raw_payload
         FROM zoho_webhook_events
        WHERE organization_id = $1 AND event_id = $2
        LIMIT 1`,
      [orgId, eventId],
    );
    const row = r.rows[0];
    if (!row) throw new Error('Stored webhook event not found for this organization');
    return row;
  });
}

async function dispatchOne(orgId: OrgId, envelope: ZohoWebhookEnvelope): Promise<HandlerResult> {
  const event = normalizeZohoWebhook(envelope);
  return dispatchWebhookEvent(event, orgId);
}

export async function replayStoredWebhook(
  orgId: OrgId,
  input: {
    eventId: string;
    mode: WebhookReplayMode;
    modifyNonSecretFields?: boolean;
  },
): Promise<WebhookReplayResult> {
  const row = await loadStoredWebhookEnvelope(orgId, input.eventId);
  let envelope = cloneEnvelope(row.raw_payload);
  if (input.modifyNonSecretFields) envelope = modifyNonSecret(envelope);

  const attempts: WebhookReplayResult['attempts'] = [];

  if (input.mode === 'out_of_order') {
    const neighbor = await withTenantTransaction(orgId, async (client) => {
      const r = await client.query<EventRow>(
        `SELECT event_id, event_type, object_id, event_time, received_at, processed_at,
                processing_error, raw_payload
           FROM zoho_webhook_events
          WHERE organization_id = $1 AND event_id <> $2
          ORDER BY received_at DESC
          LIMIT 1`,
        [orgId, input.eventId],
      );
      return r.rows[0] ?? null;
    });
    if (neighbor) {
      const newer = await dispatchOne(orgId, cloneEnvelope(neighbor.raw_payload));
      attempts.push({
        pass: 1,
        action: newer.action,
        skipped: newer.skipped,
        detail: { ...newer.detail, eventId: neighbor.event_id, order: 'later-first' },
      });
    }
    const self = await dispatchOne(orgId, envelope);
    attempts.push({
      pass: attempts.length + 1,
      action: self.action,
      skipped: self.skipped,
      detail: { ...self.detail, eventId: row.event_id, order: 'then-target' },
    });
  } else {
    const first = await dispatchOne(orgId, envelope);
    attempts.push({ pass: 1, action: first.action, skipped: first.skipped, detail: first.detail });
    if (input.mode === 'twice') {
      const second = await dispatchOne(orgId, envelope);
      attempts.push({ pass: 2, action: second.action, skipped: second.skipped, detail: second.detail });
    }
  }

  return {
    mode: input.mode,
    authentic: false,
    label: 'Application replay — not provider-authentic',
    attempts,
  };
}
