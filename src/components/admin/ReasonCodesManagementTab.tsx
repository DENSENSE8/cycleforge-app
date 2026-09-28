'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { qk } from '@/queries/keys';
import { Edit, Plus, Printer, Trash2, X } from '@/components/Icons';
import { Button, Checkbox, IconButton } from '@/design-system/primitives';
import {
  Dialog,
  DialogContent,
} from '@/design-system/components/Dialog';
import { requestConfirm } from '@/design-system/components/confirm';
import { FILTER_DROPDOWN_SELECT_CLASS } from '@/design-system/components/FilterDropdownSelect';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { mainStickyHeaderClass, mainStickyHeaderShellRowClass } from '@/components/layout/header-shell';
import { toast } from '@/lib/toast';
import { sectionLabel, fieldLabel, tableHeader, tableCell } from '@/design-system/tokens/typography/presets';
import { cn } from '@/utils/_cn';
import { STATION_COMMAND_FLOW_CONTEXT } from '@/lib/stations/station-command-codes';
import { printStationCommandLabel } from '@/lib/print/printStationCommandLabel';
import { focusRing } from '@/design-system/tokens/focus-ring';


/** Mirrors the rows returned by GET /api/reason-codes. */
interface ReasonCodeRecord {
  id: number;
  code: string;
  label: string;
  category: string | null;
  direction: 'in' | 'out' | 'either';
  requires_note: boolean;
  requires_photo: boolean;
  sort_order: number;
  flow_context?: string | null;
  applies_to?: string[] | null;
}

type Direction = ReasonCodeRecord['direction'];

const DIRECTION_OPTIONS: Array<{ value: Direction; label: string }> = [
  { value: 'either', label: 'Either' },
  { value: 'in', label: 'In' },
  { value: 'out', label: 'Out' },
];

/**
 * User-selectable categories. Must stay within the DB `reason_codes_category_chk`
 * set; `initial` is system-only (seed balances) so it's omitted from the picker.
 */
const CATEGORY_OPTIONS = ['movement', 'adjustment', 'shrinkage', 'sale', 'return'] as const;

/** Vocabulary filter options — mirrors live reason_codes_flow_context_chk values. */
const FLOW_CONTEXT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: 'All vocabularies' },
  { value: 'inventory_event', label: 'Inventory event' },
  { value: 'inventory_adjust', label: 'Inventory adjust' },
  { value: 'substitution', label: 'Substitution' },
  { value: 'short_pick', label: 'Short pick' },
  { value: 'receiving_exception', label: 'Receiving exception' },
  { value: 'repair_failure', label: 'Repair failure' },
  { value: 'verdict_detail', label: 'Verdict detail' },
  { value: 'warranty_denial', label: 'Warranty denial' },
  { value: 'lifecycle_unshipped', label: 'Lifecycle · unshipped' },
  { value: 'lifecycle_outbound', label: 'Lifecycle · outbound' },
  { value: 'serial_absent_reason', label: 'Serial absent' },
  { value: STATION_COMMAND_FLOW_CONTEXT, label: 'Station command' },
];

function flowContextLabel(ctx: string | null | undefined): string {
  if (!ctx) return '—';
  return FLOW_CONTEXT_OPTIONS.find((o) => o.value === ctx)?.label ?? ctx;
}

interface ReasonCodeFormState {
  code: string;
  label: string;
  category: string;
  direction: Direction;
  requiresNote: boolean;
  requiresPhoto: boolean;
  sortOrder: string;
  appliesTo: string[];
}

const DEFAULT_FORM_STATE: ReasonCodeFormState = {
  code: '',
  label: '',
  category: 'adjustment',
  direction: 'either',
  requiresNote: false,
  requiresPhoto: false,
  sortOrder: '0',
  appliesTo: [],
};

const inputClass =
  cn('h-10 w-full border border-border-soft bg-surface-card px-3 text-sm font-semibold text-text-default transition-colors', focusRing('field', 'neutral'));

export function ReasonCodesManagementTab() {
  const queryClient = useQueryClient();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<ReasonCodeFormState>(DEFAULT_FORM_STATE);
  const [filter, setFilter] = useState('');
  const [flowFilter, setFlowFilter] = useState('');

  const { data, isLoading } = useQuery<{ reason_codes: ReasonCodeRecord[] }>({
    queryKey: qk.reasonCodes.list(),
    queryFn: async () => {
      const res = await fetch('/api/reason-codes');
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.details || body?.error || 'Failed to load reason codes');
      return body;
    },
  });

  // Workflow nodes for the D3 applies_to (per-node palette) editor.
  const { data: nodesData } = useQuery<{ nodes: Array<{ id: string; label: string; definitionName: string | null }> }>({
    queryKey: ['catalog', 'workflow-nodes'],
    queryFn: async () => {
      const res = await fetch('/api/catalog/workflow-nodes');
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error('Failed to load workflow nodes');
      return body;
    },
  });
  const workflowNodes = nodesData?.nodes ?? [];

  const rows = data?.reason_codes ?? [];

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return rows.filter((r) => {
      if (flowFilter && (r.flow_context ?? '') !== flowFilter) return false;
      if (!q) return true;
      const category = (r.category ?? '').toLowerCase();
      const flow = (r.flow_context ?? '').toLowerCase();
      return (
        r.code.toLowerCase().includes(q) ||
        r.label.toLowerCase().includes(q) ||
        category.includes(q) ||
        flow.includes(q)
      );
    });
  }, [rows, filter, flowFilter]);

  const createMutation = useMutation({
    mutationFn: async (payload: ReasonCodeFormState) => {
      const res = await fetch('/api/reason-codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: payload.code,
          label: payload.label,
          category: payload.category,
          direction: payload.direction,
          requiresNote: payload.requiresNote,
          requiresPhoto: payload.requiresPhoto,
          sortOrder: Number(payload.sortOrder || 0),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 409) throw new Error('A reason code with that code already exists');
        throw new Error(body?.details || body?.error || 'Failed to create reason code');
      }
      return body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.reasonCodes.all });
      toast.success('Reason code created');
      closeForm();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: number; payload: ReasonCodeFormState }) => {
      const res = await fetch(`/api/reason-codes/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: payload.label,
          category: payload.category,
          direction: payload.direction,
          requiresNote: payload.requiresNote,
          requiresPhoto: payload.requiresPhoto,
          sortOrder: Number(payload.sortOrder || 0),
          appliesTo: payload.appliesTo.length > 0 ? payload.appliesTo : null,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.details || body?.error || 'Failed to update reason code');
      return body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.reasonCodes.all });
      toast.success('Reason code updated');
      closeForm();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/reason-codes/${id}`, { method: 'DELETE' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.details || body?.error || 'Failed to delete reason code');
      return body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.reasonCodes.all });
      toast.success('Reason code removed');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const closeForm = () => {
    setIsFormOpen(false);
    setEditingId(null);
    setForm(DEFAULT_FORM_STATE);
  };

  const openAdd = () => {
    setEditingId(null);
    setForm(DEFAULT_FORM_STATE);
    setIsFormOpen(true);
  };

  const openEdit = (row: ReasonCodeRecord) => {
    setEditingId(row.id);
    setForm({
      code: row.code,
      label: row.label,
      category: row.category || 'adjustment',
      direction: row.direction,
      requiresNote: row.requires_note,
      requiresPhoto: row.requires_photo,
      sortOrder: String(row.sort_order ?? 0),
      appliesTo: row.applies_to ?? [],
    });
    setIsFormOpen(true);
  };

  const handleSubmit = () => {
    if (!form.code.trim()) return toast.error('Code is required');
    if (!form.label.trim()) return toast.error('Label is required');
    if (!form.category.trim()) return toast.error('Category is required');

    if (editingId != null) {
      updateMutation.mutate({ id: editingId, payload: form });
      return;
    }
    createMutation.mutate(form);
  };

  const handleDelete = async (row: ReasonCodeRecord) => {
    const ok = await requestConfirm({
      description: `Remove reason code "${row.code}"? It will be hidden from pickers.`,
      tone: 'danger',
      confirmLabel: 'Remove',
    });
    if (!ok) return;
    deleteMutation.mutate(row.id);
  };

  const handlePrintCommand = (row: ReasonCodeRecord) => {
    printStationCommandLabel({ code: row.code, label: row.label });
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;
  const tableGridClass =
    'grid grid-cols-[150px_minmax(160px,1.2fr)_140px_120px_90px_70px_70px_64px_140px] gap-x-3';

  return (
    <section className={cn('flex h-full min-h-0 w-full flex-col')}>
      <div className={mainStickyHeaderClass}>
        <div className={`${mainStickyHeaderShellRowClass} flex-wrap gap-y-2 px-4`}>
          <p className={`${sectionLabel} truncate text-text-default`}>Reason Codes</p>
          <div className={`${sectionLabel} flex flex-wrap items-center gap-4`}>
            <span>Total {rows.length}</span>
            <select
              value={flowFilter}
              onChange={(e) => setFlowFilter(e.target.value)}
              className={cn(FILTER_DROPDOWN_SELECT_CLASS, 'h-8 min-w-[11rem]')}
              aria-label="Filter by vocabulary"
            >
              {FLOW_CONTEXT_OPTIONS.map((o) => (
                <option key={o.value || 'all'} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter code / label / category"
              className={cn("h-8 w-64 border border-border-soft bg-surface-card px-3 text-xs font-medium text-text-default", focusRing('field', 'neutral'))}
            />
            <Button variant="secondary" size="sm" icon={<Plus />} onClick={openAdd}>
              Add Code
            </Button>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        <div className="flex h-full min-h-0 flex-col overflow-hidden border-y border-border-soft bg-surface-card">
          <div className="min-h-0 flex-1 overflow-auto">
            <div className="min-w-[1100px]">
              <div className={`${tableGridClass} ${tableHeader} border-b border-border-soft px-4 py-3`}>
                <p>Code</p>
                <p>Label</p>
                <p>Vocabulary</p>
                <p>Category</p>
                <p>Direction</p>
                <p>Note</p>
                <p>Photo</p>
                <p>Sort</p>
                <p className="text-right">Actions</p>
              </div>

              {isLoading ? (
                <div className="px-6 py-10 text-sm font-medium text-text-soft">Loading reason codes...</div>
              ) : filtered.length === 0 ? (
                <div className="px-6 py-10 text-center">
                  <p className={sectionLabel}>No Reason Codes</p>
                  <p className="mt-2 text-sm font-medium text-text-soft">
                    {rows.length === 0
                      ? 'Add the first reason code for inventory adjustments.'
                      : 'No codes match your filter.'}
                  </p>
                </div>
              ) : (
                filtered.map((row) => (
                  <div
                    key={row.id}
                    className={`${tableGridClass} items-center border-b border-border-hairline px-4 py-3 text-sm last:border-b-0`}
                  >
                    <p className={`${tableCell} truncate font-mono `}>{row.code}</p>
                    <p className={`${tableCell} truncate`}>{row.label}</p>
                    <p className={`${tableCell} truncate text-text-muted`}>
                      {flowContextLabel(row.flow_context)}
                    </p>
                    <p className={`${tableCell} truncate text-text-muted`}>
                      {row.category ?? '—'}
                    </p>
                    <p className={`${tableHeader} text-text-muted`}>{row.direction}</p>
                    <p className={`${tableHeader} ${row.requires_note ? 'text-emerald-700' : 'text-text-faint'}`}>
                      {row.requires_note ? 'Yes' : '-'}
                    </p>
                    <p className={`${tableHeader} ${row.requires_photo ? 'text-emerald-700' : 'text-text-faint'}`}>
                      {row.requires_photo ? 'Yes' : '-'}
                    </p>
                    <p className={`${tableCell} text-text-muted`}>{row.sort_order}</p>
                    <div className="flex items-center justify-end gap-2">
                      {row.flow_context === STATION_COMMAND_FLOW_CONTEXT ? (
                        <HoverTooltip label="Print 2×1 command barcode" asChild>
                          <IconButton
                            onClick={() => handlePrintCommand(row)}
                            className="inline-flex h-8 w-8 items-center justify-center border border-border-soft hover:bg-surface-hover"
                            ariaLabel={`Print ${row.code}`}
                            icon={<Printer className="h-3.5 w-3.5" />}
                          />
                        </HoverTooltip>
                      ) : null}
                      <HoverTooltip label="Edit reason code" asChild>
                        <IconButton
                          onClick={() => openEdit(row)}
                          className="inline-flex h-8 w-8 items-center justify-center border border-border-soft hover:bg-surface-hover"
                          ariaLabel={`Edit ${row.code}`}
                          icon={<Edit className="h-3.5 w-3.5" />}
                        />
                      </HoverTooltip>
                      <HoverTooltip label="Remove reason code" asChild>
                        <IconButton
                          onClick={() => handleDelete(row)}
                          disabled={deleteMutation.isPending}
                          className="inline-flex h-8 w-8 items-center justify-center border border-rose-200 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                          ariaLabel={`Remove ${row.code}`}
                          icon={<Trash2 className="h-3.5 w-3.5" />}
                        />
                      </HoverTooltip>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      <Dialog
        open={isFormOpen}
        onOpenChange={(next) => {
          if (!next) closeForm();
        }}
      >
        <DialogContent hideClose className="max-w-2xl gap-0 overflow-hidden p-0 sm:rounded-xl">
          <div className="flex w-full flex-col overflow-hidden">
            <div className="flex items-center justify-between border-b border-border-soft px-5 py-4">
              <div>
                <p className={sectionLabel}>{editingId != null ? 'Edit Reason Code' : 'New Reason Code'}</p>
                <h3 className="mt-1 text-base font-semibold text-text-default">
                  {editingId != null ? `Update ${form.code}` : 'Add an inventory reason code'}
                </h3>
              </div>
              <IconButton
                onClick={closeForm}
                className="inline-flex h-9 w-9 items-center justify-center border border-border-soft hover:bg-surface-hover"
                ariaLabel="Close"
                icon={<X className="h-4 w-4" />}
              />
            </div>

            <div className="grid gap-4 border-b border-border-soft px-5 py-5 md:grid-cols-2">
              <label className="space-y-1">
                <span className={`block ${sectionLabel}`}>Code</span>
                <input
                  type="text"
                  value={form.code}
                  disabled={editingId != null}
                  onChange={(e) => setForm((c) => ({ ...c, code: e.target.value.toUpperCase() }))}
                  placeholder="DAMAGED"
                  className={`${inputClass} ${editingId != null ? 'cursor-not-allowed bg-surface-canvas text-text-soft' : ''}`}
                />
                {editingId != null && (
                  <span className={`block ${fieldLabel} text-text-faint`}>
                    Code is the key and can&apos;t be changed.
                  </span>
                )}
              </label>

              <label className="space-y-1">
                <span className={`block ${sectionLabel}`}>Category</span>
                <select
                  value={form.category}
                  onChange={(e) => setForm((c) => ({ ...c, category: e.target.value }))}
                  className={FILTER_DROPDOWN_SELECT_CLASS}
                >
                  {CATEGORY_OPTIONS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1 md:col-span-2">
                <span className={`block ${sectionLabel}`}>Label</span>
                <input
                  type="text"
                  value={form.label}
                  onChange={(e) => setForm((c) => ({ ...c, label: e.target.value }))}
                  placeholder="Human-readable name shown in the picker"
                  className={inputClass}
                />
              </label>

              <label className="space-y-1">
                <span className={`block ${sectionLabel}`}>Direction</span>
                <select
                  value={form.direction}
                  onChange={(e) => setForm((c) => ({ ...c, direction: e.target.value as Direction }))}
                  className={FILTER_DROPDOWN_SELECT_CLASS}
                >
                  {DIRECTION_OPTIONS.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1">
                <span className={`block ${sectionLabel}`}>Sort order</span>
                <input
                  type="number"
                  value={form.sortOrder}
                  onChange={(e) => setForm((c) => ({ ...c, sortOrder: e.target.value }))}
                  className={inputClass}
                />
              </label>

              <label className="flex items-center gap-2 md:col-span-2">
                <Checkbox
                  checked={form.requiresNote}
                  onCheckedChange={(v) => setForm((c) => ({ ...c, requiresNote: v === true }))}
                />
                <span className="text-sm font-medium text-text-default">Requires note</span>
              </label>

              <label className="flex items-center gap-2 md:col-span-2">
                <Checkbox
                  checked={form.requiresPhoto}
                  onCheckedChange={(v) => setForm((c) => ({ ...c, requiresPhoto: v === true }))}
                />
                <span className="text-sm font-medium text-text-default">Requires photo</span>
              </label>

              {editingId != null && workflowNodes.length > 0 ? (
                <div className="space-y-2 md:col-span-2">
                  <span className={`block ${sectionLabel}`}>Applies to workflow nodes</span>
                  <div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto">
                    {workflowNodes.map((n) => {
                      const checked = form.appliesTo.includes(n.id);
                      return (
                        <label
                          key={n.id}
                          className="inline-flex items-center gap-1.5 rounded border border-border-soft px-2 py-1 text-xs font-medium"
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(v) => {
                              setForm((c) => ({
                                ...c,
                                appliesTo:
                                  v === true
                                    ? [...c.appliesTo, n.id]
                                    : c.appliesTo.filter((id) => id !== n.id),
                              }));
                            }}
                          />
                          {n.label}
                        </label>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-4">
              <Button variant="ghost" size="sm" onClick={closeForm} disabled={isSaving}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" onClick={handleSubmit} disabled={isSaving}>
                {editingId != null ? 'Save' : 'Create'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
