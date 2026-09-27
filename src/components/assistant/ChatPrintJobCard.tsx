'use client';

/**
 * The transcript face of a `print_handling_unit_labels` call. The labels print
 * on the staffer's print station over the staff print bridge — the roster,
 * pick, ack and progress every other sender uses (`useStaffPrintBridgeClient`).
 * The station prints them and writes the `label_print_jobs` rows. Which
 * station is `decideStaffPrintAutoSend`: a remembered pick that stays silent is
 * never swapped for another computer.
 */

import { useEffect, useState, type ReactNode } from 'react';
import { AlertTriangle, Check, Loader2, Printer, RotateCcw } from '@/components/Icons';
import { StaffPrintStationPicker } from '@/components/ui/StaffPrintStationPicker';
import { Button } from '@/design-system/primitives';
import { ModeRegion } from '@/design-system/providers/ModeRegion';
import { useStaffPrintBridgeClient } from '@/hooks/useStaffPrintBridgeClient';
import { DEFAULT_TOTE_COPIES_PER_SIDE } from '@/lib/print/labelCopies';
import { decideStaffPrintAutoSend } from '@/lib/print/staff-print-bridge';
import { cn } from '@/utils/_cn';
import type { AssistantChatState, AssistantPrintJob } from '@/components/assistant/useAssistantChat';

/** How long every station gets to answer the roster poll before the card decides. */
const ROSTER_WAIT_MS = 3_000;

/** How long an acked job may go without a progress report before the card calls it failed. */
const PRINT_REPORT_TIMEOUT_MS = 30_000;

type SetPrintPhase = AssistantChatState['setPrintPhase'];

function plural(n: number): string {
  return `${n} label${n === 1 ? '' : 's'}`;
}

export function ChatPrintJobCard({ job, setPhase }: { job: AssistantPrintJob; setPhase: SetPrintPhase }) {
  const { phase } = job;
  if (phase.kind === 'printed' || phase.kind === 'failed') return <SettledPrintJob job={job} setPhase={setPhase} />;
  return <LivePrintJob job={job} setPhase={setPhase} />;
}

function CardShell({
  job,
  tone = 'neutral',
  children,
}: {
  job: AssistantPrintJob;
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
      <p className="text-role-micro font-semibold uppercase tracking-wide text-text-muted">
        Label print · {job.codes.join(', ')}
      </p>
      {children}
    </div>
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

function SettledPrintJob({ job, setPhase }: { job: AssistantPrintJob; setPhase: SetPrintPhase }) {
  const { phase } = job;
  if (phase.kind === 'printed') {
    return (
      <CardShell job={job} tone="success">
        <StatusLine icon={<Check className="h-4 w-4 shrink-0 text-text-success" />}>
          Printed {plural(phase.labels)} on {phase.station}.
        </StatusLine>
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

function LivePrintJob({ job, setPhase }: { job: AssistantPrintJob; setPhase: SetPrintPhase }) {
  const { phase } = job;
  const choosing = phase.kind === 'finding' || phase.kind === 'pick';
  const bridge = useStaffPrintBridgeClient({ active: choosing });
  const { stations, target, rememberedId, now, progress, sendJob, pickStation } = bridge;
  const [waited, setWaited] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setWaited(true), ROSTER_WAIT_MS);
    return () => window.clearTimeout(timer);
  }, []);

  const decision = decideStaffPrintAutoSend({ stations, rememberedId, role: 'label', now, settled: waited });
  const sendTo = decision.kind === 'send' ? decision.station.status.stationName : null;
  const reason = decision.kind === 'pick' || decision.kind === 'fail' ? decision.reason : null;

  // Choose the station, then send once: the move to `sending` is the claim.
  useEffect(() => {
    if (!choosing) return;
    if (sendTo) {
      if (!setPhase(job.id, { kind: 'sending', station: sendTo }, ['finding', 'pick'])) return;
      void sendJob({
        grain: 'tote',
        role: 'label',
        tote: { codes: job.codes, copiesPerSide: DEFAULT_TOTE_COPIES_PER_SIDE },
      }).then((acked) =>
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
  }, [choosing, sendTo, reason, decision.kind, phase.kind, job.id, job.codes, setPhase, sendJob]);

  // The station reports each plate; the last one is the print done.
  useEffect(() => {
    if (phase.kind !== 'acked' || !progress || progress.total <= 0) return;
    if (progress.done === phase.done && progress.total === phase.total) return;
    setPhase(
      job.id,
      progress.done >= progress.total
        ? { kind: 'printed', station: phase.station, labels: progress.total }
        : { kind: 'acked', station: phase.station, done: progress.done, total: progress.total },
      ['acked'],
    );
  }, [phase, progress, job.id, setPhase]);

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
          Acked by {phase.station} — printing{phase.total > 0 ? ` ${phase.done}/${phase.total}` : '…'}
        </StatusLine>
      </CardShell>
    );
  }
  if (phase.kind === 'pick') {
    return (
      <CardShell job={job}>
        <StatusLine icon={<Printer className="h-4 w-4 shrink-0 text-text-muted" />}>
          {reason ?? phase.reason}
        </StatusLine>
        <ModeRegion mode="triage" className="overflow-hidden rounded-md">
          <StaffPrintStationPicker stations={stations} target={target} now={now} role="label" onPick={pickStation} />
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
