/** **Reminders** — the one contract a task's "remind me" and a checklist item's due time reach the phone apps through (SwiftUI iOS, native… */

import { z } from 'zod';

/** Civil clock time in the warehouse zone, `HH:MM` (24h). */
export const CIVIL_TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Minutes-before-due a checklist reminder may ring. A day is the ceiling. */
export const REMIND_OFFSET_MAX_MINUTES = 1440;

/** The feed window a client may ask for. Two weeks of recurring checks is plenty. */
export const REMINDER_WINDOW_MAX_DAYS = 14;
export const REMINDER_WINDOW_DEFAULT_DAYS = 7;

export const REMINDER_SOURCES = ['task', 'checklist'] as const;
export type ReminderSource = (typeof REMINDER_SOURCES)[number];

export interface StaffReminder {
  /** Stable notification id — see the module doc. */
  id: string;
  source: ReminderSource;
  /** `work_assignments.id` or `daily_check_items.id`. */
  sourceId: number;
  /** Notification title — the task's words, or the checklist item's title. */
  title: string;
  /** Notification body — the record, the assigner, the due face. */
  body: string | null;
  /** ISO instant the work is due; null for a task with no deadline. */
  dueAt: string | null;
  /** ISO instant to ring. Always inside the requested window. */
  remindAt: string;
  urgent: boolean;
  /**
   * Same-origin path the notification opens. `/m/...` because a phone that
   * follows a desk route lands on a surface it cannot run (SURFACE_LAW §1).
   */
  deepLink: string;
}

export interface StaffRemindersPayload {
  data: {
    generatedAt: string;
    staffId: number;
    from: string;
    to: string;
    reminders: StaffReminder[];
  };
}

export const reminderFeedQuerySchema = z.object({
  /** ISO instant; defaults to now. */
  from: z.string().datetime({ offset: true }).optional(),
  /** Days past `from`; defaults to {@link REMINDER_WINDOW_DEFAULT_DAYS}. */
  days: z.coerce.number().int().min(1).max(REMINDER_WINDOW_MAX_DAYS).optional(),
});
export type ReminderFeedQuery = z.infer<typeof reminderFeedQuerySchema>;
