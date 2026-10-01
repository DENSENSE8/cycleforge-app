import type { RecordStateFace } from './record';
import type { ImportRowOutcome, ImportRunStatus } from '@/lib/imports/types';

/**
 * Operations › Imports — a run's status, in the header Sync's dot vocabulary
 * (`GlobalHeaderSync`): blue while it runs, green when it landed, amber when
 * any step (or the run) failed.
 */
export const IMPORT_RUN_LIFECYCLE: Readonly<Record<ImportRunStatus, RecordStateFace>> = {
  running: { id: 'running', code: 'RUN', label: 'Running', tone: 'info', icon: 'circle-dot' },
  success: { id: 'success', code: 'OK', label: 'Synced', tone: 'success', icon: 'package' },
  partial: { id: 'partial', code: 'PRT', label: 'A step failed', tone: 'warning', icon: 'alarm-clock' },
  failed: { id: 'failed', code: 'FLD', label: 'Failed', tone: 'warning', icon: 'package-x' },
};

/** Operations › Imports — what one import did to one order. */
export const IMPORT_ROW_OUTCOME_LIFECYCLE: Readonly<Record<ImportRowOutcome, RecordStateFace>> = {
  inserted: { id: 'inserted', code: 'NEW', label: 'Inserted', tone: 'success', icon: 'package' },
  backfilled: { id: 'backfilled', code: 'FIL', label: 'Backfilled', tone: 'info', icon: 'circle-dot' },
  adopted: { id: 'adopted', code: 'ADP', label: 'Adopted', tone: 'info', icon: 'circle-dot' },
  claimed: { id: 'claimed', code: 'CLM', label: 'Claimed', tone: 'info', icon: 'circle-dot' },
  tracking_filled: { id: 'tracking_filled', code: 'TRK', label: 'Tracking filled', tone: 'fulfillment', icon: 'truck' },
  unchanged: { id: 'unchanged', code: 'SAM', label: 'Unchanged', tone: 'info', icon: 'circle-dot', hatched: true },
  ambiguous: { id: 'ambiguous', code: 'AMB', label: 'Ambiguous', tone: 'warning', icon: 'alarm-clock' },
  quarantined: { id: 'quarantined', code: 'HLD', label: 'Held for review', tone: 'warning', icon: 'circle-pause' },
  skipped: { id: 'skipped', code: 'SKP', label: 'Skipped', tone: 'warning', icon: 'package-x', hatched: true },
  failed: { id: 'failed', code: 'ERR', label: 'Failed', tone: 'danger', icon: 'package-x' },
};
