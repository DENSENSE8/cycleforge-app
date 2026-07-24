'use client';

/**
 * TriagePanel — the standalone right-pane editor for the **Receiving (triage)**
 * mode: the fast "identify the carton before unbox" pass.
 *
 * Station Workbench anatomy (same as Unbox / Testing):
 *   StationContextBar (density=bar identity + corner toolbar) →
 *   mid-canvas StationRightEdgeAction (Open in Unbox) →
 *   SectionTabsSlider (Overview / Staging / …) → Save-for-unbox dock.
 *
 * Classify pills in the bookmark open the matching Classify accordion row
 * (via `onClassifyPillOpen`) — they do not expand a horizontal strip in the header.
 * All state lives in the shared `useUnboxLineController` so triage and unbox
 * stay in lock-step on carton data without sharing a JSX shell.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import { safeRandomUUID } from '@/lib/safe-uuid';
import { PackageOpen } from '@/components/Icons';
import { StationTerminalDock, useStationTerminalAction } from '@/components/station/terminal';
import { PairingTogglePill, StationPanelRoot, StationWorkbench } from '@/components/station/workbench';
import {
  StationContextBar,
  StationHeaderToolbar,
  StationMoreDetails,
  StationRightEdgeAction,
  stationRightEdgeActionHostClass,
} from '@/components/station/entity-context';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { IconButton } from '@/design-system/primitives';
import {
  HEADER_ICON_BTN_CLASS,
  TOP_CHROME_ICON_GLYPH,
} from '@/components/layout/header-shell';
import { openInUnboxHref } from '@/lib/receiving/surface-path';
import { cn } from '@/utils/_cn';
import { resolveTriageTerminal } from './terminal/triage-terminal';
import { invalidateReceivingFeeds } from '@/lib/queries/receiving-queries';
import { WorkspaceActionFeedbackSlot } from '../workspace/WorkspaceActionFeedbackSlot';
import type { InlineActionFeedbackPayload } from '../workspace/InlineActionFeedbackCard';
import { ReceivingPhotoPeek } from '../workspace/line-edit/ReceivingPhotoPeek';
import { LineEditModals } from '../workspace/line-edit/LineEditModals';
import { LineCartonContextSection } from '../workspace/line-edit/LineCartonContextSection';
import { useUnboxLineController } from '../workspace/line-edit/hooks/useUnboxLineController';
import { dispatchLineUpdated, type ReceivingLineRow } from '@/components/station/ReceivingLinesTable';
import { markTriageCompleted, hasTriageBeenCompleted } from '@/lib/receiving/triage-complete-local';
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
  const [pairingOpen, setPairingOpen] = useState(false);
  const togglePairing = useCallback(() => setPairingOpen((v) => !v), []);
  const [classifyExpand, setClassifyExpand] = useState<{
    dimension: 'urgency' | 'platform' | 'type';
    requestId: number;
  } | null>(null);

  const openClassifyFromHeader = useCallback((picker: 'urgency' | 'platform' | 'type') => {
    setActiveTab('overview');
    setClassifyExpand((prev) => ({
      dimension: picker,
      requestId: (prev?.requestId ?? 0) + 1,
    }));
  }, []);

  useEffect(() => {
    setActionFeedback(null);
    setTriageSaved(false);
    setPairingOpen(false);
  }, [row.id]);

  // TriageFocusResolver — on open, switch to the first unmet SectionTabsSlider tab.
  // Pair focus also expands Package Pairing (overview defaults it collapsed).
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
    if (target === 'pair') setPairingOpen(true);
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
        pairingOpen,
        onPairingToggle: togglePairing,
        onItemDescFeedback: handleItemDescFeedback,
        onItemDescSaved: handleItemDescSaved,
        onNotesFeedback: setActionFeedback,
        classifyExpandDimension: classifyExpand?.dimension ?? null,
        classifyExpandRequestId: classifyExpand?.requestId ?? 0,
      }),
    [
      row,
      staffId,
      c,
      staging,
      pairingOpen,
      togglePairing,
      handleItemDescFeedback,
      handleItemDescSaved,
      classifyExpand,
    ],
  );

  // PairingTogglePill always available — Arrival defaults pairing collapsed
  // (matched + unfound); accordion header + this pill both toggle.
  const editPoControl = (
    <PairingTogglePill
      open={pairingOpen}
      onToggle={togglePairing}
      closedLabel="Show package pairing"
      openLabel="Hide package pairing"
    />
  );

  const router = useRouter();
  // PairingTogglePill only in the tabs rail — Open in Unbox is the
  // mid-canvas right-edge sliced bookmark (not moreDetails / not SlicedActionDock).
  const sectionTabsRightSlot = editPoControl;

  const openInUnboxEdge =
    row.receiving_id != null ? (
      <StationRightEdgeAction
        className={cn(
          stationRightEdgeActionHostClass,
          'border-blue-200 bg-blue-50/90',
        )}
        data-testid="triage-open-in-unbox-edge"
      >
        <HoverTooltip
          label="Open this carton in unbox (serials, photos, receive)"
          asChild
          focusable={false}
        >
          <IconButton
            icon={<PackageOpen className={TOP_CHROME_ICON_GLYPH} />}
            ariaLabel="Open in unbox"
            size="md"
            onClick={() => router.push(openInUnboxHref(row.receiving_id!, row.id))}
            className={cn(
              HEADER_ICON_BTN_CLASS,
              'text-blue-700 hover:bg-blue-100 hover:text-blue-800',
            )}
          />
        </HoverTooltip>
      </StationRightEdgeAction>
    ) : null;

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
      <StationPanelRoot>
        <StationContextBar
          identity={
            <LineCartonContextSection
              row={row}
              staffId={staffId}
              c={c}
              expandClassifyWhenPending={false}
              showClassifyControls
              classifyInteractive
              onClassifyPillOpen={openClassifyFromHeader}
              density="bar"
            />
          }
          moreDetails={
            <StationMoreDetails>
              <StationHeaderToolbar
                mode="triage"
                embedded
                receivingId={row.receiving_id ?? null}
                zohoSyncing={c.zohoSyncing}
                busy={c.saving || c.platformSaving}
                copyingAll={c.copyingAll}
                handlers={{
                  refresh: () => void c.syncWithZoho(),
                  share: () => void c.handleShare(),
                  audit: () => c.setAuditOpen(true),
                  copy: () => void c.handleCopyAll(),
                  movePhotos: () => c.openMovePhotos(),
                }}
              />
            </StationMoreDetails>
          }
        />
        {openInUnboxEdge}
        <StationWorkbench
          ambientWash={false}
          className="relative z-0 h-full flex-1 bg-transparent"
          reserveScrollClearance
          entityContext={<WorkflowRecommendationsStrip row={row} surface="triage" />}
          tabs={
            <TriageSectionTabs
              tabs={triageTabs}
              value={activeTab}
              onChange={(id) => setActiveTab(id as TriageView)}
              rightSlot={sectionTabsRightSlot}
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
      </StationPanelRoot>

      <LineEditModals row={row} c={c} />
    </>
  );
}
