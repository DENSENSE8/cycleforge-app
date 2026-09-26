'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  benchRowMeta,
  serverClockOffsetMs,
  summarizeBenchSessions,
  type RepairBenchSessionsResponse,
} from '@/lib/repair/bench-session';
import { qk } from '@/queries/keys';
import { fetchRepairJson, useRepairActions, validRepairId } from './useRepairWorkbench';

/** The repair's bench timer, read from the server on mount (so a reload or a second phone picks up the running session) and written only… */
export function useRepairBenchSession(repairId: number) {
  const [busy, setBusy] = useState(false);
  const [writeError, setWriteError] = useState<string | null>(null);
  const offsetRef = useRef(0);

  const query = useQuery({
    queryKey: qk.repairs.workbench(repairId, 'bench'),
    queryFn: async ({ signal }) => {
      const body = await fetchRepairJson<Partial<RepairBenchSessionsResponse>>(
        `/api/repair/bench-sessions?repairId=${repairId}`,
        signal,
      );
      return {
        sessions: Array.isArray(body.sessions) ? body.sessions : [],
        open: body.open ?? null,
        // Measured at receipt, so a cached copy keeps the offset it was read with.
        offsetMs: serverClockOffsetMs(body.serverNow ?? '', Date.now()),
      };
    },
    enabled: validRepairId(repairId),
  });

  useEffect(() => {
    if (query.data) offsetRef.current = query.data.offsetMs;
  }, [query.data]);

  const { refetch } = query;
  const reload = useCallback(async () => {
    await refetch();
  }, [refetch]);

  const write = useCallback(
    async (action: 'start' | 'stop') => {
      if (busy) return;
      setBusy(true);
      setWriteError(null);
      try {
        const res = await fetch('/api/repair/bench-sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ repairId, action }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok || !body?.success) throw new Error(body?.error || `HTTP ${res.status}`);
        offsetRef.current = serverClockOffsetMs(body.serverNow ?? '', Date.now());
        await reload();
      } catch (err) {
        setWriteError(err instanceof Error ? err.message : 'Timer update failed');
      } finally {
        setBusy(false);
      }
    },
    [busy, reload, repairId],
  );

  const serverNowMs = useCallback(() => Date.now() + offsetRef.current, []);

  return {
    sessions: query.data?.sessions ?? [],
    open: query.data?.open ?? null,
    loading: query.isPending,
    busy,
    error: writeError ?? (query.error ? (query.error as Error).message || 'Could not load the bench timer' : null),
    reload,
    start: () => write('start'),
    stop: () => write('stop'),
    serverNowMs,
  };
}

/** Re-render every second while `running`, returning the current server-clock ms. */
export function useBenchTick(running: boolean, serverNowMs: () => number): number {
  const [now, setNow] = useState(serverNowMs);
  useEffect(() => {
    setNow(serverNowMs());
    if (!running) return;
    const t = window.setInterval(() => setNow(serverNowMs()), 1000);
    return () => window.clearInterval(t);
  }, [running, serverNowMs]);
  return now;
}

/**
 * Hub row contract for the bench log (`DetailNavRow` meta): live timer state,
 * total bench time, and how many entries are logged. Always openable — the
 * bench log is where a timer is started.
 */
export function useRepairBenchRow(repairId: number): { meta: string; enabled: boolean } {
  const bench = useRepairBenchSession(repairId);
  const { actions, loading: actionsLoading, error: actionsError } = useRepairActions(repairId);
  const now = useBenchTick(bench.open != null, bench.serverNowMs);

  if (bench.loading || actionsLoading) return { meta: 'Loading…', enabled: true };
  if (bench.error && actionsError) return { meta: 'Bench log unavailable — open to retry', enabled: true };
  const summary = summarizeBenchSessions(bench.sessions, now);
  return {
    meta: benchRowMeta({ open: bench.open, summary, actionCount: actions.length, serverNowMs: now }),
    enabled: true,
  };
}

