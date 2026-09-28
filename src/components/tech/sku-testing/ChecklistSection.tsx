import { Loader2, Plus } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { EYEBROW, SECTION, type Bundle, type UnitResult } from './sku-testing-types';
import { useChecklistEditor } from './useChecklistEditor';
import { ChecklistStepRow } from './ChecklistStepRow';
import { NoCatalogNotice } from './NoCatalogNotice';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';
import { QcProcedureVersion } from '@/components/qc/QcProcedureVersion';

/** Testing checklist — template editing + per-unit recording for one line. */
export function ChecklistSection({
  receivingLineId,
  bundle,
  results,
  canRecord,
  serialUnitId,
  onChanged,
  onReloadResults,
  onResultChange,
  embedded = false,
}: {
  receivingLineId: number;
  bundle: Bundle;
  results: Record<number, UnitResult>;
  canRecord: boolean;
  serialUnitId: number | null;
  onChanged: () => Promise<void>;
  onReloadResults: () => Promise<void>;
  onResultChange: (stepId: number, next: Partial<UnitResult>) => void;
  /** Bare body for tab panels — drops the card chrome + section eyebrow. */
  embedded?: boolean;
}) {
  const steps = bundle.checklist;
  const ed = useChecklistEditor({
    receivingLineId,
    steps,
    serialUnitId,
    results,
    onChanged,
    onReloadResults,
    onResultChange,
  });

  const Wrapper = embedded ? 'div' : 'section';

  return (
    <Wrapper className={embedded ? undefined : SECTION}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {!embedded ? <h3 className={EYEBROW}>Testing checklist</h3> : null}
          <QcProcedureVersion skuCatalogId={bundle.skuCatalogId} results={Object.values(results)} />
        </div>
        <div className="flex items-center gap-2">
          {steps.length > 0 ? (
            <span
              className={`rounded-md px-2 py-0.5 text-role-micro font-semibold ${
                canRecord && ed.done === steps.length
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'bg-surface-sunken text-text-muted'
              }`}
            >
              {ed.done}/{steps.length} done
            </span>
          ) : null}
          {canRecord && steps.length > 0 ? (
            <>
              <HoverTooltip
                label={ed.allDone ? 'Clear all recorded results for this unit' : 'Mark every step passed for this unit'}
                asChild
              >
                <Button
                  variant="ghost"
                  size="sm"
                  loading={ed.bulkBusy}
                  onClick={() => void ed.bulkSet(ed.allDone ? 'clear' : 'pass')}
                  className="gap-1 rounded-md px-2 text-role-micro text-emerald-600 hover:bg-emerald-50"
                >
                  {ed.allDone ? 'Clear all' : 'Check all'}
                </Button>
              </HoverTooltip>
              <span className="h-3.5 w-px bg-surface-strong" aria-hidden />
            </>
          ) : null}
          <Button
            variant="ghost"
            size="sm"
            icon={<Plus />}
            onClick={() => {
              ed.setAdding((v) => !v);
              ed.setDraft('');
            }}
            className="gap-1 rounded-md px-2 text-role-micro text-blue-600 hover:bg-blue-50"
          >
            Add
          </Button>
        </div>
      </div>

      {bundle.skuCatalogId == null ? (
        <NoCatalogNotice receivingLineId={receivingLineId} sku={bundle.sku ?? ''} onCreated={onChanged} />
      ) : null}

      <ul className="flex flex-col gap-1.5">
        {steps.map((step) => (
          <ChecklistStepRow
            key={step.step_id}
            step={step}
            result={results[step.step_id]}
            canRecord={canRecord}
            ed={ed}
          />
        ))}
      </ul>

      {ed.adding ? (
        <div className="mt-2 flex items-center gap-1.5">
          <input
            value={ed.draft}
            onChange={(e) => ed.setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void ed.addStep();
              if (e.key === 'Escape') ed.setAdding(false);
            }}
            autoFocus
            placeholder="New checklist step…"
            className={cn("w-full rounded-md border border-border-soft px-2 py-1.5 text-role-caption font-medium text-text-default placeholder:text-text-faint", focusRing('field', 'accent'))}
          />
          <Button
            variant="primary"
            size="sm"
            onClick={() => void ed.addStep()}
            disabled={ed.busy || !ed.draft.trim()}
            className="shrink-0 rounded-md px-3 text-role-caption font-semibold"
          >
            {ed.busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Add'}
          </Button>
        </div>
      ) : null}

      {steps.length === 0 && !ed.adding ? (
        <p className="text-role-caption text-text-faint">No checklist steps yet. Use “Add” to create one.</p>
      ) : null}

      {steps.length > 0 && !canRecord ? (
        <p className="mt-2.5 text-role-micro font-medium text-text-faint">
          Scan a serial to record results
        </p>
      ) : null}
    </Wrapper>
  );
}
