'use client';

/**
 * The Live feed's bulk bar — the selected packages' count, Clear, and the
 * verbs that act on all of them at once. The integrator owns the selection;
 * this bar owns only the verbs. Verbs paint through `RecordActionStrip`'s
 * `dock` face — ONE filled pill, `N selected · ⌘ Actions · ↖ · ×` (operator
 * 2026-10-06, Linear's selection bar; this supersedes "no fill behind bottom
 * verbs" for the selection dock). Each write rides an existing path (see
 * `bulk-actions.ts`); Remove from list rides `/api/orders/list-removal`.
 * Mount it inside the board's `relative` frame: it floats over the board's bottom edge.
 */

import { useMemo, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import type { PackageCard } from '@/lib/live-feed/types';
import { useOrderAssignment } from '@/hooks/useOrderAssignment';
import { postScanOut, undoScanOut } from '@/lib/outbound/scan-out-client';
import { SCAN_OUT_DESK_SOURCE } from '@/lib/outbound/scan-out-desk-stamp';
import { bustScanOutCaches } from '@/lib/outbound/outbound-cache-keys';
import { refreshDomain } from '@/lib/refresh/bus';
import { StageStaffAssignPopover } from '@/components/staff-assign/StageStaffAssignPopover';
import { markPacked } from '@/lib/outbound/mark-packed-client';
import {
  RecordActionStrip,
  type RecordActionVerb,
} from '@/design-system/components/record-action-strip/RecordActionStrip';
import { ACTION_DOCK_LIFT } from '@/design-system/tokens/dock-clearance';
import { Archive, FileText, PackageCheck, PackageOpen, Printer, ScanLine, Undo2, UserRound } from 'lucide-react';
import { ListRemovalPicker } from '@/components/orders/ListRemovalPicker';
import { listRemovalReasonLabel } from '@/lib/orders/list-removal';
import { removeFromList, restoreToList } from '@/lib/orders/list-removal-client';
import { cn } from '@/utils/_cn';
import type { DocTab } from './docs-triage/doc-tabs';
import { PrintPacketsDialog } from './PrintPacketsDialog';
import {
  describeScanOut,
  planScanOut,
  removableOrderRowIds,
  selectedOrderRowIds,
  selectionInStage,
} from './bulk-actions';

const BUSY_REASON = 'Working on the last action…';

export function LiveFeedBulkBar({
  cards,
  surface,
  onClear,
  onDone,
  onOpen,
}: {
  cards: readonly PackageCard[];
  surface: 'desk' | 'phone';
  onClear: () => void;
  onDone: () => void;
  /** Open a package in the detail rail (the dock's pointer opens the first selected). */
  onOpen?: (card: PackageCard) => void;
}): ReactNode {
  const barRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const [assignOpen, setAssignOpen] = useState(false);
  const [packOpen, setPackOpen] = useState(false);
  const [printFocus, setPrintFocus] = useState<DocTab | null>(null);
  const [scanningOut, setScanningOut] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [packing, setPacking] = useState(false);
  const [undoing, setUndoing] = useState(false);
  // Error toasts and cache rollback belong to the mutation (useOptimisticMutation).
  const assignment = useOrderAssignment();
  const assigning = assignment.isPending;
  const busy = assigning || scanningOut || removing || packing || undoing;

  const orderRowIds = useMemo(() => selectedOrderRowIds(cards), [cards]);
  const assignable = useMemo(() => selectionInStage(cards, 'to_pick'), [cards]);
  const packable = useMemo(() => selectionInStage(cards, 'picked'), [cards]);
  const scanOutable = useMemo(() => selectionInStage(cards, 'packed'), [cards]);
  const undoable = useMemo(() => selectionInStage(cards, 'scanned_out'), [cards]);
  const removable = useMemo(() => removableOrderRowIds(cards), [cards]);

  const verbs = useMemo<RecordActionVerb[]>(() => {
    // The dock's own writer, once per box, as the signed-in staffer, now.
    const scanOut = async () => {
      const plan = planScanOut(cards);
      setScanningOut(true);
      try {
        const results = await Promise.all(
          plan.labels.map((label) => postScanOut(label, { source: SCAN_OUT_DESK_SOURCE }).catch(() => null)),
        );
        const verdict = describeScanOut(results, plan.unlabeled);
        if (!verdict.ok) {
          toast.error(verdict.message);
          return;
        }
        toast.success(verdict.message);
        bustScanOutCaches(queryClient);
        refreshDomain('orders.outbound');
        onDone();
      } finally {
        setScanningOut(false);
      }
    };

    // Both open the centered print popover over the selected orders' Labels & docs packets.
    const noOrders = orderRowIds.length === 0;
    const printVerbs: RecordActionVerb[] = [
      {
        id: 'print-labels',
        label: 'Print labels…',
        icon: <Printer className="h-4 w-4" />,
        disabled: busy || noOrders,
        disabledReason: busy ? BUSY_REASON : 'Only order cards have labels',
        run: () => setPrintFocus('label'),
      },
      {
        id: 'print-documents',
        label: 'Print documents…',
        icon: <FileText className="h-4 w-4" />,
        disabled: busy || noOrders,
        disabledReason: busy ? BUSY_REASON : 'Only order cards have documents',
        run: () => setPrintFocus('slip'),
      },
    ];
    // Off the To-ship list with a reason — Undo puts them back (`order_list_removals`).
    const remove: RecordActionVerb = {
      id: 'remove-from-list',
      label: removing ? 'Removing…' : 'Remove from list…',
      icon: <Archive className="h-4 w-4" />,
      tone: 'danger',
      disabled: busy || removable.length === 0,
      disabledReason: busy ? BUSY_REASON : 'Only orders still in the building can leave the list',
      display: (done) => (
        <ListRemovalPicker
          count={removable.length}
          busy={removing}
          onCancel={done}
          onConfirm={async (reason, note) => {
            setRemoving(true);
            try {
              const removedIds = await removeFromList(removable, reason, note);
              done();
              refreshDomain('orders.outbound');
              onDone();
              toast.undo(`Removed ${removedIds.length} from the list · ${listRemovalReasonLabel(reason)}`, {
                onUndo: () => {
                  void restoreToList(removedIds)
                    .then((restored) => {
                      toast.success(`Put ${restored.length} back on the list`);
                      refreshDomain('orders.outbound');
                      onDone();
                    })
                    .catch((error: unknown) => toast.error(error instanceof Error ? error.message : 'Could not put them back'));
                },
              });
            } catch (error: unknown) {
              toast.error(error instanceof Error ? error.message : 'Could not remove from the list');
            } finally {
              setRemoving(false);
            }
          }}
        />
      ),
    };
    const out: RecordActionVerb[] = [remove];
    if (assignable) {
      out.push({
        id: 'assign-picker',
        label: assigning ? 'Assigning…' : 'Assign picker',
        icon: <UserRound className="h-4 w-4" />,
        disabled: busy,
        disabledReason: BUSY_REASON,
        run: () => setAssignOpen(true),
      });
    }
    if (undoable) {
      // Scanned out lane: bring a box back — the dock's undo writer, once per
      // box. A scan that never resolved to a package has nothing to undo.
      out.push({
        id: 'undo-scan-out',
        label: undoing ? 'Undoing…' : 'Undo scan out',
        icon: <Undo2 className="h-4 w-4" />,
        disabled: busy || cards.every((card) => card.shipmentId == null),
        disabledReason: busy ? BUSY_REASON : 'Only a scan that resolved to a box can be undone',
        run: async () => {
          const shipmentIds = [...new Set(cards.map((card) => card.shipmentId).filter((id): id is number => id != null))];
          setUndoing(true);
          try {
            const results = await Promise.all(shipmentIds.map((id) => undoScanOut(id).then(() => true).catch(() => false)));
            const undone = results.filter(Boolean).length;
            if (undone === 0) {
              toast.error('Could not undo the scan out');
              return;
            }
            toast.success(
              `Put ${undone} box${undone === 1 ? '' : 'es'} back in the building${undone < shipmentIds.length ? ` · ${shipmentIds.length - undone} refused` : ''}`,
            );
            bustScanOutCaches(queryClient);
            refreshDomain('orders.outbound');
            onDone();
          } finally {
            setUndoing(false);
          }
        },
      });
    }
    if (packable) {
      // Picked aisle: say who packed it — the same PACK_COMPLETED a pack-station
      // scan leaves (`markPacked`), destructive Remove from list stays last.
      out.push({
        id: 'mark-as-packed',
        label: packing ? 'Marking…' : 'Mark as packed…',
        icon: <PackageCheck className="h-4 w-4" />,
        disabled: busy || orderRowIds.length === 0,
        disabledReason: busy ? BUSY_REASON : 'Only picked packages can be marked packed',
        run: () => setPackOpen(true),
      });
    }
    if (scanOutable) {
      out.push({
        id: 'scan-out',
        label: scanningOut ? 'Scanning out…' : 'Scan out',
        icon: <ScanLine className="h-4 w-4" />,
        disabled: busy,
        disabledReason: BUSY_REASON,
        run: scanOut,
      });
    }
    // Destructive last (RecordActionStrip law): prints, the stage verbs, then Remove from list.
    return [...printVerbs, ...out.filter((verb) => verb !== remove), remove];
  }, [assignable, assigning, busy, cards, onDone, orderRowIds, packable, packing, queryClient, removable, removing, scanOutable, scanningOut, undoable, undoing]);

  if (cards.length === 0) return null;

  const commitPicker = (staffId: number | null, staffName: string | null) => {
    // The popover offers no current picker, so a pick is always a staffer.
    if (staffId == null) return;
    const orderIds = orderRowIds;
    assignment.mutate(
      { orderIds, pickerId: staffId, pickerName: staffName },
      {
        onSuccess: () => {
          toast.success(
            `${staffName ?? 'Picker'} assigned to pick ${orderIds.length} order${orderIds.length === 1 ? '' : 's'}`,
          );
          onDone();
        },
      },
    );
  };

  const commitPacked = (staffId: number | null, staffName: string | null) => {
    // The popover offers no current packer, so a pick is always a staffer.
    if (staffId == null) return;
    const orderIds = orderRowIds;
    setPacking(true);
    markPacked(orderIds, staffId)
      .then((result) => {
        const skipped =
          result.skipped.length > 0 ? ` · ${result.skipped.length} skipped (no shipment)` : '';
        toast.success(`Marked ${result.markedIds.length} packed as ${staffName ?? 'staffer'}${skipped}`);
        refreshDomain('orders.outbound');
        onDone();
      })
      .catch((error: unknown) => {
        toast.error(error instanceof Error ? error.message : 'Could not mark as packed');
      })
      .finally(() => setPacking(false));
  };

  const phone = surface === 'phone';
  const count = cards.length;

  return (
    <div
      data-testid="live-feed-bulk-bar"
      data-surface={surface}
      className={cn(
        // Floats over the board's bottom edge (house law: no bar, no ground fill behind bottom verbs).
        'pointer-events-none absolute inset-x-0 bottom-0 z-sticky flex justify-center',
        ACTION_DOCK_LIFT,
        phone && 'px-3',
      )}
    >
      <div ref={barRef} role="region" aria-label={`${count} selected package${count === 1 ? '' : 's'}`} className="pointer-events-auto">
        <RecordActionStrip
          verbs={verbs}
          label={`${count} selected package${count === 1 ? '' : 's'} actions`}
          testId="live-feed-bulk-bar-actions"
          face="dock"
          dock={{
            count,
            onClear,
            quick: onOpen
              ? {
                  id: 'open',
                  label: count === 1 ? 'Open package' : 'Open the first selected package',
                  icon: <PackageOpen className="size-4" />,
                  run: () => onOpen(cards[0]!),
                }
              : undefined,
            quickText: onOpen ? 'Open' : undefined,
          }}
        />
      </div>
      <PrintPacketsDialog
        open={printFocus != null}
        onOpenChange={(next) => !next && setPrintFocus(null)}
        orderRowIds={orderRowIds}
        tab={printFocus ?? 'label'}
      />
      <StageStaffAssignPopover
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        anchorRef={barRef}
        label={`Assign picker to ${orderRowIds.length} order${orderRowIds.length === 1 ? '' : 's'}`}
        role="technician"
        selectedStaffId={null}
        onCommit={commitPicker}
      />
      <StageStaffAssignPopover
        open={packOpen}
        onClose={() => setPackOpen(false)}
        anchorRef={barRef}
        label={`Mark ${orderRowIds.length} order${orderRowIds.length === 1 ? '' : 's'} packed as`}
        role="packer"
        selectedStaffId={null}
        onCommit={commitPacked}
      />
    </div>
  );
}
