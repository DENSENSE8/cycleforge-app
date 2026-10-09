'use client';

/**
 * The Live feed's bulk bar — the selected packages' count, Clear, and the
 * verbs that act on all of them at once. The integrator owns the selection;
 * this bar owns only the verbs. Verbs paint through `RecordActionStrip`'s
 * `dock` face — ONE filled pill, `N selected · ⌘ Actions · ↖ · ×` (operator
 * 2026-10-06, Linear's selection bar; this supersedes "no fill behind bottom
 * verbs" for the selection dock). Each write rides an existing path (see
 * `bulk-actions.ts`); Flag rides `live_feed_flags`; Remove from list rides
 * `/api/orders/list-removal` for orders and `live_feed_dismissals` for the
 * cards no order owns — a selection holding both is refused (pick one kind).
 * Mount it inside the board's `relative` frame: it floats over the board's bottom edge.
 */

import { useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import type { PackageCard } from '@/lib/live-feed/types';
import { useOrderAssignment } from '@/hooks/useOrderAssignment';
import { postScanOut, undoScanOut } from '@/lib/outbound/scan-out-client';
import { SCAN_OUT_DESK_SOURCE } from '@/lib/outbound/scan-out-desk-stamp';
import { bustScanOutCaches } from '@/lib/outbound/outbound-cache-keys';
import { refreshDomain } from '@/lib/refresh/bus';
import { StaffAssignDialog } from '@/components/staff-assign/StaffAssignDialog';
import { markPacked } from '@/lib/outbound/mark-packed-client';
import {
  RecordActionStrip,
  type RecordActionVerb,
} from '@/design-system/components/record-action-strip/RecordActionStrip';
import { ACTION_DOCK_LIFT } from '@/design-system/tokens/dock-clearance';
import { Archive, FileText, Flag, PackageCheck, PackageOpen, Printer, ScanLine, Undo2, UserRound } from 'lucide-react';
import { cn } from '@/utils/_cn';
import type { DocTab } from './docs-triage/doc-tabs';
import { PrintPacketsDialog } from './PrintPacketsDialog';
import { FlagDialog, OrderRemovalDialog, UnlinkedRemovalDialog } from './card-verbs';
import {
  describeScanOut,
  MIXED_REMOVAL_REASON,
  planRemoval,
  planScanOut,
  selectedCardIds,
  selectedLinks,
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
  const queryClient = useQueryClient();
  const [printFocus, setPrintFocus] = useState<DocTab | null>(null);
  const [scanningOut, setScanningOut] = useState(false);
  const [packing, setPacking] = useState(false);
  const [undoing, setUndoing] = useState(false);
  // Error toasts and cache rollback belong to the mutation (useOptimisticMutation).
  const { mutateAsync: assignPicker, isPending: assigning } = useOrderAssignment();
  const busy = assigning || scanningOut || packing || undoing;

  const orderRowIds = useMemo(() => selectedOrderRowIds(cards), [cards]);
  const assignable = useMemo(() => selectionInStage(cards, 'to_pick'), [cards]);
  const packable = useMemo(() => selectionInStage(cards, 'picked'), [cards]);
  const scanOutable = useMemo(() => selectionInStage(cards, 'packed'), [cards]);
  const undoable = useMemo(() => selectionInStage(cards, 'scanned_out'), [cards]);
  const removal = useMemo(() => planRemoval(cards), [cards]);
  const cardIds = useMemo(() => selectedCardIds(cards), [cards]);
  const links = useMemo(() => selectedLinks(cards), [cards]);

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
    // Any card, any kind — the reasons offered fit every selected kind.
    const flag: RecordActionVerb = {
      id: 'flag',
      label: 'Flag…',
      icon: <Flag className="h-4 w-4" />,
      disabled: busy,
      disabledReason: BUSY_REASON,
      dialog: (done) => <FlagDialog cardIds={cardIds} links={links} done={done} onSettled={onDone} />,
    };
    // Off the list with a reason — Undo puts them back. Orders and the cards
    // no order owns ask different reasons, so one kind at a time. Every form
    // here is the strip's centered dialog; a landed write clears the checks
    // (`onDone`) only once its done face closes (`onSettled`).
    const remove: RecordActionVerb = {
      id: 'remove-from-list',
      label: 'Remove from list…',
      icon: <Archive className="h-4 w-4" />,
      tone: 'danger',
      disabled: busy || removal.kind === 'mixed' || removal.kind === 'none',
      disabledReason: busy
        ? BUSY_REASON
        : removal.kind === 'mixed'
          ? MIXED_REMOVAL_REASON
          : 'Only orders still in the building, or packages no order owns, can leave the list',
      dialog: (done) =>
        removal.kind === 'unlinked' ? (
          <UnlinkedRemovalDialog cardIds={removal.ids} done={done} onSettled={onDone} />
        ) : (
          <OrderRemovalDialog orderRowIds={removal.kind === 'orders' ? removal.ids : []} done={done} onSettled={onDone} />
        ),
    };
    const out: RecordActionVerb[] = [flag, remove];
    if (assignable) {
      out.push({
        id: 'assign-picker',
        label: assigning ? 'Assigning…' : 'Assign picker…',
        icon: <UserRound className="h-4 w-4" />,
        disabled: busy,
        disabledReason: BUSY_REASON,
        dialog: (done) => (
          <StaffAssignDialog
            role="technician"
            caption={`Assign a picker to ${orderRowIds.length} order${orderRowIds.length === 1 ? '' : 's'}`}
            doneTitle="Picker assigned"
            testId="live-feed-assign-picker"
            done={done}
            onSettled={onDone}
            // The mutation's own error toast and cache rollback cover a refusal; it resolves false here.
            onAssign={(staffId, staffName) =>
              assignPicker({ orderIds: orderRowIds, pickerId: staffId, pickerName: staffName }).then(
                () => {
                  toast.success(`${staffName} assigned to pick ${orderRowIds.length} order${orderRowIds.length === 1 ? '' : 's'}`);
                  return true;
                },
                () => false,
              )
            }
          />
        ),
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
        dialog: (done) => (
          <StaffAssignDialog
            role="packer"
            caption={`Mark ${orderRowIds.length} order${orderRowIds.length === 1 ? '' : 's'} packed as`}
            doneTitle="Marked packed"
            testId="live-feed-mark-packed"
            done={done}
            onSettled={onDone}
            onAssign={async (staffId, staffName) => {
              setPacking(true);
              try {
                const result = await markPacked(orderRowIds, staffId);
                const skipped = result.skipped.length > 0 ? ` · ${result.skipped.length} skipped (no shipment)` : '';
                toast.success(`Marked ${result.markedIds.length} packed as ${staffName}${skipped}`);
                refreshDomain('orders.outbound');
                return true;
              } catch (error: unknown) {
                toast.error(error instanceof Error ? error.message : 'Could not mark as packed');
                return false;
              } finally {
                setPacking(false);
              }
            }}
          />
        ),
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
  }, [assignPicker, assignable, assigning, busy, cardIds, cards, links, onDone, orderRowIds, packable, packing, queryClient, removal, scanOutable, scanningOut, undoable, undoing]);

  if (cards.length === 0) return null;
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
      <div role="region" aria-label={`${count} selected package${count === 1 ? '' : 's'}`} className="pointer-events-auto">
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
    </div>
  );
}
