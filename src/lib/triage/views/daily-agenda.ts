/**
 * Daily (`/`) — the agenda as a triage card list (owner 2026-09-28: the Daily
 * page is a readable, triageable task list). Goal: see what needs doing today
 * and tick it off. One multi-row card per checklist item, task or ticket:
 * state rail + handle, title, then due · who · team / from · links and the next
 * action. Sections are the three stores, shown on the All lens only (a lens tab
 * names its store already). No face chips: All / Open / Done is the host's own
 * `?filter=` switch, the lens (`?tab=`) and scope (`?scope=`) are the page's.
 *
 * Not in `TRIAGE_VIEWS`: `home` is a page with no nav views, so there is no
 * `page.view` id to check.
 */

import type { TriageViewDecl } from '@/design-system/components/triage-card-list/triage-view';

export const DAILY_AGENDA_VIEW: TriageViewDecl = {
  id: 'home.agenda',
  grain: 'agenda item',
  noun: { one: 'item', many: 'items' },
  listLabel: 'Daily agenda',
  testIdPrefix: 'daily-row',
  bodyTestId: 'daily-ledger',
  storageKeys: { pageMode: 'cf:daily-rows:page-mode', scrollTop: 'cf:daily-rows:scroll-top' },
  recordParams: ['task', 'check'],
  chips: { owner: 'host', param: 'filter' },
  paging: 'client',
  status: 'state',
  facts: [
    { id: 'due', tier: 'always' },
    { id: 'who', tier: 'always' },
    { id: 'team', tier: 'always' },
    { id: 'links', tier: 'always' },
  ],
  sections: {
    order: ['checklist', 'task', 'ticket'],
    labels: { checklist: 'Daily checklist', task: 'Tasks', ticket: 'Tickets' },
    tones: {},
    when: 'always',
  },
  next: ['Check off', 'Start', 'Finish'],
};
