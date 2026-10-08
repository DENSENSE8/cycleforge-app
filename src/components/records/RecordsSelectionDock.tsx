'use client';

/**
 * The Records sheet's check-set verbs — `RecordActionStrip face="dock"`, the
 * floating Linear dock (`N selected · Actions · ×`, operator 2026-10-06; no
 * wrapper — CONSOLIDATION_LEDGER: the page supplies the facts and the verbs,
 * the strip owns the face and the order, the destructive verb last). Every
 * verb acts on the selected LINES, already widened to the grain shown
 * (`selectedRecordLines`), and rides `/api/records/*`
 * (`records-actions-client.ts`). A verb that needs a value opens its own card
 * above the pill (`display`). Refusals toast per reason; tracking writes and
 * holds carry Undo; Delete confirms by name (type-to-confirm past one line)
 * and is not offered on an aggregate grain (handoff §4.3).
 */

import { useMemo, useRef, useState } from 'react';
import { useStepUp } from '@/components/providers/StepUpProvider';
import { format } from 'date-fns';
import { Pause } from 'lucide-react';
import { Archive, ArrowLeftRight, Calendar, Hash, MessageSquare, Play, Plus, Trash2, Unlink, User } from '@/components/Icons';
import { RecordActionStrip, type RecordActionVerb } from '@/design-system/components/record-action-strip/RecordActionStrip';
import { requestConfirm } from '@/design-system/components/confirm';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/design-system/components/AlertDialog';
import { DateRangePickerField } from '@/design-system/components/DateRangePickerField';
import { TextField } from '@/design-system/primitives/TextField';
import { ACTION_DOCK_LIFT } from '@/design-system/tokens/dock-clearance';
import { StageStaffAssignPopover } from '@/components/staff-assign/StageStaffAssignPopover';
import { ListRemovalPicker } from '@/components/orders/ListRemovalPicker';
import { listRemovalReasonLabel } from '@/lib/orders/list-removal';
import { removeFromList, restoreToList } from '@/lib/orders/list-removal-client';
import type { BulkEntry } from '@/lib/nav/locate/use-bulk-list';
import type { RecordsGrain } from '@/lib/nav/records/params';
import type { RefSelection } from '@/lib/receiving/reconcile';
import type { RecordTarget } from '@/lib/records/sheet-actions-contract';
import { toast } from '@/lib/toast';
import { postRecordWrite, type RecordWrite } from './records-actions-client';
import { orderNumberTargets, recordTargetOf, recordTargets, recordsEntryKey, refsOfLines, summarizeRecordResults } from './records-grain';
import { ValueCard } from './RecordsValueCard';
import { DELETE_HOTKEY } from '@/lib/keyboard/key-registry';

const BUSY_REASON = 'Working on the last action…';
const OUTBOUND_ONLY = 'Outbound lines only';
/** The word typed to delete more than one line. */
const DELETE_WORD = 'delete';

/** What one checked unit is called, per grain. */
export const RECORDS_UNIT_NOUN: Readonly<Record<RecordsGrain, { one: string; many: string }>> = {
  line: { one: 'line', many: 'lines' },
  order: { one: 'order', many: 'orders' },
  item: { one: 'item number', many: 'item numbers' },
  product: { one: 'product', many: 'products' },
};

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** Lines grouped by a key (a tracking, a package) → that key's targets. */
function targetsBy<K>(lines: readonly BulkEntry[], keyOf: (line: BulkEntry) => K | null | undefined): Map<K, RecordTarget[]> {
  const groups = new Map<K, RecordTarget[]>();
  for (const line of lines) {
    const key = keyOf(line);
    const target = recordTargetOf(line);
    if (key == null || !target) continue;
    const list = groups.get(key);
    if (list) list.push(target);
    else groups.set(key, [target]);
  }
  return groups;
}

export function RecordsSelectionDock({
  lines,
  loaded,
  count,
  grain,
  pasted,
  writeRefs,
  latest,
  onClear,
  onDone,
}: {
  /** The checked units' lines (the grain shown, widened). */
  lines: readonly BulkEntry[];
  /** Every loaded line — an inbound order-number change takes its whole order. */
  loaded: readonly BulkEntry[];
  /** Checked units at the grain shown. */
  count: number;
  grain: RecordsGrain;
  /** The pasted numbers (`?refs=`); empty = Query mode. */
  pasted: RefSelection;
  writeRefs: (refs: readonly string[]) => void;
  /** The newest answer's line by key — an Undo reads the package a write just made primary. */
  latest: () => ReadonlyMap<string, BulkEntry>;
  onClear: () => void;
  /** A write landed: re-read the sheet. */
  onDone: () => void;
}) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [assign, setAssign] = useState<'pick' | 'pack' | null>(null);
  const [typedDelete, setTypedDelete] = useState<string | null>(null);
  // Delete (`orders.void`) can ask for a fresh PIN: the house step-up opens and the write retries.
  const requestStepUp = useStepUp();

  const targets = useMemo(() => recordTargets(lines), [lines]);
  const outbound = useMemo(() => lines.filter((line) => line.facts?.direction === 'outbound'), [lines]);
  const outboundTargets = useMemo(() => recordTargets(outbound), [outbound]);
  const pasteMode = pasted.refs.length > 0;
  const aggregate = grain === 'item' || grain === 'product';
  const noun = RECORDS_UNIT_NOUN[grain];

  const verbs = useMemo<RecordActionVerb[]>(() => {
    /** One write → its toasts; true when it reached the server. */
    const send = async (write: RecordWrite, did: string, undo?: () => void): Promise<boolean> => {
      setBusy(true);
      try {
        const summary = summarizeRecordResults(await postRecordWrite(write, requestStepUp));
        for (const refusal of summary.refused) toast.error(`${plural(refusal.count, 'line', 'lines')} refused: ${refusal.reason}`);
        if (summary.done > 0) {
          const message = `${did} · ${plural(summary.done, 'line', 'lines')}`;
          if (undo) toast.undo(message, { onUndo: undo });
          else toast.success(message);
        }
        onDone();
        return true;
      } catch (error: unknown) {
        toast.error(error instanceof Error ? error.message : 'Could not save');
        return false;
      } finally {
        setBusy(false);
      }
    };
    /** Undo a tracking write: lines that had a number get it back; lines that had none drop the one they now lead with. */
    const restoreTracking = (before: readonly BulkEntry[]) => async () => {
      const now = latest();
      const writes: RecordWrite[] = [];
      for (const [tracking, group] of targetsBy(before, (line) => line.facts?.tracking)) {
        writes.push({ path: '/api/records/tracking', body: { targets: group, tracking, mode: 'set' } });
      }
      const fresh = before.filter((line) => !line.facts?.tracking).map((line) => now.get(recordsEntryKey(line)) ?? line);
      for (const [shipmentId, group] of targetsBy(fresh, (line) => line.facts?.shipmentId)) {
        writes.push({ path: '/api/records/tracking/unlink', body: { targets: group, shipmentId } });
      }
      for (const write of writes) await send(write, 'Tracking restored');
    };
    const disabledBusy = { disabled: busy, disabledReason: BUSY_REASON };
    const outboundOnly = { disabled: busy || outboundTargets.length === 0, disabledReason: busy ? BUSY_REASON : OUTBOUND_ONLY };
    const none = targets.length === 0;
    const needsLines = { disabled: busy || none, disabledReason: busy ? BUSY_REASON : 'Nothing selected matched a record' };
    const allOnHold = outbound.length > 0 && outbound.every((line) => line.facts?.internalStatus === 'on_hold');
    const linked = lines.filter((line) => line.facts?.shipmentId != null);
    const allUntracked = lines.every((line) => !line.facts?.tracking);

    const out: RecordActionVerb[] = [
      {
        id: 'add-tracking',
        label: 'Add tracking…',
        icon: <Plus className="size-4" />,
        ...needsLines,
        display: (done) => (
          <ValueCard
            title={`Add a tracking number to ${plural(targets.length, 'line', 'lines')}`}
            label="Tracking number"
            submit="Add tracking"
            mono
            busy={busy}
            onCancel={done}
            onSubmit={async (tracking) => {
              const before = [...lines];
              // A line with no number takes it as its primary — reversible; beside a primary it is another box.
              if (await send({ path: '/api/records/tracking', body: { targets, tracking, mode: 'add' } }, `Added ${tracking}`, allUntracked ? restoreTracking(before) : undefined)) done();
            }}
          />
        ),
      },
      {
        id: 'replace-tracking',
        label: 'Replace tracking…',
        icon: <ArrowLeftRight className="size-4" />,
        ...needsLines,
        display: (done) => (
          <ValueCard
            title={`Replace the tracking of ${plural(targets.length, 'line', 'lines')}`}
            label="New tracking number"
            submit="Replace tracking"
            mono
            busy={busy}
            onCancel={done}
            onSubmit={async (tracking) => {
              const before = [...lines];
              if (await send({ path: '/api/records/tracking', body: { targets, tracking, mode: 'set' } }, `Tracking set to ${tracking}`, restoreTracking(before))) done();
            }}
          />
        ),
      },
      {
        id: 'remove-tracking',
        label: 'Remove tracking',
        icon: <Unlink className="size-4" />,
        disabled: busy || linked.length === 0,
        disabledReason: busy ? BUSY_REASON : 'No selected line has a tracking number',
        run: async () => {
          const numbers = [...new Set(linked.flatMap((line) => line.facts?.tracking ?? []))];
          const ok = await requestConfirm({
            title: 'Remove tracking?',
            description: `Unlink ${numbers.length === 1 ? numbers[0] : `${numbers.length} tracking numbers`} from ${plural(linked.length, 'line', 'lines')}. The tracking record itself stays.`,
            confirmLabel: 'Remove tracking',
            tone: 'danger',
          });
          if (!ok) return;
          const before = [...linked];
          for (const [shipmentId, group] of targetsBy(linked, (line) => line.facts?.shipmentId)) {
            await send({ path: '/api/records/tracking/unlink', body: { targets: group, shipmentId } }, 'Tracking removed', restoreTracking(before));
          }
        },
      },
      {
        id: 'order-number',
        label: 'Change order number…',
        icon: <Hash className="size-4" />,
        ...needsLines,
        display: (done) => (
          <ValueCard
            title={`Change the order number of ${plural(targets.length, 'line', 'lines')}`}
            label="New order number"
            submit="Change order number"
            mono
            busy={busy}
            onCancel={done}
            onSubmit={async (orderNumber) => {
              if (await send({ path: '/api/records/order-number', body: { targets: orderNumberTargets(lines, loaded), orderNumber } }, `Order number changed to ${orderNumber}`)) done();
            }}
          />
        ),
      },
      {
        id: 'ship-by',
        label: 'Set ship-by…',
        icon: <Calendar className="size-4" />,
        ...outboundOnly,
        display: (done) => (
          <div className="flex flex-col gap-2 p-1">
            <p className="px-1 text-sm font-semibold text-text-default">Ship-by for {plural(outboundTargets.length, 'outbound line', 'outbound lines')}</p>
            <DateRangePickerField
              variant="compact"
              value={undefined}
              ariaLabel="Ship-by date"
              onChange={async (day) => {
                if (await send({ path: '/api/records/actions', body: { action: 'ship_by', targets: outboundTargets, date: format(day, 'yyyy-MM-dd') } }, `Ship-by ${format(day, 'MMM d')}`)) done();
              }}
              onClear={async () => {
                if (await send({ path: '/api/records/actions', body: { action: 'ship_by', targets: outboundTargets, date: null } }, 'Ship-by cleared')) done();
              }}
            />
          </div>
        ),
      },
      { id: 'assign-pick', label: 'Assign picker…', icon: <User className="size-4" />, ...outboundOnly, run: () => setAssign('pick') },
      { id: 'assign-pack', label: 'Assign packer…', icon: <User className="size-4" />, ...outboundOnly, run: () => setAssign('pack') },
      {
        id: 'note',
        label: 'Add note…',
        icon: <MessageSquare className="size-4" />,
        ...needsLines,
        display: (done) => (
          <ValueCard
            title={`Add a note to ${plural(targets.length, 'line', 'lines')}`}
            label="Note"
            submit="Add note"
            multiline
            busy={busy}
            onCancel={done}
            onSubmit={async (text) => {
              if (await send({ path: '/api/records/actions', body: { action: 'note', targets, text } }, 'Note added')) done();
            }}
          />
        ),
      },
      {
        id: 'hold',
        label: allOnHold ? 'Release hold' : 'Hold',
        icon: allOnHold ? <Play className="size-4" /> : <Pause className="size-4" />,
        ...outboundOnly,
        run: async () => {
          const on = !allOnHold;
          const held = outboundTargets;
          await send({ path: '/api/records/actions', body: { action: 'hold', targets: held, on } }, on ? 'On hold' : 'Hold released', () => {
            void send({ path: '/api/records/actions', body: { action: 'hold', targets: held, on: !on } }, on ? 'Hold released' : 'On hold');
          });
        },
      },
    ];

    // Remove from list: a paste drops its numbers (no write); a query takes outbound orders off the To-ship list.
    if (pasteMode) {
      out.push({
        id: 'remove-from-list',
        label: 'Remove from list',
        icon: <Archive className="size-4" />,
        ...disabledBusy,
        run: () => {
          const dropped = refsOfLines(pasted, lines);
          if (dropped.length === 0) {
            toast.error('None of these came from a pasted number');
            return;
          }
          const before = pasted.refs;
          writeRefs(before.filter((ref) => !dropped.includes(ref)));
          onClear();
          toast.undo(`Removed ${plural(dropped.length, 'number', 'numbers')} from the list`, { onUndo: () => writeRefs(before) });
        },
      });
    } else {
      const orderIds = outboundTargets.map((target) => target.id);
      out.push({
        id: 'remove-from-list',
        label: 'Remove from list…',
        icon: <Archive className="size-4" />,
        disabled: busy || orderIds.length === 0,
        disabledReason: busy ? BUSY_REASON : 'Only outbound orders leave the To-ship list',
        display: (done) => (
          <ListRemovalPicker
            count={orderIds.length}
            busy={busy}
            onCancel={done}
            onConfirm={async (reason, note) => {
              setBusy(true);
              try {
                const removed = await removeFromList(orderIds, reason, note);
                done();
                onDone();
                toast.undo(`Removed ${removed.length} from the list · ${listRemovalReasonLabel(reason)}`, {
                  onUndo: () => {
                    void restoreToList(removed)
                      .then((restored) => {
                        toast.success(`Put ${restored.length} back on the list`);
                        onDone();
                      })
                      .catch((error: unknown) => toast.error(error instanceof Error ? error.message : 'Could not put them back'));
                  },
                });
              } catch (error: unknown) {
                // The list-removal table is another lane's migration — its refusal is shown as it is.
                toast.error(error instanceof Error ? error.message : 'Could not remove from the list');
              } finally {
                setBusy(false);
              }
            }}
          />
        ),
      });
    }

    // Delete: never on an aggregate (an item number or a product is not a record); last, danger.
    if (!aggregate) {
      out.push({
        id: 'delete',
        label: 'Delete…',
        icon: <Trash2 className="size-4" />,
        tone: 'danger',
        hotkey: DELETE_HOTKEY,
        ...needsLines,
        run: async () => {
          if (targets.length > 1) {
            setTypedDelete('');
            return;
          }
          const only = lines.find((line) => recordTargetOf(line));
          const name = only?.facts?.orderNumber ?? only?.ref ?? 'this line';
          const ok = await requestConfirm({
            title: 'Delete this line?',
            description: `Delete ${only?.facts?.direction === 'inbound' ? 'the inbound line' : 'the order line'} ${name}${only?.facts?.title ? ` · ${only.facts.title}` : ''}. A line that was picked, packed, scanned out, unboxed or received is refused.`,
            confirmLabel: 'Delete',
            tone: 'danger',
          });
          if (ok) await send({ path: '/api/records/delete', body: { targets } }, 'Deleted');
        },
      });
    }
    return out;
  }, [aggregate, busy, latest, lines, loaded, onClear, onDone, outbound, outboundTargets, pasteMode, pasted, requestStepUp, targets, writeRefs]);

  if (count === 0) return null;

  const names = [...new Set(lines.flatMap((line) => line.facts?.orderNumber ?? []))];
  const shown = names.slice(0, 3).join(', ') + (names.length > 3 ? ` +${names.length - 3} more` : '');
  const label = `${plural(count, noun.one, noun.many)} selected actions`;

  return (
    <div
      data-testid="records-selection-dock"
      className={'pointer-events-none absolute inset-x-0 bottom-0 z-sticky flex justify-center ' + ACTION_DOCK_LIFT}
    >
      <div ref={anchorRef} role="region" aria-label={`${plural(count, noun.one, noun.many)} selected`} className="pointer-events-auto">
        <RecordActionStrip
          verbs={verbs}
          label={label}
          testId="records-dock"
          face="dock"
          dock={{ count, noun: `${count === 1 ? noun.one : noun.many} selected`, onClear }}
        />
      </div>
      <StageStaffAssignPopover
        open={assign != null}
        onClose={() => setAssign(null)}
        anchorRef={anchorRef}
        label={`Assign ${assign === 'pack' ? 'packer' : 'picker'} to ${plural(outboundTargets.length, 'line', 'lines')}`}
        role={assign === 'pack' ? 'packer' : 'technician'}
        selectedStaffId={null}
        onCommit={(staffId) => {
          const stage = assign;
          setAssign(null);
          if (!stage) return;
          void postAssign(stage, staffId);
        }}
      />
      <AlertDialog open={typedDelete != null} onOpenChange={(open) => !open && setTypedDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {plural(targets.length, 'line', 'lines')}?</AlertDialogTitle>
            <AlertDialogDescription>
              {shown ? `Orders ${shown}. ` : ''}Every selected line is deleted; a line that was picked, packed, scanned out, unboxed or received is
              refused. Type “{DELETE_WORD}” to confirm.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <TextField label={`Type ${DELETE_WORD}`} value={typedDelete ?? ''} onChange={setTypedDelete} autoFocus />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="danger"
              disabled={typedDelete?.trim().toLowerCase() !== DELETE_WORD || busy}
              onClick={(event) => {
                event.preventDefault();
                setTypedDelete(null);
                void postDelete();
              }}
            >
              Delete {plural(targets.length, 'line', 'lines')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );

  async function postAssign(stage: 'pick' | 'pack', staffId: number | null) {
    await runWrite({ path: '/api/records/actions', body: { action: 'assign', targets: outboundTargets, stage, staffId } }, stage === 'pick' ? 'Picker assigned' : 'Packer assigned');
  }

  async function postDelete() {
    await runWrite({ path: '/api/records/delete', body: { targets } }, 'Deleted');
  }

  async function runWrite(write: RecordWrite, did: string) {
    setBusy(true);
    try {
      const summary = summarizeRecordResults(await postRecordWrite(write, requestStepUp));
      for (const refusal of summary.refused) toast.error(`${plural(refusal.count, 'line', 'lines')} refused: ${refusal.reason}`);
      if (summary.done > 0) toast.success(`${did} · ${plural(summary.done, 'line', 'lines')}`);
      onDone();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  }
}
