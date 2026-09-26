'use client';

/** The station centre block face — flush eyebrow header, optionally a height-collapsing body. */

import type { ComponentType, ReactNode } from 'react';
import { ChevronDown } from '@/components/Icons';
import { STATION_CHROME_SEAM_HAIRLINE } from '@/components/station/entity-context/station-identity-chrome';
import { Button } from '@/components/ui/button';
import { cn } from '@/utils/_cn';

const LABEL_FACE =
  'inline-flex min-w-0 items-center gap-1.5 text-role-eyebrow uppercase tracking-widest text-text-soft';

const HAIRLINE_FACE =
  'inline-flex min-w-0 items-center gap-1.5 text-role-micro uppercase tracking-widest text-text-faint';

export type StationBlockFace = 'label' | 'hairline';

/**
 * A band's identity glyph. House icons are `({ className }) => JSX`, so that is
 * the contract — not a `ReactNode`, because the block sizes the glyph itself and
 * a node slot would let one band paint a 24px icon into a 12px strip.
 */
export type StationBlockIcon = ComponentType<{ className?: string }>;

/** Leading glyph size — icons read before words, and never grow the strip. */
const BLOCK_ICON_CLASS = 'h-3.5 w-3.5 shrink-0';

/** Trailing disclose chevron — same pitch as the identity glyph. */
const CHEVRON_CLASS = 'h-3.5 w-3.5 shrink-0 text-text-faint';

export function StationBlockLabel({
  label,
  icon: Icon,
  count,
  action,
  open,
  onToggle,
  face = 'label',
  seam = true,
  className,
}: {
  label: string;
  /**
   * Identity glyph, drawn LEFT of the word — a band is recognised by its shape
   * at bench distance long before it is read. Optional: a band with no glyph
   * renders exactly as it did before this existed.
   */
  icon?: StationBlockIcon;
  /** Trailing count — omit rather than paint a zero the operator must decode. */
  count?: ReactNode;
  action?: ReactNode;
  /** Disclosure state. Omit together with {@link onToggle} for a plain label. */
  open?: boolean;
  /**
   * Omit for a label-only header. Also legitimately CONDITIONAL: carton's
   * Activity offers the toggle only when there is more than one event, and a
   * required handler forced a no-op button onto a header with nothing to open.
   */
  onToggle?: () => void;
  /** `hairline` = quieter scan-station strip. The row is still the click target. */
  face?: StationBlockFace;
  /** Draw the header's own rule. */
  seam?: boolean;
  /** Plane for the header strip (station-skin header fill). */
  className?: string;
}) {
  const identity = (
    <>
      {Icon ? <Icon className={BLOCK_ICON_CLASS} /> : null}
      {label}
    </>
  );

  const trailingMeta = (
    <>
      {count != null ? (
        <span className="text-role-micro uppercase tracking-widest tabular-nums text-text-faint">
          {count}
        </span>
      ) : null}
      {action}
    </>
  );

  if (onToggle) {
    const isHairline = face === 'hairline';
    return (
      <div
        className={cn(
          'relative flex w-full min-h-8 min-w-0 flex-nowrap items-center justify-start gap-1 px-3',
          !isHairline && seam ? STATION_CHROME_SEAM_HAIRLINE : null,
          className,
        )}
        data-block-face={isHairline ? 'hairline' : 'label'}
      >
        {isHairline && seam ? (
          <span
            aria-hidden
            // `border-subtle`, not `border-hairline`: the hairline token is
            // `#f1f5f9` — the same hex as `surface-sunken` — so on a white
            // sheet it is a line the colour of a fill and reads as nothing.
            className="absolute inset-x-0 top-0 h-px bg-border-subtle"
          />
        ) : null}
        {/* Full-row hit target — the header IS the control, not a 12px seam. */}
        <Button
          variant="ghost"
          size="eyebrow"
          onClick={onToggle}
          data-collapse-toggle
          aria-expanded={open}
          aria-label={open ? `Collapse ${label}` : `Expand ${label}`}
          className={cn(
            'absolute inset-0 z-0 h-full w-full min-w-0 cursor-pointer px-0',
            className ? 'hover:bg-surface-station-header-hover' : null,
          )}
        />
        <span
          className={cn(
            'pointer-events-none relative z-10 shrink-0 whitespace-nowrap',
            isHairline ? HAIRLINE_FACE : LABEL_FACE,
          )}
        >
          {identity}
        </span>
        <span className="relative z-10 ml-auto flex shrink-0 items-center gap-1">
          {trailingMeta}
          <ChevronDown
            aria-hidden
            className={cn(CHEVRON_CLASS, 'pointer-events-none', open ? 'rotate-0' : '-rotate-90')}
          />
        </span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex w-full min-h-6 items-center justify-between gap-2',
        seam ? STATION_CHROME_SEAM_HAIRLINE : null,
        className,
      )}
      data-block-face="label"
    >
      <span className={LABEL_FACE}>{identity}</span>
      <span className="flex shrink-0 items-center gap-1">{trailingMeta}</span>
    </div>
  );
}

/** The centre's "Collapse all" — one control, not one per station. */
export function StationCollapseAllAction({
  onCollapseAll,
}: {
  onCollapseAll: () => void;
}) {
  return (
    <Button
      variant="eyebrow"
      size="eyebrow"
      onClick={(e) => {
        // The whole header row is the band's own disclose hit target.
        e.stopPropagation();
        onCollapseAll();
      }}
      className="relative z-10"
      aria-label="Collapse all centre bands"
      data-testid="station-collapse-all"
    >
      Collapse all
    </Button>
  );
}

/** The way back when every band is a closed row — rides the first header. */
export function StationExpandAllAction({
  onExpandAll,
}: {
  onExpandAll: () => void;
}) {
  return (
    <Button
      variant="eyebrow"
      size="eyebrow"
      onClick={(e) => {
        e.stopPropagation();
        onExpandAll();
      }}
      className="relative z-10"
      aria-label="Expand all centre bands"
      data-testid="station-expand-all"
    >
      Expand all
    </Button>
  );
}

export function StationCollapsibleBlock({
  label,
  icon,
  count,
  action,
  collapsed,
  onToggle,
  children,
  bodyClassName,
  testId,
  bandId,
  face = 'label',
  seam = true,
  className,
  headerClassName,
}: {
  label: string;
  /** Identity glyph, drawn left of the word. See {@link StationBlockLabel}. */
  icon?: StationBlockIcon;
  /** Trailing count — omit rather than paint a zero the operator must decode. */
  count?: ReactNode;
  action?: ReactNode;
  collapsed: boolean;
  onToggle: () => void;
  children: ReactNode;
  bodyClassName?: string;
  testId?: string;
  /** Stable band id — the pin key. Painted as `data-station-band`. */
  bandId?: string;
  face?: StationBlockFace;
  /** Draw the header's own rule. See {@link StationBlockLabel}. */
  seam?: boolean;
  /**
   * The block's own plane. In a well the host paints the white card face here;
   * standalone it stays unset and the block is transparent chrome.
   */
  className?: string;
  /** Birch bench strip on scan-station headers. */
  headerClassName?: string;
}) {
  return (
    // `shrink-0` unconditionally: in a bounded centre column the flexible
    // sibling (a thread) must absorb the slack, never this block. Every host
    // wants that, so it is not a prop.
    <section
      data-testid={testId}
      data-station-band={bandId}
      data-collapsed={collapsed || undefined}
      className={cn('shrink-0', className)}
    >
      <StationBlockLabel
        label={label}
        icon={icon}
        count={count}
        action={action}
        open={!collapsed}
        onToggle={onToggle}
        face={face}
        seam={seam}
        className={headerClassName}
      />

      {collapsed ? null : <div className={bodyClassName}>{children}</div>}
    </section>
  );
}
