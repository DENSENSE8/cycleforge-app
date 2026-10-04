import type { DueTone } from '@/lib/task-board/task-board-model';

/** 11px due text at WCAG AA (≥4.5:1 on the card): -700 inks in light, -300 in dark. The urgency group headings wear them too. */
export const DUE_TONE_CLASS: Readonly<Record<DueTone, string>> = {
  late: 'font-bold text-red-700 dark:text-red-300',
  today: 'font-bold text-orange-700 dark:text-orange-300',
  // Owner 2026-09-29: tomorrow is urgent too — orange, never a calm blue.
  soon: 'font-semibold text-orange-700 dark:text-orange-300',
  calm: 'font-medium text-text-default',
};
