'use client';

/**
 * The Inbound triage bars' verbs while receipts or deliveries are checked (Law 5): the
 * receiving selection's catalog — the one `useReceivingLineRailSelection`
 * publishes for the rail — painted as a {@link RecordActionStrip}. Same verbs,
 * same order at 1 or N checked; a verb the check-set cannot run keeps its
 * place, disabled, and says why.
 */

import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { PackageCheck, PackageOpen } from '@/components/Icons';
import { RecordActionStrip, type RecordActionVerb } from '@/design-system/components/record-action-strip/RecordActionStrip';
import { useRailActionSnapshot } from '@/components/right-rail/RailSelectionActions';
import { RECEIVING_SELECTION_SCOPE } from '@/components/station/receiving-lines-table-helpers';
import { useAuth } from '@/contexts/AuthContext';
import { shouldUseLocalReceiveOnly } from '@/lib/receiving/intake-items-routing';
import { invalidateReceivingFeeds } from '@/lib/queries/receiving-queries';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import { resolveSelectionAction } from '@/lib/selection/selection-actions';
import { readPhotoPolicyBlock } from '@/lib/receiving/photo-policy-override-wire';
import { safeRandomUUID } from '@/lib/safe-uuid';
import { emitToggleAll } from '@/lib/selection/table-selection';
import { toast } from '@/lib/toast';

export type ReceivingAdvance = 'unboxed' | 'received';


export function receivingAdvancePackages(rows: readonly ReceivingLineRow[], advance: ReceivingAdvance): Array<[number, ReceivingLineRow[]]> {
  const packages = new Map<number, ReceivingLineRow[]>();
  for (const row of rows) {
    const id = Number(row.receiving_id);
    if (!Number.isFinite(id) || id <= 0) continue;
    const held = packages.get(id);
    if (held) held.push(row);
    else packages.set(id, [row]);
  }
  return [...packages].filter(([, lines]) =>
    advance === 'unboxed'
      ? lines.some((line) => !line.unbox_opened_at && !line.unboxed_at)
      : lines.some((line) => !line.received_done_at && String(line.workflow_status ?? '').toUpperCase() !== 'DONE'),
  );
}

async function responseError(response: Response, fallback: string): Promise<string | null> {
  const body = (await response.json().catch(() => null)) as { success?: boolean; error?: string } | null;
  if (response.ok && body?.success !== false) return null;
  const block = readPhotoPolicyBlock(response.status, body);
  if (block?.blockers.length) return block.blockers.join(' · ');
  return body?.error || `${fallback} (${response.status})`;
}

async function advancePackage(receivingId: number, rows: readonly ReceivingLineRow[], advance: ReceivingAdvance): Promise<string | null> {
  if (advance === 'unboxed') {
    const response = await fetch(`/api/receiving/${receivingId}/acknowledge-unbox`, { method: 'POST' });
    return responseError(response, 'Could not mark package unboxed');
  }
  const row = rows[0]!;
  const clientEventId = safeRandomUUID();
  const response = await fetch('/api/receiving/mark-received-po', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': clientEventId },
    body: JSON.stringify({
      receiving_id: receivingId,
      receive_intent: shouldUseLocalReceiveOnly(row) ? 'local_receive' : 'zoho_receive',
      station: 'RECEIVING',
      client_event_id: clientEventId,
    }),
  });
  return responseError(response, 'Could not mark package received');
}

export function ReceivingSelectionVerbs({
  noun,
  lead = NO_VERBS,
  advance = null,
}: {
  noun: string;
  lead?: readonly RecordActionVerb[];
  /** Lifecycle CTA owned by the current ledger, shown first in the selected-row bar. */
  advance?: ReceivingAdvance | null;
}) {
  const { scope, rows, actions } = useRailActionSnapshot();
  const queryClient = useQueryClient();
  const canMarkReceived = useAuth().has('receiving.mark_received');
  const [advancing, setAdvancing] = useState(false);
  const verbs = useMemo<RecordActionVerb[]>(() => {
    if (scope !== RECEIVING_SELECTION_SCOPE || rows.length === 0) return [...lead];
    // This scope is published exclusively by useReceivingLineRailSelection.
    const receivingRows = rows as ReceivingLineRow[];
    const packages = advance ? receivingAdvancePackages(receivingRows, advance) : [];
    const advanceVerb: RecordActionVerb[] = advance
      ? [{
          id: `mark-${advance}`,
          label: advancing ? `Marking ${advance}…` : `Mark ${advance}`,
          icon: advance === 'unboxed' ? <PackageOpen className="h-4 w-4" /> : <PackageCheck className="h-4 w-4" />,
          tone: advance === 'received' ? 'success' : 'blue',
          disabled: advancing || !canMarkReceived || packages.length === 0,
          disabledReason: !canMarkReceived
            ? 'You do not have permission to update receiving status'
            : packages.length === 0
              ? `Selected ${noun} already ${advance}`
              : undefined,
          run: async () => {
            setAdvancing(true);
            let succeeded = 0;
            const failures: string[] = [];
            try {
              for (const [receivingId, packageRows] of packages) {
                const error = await advancePackage(receivingId, packageRows, advance).catch((reason: unknown) =>
                  reason instanceof Error ? reason.message : `Could not mark package ${advance}`,
                );
                if (error) failures.push(error);
                else succeeded += 1;
              }
              if (succeeded > 0) {
                invalidateReceivingFeeds(queryClient);
                emitToggleAll(RECEIVING_SELECTION_SCOPE, 'none');
              }
              if (failures.length > 0) {
                toast.error(`${succeeded} of ${packages.length} updated · ${failures[0]}`);
              } else {
                toast.success(`${succeeded} package${succeeded === 1 ? '' : 's'} marked ${advance}`);
              }
            } finally {
              setAdvancing(false);
            }
          },
        }]
      : [];
    return [
      ...advanceVerb,
      ...lead,
      ...actions.map((action): RecordActionVerb => {
        const resolved = resolveSelectionAction(action, rows);
        return {
          id: action.key,
          label: resolved.label,
          icon: action.icon,
          tone:
            action.tone === 'red'
              ? 'danger'
              : action.tone === 'orange'
                ? 'yellow'
                : action.tone === 'blue'
                  ? 'blue'
                  : action.tone === 'emerald'
                    ? 'success'
                    : 'default',
          disabled: resolved.disabled,
          disabledReason: resolved.reason,
          pressed: action.direction ? resolved.direction === 'undo' : undefined,
          run: () => action.run(rows, resolved.direction ? { direction: resolved.direction } : undefined),
          dialog: action.dialog ? (done) => action.dialog!(rows, done) : undefined,
        };
      }),
    ];
  }, [scope, rows, actions, lead, advance, advancing, canMarkReceived, noun, queryClient]);
  if (verbs.length === 0) return null;
  // TriageSelectBar already owns the selected-state surface. Its nested verb
  // strip must use the borderless header face, otherwise the standalone strip
  // face paints a stray bottom hairline through the action bar.
  return <RecordActionStrip verbs={verbs} label={`Checked ${noun} actions`} testId="incoming-bulk" face="header" />;
}

const NO_VERBS: readonly RecordActionVerb[] = [];
