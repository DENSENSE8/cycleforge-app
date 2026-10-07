'use client';

/**
 * A fulfilled order's ONE thread (operator 2026-10-06, `HANDOFF-fulfilled-
 * drilldown.md` R6, L3): staff notes with their @mentions, the desk's events
 * (assigned, alert sent, watch set / fired) and every change of the carrier's
 * status — one chronological list, oldest first (`fulfilledThreadItems`) —
 * then the composer: type `@` to pick a staffer (the mention lands in their
 * inbox), Enter sends, Shift + Enter breaks the line. The host's alert verbs
 * sit beside it (`verbs`).
 *
 * A note is written to the order's lead line (`POST /api/orders/[id]/notes`,
 * the order's own note writer, which validates the mentions and notifies);
 * the thread reads every line of the order (`GET /api/fulfilled/thread`).
 */

import { useCallback, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, Send, Truck } from '@/components/Icons';
import { StaffMentionListbox, useStaffMentionField } from '@/components/mentions/StaffMentionField';
import { NoteText } from '@/components/outbound/orders/notes/OrderNotesPanel';
import { SkeletonList } from '@/design-system/components/Skeletons';
import { IconButton } from '@/design-system/primitives/IconButton';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { RECORD_LABEL_CLASS, RECORD_RECESS_CLASS } from '@/design-system/tokens/record';
import { useAppendOrderNote } from '@/hooks/useOrderNotes';
import { encodeNoteMentions } from '@/lib/orders/note-mentions';
import { fulfilledThreadItems, type FulfilledThreadItem, type FulfilledThreadRead } from '@/lib/outbound/fulfilled-thread';
import type { ShipmentRecordAction } from '@/lib/shipments/shipment-record-types';
import { toast } from '@/lib/toast';
import { cn } from '@/utils/_cn';
import { timeAgo } from '@/utils/_date';
import { formatDateTimePST } from '@/utils/date';
import { NAV_FULFILLED_QUERY_ROOT } from './useFulfilledList';

/** The React Query root every thread read is keyed under — a note or a desk verb invalidates it. */
export const FULFILLED_THREAD_QUERY_ROOT = 'fulfilled-thread';

function useFulfilledThread(orderRowIds: readonly number[]) {
  const key = orderRowIds.join(',');
  return useQuery({
    queryKey: [FULFILLED_THREAD_QUERY_ROOT, key],
    enabled: orderRowIds.length > 0,
    staleTime: 15_000,
    queryFn: async ({ signal }): Promise<FulfilledThreadRead> => {
      const res = await fetch(`/api/fulfilled/thread?orders=${encodeURIComponent(key)}`, { signal, cache: 'no-store' });
      if (!res.ok) throw new Error(`Couldn't read the thread (${res.status})`);
      return (await res.json()) as FulfilledThreadRead;
    },
  });
}

export function OrderThread({
  orderRowIds,
  carrierActions,
  verbs,
  testId,
}: {
  /** Every line of the order (`orders.id`); the first is where a new note is written. */
  orderRowIds: readonly number[];
  /** The package record's actions — its carrier scans become the thread's carrier status changes. */
  carrierActions: readonly ShipmentRecordAction[];
  /** The host's alert verbs, beside the composer. */
  verbs?: ReactNode;
  testId: string;
}) {
  const thread = useFulfilledThread(orderRowIds);
  const items = useMemo(() => fulfilledThreadItems(thread.data ?? null, carrierActions), [thread.data, carrierActions]);
  const lead = orderRowIds[0] ?? null;
  return (
    <div className="flex flex-col gap-3" data-testid={testId}>
      {thread.isPending && orderRowIds.length > 0 ? (
        <SkeletonList count={2} type="row" />
      ) : items.length === 0 ? (
        <p className={cn(RECORD_LABEL_CLASS, 'text-mode-muted')}>Nothing yet. Notes, alerts and carrier changes on this order land here.</p>
      ) : (
        <ol className="flex flex-col gap-2" aria-label="Order thread">
          {items.map((item) => (
            <ThreadRow key={item.id} item={item} />
          ))}
        </ol>
      )}
      {thread.isError ? <p className={cn(RECORD_LABEL_CLASS, 'text-mode-warn')}>{thread.error.message}</p> : null}
      {lead != null ? (
        <div className="flex items-start gap-2">
          <ThreadComposer orderRowId={lead} testId={`${testId}-composer`} />
          {verbs}
        </div>
      ) : (
        <p className={cn(RECORD_LABEL_CLASS, 'text-mode-muted')}>This package names no order line, so it has no thread to write to.</p>
      )}
    </div>
  );
}

function ThreadRow({ item }: { item: FulfilledThreadItem }) {
  const when = (
    <time dateTime={item.at} title={formatDateTimePST(item.at)}>
      {timeAgo(item.at)}
    </time>
  );
  if (item.kind === 'note') {
    return (
      <li className="flex flex-col gap-0.5" data-thread-kind="note">
        <span className={cn(RECORD_LABEL_CLASS, 'text-mode-muted')}>
          <b className="font-semibold text-mode-ink">{item.author ?? 'Unknown'}</b> · {when}
        </span>
        <NoteText text={item.text} />
      </li>
    );
  }
  const Glyph = item.kind === 'carrier' ? Truck : Activity;
  return (
    <li className="flex items-start gap-1.5 text-role-caption text-mode-muted" data-thread-kind={item.kind}>
      <Glyph className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <span className="min-w-0">
        <span className="text-mode-ink">{item.label}</span>
        {item.kind === 'carrier' && item.detail ? <span> · {item.detail}</span> : null}
        {item.kind === 'event' && item.actor ? <span> · by {item.actor}</span> : null}
        <span> · {when}</span>
      </span>
    </li>
  );
}

/** Write a note to the order: `@` picks a staffer, Enter sends, the field clears. */
function ThreadComposer({ orderRowId, testId }: { orderRowId: number; testId: string }) {
  const [draft, setDraft] = useState('');
  const draftRef = useRef('');
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const hintId = useId();
  const queryClient = useQueryClient();
  const append = useAppendOrderNote(orderRowId);
  const mentions = useStaffMentionField({
    areaRef,
    textRef: draftRef,
    onText: useCallback((next: string) => {
      draftRef.current = next;
      setDraft(next);
    }, []),
  });
  const { pickedRef, reset } = mentions;

  const send = async () => {
    const text = encodeNoteMentions(draftRef.current, pickedRef.current).trim();
    if (!text || append.isPending) return;
    try {
      await append.mutateAsync(text);
      draftRef.current = '';
      setDraft('');
      reset([]);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [FULFILLED_THREAD_QUERY_ROOT] }),
        queryClient.invalidateQueries({ queryKey: [NAV_FULFILLED_QUERY_ROOT] }),
      ]);
    } catch {
      toast.error("Couldn't add the note — writing order notes needs the orders permission");
    }
  };

  return (
    <div className="relative flex min-w-0 flex-1 items-end gap-1.5">
      {/* ds-raw-button: the @mention combobox needs native caret/selection control on the textarea (TextField's multiline forwards no ref). */}
      <textarea
        ref={areaRef}
        value={draft}
        onChange={(event) => {
          draftRef.current = event.target.value;
          setDraft(event.target.value);
          mentions.sync(event.target.value, event.target.selectionStart ?? event.target.value.length);
        }}
        onSelect={(event) => mentions.onSelect(event.currentTarget)}
        onBlur={() => mentions.dismiss()}
        onKeyDown={(event) => {
          if (mentions.onKeyDown(event)) return;
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            void send();
          }
        }}
        rows={2}
        placeholder="Write a note — @ to alert a staffer"
        aria-label="Note on this order"
        aria-describedby={hintId}
        {...mentions.ariaProps}
        data-testid={testId}
        className={cn(
          'block min-h-mode-hit w-full min-w-0 flex-1 resize-y rounded-mode-control bg-mode-well p-1.5 text-role-caption text-mode-ink',
          RECORD_RECESS_CLASS,
          focusRing('field'),
        )}
      />
      <span id={hintId} className="sr-only">
        Enter sends; Shift and Enter starts a new line.
      </span>
      <IconButton
        ariaLabel="Send note"
        size="sm"
        icon={<Send className="size-3.5" />}
        disabled={!draft.trim() || append.isPending}
        onClick={() => void send()}
        data-testid={`${testId}-send`}
      />
      <StaffMentionListbox field={mentions} className="absolute left-0 top-full mt-1" />
    </div>
  );
}
