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

  /**
   * Dismissal REFUSAL, not a no-op handler. `onClose` can only say "I am done";
   * a guarded `onClose` still let the host run its lifecycle half (park + the
   * "Draft saved." toast) over an in-flight save. `closeRightPanel` consults
   * this before either half, so host `✕` / Esc / click-off all honour it.
   */
  const canClose = () => !form.isSaving && !form.isDeleting;

  const poNumber = (log.zoho_purchaseorder_number || '').trim();

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

  /**
   * Band verbs — the one trailing cluster, `[Unbox] [Refresh] [Copy]`.
   *
   * These were three separate affordances on a stacked header: a primary
   * `Unbox` CTA in the PaneHeader `rightSlot`, a triage-only `Open in unbox`
   * IconButton (the SAME `handleEditPO`, gated on the surface instead of on
   * readiness), and a `PaneHeaderActionBar` on a third row below both. Two
   * doors onto one verb is the shape the carton-bar ruling bans, so Unbox is
   * one cell that lights when EITHER gate says so.
   *
   * Edit PO / Search purchase order stay deliberately absent — operators match
   * or edit lines from the Unbox workspace, not from this read-focused rail.
   */
  const showUnbox = isTriageSurface || readiness.cta === 'continue_unbox';

  const bandVerbs = (
    <>
      {/* Read-only metric, leading the cluster — the `status` readout the
          deleted ActionBar carried. Never a verb. */}
      {form.isSaving ? (
        <span
          className="flex h-full items-center px-1.5 text-role-micro uppercase tracking-wider text-text-soft"
          aria-live="polite"
        >
          Saving
        </span>
      ) : null}
      {showUnbox ? (
        <HoverTooltip label="Open this carton in unbox" asChild focusable={false}>
          <IconButton
            icon={<PackageOpen className="h-3.5 w-3.5" />}
            ariaLabel="Open in unbox"
            tone="accent"
            size="xs"
            onClick={() => void handleEditPO()}
            disabled={isOpeningEditor || form.isSaving}
            data-testid="receiving-details-unbox"
          />
        </HoverTooltip>
      ) : null}
      <HoverTooltip label="Refetch this receiving log" asChild focusable={false}>
        <IconButton
          icon={<RefreshCw className="h-3.5 w-3.5" />}
          ariaLabel="Refresh"
          tone="neutral"
          size="xs"
          onClick={handleRefresh}
          disabled={form.isSaving}
        />
      </HoverTooltip>
      <HoverTooltip label="Copy receiving details to clipboard" asChild focusable={false}>
        <IconButton
          icon={<Copy className={`h-3.5 w-3.5 ${isCopying ? 'animate-pulse' : ''}`} />}
          ariaLabel="Copy receiving details"
          tone="neutral"
          size="xs"
          onClick={() => void handleCopyAll()}
          disabled={isCopying}
        />
      </HoverTooltip>
    </>
  );

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
      onClose={onClose}
      canClose={canClose}
      elevated
      modal={false}
      closeOnOutsideClick
      ariaLabel={poNumber ? `Receiving details for order ${poNumber}` : 'Receiving details'}
    >
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {/*
        ONE band, no stacked header (2026-08-21).

        This used to paint a `PaneHeader` above the shell: an icon badge, an
        eyebrow (`Order #`) over the click-to-copy PO number, an `Unbox` CTA in
        `rightSlot`, and a `PaneHeaderActionBar` on a third row in `belowSlot`.
        That is three chrome rows above a shell whose own band already carries
        back · title · trailing — the exact stacked-band defect the Displays
        column contract exists to prevent, and an eyebrow/title pair on two
        lines besides.

        The PO number is NOT lost with the header: the Progress leaf renders it
        as a copyable `PO number` field (`ReceivingInventoryLinkageSection`),
        which is where record identity belongs once the band carries the
        segment. Verbs moved into the band's one trailing cluster.
      */}
      <DeskInspectorIndexShell
        stance="index"
        leaves={leaves}
        activeId={navId}
        onActiveIdChange={onNavChange}
        defaultActiveId="progress"
        // Index-stage title only — a leaf paints its own segment (`Progress` /
        // `Items` / `Serial journey`).
        title="Carton"
        indexRightSlot={bandVerbs}
        leafTrailing={bandVerbs}
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
