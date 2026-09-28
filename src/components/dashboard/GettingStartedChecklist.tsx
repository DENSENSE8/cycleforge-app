'use client';

/** Getting-Started checklist — the read-time activation checklist (onboarding-foundational-plan §4/§7, O2). */

import Link from 'next/link';
import { useOnboardingStats } from '@/hooks/useOnboardingStats';
import { useAuth } from '@/contexts/AuthContext';
import { useEntitlements } from '@/hooks/useEntitlements';
import { useStaffPreferences } from '@/hooks/useStaffPreferences';
import { IconButton } from '@/design-system/primitives';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { Check, ChevronRight, ClipboardList, X } from '@/components/Icons';
import { completedStepCount, stepsForEntitlements } from '@/lib/onboarding/steps';

const EYEBROW = 'text-role-eyebrow text-text-accent';

/**
 * Permission gate. The data-owning inner component mounts only behind
 * `dashboard.view`, so the stats query never fetches for a user without it.
 */
type ChecklistVariant = 'band' | 'sidebar' | 'pane';

export function GettingStartedChecklist({ variant = 'band' }: { variant?: ChecklistVariant }) {
  const { isLoaded, has } = useAuth();
  if (!isLoaded || !has('dashboard.view')) return null;
  return <GettingStartedChecklistInner variant={variant} />;
}

function GettingStartedChecklistInner({ variant }: { variant: ChecklistVariant }) {
  const entitlements = useEntitlements();
  const { prefs, isLoading: prefsLoading, update } = useStaffPreferences();

  // Shared with the To-ship queue's first-run gate — one query, one answer.
  const { data, isLoading, isError } = useOnboardingStats();

  // Quiet card: while loading, on error, or once dismissed, render nothing —
  // the dashboard never shows a spinner or an error box for an optional nudge.
  if (isLoading || isError || !data || prefsLoading) return null;
  if (prefs?.onboardingDismissed) return null;

  const steps = stepsForEntitlements(entitlements);
  const completed = completedStepCount(steps, data);

  // Self-dismisses at 100% — activation reached, no permanent chrome.
  if (steps.length === 0 || completed >= steps.length) return null;

  const pct = Math.round((completed / steps.length) * 100);

  const isCompact = variant === 'sidebar' || variant === 'pane';

  return (
    <section
      className={
        isCompact
          ? variant === 'pane'
            ? ''
            : 'bg-surface-card'
          : 'shrink-0 border-b border-border-hairline bg-surface-card px-4 py-3'
      }
      aria-label="Getting started checklist"
    >
      <div
        className={`rounded-none border border-border-hairline bg-surface-card ${
          variant === 'pane' ? 'px-4 py-3' : isCompact ? 'px-3 py-3' : 'px-5 py-4'
        }`}
      >
        {/* Eyebrow header: title left, progress + skip right. */}
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5">
            <ClipboardList className="h-3.5 w-3.5 text-text-accent" />
            <span className={EYEBROW}>Getting started</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="text-role-eyebrow leading-none text-text-soft tabular-nums">
              {completed}/{steps.length}
            </span>
            <HoverTooltip label="Skip for now" focusable={false}>
              <IconButton
                type="button"
                ariaLabel="Skip getting-started checklist for now"
                onClick={() => update({ onboardingDismissed: true })}
                icon={<X className="h-3.5 w-3.5 text-text-faint" />}
                className="-my-1 flex h-6 w-6 items-center justify-center rounded-md hover:bg-surface-hover"
              />
            </HoverTooltip>
          </span>
        </div>

        {/* Progress rule — % set up. */}
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface-sunken">
          <div
            className="h-full rounded-full bg-accent-bg transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>

        {/* Linear step list — one row per step, dividers not gaps. */}
        <div className="mt-1.5 divide-y divide-border-hairline">
          {steps.map((step) => {
            const done = step.doneWhen(data);
            if (done) {
              return (
                <div key={step.id} className="flex items-center gap-2 py-1.5">
                  <Check className="h-3.5 w-3.5 shrink-0 text-text-success" />
                  <span className="truncate text-role-caption font-semibold text-text-faint">
                    {step.label}
                  </span>
                </div>
              );
            }
            return (
              <Link
                key={step.id}
                href={step.href}
                className="group flex items-center gap-2 py-1.5 hover:bg-surface-hover"
              >
                <span
                  aria-hidden
                  className="h-3.5 w-3.5 shrink-0 rounded-full ring-1 ring-inset ring-border-soft"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-role-caption font-semibold text-text-default">
                    {step.label}
                  </span>
                  <span className="block truncate text-role-eyebrow font-semibold text-text-soft">
                    {step.description}
                  </span>
                </span>
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-text-faint transition-transform group-hover:translate-x-0.5" />
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
