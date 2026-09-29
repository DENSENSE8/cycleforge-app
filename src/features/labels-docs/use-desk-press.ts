'use client';

/**
 * One print press on the Labels & docs desk — shared by every view (Uploads,
 * Labels, Paperwork, Printed). Documents split by stock, each stock to ITS
 * station (`planPress`): this computer runs the one local pipeline
 * (`printDocuments`, logged with this station), another computer gets one
 * bridge job per stock, a blocked station says why. The press ends by
 * re-reading every desk queue so counts and print badges move at once.
 */

import { useCallback, useState } from 'react';
import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import { requestConfirm } from '@/design-system/components/confirm';
import type { PrintStations } from '@/hooks/usePrintStations';
import { LABEL_BATCHES_QUERY_ROOT } from '@/lib/label-batches/http-client';
import { LABEL_INGESTIONS_QUERY_KEY } from '@/lib/label-ingestions/http-client';
import { currentPrintRoute } from '@/lib/label-prints/current-print-route';
import { LABEL_PRINTS_QUERY_ROOT } from '@/lib/label-prints/http-client';
import { printDocuments, type DeskDocument, type PrintOutcome } from '@/lib/label-prints/print-labels';
import type { PrintStock } from '@/lib/label-prints/print-route';
import { readPrintStation } from '@/lib/print/print-station';
import { stationDocumentRef } from '@/lib/print/print-station-documents';
import { MAX_STATION_DOCUMENTS } from '@/lib/print/staff-print-bridge';
import { safeRandomUUID } from '@/lib/safe-uuid';
import { CHANNEL_FACE } from './print-faces';
import { planPress, PRINT_STOCKS } from './desk-press';

const STOCK_WORD: Record<PrintStock, [string, string]> = { label: ['label', 'labels'], paper: ['paperwork doc', 'paperwork docs'] };
export const stockCount = (n: number, stock: PrintStock) => `${n} ${STOCK_WORD[stock][n === 1 ? 0 : 1]}`;

export interface PressInput {
  documents: DeskDocument[];
  reprint: boolean;
  /** Asked first (animated confirm dialog); a No prints nothing. Built by {@link reprintWarning}. */
  confirm?: string | null;
}

/** What a label carries that the reprint warning names. */
export interface PrintedLabelFace {
  name: string;
  printCount: number;
  lastPrintedAt: string | null;
  lastPrintedBy: string | null;
  lastStationName: string | null;
}

const WHEN = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/**
 * The warn-before-reprinting sentence for a press, or null when nothing in it
 * was printed before (owner 2026-09-28). Names the first printed label with
 * its count and last print so the operator can tell a real reprint from a
 * double-press; the rest are counted.
 */
export function reprintWarning(labels: readonly PrintedLabelFace[]): string | null {
  const printed = labels.filter((label) => label.printCount > 0);
  const first = printed[0];
  if (!first) return null;
  const last = [
    first.lastPrintedAt ? WHEN.format(new Date(first.lastPrintedAt)) : null,
    first.lastPrintedBy,
    first.lastStationName,
  ].filter(Boolean).join(' · ');
  const lead = `${first.name} was printed ${first.printCount === 1 ? 'once' : `${first.printCount} times`}${last ? ` (last ${last})` : ''}.`;
  const more = printed.length > 1 ? ` ${printed.length - 1} more label${printed.length === 2 ? ' was' : 's were'} printed before too.` : '';
  const fresh = labels.length - printed.length;
  const of = fresh === 0 ? '' : fresh === 1 ? ' The other label prints for the first time.' : ` The other ${fresh} print for the first time.`;
  return `${lead}${more}${of}`;
}

export interface DeskPress {
  print: UseMutationResult<string[], Error, PressInput>;
  progress: { done: number; total: number } | null;
  notice: string;
  setNotice: (notice: string) => void;
  /** Re-read every desk queue, batch and print log. */
  refresh: () => Promise<void>;
}

/** What the local run did, per stock, naming this computer's route. */
function localLines(outcome: PrintOutcome, reprint: boolean): string[] {
  const lines: string[] = [];
  for (const stock of PRINT_STOCKS) {
    const route = outcome.routes[stock];
    const n = outcome.printed.filter((doc) => doc.stock === stock).length;
    if (!route || n === 0) continue;
    lines.push(
      route.channel === 'BROWSER_DIALOG'
        ? `${stockCount(n, stock)} → print dialog`
        : `${reprint ? 'Reprinted' : 'Printed'} ${stockCount(n, stock)} · ${CHANNEL_FACE[route.channel]}${route.printerName ? ` · ${route.printerName}` : ''}`,
    );
  }
  const first = outcome.failed[0];
  if (first) lines.push(`${outcome.failed.length} failed — ${first.doc.title}: ${first.reason}`);
  if (outcome.logError) lines.push(`not logged: ${outcome.logError}`);
  return lines;
}

export function useDeskPress(stations: PrintStations, refreshRoutes: () => void): DeskPress {
  const queryClient = useQueryClient();
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [notice, setNotice] = useState('');

  const refresh = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: LABEL_PRINTS_QUERY_ROOT }),
      queryClient.invalidateQueries({ queryKey: LABEL_BATCHES_QUERY_ROOT }),
      // The ingestion ledger AND every label's print log (`['v1', 'label-ingestions', id, 'prints']`).
      queryClient.invalidateQueries({ queryKey: LABEL_INGESTIONS_QUERY_KEY }),
    ]);
  }, [queryClient]);

  const print = useMutation<string[], Error, PressInput>({
    mutationFn: async ({ documents, reprint, confirm }) => {
      if (confirm) {
        const go = await requestConfirm({ title: 'Print again?', description: confirm, confirmLabel: 'Print again', cancelLabel: 'Cancel' });
        if (!go) return ['Nothing printed — reprint cancelled.'];
      }
      const plan = planPress(documents, stations.target, stations.blockedReason, MAX_STATION_DOCUMENTS);
      const total = plan.local.length + plan.remote.reduce((sum, job) => sum + job.documents.length, 0);
      let before = 0;
      const tick = (done: number) => setProgress({ done: before + done, total });
      setProgress({ done: 0, total });
      const lines: string[] = [];
      try {
        if (plan.local.length > 0) {
          const here = readPrintStation();
          const outcome = await printDocuments(plan.local, currentPrintRoute, {
            onProgress: (done) => tick(done),
            station: here.id ? { id: here.id, name: here.name } : null,
          });
          lines.push(...localLines(outcome, reprint));
          before += plan.local.length;
        }
        for (const job of plan.remote) {
          const refs = job.documents.flatMap((doc) => stationDocumentRef(doc) ?? []);
          const acked = await stations.sendDocuments(job.station.stationId, job.stock, safeRandomUUID(), refs, (done) => tick(done));
          lines.push(
            acked
              ? `${stockCount(job.documents.length, job.stock)} → ${job.station.stationName}`
              : `${job.station.stationName} did not answer — ${stockCount(job.documents.length, job.stock)} not sent`,
          );
          before += job.documents.length;
        }
        for (const block of plan.blocked) lines.push(`${stockCount(block.count, block.stock)} not sent — ${block.reason}`);
      } finally {
        refreshRoutes();
      }
      return lines;
    },
    onSuccess: (lines) => setNotice(lines.join(' · ') || 'Nothing printed.'),
    onError: (error) => setNotice(error.message || 'Printing failed.'),
    onSettled: async () => {
      setProgress(null);
      await refresh();
    },
  });

  return { print, progress, notice, setNotice, refresh };
}
