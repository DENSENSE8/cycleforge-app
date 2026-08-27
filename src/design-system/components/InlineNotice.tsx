'use client';

import type { ReactNode } from 'react';
import { X } from '@/components/Icons';
import { TOP_CHROME_ICON_GLYPH } from '@/components/layout/header-shell';
import { IconButton } from '@/design-system/primitives';
import { cornerClass } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';

type InlineNoticeTone = 'neutral' | 'info' | 'success' | 'warning' | 'error';
type InlineNoticeSize = 'sm' | 'md';

interface InlineNoticeProps {
  tone?: InlineNoticeTone;
  size?: InlineNoticeSize;
  title?: ReactNode;
  /**
   * Leading mark. When set, paints in a condition-Tags face column (`w-11`,
   * glyph {@link TOP_CHROME_ICON_GLYPH}) — same display method as the Unbox
   * serial-bar grade square. Pass a bare glyph (size comes from the face).
   */
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Optional dismiss control — X pinned to the far right of the band. */
  onDismiss?: () => void;
  /**
   * Drop top pad so the band can sit flush under a scan row (serial card,
   * unit slot). Prefer the default even inset unless the band must abut
   * chrome with zero air above.
   */
  flushTop?: boolean;
}

const toneClasses: Record<InlineNoticeTone, string> = {
  neutral: 'border-border-soft bg-surface-canvas text-text-muted divide-border-soft',
  info: 'border-blue-200 bg-blue-50 text-blue-800 divide-blue-200',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-800 divide-emerald-200',
  warning: 'border-amber-200 bg-amber-50 text-amber-800 divide-amber-200',
  error: 'border-red-200 bg-red-50 text-red-800 divide-red-200',
};

const titleSizeClasses: Record<InlineNoticeSize, string> = {
  sm: 'text-role-eyebrow tracking-[0.14em]',
  md: 'text-role-micro tracking-[0.16em]',
};

const bodySizeClasses: Record<InlineNoticeSize, string> = {
  sm: 'text-role-micro leading-4',
  md: 'text-role-caption leading-5',
};

/**
 * Leading icon face — peer of ConditionPills collapsed Tags (`h-11 w-11` bar).
 * Width locked to `w-11`; height stretches with the notice so the glyph stays
 * optically centered in the column.
 */
const ICON_FACE =
  'flex w-11 shrink-0 items-center justify-center self-stretch';

const ICON_GLYPH_BOX = cn(
  'flex shrink-0 items-center justify-center',
  TOP_CHROME_ICON_GLYPH,
  '[&>svg]:h-full [&>svg]:w-full',
);

export function InlineNotice({
  tone = 'neutral',
  size = 'md',
  title,
  icon,
  children,
  className = '',
  onDismiss,
  flushTop = false,
}: InlineNoticeProps) {
  const hasIcon = Boolean(icon);
  const contentPad = flushTop
    ? size === 'sm'
      ? 'px-3 pb-2 pt-0'
      : 'px-4 pb-3 pt-0'
    : size === 'sm'
      ? 'inset-field'
      : 'inset-card';

  return (
    <div
      className={cn(
        'border',
        // Ops flush — square band under the scan row (not soft card chrome).
        cornerClass('flush'),
        hasIcon ? 'flex items-stretch divide-x' : contentPad,
        toneClasses[tone],
        className,
      )}
    >
      {hasIcon ? (
        <div className={ICON_FACE} aria-hidden={title ? true : undefined}>
          <span className={ICON_GLYPH_BOX}>{icon}</span>
        </div>
      ) : null}
      <div
        className={cn(
          'flex min-w-0 flex-1 items-center gap-2',
          hasIcon && contentPad,
        )}
      >
        <div className="min-w-0 flex-1">
          {title ? (
            <p className={`font-semibold uppercase ${titleSizeClasses[size]}`}>
              {title}
            </p>
          ) : null}
          <div className={`${bodySizeClasses[size]} font-medium ${title ? 'mt-1' : ''}`.trim()}>
            {children}
          </div>
        </div>
        {onDismiss ? (
          <IconButton
            type="button"
            size="xs"
            ariaLabel="Dismiss notice"
            onClick={onDismiss}
            icon={<X className="h-3.5 w-3.5" />}
            className="-mr-0.5 shrink-0 self-center text-current opacity-60 hover:opacity-100"
          />
        ) : null}
      </div>
    </div>
  );
}
