/**
 * Every triage view, keyed by its nav id (`page.view`). One file per view;
 * `triage-views.test.ts` checks each against the nav's view and saved-view
 * declarations (`NAV_PAGE_DECLS`).
 */

import type { TriageViewDecl, TriageViewId } from '@/design-system/components/triage-card-list/triage-view';
import { INCOMING_DOCKED_VIEW } from './incoming-docked';
import { INCOMING_PIPELINE_VIEW } from './incoming-pipeline';
import { LABEL_INTAKE_LABELS_VIEW, LABEL_INTAKE_PAPERWORK_VIEW, LABEL_INTAKE_PRINTED_VIEW } from './label-intake';
import { OUTBOUND_TRIAGE_VIEW } from './outbound-triage';

export {
  INCOMING_DOCKED_VIEW,
  INCOMING_PIPELINE_VIEW,
  LABEL_INTAKE_LABELS_VIEW,
  LABEL_INTAKE_PAPERWORK_VIEW,
  LABEL_INTAKE_PRINTED_VIEW,
  OUTBOUND_TRIAGE_VIEW,
};

export const TRIAGE_VIEWS: Readonly<Record<TriageViewId, TriageViewDecl>> = Object.fromEntries(
  [
    OUTBOUND_TRIAGE_VIEW,
    INCOMING_PIPELINE_VIEW,
    INCOMING_DOCKED_VIEW,
    LABEL_INTAKE_LABELS_VIEW,
    LABEL_INTAKE_PAPERWORK_VIEW,
    LABEL_INTAKE_PRINTED_VIEW,
  ].map((view) => [view.id, view]),
);
