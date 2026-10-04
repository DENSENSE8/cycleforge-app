'use client';

/**
 * `/m/stock/labels` — print rack labels from the phone (handoff room-agnostic
 * racks §5): Rack → Shelves → Print under `MobileStepProgress`, one step body
 * at a time (`MobileV2LocationLabelSteps`), one primary verb in `DetailDock`.
 *
 * Reads the racks (`listRacks`) and the chosen rack (`getRack`) — no second
 * location list. The placard and every shelf start selected; a tap toggles
 * one, "Arrival shelves only" narrows to the urgency shelves. Print hands the
 * rows to `useLocationLabelPrint` (the one location print entry point, which
 * records `location.labels.printed`). `?rack=RK12` (the rack record's Print
 * labels) lands on Shelves with that rack.
 *
 * Legacy room-coded shelves (`C-04-07-3`) print from their own record
 * (`/m/loc/[code]` › Print label) or become a rack via Make movable rack.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Check, Printer, RotateCcw } from '@/components/Icons';
import { MobileV2DetailTopBar } from '@/components/mobile/v2/MobileV2DetailTopBar';
import { plural, rackErrorSentence } from '@/components/mobile/v2/racks/rack-presentation';
import { DetailDock, type DetailDockVerb } from '@/design-system/components/DetailDock';
import { MobileStepProgress } from '@/design-system/components/MobileStepProgress';
import { useLocationLabelPrint } from '@/hooks/useLocationLabelPrint';
import { getRack, listRacks, rackQueryKey, racksQueryKey } from '@/lib/locations/racks-client';
import { allLabelKeys, labelRows } from './location-label-flow-model';
import { LabelPrintStep, LabelRackStep, LabelShelvesStep, type LabelPrintRun } from './MobileV2LocationLabelSteps';

const STEPS = [
  { id: 'rack', label: 'Rack' },
  { id: 'shelves', label: 'Shelves' },
  { id: 'print', label: 'Print' },
] as const;

type StepIndex = 0 | 1 | 2;
type DockId = 'next' | 'print' | 'again' | 'done';

export function MobileV2LocationLabelFlow({ initialRack, backHref }: { initialRack: string | null; backHref: string }) {
  const router = useRouter();
  const racks = useQuery({ queryKey: racksQueryKey(), queryFn: () => listRacks() });
  const printLabels = useLocationLabelPrint();
  const [step, setStep] = useState<StepIndex>(initialRack ? 1 : 0);
  const [rackCode, setRackCode] = useState<string | null>(initialRack);
  const rackQuery = useQuery({ queryKey: rackQueryKey(rackCode ?? ''), queryFn: () => getRack(rackCode ?? ''), enabled: rackCode != null });
  const rack = rackQuery.data?.rack ?? null;
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const [arrivalOnly, setArrivalOnly] = useState(false);
  const [run, setRun] = useState<LabelPrintRun>({ kind: 'idle' });

  // A freshly loaded rack starts with every label selected.
  const seededFor = useRef<string | null>(null);
  useEffect(() => {
    if (!rack || seededFor.current === rack.code) return;
    seededFor.current = rack.code;
    setSelected(allLabelKeys(rack));
  }, [rack]);

  const rows = useMemo(() => (rack ? labelRows(rack, selected, arrivalOnly) : []), [arrivalOnly, rack, selected]);
  const printing = run.kind === 'printing';

  const pickRack = (code: string) => {
    seededFor.current = null;
    setRackCode(code);
    setArrivalOnly(false);
    setRun({ kind: 'idle' });
    setStep(1);
  };

  const toggle = (keys: readonly string[], on: boolean) => {
    setSelected((current) => {
      const next = new Set(current);
      for (const key of keys) {
        if (on) next.add(key);
        else next.delete(key);
      }
      return next;
    });
  };

  const print = async () => {
    setRun({ kind: 'printing', done: 0, total: rows.length });
    try {
      const result = await printLabels(rows, (done, total) => setRun({ kind: 'printing', done, total }));
      setRun({ kind: 'done', result });
    } catch (err) {
      setRun({ kind: 'failed', message: err instanceof Error ? err.message : 'Could not print the labels' });
    }
  };

  const primary: DetailDockVerb<DockId> = (() => {
    if (step === 0) {
      return { id: 'next', label: rack ? `Next · ${rack.name}` : 'Choose a rack', icon: <Check />, primary: true, disabled: !rack, testId: 'm-labels-next' };
    }
    if (step === 1) {
      const missing = !rack ? 'Loading the rack…' : rows.length === 0 ? 'Select labels first' : null;
      return { id: 'next', label: missing ?? `Next · ${plural(rows.length, 'label')}`, icon: <Check />, primary: true, disabled: missing != null, testId: 'm-labels-next' };
    }
    if (run.kind === 'done') return { id: 'done', label: 'Done', icon: <Check />, primary: true, testId: 'm-labels-done' };
    return {
      id: 'print',
      label: printing ? 'Printing…' : run.kind === 'failed' ? 'Try again' : `Print ${plural(rows.length, 'label')}`,
      icon: run.kind === 'failed' ? <RotateCcw /> : <Printer />,
      primary: true,
      disabled: printing || rows.length === 0,
      loading: printing,
      testId: 'm-labels-print',
    };
  })();
  const verbs: DetailDockVerb<DockId>[] = [
    ...(step === 2 && run.kind === 'done'
      ? [{ id: 'again' as const, label: 'Print again', icon: <RotateCcw />, testId: 'm-labels-again' }]
      : []),
    primary,
  ];

  const onVerb = (id: DockId): void | Promise<void> => {
    if (id === 'print' || id === 'again') return print();
    if (id === 'next') setStep((s) => (s < 2 ? ((s + 1) as StepIndex) : s));
    else router.push(backHref);
  };

  return (
    <div className="flex min-h-full flex-col bg-mode-panel" data-testid="m-location-labels">
      <MobileV2DetailTopBar
        title="Print rack labels"
        subtitle={rack ? rack.name : 'Racks'}
        backHref={backHref}
        close
        lead={<Printer className="h-5 w-5 text-mode-muted" />}
      />
      <MobileStepProgress
        steps={STEPS}
        currentIndex={step}
        onStepPress={printing ? undefined : (index) => setStep(index as StepIndex)}
        testId="m-labels-steps"
      />

      <div className="flex-1 pb-3" data-testid={`m-labels-step-${STEPS[step].id}`}>
        {step === 0 ? (
          <LabelRackStep
            racks={racks.data?.racks ?? []}
            loading={racks.isPending}
            error={racks.isError ? rackErrorSentence(racks.error, 'Could not load racks.') : null}
            onPick={(picked) => pickRack(picked.code)}
          />
        ) : null}
        {step === 1 ? (
          rack ? (
            <LabelShelvesStep rack={rack} selected={selected} arrivalOnly={arrivalOnly} onArrivalOnly={setArrivalOnly} onToggle={toggle} />
          ) : rackQuery.isError ? (
            <p role="alert" className="break-words px-mode-page py-10 text-center text-role-caption font-semibold text-text-danger">
              {rackErrorSentence(rackQuery.error, 'Could not load the rack.')}
            </p>
          ) : (
            <p className="break-words px-mode-page py-10 text-center text-role-caption text-text-muted">Loading the rack…</p>
          )
        ) : null}
        {step === 2 && rack ? (
          <LabelPrintStep
            rack={rack}
            count={rows.length}
            tiered={rows.filter((row) => row.arrivalPriorityTier != null).length}
            run={run}
          />
        ) : null}
      </div>

      <DetailDock label="Print rack labels" verbs={verbs} onVerb={onVerb} />
    </div>
  );
}
