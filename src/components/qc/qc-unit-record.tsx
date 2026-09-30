'use client';

/**
 * The desk QC unit record (owner 2026-09-29, record grammar Step 5): one
 * serial unit's read → {@link qcUnitRecordModel} + its header verbs, for a
 * desk's `useRecordSlot(model, verbs, label, 'qc-record')`. The verdicts —
 * Pass (P) / Test again (T) / Failed (F) — are header verbs on the one writer
 * (`POST /api/serial-units/{id}/test`); Failed's panel records the fail and
 * files the vendor ticket (`QcFailTicketPanel`, `suggestQcFailRemedy`).
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle, RotateCcw, X } from '@/components/Icons';
import { RecordPhotosDoor } from '@/components/photos/RecordPhotosDoor';
import { QcFailTicketPanel } from '@/components/ui/QcFailTicketPanel';
import { EvidenceNotice } from '@/design-system/components/record-ledger/RecordEvidence';
import type { RecordModel, RecordVerb } from '@/design-system/components/record-ledger/record-model';
import type { QcLabelRow } from '@/lib/labels/qc-label-row';
import { QC_VERDICTS, postQcVerdict } from '@/lib/qc/qc-verdict';
import { qcUnitRecordModel, qcUnitRecordState } from '@/lib/qc/qc-unit-record-model';
import type { UnitQcStep } from '@/lib/qc/unit-qc';
import { useUnitChecklist } from '@/lib/qc/use-unit-checklist';
import { safeRandomUUID } from '@/lib/safe-uuid';
import { serialUnitQueryKey, useSerialUnit, type SerialUnitRead } from '@/lib/serial/use-serial-unit';
import { serialStatusLabel } from '@/lib/inventory/serial-status-display';
import { toast } from '@/lib/toast';

const VERDICT_ICON: Readonly<Record<(typeof QC_VERDICTS)[number]['verdict'], ReactNode>> = {
  PASS: <CheckCircle />,
  TEST_AGAIN: <RotateCcw aria-hidden />,
  TESTING_FAILED: <X aria-hidden />,
};

const VERDICT_TONE = { PASS: 'success', TEST_AGAIN: 'default', TESTING_FAILED: 'danger' } as const;

/** The unit's own photos (pack-station QR scans, bench shots) — the record's evidence door. */
function QcUnitPhotosDoor({ unitId }: { unitId: number }) {
  const query = useQuery({
    queryKey: ['serial-unit.photos', unitId],
    queryFn: async () => {
      const res = await fetch(`/api/serial-units/${unitId}/photos`, { cache: 'no-store' });
      const json = (await res.json().catch(() => null)) as { success?: boolean; photos?: { url: string; createdAt?: string }[] } | null;
      if (!res.ok || !json?.success) throw new Error(`HTTP ${res.status}`);
      return json.photos ?? [];
    },
    refetchOnWindowFocus: false,
  });
  const photos = useMemo(() => (query.data ?? []).map((photo) => ({ url: photo.url, uploadedAt: photo.createdAt })), [query.data]);
  return (
    <RecordPhotosDoor
      photos={photos}
      fetching={query.isFetching}
      error={query.isError}
      galleryId={`unit-${unitId}`}
      noun="unit"
      testId="qc-record-photos"
    />
  );
}

/**
 * Failed's panel: records the fail once (an already failed unit is not
 * re-failed), then the vendor ticket with its remedy suggestion.
 */
function QcFailVerdictPanel({
  unit,
  steps,
  onRecorded,
}: {
  unit: SerialUnitRead;
  steps: readonly UnitQcStep[];
  onRecorded: () => void;
}) {
  const { stage } = qcUnitRecordState(unit);
  const alreadyFailed = stage === 'failed' || stage === 'ticket';
  const [state, setState] = useState<{ phase: 'recording' | 'recorded' } | { phase: 'error'; message: string }>(
    alreadyFailed ? { phase: 'recorded' } : { phase: 'recording' },
  );
  // One intent per panel open: a remount (Strict Mode) or retry records the fail once.
  const [clientEventId] = useState(safeRandomUUID);
  const posted = useRef(false);

  useEffect(() => {
    if (alreadyFailed || posted.current) return;
    posted.current = true;
    postQcVerdict(unit.id, 'TESTING_FAILED', { notes: null, clientEventId })
      .then(({ status }) => {
        setState({ phase: 'recorded' });
        toast.success(status ? `Failed — unit ${serialStatusLabel(status).toLowerCase()}` : 'Failed');
        onRecorded();
      })
      .catch((error: unknown) => setState({ phase: 'error', message: error instanceof Error ? error.message : 'Not recorded' }));
  }, [alreadyFailed, unit.id, clientEventId, onRecorded]);

  if (state.phase === 'error') return <EvidenceNotice tone="warn">The fail was not recorded — {state.message}</EvidenceNotice>;
  if (state.phase === 'recording') return <p className="text-role-caption text-mode-muted">Recording the fail…</p>;
  return <QcFailTicketPanel unit={unit} steps={steps} note="" onFiled={onRecorded} />;
}

export interface QcUnitRecord {
  model: RecordModel;
  verbs: RecordVerb[];
}

/**
 * The open unit's record + verbs: `record` is null until the unit resolves
 * (the plane shows its own loading), `error` says why it did not. `onRecorded`
 * lets the host re-read what a verdict moved (the bench's line, the labels list).
 */
export function useQcUnitRecord(
  unitId: number | null,
  { label = null, bench, onRecorded }: { label?: QcLabelRow | null; bench?: ReactNode; onRecorded?: () => void } = {},
): { record: QcUnitRecord | null; error: string | null } {
  const queryClient = useQueryClient();
  const ref = unitId != null ? String(unitId) : '';
  const read = useSerialUnit(ref);
  const unit = read.data?.serial_unit ?? null;
  const checklist = useUnitChecklist(unit?.sku_catalog_id != null ? unit.id : null);
  const [busy, setBusy] = useState<string | null>(null);

  if (!unit || !read.data || unitId == null) return { record: null, error: unitId != null && read.error ? read.error.message : null };
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: serialUnitQueryKey(ref) });
    onRecorded?.();
  };
  const { stage } = qcUnitRecordState(unit);
  const model = qcUnitRecordModel(
    { unit, events: read.data.events, label },
    { refresh, photos: <QcUnitPhotosDoor key={unit.id} unitId={unit.id} />, bench },
  );

  const verbs: RecordVerb[] = QC_VERDICTS.map((spec) => {
    const base = {
      id: spec.verdict === 'PASS' ? 'pass' : spec.verdict === 'TEST_AGAIN' ? 'test-again' : 'fail',
      label: spec.label,
      icon: VERDICT_ICON[spec.verdict],
      hotkey: spec.hotkey,
      tone: VERDICT_TONE[spec.verdict],
      pressed: stage === spec.stage,
    };
    if (spec.verdict === 'TESTING_FAILED') {
      return {
        ...base,
        panel: () => <QcFailVerdictPanel key={unit.id} unit={unit} steps={checklist.data ?? []} onRecorded={refresh} />,
      };
    }
    return {
      ...base,
      disabled: busy != null,
      disabledReason: 'Recording the verdict…',
      run: async () => {
        setBusy(spec.verdict);
        try {
          const { status } = await postQcVerdict(unit.id, spec.verdict, { notes: null, clientEventId: safeRandomUUID() });
          toast.success(status ? `${spec.ack} — unit ${serialStatusLabel(status).toLowerCase()}` : spec.ack);
          refresh();
        } catch (error) {
          toast.error(error instanceof Error ? error.message : 'Verdict not recorded');
        } finally {
          setBusy(null);
        }
      },
    };
  });
  return { record: { model, verbs }, error: null };
}
