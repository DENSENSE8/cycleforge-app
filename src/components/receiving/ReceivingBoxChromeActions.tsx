'use client';

/**
 * Band-1 CTAs for box stations (Arrival · Unbox): Check · return-to-scan · Add
 * (Export when History earns it).
 *
 * ```text
 *   REQUIRED
 *   [ Check ] [ UNBOX ] [ Export? ] [ Add ]
 *                                    labeled global CTA (Plus + Add)
 * ```
 *
 * **Add is pinned far-right on every tab.** It is the row's one create verb, so
 * it takes the fixed corner an operator reaches for without looking; Export is
 * History-only and would otherwise shift Add's position from tab to tab.
 *
 * Check · resume · Add are labeled peer CTAs — everyday Band-1 verbs at button
 * altitude, not buried icon cubes. Export is browse-only (History) and stays a
 * labeled peer when earned; honest absence otherwise. Plus is the Add icon, not
 * a separate cell. Detail: `display/workbench-ops-queue.md` → Trailing Display &
 * Actions (`[ Check | Unbox ]` + Add CTA on Unbox Band 1).
 */

import type { ReactNode } from 'react';
import { Download, Plus } from '@/components/Icons';
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

export function ReceivingBoxChromeActions({
  onCheck,
  onAdd,
  onExport,
  resumeLabel,
  resumeAriaLabel,
  resumeIcon,
  onResume,
}: {
  onCheck: () => void;
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
        className={CTA_FACE}
        data-testid="receiving-box-resume"
      >
        {resumeLabel}
      </Button>
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
      <Button
        size="sm"
        variant="success"
        icon={<Plus className="h-3.5 w-3.5" />}
        ariaLabel="Add inbound purchase or return"
        onClick={onAdd}
        className={CTA_FACE}
        data-testid="receiving-box-add"
      >
        Add
      </Button>
    </WorkbenchChromeActionRow>
  );
}
