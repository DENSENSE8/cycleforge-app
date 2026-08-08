'use client';

/**
 * Band-1 CTAs for box stations (Arrival · Unbox): Check · Add · resume-scan.
 *
 * Order is load-bearing — Add sits between Check and the station resume CTA
 * (Unbox / Arrival). Not the Incoming desk cluster (Import lives only on
 * `/incoming`). Compose inside {@link WorkbenchTrailingCluster} `actions`.
 */

import type { ReactNode } from 'react';
import { ClipboardList, Plus } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import { WORKBENCH_CHROME_PILL_CLASS } from '@/components/dashboard/workbench-shell';
import { cn } from '@/utils/_cn';

export function ReceivingBoxChromeActions({
  onCheck,
  onAdd,
  resumeLabel,
  resumeAriaLabel,
  resumeIcon,
  onResume,
}: {
  onCheck: () => void;
  onAdd: () => void;
  resumeLabel: string;
  resumeAriaLabel: string;
  resumeIcon: ReactNode;
  onResume: () => void;
}) {
  return (
    <>
      <Button
        size="sm"
        onClick={onCheck}
        ariaLabel="Check unreceived orders"
        icon={<ClipboardList />}
        className={cn(
          WORKBENCH_CHROME_PILL_CLASS,
          'font-semibold uppercase tracking-widest bg-slate-700 shadow-sm shadow-slate-700/25 hover:bg-slate-600 active:bg-slate-800',
        )}
        data-testid="receiving-box-check"
      >
        Check
      </Button>
      <Button
        size="sm"
        onClick={onAdd}
        ariaLabel="Add inbound purchase or return"
        icon={<Plus />}
        className={cn(
          WORKBENCH_CHROME_PILL_CLASS,
          'font-semibold uppercase tracking-widest bg-emerald-600 shadow-sm shadow-emerald-600/25 hover:bg-emerald-500 active:bg-emerald-700',
        )}
        data-testid="receiving-box-add"
      >
        Add
      </Button>
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
    </>
  );
}
