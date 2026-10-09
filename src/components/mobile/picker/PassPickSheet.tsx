'use client';

/**
 * Pass pick — the pick walk's bottom-left verb (owner 2026-10-08): a bottom
 * sheet of the other pickers on the roster; choosing one hands this order's
 * PICK assignment to them (`POST /api/orders/assign { pickerId }`, the desk's
 * own writer). The walk moves on; the order stays on the pick list as "To pick · <their name>".
 */

import { useEffect, useMemo, useState } from 'react';
import { StaffAvatar } from '@/components/identity/StaffAvatar';
import { Sheet, SheetBody, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { AssigneeComboboxPanel } from '@/design-system/components/AssigneeCombobox';
import { useOrderAssignment } from '@/hooks/useOrderAssignment';
import { getActiveStaff, type StaffMember } from '@/lib/staffCache';

export function PassPickSheet({
  orderId,
  myStaffId,
  open,
  onOpenChange,
  onPassed,
}: {
  /** `orders.id` */
  orderId: number;
  myStaffId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPassed: (staffName: string) => void;
}) {
  const assign = useOrderAssignment();
  const [query, setQuery] = useState('');
  const [staff, setStaff] = useState<StaffMember[] | null>(null);

  useEffect(() => {
    if (!open || staff) return;
    let active = true;
    getActiveStaff()
      .then((rows) => active && setStaff([...rows].sort((a, b) => a.name.localeCompare(b.name))))
      .catch(() => active && setStaff([]));
    return () => {
      active = false;
    };
  }, [open, staff]);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (staff ?? [])
      .filter((m) => m.id !== myStaffId && (m.functionalRoles ?? []).includes('picker'))
      .filter((m) => !needle || m.name.toLowerCase().includes(needle))
      .map((m) => ({
        id: m.id,
        name: m.name,
        selected: false,
        leading: <StaffAvatar staffId={m.id} name={m.name} size="sm" colorRing alt="" />,
      }));
  }, [myStaffId, query, staff]);

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) setQuery('');
        onOpenChange(next);
      }}
    >
      <SheetContent side="bottom" aria-describedby={undefined} data-testid="pass-pick-sheet">
        <SheetHeader className="shrink-0 border-b border-mode-rule px-mode-page py-3 pr-12">
          <SheetTitle>Pass pick to</SheetTitle>
        </SheetHeader>
        <SheetBody>
          <AssigneeComboboxPanel
            query={query}
            onQueryChange={setQuery}
            rows={rows}
            loading={staff == null}
            emptyMessage={staff == null ? 'Loading pickers…' : query.trim() ? 'No matches' : 'No other pickers'}
            roster={false}
            disabled={assign.isPending}
            onSelect={(row) => {
              assign.mutate(
                { orderId, pickerId: row.id, pickerName: row.name, performedByStaffId: myStaffId },
                {
                  onSuccess: () => {
                    setQuery('');
                    onOpenChange(false);
                    onPassed(row.name);
                  },
                },
              );
            }}
          />
          {assign.error ? (
            <p role="alert" className="pt-2 text-role-caption text-text-danger">
              {assign.error.message}
            </p>
          ) : null}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
