/**
 * Pick JobFace mapper — GET pick-tasks JSON → IdentificationResult.
 *
 * Dual-entry: list-claim and a later scan of the same order share this function.
 * Does not write picking session / confirm-pick.
 */

import type { IdentificationResult, IdentificationSource, JobFace, JobFaceState } from './types';

export interface PickClaimJson {
  ok?: boolean;
  error?: string | null;
  orderId?: number | string | null;
  orderLabel?: string | null;
  productTitle?: string | null;
  customerInitials?: string | null;
  shipByDate?: string | null;
  tasks?: Array<{
    currentState?: string | null;
    productTitle?: string | null;
    serialNumber?: string | null;
  }>;
}

function openTaskCount(json: PickClaimJson): number {
  const tasks = json.tasks ?? [];
  return tasks.filter((t) => {
    const s = String(t.currentState ?? '').toUpperCase();
    return s !== 'PICKED' && s !== 'PACKED' && s !== 'SHIPPED';
  }).length;
}

function faceFor(json: PickClaimJson): JobFace {
  let state: JobFaceState;
  let title: string;
  let mutate: JobFace['mutate'] = null;
  const message = json.error ?? null;

  if (json.ok === false) {
    state = json.error?.toLowerCase().includes('not found') ? 'miss' : 'error';
    title = state === 'miss' ? 'No order found' : 'Pick load failed';
  } else if (!json.orderId && !(json.tasks && json.tasks.length)) {
    state = 'miss';
    title = 'No order found';
  } else if (openTaskCount(json) === 0 && (json.tasks?.length ?? 0) > 0) {
    state = 'done';
    title = 'Picks complete';
  } else if ((json.tasks?.length ?? 0) === 0) {
    state = 'blocked';
    title = 'Nothing to pick';
  } else {
    state = 'ready';
    title = 'Ready to pick';
    mutate = 'PICK_CONFIRM';
  }

  return { state, title, message, mutate };
}

export function identificationFromPick(args: {
  source: IdentificationSource;
  organizationId: string;
  clientEventId: string;
  json: PickClaimJson;
  requestedKey?: string;
}): IdentificationResult {
  const organizationId = String(args.organizationId ?? '').trim();
  const clientEventId = String(args.clientEventId ?? '').trim();
  if (!organizationId) throw new Error('organizationId required');
  if (!clientEventId) throw new Error('clientEventId required');

  const id =
    args.json.orderId != null && String(args.json.orderId).trim()
      ? String(args.json.orderId)
      : String(args.requestedKey ?? '').trim();

  return {
    organizationId,
    clientEventId,
    job: 'pick',
    source: args.source,
    entity: { kind: 'order', id },
    face: faceFor(args.json),
  };
}
