'use client';

/**
 * `/m/receiving/import-csv` — import a CSV of purchase orders on the phone
 * (from `/m/receiving/new` → Upload CSV). Four steps under a
 * `MobileStepProgress` — Choose file → Match columns → Review orders → Import
 * — one step body at a time (`MobileV2PoCsvSteps`, `MobileV2PoCsvOrders`), one
 * primary verb in the `DetailDock`, disabled with the name of what is missing.
 * Nothing auto-advances. Columns are identified in the browser and every change
 * re-runs the server dry run; Import lands clean orders through the one inbound
 * writer and holds any order with a problem row, whole.
 */

import { useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Check, RotateCcw, Sparkles, Upload } from '@/components/Icons';
import { MobileV2DetailTopBar } from '@/components/mobile/v2/MobileV2DetailTopBar';
import { DetailDock, type DetailDockVerb } from '@/design-system/components/DetailDock';
import { MobileStepProgress } from '@/design-system/components/MobileStepProgress';
import { PO_COLUMNS, identifyColumns, poPresetForPlatform, suggestPoPlatform, withPoMapping, type PoField } from '@/lib/inbound/po-columns';
import { postPoCsvImport, usePoCsvPreview, usePoPlatformChoices, type PoCsvImportResponse } from '@/lib/inbound/po-csv-client';
import { groupPoReviewOrders, poColumnsNeedingLook, poOrphanLines, poRemapColumn, poReviewOrders } from '@/lib/inbound/po-csv-review';
import { invalidateReceivingFeeds } from '@/lib/queries/receiving-queries';
import { parseCsv } from '@/lib/tables/import/parse-csv';
import { InboundChoiceSheet } from './MobileV2InboundParts';
import { PoColumnSheets, PoColumnsStep, PoFileStep, type PoColumnPicker } from './MobileV2PoCsvSteps';
import { PoImportStep, PoOrderSheet, PoReviewStep, plural } from './MobileV2PoCsvOrders';

interface LoadedFile {
  fileName: string;
  headers: string[];
  rows: Record<string, string>[];
}

const STEPS = [
  { id: 'file', label: 'Choose file' },
  { id: 'columns', label: 'Match columns' },
  { id: 'review', label: 'Review orders' },
  { id: 'import', label: 'Import' },
] as const;

type StepIndex = 0 | 1 | 2 | 3;
type DockId = 'choose' | 'next' | 'assist' | 'import' | 'retry' | 'done';
type SheetState = { kind: 'platform' } | PoColumnPicker | null;

export function MobileV2PoCsvImport() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const platformChoices = usePoPlatformChoices();
  const inputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<StepIndex>(0);
  const [file, setFile] = useState<LoadedFile | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [platform, setPlatform] = useState(() => searchParams.get('platform') || 'goodwill');
  /** Operator picks (field → header); null = as identified. */
  const [picked, setPicked] = useState<Partial<Record<PoField, string>> | null>(null);
  /** Headers the operator has looked at — they no longer ask for a look. */
  const [checked, setChecked] = useState<ReadonlySet<string>>(() => new Set());
  const [sheet, setSheet] = useState<SheetState>(null);
  const [drill, setDrill] = useState<string | null>(null);
  const [assisting, setAssisting] = useState(false);
  const [assistError, setAssistError] = useState<string | null>(null);
  const [committing, setCommitting] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [landed, setLanded] = useState<PoCsvImportResponse | null>(null);

  const preset = poPresetForPlatform(platform);
  const identification = useMemo(() => {
    if (!file) return null;
    const base = identifyColumns(file.headers, file.rows, { preset, platform });
    return picked ? withPoMapping(base, picked, { preset, platform }) : base;
  }, [file, picked, preset, platform]);
  const missing = identification?.missingRequired ?? [];
  const needLook = identification ? poColumnsNeedingLook(identification, checked) : [];

  const previewInput = useMemo(
    () => (file && identification && missing.length === 0 ? { headers: file.headers, rows: file.rows, platform, mapping: identification.mapping } : null),
    [file, identification, missing.length, platform],
  );
  const preview = usePoCsvPreview(landed ? null : previewInput);
  const answer = landed ?? preview.data ?? null;
  const summary = preview.data?.summary ?? null;
  const importable = summary ? summary.new + summary.updated : 0;

  const review = useMemo(() => {
    if (!file || !answer) return null;
    const input = { rows: file.rows, mapping: answer.identification.mapping, platform, rowProblems: answer.rowProblems };
    const orders = poReviewOrders({ ...input, outcomes: answer.batch?.orders ?? [] });
    return { orders, groups: groupPoReviewOrders(orders), orphans: poOrphanLines(input) };
  }, [file, answer, platform]);
  const drillOrder = review?.orders.find((o) => o.key === drill) ?? null;

  const resetMapping = () => {
    setPicked(null);
    setChecked(new Set());
    setAssistError(null);
  };

  const loadFile = async (upload: File) => {
    setFileError(null);
    setLanded(null);
    setCommitError(null);
    try {
      const { headers, rows } = parseCsv(await upload.text());
      if (headers.length === 0 || rows.length === 0) {
        setFileError('No data rows found in this file.');
        return;
      }
      const suggested = suggestPoPlatform(headers, rows);
      if (suggested) setPlatform(suggested);
      resetMapping();
      setFile({ fileName: upload.name, headers, rows });
    } catch {
      setFileError('Could not read this file.');
    }
  };

  const remap = (header: string, field: PoField | '') => {
    if (!identification) return;
    setPicked(poRemapColumn(identification.mapping, header, field));
    setChecked((prior) => new Set(prior).add(header));
  };

  const assist = async () => {
    if (!file || !identification) return;
    setAssisting(true);
    setAssistError(null);
    try {
      const outcome = await postPoCsvImport({ headers: file.headers, rows: file.rows, platform, mapping: identification.mapping, assist: true, dryRun: true });
      if (!outcome.ok) setAssistError(outcome.error);
      else if (outcome.result.assist?.error) setAssistError(`AI mapping unavailable: ${outcome.result.assist.error}`);
      else setPicked(outcome.result.identification.mapping);
    } finally {
      setAssisting(false);
    }
  };

  const commit = async () => {
    if (!file || !identification || importable === 0) return;
    setStep(3);
    setCommitting(true);
    setCommitError(null);
    try {
      const outcome = await postPoCsvImport({ headers: file.headers, rows: file.rows, platform, mapping: identification.mapping, dryRun: false, label: file.fileName });
      if (!outcome.ok) {
        setCommitError(outcome.error);
        return;
      }
      invalidateReceivingFeeds(queryClient);
      void queryClient.invalidateQueries({ queryKey: ['inbound-po-csv-preview'] });
      setDrill(null);
      setLanded(outcome.result);
    } finally {
      setCommitting(false);
    }
  };

  const platformLabel = platformChoices.find((c) => c.value === platform)?.label ?? (platform || null);

  const primary: DetailDockVerb<DockId> = (() => {
    if (step === 0) {
      if (!file) return { id: 'choose', label: 'Choose CSV file', icon: <Upload />, primary: true, testId: 'm-po-csv-choose' };
      return { id: 'next', label: platform ? 'Next' : 'Pick a platform first', icon: <Check />, primary: true, disabled: !platform, testId: 'm-po-csv-next' };
    }
    if (step === 1) {
      return {
        id: 'next',
        label: missing.length ? `Match ${PO_COLUMNS[missing[0]].label.toLowerCase()} first` : 'Next',
        icon: <Check />,
        primary: true,
        disabled: missing.length > 0,
        testId: 'm-po-csv-next',
      };
    }
    if (step === 2) {
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
    if (commitError) return { id: 'retry', label: 'Try again', icon: <RotateCcw />, primary: true, testId: 'm-po-csv-retry' };
    return { id: 'done', label: committing ? 'Importing…' : 'Done', icon: <Check />, primary: true, disabled: committing, loading: committing, testId: 'm-po-csv-done' };
  })();
  const verbs: DetailDockVerb<DockId>[] = [
    ...(step === 1 && missing.length
      ? [{ id: 'assist' as const, label: 'Match with AI', icon: <Sparkles />, loading: assisting, disabled: assisting, testId: 'm-po-csv-assist' }]
      : []),
    primary,
  ];

  const onVerb = (id: DockId) => {
    if (id === 'choose') inputRef.current?.click();
    else if (id === 'next') setStep((s) => (s < 2 ? ((s + 1) as StepIndex) : s));
    else if (id === 'assist') void assist();
    else if (id === 'import' || id === 'retry') void commit();
    else router.push('/m/receiving');
  };

  const columnPicker: PoColumnPicker | null = sheet?.kind === 'column' || sheet?.kind === 'field' ? sheet : null;

  return (
    <div className="flex min-h-full flex-col bg-mode-panel" data-testid="m-po-csv-import">
      <MobileV2DetailTopBar title="Import purchase orders" subtitle="Receiving · CSV" backHref="/m/receiving/new" close />
      <input
        ref={inputRef}
        type="file"
        accept=".csv,.tsv,text/csv,text/tab-separated-values"
        className="hidden"
        data-testid="m-po-csv-file-input"
        onChange={(e) => {
          const next = e.target.files?.[0];
          if (next) void loadFile(next);
          e.target.value = '';
        }}
      />
      <MobileStepProgress
        steps={STEPS}
        currentIndex={step}
        onStepPress={landed || committing ? undefined : (index) => setStep(index as StepIndex)}
        testId="m-po-csv-steps"
      />

      <div className="flex-1 pb-3" data-testid={`m-po-csv-step-${STEPS[step].id}`}>
        {step === 0 ? (
          <PoFileStep
            platformLabel={platformLabel}
            presetHint={preset.quantityWhenAbsent != null ? `${preset.label} files need no quantity column — each row is one item.` : null}
            file={file ? { fileName: file.fileName, rows: file.rows.length, columns: file.headers.length } : null}
            fileError={fileError}
            onPickPlatform={() => setSheet({ kind: 'platform' })}
            onPickFile={() => inputRef.current?.click()}
          />
        ) : null}

        {step === 1 && identification ? (
          <PoColumnsStep
            identification={identification}
            needLook={needLook}
            presetLabel={preset.label}
            assistError={assistError}
            onOpenColumn={(header) => setSheet({ kind: 'column', header })}
            onOpenField={(field) => setSheet({ kind: 'field', field })}
          />
        ) : null}

        {step === 2 ? (
          <PoReviewStep
            summary={summary}
            checking={preview.isFetching}
            error={preview.error?.message ?? null}
            groups={review?.groups ?? []}
            orphans={review?.orphans ?? []}
            onOpen={setDrill}
          />
        ) : null}
        {step === 3 ? (
          <PoImportStep
            importing={committing ? importable : null}
            error={commitError}
            summary={landed?.summary ?? null}
            groups={review?.groups ?? []}
            orphans={review?.orphans ?? []}
            onOpen={setDrill}
          />
        ) : null}
      </div>

      <DetailDock label="Import purchase orders" verbs={verbs} onVerb={onVerb} />

      <PoOrderSheet order={drillOrder} phase={landed ? 'result' : 'review'} onClose={() => setDrill(null)} />
      <InboundChoiceSheet
        open={sheet?.kind === 'platform'}
        onClose={() => setSheet(null)}
        title="Platform"
        options={platformChoices}
        value={platform}
        onPick={(value) => {
          setPlatform(value);
          resetMapping();
        }}
        testId="m-po-csv-platform-sheet"
      />
      <PoColumnSheets identification={identification} picker={columnPicker} onClose={() => setSheet(null)} onPick={remap} />
    </div>
  );
}
