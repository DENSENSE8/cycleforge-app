/**
 * What one print job's row says under its title — pure, so each state's
 * words are pinned by a test. A counted run reads as numbers the row rolls
 * (`Printing 3 of 12`, `Paused · 3 of 12`); a settled one reads as a sentence
 * (`Printed 12 labels`, `Cancelled at 4 of 12`, the failure's own reason).
 */

import type { WorkItem } from '@/lib/background-work/store';

export type PrintJobTone = 'accent' | 'muted' | 'success' | 'danger';

export type PrintJobLine =
  | { kind: 'count'; lead: 'Printing' | 'Paused ·'; done: number; total: number; tone: PrintJobTone }
  | { kind: 'text'; text: string; tone: PrintJobTone };

export function printJobLine(item: WorkItem): PrintJobLine {
  const done = item.done ?? 0;
  const total = item.total !== undefined && item.total > 0 ? item.total : null;
  switch (item.status) {
    case 'running':
      return total !== null
        ? { kind: 'count', lead: 'Printing', done, total, tone: 'accent' }
        : { kind: 'text', text: 'Printing…', tone: 'accent' };
    case 'paused':
      return total !== null
        ? { kind: 'count', lead: 'Paused ·', done, total, tone: 'muted' }
        : { kind: 'text', text: 'Paused', tone: 'muted' };
    case 'done':
      return {
        kind: 'text',
        text: total !== null ? `Printed ${total} label${total === 1 ? '' : 's'}` : (item.message ?? 'Printed'),
        tone: 'success',
      };
    case 'cancelled':
      return { kind: 'text', text: total !== null ? `Cancelled at ${done} of ${total}` : 'Cancelled', tone: 'muted' };
    case 'failed':
      return { kind: 'text', text: item.message ?? 'Print failed', tone: 'danger' };
  }
}

/** The row's title: the thing printed (the FNSKU when the job names one), then where it went. */
export function printJobTitle(item: WorkItem): string {
  const subject = item.detail ?? item.label;
  return item.target ? `${subject} → ${item.target}` : subject;
}
