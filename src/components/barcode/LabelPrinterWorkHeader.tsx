'use client';

/**
 * Labels / Racks workbench header — title leading; Reset immediately left of
 * the Single|Bulk slider.
 *
 * Callers: BinBuilderDesktop/Mobile (~L31–47), RackBuilderDesktop/Mobile (~L31–47).
 * Existing file — not a second header. No data schemas.
 * User: "Move the reset button to the left of the single and bulk slider" /
 * "slider… must use the same component as the kiosk devices slider" /
 * "remove this old blocky no corner Radius Design"
 *
 * Token use cases:
 * - Reset → Button `secondary` size sm (h-8).
 * - Print mode → TabSwitch size sm (h-8) + inverse (white on black — not accent).
 */

import { ChevronLeft } from '@/components/Icons';
import { TabSwitch } from '@/design-system/components';
import { Button } from '@/design-system/primitives';
import { cn } from '@/utils/_cn';

export type LabelPrintWorkMode = 'single' | 'bulk';

type LabelPrinterWorkHeaderProps = {
  title: string;
  subtitle?: string;
  titleClassName?: string;
  showReset: boolean;
  onReset: () => void;
  mode: LabelPrintWorkMode;
  onModeChange: (mode: LabelPrintWorkMode) => void;
};

export function LabelPrinterWorkHeader({
  title,
  subtitle,
  titleClassName,
  showReset,
  onReset,
  mode,
  onModeChange,
}: LabelPrinterWorkHeaderProps) {
  return (
    <header className="flex items-start gap-3">
      <div className="min-w-0 flex-1 text-center sm:text-left">
        <h1
          className={cn(
            'truncate text-role-title text-text-default',
            titleClassName,
          )}
        >
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-1 text-role-caption text-text-soft">{subtitle}</p>
        ) : null}
      </div>

      {/* Reset + print grain — Reset sits immediately left of TabSwitch */}
      <div className="flex shrink-0 items-center gap-2 pt-0.5">
        {showReset ? (
          <Button
            variant="secondary"
            size="sm"
            onClick={onReset}
            icon={<ChevronLeft className="h-3.5 w-3.5" />}
          >
            Reset
          </Button>
        ) : null}
        <div role="group" aria-label="Print mode" className="flex h-8 items-stretch">
          <TabSwitch
            fit="hug"
            size="sm"
            solidTone="inverse"
            tabs={[
              { id: 'single', label: 'Single' },
              { id: 'bulk', label: 'Bulk' },
            ]}
            activeTab={mode}
            onTabChange={(id) => onModeChange(id === 'bulk' ? 'bulk' : 'single')}
          />
        </div>
      </div>
    </header>
  );
}
