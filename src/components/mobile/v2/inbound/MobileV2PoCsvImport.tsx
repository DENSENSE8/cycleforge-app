'use client';

/**
 * `/m/receiving/import-csv` — import an order file on the phone (from
 * `/m/receiving/new` → Upload CSV); the phone face of `/purchasing/import`.
 * Five steps under a `MobileStepProgress` — Choose file → Format → Match
 * columns → Review orders → Import — one step body at a time
 * (`MobileV2PoCsvSteps`, `MobileV2PoCsvOrders`), one primary verb in the
 * `DetailDock`, disabled with the name of what is missing. Nothing
 * auto-advances. The format is found from the file (`detectPoPreset`) and the
 * operator may pick another; columns are identified in the browser and every
 * change re-runs the server dry run (`useMobilePoCsvFlow`); Import lands clean
 * orders through the one inbound writer, holds any order with a problem row,
 * whole, and links to the batch's upload check.
 */

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, RotateCcw, Sparkles, Upload } from '@/components/Icons';
import { MobileV2DetailTopBar } from '@/components/mobile/v2/MobileV2DetailTopBar';
import { DetailDock, type DetailDockVerb } from '@/design-system/components/DetailDock';
import { MobileStepProgress } from '@/design-system/components/MobileStepProgress';
import { PO_COLUMNS, type PoPresetId } from '@/lib/inbound/po-columns';
import { purchaseImportCheckHref } from '@/lib/nav/route-tree';
import { InboundChoiceSheet } from './MobileV2InboundParts';
import { useMobilePoCsvFlow } from './MobileV2PoCsvFlow';
import { PoImportStep, PoOrderSheet, PoReviewStep, plural } from './MobileV2PoCsvOrders';
import { PoColumnSheets, PoColumnsStep, PoFileStep, PoFormatStep, poPresetChoices, type PoColumnPicker } from './MobileV2PoCsvSteps';

const STEPS = [
  { id: 'file', label: 'Choose file' },
  { id: 'format', label: 'Format' },
  { id: 'columns', label: 'Match columns' },
  { id: 'review', label: 'Review orders' },
  { id: 'import', label: 'Import' },
] as const;

type StepIndex = 0 | 1 | 2 | 3 | 4;
type DockId = 'choose' | 'next' | 'assist' | 'import' | 'retry' | 'done';
type SheetState = { kind: 'preset' } | { kind: 'platform' } | PoColumnPicker | null;

export function MobileV2PoCsvImport() {
  const router = useRouter();
  const flow = useMobilePoCsvFlow();
  const inputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<StepIndex>(0);
  const [sheet, setSheet] = useState<SheetState>(null);
  const { file, missing, preview, importable, committing } = flow;
  const platformMissing = missing.includes('platform');

  const primary: DetailDockVerb<DockId> = (() => {
    if (step === 0) {
      if (!file) return { id: 'choose', label: 'Choose file', icon: <Upload />, primary: true, testId: 'm-po-csv-choose' };
      return { id: 'next', label: 'Next', icon: <Check />, primary: true, testId: 'm-po-csv-next' };
    }
    if (step === 1 || step === 2) {
      // Format asks only for the platform; Match columns for every required field.
      const blocker = step === 1 ? (platformMissing ? 'platform' : null) : (missing[0] ?? null);
      return {
        id: 'next',
        label: step === 1 && blocker ? 'Pick a platform first' : blocker ? `Match ${PO_COLUMNS[blocker].label.toLowerCase()} first` : 'Next',
        icon: <Check />,
        primary: true,
        disabled: blocker != null,
        testId: 'm-po-csv-next',
      };
    }
    if (step === 3) {
      return {
        id: 'import',
        label: preview.isFetching
          ? 'Checking orders…'
          : preview.error
            ? 'Could not check the file'
            : importable === 0
              ? 'Nothing new to import'
              : `Import ${plural(importable, 'order')}`,
        icon: <Check />,
        primary: true,
        disabled: preview.isFetching || preview.error != null || importable === 0,
        testId: 'm-po-csv-commit',
      };
    }
    if (flow.commitError) return { id: 'retry', label: 'Try again', icon: <RotateCcw />, primary: true, testId: 'm-po-csv-retry' };
    return { id: 'done', label: committing ? 'Importing…' : 'Done', icon: <Check />, primary: true, disabled: committing, loading: committing, testId: 'm-po-csv-done' };
  })();
  const verbs: DetailDockVerb<DockId>[] = [
    ...(step === 2 && missing.some((f) => f !== 'platform')
      ? [{ id: 'assist' as const, label: 'Match with AI', icon: <Sparkles />, loading: flow.assisting, disabled: flow.assisting, testId: 'm-po-csv-assist' }]
      : []),
    primary,
  ];

  const onVerb = (id: DockId) => {
    if (id === 'choose') inputRef.current?.click();
    else if (id === 'next') setStep((s) => (s < 3 ? ((s + 1) as StepIndex) : s));
    else if (id === 'assist') void flow.assist();
    else if (id === 'import' || id === 'retry') {
      setStep(4);
      void flow.commit();
    } else router.push('/m/receiving');
  };

  const columnPicker: PoColumnPicker | null = sheet?.kind === 'column' || sheet?.kind === 'field' ? sheet : null;
  const detected = file?.detected ?? null;

  return (
    <div className="flex min-h-full flex-col bg-mode-panel" data-testid="m-po-csv-import">
      <MobileV2DetailTopBar title="Import orders" subtitle="Purchasing · CSV or TSV" backHref="/m/receiving/new" close />
      <input
        ref={inputRef}
        type="file"
        accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain"
        className="hidden"
        data-testid="m-po-csv-file-input"
        onChange={(e) => {
          const next = e.target.files?.[0];
          if (next) void flow.loadFile(next);
          e.target.value = '';
        }}
      />
      <MobileStepProgress
        steps={STEPS}
        currentIndex={step}
        onStepPress={flow.landed || committing ? undefined : (index) => setStep(index as StepIndex)}
        testId="m-po-csv-steps"
      />

      <div className="flex-1 pb-3" data-testid={`m-po-csv-step-${STEPS[step].id}`}>
        {step === 0 ? (
          <PoFileStep
            file={file ? { fileName: file.fileName, rows: file.rows.length, columns: file.headers.length } : null}
            fileError={flow.fileError}
            onPickFile={() => inputRef.current?.click()}
          />
        ) : null}
        {step === 1 ? (
          <PoFormatStep
            preset={flow.presetId}
            detected={detected}
            platformLabel={flow.platformLabel}
            onPickPreset={() => setSheet({ kind: 'preset' })}
            onPickPlatform={() => setSheet({ kind: 'platform' })}
          />
        ) : null}
        {step === 2 && flow.identification ? (
          <PoColumnsStep
            identification={flow.identification}
            needLook={flow.needLook}
            preset={flow.presetId}
            assistError={flow.assistError}
            onOpenColumn={(header) => setSheet({ kind: 'column', header })}
            onOpenField={(field) => setSheet({ kind: 'field', field })}
          />
        ) : null}
        {step === 3 ? (
          <PoReviewStep
            summary={flow.summary}
            checking={preview.isFetching}
            error={preview.error?.message ?? null}
            groups={flow.review?.groups ?? []}
            orphans={flow.review?.orphans ?? []}
            onOpen={flow.setDrill}
          />
        ) : null}
        {step === 4 ? (
          <PoImportStep
            importing={committing ? importable : null}
            error={flow.commitError}
            summary={flow.landed?.summary ?? null}
            checkHref={flow.batchId != null ? purchaseImportCheckHref(flow.batchId) : null}
            groups={flow.review?.groups ?? []}
            orphans={flow.review?.orphans ?? []}
            onOpen={flow.setDrill}
          />
        ) : null}
      </div>

      <DetailDock label="Import orders" verbs={verbs} onVerb={onVerb} />

      <PoOrderSheet order={flow.drillOrder} phase={flow.landed ? 'result' : 'review'} onClose={() => flow.setDrill(null)} />
      <InboundChoiceSheet
        open={sheet?.kind === 'preset'}
        onClose={() => setSheet(null)}
        title="Format"
        options={poPresetChoices(detected)}
        value={flow.presetId}
        onPick={(value) => flow.pickPreset(value as PoPresetId)}
        testId="m-po-csv-preset-sheet"
      />
      <InboundChoiceSheet
        open={sheet?.kind === 'platform'}
        onClose={() => setSheet(null)}
        title="Platform"
        options={flow.platformChoices}
        value={flow.platformPick || null}
        onPick={flow.pickPlatform}
        testId="m-po-csv-platform-sheet"
      />
      <PoColumnSheets identification={flow.identification} picker={columnPicker} onClose={() => setSheet(null)} onPick={flow.remap} />
    </div>
  );
}
