'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ClipboardList,
  Download,
  History,
  Link2,
  Ticket,
  Wrench,
} from '@/components/Icons';
import { deriveColorFromTitle, resolveTestingLineTitle } from '@/lib/print/printProductLabel';
import { receivingPayloadToFace } from '@/lib/print/printReceivingLabel';
import { SectionTabsSlider } from '@/design-system/components';
import { StationTerminalDock, useStationTerminalAction } from '@/components/station/terminal';
import {
  StationWorkbench,
  PairingTogglePill,
  ExternalLinkPill,
  buildSectionTabs,
  WorkspaceTimelineTab,
} from '@/components/station/workbench';
import { useClaimTicketReply } from '@/components/receiving/workspace/claim/hooks/useClaimTicketReply';
import { resolveTestingTerminal } from './testing-panel/terminal/testing-terminal';
import type { TestingView } from './testing-panel/terminal/types';
import { LineEditToolbar } from '@/components/receiving/workspace/line-edit/LineEditToolbar';
import { LabelEditPopover, type LabelEditDraft } from '@/components/receiving/workspace/line-edit/LabelEditPopover';
import {
  TESTING_OPEN_SKU_PAIRING_EVENT,
  TestingSkuChecklistPanel,
  TestingSkuManualsPanel,
  TestingSkuPairingPanel,
  useSkuTestingData,
} from '@/components/receiving/workspace/line-edit/LineTestingTabbedCard';
import type { ProductLabelDraft } from '@/components/labels/ProductLabelEditPopover';
import type { ReceivingLineRow } from '@/components/station/ReceivingLinesTable';
import { useTestingLineController } from '@/components/tech/hooks/useTestingLineController';
import { useTestingPrimaryAction } from './testing-panel/useTestingPrimaryAction';
import { TestingCartonHeader } from './testing-panel/TestingCartonHeader';
import type { LabelTypeOption } from './testing-panel/LabelTypeSelect';
import { TestingTicketReplyCard } from './testing-panel/TestingTicketReplyCard';
import { TestingPoUnboxingSection } from './testing-panel/TestingPoUnboxingSection';
import { TestingPanelModals } from './testing-panel/TestingPanelModals';
import { TestingWorkspaceNotesCard } from './testing-panel/TestingWorkspaceNotesCard';
import { TestingLabelPreviewCard } from './testing-panel/TestingLabelPreviewCard';

/**
 * Right-pane TESTING display. Anchored on LineEditPanel's composition — the same
 * shared cards (station entity-context header / CartonContextCard, PoLinesAccordion)
 * and the unified mode-driven toolbar — but the active-row slot renders verdict
 * pills instead of condition, and the terminal action is Pass + Print instead of
 * Print · receive.
 *
 * Composes {@link StationWorkbench} — same anatomy as Unbox.
 */

export function TestingPanel({
  row,
  staffId,
  onBackToBrowse,
}: {
  row: ReceivingLineRow;
  staffId: string;
  /** Clear the open line and return to the tested-lines browse. */
  onBackToBrowse?: () => void;
}) {
  const rowTitle = resolveTestingLineTitle(row);
  const [colorOverride, setColorOverride] = useState<string | null>(null);
  const [titleOverride, setTitleOverride] = useState<string | null>(null);
  const labelColor = (colorOverride ?? deriveColorFromTitle(rowTitle)).trim();
  const productTitle = titleOverride ?? rowTitle;

  const c = useTestingLineController(row, staffId, { labelColor });
  const { primaryDisabled, primaryLabel, primaryTitle } = useTestingPrimaryAction(c, row);
  const claimTicketId = c.providerTicketId ?? null;
  const claimFailed =
    c.deriveLineVerdict(row.serials ?? []) === 'TESTING_FAILED';
  const claimReply = useClaimTicketReply({
    open: claimTicketId != null,
    ticketId: claimTicketId,
  });

  const unitLabelAvailable = Boolean(c.previewPayload && row.sku);
  const cartonLabelAvailable = Boolean(c.cartonLabelPayload);
  const labelOptions = useMemo<LabelTypeOption[]>(() => {
    const opts: LabelTypeOption[] = [];
    if (unitLabelAvailable) opts.push({ key: 'unit', name: 'Unit label' });
    if (cartonLabelAvailable) opts.push({ key: 'carton', name: 'Carton label' });
    return opts;
  }, [unitLabelAvailable, cartonLabelAvailable]);

  const [selectedLabel, setSelectedLabel] = useState('unit');
  const [cartonEditorOpen, setCartonEditorOpen] = useState(false);
  const activeLabel = labelOptions.some((o) => o.key === selectedLabel)
    ? selectedLabel
    : labelOptions[0]?.key ?? 'unit';
  const showCartonLabel = activeLabel === 'carton';
  const hasLabel = labelOptions.length > 0;

  const cartonFace = useMemo(
    () => (c.cartonLabelPayload ? receivingPayloadToFace(c.cartonLabelPayload) : null),
    [c.cartonLabelPayload],
  );

  const hasSkuTabs = Boolean(row.sku && row.id != null);
  const [testingView, setTestingView] = useState<TestingView>('testing');
  const skuTestingData = useSkuTestingData(
    row.id,
    row.sku ?? '',
    productTitle,
    c.activeSerial?.id ?? null,
  );

  const timelineSerials = useMemo(
    () =>
      (row.serials ?? [])
        .map((s) => String(s.serial_number || '').trim())
        .filter(Boolean),
    [row.serials],
  );
  const poIdForTimeline = String(row.zoho_purchaseorder_id ?? '').trim();
  const trackingForTimeline = String(row.tracking_number ?? '').trim();
  const hasTimelineTab =
    trackingForTimeline.length > 0 ||
    row.receiving_id != null ||
    timelineSerials.length > 0;

  const [pairingOpen, setPairingOpen] = useState(false);
  const togglePairing = useCallback(() => setPairingOpen((v) => !v), []);
  const editPoControl = <PairingTogglePill open={pairingOpen} onToggle={togglePairing} />;

  const testingTabs = useMemo(
    () =>
      buildSectionTabs([
        {
          id: 'testing',
          label: 'Testing',
          icon: Wrench,
          content: (
            <div className="space-y-4">
              <TestingPoUnboxingSection
                c={c}
                row={row}
                staffId={staffId}
                suppressItemsHeader
                pairingOpen={pairingOpen}
                onPairingToggle={togglePairing}
              />
              <TestingWorkspaceNotesCard row={row} c={c} />
              {hasLabel ? (
                <>
                  <TestingLabelPreviewCard
                    sku={c.activeAllocation?.unitId || row.sku || ''}
                    title={productTitle}
                    condition={row.condition_grade}
                    color={labelColor}
                    dataMatrixValue={c.previewPayload?.value ?? ''}
                    dataMatrixSymbology={c.previewPayload?.symbology ?? 'datamatrix'}
                    labelOptions={labelOptions}
                    activeLabel={activeLabel}
                    onLabelChange={(key) => {
                      setSelectedLabel(key);
                      setCartonEditorOpen(false);
                    }}
                    faceOverride={showCartonLabel ? cartonFace : undefined}
                    onEdit={showCartonLabel ? () => setCartonEditorOpen(true) : undefined}
                    onApplyAndPrint={(draft: ProductLabelDraft) => {
                      setColorOverride(draft.color);
                      setTitleOverride(draft.title);
                      if ((draft.condition || '') !== (row.condition_grade || '')) {
                        c.patch({ condition_grade: draft.condition });
                      }
                      void c.handleApplyAndPrint({
                        title: draft.title,
                        color: draft.color,
                        condition: draft.condition,
                      });
                    }}
                  />
                  {cartonLabelAvailable ? (
                    <LabelEditPopover
                      open={showCartonLabel && cartonEditorOpen}
                      defaults={c.cartonLabelDraftDefaults}
                      buildPayload={c.buildCartonLabelPayload}
                      onApplyAndPrint={(draft: LabelEditDraft) => c.applyCartonLabel(draft)}
                      onClose={() => setCartonEditorOpen(false)}
                    />
                  ) : null}
                </>
              ) : null}
            </div>
          ),
        },
        {
          id: 'pairing',
          label: 'SKU Pairing',
          icon: Link2,
          content: (
            <TestingSkuPairingPanel
              skuCatalogId={row.sku_catalog_id ?? null}
              headerTitle={productTitle}
            />
          ),
        },
        {
          id: 'checklist',
          label: 'Checklist',
          icon: ClipboardList,
          visible: hasSkuTabs,
          content: (
            <TestingSkuChecklistPanel
              receivingLineId={row.id}
              serialUnitId={c.activeSerial?.id ?? null}
              data={skuTestingData}
            />
          ),
        },
        {
          id: 'manuals',
          label: 'Manuals',
          icon: Download,
          visible: hasSkuTabs,
          content: (
            <TestingSkuManualsPanel
              receivingLineId={row.id}
              data={skuTestingData}
            />
          ),
        },
        {
          id: 'claim',
          label: 'Claim',
          icon: Ticket,
          content: (
            <TestingTicketReplyCard
              ticketId={claimTicketId}
              ticketNumber={claimTicketId ? `#${claimTicketId}` : undefined}
              ticketUrl={c.zendeskHref}
              failed={claimFailed}
              onFileClaim={() => c.setClaimOpen(true)}
              reply={claimReply}
              row={row}
            />
          ),
        },
        {
          id: 'timeline',
          label: 'Timeline',
          icon: History,
          visible: hasTimelineTab,
          content: (
            <WorkspaceTimelineTab
              poId={poIdForTimeline || null}
              tracking={trackingForTimeline || null}
              receivingId={row.receiving_id ?? null}
              serials={timelineSerials}
            />
          ),
        },
      ]),
    [
      activeLabel,
      c,
      cartonEditorOpen,
      cartonFace,
      cartonLabelAvailable,
      claimFailed,
      claimReply,
      claimTicketId,
      hasLabel,
      hasSkuTabs,
      hasTimelineTab,
      labelColor,
      labelOptions,
      pairingOpen,
      poIdForTimeline,
      productTitle,
      row,
      showCartonLabel,
      skuTestingData,
      staffId,
      timelineSerials,
      togglePairing,
      trackingForTimeline,
    ],
  );

  const activeTestingView = testingTabs.some((t) => t.id === testingView)
    ? testingView
    : 'testing';

  useEffect(() => {
    const openPairing = () => setTestingView('pairing');
    window.addEventListener(TESTING_OPEN_SKU_PAIRING_EVENT, openPairing);
    return () => window.removeEventListener(TESTING_OPEN_SKU_PAIRING_EVENT, openPairing);
  }, []);

  const buildTerminal = useCallback(
    (kind: string) =>
      resolveTestingTerminal(kind, {
        primaryLabel,
        primaryTitle,
        primaryDisabled,
        isPrinting: c.isPrinting,
        onPrimary: () => void c.handlePrimary(),
        claimTicketId,
        claimFailedNoTicket: claimFailed && claimTicketId == null,
        claimReply,
        onFileClaim: () => c.setClaimOpen(true),
      }),
    [
      primaryLabel,
      primaryTitle,
      primaryDisabled,
      c,
      claimTicketId,
      claimFailed,
      claimReply,
    ],
  );

  const claimTicketLink =
    activeTestingView === 'claim' && c.zendeskHref ? (
      <ExternalLinkPill href={c.zendeskHref} label="Open ticket in Zendesk" />
    ) : null;

  const terminalVm = useStationTerminalAction({
    surface: 'test',
    mode: 'testing',
    tabId: activeTestingView,
    build: buildTerminal,
  });

  return (
    <>
      <StationWorkbench
        className="h-full"
        reserveScrollClearance
        toolbar={
          <LineEditToolbar
            mode="testing"
            receivingId={row.receiving_id ?? null}
            busy={c.saving || c.isMutating}
            copyingAll={c.copyingAll}
            onBackToBrowse={onBackToBrowse}
            handlers={{
              refresh: () => void c.syncWithZoho(),
              share: () => void c.handleShare(),
              audit: () => c.setAuditOpen(true),
              pair:
                row.sku_catalog_id != null
                  ? () => window.dispatchEvent(new CustomEvent(TESTING_OPEN_SKU_PAIRING_EVENT))
                  : undefined,
              copy: () => void c.handleCopyAll(),
              photoNote: () => c.setPhotoNoteOpen(true),
            }}
          />
        }
        entityContext={<TestingCartonHeader c={c} row={row} staffId={staffId} />}
        tabs={
          <SectionTabsSlider
            tabs={testingTabs}
            value={activeTestingView}
            onChange={(id) => setTestingView(id as TestingView)}
            ariaLabel="Testing displays"
            rightSlot={
              activeTestingView === 'testing'
                ? editPoControl
                : (claimTicketLink ?? undefined)
            }
          />
        }
        dock={<StationTerminalDock vm={terminalVm} assignedTechId={row.assigned_tech_id} />}
      />

      <TestingPanelModals c={c} row={row} />
    </>
  );
}
