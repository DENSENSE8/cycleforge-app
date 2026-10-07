import { refreshDomain } from '@/lib/refresh/bus';

/**
 * Stamp this operator's QC recents for a line opened in the Testing workspace.
 * Fire-and-forget — a failure never blocks the panel. Isolated from Unbox
 * `receiving_line_views` (`/api/receiving-lines/view`).
 */
export function recordTestingLineOpen(lineId: number, receivingId?: number | null): void {
  if (!(lineId > 0)) return;
  void fetch('/api/qc/receiving-lines/open', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      receiving_line_id: lineId,
      receiving_id: receivingId ?? null,
    }),
  })
    .then((res) => {
      if (res.ok) refreshDomain('testing.lines');
    })
    .catch(() => {});
}
