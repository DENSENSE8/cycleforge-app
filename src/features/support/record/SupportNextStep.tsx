'use client';

/**
 * After a customer reply goes out (sent, logged, or a copy marked sent): what
 * happens next — Waiting for customer (an optional reminder day, so the wait
 * comes due if they never answer), Follow up later (a day, warehouse morning),
 * or Resolve (the guarded resolve flow below the thread).
 */

import { useState } from 'react';
import { BellOff, CalendarClock, CheckCircle2, Hourglass } from 'lucide-react';
import { Button } from '@/design-system/primitives/Button';
import { DateRangePickerField } from '@/design-system/components/DateRangePickerField';
import { TASK_DUE_PRESETS } from '@/lib/tasks/task-due';
import { addDaysToDateKey, dateKeyToLocalDate, getCurrentPSTDateKey, localDateToDateKey, warehouseCivilTimeToInstant } from '@/utils/date';
import { toast } from '@/lib/toast';
import { supportNextStepPatch } from '@/lib/support/record/support-record-model';
import { useSupportItemActions } from '@/lib/support/record/use-support-item';

/** A follow-up or reminder starts the warehouse morning (the Timeline's Log row uses the same hour). */
const FOLLOW_UP_TIME = '09:00';

/** Waiting reminders — read at click time, so a record left open past midnight still counts from today. */
const WAITING_REMINDER_PRESETS: ReadonlyArray<{ label: string; day: () => Date }> = [
  { label: 'Tomorrow', day: () => dateKeyToLocalDate(addDaysToDateKey(getCurrentPSTDateKey(), 1)) ?? new Date() },
  { label: 'In 3 days', day: () => dateKeyToLocalDate(addDaysToDateKey(getCurrentPSTDateKey(), 3)) ?? new Date() },
  { label: 'Next week', day: () => dateKeyToLocalDate(addDaysToDateKey(getCurrentPSTDateKey(), 7)) ?? new Date() },
];

type DayStep = 'waiting_customer' | 'follow_up_later';

export function SupportNextStep({
  supportItemId,
  onResolve,
}: {
  supportItemId: number;
  /** Resolve opens the guarded resolve flow. A chosen step settles the choice in the actions hook (next-step-store). */
  onResolve: () => void;
}) {
  const { setNextStep } = useSupportItemActions(supportItemId);
  const [picking, setPicking] = useState<DayStep | null>(null);

  const commit = (choice: DayStep, followUpAtIso: string | null) => {
    const request = supportNextStepPatch(choice, followUpAtIso);
    if (!request.ok) {
      toast.error(request.error);
      return;
    }
    setNextStep.mutate(request.body, { onError: (err) => toast.error(err.message) });
  };
  const morningOf = (day: Date) => {
    const key = localDateToDateKey(day);
    return key ? (warehouseCivilTimeToInstant(key, FOLLOW_UP_TIME)?.toISOString() ?? null) : null;
  };
  const saving = (step: DayStep) => setNextStep.isPending && setNextStep.variables?.nextStep === step;

  return (
    <section aria-label="Next step" className="flex flex-col gap-2 rounded-2xl border border-border-soft bg-surface-card p-3" data-testid="support-next-step">
      <p className="text-role-data font-semibold text-text-default">Reply recorded. What happens next?</p>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          icon={<Hourglass aria-hidden />}
          onClick={() => setPicking((open) => (open === 'waiting_customer' ? null : 'waiting_customer'))}
          data-testid="support-next-step-waiting"
        >
          Waiting for customer
        </Button>
        <Button
          variant="secondary"
          size="sm"
          icon={<CalendarClock aria-hidden />}
          onClick={() => setPicking((open) => (open === 'follow_up_later' ? null : 'follow_up_later'))}
          data-testid="support-next-step-follow-up"
        >
          Follow up later
        </Button>
        <Button variant="successSoft" size="sm" icon={<CheckCircle2 aria-hidden />} onClick={onResolve} data-testid="support-next-step-resolve">
          Resolve
        </Button>
      </div>
      {picking === 'waiting_customer' ? (
        <div className="flex flex-wrap items-center gap-2" data-testid="support-next-step-waiting-reminder">
          <DateRangePickerField
            key="waiting"
            variant="compact"
            value={undefined}
            presets={WAITING_REMINDER_PRESETS}
            onChange={(day) => commit('waiting_customer', morningOf(day))}
            faceLabel="Remind me on…"
            ariaLabel="Reminder day if the customer has not answered"
            className="h-8 w-auto min-w-36"
          />
          <Button
            variant="ghost"
            size="sm"
            icon={<BellOff aria-hidden />}
            loading={saving('waiting_customer')}
            onClick={() => commit('waiting_customer', null)}
            data-testid="support-next-step-waiting-no-reminder"
          >
            No reminder
          </Button>
        </div>
      ) : null}
      {picking === 'follow_up_later' ? (
        <div className="flex items-center gap-2" data-testid="support-next-step-date">
          <DateRangePickerField
            key="follow-up"
            variant="compact"
            value={undefined}
            presets={TASK_DUE_PRESETS}
            onChange={(day) => commit('follow_up_later', morningOf(day))}
            faceLabel="Pick the follow-up day"
            ariaLabel="Follow-up day"
            className="h-8 w-auto min-w-36"
          />
          {saving('follow_up_later') ? <span className="text-role-caption text-text-muted">Saving…</span> : null}
        </div>
      ) : null}
    </section>
  );
}
