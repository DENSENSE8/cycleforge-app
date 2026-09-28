'use client';

/**
 * Reported-Issues sidebar picker (UIC-2) — Workbench master list.
 * URL SoT: `?mode=issues&q=&status=&type=&issueId=`.
 * One-row anatomy: title → reporter · page · relative-date → status dot + type chip.
 */

import { startTransition, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { MessageSquare } from '@/components/Icons';
import { SidebarShell } from '@/components/layout/SidebarShell';
import { SIDEBAR_GUTTER } from '@/components/layout/header-shell';
import { SearchBar } from '@/components/ui/SearchBar';
import { HorizontalButtonSlider, type HorizontalSliderItem } from '@/components/ui/HorizontalButtonSlider';
import { EmptyState, Button } from '@/design-system/primitives';
import { SkeletonList } from '@/design-system/components/Skeletons';
import { useSupportIssueParam } from '@/hooks/useSupportIssueParam';
import { cn } from '@/utils/_cn';
import { timeAgo } from '@/utils/_date';
import { USER_ISSUE_STATUSES, USER_ISSUE_TYPES, type UserIssueStatus, type UserIssueType } from '@/lib/user-issues/issues';
import {
  USER_ISSUE_STATUS_LABEL,
  USER_ISSUE_STATUS_TONE,
  USER_ISSUE_TYPE_CHIP,
  USER_ISSUE_TYPE_LABEL,
} from '@/lib/user-issues/status-tone';
import { useReportedIssuesList } from '@/hooks/useReportedIssues';

const STATUS_FILTER_ITEMS: HorizontalSliderItem[] = [
  { id: 'all', label: 'All' },
  ...USER_ISSUE_STATUSES.map((s) => ({ id: s, label: USER_ISSUE_STATUS_LABEL[s] })),
];

const typeChip = 'rounded-full px-2.5 py-1 text-role-caption font-medium ring-1 ring-inset transition';
const typeChipActive = 'bg-accent-bg text-accent-text ring-accent-bg';
const typeChipIdle = 'bg-surface-card text-text-muted ring-border-soft hover:bg-surface-hover';

function parseStatus(raw: string | null): UserIssueStatus | null {
  return raw === 'pending' || raw === 'in-progress' || raw === 'deployed' ? raw : null;
}

function parseType(raw: string | null): UserIssueType | null {
  return raw === 'bug' || raw === 'suggestion' || raw === 'question' ? raw : null;
}

export function IssuesQueue() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { issueId, setIssueId, paintIssue } = useSupportIssueParam();

  const q = searchParams.get('q') ?? '';
  const status = parseStatus(searchParams.get('status'));
  const type = parseType(searchParams.get('type'));

  const { data, isLoading, isFetching, error } = useReportedIssuesList({
    status,
    type,
    q: q.trim() || null,
    limit: 50,
  });
  const issues = data?.issues ?? [];

  const replaceParams = (patch: Record<string, string | null>) => {
    const clearsIssue = Object.prototype.hasOwnProperty.call(patch, 'issueId')
      ? patch.issueId == null || patch.issueId === ''
      : false;
    if (clearsIssue) paintIssue(null);
    startTransition(() => {
      const sp = new URLSearchParams(searchParams.toString());
      sp.set('mode', 'issues');
      for (const [key, value] of Object.entries(patch)) {
        if (value == null || value === '') sp.delete(key);
        else sp.set(key, value);
      }
      router.replace(`/support?${sp.toString()}`, { scroll: false });
    });
  };

  const select = (id: number) => setIssueId(id);

  const refinements = useMemo(() => {
    const out: Array<{ id: string; label: string; onRemove: () => void }> = [];
    if (status) {
      out.push({
        id: 'status',
        label: USER_ISSUE_STATUS_LABEL[status],
        onRemove: () => replaceParams({ status: null }),
      });
    }
    if (type) {
      out.push({
        id: 'type',
        label: USER_ISSUE_TYPE_LABEL[type],
        onRemove: () => replaceParams({ type: null }),
      });
    }
    return out;
    // replaceParams closes over searchParams; refinements only depend on filter values
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
  }, [status, type]);

  const renderFilters = (onClose: () => void) => (
    <div className="space-y-3">
      <div>
        <p className="mb-1.5 text-role-caption font-semibold text-text-faint">
          Type
        </p>
        <div className="flex flex-wrap gap-1.5">
          {/* ds-raw-button: segmented type-filter chip */}
          <button
            type="button"
            onClick={() => replaceParams({ type: null })}
            className={cn(typeChip, type === null ? typeChipActive : typeChipIdle)}
          >
            All
          </button>
          {USER_ISSUE_TYPES.map((t) => (
            // ds-raw-button: segmented type-filter chip
            <button
              key={t}
              type="button"
              onClick={() => replaceParams({ type: t })}
              className={cn(typeChip, type === t ? typeChipActive : typeChipIdle)}
            >
              {USER_ISSUE_TYPE_LABEL[t]}
            </button>
          ))}
        </div>
      </div>
      <Button variant="brand" size="lg" onClick={onClose} className="mt-2 w-full">
        Done
      </Button>
    </div>
  );

  const hasFilters = Boolean(status || type || q.trim());

  return (
    <SidebarShell
      headerAbove={
        <>
          <div className={`${SIDEBAR_GUTTER} pt-3 pb-2`}>
            <SearchBar
              size="compact"
              variant="blue"
              value={q}
              onChange={(v) => replaceParams({ q: v || null })}
              onClear={() => replaceParams({ q: null })}
              placeholder="Search title, description, page…"
              isSearching={isFetching && !isLoading}
            />
          </div>
        </>
      }
      filter={{
        label: 'Filters',
        refinements,
        activeCount: refinements.length,
        onClearAll: () => replaceParams({ status: null, type: null }),
        renderDropdown: renderFilters,
      }}
      headerRows={[
        <HorizontalButtonSlider
          key="status"
          items={STATUS_FILTER_ITEMS}
          value={status ?? 'all'}
          onChange={(id) => replaceParams({ status: id === 'all' ? null : id })}
          variant="nav"
          dense
          aria-label="Issue status filter"
          className="w-full"
        />,
      ]}
    >
      {isLoading ? (
        <SkeletonList count={6} />
      ) : error ? (
        <div className="px-1 py-6">
          <EmptyState
            title="Couldn’t load issues"
            description={error instanceof Error ? error.message : 'Please try again.'}
          />
        </div>
      ) : issues.length === 0 ? (
        <div className="px-1 py-6">
          <EmptyState
            icon={<MessageSquare className="h-6 w-6 text-text-faint" />}
            title={hasFilters ? 'No matching issues' : 'No reported issues yet'}
            description={
              hasFilters
                ? 'Clear filters or try a different search.'
                : 'Feedback from the in-app widget will show up here.'
            }
          />
        </div>
      ) : (
        <ul className="divide-y divide-border-hairline">
          {issues.map((issue) => {
            const selected = issue.id === issueId;
            const tone = USER_ISSUE_STATUS_TONE[issue.status];
            const meta = [
              issue.reporterName || 'Unknown',
              issue.pagePath || null,
              timeAgo(issue.createdAt),
            ]
              .filter(Boolean)
              .join(' · ');

            return (
              <li key={issue.id}>
                {/* ds-raw-button: master-list navigation row (sets ?issueId=) */}
                <button
                  type="button"
                  onClick={() => select(issue.id)}
                  className={cn(
                    'flex w-full flex-col items-start gap-0.5 px-1 py-1.5 text-left transition-colors',
                    selected
                      ? 'bg-blue-50 ring-1 ring-inset ring-blue-400'
                      : 'hover:bg-surface-hover',
                  )}
                >
                  <span className="flex w-full min-w-0 items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-role-caption font-semibold text-text-default">
                      {issue.title}
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      <span
                        className={cn('h-2 w-2 rounded-full', tone.dot)}
                        aria-label={USER_ISSUE_STATUS_LABEL[issue.status]}
                      />
                      <span
                        className={cn(
                          'rounded px-1.5 py-0.5 text-role-micro ring-1 ring-inset',
                          USER_ISSUE_TYPE_CHIP,
                        )}
                      >
                        {USER_ISSUE_TYPE_LABEL[issue.issueType]}
                      </span>
                    </span>
                  </span>
                  <span className="truncate text-role-eyebrow font-semibold text-text-soft">
                    {meta}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </SidebarShell>
  );
}
