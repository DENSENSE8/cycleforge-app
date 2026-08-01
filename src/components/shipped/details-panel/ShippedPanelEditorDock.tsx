'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ShippedOrder } from '@/lib/neon/orders-queries';
import { framerPresence, framerTransition } from '@/design-system/foundations/motion-framer';
import { MarkAsShippedForm } from '@/components/shipped/stacks/MarkAsShippedForm';
import { OrderNotesTrail } from '@/components/shipped/details-panel/OrderNotesTrail';
import { ShippedOutOfStockComposer } from '@/components/shipped/details-panel/ShippedOutOfStockComposer';
import type { ShippedActiveInput } from '@/components/shipped/stacks/types';
import { getActiveStaff, type StaffMember } from '@/lib/staffCache';
import { getStaffColorHex } from '@/utils/staff-colors';
import { PACKER_IDS } from '@/utils/staff';
import type { StaffRecipient } from '@/components/quick-access/StaffRecipientList';

export interface ShippedPanelEditorDockProps {
  shipped: ShippedOrder;
  activeInput: ShippedActiveInput;
  setActiveInput: React.Dispatch<React.SetStateAction<ShippedActiveInput>>;
  /** Which header actions are available in this panel context. */
  showMarkAsShipped?: boolean;
  showOutOfStock?: boolean;
  showNotes?: boolean;
  isOutOfStock: boolean;
  isSavingOutOfStock: boolean;
  /** Persist the out-of-stock flag (boolean). */
  onSaveOutOfStock: (checked: boolean) => void;
  shippingTrackingNumber: string;
  onMarkShippedSuccess: () => void;
}

/**
 * Fixed footer region for header-action editors (mark shipped, out-of-stock
 * flag toggle, notes). Queue rows show icons for the same flags.
 *
 * The Notes region used to be a `ShippedNotesComposer` bound to the legacy
 * scalar `orders.notes`. It now mounts {@link OrderNotesTrail}, the single
 * writable home for an order annotation — see that file's header for why the
 * scalar became read-only. Contexts that already mount the trail at the record
 * plane (the dashboard inspector, via `OrderTriageSection`) pass
 * `showNotes={false}` so one panel never carries two composers for one store.
 */
export function ShippedPanelEditorDock({
  shipped,
  activeInput,
  setActiveInput,
  showMarkAsShipped = false,
  showOutOfStock = false,
  showNotes = true,
  isOutOfStock,
  isSavingOutOfStock,
  onSaveOutOfStock,
  shippingTrackingNumber,
  onMarkShippedSuccess,
}: ShippedPanelEditorDockProps) {
  const [packerOptions, setPackerOptions] = useState<StaffRecipient[]>([]);

  const orderId = Number(shipped.id);
  // "Already carries annotations" now spans BOTH stores — the append-only trail
  // (`note_count`) and whatever legacy scalar the row still holds. Reading only
  // the scalar would have hidden the region on every order whose notes live in
  // `order_notes`, which is every note written since 2026-07-31.
  const legacyNote = String(shipped.notes || '').trim();
  const hasSavedNotes = legacyNote.length > 0 || Number(shipped.note_count ?? 0) > 0;
  const showOutOfStockRegion =
    showOutOfStock && (activeInput === 'out_of_stock' || isOutOfStock);
  const showNotesRegion =
    showNotes && Number.isFinite(orderId) && orderId > 0 && (activeInput === 'notes' || hasSavedNotes);
  const hasExpandedEditor = showMarkAsShipped && activeInput === 'mark_shipped';

  const hasDockContent = hasExpandedEditor || showOutOfStockRegion || showNotesRegion;

  useEffect(() => {
    if (!showMarkAsShipped || activeInput !== 'mark_shipped') return;
    let active = true;
    getActiveStaff()
      .then((data: StaffMember[]) => {
        if (!active) return;
        setPackerOptions(
          data
            .slice()
            .sort((a, b) => {
              const ai = PACKER_IDS.indexOf(a.id);
              const bi = PACKER_IDS.indexOf(b.id);
              return (ai === -1 ? Number.MAX_SAFE_INTEGER : ai) - (bi === -1 ? Number.MAX_SAFE_INTEGER : bi);
            })
            .map((member) => ({
              id: member.id,
              name: member.name,
              role: member.role,
              color_hex: getStaffColorHex({ id: member.id }),
            })),
        );
      })
      .catch((error) => console.error('Failed to load packer options:', error));
    return () => {
      active = false;
    };
  }, [activeInput, showMarkAsShipped]);

  if (!hasDockContent) return null;

  return (
    <div className="shrink-0 border-t border-border-soft bg-surface-card/95 backdrop-blur-md">
      <AnimatePresence initial={false}>
        {hasExpandedEditor ? (
          <motion.div
            key="mark-shipped"
            initial={framerPresence.collapseHeight.initial}
            animate={framerPresence.collapseHeight.animate}
            exit={framerPresence.collapseHeight.exit}
            transition={framerTransition.upNextCollapse}
            className="overflow-hidden"
          >
            <div className="px-8 pt-3 pb-1">
              <MarkAsShippedForm
                shippingTrackingNumber={shippingTrackingNumber || shipped.shipping_tracking_number || ''}
                packerOptions={packerOptions}
                onSuccess={onMarkShippedSuccess}
              />
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {showOutOfStockRegion ? (
        <ShippedOutOfStockComposer
          checked={isOutOfStock}
          isSaving={isSavingOutOfStock}
          onCheckedChange={(checked) => {
            onSaveOutOfStock(checked);
            if (!checked) setActiveInput('none');
          }}
        />
      ) : null}

      {showNotesRegion ? (
        <section className="mx-8 py-3">
          <OrderNotesTrail orderId={orderId} legacyNote={legacyNote} />
        </section>
      ) : null}
    </div>
  );
}
