'use client';

/**
 * `/m/racks/new` — create a movable rack from the phone (handoff
 * room-agnostic racks §5). `MobileStepProgress` Place → Shelves → Review →
 * Print over the shared step model (`rack-create-model.ts`), one step body at
 * a time (`MobileV2NewRackSteps`), one primary verb in `DetailDock` whose
 * disabled label names what is missing.
 *
 * Review asks the server for the plan (`createRack({ dryRun: true })`); Print
 * commits it with the same `clientEventId` (a retry after a dropped response
 * returns the same rack), then prints the placard and every shelf through
 * `useLocationLabelPrint` — which records `location.labels.printed`.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Check, Printer, RotateCcw, Warehouse } from '@/components/Icons';
import { MobileV2DetailTopBar } from '@/components/mobile/v2/MobileV2DetailTopBar';
import { DetailDock, type DetailDockVerb } from '@/design-system/components/DetailDock';
import { MobileStepProgress } from '@/design-system/components/MobileStepProgress';
import { useLocationLabelPrint } from '@/hooks/useLocationLabelPrint';
import {
  RACK_CREATE_STEPS,
  RACK_CREATE_STEP_LABELS,
  blockedReason,
  initialRackCreateState,
  toCreateRackBody,
  withShelfCount,
  type RackCreateState,
} from '@/lib/locations/rack-create-model';
import { createRack } from '@/lib/locations/racks-client';
import type { PlannedRack, RackDetail } from '@/lib/locations/rack-types';
import { locationHubPath } from '@/lib/mobile/location-hub-href';
import { withJobReturn } from '@/lib/mobile/nav-trail';
import { safeRandomUUID } from '@/lib/safe-uuid';
import { rackLabelRows } from '@/lib/locations/rack-display';
import { WAREHOUSE_PATHS } from '@/lib/nav/route-tree';
import { plural, rackErrorSentence } from './rack-presentation';
import { useRackPlacements } from './RackPlacementChoices';
import { NewRackPlaceStep, NewRackPrintStep, NewRackReviewStep, NewRackShelvesStep, type NewRackRun } from './MobileV2NewRackSteps';

const STEPS = RACK_CREATE_STEPS.map((id) => ({ id, label: RACK_CREATE_STEP_LABELS[id] }));
const RACKS_HREF = WAREHOUSE_PATHS.racks;

type DockId = 'next' | 'create' | 'retry' | 'reprint' | 'open';

export function MobileV2NewRackFlow() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const placements = useRackPlacements();
  const printLabels = useLocationLabelPrint();
  const [state, setState] = useState<RackCreateState>(() => initialRackCreateState(safeRandomUUID()));
  const [stepIndex, setStepIndex] = useState(0);
  const [scanError, setScanError] = useState<string | null>(null);
  const [plan, setPlan] = useState<{ planned: PlannedRack | null; loading: boolean; error: string | null }>({ planned: null, loading: false, error: null });
  const [run, setRun] = useState<NewRackRun>({ kind: 'idle' });
  const step = RACK_CREATE_STEPS[stepIndex];
  const created = 'rack' in run ? run.rack : null;
  const busy = run.kind === 'creating' || run.kind === 'printing';

  const review = async (next: RackCreateState) => {
    setPlan({ planned: null, loading: true, error: null });
    try {
      const response = await createRack(toCreateRackBody(next, true));
      setPlan({ planned: response.dryRun ? response.planned : null, loading: false, error: null });
    } catch (err) {
      setPlan({ planned: null, loading: false, error: rackErrorSentence(err, 'Could not plan the rack.') });
    }
  };

  const print = async (rack: RackDetail) => {
    const rows = rackLabelRows(rack, { placard: true, shelfCodes: new Set(rack.shelves.map((shelf) => shelf.code)) });
    setRun({ kind: 'printing', rack, done: 0, total: rows.length });
    try {
      const result = await printLabels(rows, (done, total) => setRun({ kind: 'printing', rack, done, total }));
      setRun({ kind: 'done', rack, result });
    } catch (err) {
      setRun({ kind: 'print_failed', rack, message: err instanceof Error ? err.message : 'Could not print the labels' });
    }
  };

  const create = async () => {
    setRun({ kind: 'creating' });
    try {
      const response = await createRack(toCreateRackBody(state, false));
      if (response.dryRun) throw new Error('The server returned a plan instead of a rack.');
      void queryClient.invalidateQueries({ queryKey: ['racks'] });
      await print(response.rack);
    } catch (err) {
      setRun({ kind: 'create_failed', message: rackErrorSentence(err, 'Could not create the rack.') });
    }
  };

  const goTo = (index: number) => {
    setStepIndex(index);
    if (RACK_CREATE_STEPS[index] === 'review') void review(state);
  };

  const blocked = blockedReason(state, step);
  const primary: DetailDockVerb<DockId> = (() => {
    if (step === 'place') {
      return { id: 'next', label: blocked ?? `Next · ${state.placement?.name ?? ''}`, icon: <Check />, primary: true, disabled: blocked != null, testId: 'new-rack-next' };
    }
    if (step === 'shelves') {
      return { id: 'next', label: blocked ?? `Review ${plural(state.shelves, 'shelf', 'shelves')}`, icon: <Check />, primary: true, disabled: blocked != null, testId: 'new-rack-next' };
    }
    if (step === 'review') {
      const missing = blocked ?? (plan.loading ? 'Planning the rack…' : plan.planned ? null : 'Fix the rack first');
      return {
        id: 'next',
        label: missing ?? `Create and print ${plural(plan.planned!.shelves.length + 1, 'label')}`,
        icon: <Printer />,
        primary: true,
        disabled: missing != null,
        testId: 'new-rack-next',
      };
    }
    if (run.kind === 'done') return { id: 'open', label: `Open ${run.rack.name}`, icon: <Warehouse />, primary: true, testId: 'new-rack-open' };
    if (run.kind === 'print_failed') return { id: 'reprint', label: 'Print again', icon: <RotateCcw />, primary: true, testId: 'new-rack-reprint' };
    if (run.kind === 'create_failed') return { id: 'retry', label: 'Try again', icon: <RotateCcw />, primary: true, testId: 'new-rack-retry' };
    return {
      id: 'create',
      label: run.kind === 'creating' ? 'Creating…' : run.kind === 'printing' ? 'Printing…' : 'Create and print',
      icon: <Printer />,
      primary: true,
      disabled: busy,
      loading: busy,
      testId: 'new-rack-create',
    };
  })();
  const verbs: DetailDockVerb<DockId>[] = [
    ...(run.kind === 'done' ? [{ id: 'reprint' as const, label: 'Print again', icon: <RotateCcw />, testId: 'new-rack-print-again' }] : []),
    primary,
  ];

  const onVerb = (id: DockId): void | Promise<void> => {
    if (id === 'next') {
      // Leaving Review commits: Print starts the create at once.
      if (step === 'review') {
        setStepIndex(RACK_CREATE_STEPS.indexOf('print'));
        return create();
      }
      goTo(stepIndex + 1);
      return;
    }
    if (id === 'create' || id === 'retry') return create();
    if (id === 'reprint' && created) return print(created);
    if (id === 'open' && created) router.push(withJobReturn(locationHubPath(created.code), RACKS_HREF));
  };

  return (
    <div className="flex min-h-full flex-col bg-mode-panel" data-testid="m-new-rack">
      <MobileV2DetailTopBar
        title="New rack"
        subtitle={state.placement ? state.placement.name : 'Racks'}
        backHref={RACKS_HREF}
        close
        lead={<Warehouse className="h-5 w-5 text-mode-muted" />}
      />
      <MobileStepProgress
        steps={STEPS}
        currentIndex={stepIndex}
        // Once the rack exists the earlier steps describe a done thing — no jumping back.
        onStepPress={busy || created ? undefined : goTo}
        testId="new-rack-steps"
      />

      <div className="flex-1 pb-3" data-testid={`new-rack-step-${step}`}>
        {step === 'place' ? (
          <NewRackPlaceStep
            state={state}
            choices={placements.choices}
            loading={placements.loading}
            error={placements.error}
            scanError={scanError}
            onScan={(value) => {
              const match = placements.match(value);
              if (!match) {
                setScanError('That label is not a room or a floor spot. Scan a room or floor label, or choose one below.');
                return;
              }
              setScanError(null);
              setState((current) => ({ ...current, placement: match }));
            }}
            onChoose={(choice) => {
              setScanError(null);
              setState((current) => ({ ...current, placement: choice }));
            }}
          />
        ) : null}
        {step === 'shelves' ? (
          <NewRackShelvesStep
            state={state}
            onCount={(count) => setState((current) => withShelfCount(current, count))}
          />
        ) : null}
        {step === 'review' ? <NewRackReviewStep planned={plan.planned} loading={plan.loading} error={plan.error} /> : null}
        {step === 'print' ? <NewRackPrintStep run={run} /> : null}
      </div>

      <DetailDock label="New rack" verbs={verbs} onVerb={onVerb} />
    </div>
  );
}
