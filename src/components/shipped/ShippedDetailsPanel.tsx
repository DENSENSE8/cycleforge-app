'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { ShippedOrder } from '@/lib/neon/orders-queries';
import { dispatchNavigateShippedDetails } from '@/utils/events';
import { useRecordCursor } from '@/lib/record-cursor/useRecordCursor';
import { DetailStackRailRegistrar } from '@/components/right-rail/DetailStackRailRegistrar';
import { DeskRailChromeRow } from '@/components/right-rail/DeskRailChromeRow';
import {
  DESK_INSPECTOR_INDEX,
  DeskInspectorIndexShell,
} from '@/components/right-rail/DeskInspectorIndexShell';
import { CursorPositionReadout } from '@/components/ui/pane-header';
import { MoreHorizontal } from '@/components/Icons';
import { IconButton } from '@/design-system/primitives';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/design-system/primitives/DropdownMenu';
import type {
  DetailsStackDurationData,
  ShippedActiveInput,
} from './stacks/types';
import { deriveShippedHeaderMeta } from './details-panel/shipped-details-logic';
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
import {
  consumeReplaceTrackingIntent,
  subscribeReplaceTrackingIntent,
} from '@/lib/order-inspector/replace-tracking-intent';

export type { ShippedActiveInput };

interface ShippedDetailsPanelProps {
  shipped: ShippedOrder;
  onClose: () => void;
  onUpdate: () => void;
  /** Inspector capability lane — not a body layout switch. */
  context?: 'dashboard' | 'queue' | 'fulfillment' | 'labels' | 'staged' | 'shipped' | 'station' | 'packer';
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
  const showDashboardExtras = inspectorContext.showDispatchExtras;
  const meta = deriveShippedHeaderMeta(initialShipped);
  const showAssign =
    showDashboardExtras &&
    meta.canEditAssignment &&
    inspectorContext.recordCtas.includes('assign');

  const [durationData] = useState<DetailsStackDurationData>({});

  const {
    shipped,
    setShipped,
    orderNumber,
    setOrderNumber,
    itemNumber,
    setItemNumber,
    shippingTrackingNumber,
    setShippingTrackingNumber,
    isOutOfStock,
    shipByDate,
    setShipByDate,
    isSavingInlineFields,
    isSavingOutOfStock,
    isSavingShipByDate,
    saveInlineFields,
    saveShipByDate,
    handleSaveOutOfStock,
  } = useShippedDetailState(initialShipped, onUpdate);

  const liveMeta = deriveShippedHeaderMeta(shipped);

  const {
    setDisplayTopic,
    orderChild,
    setActiveSection,
    activeInput,
    setActiveInput,
  } = useShippedPanelViewState({
    initialShipped,
    defaultSection: inspectorContext.defaultTab,
    showDocumentsTab,
  });

  /** Index | leaf nav — opens on the contextual default leaf; Back → topics. */
  const [navId, setNavId] = useState<string>(() => {
    const seed = resolveOrderInspectorTopicState(inspectorContext.defaultTab);
    return resolveOrderInspectorDisplayTopic(seed.topic, { showDocumentsTab });
  });
  useEffect(() => {
    const seed = resolveOrderInspectorTopicState(inspectorContext.defaultTab);
    setNavId(
      resolveOrderInspectorDisplayTopic(seed.topic, { showDocumentsTab }),
    );
  }, [initialShipped.id, inspectorContext.defaultTab, showDocumentsTab]);

  const [replaceTrackingNonce, setReplaceTrackingNonce] = useState(0);
  useEffect(() => {
    const applyIntent = () => {
      const orderId = Number(initialShipped.id);
      if (!consumeReplaceTrackingIntent(orderId)) return;
      setActiveSection('shipping');
      setNavId('order');
      setReplaceTrackingNonce((n) => n + 1);
    };
    applyIntent();
    return subscribeReplaceTrackingIntent(applyIntent);
  }, [initialShipped.id, setActiveSection]);

  const { isDeleteArmed, isDeleting, handleDelete } = useShippedDeletion(shipped, onUpdate);
  const assignOrder = useOrderAssignment();
  const isUrgent = Boolean((shipped as { is_urgent?: unknown }).is_urgent);

  const updateActions = useMemo(
    () =>
      orderInspectorOrderUpdateActions({
        showDispatchExtras: showDashboardExtras,
        showAssign,
        isUrgent,
      }),
    [showDashboardExtras, showAssign, isUrgent],
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

  const cursor = useRecordCursor('record');

  const handleMoveUp = useCallback(() => {
    if (cursor.available) {
      cursor.onPrev?.();
      return;
    }
    dispatchNavigateShippedDetails('up');
  }, [cursor]);

  const handleMoveDown = useCallback(() => {
    if (cursor.available) {
      cursor.onNext?.();
      return;
    }
    dispatchNavigateShippedDetails('down');
  }, [cursor]);

  const cursorPosition = cursor.available ? cursor.position : null;
  const cursorTotal = cursor.available ? cursor.total : undefined;
  const cursorPrevDisabled = cursor.available ? cursor.prevDisabled : undefined;
  const cursorNextDisabled = cursor.available ? cursor.nextDisabled : undefined;

  const stackActionBar = {
    onClose,
    onMoveUp: handleMoveUp,
    onMoveDown: handleMoveDown,
    onAssign: showAssign
      ? () => {
          setDisplayTopic('order');
          setNavId('order');
          setActiveInput('assign');
        }
      : undefined,
  };

  const renderTopicBody = (topic: OrderInspectorDisplayTopic): ReactNode => {
    const activeSection =
      topic === 'order' ? undefined : orderInspectorActiveSection(topic, orderChild);

    return (
      <ShippedDetailsBody
        context={context}
        inspectorContext={inspectorContext}
        showQuickLinks
        activeSection={activeSection}
        displayTopic={topic}
        shipped={shipped}
        durationData={durationData}
        onUpdate={onUpdate}
        activeInput={activeInput}
        setActiveInput={setActiveInput}
        stackActionBar={stackActionBar}
        editableFields={{
          orderNumber,
          itemNumber,
          trackingNumber: shippingTrackingNumber,
          shipByDate,
          isSavingInlineFields,
          isSavingShipByDate,
          setOrderNumber,
          setItemNumber,
          setTrackingNumber: setShippingTrackingNumber,
          setShipByDate,
          onSaveInline: saveInlineFields,
          onSaveShipByDate: saveShipByDate,
        }}
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
        replaceTrackingNonce={replaceTrackingNonce}
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
            <DropdownMenuItem
              key={item.key}
              onSelect={() => runMoreItem(item.key)}
              className="justify-between gap-4"
            >
              <span>{item.label}</span>
              {item.shortcut ? (
                <kbd className="font-mono text-role-micro text-text-faint">{item.shortcut}</kbd>
              ) : null}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    ) : null;

  return (
    <DetailStackRailRegistrar
      id="detail:order"
      onClose={onClose}
      modal={false}
      edgeCollapse
      collapsedStrip={false}
      ariaLabel={`Order ${liveMeta.orderIdDisplay} details`}
    >
      <div
        className="flex h-full min-h-0 flex-col overflow-hidden"
        data-testid="order-inspector-panel"
        data-order-inspector=""
      >
        <div className="shrink-0 border-b border-border-hairline bg-surface-card/90 backdrop-blur-xl">
          <DeskRailChromeRow
            onClose={onClose}
            closeTitle="Hide right panel"
            cursor={<CursorPositionReadout position={cursorPosition} total={cursorTotal} />}
          />
        </div>

        <DeskInspectorIndexShell
          leaves={leaves}
          activeId={navId}
          onActiveIdChange={onNavChange}
          indexRightSlot={moreSlot}
          ariaLabel="Order topics"
          testId="order-inspector-index"
          backLabel="Back to topics"
        />
      </div>
    </DetailStackRailRegistrar>
  );
}
