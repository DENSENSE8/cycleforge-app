'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { TRIAGE_SURFACE_ROUTE, UNBOX_SURFACE_ROUTE } from '@/lib/receiving/surface-path';
import { Copy, PackageOpen, RefreshCw, Trash2 } from '@/components/Icons';
import { Button, IconButton } from '@/design-system/primitives';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { copyToClipboard } from '@/utils/_dom';
import { formatDateTimePST } from '@/utils/date';
import { toast } from '@/lib/toast';
import { type ReceivingLineRow } from '@/components/station/receiving-line-row';
import { type ReceivingDetailsLog } from './receiving-details-log';
import { dispatchReceivingWorkspaceOpen } from '@/utils/events';
import { ReceivingProgressTab } from './receiving/ReceivingProgressTab';
import { ReceivingItemsTab } from './receiving/ReceivingItemsTab';
import { ReceivingSerialJourneys } from './receiving/ReceivingSerialJourneys';
import { useReceivingDetailForm } from '@/hooks/useReceivingDetailForm';
import {
  PaneHeader,
  PaneHeaderIconBadge,
  PaneHeaderLabel,
  PaneHeaderActionBar,
  type PaneHeaderActionBarAction,
} from '@/components/ui/pane-header';
import { paneHeaderLabelValueClass } from '@/components/ui/pane-header/blocks';
import { DetailStackRailRegistrar } from '@/components/right-rail/DetailStackRailRegistrar';
import {
  DeskInspectorIndexShell,
  type DeskInspectorLeaf,
} from '@/components/right-rail/DeskInspectorIndexShell';
import { useQuery } from '@tanstack/react-query';
import {
  deriveCartonReadiness,
  type ReceivingMatchLine,
} from '@/lib/receiving/carton-readiness';

async function fetchReceivingMatchLines(receivingId: string): Promise<ReceivingMatchLine[]> {
  const res = await fetch(`/api/receiving/match?receiving_id=${encodeURIComponent(receivingId)}`);
  if (!res.ok) return [];
  const json = await res.json().catch(() => null);
  const lines = Array.isArray(json?.matched_lines) ? (json.matched_lines as ReceivingMatchLine[]) : [];
  return lines;
}

interface ReceivingDetailsStackProps {
  log: ReceivingDetailsLog;
  onClose: () => void;
  onUpdated: () => void;
  onDeleted: (id: string) => void;
}

export function ReceivingDetailsStack({ log, onClose, onUpdated, onDeleted }: ReceivingDetailsStackProps) {
  const form = useReceivingDetailForm({ log, onUpdated, onDeleted });
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isTriageSurface =
    pathname === TRIAGE_SURFACE_ROUTE || pathname.startsWith(`${TRIAGE_SURFACE_ROUTE}/`);
  const [isOpeningEditor, setIsOpeningEditor] = useState(false);
  /** Index | leaf — stub-opens on Progress; Back → topics. Synced leaf id when not on index. */
  const [navId, setNavId] = useState<string>('progress');
  const [isCopying, setIsCopying] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [copiedPoNumber, setCopiedPoNumber] = useState(false);

  useEffect(() => {
    setNavId('progress');
  }, [log.id]);

  const onNavChange = useCallback((id: string) => {
    setNavId(id);
  }, []);

  const matchQuery = useQuery({
    queryKey: ['receiving-match', String(log.id)] as const,
    queryFn: () => fetchReceivingMatchLines(String(log.id)),
    staleTime: 10_000,
    refetchOnWindowFocus: false,
  });

  const readiness = useMemo(
    () => deriveCartonReadiness(log, matchQuery.data),
    [log, matchQuery.data],
  );

  const handleRefresh = () => {
    onUpdated();
    toast.success('Refreshed');
  };

  const handleClose = () => {
    if (form.isSaving || form.isDeleting) return;
    onClose();
  };

  const poNumber = (log.zoho_purchaseorder_number || '').trim();
  const headerTitle = poNumber
    ? `Purchase order #${poNumber}`
    : `Carton #${log.id} (no purchase order linked)`;

  const handleCopyPoNumber = async () => {
    if (!poNumber || copiedPoNumber) return;
    const ok = await copyToClipboard(poNumber);
    if (!ok) {
      toast.error('Could not copy to clipboard');
      return;
    }
    setCopiedPoNumber(true);
    window.setTimeout(() => setCopiedPoNumber(false), 1500);
  };

  const handleCopyAll = async () => {
    if (isCopying) return;
    setIsCopying(true);
    try {
      const lines = [
        poNumber ? `Purchase order #${poNumber}` : null,
        `Carton #${log.id}`,
        log.tracking ? `Tracking: ${log.tracking}` : null,
        `Received: ${log.received_at ? formatDateTimePST(log.received_at) : '-'}`,
        log.zoho_purchase_receive_id ? `Inventory receive: ${log.zoho_purchase_receive_id}` : null,
        log.qa_status ? `QA: ${log.qa_status}` : null,
        log.disposition_code ? `Disposition: ${log.disposition_code}` : null,
        log.condition_grade ? `Condition: ${log.condition_grade}` : null,
      ].filter(Boolean).join('\n');
      const ok = await copyToClipboard(lines);
      if (ok) toast.success('Copied receiving details');
      else toast.error('Could not copy to clipboard');
    } finally {
      window.setTimeout(() => setIsCopying(false), 800);
    }
  };

  const handleEditPO = async () => {
    if (isOpeningEditor || form.isSaving) return;
    setIsOpeningEditor(true);
    try {
      const saved = await form.saveTrackingIfDirty();
      if (!saved) return;
      const receivingId = Number(log.id);
      if (!Number.isFinite(receivingId) || receivingId <= 0) {
        toast.error('Receiving id missing');
        return;
      }
      const res = await fetch(`/api/receiving-lines?receiving_id=${receivingId}&include=serials`);
      const data = await res.json().catch(() => null);
      const rows = Array.isArray(data?.receiving_lines)
        ? (data.receiving_lines as ReceivingLineRow[])
        : [];
      if (rows.length === 0) {
        toast.error('No lines on this receiving yet');
        return;
      }
      // Navigate to the Unbox surface (`/unbox`) so the page renders the
      // workspace. Drop any stale `mode` param — being on `/unbox` IS the
      // receive/unbox mode.
      const params = new URLSearchParams(searchParams.toString());
      params.delete('mode');
      const qs = params.toString();
      router.replace(qs ? `${UNBOX_SURFACE_ROUTE}?${qs}` : UNBOX_SURFACE_ROUTE);
      onClose();
      // Dispatch workspace-open DIRECTLY (bypassing the sidebar's
      // receiving-select-line intercept that would otherwise re-route
      // back into a details stack while the URL flip is still in flight).
      // The dashboard listens for `receiving-workspace-open` and mounts
      // the LineEditPanel overlay independently of sidebar state.
      dispatchReceivingWorkspaceOpen({
        row: rows[0],
        accordionBootstrap: 'all',
        scanDriven: false,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to open PO editor');
    } finally {
      setIsOpeningEditor(false);
    }
  };

  // Readiness-driven next action only. Edit PO / Search purchase order are deliberately
  // absent — operators match or edit lines from the Unbox workspace (or the
  // triage "open in unbox" icon), not from this read-focused details header.
  const primaryCta =
    readiness.cta === 'continue_unbox'
      ? { label: 'Unbox', onClick: handleEditPO }
      : null;

  const backdropClose = () => {
    handleClose();
  };

  const triageOpenSlot = isTriageSurface ? (
    <HoverTooltip label="Open this carton in unbox" asChild focusable={false}>
      <IconButton
        icon={<PackageOpen className="h-4 w-4" />}
        ariaLabel="Open in unbox"
        tone="accent"
        size="sm"
        onClick={() => void handleEditPO()}
        disabled={isOpeningEditor || form.isSaving}
        className="border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
      />
    </HoverTooltip>
  ) : null;

  const leaves = useMemo<DeskInspectorLeaf[]>(
    () => [
      {
        id: 'progress',
        label: 'Progress',
        content: (
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-3">
            <div className="space-y-4">
              <ReceivingProgressTab
                log={log}
                readiness={readiness}
                form={form}
                journey={isTriageSurface ? 'arrival' : 'unbox'}
              />
            </div>
          </div>
        ),
      },
      {
        id: 'items',
        label: 'Items',
        subtitle:
          typeof log.count === 'number' ? String(log.count) : undefined,
        content: (
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-3">
            <div className="space-y-4">
              <ReceivingItemsTab
                receivingId={log.id}
                trackingNumber={log.tracking}
              />
            </div>
          </div>
        ),
      },
      {
        id: 'journeys',
        label: 'Serial journey',
        content: (
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-3">
            <div className="space-y-4">
              <ReceivingSerialJourneys receivingId={log.id} />
            </div>
          </div>
        ),
      },
    ],
    [log, readiness, form, isTriageSurface],
  );

  return (
    // Non-modal elevated inspector: glance-at-progress / skim-items without a
    // dimming scrim. Push would crush the 1440px workbench. Keep `elevated` so
    // the card clears Unbox `z-panel` workspace overlays. `closeOnOutsideClick`
    // restores click-off dismiss via an invisible layer (Escape still works).
    // Stable id matches dashboard `detail:order` so row→row nav swaps content
    // in place (no exit/enter empty slot).
    <DetailStackRailRegistrar
      id="detail:receiving"
      // Station edge: /unbox, /triage and /testing already push this edge with
      // `StationDisplaysPushColumn`, and two push mechanisms on one edge is exactly what
      // the right-rail store exists to prevent. Stays a float pending the
      // right-edge ownership ruling.
      push={false}
      onClose={backdropClose}
      elevated
      modal={false}
      closeOnOutsideClick
      ariaLabel={poNumber ? `Receiving details for order ${poNumber}` : 'Receiving details'}
    >
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {/* Header — PO order# identity (not carton/receiving id); Unbox CTA only
          when deriveCartonReadiness asks for continue_unbox. */}
      <PaneHeader
        className="shrink-0 border-border-hairline bg-surface-card"
        rowClassName="px-6"
        leftSlot={
          <>
            <PaneHeaderIconBadge Icon={PackageOpen} bg="bg-blue-600" tint="text-white" />
            <PaneHeaderLabel
              eyebrow={poNumber ? 'Order #' : undefined}
              value={
                poNumber ? (
                  <HoverTooltip label={copiedPoNumber ? 'Copied' : 'Copy'} asChild>
                    {/* ds-raw-button: text-left inline value (click-to-copy order #).
                        Affordance is the tooltip only — no hover color shift. */}
                    <button
                      type="button"
                      onClick={() => void handleCopyPoNumber()}
                      className="truncate text-left text-text-default"
                      aria-label={`Copy order number ${poNumber}`}
                    >
                      {poNumber}
                      {copiedPoNumber ? (
                        <span className="ml-1 text-text-muted" aria-hidden>
                          ✓
                        </span>
                      ) : null}
                    </button>
                  </HoverTooltip>
                ) : (
                  'No PO'
                )
              }
              valueTitle={headerTitle}
              valueClassName={paneHeaderLabelValueClass}
            />
          </>
        }
        rightSlot={
          primaryCta ? (
            <Button
              type="button"
              variant="primary"
              onClick={primaryCta.onClick}
              disabled={isOpeningEditor || form.isSaving}
              loading={isOpeningEditor}
              icon={<PackageOpen />}
              className="text-role-caption font-semibold uppercase tracking-wider"
            >
              {isOpeningEditor ? 'Working…' : primaryCta.label}
            </Button>
          ) : null
        }
        belowSlot={
          /* Utility toolbar — same shape as the LineEditPanel toolbar, so
              detail panes have one consistent action surface. Sits ABOVE
              the index→leaf shell. */
          <div className="px-6 pb-2">
            <PaneHeaderActionBar
              iconOnly
              actions={[
                {
                  key: 'refresh',
                  label: 'Refresh',
                  icon: <RefreshCw className="h-3.5 w-3.5" />,
                  onClick: handleRefresh,
                  disabled: form.isSaving,
                  title: 'Refetch this receiving log',
                },
                {
                  key: 'copy',
                  label: 'Copy',
                  icon: <Copy className={`h-3.5 w-3.5 ${isCopying ? 'animate-pulse' : ''}`} />,
                  onClick: () => void handleCopyAll(),
                  disabled: isCopying,
                  title: 'Copy receiving details to clipboard',
                },
              ] satisfies PaneHeaderActionBarAction[]}
              status={form.isSaving ? 'Saving' : undefined}
            />
          </div>
        }
      />

      <DeskInspectorIndexShell
        leaves={leaves}
        activeId={navId}
        onActiveIdChange={onNavChange}
        defaultActiveId="progress"
        indexRightSlot={triageOpenSlot}
        leafTrailing={triageOpenSlot}
        ariaLabel="Receiving topics"
        testId="receiving-inspector-index"
        backLabel="Back to topics"
      />

      {/* Footer — destructive action pinned to panel bottom (unfound / shipped pattern). */}
      <div className="shrink-0 border-t border-border-hairline px-6 py-3">
        {form.saveState === 'error' && (
          <p className="mb-2 text-center text-role-micro uppercase tracking-wider text-red-500">
            Save failed — check connection
          </p>
        )}
        <Button
          type="button"
          variant="danger"
          size="lg"
          onClick={() => {
            if (!confirmingDelete) {
              setConfirmingDelete(true);
              window.setTimeout(() => setConfirmingDelete(false), 3000);
              return;
            }
            setConfirmingDelete(false);
            void form.handleDelete();
          }}
          disabled={form.isDeleting || form.isSaving}
          icon={<Trash2 />}
          className={`w-full text-role-micro uppercase tracking-wider ${
            confirmingDelete ? 'bg-rose-700 hover:bg-rose-800' : ''
          }`}
        >
          {form.isDeleting
            ? 'Deleting...'
            : confirmingDelete
              ? 'Click again to confirm'
              : 'Delete'}
        </Button>
      </div>
      </div>
    </DetailStackRailRegistrar>
  );
}
