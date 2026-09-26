'use client';

/**
 * React Query hooks for the Reported-Issues console (UIC-2 read + UIC-3 mutations).
 * List + detail over GET; Claim/Resolve/Reopen/Edit via PATCH with optimistic
 * onMutate → rollback → invalidate. 409 → refetch + toast.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import type {
  ReportedIssue,
  UserIssueStatus,
  UserIssueType,
} from '@/lib/user-issues/issues';
import {
  aggregateReportedIssuesKpis,
  type ReportedIssuesKpis,
} from '@/lib/user-issues/kpi';

interface ReportedIssuesListFilters {
  status?: UserIssueStatus | null;
  type?: UserIssueType | null;
  reporterId?: number | null;
  q?: string | null;
  limit?: number;
}

interface ReportedIssuesListResult {
  issues: ReportedIssue[];
  nextCursor: string | null;
}

interface PatchReportedIssueInput {
  title?: string;
  description?: string;
  issueType?: UserIssueType;
  status?: UserIssueStatus;
  expectedFrom?: UserIssueStatus;
  resolutionCommit?: string | null;
  clientEventId?: string;
}

class PatchConflictError extends Error {
  issue: ReportedIssue | null;
  constructor(message: string, issue: ReportedIssue | null) {
    super(message);
    this.name = 'PatchConflictError';
    this.issue = issue;
  }
}

async function fetchIssuesList(
  filters: ReportedIssuesListFilters,
): Promise<ReportedIssuesListResult> {
  const sp = new URLSearchParams();
  if (filters.status) sp.set('status', filters.status);
  if (filters.type) sp.set('type', filters.type);
  if (filters.reporterId) sp.set('reporter', String(filters.reporterId));
  if (filters.q?.trim()) sp.set('q', filters.q.trim());
  sp.set('limit', String(filters.limit ?? 50));

  const res = await fetch(`/api/user-issues?${sp.toString()}`, { cache: 'no-store' });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error || `Failed to load issues (${res.status})`);
  }
  const body = (await res.json()) as {
    success?: boolean;
    issues?: ReportedIssue[];
    nextCursor?: string | null;
  };
  return {
    issues: body.issues ?? [],
    nextCursor: body.nextCursor ?? null,
  };
}

function patchIssueOptimistically(
  issue: ReportedIssue,
  input: PatchReportedIssueInput,
): ReportedIssue {
  const next: ReportedIssue = { ...issue, updatedAt: new Date().toISOString() };
  if (input.title !== undefined) next.title = input.title;
  if (input.description !== undefined) next.description = input.description;
  if (input.issueType !== undefined) next.issueType = input.issueType;
  if (input.status !== undefined) {
    next.status = input.status;
    if (input.status === 'deployed') {
      next.resolvedAt = new Date().toISOString();
      if (input.resolutionCommit !== undefined) {
        next.resolutionCommit = input.resolutionCommit;
      }
    } else if (input.status === 'pending') {
      next.resolvedAt = null;
      next.resolutionCommit = null;
    }
  }
  return next;
}

function applyIssueToListCaches(
  queryClient: ReturnType<typeof useQueryClient>,
  issue: ReportedIssue,
) {
  queryClient.setQueryData(['user-issues', 'detail', issue.id], issue);
  queryClient.setQueriesData<ReportedIssuesListResult>(
    { queryKey: ['user-issues', 'list'] },
    (prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        issues: prev.issues.map((row) => (row.id === issue.id ? issue : row)),
      };
    },
  );
}

export function useReportedIssuesList(filters: ReportedIssuesListFilters) {
  return useQuery({
    queryKey: [
      'user-issues',
      'list',
      filters.status ?? null,
      filters.type ?? null,
      filters.reporterId ?? null,
      filters.q?.trim() || null,
      filters.limit ?? 50,
    ],
    staleTime: 30_000,
    queryFn: () => fetchIssuesList(filters),
  });
}

export function useReportedIssue(id: number | null) {
  return useQuery({
    queryKey: ['user-issues', 'detail', id],
    enabled: id != null && id > 0,
    staleTime: 30_000,
    queryFn: async (): Promise<ReportedIssue | null> => {
      const res = await fetch(`/api/user-issues/${id}`, { cache: 'no-store' });
      if (res.status === 404) return null;
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error || `Failed to load issue (${res.status})`);
      }
      const body = (await res.json()) as { issue?: ReportedIssue };
      return body.issue ?? null;
    },
  });
}

/** Unfiltered sample for the Monitor KPI strip (degrade-not-fail). */
export function useReportedIssuesKpis() {
  return useQuery({
    queryKey: ['user-issues', 'kpis'],
    staleTime: 60_000,
    queryFn: async (): Promise<ReportedIssuesKpis> => {
      try {
        const { issues } = await fetchIssuesList({ limit: 100 });
        return aggregateReportedIssuesKpis(issues);
      } catch {
        return { open: 0, inProgress: 0, deployed7d: 0, medianHoursToDeploy: null };
      }
    },
  });
}

/**
 * PATCH mutation — Claim / Resolve / Reopen / Edit.
 * Optimistic cache write; 409 rolls back, toasts, and refetches.
 */
export function usePatchReportedIssue(issueId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: PatchReportedIssueInput): Promise<ReportedIssue> => {
      const res = await fetch(`/api/user-issues/${issueId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      const body = (await res.json().catch(() => null)) as {
        success?: boolean;
        error?: string;
        message?: string;
        issue?: ReportedIssue;
      } | null;

      if (res.status === 409) {
        throw new PatchConflictError(
          body?.message || 'Issue changed — refreshed. Try again.',
          body?.issue ?? null,
        );
      }
      if (!res.ok || !body?.issue) {
        throw new Error(body?.error || `Failed to update issue (${res.status})`);
      }
      return body.issue;
    },
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: ['user-issues'] });
      const detailKey = ['user-issues', 'detail', issueId] as const;
      const snapshotDetail = queryClient.getQueryData<ReportedIssue | null>(detailKey) ?? null;
      const listSnapshots = queryClient.getQueriesData<ReportedIssuesListResult>({
        queryKey: ['user-issues', 'list'],
      });

      if (snapshotDetail) {
        applyIssueToListCaches(queryClient, patchIssueOptimistically(snapshotDetail, input));
      }

      return { snapshotDetail, listSnapshots };
    },
    onError: (err, _input, ctx) => {
      if (ctx?.snapshotDetail) {
        queryClient.setQueryData(['user-issues', 'detail', issueId], ctx.snapshotDetail);
      }
      if (ctx?.listSnapshots) {
        for (const [key, data] of ctx.listSnapshots) {
          queryClient.setQueryData(key, data);
        }
      }

      if (err instanceof PatchConflictError) {
        if (err.issue) {
          applyIssueToListCaches(queryClient, err.issue);
        }
        toast.error(err.message);
        void queryClient.invalidateQueries({ queryKey: ['user-issues'] });
        return;
      }
      toast.error(err instanceof Error ? err.message : 'Failed to update issue');
    },
    onSuccess: (issue) => {
      applyIssueToListCaches(queryClient, issue);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['user-issues'] });
    },
  });
}

/**
 * Soft-delete mutation (UIC-4). Confirm-then-commit in the UI via
 * useConfirmedAction; on success clears selection and invalidates caches.
 */
export function useSoftDeleteReportedIssue(issueId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (): Promise<{ idempotent: boolean }> => {
      const res = await fetch(`/api/user-issues/${issueId}`, { method: 'DELETE' });
      const body = (await res.json().catch(() => null)) as {
        success?: boolean;
        error?: string;
        idempotent?: boolean;
      } | null;
      if (!res.ok) {
        throw new Error(body?.error || `Failed to delete issue (${res.status})`);
      }
      return { idempotent: Boolean(body?.idempotent) };
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['user-issues'] });
      const detailKey = ['user-issues', 'detail', issueId] as const;
      const snapshotDetail = queryClient.getQueryData<ReportedIssue | null>(detailKey) ?? null;
      const listSnapshots = queryClient.getQueriesData<ReportedIssuesListResult>({
        queryKey: ['user-issues', 'list'],
      });

      queryClient.setQueryData(detailKey, null);
      queryClient.setQueriesData<ReportedIssuesListResult>(
        { queryKey: ['user-issues', 'list'] },
        (prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            issues: prev.issues.filter((row) => row.id !== issueId),
          };
        },
      );

      return { snapshotDetail, listSnapshots };
    },
    onError: (err, _input, ctx) => {
      if (ctx?.snapshotDetail) {
        queryClient.setQueryData(['user-issues', 'detail', issueId], ctx.snapshotDetail);
      }
      if (ctx?.listSnapshots) {
        for (const [key, data] of ctx.listSnapshots) {
          queryClient.setQueryData(key, data);
        }
      }
      toast.error(err instanceof Error ? err.message : 'Failed to delete issue');
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['user-issues'] });
    },
  });
}
