/** Desk order inspector (`detail:order`) topic → action map. */

import type { ShippedActiveSection } from '@/components/shipped/stacks/types';
import type { OrderInspectorRecordCta } from '@/lib/selection-context/order-inspector-context';

/** Locked Display topics — Unbox-style icon topic plate (never Assign). */
export type OrderInspectorDisplayTopic =
  | 'order'
  | 'documents'
  | 'timeline'
  | 'conversation';

/** Nested verbs under the Order parent (flush child-mode select). */
export type OrderInspectorOrderChild = 'shipping' | 'product';

/** Order-tab bottom update actions (toggle editors / one-shot mutations). */
export type OrderInspectorUpdateActionKey =
  | 'assign'
  | 'urgent'
  | 'notes'
  | 'out_of_stock'
  | 'status';

type OrderInspectorTopicSpec = {
  key: OrderInspectorDisplayTopic;
  label: string;
  tabLabel: string;
  shortcut: string;
};

type OrderInspectorMoreItem = {
  key: string;
  label: string;
  shortcut?: string;
};

type OrderInspectorUpdateAction = {
  key: OrderInspectorUpdateActionKey;
  label: string;
  shortcut?: string;
};

const DISPLAY_TOPICS: readonly OrderInspectorTopicSpec[] = [
  {
    key: 'order',
    label: 'Order fulfillment & product',
    tabLabel: 'Order',
    shortcut: '1',
  },
  {
    key: 'documents',
    label: 'Shipping label & packing slip',
    tabLabel: 'Documents',
    shortcut: '2',
  },
  {
    key: 'timeline',
    label: 'Order timeline & item journey',
    tabLabel: 'Timeline',
    shortcut: '3',
  },
  {
    key: 'conversation',
    label: 'Order conversation thread',
    tabLabel: 'Conversation',
    shortcut: '4',
  },
] as const;

const ORDER_CHILDREN: ReadonlyArray<{ id: OrderInspectorOrderChild; label: string }> = [
  { id: 'shipping', label: 'Shipping' },
  { id: 'product', label: 'Product' },
];

/** Locked Display parents (Documents gated). Never a fifth Assign cell. */
export function orderInspectorDisplayTopics(input: {
  showDocumentsTab: boolean;
}): ReadonlyArray<OrderInspectorTopicSpec> {
  return DISPLAY_TOPICS.filter((t) => {
    if (t.key === 'documents') return input.showDocumentsTab;
    return true;
  });
}

/** Nested Shipping · Product under Order. */
export function orderInspectorOrderChildren(): ReadonlyArray<{
  id: OrderInspectorOrderChild;
  label: string;
}> {
  return ORDER_CHILDREN;
}

/** Map a legacy leaf section (context default / replace-tracking) → topic + child. */
export function resolveOrderInspectorTopicState(
  section: ShippedActiveSection,
): {
  topic: OrderInspectorDisplayTopic;
  orderChild: OrderInspectorOrderChild;
} {
  switch (section) {
    case 'product':
      return { topic: 'order', orderChild: 'product' };
    case 'documents':
      return { topic: 'documents', orderChild: 'shipping' };
    case 'timeline':
      return { topic: 'timeline', orderChild: 'shipping' };
    case 'conversation':
      return { topic: 'conversation', orderChild: 'shipping' };
    case 'customer':
    case 'warranty':
    case 'shipping':
    default:
      return { topic: 'order', orderChild: 'shipping' };
  }
}

/** Derive the body leaf section from Display topic + Order child. */
export function orderInspectorActiveSection(
  topic: OrderInspectorDisplayTopic,
  orderChild: OrderInspectorOrderChild,
): ShippedActiveSection {
  switch (topic) {
    case 'documents':
      return 'documents';
    case 'timeline':
      return 'timeline';
    case 'conversation':
      return 'conversation';
    case 'order':
    default:
      return orderChild;
  }
}

/**
 * Resolve a requested Display topic against lane gates.
 */
export function resolveOrderInspectorDisplayTopic(
  requested: OrderInspectorDisplayTopic,
  gates: { showDocumentsTab: boolean },
): OrderInspectorDisplayTopic {
  if (requested === 'documents' && !gates.showDocumentsTab) return 'order';
  return requested;
}

/**
 * Order-tab bottom update CTAs. Assign + dispatch edits live here — not on the
 * topic plate and not in the plate ⋮.
 */
export function orderInspectorOrderUpdateActions(input: {
  showDispatchExtras: boolean;
  showAssign: boolean;
  isUrgent: boolean;
  /** Already left the building — urgency is moot, so no urgent toggle. */
  isShipped: boolean;
}): ReadonlyArray<OrderInspectorUpdateAction> {
  const items: OrderInspectorUpdateAction[] = [];

  if (input.showAssign) {
    items.push({ key: 'assign', label: 'Assign', shortcut: 'A' });
  }

  if (input.showDispatchExtras) {
    if (!input.isShipped) {
      items.push({
        key: 'urgent',
        label: input.isUrgent ? 'Clear urgent' : 'Mark urgent',
        shortcut: 'U',
      });
    }
    items.push({ key: 'notes', label: 'Notes', shortcut: 'N' });
    items.push({ key: 'out_of_stock', label: 'Out of stock', shortcut: 'O' });
    items.push({ key: 'status', label: 'Mark shipped', shortcut: 'S' });
  }

  return items;
}

/**
 * Plate ⋮ overflow — station handoffs only. Order updates live on the Order
 * tab bottom bar.
 */
export function orderInspectorMoreItems(input: {
  handoffs?: readonly OrderInspectorRecordCta[];
}): ReadonlyArray<OrderInspectorMoreItem> {
  const items: OrderInspectorMoreItem[] = [];

  for (const cta of input.handoffs ?? []) {
    if (cta === 'assign') continue;
    if (cta === 'open_testing') {
      items.push({ key: 'open_testing', label: 'Open in Testing', shortcut: 'T' });
    } else if (cta === 'open_pack') {
      items.push({ key: 'open_pack', label: 'Open in Pack', shortcut: 'P' });
    } else if (cta === 'open_labels') {
      items.push({ key: 'open_labels', label: 'Open in Labels', shortcut: 'L' });
    }
  }

  return items;
}
