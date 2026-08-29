'use client';

/**
 * Manual Add Inbound — index → leaf right-rail create form.
 *
 * Root Index lists **Add PO**, **Add return**, and **Import returns (CSV/TSV)**
 * (Unbox Displays index grammar via {@link DeskInspectorIndexShell}). Form leaves
 * mount {@link IncomingAddInboundForm}; the import leaf starts table-import
 * staging on the Incoming desk centre.
 *
 * Sibling pattern: {@link OrderIngestRail} (Add order methods index).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { FileText, Package, RotateCcw } from '@/components/Icons';
import { DetailStackRailRegistrar } from '@/components/right-rail/DetailStackRailRegistrar';
import {
  DESK_INSPECTOR_INDEX,
  DeskInspectorIndexShell,
  type DeskInspectorLeaf,
} from '@/components/right-rail/DeskInspectorIndexShell';
import { useTableImportFilePicker } from '@/components/tables/import/TableImportFileButton';
import { useTableImportParam } from '@/hooks/useTableImportParam';
import { Button } from '@/design-system/primitives';
import { yieldStationRightEdgeForDeskOccupant } from '@/components/receiving/workspace/line-edit/unbox-right-edge';
import { setDetailInspectorCollapsed } from '@/design-system/shells/detail-stack';
import { openPanel } from '@/lib/right-rail/panel-store';
import { INBOUND_RETURNS_IMPORT_DESCRIPTOR } from '@/lib/inbound/inbound-returns-import-descriptor';
import { STATION_DESK_OCCUPANT_CLOSE_EVENT } from '@/utils/events';
import { IncomingAddInboundForm } from './IncomingAddInboundForm';

const ADD_INBOUND_RAIL_ID = 'detail:incoming-import-ebay';

const ADD_PO_LEAF = 'add-po';
const ADD_RETURN_LEAF = 'add-return';
const IMPORT_RETURNS_LEAF = 'import-returns';

export type IncomingAddInitialLeaf =
  | 'index'
  | typeof ADD_PO_LEAF
  | typeof ADD_RETURN_LEAF
  | typeof IMPORT_RETURNS_LEAF;

function initialLeafToActiveId(leaf: IncomingAddInitialLeaf): string {
  if (
    leaf === ADD_PO_LEAF
    || leaf === ADD_RETURN_LEAF
    || leaf === IMPORT_RETURNS_LEAF
  ) {
    return leaf;
  }
  return DESK_INSPECTOR_INDEX;
}

function ReturnsFileImportLeaf({
  error,
  onClearError,
  onChoose,
}: {
  error: string | null;
  onClearError: () => void;
  onChoose: () => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <p className="border-b border-border-hairline px-4 py-3 text-role-caption text-text-soft">
        Opens desk staging — triage Ready / Action required, then confirm into Incoming
        returns.
      </p>
      <div className="px-4 py-3">
        <Button
          variant="primary"
          size="sm"
          icon={<FileText className="h-3.5 w-3.5" />}
          onClick={onChoose}
          className="font-semibold"
          data-testid="incoming-returns-choose-csv"
        >
          Choose CSV / TSV
        </Button>
      </div>
      {error ? (
        <p className="px-4 py-2 text-role-caption text-rose-700" role="alert">
          {error}{' '}
          <button type="button" className="underline" onClick={onClearError}>
            Dismiss
          </button>
        </p>
      ) : null}
    </div>
  );
}

export function IncomingAddInboundOverlay({
  open,
  onClose,
  initialOrderId = '',
  initialPlatform = 'amazon',
  initialLeaf = 'index',
  embedded = false,
}: {
  open: boolean;
  onClose: () => void;
  initialOrderId?: string;
  /** `source_platform` value (amazon · ebay · goodwill · …). */
  initialPlatform?: string;
  /** Land on Root Index, or jump straight to a leaf (e.g. eBay import → add-po). */
  initialLeaf?: IncomingAddInitialLeaf;
  /** Body only — registrar lives on {@link IncomingDeskRightRail}. */
  embedded?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const [activeId, setActiveId] = useState(() => initialLeafToActiveId(initialLeaf));
  const csv = useTableImportFilePicker(INBOUND_RETURNS_IMPORT_DESCRIPTOR);
  const { active: importActive } = useTableImportParam(INBOUND_RETURNS_IMPORT_DESCRIPTOR);

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open || embedded) return;
    setActiveId(initialLeafToActiveId(initialLeaf));
    setDetailInspectorCollapsed(false);
    openPanel({ id: ADD_INBOUND_RAIL_ID });
    yieldStationRightEdgeForDeskOccupant((qs) => {
      router.replace(qs ? `${pathname}?${qs}` : pathname || '/', { scroll: false });
    });
  }, [open, embedded, initialLeaf, router, pathname]);

  useEffect(() => {
    if (!open || embedded) return;
    const onPeerOpen = () => handleClose();
    window.addEventListener(STATION_DESK_OCCUPANT_CLOSE_EVENT, onPeerOpen);
    return () => window.removeEventListener(STATION_DESK_OCCUPANT_CLOSE_EVENT, onPeerOpen);
  }, [open, embedded, handleClose]);

  // Staging armed → release Add rail so Map columns / Confirm own the edge.
  useEffect(() => {
    if (!open || !importActive) return;
    handleClose();
  }, [open, importActive, handleClose]);

  const leaves = useMemo((): DeskInspectorLeaf[] => {
    const formLeaves: DeskInspectorLeaf[] = [
      {
        id: ADD_PO_LEAF,
        label: 'Add PO',
        subtitle: 'Purchase or marketplace order',
        icon: Package,
        group: 'context',
        tone: 'neutral',
        content: (
          <IncomingAddInboundForm
            receivingType="PO"
            initialOrderId={initialOrderId}
            initialPlatform={initialPlatform}
            autoFocus
            onClose={handleClose}
          />
        ),
      },
      {
        id: ADD_RETURN_LEAF,
        label: 'Add return',
        subtitle: 'Return with linked support ticket',
        icon: RotateCcw,
        group: 'context',
        tone: 'neutral',
        content: (
          <IncomingAddInboundForm
            receivingType="RETURN"
            initialOrderId={initialOrderId}
            initialPlatform={initialPlatform}
            autoFocus
            onClose={handleClose}
          />
        ),
      },
    ];
    if (csv.live) {
      formLeaves.push({
        id: IMPORT_RETURNS_LEAF,
        label: 'Import returns (CSV/TSV)',
        subtitle: 'Amazon Manage Returns · desk CSV',
        icon: FileText,
        group: 'assets',
        tone: 'neutral',
        content: (
          <ReturnsFileImportLeaf
            error={csv.error}
            onClearError={csv.clearError}
            onChoose={csv.open}
          />
        ),
      });
    }
    return formLeaves;
  }, [initialOrderId, initialPlatform, handleClose, csv]);

  useEffect(() => {
    if (!open) return;
    setActiveId(initialLeafToActiveId(initialLeaf));
  }, [open, initialLeaf]);

  if (!open) return null;

  const body = (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-surface-card">
      {csv.input}
      <DeskInspectorIndexShell
        stance="index"
        title="Add inbound"
        leaves={leaves}
        activeId={activeId}
        onActiveIdChange={setActiveId}
        ariaLabel="Add inbound purchase or return"
        testId="add-inbound-inspector"
        backLabel="Back to methods"
      />
    </div>
  );

  if (embedded) return body;

  return (
    <DetailStackRailRegistrar
      id={ADD_INBOUND_RAIL_ID}
      onClose={handleClose}
      modal={false}
      edgeCollapse={false}
      resumeOnDismiss={false}
      ariaLabel="Add inbound purchase or return"
    >
      {body}
    </DetailStackRailRegistrar>
  );
}
