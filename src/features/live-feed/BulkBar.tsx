'use client';

/**
 * The Live feed's bulk bar — the selected packages' count, Clear, and the
 * verbs that act on all of them at once. The integrator owns the selection;
 * this bar owns only the verbs. Verbs paint through `RecordActionStrip` (the
 * ledger's replacement for every selection action bar); each write rides an
 * existing path (see `bulk-actions.ts`). Mount it as the last child of the
 * board's scroll area: it floats over the bottom of the board.
 */

import { useMemo, useRef, useState, type ReactNode } from 'react';
import { toast } from '@/lib/toast';
import type { PackageCard } from '@/lib/live-feed/types';
import { useOrderAssignment } from '@/hooks/useOrderAssignment';
import { printOutboundDocuments } from '@/lib/print/printOutboundDocuments';
import { StageStaffAssignPopover } from '@/components/staff-assign/StageStaffAssignPopover';
import {
  RecordActionStrip,
  type RecordActionVerb,
} from '@/design-system/components/record-action-strip/RecordActionStrip';
import { IconButton } from '@/design-system/primitives/IconButton';
import { ACTION_DOCK_LIFT, ACTION_DOCK_TOP_GAP } from '@/design-system/tokens/dock-clearance';
import { Printer, User, X } from '@/components/Icons';
import { cn } from '@/utils/_cn';
import {
  canAssignPicker,
  describeLabelPrint,
  planLabelPrint,
  readShippingLabels,
  selectedOrderRowIds,
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
  const [assignOpen, setAssignOpen] = useState(false);
  const [printing, setPrinting] = useState(false);
  // Error toasts and cache rollback belong to the mutation (useOptimisticMutation).
  const assignment = useOrderAssignment();
  const assigning = assignment.isPending;
  const busy = assigning || printing;

  const orderRowIds = useMemo(() => selectedOrderRowIds(cards), [cards]);
  const assignable = useMemo(() => canAssignPicker(cards), [cards]);

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

    const print: RecordActionVerb = {
      id: 'print-labels',
      label: printing ? 'Printing…' : 'Print labels',
      icon: <Printer className="h-4 w-4" />,
      disabled: busy,
      disabledReason: BUSY_REASON,
      run: printLabels,
    };
    if (!assignable) return [print];
    return [
      {
        id: 'assign-picker',
        label: assigning ? 'Assigning…' : 'Assign picker',
        icon: <User className="h-4 w-4" />,
        disabled: busy,
        disabledReason: BUSY_REASON,
        run: () => setAssignOpen(true),
      },
      print,
    ];
  }, [assignable, assigning, busy, onDone, orderRowIds, printing]);

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
        'pointer-events-none sticky bottom-0 z-sticky flex justify-center',
        // The phone board already insets its body (px-3); the bar spans that width.
        phone ? cn(ACTION_DOCK_TOP_GAP, ACTION_DOCK_LIFT) : 'pb-4 pt-2',
      )}
    >
      <div
        ref={barRef}
        role="region"
        aria-label={`${count} selected package${count === 1 ? '' : 's'}`}
        className={cn('pointer-events-auto flex items-center gap-2', phone && 'w-full justify-between')}
      >
        <div className="flex shrink-0 items-center gap-1">
          <IconButton
            type="button"
            size={phone ? 'touch' : 'sm'}
            radius="pill"
            tone="neutral"
            icon={<X className="h-4 w-4" />}
            ariaLabel="Clear selection"
            onClick={onClear}
            data-testid="live-feed-bulk-bar-clear"
          />
          <span className="whitespace-nowrap text-sm font-medium tabular-nums text-text-default">
            {count}
            {/* A 390px phone fits the two verbs only with the bare count; the word stays for screen readers. */}
            <span className={phone ? 'sr-only' : undefined}> selected</span>
          </span>
        </div>
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
