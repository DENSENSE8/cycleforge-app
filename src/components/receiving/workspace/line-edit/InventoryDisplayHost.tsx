'use client';

/**
 * Unbox Displays → Inventory leaf — secondary Root-to-Leaf drill.
 *
 *   Inventory index ({@link StationArmedVerbList})
 *     → Information   (PO telemetry)
 *     → Lines         (qty · rate · line notes / SN·condition text)
 *     → PO notes      (overall inventory header notes)
 *     → Activity      (receive / unreceive trail)
 *
 * Nested drill reports trail / pop / restore UP via
 * {@link useDisplaysLeafChrome} — the stack owns ← → Esc / Back and the
 * column (no footer since 2026-08-19). This host never mounts
 * {@link StationDisplayLeafHeader}, a hand-rolled sub-index, an Action
 * KeyLegend floor, or `/` leaf-commands.
 *
 * Primary mutator for notes Save mounts in the sticky leaf header via
 * {@link useDisplaysLeafChrome} `setLeafTrailing`. Zoho inventory Refresh lives
 * on the carton Macro floor (`UnboxDisplaysActionFloor` refresh icon) — never
 * in the Inventory breadcrumb. Silent F5 / ⌘S still work (incl. inside the
 * notes field). Receive / Unreceive stay on the Unbox dock. Change PO → Pair
 * inventory empty state or Linkage. Focus restore: `data-station-action-dossier`.
 *
 * Law: instrument-panel.md · Station Action vs Context · Displays Root-to-Leaf.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  Check,
  FileText,
  Info,
  Link2,
  Loader2,
  Package,
} from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import {
  DenseComposeBodyBand,
  DenseComposeBodyTextarea,
} from '@/design-system/components';
import { InventoryPoHeader } from '@/components/receiving/inventory/InventoryPoHeader';
import { InventoryPoLineList } from '@/components/receiving/inventory/InventoryPoLineList';
import { InventoryActivityPanel } from '@/components/receiving/inventory/InventoryActivityPanel';
import { useInventoryPoDossier } from '@/components/receiving/inventory/useInventoryPoDossier';
import {
  useDisplaysLeafChrome,
  useStationActionKeyBindings,
  type StationActionKeyBinding,
} from '@/components/station/displays';
import {
  StationArmedVerbList,
  type StationArmedVerb,
} from '@/components/station/displays/StationArmedVerbList';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import { dispatchLineUpdated } from '@/components/station/receiving-lines-table-helpers';
import { zohoReceiptFace } from '@/lib/receiving/zoho-receipt-face';
import { toast } from '@/lib/toast';
import { cn } from '@/utils/_cn';
import type { InventoryDossierRefreshResult } from './hooks/useZohoSync';
import type { PoNoteTabState } from './terminal/usePoNoteTabState';
import type { DetailsResponse } from '@/components/sidebar/receiving/incoming-details/incoming-details-shared';

type InventorySubLeaf = 'info' | 'lines' | 'notes' | 'activity';

const SUB_LEAF_META: Record<
  InventorySubLeaf,
  { label: string; Icon: typeof Info; preferredKey: string }
> = {
  info: { label: 'Information', Icon: Info, preferredKey: 'i' },
  lines: { label: 'Lines', Icon: Package, preferredKey: 'l' },
  notes: { label: 'PO notes', Icon: FileText, preferredKey: 'n' },
  activity: { label: 'Activity', Icon: Activity, preferredKey: 'a' },
};

function isInventorySubLeaf(id: string): id is InventorySubLeaf {
  return id in SUB_LEAF_META;
}

export function InventoryDisplayHost({
  row,
  hasPoNote,
  poNote,
  onChangePo,
  onSyncFromInventory,
  syncing = false,
}: {
  row: ReceivingLineRow;
  hasPoNote: boolean;
  poNote: PoNoteTabState;
  onChangePo: () => void;
  onSyncFromInventory: () => void | Promise<InventoryDossierRefreshResult | void>;
  syncing?: boolean;
}) {
  const queryClient = useQueryClient();
  const [savingLineId, setSavingLineId] = useState<number | null>(null);
  const [descError, setDescError] = useState<string | null>(null);
  const [subLeaf, setSubLeaf] = useState<InventorySubLeaf | null>(null);
  const [lineFocus, setLineFocus] = useState(0);
  const poNotesRef = useRef<HTMLTextAreaElement>(null);
  const {
    setTrail,
    setOnNestedPop,
    setOnNestedRestore,
    setLeafTrailing,
  } = useDisplaysLeafChrome();

  // Report breadcrumb trail to the stack header — never mount a nested LeafHeader.
  useEffect(() => {
    if (subLeaf == null) {
      setTrail([{ id: 'inventory', label: 'Inventory' }]);
    } else {
      setTrail([
        { id: 'inventory', label: 'Inventory' },
        { id: subLeaf, label: SUB_LEAF_META[subLeaf].label },
      ]);
    }
  }, [subLeaf, setTrail]);

  useEffect(() => {
    setOnNestedPop(() => setSubLeaf(null));
    return () => setOnNestedPop(null);
  }, [setOnNestedPop]);

  useEffect(() => {
    setOnNestedRestore((segmentId) => {
      if (isInventorySubLeaf(segmentId)) setSubLeaf(segmentId);
    });
    return () => setOnNestedRestore(null);
  }, [setOnNestedRestore]);

  const poId = (row.zoho_purchaseorder_id || '').trim() || null;
  const inboundSource = (row.inbound_source_type || '').trim().toLowerCase();
  const inboundOrderId = (row.source_order_id || '').trim();
  const isInbound =
    !poId && inboundSource !== '' && inboundSource !== 'zoho' && inboundOrderId !== '';

  const dossier = useInventoryPoDossier({
    poId,
    receivingId: row.receiving_id ?? null,
    shipmentId:
      typeof row.shipment_ref === 'number' && row.shipment_ref > 0 ? row.shipment_ref : null,
    inboundSource: isInbound ? inboundSource : null,
    inboundOrderId: isInbound ? inboundOrderId : null,
  });

  const lines = dossier.data?.line_items ?? [];
  const lineCount = lines.length;
  const inventoryReceived = lines.reduce((s, l) => s + (l.quantity_received || 0), 0);
  const inventoryExpected = lines.reduce((s, l) => s + (l.quantity_expected || 0), 0);
  const activityCount =
    (dossier.data?.receive_events?.length ?? 0) + (dossier.data?.zoho_activity?.length ?? 0);

  // Seed block-if-stale base stamp from the dossier. Never adopt while dirty.
  useEffect(() => {
    const next = dossier.data?.po?.last_modified_zoho ?? null;
    if (!next) return;
    if (poNote.dirty) return;
    if (poNote.baseLastModifiedZoho === next) return;
    poNote.setBaseLastModifiedZoho(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dossier.data?.po?.last_modified_zoho, poNote.dirty, poNote.baseLastModifiedZoho]);

  // Trust paint: dossier `po_notes` (carton zoho_notes · mirror raw.notes) wins
  // when the operator draft is clean — never leave an empty notes leaf while
  // inventory has text.
  useEffect(() => {
    if (poNote.dirty) return;
    const next = dossier.data?.po_notes;
    if (next == null) return;
    const nextTrim = next.trim();
    const draftTrim = poNote.draft.trim();
    const rowTrim = (row.receiving_zoho_notes ?? '').trim();
    if (nextTrim === draftTrim && nextTrim === rowTrim) return;
    if (draftTrim && draftTrim !== rowTrim) return; // unsaved path already guarded by dirty
    if (nextTrim === draftTrim) {
      if (nextTrim !== rowTrim) {
        dispatchLineUpdated({ id: row.id, receiving_zoho_notes: next });
      }
      return;
    }
    poNote.setDraft(next);
    if (nextTrim !== rowTrim) {
      dispatchLineUpdated({ id: row.id, receiving_zoho_notes: next });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dossier.data?.po_notes, poNote.dirty, row.id, row.receiving_zoho_notes]);

  const onSaveDescription = useCallback(
    async (line: DetailsResponse['line_items'][number], next: string | null) => {
      const lineId = line.receiving_line_id;
      if (lineId == null || lineId <= 0) return;
      setSavingLineId(lineId);
      setDescError(null);
      try {
        const res = await fetch(`/api/receiving/lines/${lineId}/inventory-note`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            notes: next ?? '',
            base_last_modified_zoho: poNote.baseLastModifiedZoho,
          }),
        });
        const data = (await res.json().catch(() => null)) as {
          error?: string;
          stale?: boolean;
          zoho?: { skipped?: string };
          live_last_modified_zoho?: string | null;
        } | null;
        if (res.status === 409 || data?.stale || data?.zoho?.skipped === 'stale') {
          setDescError(data?.error?.trim() || 'Inventory changed — Refresh');
          return;
        }
        if (!res.ok) {
          setDescError(data?.error?.trim() || 'Could not save item description');
          return;
        }
        if (data?.live_last_modified_zoho) {
          poNote.setBaseLastModifiedZoho(data.live_last_modified_zoho);
        }
        void dossier.invalidate();
        void queryClient.invalidateQueries({ queryKey: ['receiving-lines-table'] });
      } catch {
        setDescError('Could not save item description');
      } finally {
        setSavingLineId(null);
      }
    },
    [dossier, queryClient, poNote],
  );

  const unpaired = !poId && !dossier.data?.po;
  const syncDisabled =
    syncing || poNote.loading || unpaired || row.receiving_id == null;

  const runRefresh = useCallback(async () => {
    if (syncDisabled) return;
    const result = await onSyncFromInventory();
    dossier.invalidate();
    if (result && typeof result === 'object' && 'ok' in result) {
      if (result.ok) {
        toast.success('Inventory refreshed', {
          description: 'Pulled latest status, notes, and lines from inventory.',
        });
      } else if (result.painted) {
        toast.warning('Inventory status updated locally', {
          description: result.error,
        });
      } else {
        toast.error('Inventory refresh failed', {
          description: result.error,
        });
      }
      return;
    }
    // Legacy void callers — still confirm the gesture completed.
    toast.success('Inventory refreshed');
  }, [syncDisabled, onSyncFromInventory, dossier]);

  // Sticky leaf-header trailing — Save on PO notes only. Zoho Refresh is the
  // Macro-floor refresh icon (never the Inventory breadcrumb).
  useEffect(() => {
    if (unpaired || dossier.isLoading || dossier.isError || !dossier.data) {
      setLeafTrailing(null);
      return () => setLeafTrailing(null);
    }
    const showSave = subLeaf === 'notes' && hasPoNote;
    if (!showSave) {
      setLeafTrailing(null);
      return () => setLeafTrailing(null);
    }
    setLeafTrailing(
      <div
        className="flex h-full items-stretch gap-0"
        data-inventory-leaf-trailing=""
      >
        <Button
          type="button"
          variant="primary"
          size="sm"
          className={cn('h-full min-h-0 rounded-none px-2')}
          icon={
            poNote.saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Check className="h-3.5 w-3.5" />
            )
          }
          disabled={!poNote.dirty || poNote.saving || poNote.loading}
          onClick={() => void poNote.save()}
          title="Save PO notes to inventory"
          ariaLabel="Save notes"
        >
          {poNote.saving ? 'Saving…' : 'Save'}
        </Button>
      </div>,
    );
    return () => setLeafTrailing(null);
  }, [
    unpaired,
    dossier.isLoading,
    dossier.isError,
    dossier.data,
    subLeaf,
    hasPoNote,
    poNote.saving,
    poNote.dirty,
    poNote.loading,
    poNote,
    setLeafTrailing,
  ]);

  // Silent Action keys — F5 / ⌘S also fire inside the notes textarea.
  const keyBindings = useMemo((): StationActionKeyBinding[] => {
    if (unpaired) return [];
    const isMac =
      typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
    const bindings: StationActionKeyBinding[] = [
      {
        chord: 'F5',
        label: syncing ? 'Refreshing…' : 'Refresh',
        code: 'F5',
        disabled: syncDisabled,
        onAction: () => {
          void runRefresh();
        },
      },
    ];
    if (subLeaf === 'notes' && hasPoNote) {
      bindings.push({
        chord: isMac ? '⌘S' : 'Ctrl+S',
        label: 'Save notes',
        code: 'KeyS',
        metaKey: isMac,
        ctrlKey: !isMac,
        disabled: poNote.saving || !poNote.dirty,
        onAction: () => {
          if (poNote.dirty && !poNote.saving) void poNote.save();
        },
      });
    }
    return bindings;
  }, [unpaired, runRefresh, syncing, syncDisabled, hasPoNote, poNote, subLeaf]);

  useStationActionKeyBindings(keyBindings, !unpaired);

  // Entering PO notes with an empty draft — pull once (header Refresh twin).
  useEffect(() => {
    if (subLeaf !== 'notes' || !hasPoNote) return;
    if (poNote.dirty || poNote.draft.trim() || poNote.loading || syncDisabled) return;
    void runRefresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot on notes open when empty
  }, [subLeaf]);

  useEffect(() => {
    if (subLeaf !== 'notes') return;
    const el = poNotesRef.current;
    if (el && document.activeElement !== el) {
      el.focus({ preventScroll: true });
    }
  }, [subLeaf]);

  const infoStatusLabel =
    zohoReceiptFace(dossier.data?.po?.status)?.label ?? dossier.data?.po?.status ?? null;

  const verbs = useMemo<StationArmedVerb[]>(() => {
    const rows: StationArmedVerb[] = [
      {
        id: 'info',
        label: SUB_LEAF_META.info.label,
        preferredKey: SUB_LEAF_META.info.preferredKey,
        subtitle: dossier.data?.po
          ? `${infoStatusLabel ?? '—'} · ${dossier.data.po.vendor_name ?? '—'}`
          : 'PO header · vendor · dates',
        icon: (p) => <Info className={p.className} />,
      },
      {
        id: 'lines',
        label: SUB_LEAF_META.lines.label,
        preferredKey: SUB_LEAF_META.lines.preferredKey,
        subtitle:
          lineCount > 0
            ? `${inventoryReceived}/${inventoryExpected} received · ${lineCount} line${lineCount === 1 ? '' : 's'}`
            : 'Line qty · rate · description',
        icon: (p) => <Package className={p.className} />,
      },
    ];
    if (hasPoNote) {
      rows.push({
        id: 'notes',
        label: SUB_LEAF_META.notes.label,
        preferredKey: SUB_LEAF_META.notes.preferredKey,
        subtitle: poNote.dirty
          ? 'Unsaved draft'
          : poNote.draft.trim()
            ? 'Synced inventory notes'
            : 'No notes yet',
        icon: (p) => <FileText className={p.className} />,
      });
    }
    rows.push({
      id: 'activity',
      label: SUB_LEAF_META.activity.label,
      preferredKey: SUB_LEAF_META.activity.preferredKey,
      subtitle:
        activityCount > 0
          ? `${activityCount} event${activityCount === 1 ? '' : 's'}`
          : 'Receive · unreceive trail',
      icon: (p) => <Activity className={p.className} />,
    });
    return rows;
  }, [
    dossier.data?.po,
    infoStatusLabel,
    lineCount,
    inventoryReceived,
    inventoryExpected,
    hasPoNote,
    poNote.dirty,
    poNote.draft,
    activityCount,
  ]);

  const openSub = useCallback((id: string) => {
    if (isInventorySubLeaf(id)) setSubLeaf(id);
  }, []);

  return (
    <div
      className="flex h-full min-h-0 flex-1 flex-col"
      data-testid="unbox-inventory-display"
      data-inventory-flat=""
      data-inventory-instrument=""
      data-inventory-drill=""
      data-claim-chrome="display"
      data-station-action-dossier=""
    >
      {unpaired ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-2">
          <p className="text-center text-role-caption font-medium text-text-soft">
            No inventory purchase order linked.
          </p>
          <Button
            variant="primary"
            size="md"
            icon={<Link2 className="h-3.5 w-3.5" />}
            onClick={onChangePo}
          >
            Pair inventory
          </Button>
        </div>
      ) : dossier.isLoading ? (
        <p className="flex-1 px-2 py-6 text-center text-role-caption text-text-faint">
          Loading inventory…
        </p>
      ) : dossier.isError || !dossier.data ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-2">
          <p className="text-role-caption text-text-soft">Could not load inventory.</p>
          <Button variant="ghost" size="sm" onClick={() => void dossier.refetch()}>
            Retry
          </Button>
        </div>
      ) : subLeaf == null ? (
        /* ── SECONDARY INDEX — armed SoT list; stack owns ← → Esc ─────────── */
        <div className="flex min-h-0 flex-1 flex-col" data-inventory-sub-index="">
          <StationArmedVerbList
            verbs={verbs}
            listLabel="Inventory sections"
            testId="unbox-inventory-actions"
            onCommit={openSub}
          />
        </div>
      ) : (
        /* ── SUB-LEAF ──────────────────────────────────────────────────── */
        <div className="flex min-h-0 flex-1 flex-col" data-inventory-sub-leaf={subLeaf}>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {subLeaf === 'info' ? (
              <InventoryPoHeader data={dossier.data} variant="instrument" />
            ) : null}

            {subLeaf === 'lines' ? (
              <section aria-label="Line notes" data-inventory-section="lines">
                {descError ? (
                  <p className="border-b border-border-hairline px-2 py-1.5 text-role-caption text-amber-700">
                    {descError}
                  </p>
                ) : null}
                <InventoryPoLineList
                  lines={lines}
                  focusReceivingLineId={row.id ?? null}
                  editable
                  inlineNotes
                  poStatus={dossier.data?.po?.status ?? null}
                  onSaveDescription={onSaveDescription}
                  savingLineId={savingLineId}
                  focusIndex={lineFocus}
                  onFocusIndexChange={setLineFocus}
                />
              </section>
            ) : null}

            {subLeaf === 'notes' && hasPoNote ? (
              <section aria-label="PO notes" data-inventory-section="notes">
                <DenseComposeBodyBand>
                  <DenseComposeBodyTextarea
                    ref={poNotesRef}
                    id="inventory-po-notes"
                    rows={10}
                    aria-label="Synced PO note"
                    value={poNote.draft}
                    onChange={(e) => poNote.setDraft(e.target.value)}
                    placeholder="PO notes from inventory"
                    className="min-h-[12rem]"
                  />
                </DenseComposeBodyBand>
                {!poNote.draft.trim() && !poNote.loading ? (
                  <p className="px-2 py-3 text-role-caption text-text-faint">
                    No inventory notes yet — use the Displays refresh icon (or
                    F5), then Save.
                  </p>
                ) : null}
              </section>
            ) : null}

            {subLeaf === 'activity' ? (
              <section aria-label="Activity" data-inventory-section="activity">
                <InventoryActivityPanel data={dossier.data} />
              </section>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
