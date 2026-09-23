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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DetailStackRailRegistrar } from '@/components/right-rail/DetailStackRailRegistrar';
import { DeskInspectorIndexShell } from '@/components/right-rail/DeskInspectorIndexShell';
import {
  FLOOR_DELETE_PEER_CLASS,
  FloorIconButton,
  InspectorActionFloor,
} from '@/components/right-rail/InspectorActionFloor';
import { InspectorFlushDelete } from '@/components/right-rail/InspectorFlushDelete';
import { Button } from '@/design-system/primitives';
import { ClipboardList, ColumnsThree, Pencil, X } from '@/components/Icons';
import { setDetailInspectorCollapsed } from '@/design-system/shells/detail-stack';
import { OrderIntakeForm } from '@/components/outbound/orders/intake/OrderIntakeForm';
import {
  canonicalIntakeToCsvEdits,
  projectCsvRowToCanonicalIntake,
  type CanonicalOrderIntake,
} from '@/lib/orders/canonical-order-intake';
import {
  CSV_ORDER_CANONICAL_FIELDS,
  classifyCsvOrderStagingRow,
  projectCsvOrderRow,
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

/* -------------------------------------------------------------------------- */
/* Leaves                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The row inspector IS the intake form — the same `OrderIntakeForm` (same
 * `data-testid`s) the single density mounts, prefilled from the staged row
 * projected onto `CanonicalOrderIntake`. Canonical edits write straight back
 * onto the staged row through the mapping (unmapped columns are ignored by
 * `applyCsvOrderCanonicalEdits`, exactly as before), so the classify loop —
 * fix a cell, watch Action required flip to Ready — still runs live.
 *
 * "Start triage" here creates a CAGED order from this one row (the operator
 * then discards the staged twin); the bulk Confirm path is untouched and
 * still lands uncaged live-queue rows. A duplicate order number binds the
 * form to the EXISTING order instead of inserting a second one.
 */
function StagingRowLeaf({
  draft,
  index,
  boundByOrderNumber,
}: {
  draft: TableImportDraft;
  index: number | null;
  /**
   * Rail-lifetime memory of "this staged row already became order <pk>",
   * keyed by the row's ORDER NUMBER (stable across the index shifts a
   * discard causes). Without it, focusing away and back forgot the binding
   * and re-offered Start triage for a row that already has a caged order —
   * only the duplicate lookup / server 409 stood between that and a twin.
   */
  boundByOrderNumber: Map<string, number>;
}) {
  const row = index == null ? undefined : draft.rows[index];
  // The prefill is read once on the form's mount; skip echoing it straight
  // back into the store as a no-op edit. Tracked per index so a remount race
  // can never mistake a new row's mount echo for an operator edit.
  const echoSeenForIndex = useRef<number | null>(null);

  const initialDraft = useMemo(() => {
    if (!row) return null;
    return projectCsvRowToCanonicalIntake(projectCsvOrderRow(row, draft.mapping));
    // Mapping edits reproject on next focus; the form owns the draft after mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  // Bound per row; the leaf is keyed on the focused index at its call site,
  // so this state re-seeds from the rail-level map when focus moves.
  const orderNumberKey = initialDraft?.orderNumber ?? '';
  const [boundOrderId, setBoundOrderId] = useState<number | null>(
    () => (orderNumberKey ? boundByOrderNumber.get(orderNumberKey) ?? null : null),
  );
  const handleBound = useCallback(
    (id: number) => {
      if (orderNumberKey) boundByOrderNumber.set(orderNumberKey, id);
      setBoundOrderId(id);
    },
    [boundByOrderNumber, orderNumberKey],
  );

  const handleDraftChange = useCallback(
    (next: CanonicalOrderIntake) => {
      if (index == null) return;
      if (echoSeenForIndex.current !== index) {
        echoSeenForIndex.current = index;
        return;
      }
      updateTableImportRow(ORDER_IMPORT_DESCRIPTOR, index, canonicalIntakeToCsvEdits(next));
    },
    [index],
  );

  if (!row || index == null || !initialDraft) {
    return (
      <div className="px-4 py-6 text-center text-role-caption text-text-soft">
        Pick a row in the sheet to correct it here.
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <OrderIntakeForm
        key={index}
        orderId={boundOrderId}
        initialDraft={initialDraft}
        onDraftChange={handleDraftChange}
        onOrderCreated={handleBound}
      />
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
        <p className="text-role-micro text-text-warning">
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
                {field.required ? <span className="ml-1 text-text-danger">*</span> : null}
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
                    ? cn('border-border-danger', focusRing('field', 'danger'))
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
        <p className="px-4 py-3 text-role-micro text-text-warning">
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
  onDiscardSelected,
}: {
  onDiscardSelected: () => void;
}) {
  const draft = useTableImportDraft(SURFACE);
  const focus = draft?.focusRowIndex ?? null;
  // Which staged rows already became caged orders, surviving focus changes.
  const boundByOrderNumber = useRef(new Map<string, number>());
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
        content: (
          <StagingRowLeaf
            key={focus ?? -1}
            draft={draft}
            index={focus}
            boundByOrderNumber={boundByOrderNumber.current}
          />
        ),
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
        {/* No stacked chrome row — column display rides the shell's ONE band
            beside back + title (`chrome`), the Displays-column contract. */}
        <DeskInspectorIndexShell
          stance="index"
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
