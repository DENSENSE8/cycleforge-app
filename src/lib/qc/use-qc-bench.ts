'use client';

/**
 * React hooks over the QC bench client (`bench-client.ts`) — the one data layer behind both bench
 * faces: the `/test` Units display (desktop) and the phone runner `/m/u/[id]/qc`. Each face paints
 * its own rows; the reads, verbs, polling and cache keys live here so the two cannot drift.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import { qk } from '@/queries/keys';
import type {
  DiagnosticReading,
  DiagnosticReadingsWrite,
  QcSession,
  QcSessionOutcome,
  QcSessionWrite,
} from '@/lib/qc/contracts';
import type { TriageNext } from '@/lib/qc/triage/contracts';
import {
  QcBenchError,
  endQcSession,
  fetchQcCodes,
  fetchQcProcedures,
  fetchQcReadings,
  fetchQcSessions,
  fetchTriageNext,
  postTriageDecision,
  procedureVersionLabel,
  recordManualReading,
  startQcSession,
  type ManualReadingDraft,
} from './bench-client';

/** Readings refresh cadence while the caller has a session open on the unit (the hub posts as it probes). */
const READINGS_POLL_MS = 4000;

/** A 4xx (no permission, unit gone) will not change on retry. */
const retryServerErrors = (count: number, err: unknown) =>
  !(err instanceof QcBenchError && err.status < 500) && count < 2;

/** One unit's bench as both faces read it. */
export interface QcBench {
  /** Every session on the unit, newest first. */
  sessions: QcSession[];
  /** The caller's open session on the unit, if any. */
  open: QcSession | null;
  /** Server-minus-client clock offset, measured when the sessions read landed. */
  offsetMs: number;
  sessionsLoading: boolean;
  sessionsError: unknown;
  /** Newest read first. */
  readings: DiagnosticReading[];
  readingsLoading: boolean;
  readingsError: unknown;
  start: UseMutationResult<QcSessionWrite, Error, 'TEST' | 'REPAIR'>;
  end: UseMutationResult<QcSessionWrite, Error, { sessionId: number; outcome: QcSessionOutcome | null }>;
  addReading: UseMutationResult<DiagnosticReadingsWrite, Error, ManualReadingDraft>;
}

/**
 * One unit's bench: its sessions (and the caller's open one), its readings — polled while a session
 * is open — and the Start / End / manual-reading verbs. `unitId` null holds every read.
 */
export function useQcBench(unitId: number | null): QcBench {
  const queryClient = useQueryClient();
  const id = unitId ?? 0;

  const sessions = useQuery({
    queryKey: qk.qc.unit(id, 'sessions'),
    enabled: unitId != null,
    queryFn: async ({ signal }) => {
      const data = await fetchQcSessions(id, signal);
      const server = Date.parse(data.serverNow);
      // Measured at receipt, so a cached copy keeps the offset it was read with.
      return { ...data, offsetMs: Number.isFinite(server) ? server - Date.now() : 0 };
    },
    retry: retryServerErrors,
    refetchOnWindowFocus: false,
  });
  const open = sessions.data?.open ?? null;

  const readings = useQuery({
    queryKey: qk.qc.unit(id, 'readings'),
    enabled: unitId != null,
    queryFn: ({ signal }) => fetchQcReadings(id, signal),
    refetchInterval: open ? READINGS_POLL_MS : false,
    retry: retryServerErrors,
    refetchOnWindowFocus: false,
  });

  const invalidate = useCallback(
    (facet: 'sessions' | 'readings') => queryClient.invalidateQueries({ queryKey: qk.qc.unit(id, facet) }),
    [queryClient, id],
  );

  const start = useMutation({
    mutationFn: (kind: 'TEST' | 'REPAIR') => startQcSession(id, kind),
    onSuccess: () => invalidate('sessions'),
  });
  const end = useMutation({
    mutationFn: (args: { sessionId: number; outcome: QcSessionOutcome | null }) =>
      endQcSession(args.sessionId, args.outcome),
    onSuccess: () => Promise.all([invalidate('sessions'), invalidate('readings')]),
  });
  const addReading = useMutation({
    mutationFn: (draft: ManualReadingDraft) => recordManualReading(id, open?.id ?? null, draft),
    onSuccess: () => invalidate('readings'),
  });

  return {
    sessions: sessions.data?.sessions ?? [],
    open,
    offsetMs: sessions.data?.offsetMs ?? 0,
    sessionsLoading: sessions.isPending && unitId != null,
    sessionsError: sessions.error,
    readings: readings.data ?? [],
    readingsLoading: readings.isPending && unitId != null,
    readingsError: readings.error,
    start,
    end,
    addReading,
  };
}

/** Server-clock ms, re-rendering every second while `running` (the session timer face). */
export function useQcClock(running: boolean, offsetMs: number): number {
  const [now, setNow] = useState(() => Date.now() + offsetMs);
  useEffect(() => {
    setNow(Date.now() + offsetMs);
    if (!running) return;
    const t = window.setInterval(() => setNow(Date.now() + offsetMs), 1000);
    return () => window.clearInterval(t);
  }, [running, offsetMs]);
  return now;
}

/** The org's diagnostic code catalog — the manual reading entry's code suggestions. */
export function useQcCodes(enabled: boolean) {
  return useQuery({
    queryKey: qk.qc.codes,
    enabled,
    queryFn: ({ signal }) => fetchQcCodes(signal),
    staleTime: 5 * 60_000,
    retry: retryServerErrors,
    refetchOnWindowFocus: false,
  });
}

export type TriageDecision = 'ACCEPTED' | 'REJECTED';

/** Next steps for one unit, and the tech's answers on them. */
export interface QcTriage {
  /** The last `/api/qc/triage/next` answer; null until asked. */
  result: TriageNext | null;
  /** Decisions recorded on `result.steps`, by suggestion id. */
  decisions: Record<number, TriageDecision>;
  asking: boolean;
  askError: Error | null;
  ask: () => void;
  decide: (suggestionId: number, choice: TriageDecision) => void;
  /** The step a decision is in flight for, if any. */
  deciding: number | null;
  decideError: Error | null;
}

/**
 * Next steps for a unit: `ask()` posts `/api/qc/triage/next` (every call stores its suggestions, so
 * it runs on a press, never on mount); `decide()` records Accept / Reject against one step. The list
 * and the decisions made on it reset when the unit changes.
 */
export function useQcTriage(unitId: number | null, sessionId: number | null): QcTriage {
  const [result, setResult] = useState<TriageNext | null>(null);
  const [decisions, setDecisions] = useState<Record<number, TriageDecision>>({});

  useEffect(() => {
    setResult(null);
    setDecisions({});
  }, [unitId]);

  const next = useMutation({
    mutationFn: () => fetchTriageNext(unitId as number, sessionId),
    onSuccess: (data) => {
      setResult(data);
      setDecisions({});
    },
  });
  const decision = useMutation({
    mutationFn: (args: { suggestionId: number; decision: TriageDecision }) =>
      postTriageDecision(args.suggestionId, args.decision),
    onSuccess: (data) => setDecisions((m) => ({ ...m, [data.suggestionId]: data.decision })),
  });

  return {
    result,
    decisions,
    asking: next.isPending,
    askError: next.error,
    ask: () => {
      if (unitId != null) next.mutate();
    },
    decide: (suggestionId: number, choice: TriageDecision) => decision.mutate({ suggestionId, decision: choice }),
    deciding: decision.isPending ? (decision.variables?.suggestionId ?? null) : null,
    decideError: decision.error,
  };
}

/**
 * The procedure-version line beside a unit's checklist: the version(s) its recorded answers ran on
 * (`recordedIds`, from the checklist GET's `procedure_version_id`), else the SKU's current one.
 */
export function useQcProcedureVersion(skuCatalogId: number | null, recordedIds: readonly number[]): string | null {
  const procedures = useQuery({
    queryKey: qk.qc.procedures(skuCatalogId ?? 0),
    enabled: skuCatalogId != null,
    queryFn: ({ signal }) => fetchQcProcedures(skuCatalogId as number, signal),
    retry: retryServerErrors,
    refetchOnWindowFocus: false,
  });
  const key = recordedIds.join(',');
  return useMemo(
    () => (skuCatalogId == null ? null : procedureVersionLabel(recordedIds, procedures.data ?? null)),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` is recordedIds' identity
    [skuCatalogId, key, procedures.data],
  );
}
