'use client';

/**
 * Incoming purchase-order CSV staging — desk-centre grid beside the returns
 * import. Columns are identified on load (header words, then value shape);
 * the aside lists every file column with its field pick and the server's
 * dry-run per order (new / updated / unchanged, lines, tier, problems).
 * Confirm sends the whole file; the server lands clean orders and holds any
 * order with a problem row, whole.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/design-system/primitives';
import { SearchField } from '@/design-system/primitives/SearchField';
import { SearchableSelectField } from '@/design-system/components/SearchableSelectField';
import { InlineEditableValue } from '@/design-system/components/InlineEditableValue';
import { FilterMenu } from '@/components/ui/FilterMenu';
import {
  INBOUND_PO_IMPORT_DESCRIPTOR,
  setPoImportPlatform,
  usePoImportPlatform,
  type InboundPoImportRowView,
} from '@/lib/inbound/inbound-po-import-descriptor';
import { PO_COLUMNS, PO_FIELDS, identifyColumns, poPresetForPlatform, withPoMapping, type PoField } from '@/lib/inbound/po-columns';
import { postPoCsvImport, usePoCsvPreview, usePoPlatformChoices } from '@/lib/inbound/po-csv-client';
import { invalidateReceivingFeeds } from '@/lib/queries/receiving-queries';
import { toast } from '@/lib/toast';
import { cn } from '@/utils/_cn';
import {
  clearTableImportDraft,
  listTableImportRows,
  setTableImportFilter,
  setTableImportFocusRow,
  setTableImportMapping,
  setTableImportQuery,
  summarizeTableImportDraft,
  updateTableImportRow,
  useTableImportDraft,
  type TableImportFilter,
} from '@/lib/tables/import/staging-store';
import { useTableImportParam } from '@/hooks/useTableImportParam';

const SURFACE = INBOUND_PO_IMPORT_DESCRIPTOR.surfaceId;

const COLUMNS: { key: keyof InboundPoImportRowView; label: string; field?: PoField }[] = [
  { key: 'status', label: 'Status' },
  { key: 'orderNumber', label: 'Order #', field: 'order_number' },
  { key: 'title', label: 'Title', field: 'item_title' },
  { key: 'sku', label: 'SKU', field: 'sku' },
  { key: 'quantity', label: 'Qty', field: 'quantity' },
  { key: 'unitCost', label: 'Unit cost', field: 'unit_cost' },
  { key: 'tracking', label: 'Tracking', field: 'tracking' },
  { key: 'problems', label: 'Needs fix' },
];

const FILTER_OPTIONS: { id: TableImportFilter; label: string }[] = [
  { id: 'all', label: 'All rows' },
  { id: 'ready', label: 'Ready' },
  { id: 'action_required', label: 'Needs fix' },
];

const FIELD_OPTIONS = [
  { value: '', label: 'Leave out' },
  ...PO_FIELDS.map((f) => ({ value: f, label: PO_COLUMNS[f].label })),
];

const CHANGE_FACE: Record<string, string> = {
  new: 'bg-emerald-50 text-emerald-700',
  updated: 'bg-blue-50 text-blue-700',
  unchanged: 'bg-surface-sunken text-text-soft',
  invalid: 'bg-amber-50 text-amber-800',
};

/** One editable staging cell — a local buffer (re-keyed by value), saved to the draft on blur / Enter. */
function StagingCell({ value, label, onSave }: { value: string; label: string; onSave: (next: string) => void }) {
  const [draftValue, setDraftValue] = useState(value);
  return (
    <InlineEditableValue
      value={draftValue}
      onChange={setDraftValue}
      onSubmit={() => {
        if (draftValue !== value) onSave(draftValue);
      }}
      onCancel={() => setDraftValue(value)}
      showEditIcon={false}
      monospace
      valueClassName="text-role-caption font-normal"
      inputClassName="text-role-caption"
      ariaLabel={label}
    />
  );
}

export function IncomingPoImportStagingHost() {
  const draft = useTableImportDraft(SURFACE);
  const platform = usePoImportPlatform();
  const platformChoices = usePoPlatformChoices();
  const { setActive } = useTableImportParam(INBOUND_PO_IMPORT_DESCRIPTOR);
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [committing, setCommitting] = useState(false);
  const [assisting, setAssisting] = useState(false);
  const [refineOpen, setRefineOpen] = useState(false);
  const [postCommitHref, setPostCommitHref] = useState<string | null>(null);

  // Drop the draft only after the soft-replace removed `?import=csv` (same race as the returns host).
  useEffect(() => {
    if (!postCommitHref || searchParams.get('import') === 'csv') return;
    clearTableImportDraft(SURFACE);
    setPostCommitHref(null);
  }, [postCommitHref, searchParams]);

  const preset = poPresetForPlatform(platform);
  const mapping = draft?.mapping as Partial<Record<PoField, string>> | undefined;
  const identification = useMemo(() => {
    if (!draft || !mapping) return null;
    const base = identifyColumns(draft.headers, draft.rows, { preset, platform });
    return withPoMapping(base, mapping, { preset, platform });
  }, [draft, mapping, preset, platform]);

  const previewInput = useMemo(
    () => (draft && mapping ? { headers: draft.headers, rows: draft.rows, platform, mapping } : null),
    [draft, mapping, platform],
  );
  const preview = usePoCsvPreview(identification?.missingRequired.length ? null : previewInput);
  const summary = preview.data?.summary ?? null;
  const importable = summary ? summary.new + summary.updated : 0;

  const rows = useMemo(() => (draft ? listTableImportRows(INBOUND_PO_IMPORT_DESCRIPTOR, draft) : []), [draft, platform]); // eslint-disable-line react-hooks/exhaustive-deps -- readiness depends on the platform preset
  const rowSummary = useMemo(() => (draft ? summarizeTableImportDraft(INBOUND_PO_IMPORT_DESCRIPTOR, draft) : null), [draft, platform]); // eslint-disable-line react-hooks/exhaustive-deps -- same

  const leaveStaging = useCallback(() => {
    clearTableImportDraft(SURFACE);
    setActive(false);
  }, [setActive]);

  const remap = (header: string, field: string) => {
    if (!mapping) return;
    const next: Record<string, string> = {};
    for (const [f, h] of Object.entries(mapping)) if (h && h !== header && f !== field) next[f] = h;
    if (field) next[field] = header;
    setTableImportMapping(SURFACE, next);
  };

  const handleAssist = async () => {
    if (!draft || !mapping || assisting) return;
    setAssisting(true);
    try {
      const outcome = await postPoCsvImport({ headers: draft.headers, rows: draft.rows, platform, mapping, assist: true, dryRun: true });
      if (!outcome.ok) return void toast.error(outcome.error);
      if (outcome.result.assist?.error) return void toast.error(`AI mapping unavailable: ${outcome.result.assist.error}`);
      setTableImportMapping(SURFACE, outcome.result.identification.mapping as Record<string, string>);
    } finally {
      setAssisting(false);
    }
  };

  const handleConfirm = async () => {
    if (!draft || !mapping || importable === 0 || committing) return;
    setCommitting(true);
    try {
      const outcome = await postPoCsvImport({ headers: draft.headers, rows: draft.rows, platform, mapping, dryRun: false, label: draft.fileName });
      if (!outcome.ok) return void toast.error(outcome.error);
      invalidateReceivingFeeds(queryClient);
      void queryClient.invalidateQueries({ queryKey: ['inbound-po-csv-preview'] });
      const s = outcome.result.summary;
      toast.success(`Imported ${s.new} new · ${s.updated} updated · ${s.unchanged} unchanged${s.needsFix ? ` · ${s.needsFix} held` : ''}`);
      const params = new URLSearchParams(searchParams.toString());
      params.delete('import');
      params.delete('page');
      const qs = params.toString();
      const href = qs ? `${pathname}?${qs}` : pathname || '/incoming';
      setPostCommitHref(href);
      router.replace(href, { scroll: false });
    } finally {
      setCommitting(false);
    }
  };

  if (!draft || !rowSummary || !identification) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-role-caption text-text-soft">
        No import draft — choose a CSV from Add → Import purchase orders.
      </div>
    );
  }

  const missing = identification.missingRequired;
  const confirmLabel = committing
    ? 'Importing…'
    : missing.length
      ? `Map ${PO_COLUMNS[missing[0]].label.toLowerCase()} first`
      : preview.isFetching
        ? 'Checking…'
        : importable === 0
          ? 'Nothing new to import'
          : `Import ${importable} order${importable === 1 ? '' : 's'}`;

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface-card" data-testid="incoming-po-import-staging">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border-hairline px-3 py-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-role-caption font-semibold text-text-default">Import purchase orders · {draft.fileName}</p>
          <p className="text-role-micro text-text-soft">
            {rowSummary.total} rows · {rowSummary.actionRequired} need fix
            {summary ? ` · ${summary.orders} orders: ${summary.new} new · ${summary.updated} updated · ${summary.unchanged} unchanged · ${summary.needsFix} held` : ''}
          </p>
        </div>
        <SearchableSelectField
          value={platform}
          onChange={(v) => setPoImportPlatform(String(v ?? ''))}
          options={platformChoices}
          ariaLabel="Platform"
          placeholder="Platform"
          className="w-44"
        />
        <FilterMenu
          open={refineOpen}
          onOpenChange={setRefineOpen}
          hot={draft.filter !== 'all'}
          label={draft.filter === 'all' ? 'Refine' : `Refine (${FILTER_OPTIONS.find((o) => o.id === draft.filter)?.label})`}
        >
          <div className="flex flex-col gap-0.5 p-1">
            {FILTER_OPTIONS.map((opt) => (
              <Button
                key={opt.id}
                variant="ghost"
                size="sm"
                className={cn('justify-start', draft.filter === opt.id && 'font-semibold text-blue-700')}
                onClick={() => {
                  setTableImportFilter(SURFACE, opt.id);
                  setRefineOpen(false);
                }}
              >
                {opt.label}
              </Button>
            ))}
          </div>
        </FilterMenu>
        <SearchField
          value={draft.query}
          onChange={(q) => setTableImportQuery(SURFACE, q)}
          placeholder="Filter rows…"
          className="min-w-[12rem] max-w-xs flex-1"
        />
        <Button variant="ghost" size="sm" onClick={leaveStaging}>
          Cancel
        </Button>
        <Button
          variant="primary"
          size="sm"
          disabled={committing || missing.length > 0 || preview.isFetching || importable === 0}
          onClick={() => void handleConfirm()}
          data-testid="po-import-staging-confirm"
        >
          {confirmLabel}
        </Button>
      </div>

      {missing.length > 0 ? (
        <div className="flex shrink-0 items-center gap-3 border-b border-amber-200 bg-amber-50 px-3 py-2 text-role-caption text-amber-800">
          <span className="flex-1">
            No column found for {missing.map((f) => PO_COLUMNS[f].label.toLowerCase()).join(', ')} — pick it in Columns, or let AI read the headers.
          </span>
          <Button variant="secondary" size="sm" loading={assisting} onClick={() => void handleAssist()}>
            Map with AI
          </Button>
        </div>
      ) : null}
      {preview.error ? (
        <p className="shrink-0 border-b border-red-200 bg-red-50 px-3 py-2 text-role-caption text-red-700">{preview.error.message}</p>
      ) : null}

      <div className="flex min-h-0 flex-1">
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full min-w-[56rem] border-collapse text-left" aria-label="Purchase order CSV rows">
            <thead className="sticky top-0 z-10 bg-surface-card">
              <tr className="border-b border-border-hairline text-role-eyebrow font-semibold text-text-soft">
                <th className="px-2 py-2">#</th>
                {COLUMNS.map((c) => (
                  <th key={c.key} className="px-2 py-2">{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((view) => (
                <tr
                  key={view.index}
                  data-staging-row
                  data-staging-status={view.status}
                  className={cn('border-b border-border-hairline text-role-caption', draft.focusRowIndex === view.index && 'bg-blue-50/60')}
                  onClick={() => setTableImportFocusRow(SURFACE, view.index)}
                >
                  <td className="px-2 py-1.5 font-mono text-text-faint">{view.index + 2}</td>
                  {COLUMNS.map((col) => {
                    if (col.key === 'status') {
                      return (
                        <td key={col.key} className="px-2 py-1.5">
                          <span className={cn('inline-flex px-1.5 py-0.5 text-role-eyebrow font-semibold', view.status === 'ready' ? CHANGE_FACE.new : CHANGE_FACE.invalid)}>
                            {view.status === 'ready' ? 'Ready' : 'Needs fix'}
                          </span>
                        </td>
                      );
                    }
                    if (col.key === 'problems') {
                      return (
                        <td key={col.key} className="max-w-[16rem] px-2 py-1.5 text-amber-800">
                          {view.problems.join(' · ') || <span className="text-text-faint">—</span>}
                        </td>
                      );
                    }
                    const field = col.field!;
                    return (
                      <td key={col.key} className={cn('max-w-[14rem] px-2 py-1.5', view.missing.includes(field) && 'bg-amber-50/70')}>
                        {mapping?.[field] ? (
                          <StagingCell
                            key={String(view[col.key] ?? '')}
                            value={String(view[col.key] ?? '')}
                            label={`Edit ${col.label.toLowerCase()} for row ${view.index + 2}`}
                            onSave={(next) => updateTableImportRow(INBOUND_PO_IMPORT_DESCRIPTOR, view.index, { [field]: next })}
                          />
                        ) : (
                          <span className="text-text-faint">{field === 'quantity' && preset.quantityWhenAbsent != null ? `${preset.quantityWhenAbsent} (preset)` : '—'}</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 ? <p className="p-6 text-center text-role-caption text-text-soft">No rows match this refine / filter.</p> : null}
        </div>

        <aside className="flex w-80 shrink-0 flex-col overflow-auto border-l border-border-hairline" aria-label="Columns and orders">
          <section className="border-b border-border-hairline p-3">
            <h3 className="mb-2 text-role-eyebrow font-semibold uppercase tracking-wider text-text-soft">Columns</h3>
            <ul className="flex flex-col gap-2">
              {identification.columns.map((col) => (
                <li key={col.header} className="flex flex-col gap-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-role-caption font-semibold text-text-default">{col.header}</span>
                    <span className="truncate font-mono text-role-micro text-text-faint">{col.sample || 'empty'}</span>
                  </div>
                  <SearchableSelectField
                    value={col.field ?? ''}
                    onChange={(v) => remap(col.header, String(v ?? ''))}
                    options={FIELD_OPTIONS}
                    ariaLabel={`Field for column ${col.header}`}
                  />
                  <span className="text-role-micro text-text-soft">
                    {col.reason ? `${col.reason === 'values' ? 'By values' : col.reason === 'preset' ? `${preset.label} header` : col.reason === 'ai' ? 'AI' : col.reason === 'operator' ? 'You' : 'By header'} · ` : ''}
                    {col.note}
                  </span>
                </li>
              ))}
            </ul>
            {identification.defaults.length ? (
              <p className="mt-3 text-role-micro text-text-soft">
                {preset.label} preset: {identification.defaults.map((d) => `${PO_COLUMNS[d.field].label.toLowerCase()} ${d.value}`).join(' · ')}
              </p>
            ) : null}
          </section>
          <section className="p-3">
            <h3 className="mb-2 text-role-eyebrow font-semibold uppercase tracking-wider text-text-soft">
              Orders {preview.isFetching ? '· checking…' : ''}
            </h3>
            <ul className="flex flex-col gap-2">
              {(preview.data?.batch?.orders ?? []).map((order) => {
                const face = order.status === 'invalid' ? 'invalid' : order.change ?? 'new';
                return (
                  <li key={`${order.orderNumber}:${order.rows[0]}`} className="border border-border-hairline p-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-mono text-role-caption font-semibold">{order.orderNumber}</span>
                      <span className={cn('px-1.5 py-0.5 text-role-eyebrow font-semibold', CHANGE_FACE[face])}>
                        {face === 'invalid' ? 'Needs fix' : face}
                      </span>
                    </div>
                    <p className="text-role-micro text-text-soft">
                      {order.lines} line{order.lines === 1 ? '' : 's'} · tier {order.tier === 'auto' ? 'auto' : order.tier}
                    </p>
                    {order.problems?.map((p) => (
                      <p key={p} className="text-role-micro text-amber-800">{p}</p>
                    ))}
                  </li>
                );
              })}
            </ul>
            {(preview.data?.rowProblems ?? []).filter((p) => p.field === 'order_number').map((p) => (
              <p key={p.row} className="mt-2 text-role-micro text-amber-800">Row {p.row + 2}: {p.message} — not in any order</p>
            ))}
          </section>
        </aside>
      </div>
    </div>
  );
}
