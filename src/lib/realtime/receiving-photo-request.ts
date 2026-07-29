/**
 * Desktop → phone photo-capture request over the `staffstation:{staffId}`
 * bridge channel. One payload shape for every publisher (carton pill, sidebar
 * scan flow, unbox line camera, claim picker) so the phone-side router
 * (`ReceivingPhotoRequestCamera`) can stage-route without sniffing senders.
 *
 * Payload v2 adds `stage` + `receiving_line_id` + `po_ref` (item captures route
 * to the PO item page). Backward compatible: consumers treat a missing `stage`
 * as `arrival_package` (see `normalizeReceivingPhotoRequest` in
 * `@/lib/receiving/photo-scope`), so in-flight v1 messages keep working.
 */

import { getStaffStationBridgeChannelName, safeChannelName } from './channels';
import { safeRandomUUID } from '@/lib/safe-uuid';
import { effectiveReceivingPhotoStage } from '@/lib/receiving/photo-scope';
import type { ReceivingPhotoStage } from '@/lib/receiving/photo-intent';

export interface ReceivingPhotoRequestClient {
  channels: {
    get: (name: string) => {
      publish: (event: string, data: Record<string, unknown>) => Promise<void>;
    };
  };
}

export function getReceivingPhotoRequestChannelName(orgId: string | null | undefined, staffId: number): string {
  if (!orgId || staffId <= 0) return '';
  return safeChannelName(() => getStaffStationBridgeChannelName(orgId, staffId));
}

function makeRequestId(): string {
  return safeRandomUUID();
}

interface ReceivingPhotoRequestOptions {
  /** Capture stage this request asks for. Default `arrival_package` (legacy behavior). */
  stage?: ReceivingPhotoStage;
  /** Active receiving line — required for `unbox_item` routing. */
  receivingLineId?: number | null;
  /** PO route ref (zoho PO id or number) so item captures land on `/m/receiving/po/…`. */
  poRef?: string | null;
  /** Legacy sidebar field — carton tracking, informational only. */
  tracking?: string | null;
  requestId?: string;
}

/**
 * Build the wire payload (snake_case). Normalizes stage/line coherence via the
 * scope SoT — the wire never carries an `unbox_item` claim without a line id,
 * nor a carton stage with one.
 */
export function buildReceivingPhotoRequestPayload(
  receivingId: number,
  staffId: number,
  opts: ReceivingPhotoRequestOptions = {},
): Record<string, unknown> {
  const receivingLineId =
    opts.receivingLineId != null && Number.isFinite(opts.receivingLineId) && opts.receivingLineId > 0
      ? opts.receivingLineId
      : null;
  const stage = effectiveReceivingPhotoStage({ stage: opts.stage ?? null, receivingLineId });
  const poRef = String(opts.poRef ?? '').trim();
  const tracking = String(opts.tracking ?? '').trim();
  return {
    receiving_id: receivingId,
    ...(receivingLineId != null ? { receiving_line_id: receivingLineId } : {}),
    stage,
    ...(poRef ? { po_ref: poRef } : {}),
    ...(tracking ? { tracking } : {}),
    request_id: opts.requestId || makeRequestId(),
    requested_by_staff_id: staffId,
  };
}

export async function publishReceivingPhotoRequest(
  client: ReceivingPhotoRequestClient | null,
  orgId: string | null | undefined,
  staffId: number,
  receivingId: number,
  opts: ReceivingPhotoRequestOptions = {},
): Promise<void> {
  const channelName = getReceivingPhotoRequestChannelName(orgId, staffId);
  if (!client || !channelName || !Number.isFinite(receivingId) || receivingId <= 0) return;
  const channel = client.channels.get(channelName);
  await channel.publish(
    'receiving_photo_request',
    buildReceivingPhotoRequestPayload(receivingId, staffId, opts),
  );
}
