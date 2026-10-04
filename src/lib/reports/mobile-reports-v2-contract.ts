/**
 * Pinned completion contract for `/m/reports`.
 *
 * Keep this small and executable: tests use these IDs to prevent the deleted
 * V1 fork from returning under a different label.
 */
export const MOBILE_REPORTS_V2_FACETS = [
  { id: 'pulse', label: 'Pulse' },
  { id: 'stages', label: 'Stages' },
  { id: 'staff', label: 'Staff' },
] as const;

export type MobileReportsV2Facet = typeof MOBILE_REPORTS_V2_FACETS[number]['id'];

export const MOBILE_REPORTS_V2_DEFINITION_OF_DONE = {
  route: '/m/reports',
  dataSource: '/api/reports/operations-live',
  required: [
    'top-level pulse, stages, and staff facets with touch-sized targets',
    'shift status and capacity progress lead the pulse facet',
    'actionable exceptions before historical evidence',
    'pick and pack throughput with sample coverage disclosed',
    'every rostered packer visible, including zero-work staff',
    'active and completed operations link to their existing mobile records',
    'record-by-record operation activity lives at /m/activity',
    'icon-only refresh in the V2 top bar',
    'calendar, earlier, and later controls in the safe-area bottom dock',
    'Inter is the readable interface face on mobile and desktop',
  ],
  deleted: [
    'single long report page',
    'completed activity feed nested inside reports',
    'boxed KPI metric grid',
    'packing-only mobile summary component',
    'top date pagination rail',
    'text-labelled refresh action',
    'duplicated report query or desktop/mobile data model',
    'condensed industrial interface role',
  ],
} as const;
