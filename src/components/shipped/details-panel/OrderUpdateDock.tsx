'use client';

/**
 * Order-tab bottom update dock — labelled update CTAs + flush trailing Delete.
 *
 * Expands Assign / Notes / Out of stock / Mark shipped above the bar (same job
 * as the old More-menu toggles). Composes Workbench `InspectorActionFloor`
 * (Macro `FlushTerminalFooter` shell) + `InspectorFlushDelete`.
 */

import {
  AlertTriangle,
  FileText,
  Flag,
  Truck,
  User,
} from '@/components/Icons';
import {
  FLOOR_DELETE_PEER_CLASS,
  FloorIconButton,
  InspectorActionFloor,
} from '@/components/right-rail/InspectorActionFloor';
import { InspectorFlushDelete } from '@/components/right-rail/InspectorFlushDelete';
import { OrderAssignDisplayHost } from '@/components/shipped/details-panel/OrderAssignDisplayHost';
import { ShippedPanelEditorDock } from '@/components/shipped/details-panel/ShippedPanelEditorDock';
import type { ShippedActiveInput } from '@/components/shipped/stacks/types';
import type { ShippedOrder } from '@/lib/neon/orders-queries';
import type { OrderInspectorUpdateActionKey } from '@/lib/shipping/order-inspector-topics';

/** One glyph per order-update verb — the messy labelled grid condensed to icons. */
const ACTION_ICON: Record<OrderInspectorUpdateActionKey, React.ReactNode> = {
  assign: <User />,
  urgent: <Flag />,
  notes: <FileText />,
  out_of_stock: <AlertTriangle />,
  status: <Truck />,
};

export function OrderUpdateDock({
  shipped,
  actions,
  activeInput,
  setActiveInput,
  onAction,
  showEditorDock,
  isOutOfStock,
  isSavingOutOfStock,
  onSaveOutOfStock,
  shippingTrackingNumber,
  onMarkShippedSuccess,
  onAssigned,
  showDelete,
  isDeleteArmed,
  isDeleting,
  onDelete,
}: {
  shipped: ShippedOrder;
  actions: ReadonlyArray<{ key: OrderInspectorUpdateActionKey; label: string }>;
  activeInput: ShippedActiveInput;
  setActiveInput: React.Dispatch<React.SetStateAction<ShippedActiveInput>>;
  onAction: (key: OrderInspectorUpdateActionKey) => void;
  showEditorDock: boolean;
  isOutOfStock: boolean;
  isSavingOutOfStock: boolean;
  onSaveOutOfStock: (checked: boolean) => void;
  shippingTrackingNumber: string;
  onMarkShippedSuccess: () => void;
  onAssigned: () => void;
  showDelete: boolean;
  isDeleteArmed: boolean;
  isDeleting: boolean;
  onDelete: () => void;
}) {
  const showBar = actions.length > 0 || showDelete;
  const editorInput: ShippedActiveInput =
    activeInput === 'assign' ? 'none' : activeInput;

  if (!showBar && activeInput === 'none') return null;

  const isActive = (key: OrderInspectorUpdateActionKey) => {
    if (key === 'assign') return activeInput === 'assign';
    if (key === 'notes') return activeInput === 'notes';
    if (key === 'out_of_stock') return activeInput === 'out_of_stock';
    if (key === 'status') return activeInput === 'mark_shipped';
    return false;
  };

  const above =
    activeInput === 'assign' || showEditorDock ? (
      <>
        {activeInput === 'assign' ? (
          <div className="border-b border-border-hairline">
            <OrderAssignDisplayHost shipped={shipped} onAssigned={onAssigned} />
          </div>
        ) : null}
        {showEditorDock ? (
          <ShippedPanelEditorDock
            shipped={shipped}
            activeInput={editorInput}
            setActiveInput={setActiveInput}
            showMarkAsShipped
            showOutOfStock
            showNotes
            embedded
            isOutOfStock={isOutOfStock}
            isSavingOutOfStock={isSavingOutOfStock}
            onSaveOutOfStock={onSaveOutOfStock}
            shippingTrackingNumber={shippingTrackingNumber}
            onMarkShippedSuccess={onMarkShippedSuccess}
          />
        ) : null}
      </>
    ) : undefined;

  return (
    <InspectorActionFloor data-testid="order-update-dock" above={above}>
      {actions.length > 0 || showDelete ? (
        <>
          {actions.map((action) => (
            <FloorIconButton
              key={action.key}
              icon={ACTION_ICON[action.key]}
              label={action.label}
              onClick={() => onAction(action.key)}
              selected={isActive(action.key)}
              data-testid={`order-update-${action.key}`}
            />
          ))}
          {showDelete ? (
            <InspectorFlushDelete
              isArmed={isDeleteArmed}
              isDeleting={isDeleting}
              onClick={onDelete}
              label="Delete order"
              confirmLabel="Click again to confirm delete"
              data-testid="order-update-delete"
              className={FLOOR_DELETE_PEER_CLASS}
            />
          ) : null}
        </>
      ) : null}
    </InspectorActionFloor>
  );
}
