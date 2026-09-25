'use client';

/**
 * `/m/reports` — the manager's shift reports, including per-task activity.
 *
 * The day lives HERE, not in each tab: `MobileReportDayStepper` sets it and
 * every report reads it, so a manager walking back to Friday sees Friday's
 * checklist, packers and tracked task time without setting the date twice.
 *
 * TABS NAME STATE, which is the altitude a tab is allowed to name
 * (nav-name-collisions: the LANE names the direction — *Monitor* — the ROW
 * names the object — *Reports* — the TAB names the state). Checklist,
 * Packing and Task time are three reads of a shift, so this is a
 * `TabSwitch`, not another nav row. No `LANE_MOBILE_FIRST` flip and no new
 * door: `/m/reports` is already registered and already gated `operations.view`.
 */

import { useState } from 'react';
import { TabSwitch } from '@/design-system/components/TabSwitch';
import { MobileReportDayStepper } from '@/components/mobile/reports/MobileReportDayStepper';
import { MobileStaffDayReport } from '@/components/mobile/reports/MobileStaffDayReport';
import { MobilePackerDayReport } from '@/components/mobile/reports/MobilePackerDayReport';
import { MobileTaskActivityReport } from '@/components/mobile/reports/MobileTaskActivityReport';
import { getCurrentPSTDateKey } from '@/utils/date';

type ReportTab = 'checklist' | 'packing' | 'activity';

// `TabSwitch` takes a mutable `Tab[]`, so this is not `readonly` — a shared
// module-level array is still fine: nothing mutates it.
const TABS: Array<{ id: ReportTab; label: string }> = [
  { id: 'checklist', label: 'Checklist' },
  { id: 'packing', label: 'Packing' },
  { id: 'activity', label: 'Task time' },
];

export function MobileReportsView() {
  const today = getCurrentPSTDateKey();
  const [dateKey, setDateKey] = useState(today);
  const [tab, setTab] = useState<ReportTab>('checklist');

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="px-4 pt-3">
        <MobileReportDayStepper dateKey={dateKey} today={today} onDateKey={setDateKey} />
        <TabSwitch
          tabs={TABS}
          activeTab={tab}
          onTabChange={(next) => setTab(next as ReportTab)}
          className="pb-3"
        />
      </div>

      {tab === 'checklist' ? (
        <MobileStaffDayReport dateKey={dateKey} />
      ) : tab === 'packing' ? (
        <MobilePackerDayReport dateKey={dateKey} />
      ) : (
        <MobileTaskActivityReport dateKey={dateKey} />
      )}
    </div>
  );
}
