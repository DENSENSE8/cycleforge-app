'use client';

/**
 * Band-1 chrome CUBE — the one face for a workbench chrome-row icon cell.
 *
 * The leading pin-list and every trailing utility CTA wear the SAME boxed cube
 * as the station identity bar's Exit / Back-to-list
 * ({@link STATION_CONTEXT_BOXED_CUBE_CLASS}), so a scan station's Band 1 reads
 * as one row of peer cells instead of a pin on the left and a parade of
 * coloured pills on the right.
 *
 * ```text
 * Band 1   [📌] [ Recent | Queue | History ] ……………  [⇩] [☑] [+] [ UNBOX ]
 *           cube                                     cube cube cube  solid
 * ```
 *
 * **`self-stretch aspect-square`, never a hand-set `h-8 w-8`.** The leading slot
 * is `items-stretch` and the trailing cluster is `items-center`, so only
 * `self-stretch` fills the band in BOTH — and it tracks
 * `PRIMARY_CHROME_ROW_FACE` if the row height ever moves, which a pinned 32px
 * square would not (it already overflowed the 28px band).
 *
 * **The return-to-scan CTA is the documented exception and stays SOLID.** A
 * scan station must expose a solid primary that resumes the bench
 * (`AGENTS.md` → return-to-scan; `display/workbench.md` → Multi-region pages) —
 * it is the one control on the row that is not a utility, and flattening it
 * into a cube would hide the exit an operator needs mid-shift.
 */

import type { ReactNode } from 'react';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { STATION_CONTEXT_BOXED_CUBE_CLASS } from '@/components/station/entity-context/station-context-action-pill';
import { cn } from '@/utils/_cn';

/** Compose on a raw `<button>` (Radix `asChild` triggers) — never `IconButton`. */
export const WORKBENCH_CHROME_CUBE_CLASS = cn(
  STATION_CONTEXT_BOXED_CUBE_CLASS,
  'self-stretch aspect-square',
);

/** Glyph size inside the cube — pinned by the token's own contract. */
export const WORKBENCH_CHROME_CUBE_GLYPH_CLASS = 'block h-3.5 w-3.5 shrink-0';

/**
 * A Band-1 utility CTA. Icon-only by construction: the verb lives in the
 * tooltip and the accessible name, so the row stays scannable at bench
 * distance and a fourth control never pushes the tab rail into a scroll.
 */
export function WorkbenchChromeCubeButton({
  label,
  icon,
  onClick,
  disabled = false,
  active = false,
  'data-testid': testId,
}: {
  /** Tooltip + accessible name — the verb, e.g. "Check unreceived orders". */
  label: string;
  icon: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  /** Lit face while an owned popover / rail is open. */
  active?: boolean;
  'data-testid'?: string;
}) {
  return (
    <HoverTooltip label={label} asChild>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        data-testid={testId}
        className={cn(
          WORKBENCH_CHROME_CUBE_CLASS,
          active && 'bg-surface-hover text-text-muted',
          'disabled:opacity-40',
        )}
      >
        {icon}
      </button>
    </HoverTooltip>
  );
}
