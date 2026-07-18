'use client';

/**
 * TriagePanel — the standalone right-pane editor for the **Receiving (triage)**
 * mode: the fast "identify the carton before unbox" pass.
 *
 * Station Workbench anatomy (same as Unbox / Testing):
 *   toolbar → condensed CartonContextCard → SectionTabsSlider
 *   (Classify / Staging / Pairing) → Save-for-unbox dock.
 *
 * Classify pills live in the Overview tab — not expanded in the entity header.
 * All state lives in the shared `useUnboxLineController` so triage and unbox
 * stay in lock-step on carton data without sharing a JSX shell.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import { safeRandomUUID } from '@/lib/safe-uuid';
import { StationTerminalDock, useStationTerminalAction } from '@/components/station/terminal';
import { StationWorkbench } from '@/components/station/workbench';
import { resolveTriageTerminal } from './terminal/triage-terminal';
import { invalidateReceivingFeeds } from '@/lib/queries/receiving-queries';
import { WorkspaceActionFeedbackSlot } from '../workspace/WorkspaceActionFeedbackSlot';
import type { InlineActionFeedbackPayload } from '../workspace/InlineActionFeedbackCard';
import { LineEditToolbar } from '../workspace/line-edit/LineEditToolbar';
import { ReceivingPhotoPeek } from '../workspace/line-edit/ReceivingPhotoPeek';
import { LineEditModals } from '../workspace/line-edit/LineEditModals';
import { LineCartonContextSection } from '../workspace/line-edit/LineCartonContextSection';
import { useUnboxLineController } from '../workspace/line-edit/hooks/useUnboxLineController';
import { dispatchLineUpdated, type ReceivingLineRow } from '@/components/station/ReceivingLinesTable';
import { markTriageCompleted, hasTriageBeenCompleted } from '../workspace/TriageProgressStepper';
import { useTriageStaging } from './useTriageStaging';
import { WorkflowRecommendationsStrip } from '../WorkflowRecommendationsStrip';
import {
  deriveTriageFocusFacts,
  resolveTriageFocus,
  triageFocusToTab,
} from '@/lib/receiving/triage-focus';
import {
  buildTriageTabs,
  TriageSectionTabs,
  type TriageView,
} from './build-triage-tabs';

export function TriagePanel({
  row,
  staffId,
  onClose,
}: {
  row: ReceivingLineRow;
  staffId: string;
  onClose: () => void;
}) {
  const c = useUnboxLineController(row, staffId, {});
  const staging = useTriageStaging(row);
  const [actionFeedback, setActionFeedback] = useState<InlineActionFeedbackPayload | null>(null);
  const queryClient = useQueryClient();
  const [savingTriage, setSavingTriage] = useState(false);
  const [triageSaved, setTriageSaved] = useState(false);
  const [activeTab, setActiveTab] = useState<TriageView>('overview');

  useEffect(() => {
    setActionFeedback(null);
    setTriageSaved(false);
  }, [row.id]);

  // TriageFocusResolver — on open, switch to the first unmet SectionTabsSlider tab.
  useEffect(() => {
    const facts = deriveTriageFocusFacts(
      row,
      row.triage_complete === true || hasTriageBeenCompleted(row.receiving_id),
    );
    const target = resolveTriageFocus(facts);
    if (target === 'already-staged') {
      toast.success('Already staged for unbox', {
        description: 'Nothing left to do here — open it in Unbox when ready.',
      });
      return;
    }
    const tab = triageFocusToTab(target);
    if (tab) setActiveTab(tab);
  }, [row.id]);

  const handleSaveForUnbox = useCallback(async () => {
    if (row.receiving_id == null) {
      toast.error('This carton has no receiving id yet — try again after it resolves.');
      return;
    }
    setSavingTriage(true);
    try {
      const res = await fetch('/api/receiving/triage/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          receiving_id: row.receiving_id,
          client_event_id: safeRandomUUID(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        toast.error(data?.error || 'Could not save for unbox');
        return;
      }
      markTriageCompleted(row.receiving_id);
      dispatchLineUpdated({ id: row.id, triage_complete: true });
      invalidateReceivingFeeds(queryClient);
      setTriageSaved(true);
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch {
      toast.error('Could not save for unbox');
    } finally {
      setSavingTriage(false);
    }
  }, [row.receiving_id, row.id, queryClient, onClose]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key !== 'Enter') return;
      if (savingTriage || triageSaved) return;
      e.preventDefault();
      void handleSaveForUnbox();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleSaveForUnbox, savingTriage, triageSaved]);

  const handleItemDescFeedback = useCallback((feedback: InlineActionFeedbackPayload | null) => {
    setActionFeedback(feedback);
  }, []);

  const handleItemDescSaved = useCallback(
    (lineId: number, zohoNotes: string | null) => {
      if (lineId === row.id) {
        dispatchLineUpdated({ id: row.id, zoho_notes: zohoNotes });
      }
    },
    [row.id],
  );

  const triageTabs = useMemo(
    () =>
      buildTriageTabs({
        row,
        staffId,
        c,
        staging,
        onItemDescFeedback: handleItemDescFeedback,
        onItemDescSaved: handleItemDescSaved,
        onNotesFeedback: setActionFeedback,
      }),
    [row, staffId, c, staging, handleItemDescFeedback, handleItemDescSaved],
  );

  const buildTerminal = useCallback(
    (kind: string) =>
      resolveTriageTerminal(kind, {
        triageSaved,
        savingTriage,
        onSaveForUnbox: handleSaveForUnbox,
      }),
    [triageSaved, savingTriage, handleSaveForUnbox],
  );

  const terminalVm = useStationTerminalAction({
    surface: 'triage',
    mode: 'triage',
    tabId: activeTab,
    build: buildTerminal,
  });

  return (
    <>
      <div className="relative flex h-full min-h-0 flex-col">
        <StationWorkbench
          className="h-full"
          reserveScrollClearance
          toolbar={
            <LineEditToolbar
              mode="triage"
              receivingId={row.receiving_id ?? null}
              zohoSyncing={c.zohoSyncing}
              busy={c.saving || c.platformSaving}
              copyingAll={c.copyingAll}
              handlers={{
                refresh: () => void c.syncWithZoho(),
                share: () => void c.handleShare(),
                audit: () => c.setAuditOpen(true),
                copy: () => void c.handleCopyAll(),
                movePhotos: () => c.setMovePhotosOpen(true),
                photoNote: () => c.setPhotoNoteOpen(true),
              }}
            />
          }
          entityContext={
            <div className="space-y-4">
              <WorkflowRecommendationsStrip row={row} surface="triage" />
              <LineCartonContextSection
                row={row}
                staffId={staffId}
                c={c}
                expandClassifyWhenPending={false}
                showClassifyControls={false}
              />
            </div>
          }
          tabs={
            <TriageSectionTabs
              tabs={triageTabs}
              value={activeTab}
              onChange={(id) => setActiveTab(id as TriageView)}
            />
          }
          feedback={
            <WorkspaceActionFeedbackSlot
              feedback={actionFeedback}
              onDismiss={() => setActionFeedback(null)}
            />
          }
          dock={<StationTerminalDock vm={terminalVm} />}
        />

        {row.receiving_id != null ? (
          <ReceivingPhotoPeek
            receivingId={row.receiving_id}
            staffId={Number(staffId) || 0}
            poRef={row.zoho_purchaseorder_number || row.zoho_purchaseorder_id || null}
            photoIntent="all"
          />
        ) : null}
      </div>

      <LineEditModals row={row} c={c} />
    </>
  );
}
