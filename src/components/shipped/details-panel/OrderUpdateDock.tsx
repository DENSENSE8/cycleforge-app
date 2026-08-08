'use client';

/**
 * Order-tab bottom update dock — labelled update CTAs + flush trailing Delete.
 *
 * Expands Assign / Notes / Out of stock / Mark shipped above the bar (same job
 * as the old More-menu toggles). Composes Workbench `InspectorActionFloor`
 * (Macro `FlushTerminalFooter` shell) + `InspectorFlushDelete`.
 */

import { Button } from '@/design-system/primitives';
import { cornerClass } from '@/design-system/tokens/radius';
import { InspectorActionFloor } from '@/components/right-rail/InspectorActionFloor';
import { InspectorFlushDelete } from '@/components/right-rail/InspectorFlushDelete';
import { OrderAssignDisplayHost } from '@/components/shipped/details-panel/OrderAssignDisplayHost';
import { ShippedPanelEditorDock } from '@/components/shipped/details-panel/ShippedPanelEditorDock';
import type { ShippedActiveInput } from '@/components/shipped/stacks/types';
import type { ShippedOrder } from '@/lib/neon/orders-queries';
import type { OrderInspectorUpdateActionKey } from '@/lib/shipping/order-inspector-topics';
import { cn } from '@/utils/_cn';

const FLUSH = cornerClass('flush');

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
    <InspectorActionFloor
      data-testid="order-update-dock"
      above={above}
      actions={
        actions.length > 0 ? (
          <>
            {actions.map((action) => (
              <Button
                key={action.key}
                type="button"
                size="sm"
                variant={isActive(action.key) ? 'secondary' : 'ghost'}
                onClick={() => onAction(action.key)}
                className={cn(
                  FLUSH,
                  'h-10 min-w-0 flex-1 rounded-none px-2 text-role-micro font-semibold tracking-wide',
                )}
                data-testid={`order-update-${action.key}`}
              >
                <span className="truncate">{action.label}</span>
              </Button>
            ))}
          </>
        ) : undefined
      }
      delete={
        showDelete ? (
          <InspectorFlushDelete
            isArmed={isDeleteArmed}
            isDeleting={isDeleting}
            onClick={onDelete}
            label="Delete order"
            confirmLabel="Click again to confirm delete"
            data-testid="order-update-delete"
          />
        ) : undefined
      }
    />
  );
}
