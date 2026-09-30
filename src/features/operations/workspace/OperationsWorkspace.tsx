'use client';

/** Right-pane router for the Operations master page. */

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useOperationsMode } from '@/components/sidebar/operations/useOperationsMode';
import { useAssistantContext } from '@/hooks/useAssistantContext';
import { OPERATIONS_SKILL } from '@/lib/assistant/page-skills';
import { OperationsDashboard } from '@/features/operations/components/OperationsDashboard';
import { OperationsHistoryView } from './OperationsHistoryView';
import { OperationsReconciliationView } from './OperationsReconciliationView';
import { OperationsChecksView } from './OperationsChecksView';
import { OperationsTvBoard } from './OperationsTvBoard';
import { SignalsWorkspace } from '@/features/signals/SignalsWorkspace';
// Admin-dissolution ports: self-contained client islands from
// src/components/admin — they mount unchanged as monitor modes.
import { GoalsAnalyticsTab } from '@/components/admin/GoalsAnalyticsTab';
import { QualityDashboardTab } from '@/components/admin/QualityDashboardTab';
import { StaffScheduleTab } from '@/components/admin/StaffScheduleTab';
import { SystemSyncActivityTab } from '@/components/admin/SystemSyncActivityTab';
import { GoalsPickerPane } from '@/components/admin/GoalsPickerPane';
import { StaffPickerPane } from '@/components/admin/StaffPickerPane';
import { OperationsLogsView } from './OperationsLogsView';

/** Legacy `/operations?mode=plans` → Plans Live (`/forge`). */
function OperationsPlansRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/forge');
  }, [router]);
  return null;
}

export function OperationsWorkspace() {
  const searchParams = useSearchParams();
  const { mode } = useOperationsMode();
  // Global-assistant context: KPI/benchmark skill fragment (plan §-2.2).
  useAssistantContext({ page: 'operations', mode, skill: OPERATIONS_SKILL });

  // Kiosk / wall (HOME-OPS Phase C, plan §27):
  if (searchParams.get('tv') === '1') {
    return (
      <div className="fixed inset-0 z-takeover flex flex-col overflow-hidden bg-surface-canvas">
        <OperationsTvBoard />
      </div>
    );
  }

  /* `analytics` is GONE (2026-09-16, operator ruling). */
  if (mode === 'history') return <OperationsHistoryView />;
  if (mode === 'signals') return <SignalsWorkspace />;
  // Goals · Staff · Logs: their pickers sit in the stage, left of the record
  // (the contextual sidebar holds only their filters).
  if (mode === 'goals') {
    return (
      <div className="flex h-full min-h-0">
        <GoalsPickerPane />
        <div className="min-w-0 flex-1 overflow-y-auto">
          <GoalsAnalyticsTab />
        </div>
      </div>
    );
  }
  if (mode === 'quality') return <QualityDashboardTab />;
  if (mode === 'staff') {
    return (
      <div className="flex h-full min-h-0">
        <StaffPickerPane />
        <div className="min-w-0 flex-1 overflow-y-auto">
          <StaffScheduleTab />
        </div>
      </div>
    );
  }
  if (mode === 'sync') return <SystemSyncActivityTab />;
  if (mode === 'logs') return <OperationsLogsView />;
  if (mode === 'reconciliation') return <OperationsReconciliationView />;
  if (mode === 'checks') return <OperationsChecksView />;
  if (mode === 'plans') return <OperationsPlansRedirect />;
  return <OperationsDashboard />;
}
