/** The published OpenAPI projection of `GET /api/v1/reminders`. */

import {
  REMINDER_SOURCES,
  REMINDER_WINDOW_DEFAULT_DAYS,
  REMINDER_WINDOW_MAX_DAYS,
} from './reminder-contract';

const nullableString = { type: ['string', 'null'] };
const nullableInstant = { type: ['string', 'null'], format: 'date-time' };

export function buildReminderFeedComponents(): Record<string, unknown> {
  return {
    StaffReminder: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'source', 'sourceId', 'title', 'body', 'dueAt', 'remindAt', 'urgent', 'deepLink'],
      properties: {
        id: {
          type: 'string',
          description: 'Stable notification id: `task:<id>` or `checklist:<itemId>:<YYYY-MM-DD>`. Use it as the local notification identifier.',
        },
        source: { type: 'string', enum: [...REMINDER_SOURCES] },
        sourceId: { type: 'integer', description: 'work_assignments.id or daily_check_items.id' },
        title: { type: 'string' },
        body: nullableString,
        dueAt: { ...nullableInstant, description: 'When the work is due; null for a task with no deadline.' },
        remindAt: { type: 'string', format: 'date-time', description: 'When to ring. Always inside the requested window.' },
        urgent: { type: 'boolean' },
        deepLink: { type: 'string', description: 'Same-origin /m/... path the notification opens.' },
      },
    },
    StaffRemindersPayload: {
      type: 'object',
      additionalProperties: false,
      required: ['data'],
      properties: {
        data: {
          type: 'object',
          additionalProperties: false,
          required: ['generatedAt', 'staffId', 'from', 'to', 'reminders'],
          properties: {
            generatedAt: { type: 'string', format: 'date-time' },
            staffId: { type: 'integer' },
            from: { type: 'string', format: 'date-time' },
            to: { type: 'string', format: 'date-time' },
            reminders: { type: 'array', items: { $ref: '#/components/schemas/StaffReminder' } },
          },
        },
      },
    },
  };
}

export function buildReminderFeedOpenApi(): Record<string, unknown> {
  return {
    '/api/v1/reminders': {
      get: {
        description:
          "The caller's task and checklist reminders in [from, from + days), sorted by remindAt. Clients schedule LOCAL notifications and replace every pending one whose id is no longer in the feed. Task reminders are included only when the session holds work_orders.claim.",
        parameters: [
          { name: 'from', in: 'query', required: false, description: 'ISO instant; defaults to now.', schema: { type: 'string', format: 'date-time' } },
          { name: 'days', in: 'query', required: false, schema: { type: 'integer', minimum: 1, maximum: REMINDER_WINDOW_MAX_DAYS, default: REMINDER_WINDOW_DEFAULT_DAYS } },
        ],
        responses: {
          '200': {
            description: "The session staffer's reminders",
            content: { 'application/json': { schema: { $ref: '#/components/schemas/StaffRemindersPayload' } } },
          },
          '400': { description: 'Invalid from or days', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '401': { description: 'Authenticated device or session required' },
        },
      },
    },
  };
}
