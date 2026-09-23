/**
 * THE AUTOMATION CATALOG — what runs by itself in this warehouse.
 *
 * Operator ruling 2026-09-23: *"The cron drop to assign tasks from designated
 * tags should be included in the automations display in the sidebar as a first
 * principles approach to automations."*
 *
 * First principles: an operator asking "what runs without me?" wants five
 * answers per automation, and nothing else —
 *
 *   | Field        | The question it answers                      |
 *   |--------------|----------------------------------------------|
 *   | `name`       | what is it called?                           |
 *   | `summary`    | what does it do, in one sentence?            |
 *   | `trigger`    | WHEN does it fire — a clock, or an event?    |
 *   | `scope`      | WHAT does it act on?                         |
 *   | `gate`       | what turns it ON?                            |
 *   | `permission` | who may see it?                              |
 *
 * This module is PURE DATA + pure functions. No React, no fetch, no DB. The
 * live half — health, last run, run counters — is joined at the surface from
 * `/api/cron-runs` through {@link useCronRunsSummary}, keyed on
 * `trigger.jobKey`. Keeping the two halves apart is the point: the catalog says
 * what an automation IS, the runs API says how it last WENT.
 *
 * `jobKey` is not free text — `automation-catalog.test.ts` pins every
 * cron-triggered entry against `CRON_JOBS`, so deleting a job from the cron
 * registry fails the catalog rather than painting a row that can never be green.
 */

/** When an automation fires. A clock, or something that happened. */
export type AutomationTrigger =
  | {
      kind: 'cron';
      /** Key in `CRON_JOBS` / `cron_runs.job` — the join onto live health. */
      jobKey: string;
      /** Cadence in operator words (e.g. "Every 15 minutes"). */
      cadence: string;
    }
  | {
      kind: 'event';
      /** The domain event that fires it (e.g. `order.item_number_set`). */
      on: string;
    };

export interface AutomationDef {
  /** Stable catalog id. Unique across the catalog. */
  id: string;
  name: string;
  /** One sentence, operator words — what it does, not how. */
  summary: string;
  trigger: AutomationTrigger;
  /** What it acts on — the population it reads. */
  scope: string;
  /** What turns it on. "Always on for …" when there is no switch. */
  gate: string;
  /** Permission a viewer needs to see this row. */
  permission: string;
  /** Where its rules / config live, when it HAS any. Omitted = rule is code. */
  href?: string;
}

export const AUTOMATION_CATALOG: readonly AutomationDef[] = [
  {
    id: 'tickets.designated-assign',
    name: 'Designated-tag ticket assign',
    summary:
      'A Zendesk ticket tagged for a staffer turns into a follow-up task for that staffer.',
    trigger: { kind: 'cron', jobKey: 'tickets.designated_assign', cadence: 'Every 15 minutes' },
    scope:
      'Zendesk tickets tagged designated_<staff> (also designated-<staff> or designated:<staff>, any case), matched against a staffer’s first name or email local-part. A tag that fits two staffers is skipped, never guessed, and one ticket only ever raises one task.',
    gate: 'Always on for any org with an active Zendesk integration — there is no per-org switch.',
    permission: 'studio.view',
  },
  {
    id: 'listings.staff-rules',
    name: 'Listing → staff assignment',
    summary:
      'When an order gets its item number, the saved rule for that listing assigns its tester and packer.',
    trigger: { kind: 'event', on: 'order.item_number_set' },
    scope:
      'Orders whose item number matches a saved listing rule. Rules are written from the to-ship selection on the orders desk.',
    gate: 'On per rule — each listing rule is created, enabled and disabled by hand.',
    permission: 'admin.manage_features',
    href: '/api/automations/rules',
  },
];

/** The catalog split by how each automation fires. */
export function automationsByTrigger(
  catalog: readonly AutomationDef[] = AUTOMATION_CATALOG,
): { cron: AutomationDef[]; event: AutomationDef[] } {
  const cron: AutomationDef[] = [];
  const event: AutomationDef[] = [];
  for (const automation of catalog) {
    (automation.trigger.kind === 'cron' ? cron : event).push(automation);
  }
  return { cron, event };
}

/** The automation a cron job key belongs to, if the catalog claims that job. */
export function automationForCronJob(
  jobKey: string,
  catalog: readonly AutomationDef[] = AUTOMATION_CATALOG,
): AutomationDef | undefined {
  return catalog.find((a) => a.trigger.kind === 'cron' && a.trigger.jobKey === jobKey);
}
