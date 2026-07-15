'use client';

/**
 * React Query hooks for the Reported-Issues console (UIC-2).
 * List + detail over GET /api/user-issues; KPIs aggregate a short unfiltered sample.
 */

import { useQuery } from '@tanstack/react-query';
import type { ReportedIssue, UserIssueStatus, UserIssueType } from '@/lib/user-issues/issues';
import {
  aggregateReportedIssuesKpis,
  type ReportedIssuesKpis,
} from '@/lib/user-issues/kpi';

export interface ReportedIssuesListFilters {
  status?: UserIssueStatus | null;
  type?: UserIssueType | null;
  reporterId?: number | null;
  q?: string | null;
  limit?: number;
}

export interface ReportedIssuesListResult {
  issues: ReportedIssue[];
  nextCursor: string | null;
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
