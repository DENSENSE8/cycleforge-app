'use client';

/**
 * The transcript face of a chat print (`chat-print-job.ts`): tote labels from
 * `print_handling_unit_labels`, order papers from `print_order_paperwork`.
 * Both print on the staffer's print station over the staff print bridge — the
 * roster, pick, ack and progress every other sender uses
 * (`useStaffPrintBridgeClient`). Which station is `decideStaffPrintAutoSend`:
 * a remembered pick that stays silent is never swapped for another computer.
 * The station writes the ledger rows (`label_print_jobs` for totes,
 * `document_print_jobs` for papers); a papers print reads its batch's rows
 * back before it says "recorded".
 */

import { useEffect, useState, type ReactNode } from 'react';
import { AlertTriangle, Check, Loader2, Printer, RotateCcw } from '@/components/Icons';
import { StaffPrintStationPicker } from '@/components/ui/StaffPrintStationPicker';
import { Button } from '@/design-system/primitives';
import { ModeRegion } from '@/design-system/providers/ModeRegion';
import { useStaffPrintBridgeClient } from '@/hooks/useStaffPrintBridgeClient';
import { DEFAULT_TOTE_COPIES_PER_SIDE } from '@/lib/print/labelCopies';
import { decideStaffPrintAutoSend, type StaffPrintJobBody } from '@/lib/print/staff-print-bridge';
import {
  chatPrintRole,
  chatPrintTitle,
  chatPrintUnits,
  type ChatPrintJob,
  type ChatPrintRequest,
} from '@/lib/assistant/chat-print-job';
import { cn } from '@/utils/_cn';
import type { AssistantChatState } from '@/components/assistant/useAssistantChat';

/** How long every station gets to answer the roster poll before the card decides. */
const ROSTER_WAIT_MS = 3_000;

/** How long an acked job may go without a progress report before the card calls it failed. */
const PRINT_REPORT_TIMEOUT_MS = 30_000;

type SetPrintPhase = AssistantChatState['setPrintPhase'];

/** The bridge job a request sends; papers key their ledger rows by the card's job id. */
function jobBody(job: ChatPrintJob): StaffPrintJobBody {
  const r = job.request;
  if (r.kind === 'papers') {
    return {
      grain: 'papers',
      role: 'paper',
      papers: {
        orderRowIds: r.orders.map((o) => o.orderRowId),
        packerLogId: null,
        reprint: r.reprint,
        documents: r.documents,
        batchId: job.id,
      },
    };
  }
  return {
    grain: 'tote',
    role: 'label',
    tote:
      r.kind === 'tote_new'
        ? { count: r.count, copiesPerSide: DEFAULT_TOTE_COPIES_PER_SIDE }
        : { codes: r.codes, copiesPerSide: DEFAULT_TOTE_COPIES_PER_SIDE },
  };
}

export function ChatPrintJobCard({ job, setPhase }: { job: ChatPrintJob; setPhase: SetPrintPhase }) {
  const { phase } = job;
  if (phase.kind === 'confirm') return <ConfirmPrintJob job={job} setPhase={setPhase} />;
  const settled =
    phase.kind === 'failed' ||
    phase.kind === 'cancelled' ||
    phase.kind === 'recorded' ||
    (phase.kind === 'printed' && job.request.kind !== 'papers');
  if (settled) return <SettledPrintJob job={job} setPhase={setPhase} />;
  return <LivePrintJob job={job} setPhase={setPhase} />;
}

function CardShell({
  job,
  tone = 'neutral',
  children,
}: {
  job: ChatPrintJob;
  tone?: 'neutral' | 'success' | 'danger';
  children: ReactNode;
}) {
  return (
    <div
      data-chat-print={job.phase.kind}
      className={cn(
        'flex flex-col gap-2 rounded-lg border px-3 py-2',
        tone === 'success' && 'border-border-success bg-surface-success',
        tone === 'danger' && 'border-border-danger bg-surface-danger',
        tone === 'neutral' && 'border-border-soft bg-surface-sunken',
      )}
    >
      <p className="text-role-micro font-semibold uppercase tracking-wide text-text-muted">{chatPrintTitle(job.request)}</p>
      {job.request.kind === 'papers' ? <PaperOrders request={job.request} /> : null}
      {children}
    </div>
  );
}

function PaperOrders({ request }: { request: Extract<ChatPrintRequest, { kind: 'papers' }> }) {
  return (
    <ul className="flex flex-col gap-0.5 text-role-caption text-text-default">
      {request.orders.map((o) => (
        <li key={o.orderRowId} className="flex gap-2">
          <span className="font-semibold">Order {o.orderNumber}</span>
          <span className="min-w-0 truncate text-text-muted">{o.papers}</span>
        </li>
      ))}
    </ul>
  );
}

function StatusLine({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <p className="flex items-center gap-2 text-role-caption font-medium text-text-default" role="status">
      {icon}
      <span className="min-w-0">{children}</span>
    </p>
  );
}

/** A big new-tote run: nothing is minted or printed until the operator taps. */
function ConfirmPrintJob({ job, setPhase }: { job: ChatPrintJob; setPhase: SetPrintPhase }) {
  const count = job.request.kind === 'tote_new' ? job.request.count : 0;
  return (
    <CardShell job={job}>
      <StatusLine icon={<Printer className="h-4 w-4 shrink-0 text-text-muted" />}>
        Print {count} new tote labels? Each one creates a new tote.
      </StatusLine>
      <div className="flex gap-2">
        <Button variant="primary" size="sm" onClick={() => setPhase(job.id, { kind: 'finding' }, ['confirm'])}>
          Print {count} labels
        </Button>
        <Button variant="secondary" size="sm" onClick={() => setPhase(job.id, { kind: 'cancelled' }, ['confirm'])}>
          Cancel
        </Button>
      </div>
    </CardShell>
  );
}

function SettledPrintJob({ job, setPhase }: { job: ChatPrintJob; setPhase: SetPrintPhase }) {
  const { phase } = job;
  const ok = <Check className="h-4 w-4 shrink-0 text-text-success" />;
  if (phase.kind === 'printed') {
    return (
      <CardShell job={job} tone="success">
        <StatusLine icon={ok}>
          Printed {chatPrintUnits(job.request, phase.count)} on {phase.station}.
        </StatusLine>
      </CardShell>
    );
  }
  if (phase.kind === 'recorded') {
    return (
      <CardShell job={job} tone={phase.missing.length > 0 ? 'danger' : 'success'}>
        <StatusLine icon={ok}>
          Printed {chatPrintUnits(job.request, phase.count)} on {phase.station} · {phase.rows}{' '}
          {phase.rows === 1 ? 'print' : 'prints'} recorded
          {job.request.kind === 'papers' && job.request.reprint ? (phase.rows === 1 ? ' as a reprint' : ' as reprints') : ''}.
        </StatusLine>
        {phase.missing.length > 0 ? (
          <StatusLine icon={<AlertTriangle className="h-4 w-4 shrink-0 text-text-danger" />}>
            Nothing recorded for order {phase.missing.join(', ')} — check the papers on file.
          </StatusLine>
        ) : null}
      </CardShell>
    );
  }
  if (phase.kind === 'cancelled') {
    return (
      <CardShell job={job}>
        <StatusLine icon={<Printer className="h-4 w-4 shrink-0 text-text-muted" />}>Cancelled — nothing printed.</StatusLine>
      </CardShell>
    );
  }
  if (phase.kind !== 'failed') return null;
  return (
    <CardShell job={job} tone="danger">
      <StatusLine icon={<AlertTriangle className="h-4 w-4 shrink-0 text-text-danger" />}>{phase.reason}</StatusLine>
      <div>
        <Button variant="secondary" size="sm" onClick={() => setPhase(job.id, { kind: 'finding' }, ['failed'])}>
          <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Retry
        </Button>
      </div>
    </CardShell>
  );
}

function LivePrintJob({ job, setPhase }: { job: ChatPrintJob; setPhase: SetPrintPhase }) {
  const { phase, request } = job;
  const role = chatPrintRole(request);
  const choosing = phase.kind === 'finding' || phase.kind === 'pick';
  const bridge = useStaffPrintBridgeClient({ active: choosing });
  const { stations, target, rememberedId, now, progress, sendJob, pickStation } = bridge;
  const [waited, setWaited] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setWaited(true), ROSTER_WAIT_MS);
    return () => window.clearTimeout(timer);
  }, []);

  const decision = decideStaffPrintAutoSend({ stations, rememberedId, role, now, settled: waited });
  const sendTo = decision.kind === 'send' ? decision.station.status.stationName : null;
  const reason = decision.kind === 'pick' || decision.kind === 'fail' ? decision.reason : null;

  // Choose the station, then send once: the move to `sending` is the claim.
  useEffect(() => {
    if (!choosing) return;
    if (sendTo) {
      if (!setPhase(job.id, { kind: 'sending', station: sendTo }, ['finding', 'pick'])) return;
      void sendJob(jobBody(job)).then((acked) =>
        setPhase(
          job.id,
          acked
            ? { kind: 'acked', station: sendTo, done: 0, total: 0 }
            : { kind: 'failed', reason: `${sendTo} didn't answer. Check CycleForge is open there, then retry.` },
          ['sending'],
        ),
      );
      return;
    }
    if (phase.kind !== 'finding' || !reason) return;
    setPhase(job.id, decision.kind === 'fail' ? { kind: 'failed', reason } : { kind: 'pick', reason }, ['finding']);
  }, [choosing, sendTo, reason, decision.kind, phase.kind, job, setPhase, sendJob]);

  // The station reports each plate (or each order's papers); the last one is the print done.
  useEffect(() => {
    if (phase.kind !== 'acked' || !progress || progress.total <= 0) return;
    if (progress.done === phase.done && progress.total === phase.total) return;
    setPhase(
      job.id,
      progress.done >= progress.total
        ? { kind: 'printed', station: phase.station, count: progress.total }
        : { kind: 'acked', station: phase.station, done: progress.done, total: progress.total },
      ['acked'],
    );
  }, [phase, progress, job.id, setPhase]);

  // Papers: "printed" is the station's word; "recorded" is the ledger's — read
  // back the rows this batch wrote.
  useEffect(() => {
    if (phase.kind !== 'printed' || request.kind !== 'papers') return;
    let live = true;
    void fetch(`/api/orders/print-packet?batch=${encodeURIComponent(job.id)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        return ((await res.json()) as { rows?: Array<{ orderId: number }> }).rows ?? [];
      })
      .then((rows) => {
        if (!live) return;
        const missing = request.orders.filter((o) => !rows.some((r) => r.orderId === o.orderRowId)).map((o) => o.orderNumber);
        setPhase(
          job.id,
          rows.length > 0
            ? { kind: 'recorded', station: phase.station, count: phase.count, rows: rows.length, missing }
            : { kind: 'failed', reason: `${phase.station} finished, but no print was recorded. Check the papers on file, then retry.` },
          ['printed'],
        );
      })
      .catch(() => {
        if (live) setPhase(job.id, { kind: 'failed', reason: `Printed on ${phase.station}, but the print log could not be read.` }, ['printed']);
      });
    return () => {
      live = false;
    };
  }, [phase, request, job.id, setPhase]);

  // A station that took the job but goes quiet (printer error, tab closed)
  // must not leave the card spinning. Each tick restarts the wait.
  useEffect(() => {
    if (phase.kind !== 'acked') return;
    const timer = window.setTimeout(
      () =>
        setPhase(
          job.id,
          { kind: 'failed', reason: `${phase.station} took the job but never reported it printed. Check the printer there.` },
          ['acked'],
        ),
      PRINT_REPORT_TIMEOUT_MS,
    );
    return () => window.clearTimeout(timer);
  }, [phase, job.id, setPhase]);

  const spinner = <Loader2 className="h-4 w-4 shrink-0 animate-spin text-text-muted" />;

  if (phase.kind === 'sending') {
    return (
      <CardShell job={job}>
        <StatusLine icon={spinner}>Sending to {phase.station}…</StatusLine>
      </CardShell>
    );
  }
  if (phase.kind === 'acked') {
    return (
      <CardShell job={job}>
        <StatusLine icon={spinner}>
          Acked by {phase.station} — printing
          {phase.total > 0 ? ` ${phase.done}/${chatPrintUnits(request, phase.total)}` : '…'}
        </StatusLine>
      </CardShell>
    );
  }
  if (phase.kind === 'printed') {
    return (
      <CardShell job={job}>
        <StatusLine icon={spinner}>
          Printed {chatPrintUnits(request, phase.count)} on {phase.station} — checking the print log…
        </StatusLine>
      </CardShell>
    );
  }
  if (phase.kind === 'pick') {
    return (
      <CardShell job={job}>
        <StatusLine icon={<Printer className="h-4 w-4 shrink-0 text-text-muted" />}>{reason ?? phase.reason}</StatusLine>
        <ModeRegion mode="triage" className="overflow-hidden rounded-md">
          <StaffPrintStationPicker stations={stations} target={target} now={now} role={role} onPick={pickStation} />
        </ModeRegion>
      </CardShell>
    );
  }
  return (
    <CardShell job={job}>
      <StatusLine icon={spinner}>Finding your print station…</StatusLine>
    </CardShell>
  );
}
