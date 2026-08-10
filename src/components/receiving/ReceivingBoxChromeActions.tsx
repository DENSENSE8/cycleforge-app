'use client';

/**
 * Band-1 CTAs for box stations (Arrival · Unbox): ONE data cube + the
 * return-to-scan CTA.
 *
 * ```text
 *   BANNED                                         REQUIRED
 *   [⇩] [☑] [+] [ UNBOX ]                          [ UNBOX ] [+]
 *   [+] [ UNBOX ]   (cube left of resume)          resume, then Plus far-right
 * ```
 *
 * Export · Check · Add are three verbs of ONE topic — this table's data — so
 * they are tabs inside a single cube, not three glyphs an operator has to parse
 * to find one job. House law: `AGENTS.md` → Band-1 same-topic controls are tabs;
 * detail in `display/workbench-ops-queue.md` → Trailing Display & Actions.
 *
 * The return-to-scan CTA keeps its solid primary fill and its own cell: it is a
 * different topic (leave the table, resume the bench), it is the only control
 * on the row that is not a utility, and a scan station must expose it visibly
 * (`AGENTS.md` → return-to-scan; `display/workbench.md` → Multi-region pages).
 * When both exist, resume sits left of the Plus cube — Plus is always the
 * far-right utility cell.
 */

import type { ReactNode } from 'react';
import { ClipboardList, Download, Plus } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import { WORKBENCH_CHROME_PILL_CLASS } from '@/components/dashboard/workbench-shell';
import { WORKBENCH_CHROME_CUBE_GLYPH_CLASS } from '@/components/dashboard/workbench-chrome-cube';
import {
  WorkbenchChromeCubeMenu,
  WorkbenchChromeMenuAction,
  type WorkbenchChromeMenuTab,
} from '@/components/dashboard/workbench-chrome-cube-menu';
import { cn } from '@/utils/_cn';

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
  /** Browse-only (History) — omit and the Export tab is honestly absent. */
  onExport?: () => void;
  resumeLabel: string;
  resumeAriaLabel: string;
  resumeIcon: ReactNode;
  onResume: () => void;
}) {
  const tabs: WorkbenchChromeMenuTab[] = [
    {
      id: 'add',
      label: 'Add',
      content: (
        <WorkbenchChromeMenuAction
          label="Add inbound"
          ariaLabel="Add inbound purchase or return"
          description="Opens the intake form on the right rail — one purchase or return."
          icon={<Plus className="h-3.5 w-3.5" />}
          onClick={onAdd}
          data-testid="receiving-box-add"
        />
      ),
    },
    {
      id: 'check',
      label: 'Check',
      content: (
        <WorkbenchChromeMenuAction
          label="Check unreceived"
          ariaLabel="Check unreceived orders"
          description="Paste tracking numbers to reconcile what has not been received yet."
          icon={<ClipboardList className="h-3.5 w-3.5" />}
          onClick={onCheck}
          data-testid="receiving-box-check"
        />
      ),
    },
  ];

  if (onExport) {
    tabs.push({
      id: 'export',
      label: 'Export',
      content: (
        <WorkbenchChromeMenuAction
          label="Export CSV"
          ariaLabel="Export History view as CSV"
          description="Downloads the rows this view is showing, with its current columns."
          icon={<Download className="h-3.5 w-3.5" />}
          onClick={onExport}
          data-testid="unbox-history-export"
        />
      ),
    });
  }

  return (
    <>
      <Button
        size="sm"
        variant="primary"
        icon={resumeIcon}
        ariaLabel={resumeAriaLabel}
        onClick={onResume}
        className={cn(
          WORKBENCH_CHROME_PILL_CLASS,
          'font-semibold uppercase tracking-widest',
        )}
        data-testid="receiving-box-resume"
      >
        {resumeLabel}
      </Button>
      <WorkbenchChromeCubeMenu
        label="Add or manage this table's data"
        icon={<Plus className={WORKBENCH_CHROME_CUBE_GLYPH_CLASS} />}
        tabs={tabs}
        data-testid="receiving-box-data-menu"
      />
    </>
  );
}
