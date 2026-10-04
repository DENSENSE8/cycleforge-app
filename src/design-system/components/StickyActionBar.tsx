'use client';

import type { ReactNode } from 'react';
import { AlertCircle, Check, Loader2 } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { ACTION_DOCK_LIFT, ACTION_DOCK_TOP_GAP } from '@/design-system/tokens/dock-clearance';

export type StickyActionTone = 'blue' | 'emerald' | 'orange' | 'violet' | 'red' | 'gray';

interface PrimaryAction {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  isLoading?: boolean;
  tone?: StickyActionTone;
  /** Override the tone palette with arbitrary Tailwind classes — used when the
   *  caller drives color from a dynamic source (e.g. station theme per row). */
  toneClasses?: { bg: string; hover: string };
  icon?: ReactNode;
  /** Title attribute for the main CTA (helps explain disabled states). */
  title?: string;
  /** Chord that fires the CTA (`'mod + P'`) — shown only in its hover tooltip, never painted in the bar. */
  shortcut?: string;
}

interface SecondaryAction {
  label: string;
  onClick: () => void;
  icon?: ReactNode;
  disabled?: boolean;
}

interface StickyActionBarProps {
  primary: PrimaryAction;
  secondary?: SecondaryAction;
  /** Optional error banner rendered above the buttons. */
  error?: ReactNode;
  /** Max width of the button row, centred under the panel body. Defaults to `max-w-3xl`. */
  maxWidth?: string;
}

const TONE_BG: Record<StickyActionTone, string> = {
  blue: 'bg-blue-600 hover:bg-blue-700',
  emerald: 'bg-emerald-600 hover:bg-emerald-700',
  orange: 'bg-orange-600 hover:bg-orange-700',
  violet: 'bg-violet-700 hover:bg-violet-800',
  red: 'bg-rose-600 hover:bg-rose-700',
  gray: 'bg-surface-inverse hover:bg-surface-inverse-hover',
};

/**
 * The desk panel's sticky "do the thing" buttons (receiving, label printer,
 * pairing). Bottom verbs FLOAT (owner 2026-10-03): no bar, no rule, no ground
 * fill behind them — only the buttons, opaque, lifted off the bottom edge by
 * `ACTION_DOCK_LIFT`. The band ignores presses; only its buttons take them.
 * Mount it as the last child of the scrolling panel body.
 */
export function StickyActionBar({ primary, secondary, error, maxWidth = 'max-w-3xl' }: StickyActionBarProps) {
  const tone = primary.tone ?? 'blue';
  const fill = primary.disabled
    ? 'cursor-not-allowed bg-surface-strong text-text-muted'
    : `${primary.toneClasses ? `${primary.toneClasses.bg} ${primary.toneClasses.hover}` : TONE_BG[tone]} text-white`;

  return (
    <div className={`pointer-events-none sticky bottom-0 z-10 mt-auto ${ACTION_DOCK_TOP_GAP} ${ACTION_DOCK_LIFT}`}>
      <div className={`mx-auto flex w-full ${maxWidth} flex-col gap-2 px-4 sm:px-6`}>
        {error ? (
          <div className="pointer-events-auto flex items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-role-caption font-semibold text-red-700">
            <AlertCircle className="h-3.5 w-3.5" />
            {error}
          </div>
        ) : null}
        <div className="flex w-full min-w-0 items-stretch gap-2">
          {secondary ? (
            <button
              type="button"
              onClick={secondary.onClick}
              disabled={secondary.disabled}
              className="pointer-events-auto inline-flex h-12 items-center justify-center gap-1.5 rounded-xl border border-border-soft bg-surface-card px-4 text-sm font-semibold text-text-muted shadow-md transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:text-text-faint disabled:shadow-none"
            >
              {secondary.icon}
              <span>{secondary.label}</span>
            </button>
          ) : null}
          <HoverTooltip asChild label={primary.label} shortcut={primary.shortcut} disabled={!primary.shortcut}>
            <button
              type="button"
              onClick={primary.onClick}
              disabled={primary.disabled || primary.isLoading}
              title={primary.title}
              className={`pointer-events-auto inline-flex h-12 w-full min-w-0 flex-1 items-center justify-center gap-2.5 rounded-xl px-6 text-sm font-semibold shadow-md transition-all ${fill}`}
            >
              {primary.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : (primary.icon ?? <Check className="h-4 w-4" />)}
              <span>{primary.label}</span>
            </button>
          </HoverTooltip>
        </div>
      </div>
    </div>
  );
}
