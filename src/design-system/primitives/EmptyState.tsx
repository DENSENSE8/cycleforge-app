'use client';

import type { ReactNode } from 'react';
import { cn } from '@/utils/_cn';

/**
 * The house "there is nothing here" face.
 *
 * `tone` exists so a caller stops hand-painting one. `/search` carried
 * `[&_h3]:text-rose-800 [&_p]:text-rose-700` class overrides on two of its four
 * mounts — a descendant-selector reach into this component's internals, which
 * breaks silently the moment the heading stops being an `h3`.
 *
 * `danger` is for a state the operator has to ACT on (a permission they lack, a
 * failed call). An ordinary absence — no photos, no results for a filter — is
 * `neutral`, and painting it red teaches an error where there is none.
 */
export type EmptyStateTone = 'neutral' | 'danger';

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  tone?: EmptyStateTone;
  className?: string;
}

const TONE_TITLE: Record<EmptyStateTone, string> = {
  neutral: 'text-text-default',
  danger: 'text-text-danger',
};

const TONE_DESCRIPTION: Record<EmptyStateTone, string> = {
  neutral: 'text-text-soft',
  danger: 'text-text-danger',
};

export function EmptyState({
  icon,
  title,
  description,
  action,
  tone = 'neutral',
  className = '',
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center space-y-4 py-12 text-center',
        className,
      )}
    >
      {icon && (
        <div className="flex h-16 w-16 items-center justify-center rounded-full border border-border-hairline bg-surface-canvas">
          {icon}
        </div>
      )}
      <div className="space-y-2">
        <h3 className={cn('text-lg font-semibold', TONE_TITLE[tone])}>{title}</h3>
        {description && (
          <p className={cn('max-w-sm text-sm', TONE_DESCRIPTION[tone])}>{description}</p>
        )}
      </div>
      {action && <div className="pt-2">{action}</div>}
    </div>
  );
}
