'use client';

import { useRef } from 'react';
import { ClipboardList, User } from '@/components/Icons';
import { OmnichannelComposerDock } from '@/design-system/primitives';
import { cn } from '@/utils/_cn';


/**
 * Warehouse-thread composer.
 *
 * **The shell is {@link OmnichannelComposerDock}** — the one "type a message
 * here" chrome in the app, the same field the Unbox carton notes mount
 * (`LineNotesCard`) and the same one Support replies mount. Until 2026-08-21
 * this file hand-rolled its own bordered textarea + footer strip, which is
 * precisely the fork that dock's docblock bans: the warehouse thread and the
 * customer ticket are supposed to be the same face, and they visibly were not.
 * Enter commits / Shift+Enter newlines now come from the dock rather than a
 * local ⌘↵ handler.
 *
 * What stays local is the only genuinely Cycle-Forge-specific part: the
 * team-only vs on-record toggle. That is thread SEMANTICS, not composer chrome
 * — it is intentionally NOT the Zendesk `VisibilityToggle`, because a team note
 * here is never emailed. It rides the dock's `footerStart` slot.
 *
 * ## One shape (the `float` variant was retired 2026-08-21)
 *
 * This is the bordered composer at the foot of a {@link ThreadPanel}: header
 * eyebrow, visibility toggle, footer status line.
 *
 * A second `float` variant existed for ONE day — a shell-less entry that
 * hovered over the `/search` rail with `chrome="bare"`, no header and no
 * toggle. Its only consumer, `SearchRailQuickNote`, was deleted in the Unbox
 * parity teardown, so the branch went with it rather than sitting here as a
 * reachable-but-unreached fork: `pattern-evolution.md` §6 — a retirement is not
 * done until the old path is DELETED. `onIsOnRecordChange` is required again,
 * because `float` was the only caller that legitimately omitted it, and
 * `isOnRecord` stays required-and-undefaulted for the reason it always was —
 * what a note claims is a safety classification.
 *
 * If a shell-less composer is ever wanted again, the dock's own `chrome="bare"`
 * is still there; bring the variant back with a consumer in the same change.
 */
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
  /**
   * false = team-only; true = visible on the warehouse entity record.
   *
   * Never defaulted: what a note claims is a safety classification, and a
   * default would let a host that never thought about it post on-record by
   * omission.
   */
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
