/**
 * Receiving workspace column widths — re-export the Station Workbench SoT.
 *
 * Prefer `@/components/station/workbench` for new stations; this file keeps
 * existing receiving imports stable.
 */

export {
  STATION_WORKBENCH_COLUMN as RECEIVING_WORKSPACE_COLUMN,
  STATION_WORKBENCH_HEADER_COLUMN as RECEIVING_WORKSPACE_HEADER_COLUMN,
  STATION_WORKBENCH_BODY_COLUMN as RECEIVING_WORKSPACE_BODY_COLUMN,
} from '@/components/station/workbench/workbench-layout';
