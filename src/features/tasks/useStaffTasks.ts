'use client';

/**
 * Data + writes for the My Tasks workbench — every station list at once.
 *
 * Reads `staffTodosQuery(staffId, 'ALL')` (and its archived twin) rather than
 * five per-station queries: the triage surface's whole point is that you do not
 * pick a station first. The header chip keeps its per-station read; both are
 * keyed under `['staff-todos', staffId, …]`, so **every write here invalidates
 * that prefix** — a rename made in the workbench must not leave the chip showing
 * the old name until its 5-minute staleTime elapses.
 *
 * Mutations reuse the same typed fetchers the chip uses. There is one API and
 * one set of helpers; a second copy of "how to delete a todo" is exactly the
 * fork this port exists to remove.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  staffTodosQuery,
  staffTodosArchivedQuery,
  createStaffTodoApi,
  deleteStaffTodoApi,
  renameStaffTodoApi,
  restoreStaffTodoApi,
  setStaffTodoIntervalApi,
  toggleStaffTodoApi,
  type StaffTodoKind,
} from '@/lib/queries/staff-todos-queries';
import { buildStaffTaskRows, type StaffTaskRow } from './grid/staff-task-row';

/** Every station's list in one read — the station is a COLUMN here, not a mode. */
const ALL_STATIONS = 'ALL';

export function useStaffTasks(staffId: number | null) {
  const queryClient = useQueryClient();
  const enabled = !!staffId;

  // One clock for the whole table: recurring done-ness and the next reset are
  // both functions of `now`, so two columns computing it separately could
  // disagree inside one paint. Ticks on the same 30s cadence as the chip.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const live = useQuery({ ...staffTodosQuery(staffId ?? 0, ALL_STATIONS), enabled });
  const archived = useQuery({ ...staffTodosArchivedQuery(staffId ?? 0, ALL_STATIONS), enabled });

  const liveRows = useMemo(
    () => buildStaffTaskRows(live.data ?? [], nowMs),
    [live.data, nowMs],
  );
  const archivedRows = useMemo(
    () => buildStaffTaskRows(archived.data ?? [], nowMs),
    [archived.data, nowMs],
  );

  /** Both halves of this staffer's lists, wherever they are cached. */
  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['staff-todos', staffId ?? 0] });
  }, [queryClient, staffId]);

  const toggle = useMutation({
    mutationFn: ({ id, done }: { id: number; done: boolean }) => toggleStaffTodoApi(id, done),
    onSettled: refresh,
  });
  const rename = useMutation({
    mutationFn: ({ id, text }: { id: number; text: string }) => renameStaffTodoApi(id, text),
    onSettled: refresh,
  });
  const remove = useMutation({
    mutationFn: (id: number) => deleteStaffTodoApi(id),
    onSettled: refresh,
  });
  const restore = useMutation({
    mutationFn: (id: number) => restoreStaffTodoApi(id),
    onSettled: refresh,
  });
  const create = useMutation({
    mutationFn: (args: { station: string; kind: StaffTodoKind; text: string }) =>
      createStaffTodoApi(args),
    onSettled: refresh,
  });
  const setInterval = useMutation({
    mutationFn: ({ station, intervalMs }: { station: string; intervalMs: number }) =>
      setStaffTodoIntervalApi(station, intervalMs),
    onSettled: refresh,
  });

  const pending =
    toggle.isPending ||
    rename.isPending ||
    remove.isPending ||
    restore.isPending ||
    create.isPending ||
    setInterval.isPending;

  return {
    liveRows,
    archivedRows,
    /**
     * The clock every row on this table was resolved against. Exposed so the
     * row's compound view computes lateness from the SAME instant the done-ness
     * and reset stamps came from — two cells on one row must never disagree
     * about what time it is.
     */
    nowMs,
    loading: live.isLoading || (archived.isLoading && archived.isFetching),
    isError: live.isError,
    pending,
    toggle: (row: StaffTaskRow, done: boolean) => toggle.mutate({ id: row.id, done }),
    rename: (row: StaffTaskRow, text: string) => rename.mutate({ id: row.id, text }),
    remove: (row: StaffTaskRow) => remove.mutate(row.id),
    restore: (row: StaffTaskRow) => restore.mutate(row.id),
    create: (args: { station: string; kind: StaffTodoKind; text: string }) => create.mutate(args),
    createPending: create.isPending,
    changeInterval: (row: StaffTaskRow, intervalMs: number) =>
      setInterval.mutate({ station: row.station, intervalMs }),
  };
}
