'use client';

/**
 * One RUN CARD on Operations › Imports › Runs — the import-run family's
 * adapter over the shared {@link RecordCard} (the To-ship card anatomy):
 * line 1 `Run N` · trigger (Scheduled | who ran it) · the sources that ran …
 * time · duration · status; the title is the totals sentence; the facts are
 * the run's error; bottom-right "→ Review N" while it parked orders.
 */

import { memo, useMemo } from 'react';
import { StaffAvatar } from '@/components/identity/StaffAvatar';
import { BrandIdentityDot } from '@/components/ui/grid-cells';
import { RecordCard } from '@/design-system/components/record-card/RecordCard';
import type { RecordCardModel } from '@/design-system/components/record-card/record-card-types';
import { recordStateGlyph } from '@/design-system/components/record-card/record-state-glyph';
import type { TriageCardModelBase, TriageCardSlotProps } from '@/design-system/components/triage-card-list/TriageCardList';
import { IMPORT_RUN_LIFECYCLE } from '@/design-system/tokens/import-record-lifecycle';
import { CARD_FACT_BOX_CLASS } from '@/design-system/tokens/desk-stage';
import { usePlatformMeta } from '@/hooks/useCatalog';
import type { ImportRunListItem } from '@/lib/imports/types';
import {
  importDuration,
  importKindLabel,
  importSourceLabel,
  importStamp,
  importRunTotalsLine,
  importTriggerLabel,
} from '@/lib/imports/record-faces';
import { platformMetaBrandDot } from '@/lib/source-platform';
import { IMPORT_RUNS_VIEW } from '@/lib/triage/views';
import { formatStageClockTimePST } from '@/utils/date';
import { cn } from '@/utils/_cn';
import { ImportCardPeek } from './ImportCardPeek';

/** One run per card. */
export type ImportRunCardModel = TriageCardModelBase<ImportRunListItem>;

/** What each run status means — the status icon's tooltip. */
const STATUS_MEANING: Readonly<Record<ImportRunListItem['status'], string>> = {
  running: 'Still running',
  success: 'Every step landed',
  partial: 'A step failed; the other steps landed',
  failed: 'The run failed',
};

/** A long step error fits one fact; the quick look and the record carry it whole. */
const ERROR_FACT_MAX = 72;

export const ImportRunCard = memo(function ImportRunCard({
  model,
  checked,
  open,
  expanded,
  peekOpen,
  enterIndex,
  onOpen,
  onToggleCheck,
  onToggleExpand,
  onTogglePeek,
  dayShown,
}: TriageCardSlotProps<ImportRunListItem, ImportRunCardModel> & {
  /** The list heads the card with its PT day, so the card reads only the time. */
  dayShown: boolean;
}) {
  const platformMeta = usePlatformMeta();
  const run = model.lead;
  const trigger = importTriggerLabel(run);

  const record = useMemo<RecordCardModel>(() => {
    const state = IMPORT_RUN_LIFECYCLE[run.status];
    const sources = run.sources.map((source) => ({ source, label: importSourceLabel(source), meta: platformMeta(source) }));
    const sourceNames = sources.map((s) => s.label).join(' · ');
    const totals = importRunTotalsLine(run.totals);
    const error = run.error;
    return {
      key: model.key,
      leadId: run.id,
      state,
      stateIcon: recordStateGlyph(state),
      stateMeaning: STATUS_MEANING[run.status],
      alert: null,
      aria: {
        card: `Run ${run.id}, ${trigger}, ${state.label}, ${totals}`,
        open: `Open run ${run.id}`,
        check: `Select run ${run.id}`,
      },
      channel:
        sources.length > 0
          ? {
              label: sourceNames,
              tooltip: `Sources: ${sourceNames}`,
              dot: (
                <span className="flex items-center gap-0.5">
                  {sources.map(({ source, meta }) => (
                    <BrandIdentityDot key={source} {...platformMetaBrandDot(meta)} />
                  ))}
                </span>
              ),
              badge: null,
            }
          : null,
      person: null,
      chips: [],
      notes: { fixed: null, own: null },
      status: { kind: 'state', face: state.label, tone: state.tone, tip: STATUS_MEANING[run.status] },
      next:
        run.totals.needsReview > 0
          ? {
              label: `Review ${run.totals.needsReview}`,
              tone: 'warning',
              tip: `${run.totals.needsReview} order${run.totals.needsReview === 1 ? '' : 's'} held for review — open the run`,
              blocked: false,
            }
          : null,
      lines: [
        {
          id: run.id,
          title: totals,
          photoUrl: null,
          facts: {
            error: error
              ? { kind: 'missing', text: error.length > ERROR_FACT_MAX ? `${error.slice(0, ERROR_FACT_MAX - 1)}…` : error }
              : null,
          },
          alert: false,
          alertNote: null,
        },
      ],
      hiddenAlertLabel: () => '',
    };
  }, [model.key, run, trigger, platformMeta]);

  const stamp = importStamp(run.startedAt);
  const identity = (
    <span className="flex min-w-0 items-center gap-2" title={`Run ${run.id} · ${trigger}`}>
      <span className="shrink-0">Run {run.id}</span>
      <span className="flex min-w-0 items-center gap-1.5 text-role-nav font-normal text-text-muted">
        {run.triggeredBy ? <StaffAvatar staffId={run.triggeredBy.staffId} name={run.triggeredBy.name} size="xs" /> : null}
        <span className="truncate">{trigger}</span>
      </span>
    </span>
  );
  const trailing = (
    <span
      title={`Started ${stamp} PT`}
      className={cn(CARD_FACT_BOX_CLASS, 'pointer-events-auto gap-1.5 whitespace-nowrap text-role-nav tabular-nums text-text-muted')}
    >
      {dayShown ? formatStageClockTimePST(run.startedAt) : stamp}
      <span aria-hidden className="text-text-faint">·</span>
      {importDuration(run.durationMs)}
    </span>
  );

  return (
    <RecordCard
      model={record}
      factColumns={IMPORT_RUNS_VIEW.facts}
      testIdPrefix={IMPORT_RUNS_VIEW.testIdPrefix}
      rowAttrs={{ 'data-import-run-id': run.id }}
      checked={checked}
      open={open}
      expanded={expanded}
      peekOpen={peekOpen}
      enterIndex={enterIndex}
      onOpen={(event) => onOpen(run, event)}
      onToggleCheck={(event) => onToggleCheck(model, event)}
      onToggleExpand={() => onToggleExpand(model.key)}
      onTogglePeek={() => onTogglePeek(model.key)}
      identity={identity}
      trailing={trailing}
      quickLook={
        <ImportCardPeek
          key="peek"
          testId="import-run-card-peek"
          facts={[
            ['Kind', importKindLabel(run.kind)],
            ['Started', `${stamp} PT`],
            ['Finished', run.finishedAt ? `${importStamp(run.finishedAt)} PT` : 'Still running'],
            ['Skipped', run.totals.skipped || null],
            ['Failed', run.totals.failed || null],
            ['Scheduler run', run.cronRunId],
            ['Error', run.error, true],
          ]}
        />
      }
    />
  );
});
