'use client';

/**
 * CSV import staging inspector — the desk Context plane for a staging draft.
 *
 * Index→leaf via {@link DeskInspectorIndexShell} (the shared Unbox
 * `DisplaysIndexLeafStage` waist), NOT a page-local twin and never
 * `PaneHeaderTabs` as primary topic nav
 * (`display/right-rail-inspector.md`).
 *
 * Three leaves, one job each:
 *   • **Row**         — the focused record's canonical fields, all six at once,
 *                       with the missing-field reason spelled out.
 *   • **Map columns** — the file→canonical mapping. It lives HERE rather than
 *                       taking over the middle: an unmapped `order_number` now
 *                       paints a full sheet of Action-required rows whose reason
 *                       is visible in the `status` column, which says strictly
 *                       more than a full-screen form. The commit GATE survives
 *                       (no `order_number` ⇒ nothing is ready ⇒ Confirm is out).
 *   • **Batch**       — file identity and the Ready / Action-required split over
 *                       the WHOLE draft, not the filtered view.
 *
 * Selection verbs (Clear · Discard N) dock on {@link InspectorActionFloor} —
 * they act on N rows, so they belong to the selection plane, never to Band 1
 * beside the one primary CTA.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { DetailStackRailRegistrar } from '@/components/right-rail/DetailStackRailRegistrar';
import { InspectorColumnDisplayButton } from '@/components/right-rail/InspectorColumnDisplayButton';
import { DeskInspectorIndexShell } from '@/components/right-rail/DeskInspectorIndexShell';
import {
  FLOOR_DELETE_PEER_CLASS,
  FloorIconButton,
  InspectorActionFloor,
} from '@/components/right-rail/InspectorActionFloor';
import { InspectorFlushDelete } from '@/components/right-rail/InspectorFlushDelete';
import { CursorPositionReadout } from '@/components/ui/pane-header';
import { Button } from '@/design-system/primitives';
import { ClipboardList, ColumnsThree, Pencil, X } from '@/components/Icons';
import { setDetailInspectorCollapsed } from '@/design-system/shells/detail-stack';
import {
  CSV_ORDER_CANONICAL_FIELDS,
  applyCsvOrderCanonicalEdits,
  classifyCsvOrderStagingRow,
  projectCsvOrderRow,
  type CsvOrderCanonicalKey,
} from '@/lib/orders/csv-order-import';
import { ORDER_IMPORT_DESCRIPTOR } from '@/lib/orders/order-import-descriptor';
import {
  clearTableImportSelection,
  setTableImportMapping,
  summarizeTableImportDraft,
  updateTableImportRow,
  useTableImportDraft,
  type TableImportDraft,
} from '@/lib/tables/import/staging-store';

const SURFACE = ORDER_IMPORT_DESCRIPTOR.surfaceId;
import { cornerClass } from '@/design-system/tokens/radius';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';

const CSV_IMPORT_STAGING_RAIL_ID = 'detail:order-import-staging';

const ROW_LEAF = 'row';
const MAP_LEAF = 'map';
const BATCH_LEAF = 'batch';

/**
 * Derived, not hand-listed: a hardcoded literal here is a second declaration of
 * the vocabulary that goes stale the moment a canonical field is added (it did,
 * for `item_title` · `condition` · `ship_by_date` · `note`).
 */
const EMPTY_LOCAL = Object.fromEntries(
  CSV_ORDER_CANONICAL_FIELDS.map((f) => [f.key, ''] as const),
) as Record<CsvOrderCanonicalKey, string>;

const FIELD_LABEL = new Map(
  CSV_ORDER_CANONICAL_FIELDS.map((f) => [f.key, f.label] as const),
);

/* -------------------------------------------------------------------------- */
/* Leaves                                                                     */
/* -------------------------------------------------------------------------- */

function StagingRowLeaf({
  draft,
  index,
}: {
  draft: TableImportDraft;
  index: number | null;
}) {
  const row = index == null ? undefined : draft.rows[index];
  const [local, setLocal] = useState<Record<CsvOrderCanonicalKey, string>>(EMPTY_LOCAL);

  useEffect(() => {
    if (!row) return;
    setLocal(projectCsvOrderRow(row, draft.mapping));
  }, [index, row, draft.mapping]);

  if (!row || index == null) {
    return (
      <div className="px-4 py-6 text-center text-role-caption text-text-soft">
        Pick a row in the sheet to correct it here.
      </div>
    );
  }

  const preview = applyCsvOrderCanonicalEdits(row, draft.mapping, local);
  const { status, missing } = classifyCsvOrderStagingRow(preview, draft.mapping);
  const dirty = CSV_ORDER_CANONICAL_FIELDS.some(
    (f) => (preview[f.key] ?? '') !== (projectCsvOrderRow(row, draft.mapping)[f.key] ?? ''),
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-border-hairline px-4 py-3">
        <p className="text-role-eyebrow font-semibold uppercase tracking-widest text-text-soft">
          Staging row {index + 1}
        </p>
        <p className="mt-1 truncate text-role-caption font-semibold text-text-default">
          {local.order_number || 'Missing order number'}
        </p>
        <span
          className={cn(
            'mt-2 inline-flex px-1.5 py-0.5 text-role-eyebrow font-semibold uppercase tracking-wider',
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
        {CSV_ORDER_CANONICAL_FIELDS.map((field) => {
          const header = draft.mapping[field.key];
          // No mapped source column ⇒ nowhere to write the value back to. Say so
          // and point at the mapping rather than rendering a dead input.
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
                {(field.required || (field.key === 'sku' && Boolean(draft.mapping.sku))) && (
                  <span className="ml-1 text-rose-600">*</span>
                )}
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
          onClick={() => updateTableImportRow(ORDER_IMPORT_DESCRIPTOR, index, local)}
        >
          Apply to staging row
        </Button>
      </div>
    </div>
  );
}

/**
 * AI mapping suggestions for the columns the alias map could not place.
 *
 * Every suggestion is APPLIED BY THE OPERATOR, one click each. Nothing here
 * auto-applies: a wrong guess and a right one look identical once written into
 * the mapping, and the whole point of the confirm step is that they do not have
 * to be told apart at commit time.
 *
 * Failure is a stated absence, never a blocked import — the manual selects
 * below keep working whether or not a provider answered.
 */
function MappingSuggestions({ draft }: { draft: TableImportDraft }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    suggestions: { field: string; header: string; confidence: string; reason: string }[];
    stillUnmapped?: string[];
    rejectedHallucinations?: string[];
    detail?: string;
    success?: boolean;
  } | null>(null);

  const unmappedCount = CSV_ORDER_CANONICAL_FIELDS.filter((f) => !draft.mapping[f.key]).length;

  const ask = useCallback(async () => {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch('/api/orders/import/suggest-mapping', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          headers: draft.headers,
          // A hint needs a few rows, never the whole file.
          sampleRows: draft.rows.slice(0, 5),
          deterministicMapping: draft.mapping,
        }),
      });
      setResult(await res.json());
    } catch {
      setResult({ suggestions: [], detail: 'Could not reach the suggestion service.' });
    } finally {
      setBusy(false);
    }
  }, [draft.headers, draft.rows, draft.mapping]);

  const apply = useCallback((field: string, header: string) => {
    setTableImportMapping(SURFACE, { ...draft.mapping, [field]: header });
    setResult((prev) =>
      prev ? { ...prev, suggestions: prev.suggestions.filter((s) => s.field !== field) } : prev,
    );
  }, [draft.mapping]);

  if (unmappedCount === 0) return null;

  return (
    <div className="space-y-2 border-b border-border-hairline px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-role-micro text-text-soft">
          {unmappedCount} field{unmappedCount === 1 ? '' : 's'} unmapped.
        </p>
        <Button variant="ghost" size="sm" disabled={busy} onClick={() => void ask()}>
          {busy ? 'Reading the file…' : 'Suggest columns'}
        </Button>
      </div>

      {result?.suggestions?.length ? (
        <ul className="space-y-1.5">
          {result.suggestions.map((s) => (
            <li
              key={s.field}
              className={cn(
                'flex items-start gap-2 border border-border-soft bg-surface-card px-2 py-1.5',
                cornerClass('flush'),
              )}
            >
              <span className="min-w-0 flex-1">
                <span className="block text-role-caption font-semibold text-text-default">
                  {CSV_ORDER_CANONICAL_FIELDS.find((f) => f.key === s.field)?.label ?? s.field} ←{' '}
                  {s.header}
                </span>
                <span className="block text-role-micro text-text-soft">
                  {s.reason} · {s.confidence} confidence
                </span>
              </span>
              <Button variant="ghost" size="sm" onClick={() => apply(s.field, s.header)}>
                Apply
              </Button>
            </li>
          ))}
        </ul>
      ) : null}

      {result && !result.suggestions?.length ? (
        <p className="text-role-micro text-text-soft">
          {result.detail ?? 'No confident suggestions — map the remaining columns below.'}
        </p>
      ) : null}

      {result?.rejectedHallucinations?.length ? (
        <p className="text-role-micro text-amber-700">
          Ignored {result.rejectedHallucinations.length} suggestion
          {result.rejectedHallucinations.length === 1 ? '' : 's'} naming columns not in this file.
        </p>
      ) : null}
    </div>
  );
}

function StagingMapLeaf({ draft }: { draft: TableImportDraft }) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <p className="px-4 pb-2 pt-3 text-role-micro text-text-soft">
        Rows whose required columns are unmapped stay Action required — nothing is
        written to To-Ship until you confirm.
      </p>
      <MappingSuggestions draft={draft} />
      <div className="divide-y divide-border-hairline border-y border-border-hairline">
        {CSV_ORDER_CANONICAL_FIELDS.map((field) => {
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
  const summary = summarizeTableImportDraft(ORDER_IMPORT_DESCRIPTOR, draft);
  const unmappedRequired = CSV_ORDER_CANONICAL_FIELDS.filter(
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
          {unmappedRequired.map((f) => f.label).join(', ')} is not mapped, so no row
          can be imported yet.
        </p>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Rail                                                                       */
/* -------------------------------------------------------------------------- */

export function CsvImportStagingRail({
  visibleIndexes,
  onDiscardSelected,
}: {
  /** Row order currently on screen — the walk ↑↓ steps through. */
  visibleIndexes: readonly number[];
  onDiscardSelected: () => void;
}) {
  const draft = useTableImportDraft(SURFACE);
  const focus = draft?.focusRowIndex ?? null;
  const mapped = Boolean(draft?.mapping.order_number);

  // Land on the blocking gate when the file cannot commit at all; otherwise the
  // index, so the operator picks their own topic (Root-to-Leaf grammar).
  const [activeId, setActiveId] = useState<string>(() =>
    mapped ? 'index' : MAP_LEAF,
  );

  // Opening a row from the sheet is a jump to its leaf — the sheet click is the
  // pick, so making the operator then choose "Row" from the index would be a
  // second door onto one intent.
  useEffect(() => {
    if (focus == null) return;
    setActiveId(ROW_LEAF);
  }, [focus]);

  const cursorPos = useMemo(() => {
    if (focus == null) return -1;
    return visibleIndexes.indexOf(focus);
  }, [focus, visibleIndexes]);

  const leaves = useMemo(() => {
    if (!draft) return [];
    const summary = summarizeTableImportDraft(ORDER_IMPORT_DESCRIPTOR, draft);
    const focusedRow = focus == null ? undefined : draft.rows[focus];
    const focusedStatus = focusedRow
      ? classifyCsvOrderStagingRow(focusedRow, draft.mapping).status
      : null;

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
        tone: mapped ? ('ok' as const) : ('action' as const),
        subtitle: mapped ? 'Order number mapped' : 'Order number not mapped',
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
  }, [draft, focus, mapped]);

  if (!draft) return null;

  const selectionCount = draft.selectedIndexes.size;

  return (
    <DetailStackRailRegistrar
      id={CSV_IMPORT_STAGING_RAIL_ID}
      onClose={() => setDetailInspectorCollapsed(true)}
      modal={false}
      ariaLabel="CSV import staging inspector"
    >
      <div className="flex h-full min-h-0 flex-col">
        {/* No stacked chrome row — cursor + column display ride the shell's ONE
            band beside back + title (`chrome`), the Displays-column contract. */}
        <DeskInspectorIndexShell
          chrome={
            <>
              {cursorPos >= 0 ? (
                <CursorPositionReadout
                  position={cursorPos + 1}
                  total={visibleIndexes.length}
                />
              ) : null}
              <InspectorColumnDisplayButton />
            </>
          }
          leaves={leaves}
          activeId={activeId}
          onActiveIdChange={setActiveId}
          ariaLabel="CSV import staging topics"
          testId="csv-import-staging-inspector"
        />
        {selectionCount > 0 ? (
          <InspectorActionFloor data-testid="csv-import-staging-action-floor">
            <FloorIconButton
              icon={<X />}
              label="Clear selection"
              onClick={() => clearTableImportSelection(SURFACE)}
              data-testid="csv-import-staging-clear-selection"
            />
            {/* Two-click arm, no dialog: a staging row has never been written
                anywhere, so a modal on top of the arm would over-guard a
                session-only discard. The dialogs stay on the two acts that
                DO leave the draft — Confirm (writes) and Cancel (drops all). */}
            <InspectorFlushDelete
              label={`Discard ${selectionCount} selected row${selectionCount === 1 ? '' : 's'}`}
              confirmLabel="Click again to discard"
              onConfirm={onDiscardSelected}
              data-testid="csv-import-staging-discard"
              className={FLOOR_DELETE_PEER_CLASS}
            />
          </InspectorActionFloor>
        ) : null}
      </div>
    </DetailStackRailRegistrar>
  );
}
