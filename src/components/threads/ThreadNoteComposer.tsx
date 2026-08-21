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
 * ## Two variants, one composer
 *
 * `panel` (default) is the bordered composer at the foot of a {@link ThreadPanel}:
 * header eyebrow, visibility toggle, footer status line.
 *
 * `float` is the shell-less entry that hovers over a rail — no header, no
 * toggle, no status line, `chrome="bare"` on the dock. Visibility there is a
 * FIXED declaration by the host rather than an operator choice, so `isOnRecord`
 * stays a required prop with no default (the host must say which kind of note
 * this field posts) while `onIsOnRecordChange` becomes optional. The
 * `/search` rail forked this whole component to get that shape — it mounted
 * `OmnichannelComposerDock` raw and hardcoded `visibility: 'internal'` where
 * the dock's own docblock bans exactly that.
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
  variant = 'panel',
  placeholder: placeholderOverride,
}: {
  value: string;
  onChange: (next: string) => void;
  /**
   * false = team-only; true = visible on the warehouse entity record.
   *
   * Required in BOTH variants and never defaulted: what a note claims is a
   * safety classification, and a default would let a host that never thought
   * about it post on-record by omission.
   */
  isOnRecord: boolean;
  /** Omit in `float`, where visibility is fixed and no toggle is rendered. */
  onIsOnRecordChange?: (next: boolean) => void;
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
  /** `panel` = thread foot (header · toggle · status). `float` = shell-less rail entry. */
  variant?: 'panel' | 'float';
  /** Override the computed placeholder — e.g. a float with no anchor selected. */
  placeholder?: string;
}) {
  const localRef = useRef<HTMLTextAreaElement>(null);
  const ref = textareaRef ?? localRef;
  const floating = variant === 'float';

  const computedPlaceholder = isOnRecord
    ? externalSubmit
      ? 'On-record note…  (dock Post)'
      : 'On-record note — visible on this entity…'
    : externalSubmit
      ? 'Team note…  (dock Add note)'
      : 'Team note — not sent to customer…';
  const placeholder = placeholderOverride ?? computedPlaceholder;

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
      // `bare` is the dock's own no-shell mode: transparent ground, no border,
      // no fill, so a rail's list scrolls behind the float instead of being cut
      // short by a footer band.
      chrome={floating ? 'bare' : 'raised'}
      density={floating || dense ? 'compact' : 'default'}
      animateMount={!floating}
      textareaRef={ref as React.Ref<HTMLTextAreaElement>}
      onFocus={onFocus}
      onBlur={onBlur}
      footerStart={
        floating ? undefined : (
          <span
            className={cn(
              'truncate text-role-caption',
              errorMessage ? 'text-rose-600' : 'text-text-faint',
            )}
          >
            {status}
          </span>
        )
      }
    />
  );

  // A float has no header row: it carries no shell to hang one on, and the
  // rail it hovers over is already labelled. Visibility rides the placeholder.
  if (floating) return dock;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-role-eyebrow uppercase tracking-widest text-violet-600/80">
          Warehouse thread
        </p>
        {onIsOnRecordChange ? (
          <ThreadRecordToggle value={isOnRecord} onChange={onIsOnRecordChange} />
        ) : null}
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
