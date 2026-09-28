'use client';

import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';

interface ReadinessIssue {
  permission: string;
  staffId: number | null;
  staffName: string;
  actorRole: string | null;
  path: string;
  requestMethod: string;
  requestCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
}

interface ReadinessReport {
  generatedAt: string;
  windowDays: number;
  totalRequests: number;
  permissionCount: number;
  affectedStaffCount: number;
  issues: ReadinessIssue[];
}

async function fetchReadinessReport(): Promise<ReadinessReport> {
  const response = await fetch('/api/admin/authorization-readiness?days=30', {
    credentials: 'include',
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`Could not load strict-mode readiness (${response.status})`);
  return response.json() as Promise<ReadinessReport>;
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border-subtle bg-surface-card px-3 py-2">
      <div className="text-lg font-semibold tabular-nums text-text-default">{value}</div>
      <div className="text-role-caption text-text-soft">{label}</div>
    </div>
  );
}

export function StrictModeReadinessReport() {
  const { user } = useAuth();
  const query = useQuery({
    queryKey: ['authorization-readiness', user?.organizationId],
    queryFn: fetchReadinessReport,
    enabled: Boolean(user),
    staleTime: 30_000,
  });
  const report = query.data;
  const authOnly = user?.authorizationMode === 'authenticated-only';

  return (
    <section className="shrink-0 border-b border-border-default bg-surface-sunken/60 px-4 py-3" aria-labelledby="strict-readiness-heading">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="strict-readiness-heading" className="text-sm font-semibold text-text-default">
            Strict-mode readiness
          </h2>
          <p className="mt-0.5 max-w-3xl text-role-caption text-text-soft">
            {authOnly
              ? 'Dogfood access remains open. These are requests the staff member’s stored roles would block in strict mode.'
              : 'Historical dogfood requests that exposed missing stored permissions before strict mode was enabled.'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void query.refetch()}
          disabled={query.isFetching}
          className="rounded-md border border-border-default bg-surface-card px-3 py-1.5 text-role-caption font-medium text-text-default hover:bg-surface-hover disabled:opacity-50"
        >
          {query.isFetching ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {query.isError ? (
        <p className="mt-3 text-role-caption text-text-soft">{query.error.message}</p>
      ) : !report ? (
        <p className="mt-3 text-role-caption text-text-soft">Loading readiness signals…</p>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-3 gap-2 sm:max-w-md">
            <Stat label="Requests" value={report.totalRequests} />
            <Stat label="Permissions" value={report.permissionCount} />
            <Stat label="Staff affected" value={report.affectedStaffCount} />
          </div>

          {report.issues.length === 0 ? (
            <p className="mt-3 rounded-lg border border-border-subtle bg-surface-card px-3 py-2 text-role-caption text-text-soft">
              No prospective denials recorded in the last {report.windowDays} days.
            </p>
          ) : (
            <div className="mt-3 max-h-56 overflow-auto rounded-lg border border-border-subtle bg-surface-card">
              {report.issues.map((issue) => (
                <div
                  key={`${issue.permission}:${issue.staffId ?? 'unknown'}:${issue.requestMethod}:${issue.path}`}
                  className="grid gap-1 border-b border-border-subtle px-3 py-2 last:border-b-0 md:grid-cols-[minmax(10rem,1fr)_minmax(9rem,0.8fr)_minmax(14rem,1.4fr)_auto] md:items-center"
                >
                  <code className="truncate text-xs font-semibold text-text-default">{issue.permission}</code>
                  <div className="truncate text-role-caption text-text-muted">
                    {issue.staffName}{issue.actorRole ? ` · ${issue.actorRole}` : ''}
                  </div>
                  <div className="truncate text-role-caption text-text-soft" title={`${issue.requestMethod} ${issue.path}`}>
                    {issue.requestMethod} {issue.path}
                  </div>
                  <div className="text-role-caption tabular-nums text-text-soft">
                    {issue.requestCount}× · {new Date(issue.lastSeenAt).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
