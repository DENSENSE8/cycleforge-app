'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { ShippedOrder } from '@/lib/neon/orders-queries';
import { DetailStackRailRegistrar } from '@/components/right-rail/DetailStackRailRegistrar';
import {
  DESK_INSPECTOR_INDEX,
  DeskInspectorIndexShell,
} from '@/components/right-rail/DeskInspectorIndexShell';
import { MoreHorizontal } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { IconButton } from '@/design-system/primitives';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/design-system/primitives/DropdownMenu';
import type { ShippedActiveInput } from './stacks/types';
import { deriveShippedHeaderMeta, isOrderShipped } from './details-panel/shipped-details-logic';
import { useOrderAssignment } from '@/hooks/useOrderAssignment';
import { toast } from '@/lib/toast';
import {
  useShippedDeletion,
  useShippedDetailState,
  useShippedPanelViewState,
} from './details-panel/shipped-details-hooks';
import { ShippedDetailsBody } from './details-panel/ShippedDetailsBody';
import { buildOrderInspectorLeaves } from './details-panel/build-order-inspector-displays';
import { resolveOrderInspectorContext } from '@/lib/selection-context/order-inspector-context';
import { testingHandoffHref } from '@/lib/selection-context/station-handoff';
import {
  orderInspectorActiveSection,
  orderInspectorMoreItems,
  orderInspectorOrderUpdateActions,
  resolveOrderInspectorDisplayTopic,
  resolveOrderInspectorTopicState,
  type OrderInspectorDisplayTopic,
  type OrderInspectorUpdateActionKey,
} from '@/lib/shipping/order-inspector-topics';

export type { ShippedActiveInput };

interface ShippedDetailsPanelProps {
  shipped: ShippedOrder;
  onClose: () => void;
  onUpdate: () => void;
  /** Inspector capability lane — not a body layout switch. */
  context?: 'dashboard' | 'queue' | 'fulfillment' | 'labels' | 'staged' | 'shipped' | 'station' | 'packer' | 'packed';
}

export function ShippedDetailsPanel({
  shipped: initialShipped,
  onClose,
  onUpdate,
  context = 'shipped',
}: ShippedDetailsPanelProps) {
  const router = useRouter();
  /**
   * Unbox grammar twin: chrome → index→leaf → flush body.
   * Order updates live on the Order leaf bottom bar; index ⋮ = station handoffs.
   */
  const inspectorContext = resolveOrderInspectorContext({ panelContext: context });
  const showDocumentsTab = inspectorContext.showDocumentsTab;
  const openOnIndex = inspectorContext.openOnIndex;
  const defaultTab = inspectorContext.defaultTab;
  const showDashboardExtras = inspectorContext.showDispatchExtras;
  const meta = deriveShippedHeaderMeta(initialShipped);
  const showAssign =
    showDashboardExtras &&
    meta.canEditAssignment &&
    inspectorContext.recordCtas.includes('assign');

  const {
    shipped,
    setShipped,
    isOutOfStock,
    isSavingOutOfStock,
    handleSaveOutOfStock,
  } = useShippedDetailState(initialShipped, onUpdate);

  const liveMeta = deriveShippedHeaderMeta(shipped);

  const {
    setDisplayTopic,
    orderChild,
    activeInput,
    setActiveInput,
  } = useShippedPanelViewState({
    initialShipped,
    defaultSection: defaultTab,
    showDocumentsTab,
  });

  /** Index | leaf nav — Packed opens on the Root Index; others seed a leaf. */
  const [navId, setNavId] = useState<string>(() => {
    if (openOnIndex) return DESK_INSPECTOR_INDEX;
    const seed = resolveOrderInspectorTopicState(defaultTab);
    return resolveOrderInspectorDisplayTopic(seed.topic, { showDocumentsTab });
  });
  useEffect(() => {
    if (openOnIndex) {
      setNavId(DESK_INSPECTOR_INDEX);
      return;
    }
    const seed = resolveOrderInspectorTopicState(defaultTab);
    setNavId(resolveOrderInspectorDisplayTopic(seed.topic, { showDocumentsTab }));
  }, [initialShipped.id, defaultTab, openOnIndex, showDocumentsTab]);

  const { isDeleteArmed, isDeleting, handleDelete } = useShippedDeletion(shipped, onUpdate);
  const assignOrder = useOrderAssignment();
  const isUrgent = Boolean(shipped.is_urgent);
  const isShipped = isOrderShipped(shipped);

  const updateActions = useMemo(
    () =>
      orderInspectorOrderUpdateActions({
        showDispatchExtras: showDashboardExtras,
        showAssign,
        isUrgent,
        isShipped,
      }),
    [showDashboardExtras, showAssign, isUrgent, isShipped],
  );

  const moreItems = useMemo(
    () =>
      orderInspectorMoreItems({
        handoffs: inspectorContext.recordCtas,
      }),
    [inspectorContext.recordCtas],
  );

  const runUrgent = useCallback(() => {
    const id = Number(shipped.id);
    if (!Number.isFinite(id)) return;
    const next = !isUrgent;
    assignOrder.mutate(
      { orderId: id, isUrgent: next },
      {
        onSuccess: () => {
          setShipped((prev) => ({ ...prev, is_urgent: next }));
          toast.success(next ? 'Marked urgent' : 'Urgent cleared');
        },
        onError: (err) =>
          toast.error(err instanceof Error ? err.message : 'Failed to update urgent'),
      },
    );
  }, [assignOrder, isUrgent, setShipped, shipped.id]);

  const toggleInput = useCallback(
    (input: Exclude<ShippedActiveInput, 'none'>) => {
      setActiveInput((prev) => (prev === input ? 'none' : input));
    },
    [setActiveInput],
  );

  const onUpdateAction = useCallback(
    (key: OrderInspectorUpdateActionKey) => {
      switch (key) {
        case 'assign':
          toggleInput('assign');
          break;
        case 'urgent':
          runUrgent();
          break;
        case 'notes':
          toggleInput('notes');
          break;
        case 'out_of_stock':
          toggleInput('out_of_stock');
          break;
        case 'status':
          toggleInput('mark_shipped');
          break;
        default:
          break;
      }
    },
    [runUrgent, toggleInput],
  );

  const runMoreItem = useCallback(
    (key: string) => {
      switch (key) {
        case 'open_testing': {
          const href = testingHandoffHref(shipped.order_id);
          if (href) router.push(href);
          break;
        }
        case 'open_pack':
          router.push('/ops/pack');
          break;
        case 'open_labels':
          router.push('/ops/labels');
          break;
        default:
          break;
      }
    },
    [router, shipped.order_id],
  );

  const renderTopicBody = (topic: OrderInspectorDisplayTopic): ReactNode => {
    const activeSection =
      topic === 'order' ? undefined : orderInspectorActiveSection(topic, orderChild);

    return (
      <ShippedDetailsBody
        context={context}
        inspectorContext={inspectorContext}
        activeSection={activeSection}
        displayTopic={topic}
        shipped={shipped}
        onUpdate={onUpdate}
        activeInput={activeInput}
        setActiveInput={setActiveInput}
        isOutOfStock={isOutOfStock}
        isSavingOutOfStock={isSavingOutOfStock}
        onSaveOutOfStock={(checked) => {
          void handleSaveOutOfStock(checked, () => setActiveInput('none'));
        }}
        onMarkShippedSuccess={() => {
          setActiveInput('none');
          onUpdate();
        }}
        isDeleteArmed={isDeleteArmed}
        isDeletingOrder={isDeleting}
        onDeleteOrder={handleDelete}
        updateActions={updateActions}
        onUpdateAction={onUpdateAction}
      />
    );
  };

  const leaves = buildOrderInspectorLeaves({
    showDocumentsTab,
    contents: {
      order: renderTopicBody('order'),
      documents: renderTopicBody('documents'),
      timeline: renderTopicBody('timeline'),
      conversation: renderTopicBody('conversation'),
    },
  });

  const onNavChange = useCallback(
    (id: string) => {
      setNavId(id);
      if (id !== DESK_INSPECTOR_INDEX) {
        setDisplayTopic(id as OrderInspectorDisplayTopic);
      }
    },
    [setDisplayTopic],
  );

  const moreSlot =
    moreItems.length > 0 ? (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <IconButton
            size="xs"
            tone="neutral"
            ariaLabel="More actions"
            icon={<MoreHorizontal className="h-4 w-4" />}
            data-testid="order-inspector-more"
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {moreItems.map((item) => (
            <HoverTooltip
              key={item.key}
              asChild
              label={item.label}
              shortcut={item.shortcut}
              disabled={!item.shortcut}
            >
              <DropdownMenuItem onSelect={() => runMoreItem(item.key)}>{item.label}</DropdownMenuItem>
            </HoverTooltip>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    ) : null;

  const panelBody = (
    <div
      className="flex h-full min-h-0 flex-col overflow-hidden"
      data-testid="order-inspector-panel"
      data-order-inspector=""
    >
      <DeskInspectorIndexShell
        stance="index"
        leaves={leaves}
        activeId={navId}
        onActiveIdChange={onNavChange}
        indexRightSlot={moreSlot}
        ariaLabel="Order topics"
        testId="order-inspector-index"
        backLabel="Back to topics"
      />
    </div>
  );

  return (
    <DetailStackRailRegistrar
      id="detail:order"
      onClose={onClose}
      modal={false}
      edgeCollapse
      collapsedStrip={false}
      ariaLabel={`Order ${liveMeta.orderIdDisplay} details`}
    >
      {panelBody}
    </DetailStackRailRegistrar>
  );
}
