'use client';

/**
 * Reported-Issues detail pane (UIC-2 + UIC-3).
 * Fact stack + description SectionCard + Claim / Resolve / Reopen / Edit actions.
 */

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { ExternalLink, MessageSquare } from '@/components/Icons';
import { CopyChip } from '@/components/ui/CopyChip';
import { EmptyState, Button, TextField } from '@/design-system/primitives';
import { SectionCard } from '@/design-system/components/monitor';
import { cn } from '@/utils/_cn';
import { formatDateTimePST } from '@/utils/date';
import { useAuth } from '@/contexts/AuthContext';
import type { ReportedIssue, UserIssueType } from '@/lib/user-issues/issues';
import { USER_ISSUE_TYPES } from '@/lib/user-issues/issues';
import {
  USER_ISSUE_STATUS_LABEL,
  USER_ISSUE_STATUS_TONE,
  USER_ISSUE_TYPE_CHIP,
  USER_ISSUE_TYPE_LABEL,
} from '@/lib/user-issues/status-tone';
import { usePatchReportedIssue, useReportedIssue, useSoftDeleteReportedIssue } from '@/hooks/useReportedIssues';
import { useConfirmedAction } from '@/hooks';
import { focusRing } from '@/design-system/tokens/focus-ring';

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 space-y-0.5">
      <p className="text-role-eyebrow uppercase tracking-widest text-text-soft">{label}</p>
      <div className="text-role-caption font-semibold text-text-default">{children}</div>
    </div>
  );
}

function StatusChip({ status }: { status: ReportedIssue['status'] }) {
  const tone = USER_ISSUE_STATUS_TONE[status];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 text-role-micro uppercase tracking-widest ring-1 ring-inset',
        tone.chip,
      )}
    >
      <span className={cn('h-2 w-2 rounded-full', tone.dot)} />
      {USER_ISSUE_STATUS_LABEL[status]}
    </span>
  );
}

function IssueActions({
  issue,
  onDeleted,
}: {
  issue: ReportedIssue;
  onDeleted?: () => void;
}) {
  const { has, isLoaded } = useAuth();
  const canManage = !isLoaded || has('support.issues.manage');
  const patch = usePatchReportedIssue(issue.id);
  const softDelete = useSoftDeleteReportedIssue(issue.id);
  const confirmDelete = useConfirmedAction(
    async () => {
      await softDelete.mutateAsync();
      onDeleted?.();
    },
    `Delete “${issue.title}”? It will be hidden from the console (soft-delete).`,
  );
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(issue.title);
  const [draftDescription, setDraftDescription] = useState(issue.description);
  const [draftType, setDraftType] = useState<UserIssueType>(issue.issueType);

  const busy = patch.isPending || softDelete.isPending;

  const claim = () => {
    void patch.mutateAsync({ status: 'in-progress', expectedFrom: issue.status });
  };
  const resolve = () => {
    void patch.mutateAsync({ status: 'deployed', expectedFrom: issue.status });
  };
  const reopen = () => {
    void patch.mutateAsync({ status: 'pending', expectedFrom: issue.status });
  };

  const startEdit = () => {
    setDraftTitle(issue.title);
    setDraftDescription(issue.description);
    setDraftType(issue.issueType);
    setEditing(true);
  };

  const saveEdit = async () => {
    const title = draftTitle.trim();
    const description = draftDescription.trim();
    if (!title || !description) return;
    const payload: {
      title?: string;
      description?: string;
      issueType?: UserIssueType;
    } = {};
    if (title !== issue.title) payload.title = title;
    if (description !== issue.description) payload.description = description;
    if (draftType !== issue.issueType) payload.issueType = draftType;
    if (Object.keys(payload).length === 0) {
      setEditing(false);
      return;
    }
    await patch.mutateAsync(payload);
    setEditing(false);
  };

  if (!canManage) {
    return issue.githubIssueUrl ? (
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          icon={<ExternalLink className="h-3.5 w-3.5" />}
          onClick={() => window.open(issue.githubIssueUrl!, '_blank', 'noopener,noreferrer')}
        >
          GitHub
        </Button>
      </div>
    ) : null;
  }

  return (
    <div className="stack-section">
      <div className="flex flex-wrap items-center gap-2">
        {issue.status === 'pending' ? (
          <Button variant="secondary" size="sm" disabled={busy} onClick={claim}>
            Claim
          </Button>
        ) : null}
        {issue.status === 'pending' || issue.status === 'in-progress' ? (
          <Button variant="primary" size="sm" disabled={busy} onClick={resolve}>
            Resolve
          </Button>
        ) : null}
        {issue.status === 'deployed' || issue.status === 'in-progress' ? (
          <Button variant="ghost" size="sm" disabled={busy} onClick={reopen}>
            Reopen
          </Button>
        ) : null}
        <Button
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={() => (editing ? setEditing(false) : startEdit())}
        >
          {editing ? 'Cancel' : 'Edit'}
        </Button>
        <Button
          variant="danger"
          size="sm"
          disabled={busy}
          onClick={() => void confirmDelete()}
        >
          Delete
        </Button>
        {issue.githubIssueUrl ? (
          <Button
            variant="ghost"
            size="sm"
            icon={<ExternalLink className="h-3.5 w-3.5" />}
            onClick={() => window.open(issue.githubIssueUrl!, '_blank', 'noopener,noreferrer')}
          >
            GitHub
          </Button>
        ) : null}
      </div>

      {editing ? (
        <div className="stack-section rounded-lg border border-border-soft bg-surface-card inset-card">
          <TextField label="Title" value={draftTitle} onChange={setDraftTitle} />
          <TextField
            label="Description"
            value={draftDescription}
            onChange={setDraftDescription}
            multiline
            rows={4}
          />
          <label className="block space-y-1">
            <span className="text-role-eyebrow uppercase tracking-widest text-text-soft">Type</span>
            <select
              value={draftType}
              onChange={(e) => setDraftType(e.target.value as UserIssueType)}
              className={cn(
                'w-full rounded-md border border-border-soft bg-surface-card px-2 py-1.5 text-role-caption text-text-default',
                focusRing('field'),
              )}
            >
              {USER_ISSUE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {USER_ISSUE_TYPE_LABEL[t]}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="primary"
              size="sm"
              disabled={busy || !draftTitle.trim() || !draftDescription.trim()}
              onClick={() => void saveEdit()}
            >
              Save
            </Button>
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function IssuesDetail({
  issueId,
  onBack,
}: {
  issueId: number;
  onBack?: () => void;
}) {
  const { data: issue, isLoading, error } = useReportedIssue(issueId);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <p className="text-role-caption text-text-faint">Loading issue…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <EmptyState
          title="Couldn’t load issue"
          description={error instanceof Error ? error.message : 'Please try again.'}
          action={
            onBack ? (
              <Button variant="secondary" size="sm" onClick={onBack}>
                Back
              </Button>
            ) : undefined
          }
        />
      </div>
    );
  }

  if (!issue) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <EmptyState
          icon={<MessageSquare className="h-6 w-6 text-text-faint" />}
          title="Issue not found"
          description="It may have been removed, or you don’t have access."
          action={
            onBack ? (
              <Button variant="secondary" size="sm" onClick={onBack}>
                Back
              </Button>
            ) : undefined
          }
        />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto">
      <div className="stack-section inset-card">
        {onBack ? (
          // ds-raw-button: mobile back-link
          <button
            type="button"
            onClick={onBack}
            className="text-role-eyebrow uppercase tracking-widest text-blue-600 md:hidden"
          >
            ← Back
          </button>
        ) : null}

        <header className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <StatusChip status={issue.status} />
            <span
              className={cn(
                'rounded px-1.5 py-0.5 text-role-micro uppercase tracking-widest ring-1 ring-inset',
                USER_ISSUE_TYPE_CHIP,
              )}
            >
              {USER_ISSUE_TYPE_LABEL[issue.issueType]}
            </span>
            <CopyChip value={String(issue.id)} display={`#${issue.id}`} tone="id" dense />
          </div>
          <h1 className="text-lg font-black tracking-tight text-text-default">{issue.title}</h1>
        </header>

        <IssueActions issue={issue} onDeleted={onBack} />

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Field label="Reporter">{issue.reporterName || 'Unknown'}</Field>
          <Field label="Created">{formatDateTimePST(issue.createdAt)}</Field>
          <Field label="Updated">{formatDateTimePST(issue.updatedAt)}</Field>
          {issue.resolvedAt ? (
            <Field label="Resolved">{formatDateTimePST(issue.resolvedAt)}</Field>
          ) : null}
          {issue.pagePath ? (
            <Field label="Page">
              <Link
                href={issue.pagePath}
                className="text-blue-600 underline-offset-2 hover:underline"
              >
                {issue.pagePath}
              </Link>
            </Field>
          ) : (
            <Field label="Page">—</Field>
          )}
          {issue.githubIssueNumber != null ? (
            <Field label="GitHub">
              <CopyChip
                value={String(issue.githubIssueNumber)}
                display={`#${issue.githubIssueNumber}`}
                tone="id"
                dense
              />
            </Field>
          ) : null}
          {issue.resolutionCommit ? (
            <Field label="Resolution commit">
              <CopyChip
                value={issue.resolutionCommit}
                display={issue.resolutionCommit.slice(0, 7)}
                tone="id"
                dense
              />
            </Field>
          ) : null}
        </div>

        <SectionCard title="Description" eyebrow="Report">
          <p className="whitespace-pre-wrap text-role-caption leading-relaxed text-text-muted">
            {issue.description?.trim() ? issue.description : 'No description provided.'}
          </p>
        </SectionCard>
      </div>
    </div>
  );
}
