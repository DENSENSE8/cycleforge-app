'use client';

/** Backfill sync — the manual trigger for the Zoho purchase-receive push, and the one place the push backlog is visible. */

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from '@/lib/toast';
import { Button } from '@/design-system/primitives/Button';
import { ProgressBar } from '@/design-system/primitives/ProgressBar';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { Upload } from '@/components/Icons';

interface Backlog {
  pending: number;
  purchaseOrders: number;
  blocked: number;
  oldestAt: string | null;
  lastError: string | null;
}

interface RunReport {
  posted?: number;
  noop?: number;
  failed?: number;
  lines?: number;
  settledFromMirror?: number;
  pendingAfter?: number;
  notConnected?: boolean;
  error?: string;
}

/** Backlog poll while a run is in flight — fast enough to read as motion. */
const POLL_MS = 1500;

function describeAge(iso: string | null): string | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export function ZohoReceiveBackfillControl() {
  const [backlog, setBacklog] = useState<Backlog | null>(null);
  const [running, setRunning] = useState(false);
  /** Backlog depth when this run started — the progress denominator. */
  const [runGoal, setRunGoal] = useState(0);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const readBacklog = useCallback(async (): Promise<Backlog | null> => {
    try {
      const res = await fetch('/api/zoho/receive-backfill');
      if (!res.ok) return null;
      const data = (await res.json()) as Partial<Backlog> & { success?: boolean };
      if (!data.success) return null;
      const next: Backlog = {
        pending: Number(data.pending ?? 0),
        purchaseOrders: Number(data.purchaseOrders ?? 0),
        blocked: Number(data.blocked ?? 0),
        oldestAt: data.oldestAt ?? null,
        lastError: data.lastError ?? null,
      };
      if (alive.current) setBacklog(next);
      return next;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    void readBacklog();
  }, [readBacklog]);

  // Poll only while a run is in flight. An idle card has no reason to hold a
  // timer open against a number that only this button changes.
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => void readBacklog(), POLL_MS);
    return () => window.clearInterval(id);
  }, [running, readBacklog]);

  const runBackfill = useCallback(async () => {
    setRunning(true);
    setRunGoal((await readBacklog())?.pending ?? backlog?.pending ?? 0);
    try {
      const res = await fetch('/api/zoho/receive-backfill', { method: 'POST' });
      const data = (await res.json().catch(() => ({}))) as RunReport & { success?: boolean };
      const after = await readBacklog();

      if (!res.ok || !data.success) {
        toast.error(`Backfill failed: ${data.error || `HTTP ${res.status}`}`);
        return;
      }

      // `lines` is the live-push half; `settledFromMirror` is the half settled
      // from the local PO mirror with no call out. The operator cares that the
      // backlog moved, not which half moved it.
      const lines = Number(data.lines ?? 0) + Number(data.settledFromMirror ?? 0);
      const failed = Number(data.failed ?? 0);
      const remaining = after?.pending ?? Number(data.pendingAfter ?? 0);
      const moved = `Backfilled ${lines.toLocaleString()} line${lines === 1 ? '' : 's'}`;

      if (data.notConnected) {
        // Not a PO problem and not a retry: nothing was attempted, so say the
        // one thing that fixes it.
        toast.error(
          `${lines > 0 ? `${moved}, then stopped: ` : ''}Zoho isn't connected. ` +
            `Reconnect it above — ${remaining.toLocaleString()} still pending.`,
        );
      } else if (lines === 0 && failed === 0) {
        toast.success('Zoho is already current — nothing to back fill.');
      } else if (failed > 0) {
        toast.error(
          `${moved}; ${failed} purchase order${failed === 1 ? '' : 's'} failed. ` +
            `${remaining.toLocaleString()} still pending.`,
        );
      } else {
        toast.success(
          `${moved} into Zoho${remaining > 0 ? ` — ${remaining.toLocaleString()} still pending` : ''}.`,
        );
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Backfill failed');
    } finally {
      if (alive.current) setRunning(false);
    }
  }, [backlog?.pending, readBacklog]);

  const pending = backlog?.pending ?? 0;
  const done = Math.max(0, runGoal - pending);
  const age = describeAge(backlog?.oldestAt ?? null);

  const tooltip = running
    ? `Pushing ${runGoal} pending line${runGoal === 1 ? '' : 's'} into Zoho.`
    : pending === 0
      ? 'Zoho holds every locally-received line. Runs automatically every 5 minutes.'
      : [
          `${pending} line${pending === 1 ? '' : 's'} across ${backlog?.purchaseOrders ?? 0} purchase order${
            (backlog?.purchaseOrders ?? 0) === 1 ? '' : 's'
          } received locally but not yet in Zoho.`,
          age ? `Oldest waiting ${age}.` : null,
          backlog?.blocked ? `${backlog.blocked} need a human — ${backlog.lastError ?? 'see the PO in Zoho'}.` : null,
        ]
          .filter(Boolean)
          .join(' ');
  return (
    <div className="flex min-w-0 items-center gap-2">
      <HoverTooltip label={tooltip} asChild>
        <Button
          variant="secondary"
          size="sm"
          icon={<Upload />}
          loading={running}
          onClick={() => void runBackfill()}
          ariaLabel="Back fill locally-received lines into Zoho"
          data-testid="zoho-receive-backfill"
        >
          {pending > 0 ? `Backfill · ${pending}` : 'Backfill'}
        </Button>
      </HoverTooltip>

      {running && runGoal > 0 ? (
        <ProgressBar
          current={done}
          goal={runGoal}
          showRemaining={false}
          variant="success"
          className="w-28 shrink-0"
        />
      ) : backlog?.blocked ? (
        // Blocked lines are the one backlog state a retry cannot clear, so they
        // get the only always-on words on this row.
        <span className="text-role-micro text-red-600">{backlog.blocked} blocked</span>
      ) : null}
    </div>
  );
}
