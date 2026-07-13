'use client';

/**
 * Right-pane router for the Operations master page. Reads `?mode=` (the single
 * source of truth, owned by the sidebar's mode rail) and renders the matching
 * view. `live` keeps the existing floor dashboard untouched; the other modes
 * include signals (entity_signals timeline + browse).
 *
 * `plans` is no longer a primary Operations mode — forge/plans moved to Home
 * (HOME-OPS plan §3.2). `?mode=plans` still resolves via the URL SoT and is
 * redirected to Home here so old bookmarks / `/forge` history keep working.
 */

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useOperationsMode } from '@/components/sidebar/operations/useOperationsMode';
import { useAssistantContext } from '@/hooks/useAssistantContext';
import { OPERATIONS_SKILL } from '@/lib/assistant/page-skills';
import { OperationsDashboard } from '@/features/operations/components/OperationsDashboard';
import { OperationsAnalyticsView } from './OperationsAnalyticsView';
import { OperationsInsightsView } from './OperationsInsightsView';
import { OperationsHistoryView } from './OperationsHistoryView';
import { OperationsTvBoard } from './OperationsTvBoard';
import { SignalsWorkspace } from '@/features/signals/SignalsWorkspace';

/** Legacy `/operations?mode=plans` → Home Plan/Tasks (plan §3.3). */
function OperationsPlansRedirect() {
  const router = useRouter();
  const params = useSearchParams();
  useEffect(() => {
    const target = params.get('view') === 'live' ? '/?mode=forge&view=live' : '/?mode=tasks';
    router.replace(target);
  }, [router, params]);
  return null;
}

export function OperationsWorkspace() {
  const searchParams = useSearchParams();
  const { mode } = useOperationsMode();
  // Global-assistant context: KPI/benchmark skill fragment (plan §-2.2).
  useAssistantContext({ page: 'operations', mode, skill: OPERATIONS_SKILL });

  // Kiosk / wall (HOME-OPS Phase C, plan §27): `?tv=1` strips the app chrome —
  // a full-bleed takeover over the sidebar + header + command bar — and renders
  // ONLY the read-only Monitor board. This is the unattended wall entry
  // (default_home_path of a kiosk staff row); the interactive Operations modes
  // below are untouched for human operators. Region stays a single archetype
  // (Monitor); no plan-edit chrome is reachable here.
  if (searchParams.get('tv') === '1') {
    return (
      <div className="fixed inset-0 z-takeover flex flex-col overflow-hidden bg-surface-canvas">
        <OperationsTvBoard />
      </div>
    );
  }

  if (mode === 'analytics') return <OperationsAnalyticsView />;
  if (mode === 'insights') return <OperationsInsightsView />;
  if (mode === 'history') return <OperationsHistoryView />;
  if (mode === 'signals') return <SignalsWorkspace />;
  if (mode === 'plans') return <OperationsPlansRedirect />;
  return <OperationsDashboard />;
}
