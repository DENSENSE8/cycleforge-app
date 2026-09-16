'use client';

/**
 * Triage (Arrival) browse workbench.
 *
 * Its four bodies are rail lists rather than tables, so the one thing this desk
 * owns is which body is on screen. That used to be a foot strip — the same
 * {@link TableStatusBar} every table draws, minus a row count it had no honest
 * way to know.
 *
 * **The tabs moved to the top (operator ruling 2026-08-31)** along with every
 * other station's: the frame is now the design system's {@link DeskPageChrome},
 * so Arrival wears the same title / CTA / tab row as the Shipping desk. The
 * row count is still absent, and now honestly so — the chrome has no place to
 * print one, which is better than a bar that exists to hold a number it cannot
 * know.
 */

import { useSearchParams } from 'next/navigation';
import { RailEditModeProvider } from '@/components/sidebar/rail-edit-mode';
import { ReceivingBulkActionBar } from '@/components/sidebar/receiving/ReceivingBulkActionBar';
import { useRailEditMode } from '@/components/sidebar/receiving/useRailEditMode';
import {
  isPendingTriageScanRow,
} from '@/components/sidebar/receiving/receiving-sidebar-shared';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import { TriageFeedBody } from '@/components/receiving/triage/TriageFeedBody';
import { useTriageWorkspaceTab } from '@/hooks/useTriageWorkspaceTab';
import {
  TRIAGE_WORKSPACE_TAB_LABEL,
  type TriageWorkspaceTab,
} from '@/utils/triage-workspace-state';
import { DeskPageLayout } from '@/components/desk/DeskPageLayout';

export function TriageWorkspaceView({
  selectedLine,
  leadingRow = null,
}: {
  selectedLine: ReceivingLineRow | null;
  /** Pre-resolve scan stub from the sidebar scan path. */
  leadingRow?: ReceivingLineRow | null;
}) {
  const { triageView, setTriageView } = useTriageWorkspaceTab();
  const searchParams = useSearchParams();
  const filterText = searchParams.get('triq') ?? '';

  // `triage` is the default view, so it IS the unfiltered body and lights no
  // tab — the same rule every other strip follows.
  const tabs = (['found', 'unfound', 'done'] as const).map((id) => ({
    id,
    label: TRIAGE_WORKSPACE_TAB_LABEL[id],
  }));

  const selectedLineId = selectedLine?.id ?? null;
  const selectedRow =
    selectedLine &&
    (selectedLine.id > 0 ||
      selectedLine.receiving_id != null ||
      isPendingTriageScanRow(selectedLine))
      ? selectedLine
      : null;

  const {
    railEditMode,
    railSelectedIds,
    railSelectedIdList,
    railBulkDismissing,
    toggleRailEditMode,
    toggleRailSelected,
    setManyRailSelected,
    handleRailBulkDismiss,
  } = useRailEditMode({
    isScanSurface: true,
    mode: 'triage',
    unboxView: 'history',
    triageView,
  });

  return (
    <RailEditModeProvider
      active={railEditMode}
      selectedIds={railSelectedIds}
      toggle={toggleRailSelected}
      setMany={setManyRailSelected}
      toggleActive={toggleRailEditMode}
    >
      <DeskPageLayout
        className="h-full"
        tabs={tabs}
        activeTab={triageView === 'triage' ? '' : triageView}
        onTabChange={(id) =>
          setTriageView(id === triageView ? 'triage' : (id as TriageWorkspaceTab))
        }
      >
      <div className="relative flex h-full min-h-0 w-full flex-col">
        <TriageFeedBody
          key={triageView}
          view={triageView}
          selectedLineId={selectedLineId}
          selectedRow={selectedRow}
          leadingRow={triageView === 'triage' ? leadingRow : null}
          filterText={filterText}
        />
        {railEditMode ? (
          <ReceivingBulkActionBar
            selectedIds={railSelectedIdList}
            onDismiss={handleRailBulkDismiss}
            busy={railBulkDismissing}
          />
        ) : null}
      </div>
      </DeskPageLayout>
    </RailEditModeProvider>
  );
}
