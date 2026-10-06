'use client';

/**
 * The Live feed's bulk bar — the selected packages' count, Clear, and the
 * verbs that act on all of them at once. The integrator owns the selection;
 * this bar owns only the verbs. Verbs paint through `RecordActionStrip` (the
 * ledger's replacement for every selection action bar); each write rides an
 * existing path (see `bulk-actions.ts`). Mount it inside the board's
 * `relative` frame: it floats over the board's bottom edge with no band behind it.
 */

import { useMemo, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import type { PackageCard } from '@/lib/live-feed/types';
import { useOrderAssignment } from '@/hooks/useOrderAssignment';
import { printOutboundDocuments } from '@/lib/print/printOutboundDocuments';
import { postScanOut } from '@/lib/outbound/scan-out-client';
import { SCAN_OUT_DESK_SOURCE } from '@/lib/outbound/scan-out-desk-stamp';
import { bustScanOutCaches } from '@/lib/outbound/outbound-cache-keys';
import { refreshDomain } from '@/lib/refresh/bus';
import { StageStaffAssignPopover } from '@/components/staff-assign/StageStaffAssignPopover';
import {
  RecordActionStrip,
  type RecordActionVerb,
} from '@/design-system/components/record-action-strip/RecordActionStrip';
import { Button } from '@/design-system/primitives/Button';
import { ACTION_DOCK_LIFT } from '@/design-system/tokens/dock-clearance';
import { Printer, ShippingModeScanOut, User, X } from '@/components/Icons';
import { cn } from '@/utils/_cn';
import {
  describeLabelPrint,
  describeScanOut,
  planLabelPrint,
  planScanOut,
  readShippingLabels,
  selectedOrderRowIds,
  selectionInStage,
} from './bulk-actions';

const BUSY_REASON = 'Working on the last action…';

export function LiveFeedBulkBar({
  cards,
  surface,
  onClear,
  onDone,
}: {
  cards: readonly PackageCard[];
  surface: 'desk' | 'phone';
  onClear: () => void;
  onDone: () => void;
}): ReactNode {
  const barRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const [assignOpen, setAssignOpen] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [scanningOut, setScanningOut] = useState(false);
  // Error toasts and cache rollback belong to the mutation (useOptimisticMutation).
  const assignment = useOrderAssignment();
  const assigning = assignment.isPending;
  const busy = assigning || printing || scanningOut;

  const orderRowIds = useMemo(() => selectedOrderRowIds(cards), [cards]);
  const assignable = useMemo(() => selectionInStage(cards, 'to_pick'), [cards]);
  const scanOutable = useMemo(() => selectionInStage(cards, 'packed'), [cards]);

  const verbs = useMemo<RecordActionVerb[]>(() => {
    const printLabels = async () => {
      setPrinting(true);
      try {
        const plan = planLabelPrint(await readShippingLabels(orderRowIds));
        const verdict = describeLabelPrint(plan);
        if (!verdict.ok) {
          toast.error(verdict.message);
          return;
        }
        // The printer takes the whole array — one job, not one dialog per order.
        if (!printOutboundDocuments(plan.docs)) {
          toast.error('Could not open the print dialog — retry');
          return;
        }
        toast.success(verdict.message);
        onDone();
      } finally {
        setPrinting(false);
      }
    };

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

    const print: RecordActionVerb = {
      id: 'print-labels',
      label: printing ? 'Printing…' : 'Print labels',
      icon: <Printer className="h-4 w-4" />,
      disabled: busy,
      disabledReason: BUSY_REASON,
      run: printLabels,
    };
    const out: RecordActionVerb[] = [];
    if (assignable) {
      out.push({
        id: 'assign-picker',
        label: assigning ? 'Assigning…' : 'Assign picker',
        icon: <User className="h-4 w-4" />,
        disabled: busy,
        disabledReason: BUSY_REASON,
        run: () => setAssignOpen(true),
      });
    }
    if (scanOutable) {
      out.push({
        id: 'scan-out',
        label: scanningOut ? 'Scanning out…' : 'Scan out',
        icon: <ShippingModeScanOut className="h-4 w-4" />,
        disabled: busy,
        disabledReason: BUSY_REASON,
        run: scanOut,
      });
    }
    out.push(print);
    return out;
  }, [assignable, assigning, busy, cards, onDone, orderRowIds, printing, queryClient, scanOutable, scanningOut]);

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
      <div
        ref={barRef}
        role="region"
        aria-label={`${count} selected package${count === 1 ? '' : 's'}`}
        className="pointer-events-auto flex items-center gap-2"
      >
        {/* The count rides the Clear button: every floating piece is a pill, nothing is painted behind them. */}
        <Button
          type="button"
          variant="secondary"
          size="sm"
          radius="pill"
          icon={<X className="h-4 w-4" />}
          ariaLabel={`Clear selection (${count} selected)`}
          onClick={onClear}
          data-testid="live-feed-bulk-bar-clear"
          className="shrink-0 tabular-nums"
        >
          {/* A 390px phone fits the verbs only with the bare count. */}
          {phone ? String(count) : `${count} selected`}
        </Button>
        <RecordActionStrip
          verbs={verbs}
          label={`${count} selected package${count === 1 ? '' : 's'} actions`}
          testId="live-feed-bulk-bar-actions"
          face="inline"
        />
      </div>
      <StageStaffAssignPopover
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        anchorRef={barRef}
        label={`Assign picker to ${orderRowIds.length} order${orderRowIds.length === 1 ? '' : 's'}`}
        role="technician"
        selectedStaffId={null}
        onCommit={commitPicker}
      />
    </div>
  );
}
