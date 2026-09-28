'use client';

/**
 * Returns CSV import staging inspector — Map columns / Row / Batch for the
 * Incoming returns staging draft.
 */

import { useEffect, useMemo, useState } from 'react';
import { DetailStackRailRegistrar } from '@/components/right-rail/DetailStackRailRegistrar';
import {
  DESK_INSPECTOR_INDEX,
  DeskInspectorIndexShell,
} from '@/components/right-rail/DeskInspectorIndexShell';
import {
  FLOOR_DELETE_PEER_CLASS,
  FloorIconButton,
  InspectorActionFloor,
} from '@/components/right-rail/InspectorActionFloor';
import { InspectorFlushDelete } from '@/components/right-rail/InspectorFlushDelete';
import { Button } from '@/design-system/primitives';
import { ClipboardList, ColumnsThree, Pencil, X } from '@/components/Icons';
import { setDetailInspectorCollapsed } from '@/design-system/shells/detail-stack';
import {
  CSV_INBOUND_RETURNS_FIELDS,
  applyCsvInboundReturnsCanonicalEdits,
  classifyCsvInboundReturnsStagingRow,
  projectCsvInboundReturnsRow,
  type CsvInboundReturnsKey,
} from '@/lib/inbound/csv-inbound-returns-import';
import { INBOUND_RETURNS_IMPORT_DESCRIPTOR } from '@/lib/inbound/inbound-returns-import-descriptor';
import {
  clearTableImportSelection,
  discardTableImportSelected,
  setTableImportMapping,
  summarizeTableImportDraft,
  updateTableImportRow,
  useTableImportDraft,
  type TableImportDraft,
} from '@/lib/tables/import/staging-store';
import { cornerClass } from '@/design-system/tokens/radius';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';

const SURFACE = INBOUND_RETURNS_IMPORT_DESCRIPTOR.surfaceId;
const RAIL_ID = 'detail:incoming-returns-import-staging';

const ROW_LEAF = 'row';
const MAP_LEAF = 'map';
const BATCH_LEAF = 'batch';

const EMPTY_LOCAL = Object.fromEntries(
  CSV_INBOUND_RETURNS_FIELDS.map((f) => [f.key, ''] as const),
) as Record<CsvInboundReturnsKey, string>;

const FIELD_LABEL = new Map(
  CSV_INBOUND_RETURNS_FIELDS.map((f) => [f.key, f.label] as const),
);

function StagingRowLeaf({
  draft,
  index,
}: {
  draft: TableImportDraft;
  index: number | null;
}) {
  const row = index == null ? undefined : draft.rows[index];
  const [local, setLocal] = useState<Record<CsvInboundReturnsKey, string>>(EMPTY_LOCAL);

  useEffect(() => {
    if (!row) return;
    setLocal(projectCsvInboundReturnsRow(row, draft.mapping));
  }, [index, row, draft.mapping]);

  if (!row || index == null) {
    return (
      <div className="px-4 py-6 text-center text-role-caption text-text-soft">
        Pick a row in the sheet to correct it here.
      </div>
    );
  }

  const preview = applyCsvInboundReturnsCanonicalEdits(row, draft.mapping, local);
  const { status, missing } = classifyCsvInboundReturnsStagingRow(preview, draft.mapping);
  const dirty = CSV_INBOUND_RETURNS_FIELDS.some(
    (f) =>
      (preview[f.key] ?? '') !== (projectCsvInboundReturnsRow(row, draft.mapping)[f.key] ?? ''),
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-border-hairline px-4 py-3">
        <p className="text-role-eyebrow font-semibold text-text-soft">
          Staging row {index + 1}
        </p>
        <p className="mt-1 truncate text-role-caption font-semibold text-text-default">
          {local.order_id || 'Missing order ID'}
        </p>
        <span
          className={cn(
            'mt-2 inline-flex px-1.5 py-0.5 text-role-eyebrow font-semibold',
            cornerClass('flush'),
            status === 'ready'
              ? 'bg-emerald-50 text-emerald-700'
              : 'bg-amber-50 text-amber-800',
          )}
        >
          {status === 'ready' ? 'Ready' : 'Action required'}
        </span>
        {missing.length > 0 ? (
          <p className="mt-1.5 text-role-micro text-text-soft">
            Missing: {missing.map((k) => FIELD_LABEL.get(k) ?? k).join(', ')}
          </p>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {CSV_INBOUND_RETURNS_FIELDS.map((field) => {
          const header = draft.mapping[field.key];
          if (!header) {
            return (
              <div key={field.key} className="space-y-1">
                <span className="text-role-eyebrow font-semibold text-text-soft">
                  {field.label}
                </span>
                <p className="text-role-micro text-text-faint">
                  Not mapped — set a column on Map columns to edit this.
                </p>
              </div>
            );
          }
          const isMissing = missing.includes(field.key);
          return (
            <label key={field.key} className="block space-y-1">
              <span className="text-role-eyebrow font-semibold text-text-soft">
                {field.label}
                {field.required ? <span className="ml-1 text-rose-600">*</span> : null}
              </span>
              <input
                value={local[field.key]}
                onChange={(e) =>
                  setLocal((prev) => ({ ...prev, [field.key]: e.target.value }))
                }
                className={cn(
                  'h-9 w-full border bg-surface-card px-2.5 text-role-caption text-text-default',
                  isMissing
                    ? cn('border-rose-400 bg-rose-50', focusRing('field', 'danger'))
                    : cn('border-border-soft', focusRing('field', 'accent')),
                )}
              />
            </label>
          );
        })}
      </div>

      <div className="shrink-0 border-t border-border-hairline px-4 py-3">
        <Button
          variant="primary"
          size="sm"
          className="w-full"
          disabled={!dirty}
          onClick={() => updateTableImportRow(INBOUND_RETURNS_IMPORT_DESCRIPTOR, index, local)}
        >
          Apply to staging row
        </Button>
      </div>
    </div>
  );
}

function StagingMapLeaf({ draft }: { draft: TableImportDraft }) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <p className="px-4 pb-2 pt-3 text-role-micro text-text-soft">
        Rows whose required columns are unmapped stay Action required — nothing is
        written to Incoming until you confirm.
      </p>
      <div className="divide-y divide-border-hairline border-y border-border-hairline">
        {CSV_INBOUND_RETURNS_FIELDS.map((field) => {
          const selected = draft.mapping[field.key] ?? '';
          const missingRequired = field.required && !selected;
          return (
            <div key={field.key} className="space-y-1 px-4 py-2.5">
              <p className="text-role-eyebrow font-semibold text-text-soft">
                {field.label}
                {field.required ? <span className="ml-1 text-rose-600">*</span> : null}
              </p>
              <select
                value={selected}
                onChange={(e) => {
                  const v = e.target.value;
                  const next = { ...draft.mapping };
                  if (v) next[field.key] = v;
                  else delete next[field.key];
                  setTableImportMapping(SURFACE, next);
                }}
                aria-label={`Source column for ${field.label}`}
                className={cn(
                  'h-8 w-full border bg-surface-card px-2 text-role-caption font-semibold text-text-default',
                  cornerClass('flush'),
                  missingRequired
                    ? cn('border-rose-300', focusRing('field', 'danger'))
                    : cn('border-border-soft', focusRing('field', 'accent')),
                )}
              >
                <option value="">— Not mapped —</option>
                {draft.headers.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StagingBatchLeaf({ draft }: { draft: TableImportDraft }) {
  const summary = summarizeTableImportDraft(INBOUND_RETURNS_IMPORT_DESCRIPTOR, draft);
  const unmappedRequired = CSV_INBOUND_RETURNS_FIELDS.filter(
    (f) => f.required && !draft.mapping[f.key],
  );

  const facts: { label: string; value: string }[] = [
    { label: 'File', value: draft.fileName },
    { label: 'Rows', value: String(summary.total) },
    { label: 'Ready', value: String(summary.ready) },
    { label: 'Action required', value: String(summary.actionRequired) },
    { label: 'Columns in file', value: String(draft.headers.length) },
  ];

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="divide-y divide-border-hairline border-y border-border-hairline">
        {facts.map((fact) => (
          <div
            key={fact.label}
            className="flex items-baseline justify-between gap-3 px-4 py-2"
          >
            <span className="shrink-0 text-role-eyebrow font-semibold text-text-soft">
              {fact.label}
            </span>
            <span className="min-w-0 truncate text-role-caption tabular-nums text-text-default">
              {fact.value}
            </span>
          </div>
        ))}
      </div>
      {unmappedRequired.length > 0 ? (
        <p className="px-4 py-3 text-role-micro text-amber-800">
          {unmappedRequired.map((f) => f.label).join(', ')} is not mapped, so no row can be
          imported yet.
        </p>
      ) : null}
    </div>
  );
}

export function IncomingReturnsImportStagingRail() {
  const draft = useTableImportDraft(SURFACE);
  const [activeId, setActiveId] = useState<string>(DESK_INSPECTOR_INDEX);
  const selectedCount = draft?.selectedIndexes.size ?? 0;

  useEffect(() => {
    if (!draft) return;
    setDetailInspectorCollapsed(false);
  }, [draft]);

  const leaves = useMemo(() => {
    if (!draft) return [];
    const focus = draft.focusRowIndex;
    return [
      {
        id: ROW_LEAF,
        label: 'Row',
        subtitle: focus == null ? 'Focused staging row' : `Row ${focus + 1}`,
        icon: Pencil,
        group: 'context' as const,
        tone: 'neutral' as const,
        content: <StagingRowLeaf draft={draft} index={focus} />,
      },
      {
        id: MAP_LEAF,
        label: 'Map columns',
        subtitle: 'File → canonical fields',
        icon: ColumnsThree,
        group: 'assets' as const,
        tone: 'neutral' as const,
        content: <StagingMapLeaf draft={draft} />,
      },
      {
        id: BATCH_LEAF,
        label: 'Batch',
        subtitle: 'File + Ready split',
        icon: ClipboardList,
        group: 'assets' as const,
        tone: 'neutral' as const,
        content: <StagingBatchLeaf draft={draft} />,
      },
    ];
  }, [draft]);

  if (!draft) return null;

  return (
    <DetailStackRailRegistrar
      id={RAIL_ID}
      onClose={() => {
        /* Staging owns the desk — Cancel on the host clears the draft. */
      }}
      modal={false}
      edgeCollapse={false}
      resumeOnDismiss={false}
      ariaLabel="CSV import staging inspector"
    >
      <div className="flex h-full min-h-0 flex-col overflow-hidden bg-surface-card">
        <DeskInspectorIndexShell
          stance="index"
          title="Import staging"
          leaves={leaves}
          activeId={activeId}
          onActiveIdChange={setActiveId}
          ariaLabel="CSV import staging inspector"
          testId="returns-import-staging-inspector"
          backLabel="Back to topics"
        />
        {selectedCount > 0 ? (
          <InspectorActionFloor>
            <FloorIconButton
              icon={<X />}
              label="Clear selection"
              onClick={() => clearTableImportSelection(SURFACE)}
            />
            <InspectorFlushDelete
              label={`Discard ${selectedCount} selected row${selectedCount === 1 ? '' : 's'}`}
              confirmLabel="Click again to discard"
              onConfirm={() => discardTableImportSelected(SURFACE)}
              className={FLOOR_DELETE_PEER_CLASS}
            />
          </InspectorActionFloor>
        ) : null}
      </div>
    </DetailStackRailRegistrar>
  );
}
