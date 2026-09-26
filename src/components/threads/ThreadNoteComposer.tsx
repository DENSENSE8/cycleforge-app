'use client';

import { useRef } from 'react';
import { ClipboardList, User } from '@/components/Icons';
import { OmnichannelComposerDock } from '@/design-system/primitives';
import { cn } from '@/utils/_cn';


/** Warehouse-thread composer. */
export function ThreadNoteComposer({
  value,
  onChange,
  isOnRecord,
  onIsOnRecordChange,
  onSubmit,
  loading = false,
  disabled = false,
  dense = false,
  externalSubmit = false,
  errorMessage,
  textareaRef,
  onFocus,
  onBlur,
}: {
  value: string;
  onChange: (next: string) => void;
  /** false = team-only; true = visible on the warehouse entity record. */
  isOnRecord: boolean;
  onIsOnRecordChange: (next: boolean) => void;
  onSubmit: () => void;
  loading?: boolean;
  disabled?: boolean;
  dense?: boolean;
  /** Host terminal dock owns submit — hide inline send button. */
  externalSubmit?: boolean;
  errorMessage?: string | null;
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
  /**
   * Focus signals for a host that reacts to "the operator started writing" —
   * the Search & Details centre collapses its reference blocks on focus.
   */
  onFocus?: () => void;
  onBlur?: () => void;
}) {
  const localRef = useRef<HTMLTextAreaElement>(null);
  const ref = textareaRef ?? localRef;

  const computedPlaceholder = isOnRecord
    ? externalSubmit
      ? 'On-record note…  (dock Post)'
      : 'On-record note — visible on this entity…'
    : externalSubmit
      ? 'Team note…  (dock Add note)'
      : 'Team note — not sent to customer…';
  const placeholder = computedPlaceholder;

  const status = errorMessage
    ? errorMessage
    : externalSubmit
      ? isOnRecord
        ? 'Posts to the warehouse record — use the dock to Post'
        : 'Team-only — use the dock to Add note'
      : isOnRecord
        ? 'Cycle Forge thread · visible on record'
        : 'Cycle Forge thread · not emailed';

  const dock = (
    <OmnichannelComposerDock
      value={value}
      onChange={onChange}
      onCommit={onSubmit}
      placeholder={placeholder}
      ariaLabel={isOnRecord ? 'On-record note' : 'Team note'}
      disabled={disabled}
      hideCommitButton={externalSubmit}
      commitDisabled={disabled || loading || !value.trim()}
      commitAriaLabel={isOnRecord ? 'Post note' : 'Add note'}
      commitTooltip={isOnRecord ? 'Post (Enter)' : 'Add note (Enter)'}
      chrome="raised"
      density={dense ? 'compact' : 'default'}
      textareaRef={ref as React.Ref<HTMLTextAreaElement>}
      onFocus={onFocus}
      onBlur={onBlur}
      footerStart={
        <span
          className={cn(
            'truncate text-role-caption',
            errorMessage ? 'text-rose-600' : 'text-text-faint',
          )}
        >
          {status}
        </span>
      }
    />
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-role-eyebrow uppercase tracking-widest text-violet-600/80">
          Warehouse thread
        </p>
        <ThreadRecordToggle value={isOnRecord} onChange={onIsOnRecordChange} />
      </div>

      {dock}
    </div>
  );
}

function ThreadRecordToggle({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="inline-flex rounded-lg bg-surface-sunken p-0.5">
      {/* ds-raw-button: segmented team-only / on-record toggle, not a Button action */}
      <button
        type="button"
        onClick={() => onChange(false)}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-role-caption font-semibold transition',
          !value
            ? 'bg-surface-card text-violet-700 shadow-sm'
            : 'text-text-soft hover:text-text-muted',
        )}
      >
        <User className="h-3.5 w-3.5" /> Team only
      </button>
      {/* ds-raw-button: segmented team-only / on-record toggle, not a Button action */}
      <button
        type="button"
        onClick={() => onChange(true)}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-role-caption font-semibold transition',
          value
            ? 'bg-surface-card text-emerald-700 shadow-sm'
            : 'text-text-soft hover:text-text-muted',
        )}
      >
        <ClipboardList className="h-3.5 w-3.5" /> On record
      </button>
    </div>
  );
}
