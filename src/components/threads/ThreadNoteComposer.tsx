'use client';

import { useRef } from 'react';
import { ClipboardList, Send, User } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import { cn } from '@/utils/_cn';
import { focusRing } from '@/design-system/tokens/focus-ring';


/**
 * Warehouse-thread composer — intentionally NOT the Zendesk {@link VisibilityToggle}.
 * Team notes vs on-record visibility are Cycle Forge thread semantics (never emailed).
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
}) {
  const localRef = useRef<HTMLTextAreaElement>(null);
  const ref = textareaRef ?? localRef;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-role-eyebrow uppercase tracking-widest text-violet-600/80">
          Warehouse thread
        </p>
        <ThreadRecordToggle value={isOnRecord} onChange={onIsOnRecordChange} />
      </div>

      <div
        className={cn(
          'rounded-xl border bg-surface-card transition',
          isOnRecord
            ? cn('border-emerald-300 bg-emerald-50/25', focusRing('wrapper', 'success'))
            : 'border-violet-200 bg-violet-50/20 focus-within:ring-2 focus-within:ring-violet-100' /* ds-allow-focus: identity/one-off hue or ring-0 */,
        )}
      >
        <textarea
          ref={ref as React.Ref<HTMLTextAreaElement>}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') onSubmit();
          }}
          rows={dense ? 2 : 3}
          disabled={disabled}
          placeholder={
            isOnRecord
              ? externalSubmit
                ? 'On-record note…  (⌘↵ or dock Post)'
                : 'On-record note — visible on this entity…  (⌘↵ to post)'
              : externalSubmit
                ? 'Team note…  (⌘↵ or dock Add note)'
                : 'Team note — not sent to customer…  (⌘↵ to add)'
          }
          className="block w-full resize-none rounded-xl bg-transparent px-3.5 py-2.5 text-role-caption leading-relaxed text-text-default outline-none placeholder:text-text-faint"
        />
        <div className="flex items-center justify-between border-t border-border-hairline px-3 py-2">
          <span className="text-role-caption text-text-faint">
            {errorMessage
              ? errorMessage
              : externalSubmit
                ? isOnRecord
                  ? 'Posts to the warehouse record — use the dock to Post'
                  : 'Team-only — use the dock to Add note'
                : isOnRecord
                  ? 'Cycle Forge thread · visible on record'
                  : 'Cycle Forge thread · not emailed'}
          </span>
          {externalSubmit ? null : (
            <Button
              variant={isOnRecord ? 'primary' : 'secondary'}
              size="sm"
              loading={loading}
              disabled={disabled || !value.trim()}
              onClick={onSubmit}
              icon={<Send className="h-3.5 w-3.5" />}
            >
              {isOnRecord ? 'Post' : 'Add note'}
            </Button>
          )}
        </div>
      </div>
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
