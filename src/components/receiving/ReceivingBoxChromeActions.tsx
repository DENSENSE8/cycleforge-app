'use client';

/**
 * Band-1 CTAs for box stations (Arrival · Unbox): Check · return-to-scan · Add
 * (Export when History earns it).
 *
 * ```text
 *   [⧉] [⊞] [ Export? ]
 *  Check Unbox   labeled, History-only
 * ```
 *
 * **Add is gone** (operator ruling 2026-08-29). Creation lives in the global
 * header's Add menu, which is on every route — so a per-desk copy of it was one
 * more corner to learn and one more place for the two to disagree about what
 * "add" means here.
 *
 * **Check and the resume CTA are icon-only.** Three condensed-uppercase words in
 * a row shouted, and neither glyph is ambiguous at a receiving bench: a
 * clipboard checks, the station mark returns to the station. Their accessible
 * names are unchanged. Export keeps its label — it is browse-only (History), so
 * it appears rarely enough that a glyph alone would not be learned.
 */

import type { ReactNode } from 'react';
import { Download } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import { WORKBENCH_CHROME_PILL_CLASS, WorkbenchChromeActionRow } from '@/components/dashboard/workbench-shell';
import { ChromeCheckButton } from './ChromeCheckButton';
import { cn } from '@/utils/_cn';

// `h-full` — a Band-1 CTA FILLS the PRIMARY chrome row (28px) instead of
// standing at the Button `sm` 32px and bleeding over the band's seam.
const CTA_FACE = cn(
  WORKBENCH_CHROME_PILL_CLASS,
  'h-full font-semibold uppercase tracking-widest',
);

/** Icon-only cube — sized off the row, not off its own text. */
const CTA_ICON_FACE = cn(WORKBENCH_CHROME_PILL_CLASS, 'h-full aspect-square');

export function ReceivingBoxChromeActions({
  onCheck,
  onAdd: _onAdd,
  onExport,
  resumeLabel,
  resumeAriaLabel,
  resumeIcon,
  onResume,
}: {
  onCheck: () => void;
  /**
   * @deprecated Accepted and ignored — Add moved to the global header
   * (2026-08-29). Kept in the signature so the four box-station call sites did
   * not all have to change in the same pass as the chrome relocation.
   */
  onAdd: () => void;
  /** Browse-only (History) — omit and Export is honestly absent. */
  onExport?: () => void;
  resumeLabel: string;
  resumeAriaLabel: string;
  resumeIcon: ReactNode;
  onResume: () => void;
}) {
  return (
    <WorkbenchChromeActionRow>
      <ChromeCheckButton onClick={onCheck} testId="receiving-box-check" />
      <Button
        size="sm"
        variant="primary"
        icon={resumeIcon}
        ariaLabel={resumeAriaLabel}
        onClick={onResume}
        className={CTA_ICON_FACE}
        data-testid="receiving-box-resume"
        title={resumeLabel}
      />
      {onExport ? (
        <Button
          size="sm"
          variant="execute"
          icon={<Download className="h-3.5 w-3.5" />}
          ariaLabel="Export History view as CSV"
          onClick={onExport}
          className={CTA_FACE}
          data-testid="unbox-history-export"
        >
          Export
        </Button>
      ) : null}
    </WorkbenchChromeActionRow>
  );
}
