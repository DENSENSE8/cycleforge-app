'use client';

/**
 * `/m/imports/[runId]` — one import run as a full scrollable screen with an X
 * back to the list (SURFACE_LAW §7): its totals, its steps, and every order it
 * touched. Read-only; an order that landed opens its phone hub.
 */

import { useParams, useSearchParams } from 'next/navigation';
import {
  DetailFact,
  DetailFacts,
  DetailNav,
  DetailSectionHeading,
  type DetailNavItem,
} from '@/components/mobile/detail/DetailParts';
import {
  MOBILE_IMPORTS_PATH,
  filledFieldLabel,
  importDuration,
  importKindLabel,
  importRowLocator,
  importRowReasonLabel,
  importSourceLabel,
  importStamp,
  importStepCountsLine,
  importTriggerLabel,
} from '@/lib/imports/record-faces';
import { IMPORT_ROW_OUTCOME_LIFECYCLE, IMPORT_RUN_LIFECYCLE } from '@/design-system/tokens/import-record-lifecycle';
import {
  importListQuery,
  positiveIntParam,
  useImportRows,
  useImportRun,
} from '@/lib/imports/record-client';
import { DetailRecordFrame } from '@/design-system/components/DetailHubScreen';
import { Button } from '@/design-system/primitives';
import { recordStateCodeClass } from '@/design-system/tokens/record';
import type { ImportRunDetail, ImportRunRowItem } from '@/lib/imports/types';
import { mobileJobReturn, withJobReturn } from '@/lib/mobile/nav-trail';
import { cn } from '@/utils/_cn';

function orderDoor(row: ImportRunRowItem, back: string): DetailNavItem {
  const state = IMPORT_ROW_OUTCOME_LIFECYCLE[row.outcome];
  const locator = importRowLocator(row);
  return {
    id: String(row.id),
    title: row.externalOrderId,
    icon: (
      <span className={cn('font-mono text-role-micro font-bold', recordStateCodeClass(state))} aria-label={state.label}>
        {state.code}
      </span>
    ),
    meta: [
      state.label,
      importSourceLabel(row.source),
      locator,
      row.filledFields.length > 0 ? `Filled ${row.filledFields.map(filledFieldLabel).join(', ')}` : null,
      row.importExceptionId != null ? 'In review' : null,
      row.reason ? importRowReasonLabel(row.reason) : null,
    ]
      .filter(Boolean)
      .join(' · '),
    // Only an order that landed has a hub to open; a refused row reads in place.
    href: row.orderRowId != null ? withJobReturn(`/m/orders/${row.orderRowId}?by=id`, back) : null,
  };
}

export function MobileImportRun() {
  const params = useParams<{ runId: string }>();
  const searchParams = useSearchParams();
  const runId = positiveIntParam(params?.runId);
  const detail = useImportRun(runId);
  // The list's filters ride along in `back`; this run's orders read the same narrowing.
  const back = mobileJobReturn(searchParams.get('back')) ?? MOBILE_IMPORTS_PATH;
  const listParams = new URLSearchParams(back.includes('?') ? back.slice(back.indexOf('?') + 1) : '');
  const rows = useImportRows(importListQuery(listParams, 'rows', { run: runId != null ? String(runId) : null }), runId != null);
  const here = `${MOBILE_IMPORTS_PATH}/${runId}?${new URLSearchParams({ back }).toString()}`;

  return (
    <DetailRecordFrame<ImportRunDetail>
      record={detail.data}
      state={{
        loading: detail.isPending && runId != null,
        error: detail.error?.message ?? null,
        onRetry: () => void detail.refetch(),
        missing: `Run ${params?.runId ?? ''} is not on file.`,
      }}
      bar={{
        title: `Run ${params?.runId ?? ''}`,
        mono: true,
        subtitle: 'Import',
        backHref: back,
        close: true,
        meta: (run) => `${importTriggerLabel(run)} · ${importStamp(run.startedAt)}`,
      }}
    >
      {(run) => {
        const state = IMPORT_RUN_LIFECYCLE[run.status];
        return (
          <div className="flex-1 divide-y divide-mode-rule" data-testid="mobile-import-run">
            <DetailFacts label="Run">
              <DetailFact label="Status" value={state.label} hint={run.error} />
              <DetailFact label="Trigger" value={importTriggerLabel(run)} />
              <DetailFact label="Kind" value={importKindLabel(run.kind)} />
              <DetailFact label="Started" value={`${importStamp(run.startedAt)} PT`} hint={importDuration(run.durationMs)} />
              <DetailFact label="Inserted" value={run.totals.inserted} />
              <DetailFact label="Backfilled" value={run.totals.backfilled} />
              <DetailFact label="Tracking" value={run.totals.trackingFilled} />
              <DetailFact label="To review" value={run.totals.needsReview} />
              <DetailFact label="Skipped" value={run.totals.skipped} />
              <DetailFact label="Failed" value={run.totals.failed} />
            </DetailFacts>
            <DetailSectionHeading>Steps</DetailSectionHeading>
            {run.steps.length === 0 ? (
              <p className="px-mode-page py-3 text-role-caption text-mode-muted">No steps recorded.</p>
            ) : (
              <DetailFacts label="Steps">
                {run.steps.map((step) => (
                  <DetailFact
                    key={step.id}
                    label={importSourceLabel(step.step)}
                    value={step.ok ? importStepCountsLine(step.counts) : 'Failed'}
                    hint={step.ok ? null : step.error}
                  />
                ))}
              </DetailFacts>
            )}
            <DetailSectionHeading>{rows.isPending ? 'Orders' : `Orders · ${rows.total}`}</DetailSectionHeading>
            {rows.isError ? (
              <p className="px-mode-page py-3 text-role-caption font-semibold text-text-danger">{rows.error.message}</p>
            ) : rows.isPending ? (
              <p className="px-mode-page py-3 text-role-caption text-mode-muted">Loading orders…</p>
            ) : rows.items.length === 0 ? (
              <p className="px-mode-page py-3 text-role-caption text-mode-muted">No orders in this run match the filters.</p>
            ) : (
              <DetailNav label="Orders in this run" rows={rows.items.map((row) => orderDoor(row, here))} />
            )}
            {rows.hasNextPage ? (
              <div className="px-mode-page py-3">
                <Button
                  variant="secondary"
                  size="lg"
                  radius="flush"
                  className="w-full"
                  onClick={() => void rows.fetchNextPage()}
                  disabled={rows.isFetchingNextPage}
                >
                  {rows.isFetchingNextPage ? 'Loading…' : `Load more (${rows.items.length} of ${rows.total})`}
                </Button>
              </div>
            ) : null}
          </div>
        );
      }}
    </DetailRecordFrame>
  );
}
