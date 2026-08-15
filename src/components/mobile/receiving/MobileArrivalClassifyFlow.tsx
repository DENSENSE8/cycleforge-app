'use client';

/**
 * Arrival door classify — Platform → Type → Priority bottom sheets.
 *
 * Options come from desktop classify SoTs (`classify-pill-options` + catalogs).
 * Persist mirrors desktop: PATCH receiving for platform/type, receiving-logs for
 * priority_tier. Back/list escape clears to `/m/triage`.
 */

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from '@/lib/toast';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { ProgressDots } from '@/components/mobile/ProgressDots';
import { Button, IconButton } from '@/design-system/primitives';
import { ChevronLeft } from '@/components/Icons';
import {
  platformClassifyOptions,
  typeClassifyOptions,
  urgencyClassifyOptions,
} from '@/components/receiving/workspace/line-edit/classify-pill-options';
import { usePlatformCatalog, useReceivingTypeCatalog } from '@/hooks/useCatalog';
import { returnPlatformForSource } from '@/lib/receiving/return-platform-for-source';
import {
  ARRIVAL_CLASSIFY_STEPS,
  arrivalClassifyStepIndex,
  mobileArrivalClassifyHref,
  nextArrivalClassifyStep,
  prevArrivalClassifyStep,
  type ArrivalClassifyStep,
} from '@/lib/receiving/arrival-mobile-flow';
import type { InlinePillOption } from '@/components/receiving/workspace/line-edit/InlinePillPicker';
import {
  IDENTITY_PILL_NEUTRAL_IDLE,
} from '@/components/ui/IdentityLabelRow';

const STEP_TITLE: Record<ArrivalClassifyStep, string> = {
  platform: 'Platform',
  type: 'Type',
  priority: 'Priority',
};

export function MobileArrivalClassifyFlow({
  receivingId,
  step,
  trackingLabel,
}: {
  receivingId: number;
  step: ArrivalClassifyStep;
  trackingLabel?: string | null;
}) {
  const router = useRouter();
  const { options: platformOpts } = usePlatformCatalog();
  const { options: typeOpts } = useReceivingTypeCatalog();
  const [saving, setSaving] = useState(false);
  const [pickedPlatform, setPickedPlatform] = useState<string | null>(null);
  const [pickedType, setPickedType] = useState<string | null>(null);

  const goList = useCallback(() => {
    router.replace('/m/triage');
  }, [router]);

  const goStep = useCallback(
    (next: ArrivalClassifyStep) => {
      router.replace(mobileArrivalClassifyHref(receivingId, next));
    },
    [router, receivingId],
  );

  const onBack = useCallback(() => {
    const prev = prevArrivalClassifyStep(step);
    if (prev) goStep(prev);
    else goList();
  }, [step, goStep, goList]);

  const platformOptions = useMemo(
    () =>
      platformClassifyOptions({
        catalogOptions: platformOpts,
        isUnmatched: false,
      }).filter((o) => o.value !== ''),
    [platformOpts],
  );

  const typeOptions = useMemo(
    () => typeClassifyOptions({ catalogOptions: typeOpts }),
    [typeOpts],
  );

  const priorityOptions = useMemo(
    () =>
      urgencyClassifyOptions({
        derivedLabel: 'platform',
        derivedTierEquivalent: null,
        autoActiveClass:
          'border-slate-200 bg-slate-50 text-slate-700 shadow-sm', // ds-allow-raw-neutral: Auto face
      }),
    [],
  );

  const persistPlatform = useCallback(
    async (value: string) => {
      setSaving(true);
      try {
        const payload: Record<string, unknown> = {
          source_platform: value || null,
        };
        // If type was already RETURN in a resume, stamp return columns.
        if (pickedType === 'RETURN' && value) {
          const rp = returnPlatformForSource(value);
          if (rp) {
            payload.return_platform = rp;
            payload.is_return = true;
          }
        }
        const res = await fetch(`/api/receiving/${receivingId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          toast.error('Could not save platform');
          return false;
        }
        setPickedPlatform(value);
        return true;
      } catch {
        toast.error('Could not save platform');
        return false;
      } finally {
        setSaving(false);
      }
    },
    [receivingId, pickedType],
  );

  const persistType = useCallback(
    async (value: string) => {
      setSaving(true);
      try {
        const norm = (value || 'PO').toUpperCase();
        const payload: Record<string, unknown> = {
          intake_type: norm,
          is_return: norm === 'RETURN',
        };
        if (norm === 'RETURN' && pickedPlatform) {
          const rp = returnPlatformForSource(pickedPlatform);
          if (rp) payload.return_platform = rp;
        }
        const res = await fetch(`/api/receiving/${receivingId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          toast.error('Could not save type');
          return false;
        }
        setPickedType(norm);
        return true;
      } catch {
        toast.error('Could not save type');
        return false;
      } finally {
        setSaving(false);
      }
    },
    [receivingId, pickedPlatform],
  );

  const persistPriority = useCallback(
    async (raw: string) => {
      setSaving(true);
      try {
        const next = raw === 'auto' ? null : Number(raw);
        if (raw !== 'auto' && !Number.isFinite(next)) {
          toast.error('Invalid priority');
          return false;
        }
        const res = await fetch('/api/receiving-logs', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: receivingId, priority_tier: next }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data?.success) {
          toast.error(data?.error || 'Could not save priority');
          return false;
        }
        return true;
      } catch {
        toast.error('Could not save priority');
        return false;
      } finally {
        setSaving(false);
      }
    },
    [receivingId],
  );

  const onPick = useCallback(
    async (value: string) => {
      if (saving) return;
      if (step === 'platform') {
        const ok = await persistPlatform(value);
        if (ok) goStep('type');
        return;
      }
      if (step === 'type') {
        const ok = await persistType(value);
        if (ok) goStep('priority');
        return;
      }
      const ok = await persistPriority(value);
      if (ok) {
        toast.success('Arrival classified', { position: 'top-center' });
        goList();
      }
    },
    [saving, step, persistPlatform, persistType, persistPriority, goStep, goList],
  );

  const options: InlinePillOption[] =
    step === 'platform'
      ? platformOptions
      : step === 'type'
        ? typeOptions
        : priorityOptions;

  const stepIndex = arrivalClassifyStepIndex(step);

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-surface-canvas">
      <div className="flex shrink-0 items-center gap-3 border-b border-border-soft bg-surface-card/90 px-4 py-3">
        <IconButton
          onClick={onBack}
          ariaLabel="Back"
          icon={<ChevronLeft className="h-5 w-5" />}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-blue-100 bg-surface-card text-blue-500 shadow-sm"
        />
        <div className="min-w-0 flex-1">
          <p className="text-role-micro uppercase tracking-widest text-text-muted">
            Arrival · classify
          </p>
          <p className="truncate text-sm font-semibold text-text-primary">
            {trackingLabel?.trim() || `RCV-${receivingId}`}
          </p>
        </div>
        <ProgressDots
          done={stepIndex}
          total={ARRIVAL_CLASSIFY_STEPS.length}
          ariaLabel={`Classify step ${stepIndex + 1} of ${ARRIVAL_CLASSIFY_STEPS.length}`}
        />
      </div>

      <div className="flex flex-1 flex-col items-center justify-end px-4 pb-6 pt-8">
        <Button variant="ghost" size="sm" onClick={goList} className="mb-3 text-text-muted">
          Back to arrivals
        </Button>
      </div>

      <BottomSheet
        open
        onClose={goList}
        title={STEP_TITLE[step]}
        forceVariant="sheet"
        dragDisabled={saving}
      >
        <div className="space-y-3 px-1 pb-2">
          <p className="text-role-caption text-text-muted">
            Step {stepIndex + 1} of {ARRIVAL_CLASSIFY_STEPS.length} · tap to save and continue
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {options.map((opt) => (
              // ds-allow-title — option face already shows the label; native title is the longer hint.
              <button
                key={opt.value || opt.label}
                type="button"
                disabled={saving}
                onClick={() => void onPick(opt.value)}
                title={opt.title}
                className={`ds-raw-button flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl border px-2 py-3 text-center transition-all active:scale-[0.98] disabled:opacity-50 ${opt.inactiveClass ?? IDENTITY_PILL_NEUTRAL_IDLE}`}
                style={opt.inactiveStyle}
              >
                <span className="flex h-6 items-center justify-center">{opt.face}</span>
                <span className="text-role-caption font-semibold text-black">{opt.label}</span>
              </button>
            ))}
          </div>
          {nextArrivalClassifyStep(step) ? (
            <p className="text-center text-role-micro uppercase tracking-wider text-text-faint">
              Next · {STEP_TITLE[nextArrivalClassifyStep(step)!]}
            </p>
          ) : (
            <p className="text-center text-role-micro uppercase tracking-wider text-text-faint">
              Finishes arrival for this carton
            </p>
          )}
        </div>
      </BottomSheet>
    </div>
  );
}
