'use client';

/** Settings child-page chrome — the kiosk-devices back + title, shared. */

import type { ReactNode } from 'react';
import Link from 'next/link';
import { ChevronLeft } from '@/components/Icons';
import { SETTINGS_FLOOR_CLASS } from '@/components/settings/settings-sections';
import { cn } from '@/utils/_cn';

const SETTINGS_HUB_HREF = '/settings';

export function SettingsSectionHeader({
  title,
  backHref = SETTINGS_HUB_HREF,
  backAriaLabel = 'Back to Settings',
  belowSlot,
}: {
  title: string;
  backHref?: string;
  backAriaLabel?: string;
  belowSlot?: ReactNode;
}) {
  return (
    <header className="flex shrink-0 flex-col gap-3">
      <div className="flex items-center gap-2">
        <Link
          href={backHref}
          aria-label={backAriaLabel}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center text-text-default transition-colors hover:text-text-muted print:hidden"
        >
          <ChevronLeft className="h-5 w-5" aria-hidden />
        </Link>
        <h1 className="text-role-title font-semibold text-text-default">{title}</h1>
      </div>
      {belowSlot ? <div className="w-max max-w-full">{belowSlot}</div> : null}
    </header>
  );
}

/** Canvas + hub back header + padded column. Same column the kiosk page uses. */
export function SettingsSectionFrame({
  title,
  backHref,
  backAriaLabel,
  belowSlot,
  maxWidth = '3xl',
  children,
}: {
  title: string;
  backHref?: string;
  backAriaLabel?: string;
  belowSlot?: ReactNode;
  maxWidth?: '3xl' | '5xl';
  children: ReactNode;
}) {
  return (
    <div className={cn('flex h-full min-h-0 w-full flex-col', SETTINGS_FLOOR_CLASS)}>
      <main className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <div
          className={cn(
            'mx-auto flex w-full flex-1 flex-col gap-4 px-6 py-8 sm:px-10',
            maxWidth === '5xl' ? 'max-w-5xl' : 'max-w-3xl',
          )}
        >
          <SettingsSectionHeader
            title={title}
            backHref={backHref}
            backAriaLabel={backAriaLabel}
            belowSlot={belowSlot}
          />
          {children}
        </div>
      </main>
    </div>
  );
}
