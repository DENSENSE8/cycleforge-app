/** Outbound workflow facts — the React-free typed waist shared by phone and desk projections. */

import {
  resolveOrderLifecycleStage,
  type OrderLifecycleStage,
} from '@/lib/order-lifecycle';
import { nextStepForLifecycleStage } from '@/lib/orders/orders-next-step';
import {
  classifyDeadlineBand,
  type DeadlineBand,
} from '@/lib/work-orders/deadline-bands';
import {
  resolveOutboundWorkflowActions,
  resolveOutboundWorkflowException,
  type OutboundWorkflowActions,
  type OutboundWorkflowException,
} from '@/lib/shipping/outbound-workflow-actions';

export interface OutboundWorkflowFactInput {
  shipmentId?: number | string | null;
  hasTechScan?: boolean | null;
  packedAt?: string | null;
  /** `station_activity_logs.DO​​CK_STAGED.created_at`; physical dock proof. */
  dockStagedAt?: string | null;
  isOutOfStock?: boolean | string | null;
  deadlineAt?: string | null;
}

export interface OutboundWorkflowFacts {
  stage: OrderLifecycleStage;
  /** Visual role only; its state comes from this workflow verdict, never a renderer-local color branch. */
  stateRail: OutboundWorkflowStateRail;
  deadlineBand: DeadlineBand;
  blocked: boolean;
  staged: boolean;
  readyForScanOut: boolean;
  nextStep: ReturnType<typeof nextStepForLifecycleStage>;
  exception: OutboundWorkflowException;
  actions: OutboundWorkflowActions;
}

/** The compact row's left state mark — semantic role, not a palette value. */
export type OutboundWorkflowStateRail = 'ready' | 'exception' | 'packed';

export function resolveOutboundWorkflowStateRail(
  stage: OrderLifecycleStage,
  exception: OutboundWorkflowException,
): OutboundWorkflowStateRail {
  if (exception.kind !== 'none') return 'exception';
  if (stage === 'PACKED_STAGED') return 'packed';
  return 'ready';
}

function normalizeOutOfStock(value: OutboundWorkflowFactInput['isOutOfStock']): boolean {
  if (typeof value === 'boolean') return value;
  return String(value ?? '').trim() !== '';
}

export function resolveOutboundWorkflowFacts(
  input: OutboundWorkflowFactInput,
  options: { todayKey?: string } = {},
): OutboundWorkflowFacts {
  const hasLabel = input.shipmentId != null && String(input.shipmentId) !== '';
  const hasTechScan = Boolean(input.hasTechScan);
  const packed = Boolean(input.packedAt);
  const staged = Boolean(input.dockStagedAt);
  const stage = resolveOrderLifecycleStage({
    shipmentId: input.shipmentId ?? null,
    hasTechScan,
    packedAt: input.packedAt ?? null,
    isOutOfStock: normalizeOutOfStock(input.isOutOfStock),
  });

  const actions = resolveOutboundWorkflowActions({
    stage,
    hasLabel,
    hasTechScan,
    packed,
    staged,
  });

  const exception = resolveOutboundWorkflowException(stage);

  return {
    stage,
    stateRail: resolveOutboundWorkflowStateRail(stage, exception),
    deadlineBand: classifyDeadlineBand(input.deadlineAt, options.todayKey),
    blocked: stage === 'BLOCKED',
    staged,
    readyForScanOut: packed && staged,
    nextStep: nextStepForLifecycleStage(stage),
    exception,
    actions,
  };
}
