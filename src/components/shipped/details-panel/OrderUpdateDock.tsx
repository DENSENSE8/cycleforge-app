'use client';

/**
 * Order-tab bottom update dock — labelled update CTAs + flush trailing Delete.
 *
 * Expands Assign / Notes / Out of stock / Mark shipped above the bar (same job
 * as the old More-menu toggles). Delete is icon-only, no padded surface.
 */

import { Trash2 } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { cornerClass } from '@/design-system/tokens/radius';
import { focusRing } from '@/design-system/tokens/focus-ring';
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

  return (
    <div
      className="shrink-0 border-t border-border-soft bg-surface-card/95 backdrop-blur-md"
      data-testid="order-update-dock"
    >
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

      {showBar ? (
        <div
          className={cn('flex items-stretch gap-0', FLUSH)}
          data-testid="order-update-actions"
        >
          <div className="flex min-w-0 flex-1 items-stretch divide-x divide-border-hairline overflow-x-auto no-scrollbar">
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
          </div>

          {showDelete ? (
            <HoverTooltip
              asChild
              label={
                isDeleting
                  ? 'Deleting…'
                  : isDeleteArmed
                    ? 'Click again to confirm delete'
                    : 'Delete order'
              }
            >
              <button
                type="button"
                onClick={onDelete}
                disabled={isDeleting}
                aria-label={
                  isDeleteArmed ? 'Confirm delete order' : 'Delete order'
                }
                data-testid="order-update-delete"
                className={cn(
                  FLUSH,
                  focusRing('control', 'danger'),
                  'flex h-10 w-10 shrink-0 items-center justify-center border-l border-border-hairline bg-transparent p-0',
                  isDeleteArmed
                    ? 'text-red-700 hover:text-red-800'
                    : 'text-red-600 hover:text-red-700',
                  'disabled:opacity-40',
                )}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </HoverTooltip>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
