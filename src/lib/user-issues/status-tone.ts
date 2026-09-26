/** Presentation SoT for reported-issue status (+ type chips). */

import type { UserIssueStatus, UserIssueType } from '@/lib/user-issues/issues';

interface IssueToneClasses {
  /** Solid status-dot fill. */
  dot: string;
  /** Chip: bg + text + ring (house 3-layer chip). */
  chip: string;
}

export const USER_ISSUE_STATUS_TONE: Record<UserIssueStatus, IssueToneClasses> = {
  pending: {
    dot: 'bg-amber-500',
    chip: 'bg-amber-50 text-amber-700 ring-amber-200',
  },
  'in-progress': {
    dot: 'bg-blue-500',
    chip: 'bg-blue-50 text-blue-700 ring-blue-200',
  },
  deployed: {
    dot: 'bg-emerald-500',
    chip: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  },
};

/** Operator-facing status labels (KPI / chips). Wire value stays the enum. */
export const USER_ISSUE_STATUS_LABEL: Record<UserIssueStatus, string> = {
  pending: 'Open',
  'in-progress': 'In progress',
  deployed: 'Deployed',
};

export const USER_ISSUE_TYPE_LABEL: Record<UserIssueType, string> = {
  bug: 'Bug',
  suggestion: 'Suggestion',
  question: 'Question',
};

/** Neutral type chip (type is categorical, not state-colored). */
export const USER_ISSUE_TYPE_CHIP =
  'bg-surface-canvas text-text-muted ring-border-soft';

function userIssueStatusTone(status: UserIssueStatus): IssueToneClasses {
  return USER_ISSUE_STATUS_TONE[status];
}
