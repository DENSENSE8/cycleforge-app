'use client';

/**
 * Shortage-coverage CSV staging inspector — Map columns / Row / Batch for
 * the Shortage coverage draft. Clone of IncomingReturnsImportStagingRail:
 * attach coverage onto existing orders, never mint. Discard verbs belong on
 * the selection floor (host `onDiscardSelected` also exits when the draft
 * empties).
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
import { TableImportTriageStatusCell } from '@/components/tables/import/TableImportTriageStatusCell';
import { ClipboardList, ColumnsThree, Pencil, X } from '@/components/Icons';
import { setDetailInspectorCollapsed } from '@/design-system/shells/detail-stack';
import {
  CSV_SHORTAGE_COVERAGE_FIELDS,
  applyCsvShortageCoverageCanonicalEdits,
  classifyCsvShortageCoverageRow,
  formatProjectedShortageCoverage,
  projectCsvShortageCoverageRow,
  type CsvShortageCoverageKey,
} from '@/lib/orders/csv-shortage-coverage-import';
import {
  SHORTAGE_COVERAGE_IMPORT_DESCRIPTOR,
  summarizeShortageCoverageDraft,
} from '@/lib/orders/shortage-coverage-import-descriptor';
import {
  clearTableImportSelection,
  setTableImportMapping,
  updateTableImportRow,
  useTableImportDraft,
  type TableImportDraft,
} from '@/lib/tables/import/staging-store';
import { cornerClass } from '@/design-system/tokens/radius';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';

const SURFACE = SHORTAGE_COVERAGE_IMPORT_DESCRIPTOR.surfaceId;
const RAIL_ID = 'detail:shortage-coverage-import-staging';

const ROW_LEAF = 'row';
const MAP_LEAF = 'map';
const BATCH_LEAF = 'batch';

const EMPTY_LOCAL = Object.fromEntries(
  CSV_SHORTAGE_COVERAGE_FIELDS.map((f) => [f.key, ''] as const),
) as Record<CsvShortageCoverageKey, string>;

const FIELD_LABEL = new Map(
  CSV_SHORTAGE_COVERAGE_FIELDS.map((f) => [f.key, f.label] as const),
);

function StagingRowLeaf({
  draft,
  index,
}: {
  draft: TableImportDraft;
  index: number | null;
}) {
  const row = index == null ? undefined : draft.rows[index];
  const [local, setLocal] = useState<Record<CsvShortageCoverageKey, string>>(EMPTY_LOCAL);

  useEffect(() => {
    if (!row) return;
    setLocal(projectCsvShortageCoverageRow(row, draft.mapping));
  }, [index, row, draft.mapping]);

  if (!row || index == null) {
    return (
      <div className="px-4 py-6 text-center text-role-caption text-text-soft">
        Pick a row in the sheet to correct it here.
      </div>
    );
  }

  const preview = applyCsvShortageCoverageCanonicalEdits(row, draft.mapping, local);
  const { status, missing } = classifyCsvShortageCoverageRow(preview, draft.mapping);
  const original = projectCsvShortageCoverageRow(row, draft.mapping);
  const dirty = CSV_SHORTAGE_COVERAGE_FIELDS.some((f) => local[f.key] !== original[f.key]);
  const coverageFace = formatProjectedShortageCoverage(local);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-border-hairline px-4 py-3">
        <p className="text-role-eyebrow font-semibold uppercase tracking-widest text-text-soft">
          Staging row {index + 1}
        </p>
        <p className="mt-1 truncate text-role-caption font-semibold text-text-default">
          {local.order_number || 'Missing order number'}
        </p>
        <span className="mt-2 inline-flex">
          <TableImportTriageStatusCell
            status={status}
            tooltip={
              missing.length > 0
                ? `Missing: ${missing.map((k) => FIELD_LABEL.get(k) ?? k).join(', ')}`
                : null
            }
          />
        </span>
        <p className="mt-2 truncate text-role-caption text-text-default" data-testid="shortage-coverage-staging-rail-face">
          {coverageFace}
        </p>
        {missing.length > 0 ? (
          <p className="mt-1.5 text-role-micro text-text-soft">
            Missing: {missing.map((k) => FIELD_LABEL.get(k) ?? k).join(', ')}
          </p>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {CSV_SHORTAGE_COVERAGE_FIELDS.map((field) => {
          const header = draft.mapping[field.key];
          if (!header) {
            return (
              <div key={field.key} className="space-y-1">
                <span className="text-role-eyebrow font-semibold uppercase tracking-widest text-text-soft">
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
              <span className="text-role-eyebrow font-semibold uppercase tracking-widest text-text-soft">
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
          onClick={() =>
            updateTableImportRow(SHORTAGE_COVERAGE_IMPORT_DESCRIPTOR, index, local)
          }
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
        Rows whose required columns are unmapped stay Action required — Confirm
        attaches coverage to existing Shortage orders only.
      </p>
      <div className="divide-y divide-border-hairline border-y border-border-hairline">
        {CSV_SHORTAGE_COVERAGE_FIELDS.map((field) => {
          const selected = draft.mapping[field.key] ?? '';
          const missingRequired = field.required && !selected;
          return (
            <div key={field.key} className="space-y-1 px-4 py-2.5">
              <p className="text-role-eyebrow font-semibold uppercase tracking-widest text-text-soft">
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
  const summary = summarizeShortageCoverageDraft(draft.rows, draft.mapping);
  const unmappedRequired = CSV_SHORTAGE_COVERAGE_FIELDS.filter(
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
            <span className="shrink-0 text-role-eyebrow font-semibold uppercase tracking-widest text-text-soft">
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

export function ShortageCoverageStagingRail({
  onDiscardSelected,
}: {
  onDiscardSelected: () => void;
}) {
  const draft = useTableImportDraft(SURFACE);
  const focus = draft?.focusRowIndex ?? null;
  const requiredMapped = CSV_SHORTAGE_COVERAGE_FIELDS.filter((f) => f.required).every(
    (f) => Boolean(draft?.mapping[f.key]),
  );

  const [activeId, setActiveId] = useState<string>(() =>
    requiredMapped ? DESK_INSPECTOR_INDEX : MAP_LEAF,
  );

  useEffect(() => {
    if (!draft) return;
    setDetailInspectorCollapsed(false);
  }, [draft]);

  useEffect(() => {
    if (focus == null) return;
    setActiveId(ROW_LEAF);
  }, [focus]);

  const leaves = useMemo(() => {
    if (!draft) return [];
    const focusedRow = focus == null ? undefined : draft.rows[focus];
    const focusedStatus = focusedRow
      ? classifyCsvShortageCoverageRow(focusedRow, draft.mapping).status
      : null;
    const summary = summarizeShortageCoverageDraft(draft.rows, draft.mapping);

    return [
      {
        id: ROW_LEAF,
        label: 'Row',
        icon: Pencil,
        group: 'verification' as const,
        tone:
          focusedStatus === 'action_required'
            ? ('action' as const)
            : focusedStatus === 'ready'
              ? ('ok' as const)
              : ('neutral' as const),
        subtitle:
          focus == null
            ? 'No row picked'
            : focusedStatus === 'ready'
              ? `Row ${focus + 1} · Ready`
              : `Row ${focus + 1} · Action required`,
        content: <StagingRowLeaf draft={draft} index={focus} />,
      },
      {
        id: MAP_LEAF,
        label: 'Map columns',
        icon: ColumnsThree,
        group: 'verification' as const,
        tone: requiredMapped ? ('ok' as const) : ('action' as const),
        subtitle: requiredMapped ? 'Required columns mapped' : 'Required columns not mapped',
        content: <StagingMapLeaf draft={draft} />,
      },
      {
        id: BATCH_LEAF,
        label: 'Batch',
        icon: ClipboardList,
        group: 'context' as const,
        tone: 'neutral' as const,
        subtitle: `${summary.ready} ready · ${summary.actionRequired} action required`,
        content: <StagingBatchLeaf draft={draft} />,
      },
    ];
  }, [draft, focus, requiredMapped]);

  if (!draft) return null;

  const selectionCount = draft.selectedIndexes.size;

  return (
    <DetailStackRailRegistrar
      id={RAIL_ID}
      onClose={() => setDetailInspectorCollapsed(true)}
      modal={false}
      ariaLabel="Shortage coverage staging inspector"
    >
      <div className="flex h-full min-h-0 flex-col">
        <DeskInspectorIndexShell
          stance="index"
          leaves={leaves}
          activeId={activeId}
          onActiveIdChange={setActiveId}
          ariaLabel="Shortage coverage staging topics"
          testId="shortage-coverage-staging-inspector"
        />
        {selectionCount > 0 ? (
          <InspectorActionFloor data-testid="shortage-coverage-staging-action-floor">
            <FloorIconButton
              icon={<X />}
              label="Clear selection"
              onClick={() => clearTableImportSelection(SURFACE)}
              data-testid="shortage-coverage-staging-clear-selection"
            />
            <InspectorFlushDelete
              label={`Discard ${selectionCount} selected row${selectionCount === 1 ? '' : 's'}`}
              confirmLabel="Click again to discard"
              onConfirm={onDiscardSelected}
              data-testid="shortage-coverage-staging-discard"
              className={FLOOR_DELETE_PEER_CLASS}
            />
          </InspectorActionFloor>
        ) : null}
      </div>
    </DetailStackRailRegistrar>
  );
}
