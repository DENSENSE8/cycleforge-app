/** Outbound workflow actions — stable, React-free command facts. */

import type { OrderLifecycleStage } from '@/lib/order-lifecycle';

export const OUTBOUND_WORKFLOW_ACTION_IDS = [
  'label',
  'pick',
  'pack',
  'hold',
  'clear_hold',
  'stage',
  'scan_out',
] as const;

export type OutboundWorkflowActionId = (typeof OUTBOUND_WORKFLOW_ACTION_IDS)[number];

/**
 * Exception reporting is a separate, non-execution command family. It stays
 * explicit so a phone row cannot smuggle arbitrary JSX into its swipe rail.
 */
export const OUTBOUND_TRIAGE_ACTION_IDS = [
  'out_of_stock',
  'damaged',
  'discrepancy',
] as const;

export type OutboundTriageActionId = (typeof OUTBOUND_TRIAGE_ACTION_IDS)[number];

type OutboundTriageAction = Readonly<{
  id: OutboundTriageActionId;
  label: string;
  persistedAs: 'shortage' | 'damaged' | 'discrepancy';
}>;

export const OUTBOUND_TRIAGE_ACTIONS: readonly OutboundTriageAction[] = [
  { id: 'out_of_stock', label: 'Out of stock', persistedAs: 'shortage' },
  { id: 'damaged', label: 'Damaged', persistedAs: 'damaged' },
  { id: 'discrepancy', label: 'Flag discrepancy', persistedAs: 'discrepancy' },
] as const;

/**
 * Marketplace writes remain a separate, closed command family from order
 * triage. Renderers may expose one only when the connected provider owns the
 * matching mutation; they may not improvise account-specific actions.
 */
export const OUTBOUND_CHANNEL_TRIAGE_ACTION_IDS = [
  'halt_ebay_listing',
  'zero_amazon_inventory',
] as const;

type OutboundChannelTriageActionId = (typeof OUTBOUND_CHANNEL_TRIAGE_ACTION_IDS)[number];

type OutboundChannelTriageAction = Readonly<{
  id: OutboundChannelTriageActionId;
  platform: 'ebay' | 'amazon';
  label: string;
  mutation: 'halt_listing' | 'set_inventory_zero';
}>;

export const OUTBOUND_CHANNEL_TRIAGE_ACTIONS: readonly OutboundChannelTriageAction[] = [
  { id: 'halt_ebay_listing', platform: 'ebay', label: 'Halt eBay listing', mutation: 'halt_listing' },
  { id: 'zero_amazon_inventory', platform: 'amazon', label: 'Zero Amazon inventory', mutation: 'set_inventory_zero' },
] as const;

/** Priority is not an exception: */
export const OUTBOUND_PRIORITY_ACTION_IDS = ['mark_urgent', 'clear_urgent'] as const;

export type OutboundPriorityActionId = (typeof OUTBOUND_PRIORITY_ACTION_IDS)[number];

export type OutboundPriorityAction = Readonly<{
  id: OutboundPriorityActionId;
  label: 'Mark urgent' | 'Clear urgent';
}>;

export function resolveOutboundPriorityAction(isUrgent: boolean): OutboundPriorityAction {
  return isUrgent
    ? { id: 'clear_urgent', label: 'Clear urgent' }
    : { id: 'mark_urgent', label: 'Mark urgent' };
}

type EnabledActionState = 'primary' | 'available';
type DisabledActionState = 'complete' | 'blocked' | 'unavailable';

type OutboundWorkflowActionBase = {
  id: OutboundWorkflowActionId;
  label: string;
};

export type OutboundWorkflowActionFact =
  | (OutboundWorkflowActionBase & {
      state: EnabledActionState;
      enabled: true;
    })
  | (OutboundWorkflowActionBase & {
      state: DisabledActionState;
      enabled: false;
      reason: string;
      completionBasis?: 'direct_signal';
    });

export type OutboundWorkflowActions = Readonly<
  Record<OutboundWorkflowActionId, OutboundWorkflowActionFact>
>;

export type OutboundWorkflowException =
  | { kind: 'none' }
  | {
      kind: 'out_of_stock';
      code: 'OUT_OF_STOCK';
      severity: 'blocking';
      message: 'Inventory mismatch for current unit';
      resolutionAction: 'clear_hold';
    };

interface OutboundWorkflowActionInput {
  stage: OrderLifecycleStage;
  hasLabel: boolean;
  hasPickScan: boolean;
  packed: boolean;
  staged: boolean;
}

const LABELS: Readonly<Record<OutboundWorkflowActionId, string>> = {
  label: 'Label',
  pick: 'Pick',
  pack: 'Pack',
  hold: 'Place on hold',
  clear_hold: 'Clear hold',
  stage: 'Stage',
  scan_out: 'Scan out',
};

function enabled(
  id: OutboundWorkflowActionId,
  state: EnabledActionState,
): OutboundWorkflowActionFact {
  return { id, label: LABELS[id], state, enabled: true };
}

function disabled(
  id: OutboundWorkflowActionId,
  state: DisabledActionState,
  reason: string,
  completionBasis?: 'direct_signal',
): OutboundWorkflowActionFact {
  return {
    id,
    label: LABELS[id],
    state,
    enabled: false,
    reason,
    ...(completionBasis ? { completionBasis } : null),
  };
}

export function resolveOutboundWorkflowException(
  stage: OrderLifecycleStage,
): OutboundWorkflowException {
  if (stage !== 'BLOCKED') return { kind: 'none' };
  return {
    kind: 'out_of_stock',
    code: 'OUT_OF_STOCK',
    severity: 'blocking',
    message: 'Inventory mismatch for current unit',
    resolutionAction: 'clear_hold',
  };
}

/**
 * Resolve the full verb matrix. Every id is always present: unavailable work
 * is explained instead of disappearing, which keeps agent and human harnesses
 * on the same vocabulary.
 */
export function resolveOutboundWorkflowActions(
  input: OutboundWorkflowActionInput,
): OutboundWorkflowActions {
  const blockedByHold = input.stage === 'BLOCKED';
  const holdReason = 'Clear the out-of-stock hold first.';

  const label = input.hasLabel
    ? disabled('label', 'complete', 'Shipping label attached.', 'direct_signal')
    : input.packed
      ? disabled('label', 'unavailable', 'Packed order has no label signal; reconcile its shipment.')
      : blockedByHold
        ? disabled('label', 'blocked', holdReason)
        : enabled('label', 'primary');

  const pick = input.hasPickScan
    ? disabled('pick', 'complete', 'Pick scan recorded.', 'direct_signal')
    : blockedByHold
      ? disabled('pick', 'blocked', holdReason)
      : !input.hasLabel
        ? disabled('pick', 'blocked', 'Attach the shipping label first.')
        : enabled('pick', 'primary');

  const pack = input.packed
    ? disabled('pack', 'complete', 'Pack event recorded.', 'direct_signal')
    : blockedByHold
      ? disabled('pack', 'blocked', holdReason)
      : !input.hasLabel
        ? disabled('pack', 'blocked', 'Attach the shipping label first.')
        : !input.hasPickScan
          ? disabled('pack', 'blocked', 'Complete the pick first.')
          : enabled('pack', 'primary');

  const hold = blockedByHold
    ? disabled('hold', 'complete', 'Order is already on hold.', 'direct_signal')
    : input.packed
      ? disabled('hold', 'unavailable', 'Packed work cannot enter a stock hold.')
      : enabled('hold', 'available');

  const clearHold = blockedByHold
    ? enabled('clear_hold', 'primary')
    : disabled('clear_hold', 'unavailable', 'Order has no active hold.');

  const stage = input.staged
    ? disabled(
        'stage',
        'complete',
        'Dock staging scan recorded.',
        'direct_signal',
      )
    : blockedByHold
      ? disabled('stage', 'blocked', holdReason)
      : input.packed
        ? enabled('stage', 'primary')
      : disabled('stage', 'blocked', 'Complete packing first.');

  const scanOut = input.packed && input.staged
    ? enabled('scan_out', 'primary')
    : blockedByHold
      ? disabled('scan_out', 'blocked', holdReason)
      : input.packed
        ? disabled('scan_out', 'blocked', 'Stage the packed order at the dock first.')
      : disabled('scan_out', 'blocked', 'Pack and stage the order first.');

  return {
    label,
    pick,
    pack,
    hold,
    clear_hold: clearHold,
    stage,
    scan_out: scanOut,
  };
}
