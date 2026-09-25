import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  OUTBOUND_WORKFLOW_COHORT_FILES,
  evaluateOutboundWorkflowCohort,
} from './outbound-workflow-cohort';

function source(path: string) { return readFileSync(path, 'utf8'); }

test('outbound workflow cohort stays governed', () => {
  const sources = Object.fromEntries(
    Object.entries(OUTBOUND_WORKFLOW_COHORT_FILES).map(([key, path]) => [key, source(path)]),
  ) as Parameters<typeof evaluateOutboundWorkflowCohort>[0];
  assert.deepEqual(evaluateOutboundWorkflowCohort(sources).violations, []);
});

test('outbound handling warnings cannot regress to free-text or a missing row strip', () => {
  const sources = Object.fromEntries(
    Object.entries(OUTBOUND_WORKFLOW_COHORT_FILES).map(([key, path]) => [key, source(path)]),
  ) as Parameters<typeof evaluateOutboundWorkflowCohort>[0];
  const regressed = {
    ...sources,
    ordersApi: sources.ordersApi.replace("to_jsonb(sc)->'handling_flags' AS catalog_handling_flags", 'o.notes AS catalog_handling_flags'),
    itemCard: sources.itemCard.replace('item-card-handling-facts', 'legacy-handling-banner'),
    workRowAdapter: sources.workRowAdapter.replace('normalizeOutboundHandlingFacts(row.catalog_handling_flags)', '[]'),
  };
  const ids = evaluateOutboundWorkflowCohort(regressed).violations.map((violation) => violation.id);
  assert.ok(ids.includes('missing-catalog-handling-projection'));
  assert.ok(ids.includes('missing-handling-banner'));
  assert.ok(ids.includes('missing-handling-row-projection'));
});

test('Orders cannot fork the shell-owned scan door into its tactical roster', () => {
  const sources = Object.fromEntries(
    Object.entries(OUTBOUND_WORKFLOW_COHORT_FILES).map(([key, path]) => [key, source(path)]),
  ) as Parameters<typeof evaluateOutboundWorkflowCohort>[0];
  const regressed = {
    ...sources,
    queue: `${sources.queue}\n<MobileCameraPanel /><Button>Scan order</Button>`,
  };
  assert.ok(
    evaluateOutboundWorkflowCohort(regressed).violations.some(
      (violation) => violation.id === 'orders-local-scan-fork',
    ),
  );
});

test('Outbound realtime proof stays behind the shared event and cache-patch seam', () => {
  const sources = Object.fromEntries(
    Object.entries(OUTBOUND_WORKFLOW_COHORT_FILES).map(([key, path]) => [key, source(path)]),
  ) as Parameters<typeof evaluateOutboundWorkflowCohort>[0];
  const regressed = {
    ...sources,
    realtimeInvalidation: sources.realtimeInvalidation.replace(
      'publishOutboundRealtimePaintReceipt(data.orderId)',
      'publishLocalOrdersPaintReceipt(data.orderId)',
    ),
    realtimePaint: sources.realtimePaint.replace(
      "OUTBOUND_REALTIME_PAINT_EVENT = 'cf:outbound-realtime-received'",
      "OUTBOUND_REALTIME_PAINT_EVENT = 'cf:local-orders-received'",
    ),
  };
  const ids = evaluateOutboundWorkflowCohort(regressed).violations.map((violation) => violation.id);
  assert.ok(ids.includes('missing-outbound-realtime-paint-receipt'));
  assert.ok(ids.includes('missing-outbound-realtime-paint-contract'));
});

test('Orders cannot drop the phone equivalent of desktop urgent priority', () => {
  const sources = Object.fromEntries(
    Object.entries(OUTBOUND_WORKFLOW_COHORT_FILES).map(([key, path]) => [key, source(path)]),
  ) as Parameters<typeof evaluateOutboundWorkflowCohort>[0];
  const regressed = {
    ...sources,
    actions: sources.actions.replaceAll('OUTBOUND_PRIORITY_ACTION_IDS', 'UNSCOPED_PRIORITY_ACTION_IDS'),
    queue: sources.queue.replace("isUrgent: action.id === 'mark_urgent'", 'isUrgent: true'),
  };
  const ids = evaluateOutboundWorkflowCohort(regressed).violations.map((violation) => violation.id);
  assert.ok(ids.includes('missing-priority-action-law'));
  assert.ok(ids.includes('missing-row-priority-write'));
});

test('tactical Orders rows retain touch targets and require the governed sale-price fact', () => {
  const sources = Object.fromEntries(
    Object.entries(OUTBOUND_WORKFLOW_COHORT_FILES).map(([key, path]) => [key, source(path)]),
  ) as Parameters<typeof evaluateOutboundWorkflowCohort>[0];
  const regressed = {
    ...sources,
    itemCard: sources.itemCard.replace('min-h-11 px-1', 'min-h-8 px-1'),
    row: sources.row.replace('price={toShipPriceText(row)}', 'price={null}'),
  };
  const ids = evaluateOutboundWorkflowCohort(regressed).violations.map((violation) => violation.id);
  assert.ok(ids.includes('missing-triage-touch-target'));
  assert.ok(ids.includes('missing-governed-orders-price'));
});

test('the governed Order row retains its non-visual realtime measurement identity', () => {
  const sources = Object.fromEntries(
    Object.entries(OUTBOUND_WORKFLOW_COHORT_FILES).map(([key, path]) => [key, source(path)]),
  ) as Parameters<typeof evaluateOutboundWorkflowCohort>[0];
  const regressed = {
    ...sources,
    itemCard: sources.itemCard.replace('data-outbound-order-id', 'data-legacy-row-id'),
    row: sources.row.replace('outboundOrderId={row.entityId}', 'outboundOrderId={undefined}'),
  };
  const ids = evaluateOutboundWorkflowCohort(regressed).violations.map((violation) => violation.id);
  assert.ok(ids.includes('missing-row-realtime-observability-anchor'));
  assert.ok(ids.includes('missing-row-realtime-observability-id'));
});

test('the mobile Pick execution face cannot restore raw palette, radius, or shadow chrome', () => {
  const sources = Object.fromEntries(
    Object.entries(OUTBOUND_WORKFLOW_COHORT_FILES).map(([key, path]) => [key, source(path)]),
  ) as Parameters<typeof evaluateOutboundWorkflowCohort>[0];
  const regressed = {
    ...sources,
    pickerTaskCard: sources.pickerTaskCard.replace(
      'border-border-danger bg-surface-danger px-3 py-2 text-xs font-semibold text-text-danger',
      'rounded-xl border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 shadow-sm',
    ),
    mobilePickSession: sources.mobilePickSession
      .replace("cornerClass('pill')", "'rounded-full'")
      .replace('border-border-success bg-surface-success text-text-success', 'border-emerald-200 bg-emerald-50 text-emerald-900')
      .replace('border-border-warning bg-surface-warning text-text-warning', 'border-amber-300 bg-amber-50 text-amber-900'),
  };
  const ids = evaluateOutboundWorkflowCohort(regressed).violations.map((violation) => violation.id);
  assert.ok(ids.includes('missing-pick-task-error-tokens'));
  assert.ok(ids.includes('missing-pick-session-identity-corner-role'));
  assert.ok(ids.includes('missing-pick-session-tote-success-tokens'));
  assert.ok(ids.includes('missing-pick-session-tote-warning-tokens'));
  assert.ok(ids.includes('raw-style-utility'));
});

test('the mobile Outbound shell cannot restore raw danger-palette error chrome', () => {
  const sources = Object.fromEntries(
    Object.entries(OUTBOUND_WORKFLOW_COHORT_FILES).map(([key, path]) => [key, source(path)]),
  ) as Parameters<typeof evaluateOutboundWorkflowCohort>[0];
  const regressed = {
    ...sources,
    mobileShell: sources.mobileShell.replace('border-border-danger bg-surface-danger', 'border-rose-200 bg-rose-50'),
  };
  const ids = evaluateOutboundWorkflowCohort(regressed).violations.map((violation) => violation.id);
  assert.ok(ids.includes('missing-mobile-shell-error-tokens'));
  assert.ok(ids.includes('raw-style-utility'));
});

test('the shared mobile Scan verdict cannot restore raw semantic-tone utilities', () => {
  const sources = Object.fromEntries(
    Object.entries(OUTBOUND_WORKFLOW_COHORT_FILES).map(([key, path]) => [key, source(path)]),
  ) as Parameters<typeof evaluateOutboundWorkflowCohort>[0];
  const regressed = {
    ...sources,
    mobileScanVerdict: sources.mobileScanVerdict
      .replaceAll('border-border-success bg-surface-success', 'border-emerald-300 bg-emerald-50')
      .replaceAll('border-border-warning bg-surface-warning', 'border-amber-300 bg-amber-50')
      .replaceAll('border-border-danger bg-surface-danger', 'border-rose-300 bg-rose-50'),
  };
  const ids = evaluateOutboundWorkflowCohort(regressed).violations.map((violation) => violation.id);
  assert.ok(ids.includes('missing-mobile-scan-success-tokens'));
  assert.ok(ids.includes('missing-mobile-scan-warning-tokens'));
  assert.ok(ids.includes('missing-mobile-scan-danger-tokens'));
  assert.ok(ids.includes('raw-style-utility'));
});

test('outbound raw-style checks inspect executable class positions, not comments or motion values', () => {
  const sources = Object.fromEntries(
    Object.entries(OUTBOUND_WORKFLOW_COHORT_FILES).map(([key, path]) => [key, source(path)]),
  ) as Parameters<typeof evaluateOutboundWorkflowCohort>[0];
  const documentedOnly = {
    ...sources,
    itemCard: `${sources.itemCard}\n// className=\"rounded-xl bg-rose-500 shadow-md\"\nconst translation = { x };`,
  };
  assert.ok(
    !evaluateOutboundWorkflowCohort(documentedOnly).violations.some(
      (violation) => violation.id === 'raw-style-utility',
    ),
  );

  const executableRegression = {
    ...sources,
    itemCard: `${sources.itemCard}\n<div className=\"rounded-xl bg-rose-500 shadow-md\" />`,
  };
  assert.ok(
    evaluateOutboundWorkflowCohort(executableRegression).violations.some(
      (violation) => violation.id === 'raw-style-utility',
    ),
  );
});

test('Outbound station projections cannot fork their facts, host, or floor mouth', () => {
  const sources = Object.fromEntries(
    Object.entries(OUTBOUND_WORKFLOW_COHORT_FILES).map(([key, path]) => [key, source(path)]),
  ) as Parameters<typeof evaluateOutboundWorkflowCohort>[0];
  const regressed = {
    ...sources,
    packStationPanel: sources.packStationPanel.replaceAll('OrderPackChecklist', 'LocalPackingChecklist'),
    scanOutStationDock: sources.scanOutStationDock
      .replaceAll('StationComposerHost', 'LocalScanDock')
      .replaceAll('useRegisterScanSink', 'useLocalScanSink'),
    stagedDeskQueue: sources.stagedDeskQueue.replace("fetch('/api/shipping/mark-staged'", "fetch('/api/shipping/local-stage'"),
  };
  const ids = evaluateOutboundWorkflowCohort(regressed).violations.map((violation) => violation.id);
  assert.ok(ids.includes('missing-pack-station-checklist'));
  assert.ok(ids.includes('missing-scanout-composer-host'));
  assert.ok(ids.includes('missing-scanout-wedge-sink'));
  assert.ok(ids.includes('missing-desk-dock-stage-write'));
});

test('mobile dock staging cannot make a worker wait for its background refresh', () => {
  const sources = Object.fromEntries(
    Object.entries(OUTBOUND_WORKFLOW_COHORT_FILES).map(([key, path]) => [key, source(path)]),
  ) as Parameters<typeof evaluateOutboundWorkflowCohort>[0];
  const regressed = {
    ...sources,
    mobileDockStagingTask: sources.mobileDockStagingTask
      .replace('void queryClient.invalidateQueries', 'await queryClient.invalidateQueries')
      .replace("router.replace('/m/shipping/scan-out')", "router.replace('/m/shipping/local-scan')"),
  };
  const ids = evaluateOutboundWorkflowCohort(regressed).violations.map((violation) => violation.id);
  assert.ok(ids.includes('missing-mobile-dock-stage-nonblocking-refresh'));
  assert.ok(ids.includes('missing-mobile-dock-stage-handoff'));
});

test('FBA plan due dates cannot regress to a native browser field', () => {
  const sources = Object.fromEntries(
    Object.entries(OUTBOUND_WORKFLOW_COHORT_FILES).map(([key, path]) => [key, source(path)]),
  ) as Parameters<typeof evaluateOutboundWorkflowCohort>[0];
  const regressed = {
    ...sources,
    fbaCreatePlan: sources.fbaCreatePlan.replace('variant="compact"', 'type="date"'),
  };
  assert.ok(
    evaluateOutboundWorkflowCohort(regressed).violations.some((violation) => violation.id === 'native-fba-plan-date'),
  );
});

test('FBA plan staff fields cannot regress to native selects', () => {
  const sources = Object.fromEntries(
    Object.entries(OUTBOUND_WORKFLOW_COHORT_FILES).map(([key, path]) => [key, source(path)]),
  ) as Parameters<typeof evaluateOutboundWorkflowCohort>[0];
  const regressed = {
    ...sources,
    fbaCreatePlan: sources.fbaCreatePlan.replace('StageStaffAssignPopover', '<select'),
  };
  assert.ok(
    evaluateOutboundWorkflowCohort(regressed).violations.some((violation) => violation.id === 'native-fba-plan-staff-select'),
  );
});

test('FBA shipment editor cannot regress to a native identifier input', () => {
  const sources = Object.fromEntries(
    Object.entries(OUTBOUND_WORKFLOW_COHORT_FILES).map(([key, path]) => [key, source(path)]),
  ) as Parameters<typeof evaluateOutboundWorkflowCohort>[0];
  const regressed = {
    ...sources,
    fbaShipmentEditor: sources.fbaShipmentEditor.replace('<TextField', '<input'),
  };
  assert.ok(
    evaluateOutboundWorkflowCohort(regressed).violations.some((violation) => violation.id === 'missing-fba-editor-field'),
  );
});

test('FBA unallocated drag feedback cannot regress to a raw palette', () => {
  const sources = Object.fromEntries(
    Object.entries(OUTBOUND_WORKFLOW_COHORT_FILES).map(([key, path]) => [key, source(path)]),
  ) as Parameters<typeof evaluateOutboundWorkflowCohort>[0];
  const regressed = {
    ...sources,
    fbaEditorUnallocated: sources.fbaEditorUnallocated.replaceAll('border-border-warning bg-surface-warning', 'border-amber-400 bg-amber-50'),
  };
  assert.ok(
    evaluateOutboundWorkflowCohort(regressed).violations.some((violation) => violation.id === 'missing-fba-editor-unallocated-warning-token'),
  );
});

test('FBA FNSKU search cannot regress to a native input', () => {
  const sources = Object.fromEntries(
    Object.entries(OUTBOUND_WORKFLOW_COHORT_FILES).map(([key, path]) => [key, source(path)]),
  ) as Parameters<typeof evaluateOutboundWorkflowCohort>[0];
  const regressed = {
    ...sources,
    fbaEditorFnskuSearch: sources.fbaEditorFnskuSearch.replace('<TextField', '<input'),
  };
  assert.ok(
    evaluateOutboundWorkflowCohort(regressed).violations.some((violation) => violation.id === 'missing-fba-editor-fnsku-search-field'),
  );
});

test('FBA collapsed review cannot regress to a raw button', () => {
  const sources = Object.fromEntries(
    Object.entries(OUTBOUND_WORKFLOW_COHORT_FILES).map(([key, path]) => [key, source(path)]),
  ) as Parameters<typeof evaluateOutboundWorkflowCohort>[0];
  const regressed = {
    ...sources,
    fbaPairedReviewStrip: sources.fbaPairedReviewStrip.replace('<Button', '<button'),
  };
  assert.ok(
    evaluateOutboundWorkflowCohort(regressed).violations.some((violation) => violation.id === 'missing-fba-paired-review-strip-button'),
  );
});

test('FBA paired-review faces cannot regress to native shipment-ID inputs', () => {
  const sources = Object.fromEntries(
    Object.entries(OUTBOUND_WORKFLOW_COHORT_FILES).map(([key, path]) => [key, source(path)]),
  ) as Parameters<typeof evaluateOutboundWorkflowCohort>[0];
  const regressed = {
    ...sources,
    fbaPairedReviewPanel: sources.fbaPairedReviewPanel.replace('<TextField', '<input'),
    fbaPairedReviewWorkspace: sources.fbaPairedReviewWorkspace.replace('<TextField', '<input'),
  };
  const ids = evaluateOutboundWorkflowCohort(regressed).violations.map((violation) => violation.id);
  assert.ok(ids.includes('missing-fba-paired-review-panel-field'));
  assert.ok(ids.includes('missing-fba-paired-review-workspace-field'));
});

test('FBA checkbox cannot regress to a raw button root', () => {
  const sources = Object.fromEntries(
    Object.entries(OUTBOUND_WORKFLOW_COHORT_FILES).map(([key, path]) => [key, source(path)]),
  ) as Parameters<typeof evaluateOutboundWorkflowCohort>[0];
  const regressed = {
    ...sources,
    fbaCheckbox: sources.fbaCheckbox.replace('<Button', '<button'),
  };
  assert.ok(
    evaluateOutboundWorkflowCohort(regressed).violations.some((violation) => violation.id === 'missing-fba-checkbox-button-primitive'),
  );
});

test('mobile packing controls cannot regress to inline press physics', () => {
  const sources = Object.fromEntries(
    Object.entries(OUTBOUND_WORKFLOW_COHORT_FILES).map(([key, path]) => [key, source(path)]),
  ) as Parameters<typeof evaluateOutboundWorkflowCohort>[0];
  const regressed = {
    ...sources,
    mobilePackerPhotoStudio: `${sources.mobilePackerPhotoStudio}\nwhileTap={{ scale: 0.96 }}`,
  };
  assert.ok(
    evaluateOutboundWorkflowCohort(regressed).violations.some((violation) => violation.id === 'inline-mobile-pack-press-physics'),
  );
});

test('outbound packing rows cannot regress to rounded or shadowed card chrome', () => {
  const sources = Object.fromEntries(
    Object.entries(OUTBOUND_WORKFLOW_COHORT_FILES).map(([key, path]) => [key, source(path)]),
  ) as Parameters<typeof evaluateOutboundWorkflowCohort>[0];
  const regressed = {
    ...sources,
    captureStackRow: sources.captureStackRow.replace(
      'border-border-emphasis',
      'rounded-2xl border-blue-100 shadow-[0_8px_24px_-12px_rgba(15,23,42,0.18)]',
    ),
  };
  const ids = evaluateOutboundWorkflowCohort(regressed).violations.map((violation) => violation.id);
  assert.ok(ids.includes('missing-outbound-capture-boundary'));
  assert.ok(ids.includes('rounded-or-shadowed-outbound-capture-row'));
  assert.ok(ids.includes('raw-style-utility'));
});

test('packing station feedback cannot restore literal palette or ad-hoc corner chrome', () => {
  const sources = Object.fromEntries(
    Object.entries(OUTBOUND_WORKFLOW_COHORT_FILES).map(([key, path]) => [key, source(path)]),
  ) as Parameters<typeof evaluateOutboundWorkflowCohort>[0];
  const regressed = {
    ...sources,
    packAwaitingFeedback: sources.packAwaitingFeedback.replace("cornerClass('surface')", "'rounded-xl'"),
    packPapersStatus: sources.packPapersStatus
      .replace('border-border-warning bg-surface-warning', 'border-amber-200 bg-amber-50')
      .replace('border-border-success bg-surface-success', 'border-emerald-200 bg-emerald-50'),
  };
  const ids = evaluateOutboundWorkflowCohort(regressed).violations.map((violation) => violation.id);
  assert.ok(ids.includes('missing-pack-awaiting-corner-role'));
  assert.ok(ids.includes('missing-pack-papers-warning-tokens'));
  assert.ok(ids.includes('missing-pack-papers-success-tokens'));
  assert.ok(ids.includes('raw-style-utility'));
});

test('the mobile Packing header cannot restore a local rounded nav control', () => {
  const sources = Object.fromEntries(
    Object.entries(OUTBOUND_WORKFLOW_COHORT_FILES).map(([key, path]) => [key, source(path)]),
  ) as Parameters<typeof evaluateOutboundWorkflowCohort>[0];
  const regressed = {
    ...sources,
    packerPageContent: sources.packerPageContent
      .replace('radius="flush"', '')
      .replace('items-center justify-center text-text-muted', 'items-center justify-center rounded-xl text-text-muted'),
  };
  const ids = evaluateOutboundWorkflowCohort(regressed).violations.map((violation) => violation.id);
  assert.ok(ids.includes('missing-packer-mobile-nav-radius-role'));
  assert.ok(ids.includes('raw-style-utility'));
});

test('packing keeps its verified mobile completion path', () => {
  const sources = Object.fromEntries(
    Object.entries(OUTBOUND_WORKFLOW_COHORT_FILES).map(([key, path]) => [key, source(path)]),
  ) as Parameters<typeof evaluateOutboundWorkflowCohort>[0];
  const regressed = {
    ...sources,
    mobilePackingRoute: sources.mobilePackingRoute.replace('<MobilePackingList', '<div'),
    mobileWorkflow: sources.mobileWorkflow.replace(
      /(id: 'pack-order',[\s\S]*?completion: )'live'/,
      "$1'partial'",
    ),
  };
  const ids = evaluateOutboundWorkflowCohort(regressed).violations.map((violation) => violation.id);
  assert.ok(ids.includes('missing-mobile-pack-door'));
  assert.ok(ids.includes('packing-completion-not-ratified'));
});

test('packing cannot regress to a carrier-shipped write', () => {
  const sources = Object.fromEntries(
    Object.entries(OUTBOUND_WORKFLOW_COHORT_FILES).map(([key, path]) => [key, source(path)]),
  ) as Parameters<typeof evaluateOutboundWorkflowCohort>[0];
  const regressed = {
    ...sources,
    packingLogUpdateApi: sources.packingLogUpdateApi
      .replaceAll('mirrorLegacyPackingToAllocations', 'mirrorLegacyPackToAllocations')
      .replaceAll("SET status = 'packed'", "SET status = 'shipped'"),
  };
  const ids = evaluateOutboundWorkflowCohort(regressed).violations.map((violation) => violation.id);
  assert.ok(ids.includes('missing-pack-update-packed-mirror'));
  assert.ok(ids.includes('packing-prematurely-ships-order'));
});

test('mobile packing cannot treat photo capture as a completed physical pack', () => {
  const sources = Object.fromEntries(
    Object.entries(OUTBOUND_WORKFLOW_COHORT_FILES).map(([key, path]) => [key, source(path)]),
  ) as Parameters<typeof evaluateOutboundWorkflowCohort>[0];
  const regressed = {
    ...sources,
    packerLogWriter: sources.packerLogWriter.replaceAll('PACKER_LOG_CAPTURING', "'COMPLETED'"),
    packingLogUpdateApi: sources.packingLogUpdateApi.replaceAll("completion_state = 'COMPLETED'", "completion_state = 'CAPTURING'"),
    ordersApi: sources.ordersApi.replaceAll("completion_state = 'COMPLETED'", "completion_state = 'CAPTURING'"),
  };
  const ids = evaluateOutboundWorkflowCohort(regressed).violations.map((violation) => violation.id);
  assert.ok(ids.includes('missing-mobile-pack-draft'));
  assert.ok(ids.includes('missing-pack-completion-transition'));
  assert.ok(ids.includes('draft-counts-as-packed'));
});

test('the mobile pick-to-pack path cannot bypass the durable evidence lifecycle', () => {
  const sources = Object.fromEntries(
    Object.entries(OUTBOUND_WORKFLOW_COHORT_FILES).map(([key, path]) => [key, source(path)]),
  ) as Parameters<typeof evaluateOutboundWorkflowCohort>[0];
  const regressed = {
    ...sources,
    pickerShells: sources.pickerShells.replaceAll('onStartPacking', 'onComplete'),
    mobilePackStartRoute: sources.mobilePackStartRoute.replace('/api/packing-logs/draft', '/api/packing-logs'),
    mobilePackerPhotoStudio: sources.mobilePackerPhotoStudio
      .replace('waitForScope(packerLogId)', 'Promise.resolve()')
      .replace('draftPackerLogId: packerLogId', 'packerLogId'),
  };
  const ids = evaluateOutboundWorkflowCohort(regressed).violations.map((violation) => violation.id);
  assert.ok(ids.includes('missing-pick-to-pack-handoff'));
  assert.ok(ids.includes('missing-mobile-pack-start'));
  assert.ok(ids.includes('missing-mobile-pack-upload-settle'));
  assert.ok(ids.includes('missing-mobile-pack-finalize-identity'));
});

test('orders keeps pass-pick assignment in the selected row', () => {
  const sources = Object.fromEntries(
    Object.entries(OUTBOUND_WORKFLOW_COHORT_FILES).map(([key, path]) => [key, source(path)]),
  ) as Parameters<typeof evaluateOutboundWorkflowCohort>[0];
  const regressed = {
    ...sources,
    row: sources.row.replaceAll('Pass pick', 'Reassign'),
    pickerSheet: sources.pickerSheet.replace("staffMatchesStageLane(member, 'technician')", 'true'),
  };
  assert.ok(
    evaluateOutboundWorkflowCohort(regressed).violations.some(
      (violation) => violation.id === 'missing-row-pass-pick',
    ),
  );
  assert.ok(
    evaluateOutboundWorkflowCohort(regressed).violations.some(
      (violation) => violation.id === 'missing-row-pass-pick-role',
    ),
  );
});

test('Orders require the governed SKU-adjacent marketplace trigger', () => {
  const sources = Object.fromEntries(
    Object.entries(OUTBOUND_WORKFLOW_COHORT_FILES).map(([key, path]) => [key, source(path)]),
  ) as Parameters<typeof evaluateOutboundWorkflowCohort>[0];
  const regressed = {
    ...sources,
    itemCard: sources.itemCard.replace('<MicroListingTrigger', '<LegacyListingTrigger'),
  };
  assert.ok(
    evaluateOutboundWorkflowCohort(regressed).violations.some(
      (violation) => violation.id === 'missing-governed-micro-listing',
    ),
  );
});

test('the governed card cannot bury bin context or break listing context with navigation', () => {
  const sources = Object.fromEntries(
    Object.entries(OUTBOUND_WORKFLOW_COHORT_FILES).map(([key, path]) => [key, source(path)]),
  ) as Parameters<typeof evaluateOutboundWorkflowCohort>[0];
  const regressed = {
    ...sources,
    itemCard: sources.itemCard
      .replace('item-card-location-context', 'legacy-location-context'),
    microListingTrigger: `${sources.microListingTrigger}\nwindow.open(listing.href)`,
  };
  const ids = evaluateOutboundWorkflowCohort(regressed).violations.map((violation) => violation.id);
  assert.ok(ids.includes('missing-row-location-context'));
  assert.ok(ids.includes('listing-context-breaking-navigation'));
});

test('shipping status faces cannot regress to a raw palette', () => {
  const sources = Object.fromEntries(
    Object.entries(OUTBOUND_WORKFLOW_COHORT_FILES).map(([key, path]) => [key, source(path)]),
  ) as Parameters<typeof evaluateOutboundWorkflowCohort>[0];
  const regressed = {
    ...sources,
    shipmentStatusBadge: sources.shipmentStatusBadge.replace('bg-fill-danger', 'bg-rose-600'),
  };
  const ids = evaluateOutboundWorkflowCohort(regressed).violations.map((violation) => violation.id);
  assert.ok(ids.includes('missing-shipment-status-danger-token'));
  assert.ok(ids.includes('raw-style-utility'));
});

test('shipping filter faces cannot regress to raw buttons or palette utilities', () => {
  const sources = Object.fromEntries(
    Object.entries(OUTBOUND_WORKFLOW_COHORT_FILES).map(([key, path]) => [key, source(path)]),
  ) as Parameters<typeof evaluateOutboundWorkflowCohort>[0];
  const regressed = {
    ...sources,
    shippedFilterControls: sources.shippedFilterControls.replace('<Button', '<button'),
    shippedCarrierFilters: `${sources.shippedCarrierFilters.replaceAll('FILTER_DROPDOWN_SELECT_CLASS', 'LEGACY_FILTER_SELECT_CLASS')}\n<select className=\"rounded-md bg-blue-50\" />`,
  };
  const ids = evaluateOutboundWorkflowCohort(regressed).violations.map((violation) => violation.id);
  assert.ok(ids.includes('missing-shipped-attention-button'));
  assert.ok(ids.includes('missing-shipped-filter-field-contract'));
  assert.ok(ids.includes('raw-style-utility'));
});

test('shared shipping staff selection cannot restore rounded or shadowed card treatment', () => {
  const sources = Object.fromEntries(
    Object.entries(OUTBOUND_WORKFLOW_COHORT_FILES).map(([key, path]) => [key, source(path)]),
  ) as Parameters<typeof evaluateOutboundWorkflowCohort>[0];
  const regressed = {
    ...sources,
    staffButtonGrid: sources.staffButtonGrid
      .replace("cornerClass('control')", "'rounded-lg'")
      .replace('border-transparent` : cls.inactive', 'border-transparent shadow-lg` : cls.inactive'),
  };
  const ids = evaluateOutboundWorkflowCohort(regressed).violations.map((violation) => violation.id);
  assert.ok(ids.includes('missing-staff-grid-corner-role'));
  assert.ok(ids.includes('staff-grid-shadowed-selection'));
  assert.ok(ids.includes('raw-style-utility'));
});
