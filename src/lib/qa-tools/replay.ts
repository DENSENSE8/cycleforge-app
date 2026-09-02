import type { OrgId } from '@/lib/tenancy/constants';
import { dispatchWebhookEvent } from '@/lib/zoho/webhooks/handlers';
import { reserveWebhookEvent, markWebhookEventFailed, markWebhookEventProcessed } from '@/lib/zoho/webhooks/dedupe';
import { normalizeZohoWebhook } from '@/lib/zoho/webhooks/normalize';
import type { ZohoWebhookEnvelope, ZohoWebhookEventType } from '@/lib/zoho/webhooks/types';

export const QA_REPLAY_EVENT_TYPES = [
  'purchaseorder.created',
  'purchaseorder.updated',
  'purchaseorder.deleted',
  'purchasereceive.created',
  'purchasereceive.deleted',
] as const satisfies readonly ZohoWebhookEventType[];

export type QaReplayEventType = (typeof QA_REPLAY_EVENT_TYPES)[number];

export interface QaZohoReplayInput {
  eventId: string;
  eventType: QaReplayEventType;
  objectId: string;
}

export interface QaZohoReplayResult {
  eventId: string;
  eventType: QaReplayEventType;
  deduped: boolean;
  action?: string;
  skipped?: boolean;
}

export function qaReplayRequiresDestructivePermission(eventType: QaReplayEventType): boolean {
  return eventType.endsWith('.deleted');
}

export function buildQaZohoReplayEnvelope(input: QaZohoReplayInput): ZohoWebhookEnvelope {
  const objectKey = input.eventType.startsWith('purchaseorder') ? 'id' : 'purchase_receive_id';
  return {
    event_id: input.eventId,
    event_type: input.eventType,
    data: { [objectKey]: input.objectId },
  };
}

export async function replayQaZohoWebhook(
  orgId: OrgId,
  input: QaZohoReplayInput,
): Promise<QaZohoReplayResult> {
  const event = normalizeZohoWebhook(buildQaZohoReplayEnvelope(input));
  const reservation = await reserveWebhookEvent(event, orgId);
  if (!reservation.isFresh) {
    return { eventId: event.eventId, eventType: input.eventType, deduped: true };
  }

  try {
    const result = await dispatchWebhookEvent(event, orgId);
    await markWebhookEventProcessed(orgId, event.eventId);
    return {
      eventId: event.eventId,
      eventType: input.eventType,
      deduped: false,
      action: result.action,
      skipped: result.skipped ?? false,
    };
  } catch (error) {
    await markWebhookEventFailed(orgId, event.eventId, error).catch(() => {});
    throw error;
  }
}
