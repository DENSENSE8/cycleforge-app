'use client';

/**
 * Pair item number — the pick screen's bottom-right door when the order's
 * line has no listing link (owner 2026-10-08): a bottom sheet to type the
 * marketplace item number on the spot. Saving writes `orders.item_number`
 * (`POST /api/orders/assign { itemNumber }`, the desk's own writer); the
 * listing link then resolves from it and the Listing button takes this one's
 * place. The Listing pill's pencil reopens the same sheet as Edit item number
 * to correct a wrongly typed one.
 */

import { useEffect, useState } from 'react';
import { Check, X } from '@/components/Icons';
import { Sheet, SheetBody, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { DetailDock } from '@/design-system/components/DetailDock';
import { TextField } from '@/design-system/primitives/TextField';
import { useOrderAssignment } from '@/hooks/useOrderAssignment';
import { getExternalUrlByItemNumber } from '@/utils/external-item-url';

export function PairItemNumberSheet({
  orderId,
  initial,
  myStaffId,
  open,
  onOpenChange,
  onPaired,
}: {
  /** `orders.id` */
  orderId: number;
  /** The line's current item number, if any — a wrong-platform or mistyped one being corrected. */
  initial: string | null;
  myStaffId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPaired: (itemNumber: string) => void;
}) {
  const assign = useOrderAssignment();
  const [value, setValue] = useState(initial ?? '');
  useEffect(() => {
    if (open) setValue(initial ?? '');
  }, [open, initial]);

  const itemNumber = value.trim();
  const listingUrl = getExternalUrlByItemNumber(itemNumber);
  const editing = Boolean(initial?.trim());
  const unchanged = itemNumber === (initial ?? '').trim();
  const save = () => {
    if (!itemNumber || unchanged || assign.isPending) return;
    assign.mutate(
      { orderId, itemNumber, performedByStaffId: myStaffId },
      {
        onSuccess: () => {
          onOpenChange(false);
          onPaired(itemNumber);
        },
      },
    );
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        aria-describedby={undefined}
        data-testid="pair-item-number-sheet"
        // Open flush on the screen floor: no keyboard rising mid-slide (iOS scrolls the layout to the
        // field and leaves the sheet lifted over a gap). The field takes a tap to type.
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          (event.currentTarget as HTMLElement).focus({ preventScroll: true });
        }}
      >
        <SheetHeader className="shrink-0 border-b border-mode-rule px-mode-page py-3 pr-12">
          <SheetTitle>{editing ? 'Edit item number' : 'Pair item number'}</SheetTitle>
        </SheetHeader>
        <SheetBody>
          <form
            className="flex flex-col gap-2 px-mode-page py-3"
            onSubmit={(event) => {
              event.preventDefault();
              save();
            }}
          >
            <TextField label="Item number" value={value} onChange={setValue} mono />
            <p className="text-role-caption text-text-muted">
              {itemNumber
                ? listingUrl
                  ? `Opens ${listingUrl}`
                  : 'No listing link for this item number'
                : 'eBay item number or Amazon ASIN'}
            </p>
            {assign.error ? (
              <p role="alert" className="text-role-caption text-text-danger">
                {assign.error.message}
              </p>
            ) : null}
          </form>
        </SheetBody>
        <DetailDock<'cancel' | 'save'>
          label="Item number actions"
          placement="sheet"
          verbs={[
            { id: 'cancel', label: 'Cancel', icon: <X />, disabled: assign.isPending },
            { id: 'save', label: 'Save', icon: <Check />, primary: true, disabled: !itemNumber || unchanged, loading: assign.isPending },
          ]}
          onVerb={(verb) => (verb === 'cancel' ? onOpenChange(false) : save())}
        />
      </SheetContent>
    </Sheet>
  );
}
