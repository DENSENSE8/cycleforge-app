/**
 * Exceptions — the hub list (`/exceptions`) and every lane door that renders
 * it locked (owner 2026-09-28: one list, two doors). Goal: see WHY each record
 * is blocked and resolve it without leaving. One card per exception; line 1
 * reads the tag (why, danger / warning pill) → the blocked entity → the kind
 * … the resolve verb and when it was raised; the evidence line is the fact.
 * Kind chips write `?kind=` (one at a time — the server narrows; the hub's
 * `counts` are the chips' counts).
 *
 * Not in `TRIAGE_VIEWS`: the hub's nav children are domain / kind SCOPES of
 * this one list (`?domain=&kind=`), not views of a page.
 */

import type { TriageViewDecl } from '@/design-system/components/triage-card-list/triage-view';
import { EXCEPTION_KIND_PARAM, EXCEPTION_RECORD_PARAM } from '@/lib/exceptions/types';

export const EXCEPTIONS_VIEW: TriageViewDecl = {
  id: 'exceptions.list',
  grain: 'exception',
  noun: { one: 'exception', many: 'exceptions' },
  listLabel: 'Exceptions',
  testIdPrefix: 'exception-card',
  bodyTestId: 'exception-cards',
  storageKeys: { pageMode: 'cf:exception-cards:page-mode', scrollTop: 'cf:exception-cards:scroll-top' },
  recordParams: [EXCEPTION_RECORD_PARAM],
  chips: { owner: 'face', param: EXCEPTION_KIND_PARAM },
  paging: 'client',
  status: 'date',
  facts: [{ id: 'detail', tier: 'always' }],
  sections: null,
  next: [],
};
