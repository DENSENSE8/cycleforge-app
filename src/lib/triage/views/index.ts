/**
 * Every triage view, keyed by its nav id (`page.view`). One file per view;
 * `triage-views.test.ts` checks each against the nav's view and saved-view
 * declarations (`NAV_PAGE_DECLS`).
 */

import type { TriageViewDecl, TriageViewId } from '@/design-system/components/triage-card-list/triage-view';
import { DAILY_AGENDA_VIEW } from './daily-agenda';
import { EXCEPTIONS_VIEW } from './exceptions';
import { INCOMING_DOCKED_VIEW } from './incoming-docked';
import { INCOMING_UNBOXED_VIEW } from './incoming-unboxed';
import { INCOMING_PIPELINE_VIEW } from './incoming-pipeline';
import { IMPORT_ROWS_VIEW, IMPORT_RUNS_VIEW } from './imports';
import { INVENTORY_REPLENISH_VIEW } from './inventory-replenish';
import { INVENTORY_STOCK_VIEW } from './inventory-stock';
import {
  LABEL_INTAKE_LABELS_VIEW,
  LABEL_INTAKE_PAPERWORK_VIEW,
  LABEL_INTAKE_PRINTED_VIEW,
  LABEL_INTAKE_UPLOADS_VIEW,
} from './label-intake';
import { OUTBOUND_SHIPPED_VIEW } from './outbound-shipped';
import { OUTBOUND_TRIAGE_VIEW } from './outbound-triage';
import { PICKUP_HISTORY_VIEW } from './pickup-history';
import { PRINT_STATION_FNSKU_VIEW } from './print-station-fnsku';
import { PRODUCTS_CATALOG_VIEW } from './products-catalog';
import { QC_LABELS_VIEW } from './qc-labels';

export {
  DAILY_AGENDA_VIEW,
  EXCEPTIONS_VIEW,
  INCOMING_DOCKED_VIEW,
  INCOMING_UNBOXED_VIEW,
  INCOMING_PIPELINE_VIEW,
  IMPORT_ROWS_VIEW,
  IMPORT_RUNS_VIEW,
  INVENTORY_REPLENISH_VIEW,
  INVENTORY_STOCK_VIEW,
  LABEL_INTAKE_LABELS_VIEW,
  LABEL_INTAKE_PAPERWORK_VIEW,
  LABEL_INTAKE_PRINTED_VIEW,
  LABEL_INTAKE_UPLOADS_VIEW,
  OUTBOUND_SHIPPED_VIEW,
  OUTBOUND_TRIAGE_VIEW,
  PICKUP_HISTORY_VIEW,
  PRINT_STATION_FNSKU_VIEW,
  PRODUCTS_CATALOG_VIEW,
  QC_LABELS_VIEW,
};

export const TRIAGE_VIEWS: Readonly<Record<TriageViewId, TriageViewDecl>> = Object.fromEntries(
  [
    OUTBOUND_TRIAGE_VIEW,
    INCOMING_PIPELINE_VIEW,
    INCOMING_DOCKED_VIEW,
    INCOMING_UNBOXED_VIEW,
    LABEL_INTAKE_UPLOADS_VIEW,
    LABEL_INTAKE_LABELS_VIEW,
    LABEL_INTAKE_PAPERWORK_VIEW,
    LABEL_INTAKE_PRINTED_VIEW,
    IMPORT_RUNS_VIEW,
    IMPORT_ROWS_VIEW,
    INVENTORY_STOCK_VIEW,
    INVENTORY_REPLENISH_VIEW,
    OUTBOUND_SHIPPED_VIEW,
    PRODUCTS_CATALOG_VIEW,
  ].map((view) => [view.id, view]),
);
