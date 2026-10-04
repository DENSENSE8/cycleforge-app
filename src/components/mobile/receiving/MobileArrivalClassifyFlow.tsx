'use client';

/** Arrival door classify — Platform → Type → Priority bottom sheets. */

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from '@/lib/toast';
import { Sheet, SheetBody, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ProgressDots } from '@/components/mobile/ProgressDots';
import { Button, IconButton } from '@/design-system/primitives';
import { ModeRegion } from '@/design-system/providers/ModeRegion';
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
  type ArrivalTypeHint,
} from '@/lib/receiving/arrival-mobile-flow';
import { previousMobilePath } from '@/lib/mobile/nav-trail';
import { cn } from '@/utils/_cn';
import type { InlinePillOption } from '@/components/receiving/workspace/line-edit/InlinePillPicker';

const STEP_TITLE: Record<ArrivalClassifyStep, string> = {
  platform: 'Platform',
  type: 'Type',
  priority: 'Priority',
};

export function MobileArrivalClassifyFlow({
  receivingId,
  step,
  trackingLabel,
  typeHint = null,
  stepHref,
  exit,
}: {
  receivingId: number;
  step: ArrivalClassifyStep;
  trackingLabel?: string | null;
  /**
   * The decision the row verb carried in (Return / Repair). Pre-selected on
   * the Type step, never saved without the operator's tap.
   */
  typeHint?: ArrivalTypeHint | null;
  /** The host's URL for a step. Default: the `/m/scan` classify host. */
  stepHref?: (step: ArrivalClassifyStep) => string;
  /** Where escape and the last step land, and what the escape button says. Default: `/m/scan`. */
  exit?: { href: string; label: string };
}) {
  const router = useRouter();
  const { options: platformOpts } = usePlatformCatalog();
  const { options: typeOpts } = useReceivingTypeCatalog();
  const [saving, setSaving] = useState(false);
  const [pickedPlatform, setPickedPlatform] = useState<string | null>(null);
  const [pickedType, setPickedType] = useState<string | null>(null);
  const exitHref = exit?.href ?? '/m/scan';

  // Back, not forward, when the operator came from the exit (the carton hub's
  // Classify door): a replace would leave hub · hub on the stack and the hub's
  // X would pop onto its own copy (nav-trail; same rule as MobileDetailTopBar).
  const goList = useCallback(() => {
    if (previousMobilePath() === exitHref.split(/[?#]/)[0]) router.back();
    else router.replace(exitHref);
  }, [router, exitHref]);

  const goStep = useCallback(
    (next: ArrivalClassifyStep) => {
      router.replace(stepHref ? stepHref(next) : mobileArrivalClassifyHref(receivingId, next, { type: typeHint }));
    },
    [router, receivingId, typeHint, stepHref],
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
        // Mode vars, not raw slate: the chip paints in whichever mode the
        // region resolves to triage on every device.
        autoActiveClass: 'border-mode-rule bg-mode-well text-mode-ink',
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
          className="flex aspect-square min-h-mode-hit shrink-0 items-center justify-center rounded-mode border border-border-soft bg-surface-card text-text-soft"
        />
        <div className="min-w-0 flex-1">
          <p className="text-role-micro text-text-muted">
            Classify
          </p>
          <p className="truncate text-mode-body font-semibold text-text-primary">
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
        <Button variant="ghost" size="lg" radius="mode" onClick={goList} className="mb-3 min-h-mode-hit text-text-muted">
          {exit?.label ?? 'Back to scan'}
        </Button>
      </div>

      <Sheet open onOpenChange={(next) => { if (!next) goList(); }}>
        <SheetContent side="bottom" aria-describedby={undefined}>
          <SheetHeader className="shrink-0 border-b border-mode-rule px-mode-page py-3 pr-12">
            <SheetTitle>{STEP_TITLE[step]}</SheetTitle>
          </SheetHeader>
          <SheetBody>
            {/* The sheet portals out of the page's ModeRegion; re-declare triage so
                the mode radius / padding / hit tokens resolve inside the sheet. */}
            <ModeRegion mode="triage" className="space-y-3 px-1 pb-2">
              <p className="text-role-caption text-text-muted">
                Step {stepIndex + 1} of {ARRIVAL_CLASSIFY_STEPS.length} · tap to save and continue
              </p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {options.map((opt) => {
                  // The row verb's decision, marked as the selection: a 2px INK
                  // outline, never a coloured one (BRIEF §4/§5).
                  const hinted = step === 'type' && typeHint != null && opt.value.toUpperCase() === typeHint;
                  return (
                    // ds-allow-title — option face already shows the label; native title is the longer hint.
                    <button
                      key={opt.value || opt.label}
                      type="button"
                      disabled={saving}
                      onClick={() => void onPick(opt.value)}
                      title={opt.title}
                      aria-pressed={step === 'type' ? hinted : undefined}
                      className={cn(
                        'ds-raw-button flex min-h-14 flex-col items-center justify-center gap-1 rounded-mode border px-2 py-3 text-center transition-opacity duration-mode-feedback active:opacity-80 disabled:opacity-50',
                        opt.inactiveClass,
                        hinted && 'outline outline-2 -outline-offset-2 outline-text-default',
                      )}
                      style={opt.inactiveStyle}
                    >
                      <span className="flex h-6 items-center justify-center">{opt.face}</span>
                      <span className="text-role-caption font-semibold">{opt.label}</span>
                    </button>
                  );
                })}
              </div>
              {nextArrivalClassifyStep(step) ? (
                <p className="text-center text-role-micro text-text-faint">
                  Next · {STEP_TITLE[nextArrivalClassifyStep(step)!]}
                </p>
              ) : (
                <p className="text-center text-role-micro text-text-faint">
                  Finishes arrival for this carton
                </p>
              )}
            </ModeRegion>
          </SheetBody>
        </SheetContent>
      </Sheet>
    </div>
  );
}
