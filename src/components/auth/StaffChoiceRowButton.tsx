'use client';

/**
 * The ONE staff-choice row — shared by every "pick a person" face on signin:
 * Layout is the operator-pinned email-flow display (2026-09-08): rounded
 */

import type { ReactNode } from 'react';
import { StaffAvatar } from '@/components/identity';
import { cn } from '@/utils/_cn';

interface StaffChoiceRowButtonProps {
  staffId: number | string;
  name: string;
  role?: string | null;
  colorHex?: string | null;
  avatarPhotoId?: number | null;
  disabled?: boolean;
  isRecent?: boolean;
  /** Optional state chip on the role line (PIN setup, policy, …). */
  pill?: ReactNode;
  /** Omit for a display-only identity row (QR-auth "this is who you are"). */
  onPick?: () => void;
  /** Fuller accessible name when the visible row is not enough. */
  ariaLabel?: string;
}

export function StaffChoiceRowButton({
  staffId,
  name,
  role,
  colorHex,
  avatarPhotoId,
  disabled,
  isRecent,
  pill,
  onPick,
  ariaLabel,
}: StaffChoiceRowButtonProps) {
  const interactive = typeof onPick === 'function';
  const rowClass = cn(
    'flex w-full items-center gap-3 rounded-xl border bg-surface-card px-3 py-2.5 text-left',
    interactive &&
      'group transition hover:border-border-info hover:bg-surface-info/50 disabled:opacity-50',
    isRecent ? 'border-blue-200 ring-1 ring-inset ring-blue-100' : 'border-border-soft',
  );
  const inner = (
    <>
      <span className="relative shrink-0">
        <StaffAvatar
          staffId={staffId}
          name={name}
          colorHex={colorHex ?? null}
          avatarPhotoId={avatarPhotoId ?? null}
          size="lg"
          ring={false}
        />
        {isRecent && (
          <span
            className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-blue-500 ring-2 ring-surface-card"
            aria-hidden
          />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-role-body font-semibold text-text-default">{name}</span>
        {role != null && (
          <span className="block truncate text-role-eyebrow text-text-soft">
            {role.replace(/_/g, ' ')}
            {pill}
          </span>
        )}
      </span>
      {interactive && (
        <svg
          className="h-4 w-4 shrink-0 text-text-soft transition group-hover:translate-x-0.5 group-hover:text-blue-500"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M9 6l6 6-6 6" />
        </svg>
      )}
    </>
  );

  if (!interactive) {
    return <div className={rowClass}>{inner}</div>;
  }

  return (
    // ds-raw-button: staff-picker row — custom avatar + meta layout, not a DS Button
    <button
      type="button"
      disabled={disabled}
      onClick={() => void onPick()}
      aria-label={ariaLabel ?? (role ? `Sign in as ${name}, ${role}` : `Sign in as ${name}`)}
      className={rowClass}
    >
      {inner}
    </button>
  );
}
