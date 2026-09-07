import type { ReactNode } from 'react';
import { motion } from '@/design-system/motion';
import { RefreshCw } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { framerTransition } from '@/design-system/foundations/motion-framer';
import { sectionLabel, dataValue } from '@/design-system/tokens/typography/presets';
import { cn } from '@/utils/_cn';

export function SidebarSection({
  title,
  expanded,
  onToggle,
  children,
}: {
  title: string;
  expanded: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section className="border-b border-border-soft last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="ds-raw-button flex w-full items-center justify-between border-b border-border-soft px-0 py-0 text-left hover:bg-surface-hover"
      >
        <span className={`px-4 py-3 ${sectionLabel}`}>{title}</span>
        <span className="inline-flex h-full w-12 items-center justify-center border-l border-border-soft text-text-muted">
          <span className="relative h-3.5 w-3.5">
            <span className="absolute left-0 top-1/2 h-px w-3.5 -translate-y-1/2 bg-current" />
            <motion.span
              initial={false}
              animate={{ scaleY: expanded ? 0 : 1, opacity: expanded ? 0 : 1 }}
              transition={framerTransition.overlayScrim}
              className="absolute left-1/2 top-0 h-3.5 w-px -translate-x-1/2 bg-current origin-center"
            />
          </span>
        </span>
      </button>
      {expanded && <div className="bg-surface-card">{children}</div>}
    </section>
  );
}

export function LineItem({
  label,
  detail,
  right,
}: {
  label: string;
  detail?: string;
  right: ReactNode;
}) {
  return (
    <div className="flex items-stretch justify-between gap-3 border-b border-border-soft bg-surface-card">
      <div className="min-w-0 px-4 py-3">
        <p className={dataValue}>{label}</p>
        {detail ? (
          <p className="mt-0.5 text-role-caption leading-relaxed text-text-soft">{detail}</p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-stretch gap-0">{right}</div>
    </div>
  );
}

/**
 * Action cell. Promoted from the 48px sidebar rail to a full page
 * (admin dissolution W3c), so it finally has room for WORDS: a labeled button
 * (glance-verified, not a two-letter glyph) with the tone tokens — the raw
 * blue/green/indigo palette it grew up with retired with the rail.
 */
export function ActionButton({
  onClick,
  loading,
  title,
  label,
  tone = 'default',
  disabled,
}: {
  onClick: () => void;
  loading?: boolean;
  title: string;
  /** Visible button text; falls back to the title. */
  label?: string;
  tone?: 'default' | 'info' | 'success';
  disabled?: boolean;
}) {
  const toneClass =
    tone === 'info'
      ? 'border-l border-border-info bg-surface-info text-text-info hover:bg-surface-hover'
      : tone === 'success'
        ? 'border-l border-border-success bg-surface-success text-text-success hover:bg-surface-hover'
        : 'border-l border-border-soft bg-surface-card text-text-default hover:bg-surface-sunken';

  return (
    <HoverTooltip label={title} focusable={false} asChild>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled || loading}
        className={cn(
          'ds-raw-button inline-flex h-full items-center gap-1.5 px-3 text-role-caption font-semibold transition-colors disabled:opacity-50',
          toneClass,
        )}
      >
        <RefreshCw className={cn('h-3.5 w-3.5 shrink-0', loading && 'animate-spin')} aria-hidden />
        {label ?? title}
      </button>
    </HoverTooltip>
  );
}
