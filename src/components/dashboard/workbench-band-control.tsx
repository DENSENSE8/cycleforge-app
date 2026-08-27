'use client';

/**
 * Band-3 control CUBE — the ONE face for a triage-row control cell.
 *
 * ```text
 * Band 3   [ find …………………………………………… ][⧉]  [🔖 Recent] [⌃] [▥]
 *            search owns the left            Views     KPI  inspector
 * ```
 *
 * **Why this exists.** The right cluster is supposed to read as peers, and it
 * did not: Views was a 24px `IconButton xs` with a hand-painted blue fill, KPI
 * a 24px `IconButton xs` at `text-text-faint`, and the inspector a 28px
 * `IconButton sm` at `text-text-soft` with a 16px glyph and no lit state at
 * all. Three rungs, three resting tones, three glyph sizes, one row — the same
 * "ragged parade" `photos-railless-frame.spec.ts` pins Band 2 against, one band
 * down. Sameness by assertion again: nothing could notice, because each control
 * was only ever compared to itself.
 *
 * **The rung is the ROW's rung.** The box composes
 * {@link PRIMARY_CHROME_ROW_FACE} rather than pinning its own `h-6`/`h-7`, so a
 * control tracks the band if the band ever moves — the same reasoning as
 * {@link WORKBENCH_CHROME_CUBE_CLASS} on Band 1, which reaches it through
 * `self-stretch`. This band cannot use `self-stretch`: its right cluster is
 * `items-center` and hosts caller content (counts, staff pickers) that must
 * stay vertically centred, so the height comes from the shared token instead.
 *
 * **`lit` is for a control that is CHANGING something, not for one that is on.**
 * Views lights when a saved view is applied; the inspector lights while it is
 * pushed open. KPI never lights — its chevron already says which way the band
 * is, and a fill would be chrome telling the same fact twice (law 1: chrome
 * never invents a second story). Default-state controls that light on load are
 * decoration, not state.
 */

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { PRIMARY_CHROME_ROW_FACE } from '@/components/layout/header-shell';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { cornerClass } from '@/design-system/tokens/radius';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';

/** Glyph size inside the cell — one box for every band control. */
export const WORKBENCH_BAND_CONTROL_GLYPH_CLASS = 'h-3.5 w-3.5 shrink-0';

export interface WorkbenchBandControlProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'type' | 'aria-label'> {
  icon: ReactNode;
  /** Tooltip text, and the accessible name unless {@link ariaLabel} says more. */
  label: string;
  /**
   * Accessible name when it must carry more than the tooltip shows (Views says
   * "Saved view: Recent" where the tooltip says "Recent"). Must still contain
   * {@link text} when there is one — WCAG 2.5.3 label-in-name.
   */
  ariaLabel?: string;
  /**
   * Visible name beside the glyph. Omit for an icon-only cell (the square
   * cube); pass it where the control's VALUE is the thing an operator needs
   * while it is closed — which today is Views, and only Views.
   */
  text?: string;
  /** Solid-blue face — see the `lit` note above before reaching for it. */
  lit?: boolean;
}

export const WorkbenchBandControl = forwardRef<HTMLButtonElement, WorkbenchBandControlProps>(
  function WorkbenchBandControl(
    { icon, label, ariaLabel, text, lit = false, className, ...rest },
    ref,
  ) {
    return (
      // Tooltip survives a visible label: the name truncates at 14ch, and 14ch is
      // not every view name.
      <HoverTooltip label={label} asChild>
        {/*
          ds-raw-button: `IconButton` is icon-only by contract so it cannot hold
          the name, and `ToolbarButton` is a soft `rounded-lg` uppercase-eyebrow
          pill — wrong corner and wrong type role for flush ops chrome. One hit
          target over glyph + name, so the name is part of the control rather
          than decoration parked beside it.
        */}
        <button
          ref={ref}
          type="button"
          aria-label={ariaLabel ?? label}
          className={cn(
            'ds-raw-button inline-flex items-center justify-center gap-1 text-role-caption transition-colors duration-100 ease-out active:scale-95',
            PRIMARY_CHROME_ROW_FACE,
            text ? 'px-1.5' : 'aspect-square',
            cornerClass('flush'),
            focusRing('control'),
            lit
              ? 'bg-blue-600 text-white hover:bg-blue-600 hover:text-white'
              : 'text-text-muted hover:bg-surface-hover hover:text-text-default',
            className,
          )}
          {...rest}
        >
          {/*
            Text LEADS, glyph TRAILS. A named control is read as a value — the
            view you are in — and the glyph is the affordance that says it opens.
            Leading the glyph made the name look like a caption hung off an icon
            button; trailing it makes the row read `Recent ▾`, the way every other
            value-bearing control in the product reads. Icon-only cells are
            unaffected: with no text the order cannot show.
          */}
          {text ? <span className="max-w-[14ch] truncate">{text}</span> : null}
          {icon}
        </button>
      </HoverTooltip>
    );
  },
);
