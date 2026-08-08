'use client';

/**
 * Unbox Displays → Inventory leaf — secondary Root-to-Leaf drill.
 *
 *   Inventory index (this host)
 *     → Information   (PO telemetry)
 *     → Lines         (qty · rate · line notes / SN·condition text)
 *     → PO notes      (overall inventory header notes)
 *     → Activity      (receive / unreceive trail)
 *
 * Nested drill reports trail segments UP via {@link useDisplaysLeafChrome} —
 * the stack paints top-left ← → + current title. This host never mounts
 * {@link StationDisplayLeafHeader}.
 *
 * Keyboard / floor (Lines · PO notes · Activity only): F2 Change PO · F5
 * Refresh · ⌘/Ctrl+S Save on notes — also opt-in `/` leaf-commands
 * (`setLeafCommands`). **Information is read-only facts** — no trust strip,
 * no floor CTAs. Index has no floor. Focus restore: `data-station-action-dossier`.
 *
 * Law: instrument-panel.md · Station Action vs Context · Displays Root-to-Leaf.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  Check,
  ChevronRight,
  ClipboardList,
  FileText,
  Info,
  Link2,
  Loader2,
  Package,
  Pencil,
  RefreshCw,
} from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import {
  DenseComposeBodyBand,
  DenseComposeBodyTextarea,
} from '@/design-system/components';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';
import { InventoryPoHeader } from '@/components/receiving/inventory/InventoryPoHeader';
import { InventoryPoLineList } from '@/components/receiving/inventory/InventoryPoLineList';
import { InventoryActivityPanel } from '@/components/receiving/inventory/InventoryActivityPanel';
import { useInventoryPoDossier } from '@/components/receiving/inventory/useInventoryPoDossier';
import {
  StationActionKeyLegend,
  useDisplaysLeafChrome,
  useStationActionKeyBindings,
  type DisplaysFooterCommand,
  type StationActionKeyBinding,
} from '@/components/station/displays';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import { dispatchLineUpdated } from '@/components/station/receiving-lines-table-helpers';
import { zohoReceiptFace } from '@/lib/receiving/zoho-receipt-face';
import type { PoNoteTabState } from './terminal/usePoNoteTabState';
import type { DetailsResponse } from '@/components/sidebar/receiving/incoming-details/incoming-details-shared';

type InventorySubLeaf = 'info' | 'lines' | 'notes' | 'activity';

const SUB_LEAF_META: Record<
  InventorySubLeaf,
  { label: string; Icon: typeof Info }
> = {
  info: { label: 'Information', Icon: Info },
  lines: { label: 'Lines', Icon: Package },
  notes: { label: 'PO notes', Icon: FileText },
  activity: { label: 'Activity', Icon: Activity },
};

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
  onSyncFromInventory: () => void | Promise<void>;
  syncing?: boolean;
}) {
  const queryClient = useQueryClient();
  const [savingLineId, setSavingLineId] = useState<number | null>(null);
  const [descError, setDescError] = useState<string | null>(null);
  const [subLeaf, setSubLeaf] = useState<InventorySubLeaf | null>(null);
  const [lineFocus, setLineFocus] = useState(0);
  const poNotesRef = useRef<HTMLTextAreaElement>(null);
  const { setTrail, setOnNestedPop, setOnNestedRestore, setLeafCommands } =
    useDisplaysLeafChrome();

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
      if (segmentId in SUB_LEAF_META) {
        setSubLeaf(segmentId as InventorySubLeaf);
      }
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
        dispatchLineUpdated({ id: row.id, receiving_zoho_notes: next || null });
      }
      return;
    }
    poNote.setDraft(next);
    dispatchLineUpdated({ id: row.id, receiving_zoho_notes: next || null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dossier.data?.po_notes, poNote.dirty, row.id, row.receiving_zoho_notes]);

  const onSaveDescription = useCallback(
    async (line: DetailsResponse['line_items'][number], description: string | null) => {
      const lineId = line.receiving_line_id;
      if (lineId == null || lineId <= 0) return;
      setSavingLineId(lineId);
      setDescError(null);
      try {
        const res = await fetch(`/api/receiving/lines/${lineId}/inventory-note`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            zoho_notes: description,
            base_last_modified_zoho: poNote.baseLastModifiedZoho,
          }),
        });
        const data = (await res.json().catch(() => null)) as {
          error?: string;
          stale?: boolean;
          live_last_modified_zoho?: string | null;
          zoho?: { skipped?: string };
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
  const syncDisabled = syncing || unpaired || row.receiving_id == null;

  const runRefresh = useCallback(async () => {
    if (syncDisabled) return;
    await onSyncFromInventory();
    dossier.invalidate();
  }, [syncDisabled, onSyncFromInventory, dossier]);

  const keyBindings = useMemo((): StationActionKeyBinding[] => {
    // Information is read-only — no Action floor / hotkeys.
    if (subLeaf == null || subLeaf === 'info') return [];
    const isMac =
      typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
    const bindings: StationActionKeyBinding[] = [
      {
        chord: 'F2',
        label: 'Change PO',
        code: 'F2',
        onAction: onChangePo,
      },
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
  }, [onChangePo, runRefresh, syncing, syncDisabled, hasPoNote, poNote, subLeaf]);

  useStationActionKeyBindings(
    keyBindings,
    subLeaf != null && subLeaf !== 'info',
  );

  // Opt-in leaf-command footer — same actions as the key legend, slash faces.
  // Index + Information stay dismiss-only.
  useEffect(() => {
    if (subLeaf == null || subLeaf === 'info') {
      setLeafCommands(null);
      return;
    }
    const cmds: DisplaysFooterCommand[] = [
      {
        id: 'change-po',
        slash: 'change po',
        label: 'Change PO',
        onAction: onChangePo,
      },
      {
        id: 'refresh',
        slash: 'refresh',
        label: syncing ? 'Refreshing…' : 'Refresh',
        disabled: syncDisabled,
        onAction: () => {
          void runRefresh();
        },
      },
    ];
    if (subLeaf === 'notes' && hasPoNote) {
      cmds.push({
        id: 'save-notes',
        slash: 'save notes',
        label: 'Save notes',
        disabled: poNote.saving || !poNote.dirty,
        onAction: () => {
          if (poNote.dirty && !poNote.saving) void poNote.save();
        },
      });
    }
    setLeafCommands(cmds);
    return () => setLeafCommands(null);
  }, [
    subLeaf,
    onChangePo,
    runRefresh,
    syncing,
    syncDisabled,
    hasPoNote,
    poNote.dirty,
    poNote.saving,
    poNote,
    setLeafCommands,
  ]);

  useEffect(() => {
    if (subLeaf !== 'notes') return;
    const el = poNotesRef.current;
    if (el && document.activeElement !== el) {
      el.focus({ preventScroll: true });
    }
  }, [subLeaf]);

  const infoStatusLabel =
    zohoReceiptFace(dossier.data?.po?.status)?.label ?? dossier.data?.po?.status ?? null;

  const indexRows: Array<{
    id: InventorySubLeaf;
    label: string;
    subtitle: string;
    tone: 'action' | 'ok' | 'neutral';
    Icon: typeof Info;
    visible: boolean;
  }> = [
    {
      id: 'info',
      label: 'Information',
      subtitle: dossier.data?.po
        ? `${infoStatusLabel ?? '—'} · ${dossier.data.po.vendor_name ?? '—'}`
        : 'PO header · vendor · dates',
      tone: 'neutral',
      Icon: Info,
      visible: true,
    },
    {
      id: 'lines',
      label: 'Lines',
      subtitle:
        lineCount > 0
          ? `${inventoryReceived}/${inventoryExpected} received · ${lineCount} line${lineCount === 1 ? '' : 's'}`
          : 'Line qty · rate · description',
      tone: lineCount === 0 ? 'action' : 'ok',
      Icon: Package,
      visible: true,
    },
    {
      id: 'notes',
      label: 'PO notes',
      subtitle: poNote.dirty
        ? 'Unsaved draft'
        : poNote.draft.trim()
          ? 'Synced inventory notes'
          : 'No notes yet',
      tone: poNote.dirty ? 'action' : poNote.draft.trim() ? 'ok' : 'neutral',
      Icon: FileText,
      visible: hasPoNote,
    },
    {
      id: 'activity',
      label: 'Activity',
      subtitle:
        activityCount > 0
          ? `${activityCount} event${activityCount === 1 ? '' : 's'}`
          : 'Receive · unreceive trail',
      tone: activityCount > 0 ? 'ok' : 'neutral',
      Icon: ClipboardList,
      visible: true,
    },
  ];

  const openSub = useCallback((id: InventorySubLeaf) => setSubLeaf(id), []);

  /** Floor on Lines · PO notes · Activity only — Information is facts-only. */
  const showFloor = subLeaf != null && subLeaf !== 'info' && !unpaired;

  const floorLeading = showFloor ? (
    <div className="flex shrink-0 items-stretch justify-start gap-0 [&_button]:h-full [&_button]:min-h-9">
      {(subLeaf === 'lines' || subLeaf === 'activity') ? (
        <Button
          type="button"
          variant="secondary"
          size="md"
          icon={<Pencil className="h-3.5 w-3.5" />}
          onClick={onChangePo}
          ariaLabel="Change purchase order"
        >
          Change PO
        </Button>
      ) : null}
      <Button
        type="button"
        variant="ghost"
        size="md"
        icon={
          syncing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )
        }
        disabled={syncDisabled}
        onClick={() => void runRefresh()}
        title={unpaired ? 'Pair a purchase order first' : 'Pull latest from inventory'}
      >
        {syncing ? 'Refreshing…' : 'Refresh'}
      </Button>
      {hasPoNote && subLeaf === 'notes' ? (
        <Button
          type="button"
          variant="primary"
          size="md"
          icon={
            poNote.saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Check className="h-3.5 w-3.5" />
            )
          }
          disabled={!poNote.dirty || poNote.saving || poNote.loading}
          onClick={() => void poNote.save()}
        >
          {poNote.saving ? 'Saving…' : 'Save notes'}
        </Button>
      ) : null}
    </div>
  ) : null;

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
        /* ── SECONDARY INDEX — no trust strip, no floor ─────────────────── */
        <div className="min-h-0 flex-1 overflow-y-auto" data-inventory-sub-index="">
          <ul className="divide-y divide-border-hairline">
            {indexRows
              .filter((r) => r.visible)
              .map((r) => {
                const Icon = r.Icon;
                return (
                  <li key={r.id}>
                    <button
                      type="button"
                      className={cn(
                        'flex w-full items-center gap-3 px-3 py-3 text-left',
                        r.tone === 'action' && 'bg-amber-50/60',
                        'hover:bg-surface-sunken/80',
                        focusRing('control', 'accent'),
                        'outline-none',
                      )}
                      onClick={() => openSub(r.id)}
                      data-inventory-sub-row={r.id}
                    >
                      <Icon className="h-5 w-5 shrink-0 text-text-soft" aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-role-caption font-semibold text-text-default">
                          {r.label}
                        </span>
                        <span className="mt-0.5 block truncate text-role-micro text-text-muted">
                          {r.subtitle}
                        </span>
                      </span>
                      <span
                        className={cn(
                          'shrink-0 rounded-none px-1.5 py-0.5 text-role-eyebrow uppercase tracking-wider',
                          r.tone === 'action' &&
                            'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200',
                          r.tone === 'ok' &&
                            'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200',
                          r.tone === 'neutral' &&
                            'bg-surface-sunken text-text-soft ring-1 ring-inset ring-border-hairline',
                        )}
                      >
                        {r.tone === 'action' ? 'Open' : r.tone === 'ok' ? 'Ready' : 'View'}
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-text-faint" aria-hidden />
                    </button>
                  </li>
                );
              })}
          </ul>
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
                {!poNote.draft.trim() ? (
                  <p className="px-2 py-3 text-role-caption text-text-faint">
                    No inventory notes yet — Refresh to pull, or type and Save.
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

      {showFloor ? (
        <StationActionKeyLegend
          bindings={keyBindings}
          data-testid="inventory-instrument-floor"
          leading={floorLeading}
        />
      ) : null}
    </div>
  );
}
