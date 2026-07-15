'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ClipboardList,
  Download,
  ExternalLink,
  Link2,
  Pencil,
  Ticket,
  Wrench,
} from '@/components/Icons';
import { deriveColorFromTitle, resolveTestingLineTitle } from '@/lib/print/printProductLabel';
import { receivingPayloadToFace } from '@/lib/print/printReceivingLabel';
import { SectionTabsSlider, type SectionTab } from '@/design-system/components';
import { StationTerminalDock, useStationTerminalAction } from '@/components/station/terminal';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
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
 * Overview tab mirrors unbox: suppress PO-items header, pairing pencil on the
 * tab row, headerless notes + label, one-row verdict·condition·serial.
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

  // Package Pairing state lifted so its pencil lives on the tab row (unbox parity).
  const [pairingOpen, setPairingOpen] = useState(false);
  const togglePairing = useCallback(() => setPairingOpen((v) => !v), []);
  const editPoControl = (
    <div className="inline-flex items-center rounded-xl bg-surface-canvas p-1 ring-1 ring-inset ring-border-soft">
      <HoverTooltip
        label={pairingOpen ? 'Hide package pairing' : 'Show package pairing'}
        placement="below"
        focusable={false}
        asChild
      >
        {/* ds-raw-button: toggle pill styled identically to the SectionTabsSlider tab pills */}
        <button
          type="button"
          aria-label={pairingOpen ? 'Hide package pairing' : 'Show package pairing'}
          aria-expanded={pairingOpen}
          onClick={togglePairing}
          className={`flex h-8 w-9 items-center justify-center rounded-lg transition-colors ${
            pairingOpen
              ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/25'
              : 'text-text-muted hover:text-text-default'
          }`}
        >
          <Pencil className="h-4 w-4" />
        </button>
      </HoverTooltip>
    </div>
  );

  const testingTabs = useMemo(() => {
    const tabs: SectionTab[] = [
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
      ...(hasSkuTabs
        ? [
            {
              id: 'checklist',
              label: 'Checklist',
              icon: ClipboardList,
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
              content: (
                <TestingSkuManualsPanel
                  receivingLineId={row.id}
                  data={skuTestingData}
                />
              ),
            },
          ]
        : []),
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
    ];
    return tabs;
  }, [
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
    labelColor,
    labelOptions,
    pairingOpen,
    productTitle,
    row,
    showCartonLabel,
    skuTestingData,
    staffId,
    togglePairing,
  ]);

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

  // Match the pairing pencil chrome: recessed canvas track + white/neutral pill.
  const claimTicketLink =
    activeTestingView === 'claim' && c.zendeskHref ? (
      <div className="inline-flex items-center rounded-xl bg-surface-canvas p-1 ring-1 ring-inset ring-border-soft">
        <HoverTooltip label="Open ticket in Zendesk" placement="below" focusable={false} asChild>
          <button
            type="button"
            aria-label="Open ticket in Zendesk"
            onClick={() => window.open(c.zendeskHref!, '_blank', 'noopener,noreferrer')}
            className="flex h-8 w-9 items-center justify-center rounded-lg bg-surface-card text-text-muted transition-colors hover:text-text-default"
          >
            <ExternalLink className="h-4 w-4" />
          </button>
        </HoverTooltip>
      </div>
    ) : null;

  const terminalVm = useStationTerminalAction({
    surface: 'test',
    mode: 'testing',
    tabId: activeTestingView,
    build: buildTerminal,
  });

  return (
    <>
      <div className="relative flex h-full min-h-0 flex-col bg-surface-canvas">
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

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-3xl space-y-4 px-4 py-5 pb-32 sm:px-6">
            <TestingCartonHeader c={c} row={row} staffId={staffId} />

            <SectionTabsSlider
              tabs={testingTabs}
              value={activeTestingView}
              onChange={(id) => setTestingView(id as TestingView)}
              ariaLabel="Testing displays"
              rightSlot={
                activeTestingView === 'testing'
                  ? editPoControl
                  : claimTicketLink ?? undefined
              }
            />
          </div>
        </div>

        <StationTerminalDock vm={terminalVm} assignedTechId={row.assigned_tech_id} />
      </div>

      <TestingPanelModals c={c} row={row} />
    </>
  );
}
