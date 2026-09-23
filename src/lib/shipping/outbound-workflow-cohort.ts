/**
 * Outbound workflow cohort — deterministic, harness-agnostic source verdict.
 *
 * This is intentionally a source evaluator rather than a visual snapshot. CI,
 * the CLI, MCP and agent benchmarks can all ask exactly the same questions:
 * does Orders retain its WMS state vocabulary, avoid Pick/Pack execution, use
 * shared workflow facts, and keep raw palette/radius debt out of its governed
 * mobile cohort?
 */

import ts from 'typescript';

export const OUTBOUND_WORKFLOW_COHORT_VERSION = 44 as const;
export const OUTBOUND_WORKFLOW_COHORT_TRIPWIRE =
  'src/lib/shipping/outbound-workflow-cohort.test.ts' as const;
export const OUTBOUND_WORKFLOW_COHORT_LEDGER =
  'docs/eval/cohorts/outbound-workflow/LEDGER.md' as const;
export const OUTBOUND_WORKFLOW_COHORT_SNAPSHOTS =
  'docs/eval/cohorts/outbound-workflow/snapshots' as const;

export const OUTBOUND_WORKFLOW_COHORT_FILES = {
  queue: 'src/components/mobile/redesign/MobileToShipQueue.tsx',
  mobileTopBar: 'src/components/mobile/redesign/MobileTopBar.tsx',
  mobileShell: 'src/components/mobile/redesign/MobileShell.tsx',
  mobileScanCta: 'src/components/mobile/redesign/mobile-scan-cta.tsx',
  mobileScanVerdict: 'src/components/mobile/redesign/MobileScanVerdictBanner.tsx',
  realtimeInvalidation: 'src/hooks/useRealtimeInvalidation.ts',
  realtimePaint: 'src/lib/shipping/outbound-realtime-paint.ts',
  orderViews: 'src/lib/work-orders/to-ship-assignment.ts',
  row: 'src/components/mobile/redesign/MobileToShipRow.tsx',
  pickerSheet: 'src/components/mobile/redesign/MobileToShipPickerSheet.tsx',
  itemCard: 'src/components/mobile/redesign/ItemCardRow.tsx',
  pickQueueRow: 'src/components/mobile/redesign/PickQueueRow.tsx',
  microListingTrigger: 'src/components/mobile/redesign/MicroListingTrigger.tsx',
  sheet: 'src/components/mobile/redesign/MobileToShipSheet.tsx',
  orderDetail: 'src/components/mobile/redesign/OrderDetail.tsx',
  facts: 'src/lib/shipping/outbound-workflow-facts.ts',
  actions: 'src/lib/shipping/outbound-workflow-actions.ts',
  handlingFacts: 'src/lib/shipping/outbound-handling-facts.ts',
  skuCatalogSchema: 'src/lib/schemas/sku-catalog.ts',
  workRowAdapter: 'src/lib/work-orders/shipped-as-work-row.ts',
  ordersApi: 'src/app/api/orders/route.ts',
  fbaPlanRail: 'src/components/fba/sidebar/FbaSidebarRails.tsx',
  fbaPlanInput: 'src/components/fba/StationFbaInput.tsx',
  fbaPlanQueue: 'src/components/fba/station-input/FbaPendingPlanQueue.tsx',
  fbaPlanQty: 'src/components/fba/station-input/FbaQtyStepper.tsx',
  fbaSelectedLine: 'src/components/fba/sidebar/FbaSelectedLineRow.tsx',
  fbaStatus: 'src/components/fba/shared/FbaStatusBadge.tsx',
  fbaError: 'src/components/fba/FbaStateShells.tsx',
  fbaShipmentRail: 'src/components/fba/sidebar/FbaActiveShipments.tsx',
  fbaShipmentCard: 'src/components/fba/sidebar/active-shipments/ActiveShipmentCard.tsx',
  fbaWorkspaceSidebar: 'src/components/fba/sidebar/FbaWorkspaceSidebar.tsx',
  mobileFbaPlan: 'src/components/mobile/shipping/MobileFbaPlanTask.tsx',
  mobileFbaScan: 'src/components/mobile/shipping/MobileFbaUnitScanTask.tsx',
  mobileFbaVerify: 'src/components/mobile/shipping/MobileFbaVerifyTask.tsx',
  mobileFbaLabel: 'src/components/mobile/shipping/MobileFbaLabelBindTask.tsx',
  mobileFbaClose: 'src/components/mobile/shipping/MobileFbaCloseTask.tsx',
  fbaQuickAdd: 'src/components/fba/FbaQuickAddFnskuModal.tsx',
  fbaCreatePlan: 'src/components/fba/FbaCreateShipmentForm.tsx',
  fbaBoardDetail: 'src/components/fba/FbaBoardDetailPanel.tsx',
  fbaBoardPlanEntry: 'src/components/fba/board-detail/PlanEntryCard.tsx',
  fbaBoardDelete: 'src/components/fba/board-detail/FbaDeleteControl.tsx',
  fbaCreateModal: 'src/components/fba/FbaCreatePlanModal.tsx',
  fbaCatalogInfo: 'src/components/fba/FnskuCatalogInfoPanel.tsx',
  fbaScanToast: 'src/components/fba/sidebar/FbaFnskuScanToast.tsx',
  fbaQtySplit: 'src/components/fba/sidebar/FbaQtySplitPopover.tsx',
  fbaQtySidebar: 'src/components/fba/sidebar/FbaQtyStepper.tsx',
  fbaUnallocated: 'src/components/fba/sidebar/FbaUnallocatedBucket.tsx',
  fbaTrackingBucket: 'src/components/fba/sidebar/FbaTrackingBucket.tsx',
  fbaTrackingBundle: 'src/components/fba/sidebar/FbaTrackingBundleCard.tsx',
  fbaTrackingGroup: 'src/components/fba/sidebar/FbaTrackingGroupDisplay.tsx',
  fbaCatalogSidebar: 'src/components/fba/sidebar/FbaCatalogSidebar.tsx',
  fbaWorkspaceScanField: 'src/components/fba/sidebar/FbaWorkspaceScanField.tsx',
  fbaCombineWorkspace: 'src/components/fba/sidebar/FbaCombineWorkspace.tsx',
  fbaShipmentEditor: 'src/components/fba/sidebar/FbaShipmentEditorForm.tsx',
  fbaEditorUnallocated: 'src/components/fba/sidebar/shipment-editor/UnallocatedDropZone.tsx',
  fbaEditorFnskuSearch: 'src/components/fba/sidebar/shipment-editor/FnskuSearchModal.tsx',
  fbaPairedReviewStrip: 'src/components/fba/sidebar/paired-review/PairedReviewCollapsedStrip.tsx',
  fbaPairedReviewPanel: 'src/components/fba/sidebar/paired-review/PairedReviewPanelLayout.tsx',
  fbaPairedReviewWorkspace: 'src/components/fba/sidebar/paired-review/PairedReviewWorkspace.tsx',
  fbaCheckbox: 'src/components/fba/table/Checkbox.tsx',
  mobilePackingRow: 'src/components/mobile/packer/MobilePackingRow.tsx',
  mobilePackingSheet: 'src/components/mobile/packer/MobilePackingSheet.tsx',
  mobilePackerPhotoStudio: 'src/components/mobile/photos/MobilePackerPhotoStudio.tsx',
  mobileDockStagingTask: 'src/components/mobile/shipping/MobileDockStagingTask.tsx',
  mobileScanOutTask: 'src/app/m/(shell)/id/scan-out/[orderId]/page.tsx',
  captureStackRow: 'src/design-system/components/capture-stack/CaptureStackRow.tsx',
  mobilePackingRoute: 'src/app/m/(shell)/pack/page.tsx',
  mobilePackStartRoute: 'src/app/m/(shell)/pack/start/[orderId]/page.tsx',
  pickerShells: 'src/app/m/(shell)/pick/[orderId]/_picker/PickerShells.tsx',
  pickerTaskCard: 'src/app/m/(shell)/pick/[orderId]/_picker/PickerTaskCard.tsx',
  mobilePickSession: 'src/app/m/(shell)/pick/[orderId]/page.tsx',
  packingLogCreateApi: 'src/app/api/packing-logs/route.ts',
  packingLogDraftApi: 'src/app/api/packing-logs/draft/route.ts',
  packingLogUpdateApi: 'src/app/api/packing-logs/update/route.ts',
  packerLogWriter: 'src/lib/packing/packer-log-writer.ts',
  packerLogCompletion: 'src/lib/packing/packer-log-completion.ts',
  scanOutApi: 'src/app/api/shipped/scan-out/route.ts',
  stagedDeskQueue: 'src/components/outbound/scan-out/StagedQueueTable.tsx',
  packStationPanel: 'src/components/packer/PackOrderPanel.tsx',
  packAwaitingFeedback: 'src/components/packer/PackAwaitingFeedback.tsx',
  packPapersStatus: 'src/components/packer/PackPapersStatusCard.tsx',
  packerPageContent: 'src/components/packer/PackerPageContent.tsx',
  scanOutStationWorkspace: 'src/components/outbound/workspaces/ScanOutWorkspace.tsx',
  scanOutStationDock: 'src/components/outbound/scan-out/ScanOutComposerDock.tsx',
  mobileWorkflow: 'src/lib/mobile/mobile-first-surface.ts',
  shipmentStatusBadge: 'src/components/shipping/ShipmentStatusBadge.tsx',
  shippedFilterControls: 'src/components/shipping/shipped-filter/ShippedFilterControls.tsx',
  shippedCarrierFilters: 'src/components/shipping/shipped-filter/ShippedCarrierFilters.tsx',
  shippedFilterDropdown: 'src/components/shipping/shipped-filter/ShippedFilterDropdown.tsx',
  filterDropdownSelect: 'src/design-system/components/FilterDropdownSelect.tsx',
  staffButtonGrid: 'src/components/shipping/StaffButtonGrid.tsx',
} as const;

export type OutboundWorkflowCohortSources = Readonly<Record<
  keyof typeof OUTBOUND_WORKFLOW_COHORT_FILES,
  string
>>;

export type OutboundWorkflowCohortViolation = {
  id: string;
  file: keyof typeof OUTBOUND_WORKFLOW_COHORT_FILES;
  why: string;
};

export type OutboundWorkflowCohortVerdict = {
  schemaVersion: typeof OUTBOUND_WORKFLOW_COHORT_VERSION;
  analysis: 'deterministic-source-contract';
  ok: boolean;
  violations: OutboundWorkflowCohortViolation[];
};

const REQUIRED_ORDER_VIEWS = [
  'Must go today', 'Urgent', 'Blocked', 'Exceptions', 'Ready to pack', 'Packed',
] as const;
const RAW_UTILITY = /(?:text|bg|border|ring|fill|stroke|shadow)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b|\brounded-(?!none\b)|\bshadow-(?!none\b)/;
const CLASS_BEARING_PROPERTY_NAMES = new Set(['className', 'box', 'ink', 'chip']);

/**
 * Inspect class-bearing AST positions, not the whole source string. The old
 * regex flagged comments, documentation, and `style={{ x }}` MotionValues as
 * if they were executable color/radius decisions. This keeps the industrial
 * rule deterministic while making its verdict depend on the actual JSX/class
 * construction an agent or human ships.
 */
function hasRawStyleUtility(source: string): boolean {
  const sourceFile = ts.createSourceFile(
    'outbound-workflow-cohort-source.tsx',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  let found = false;

  const inspectText = (text: string) => {
    if (RAW_UTILITY.test(text)) found = true;
  };

  const inspectClassExpression = (expression: ts.Expression): void => {
    if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) {
      inspectText(expression.text);
      return;
    }
    if (ts.isTemplateExpression(expression)) {
      inspectText(expression.head.text);
      for (const span of expression.templateSpans) {
        inspectClassExpression(span.expression);
        inspectText(span.literal.text);
      }
      return;
    }
    if (ts.isParenthesizedExpression(expression) || ts.isAsExpression(expression) || ts.isTypeAssertionExpression(expression)) {
      inspectClassExpression(expression.expression);
      return;
    }
    if (ts.isConditionalExpression(expression)) {
      inspectClassExpression(expression.whenTrue);
      inspectClassExpression(expression.whenFalse);
      return;
    }
    if (ts.isBinaryExpression(expression) && expression.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
      inspectClassExpression(expression.right);
      return;
    }
    if (ts.isArrayLiteralExpression(expression)) {
      for (const item of expression.elements) {
        if (ts.isExpression(item)) inspectClassExpression(item);
      }
      return;
    }
    if (
      ts.isCallExpression(expression)
      && ts.isIdentifier(expression.expression)
      && ['cn', 'clsx', 'classNames', 'twMerge'].includes(expression.expression.text)
    ) {
      for (const argument of expression.arguments) inspectClassExpression(argument);
    }
  };

  const inspectAttribute = (attribute: ts.JsxAttribute): void => {
    if (attribute.name.getText(sourceFile) !== 'className' || !attribute.initializer) return;
    if (ts.isStringLiteral(attribute.initializer)) {
      inspectText(attribute.initializer.text);
      return;
    }
    if (ts.isJsxExpression(attribute.initializer) && attribute.initializer.expression) {
      inspectClassExpression(attribute.initializer.expression);
    }
  };

  const visit = (node: ts.Node): void => {
    if (ts.isJsxAttribute(node)) inspectAttribute(node);
    if (
      ts.isCallExpression(node)
      && ts.isIdentifier(node.expression)
      && ['cn', 'clsx', 'classNames', 'twMerge'].includes(node.expression.text)
    ) {
      inspectClassExpression(node);
    }
    if (
      ts.isPropertyAssignment(node)
      && (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name))
      && CLASS_BEARING_PROPERTY_NAMES.has(node.name.text)
    ) {
      inspectClassExpression(node.initializer);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
}

function requireText(
  sources: OutboundWorkflowCohortSources,
  file: keyof typeof OUTBOUND_WORKFLOW_COHORT_FILES,
  text: string,
  id: string,
  why: string,
  violations: OutboundWorkflowCohortViolation[],
) {
  if (!sources[file].includes(text)) violations.push({ id, file, why });
}

function requirePattern(
  sources: OutboundWorkflowCohortSources,
  file: keyof typeof OUTBOUND_WORKFLOW_COHORT_FILES,
  pattern: RegExp,
  id: string,
  why: string,
  violations: OutboundWorkflowCohortViolation[],
) {
  if (!pattern.test(sources[file])) violations.push({ id, file, why });
}

function forbidPattern(
  sources: OutboundWorkflowCohortSources,
  file: keyof typeof OUTBOUND_WORKFLOW_COHORT_FILES,
  pattern: RegExp,
  id: string,
  why: string,
  violations: OutboundWorkflowCohortViolation[],
) {
  if (pattern.test(sources[file])) violations.push({ id, file, why });
}

export function evaluateOutboundWorkflowCohort(
  sources: OutboundWorkflowCohortSources,
): OutboundWorkflowCohortVerdict {
  const violations: OutboundWorkflowCohortViolation[] = [];
  for (const view of REQUIRED_ORDER_VIEWS) {
    requireText(sources, 'orderViews', view, `missing-order-view:${view}`, 'Orders must retain its governed WMS view.', violations);
  }
  requireText(sources, 'queue', 'useRealtimeInvalidation', 'missing-shared-realtime', 'Orders must consume the shared invalidation adapter.', violations);
  requireText(sources, 'realtimeInvalidation', 'publishOutboundRealtimePaintReceipt(data.orderId)', 'missing-outbound-realtime-paint-receipt', 'The shared order.tested patch must expose its invisible receipt-to-paint measurement seam.', violations);
  requireText(sources, 'realtimePaint', "OUTBOUND_REALTIME_PAINT_EVENT = 'cf:outbound-realtime-received'", 'missing-outbound-realtime-paint-contract', 'Outbound realtime measurement must expose one versioned, browser-observable event contract.', violations);
  requireText(sources, 'mobileTopBar', '<MobileScanCta />', 'missing-shell-scan-host', 'Orders must inherit the host-owned mobile top bar rather than a page-local scan shell.', violations);
  requireText(sources, 'mobileShell', 'border-border-danger bg-surface-danger', 'missing-mobile-shell-error-tokens', 'The mobile error boundary must use semantic danger surface roles.', violations);
  requireText(sources, 'mobileScanCta', "const MOBILE_SCAN_PATH = '/m/scan';", 'missing-shell-scan-route', 'The permanent Scan control must target the canonical shared scan route.', violations);
  requireText(sources, 'mobileScanCta', 'router.push(MOBILE_SCAN_PATH)', 'missing-shell-scan-navigation', 'The permanent Scan control must navigate through the canonical mobile scan door.', violations);
  requireText(sources, 'mobileScanVerdict', 'border-border-success bg-surface-success', 'missing-mobile-scan-success-tokens', 'The shared scan verdict must use semantic success roles.', violations);
  requireText(sources, 'mobileScanVerdict', 'border-border-warning bg-surface-warning', 'missing-mobile-scan-warning-tokens', 'The shared scan verdict must use semantic warning roles.', violations);
  requireText(sources, 'mobileScanVerdict', 'border-border-danger bg-surface-danger', 'missing-mobile-scan-danger-tokens', 'The shared scan verdict must use semantic danger roles.', violations);
  forbidPattern(sources, 'queue', /\b(?:MobileCameraPanel|MobileCaptureWindow|MobileScanCta)\b|Scan order/, 'orders-local-scan-fork', 'Orders must not mount a local scanner, camera sheet, or competing Scan order CTA.', violations);
  requireText(sources, 'row', 'formatOutboundStoragePath', 'missing-storage-path-law', 'Rows must use the shared storage-path formatter.', violations);
  requireText(sources, 'row', 'PICKED ${', 'missing-pick-progress', 'Rows must paint server-derived pick progress.', violations);
  requireText(sources, 'itemCard', 'resolveOutboundSlaCountdown', 'missing-sla-law', 'The card must use the exact-SLA resolver.', violations);
  requireText(sources, 'facts', 'dockStagedAt', 'missing-dock-stage-fact', 'Scan-out readiness needs the physical DOCK_STAGED fact.', violations);
  requireText(sources, 'facts', 'stateRail', 'missing-state-rail-fact', 'The workflow verdict must own the mobile state-rail role.', violations);
  requireText(sources, 'actions', 'Stage the packed order at the dock first.', 'missing-stage-gate', 'Packed but unstaged work must not unlock scan-out.', violations);
  requireText(sources, 'actions', 'OUTBOUND_TRIAGE_ACTIONS', 'missing-typed-triage-law', 'Triage actions must be stable typed commands.', violations);
  requireText(sources, 'actions', 'OUTBOUND_CHANNEL_TRIAGE_ACTIONS', 'missing-typed-channel-triage-law', 'Marketplace triage commands must be closed typed facts.', violations);
  requireText(sources, 'actions', 'OUTBOUND_PRIORITY_ACTION_IDS', 'missing-priority-action-law', 'Urgent priority must use the shared closed command vocabulary.', violations);
  requireText(sources, 'row', 'triageActions', 'missing-swipe-triage', 'Orders must pass the typed triage commands to the governed left-swipe rail.', violations);
  requireText(sources, 'row', "id: 'hold'", 'missing-swipe-hold', 'Orders must keep hold control in the governed row action rail.', violations);
  requireText(sources, 'row', 'Pass pick', 'missing-row-pass-pick', 'Orders must offer picker handoff from the selected row rather than the administrative sheet.', violations);
  requireText(sources, 'row', 'resolveOutboundPriorityAction', 'missing-row-priority-action', 'Orders must expose the same typed urgent-priority action as the desktop selection plane.', violations);
  requireText(sources, 'queue', 'MobileToShipPickerSheet', 'missing-row-pass-pick-sheet', 'The selected-row handoff must open the dedicated picker-assignment surface.', violations);
  requireText(sources, 'queue', 'testerId: staff.id', 'missing-row-pass-pick-write', 'Pass pick must persist through the canonical picker assignment field.', violations);
  requireText(sources, 'queue', "isUrgent: action.id === 'mark_urgent'", 'missing-row-priority-write', 'The phone priority action must persist through the canonical order assignment mutation.', violations);
  requireText(sources, 'pickerSheet', "staffMatchesStageLane(member, 'technician')", 'missing-row-pass-pick-role', 'Pass pick must target the picker lane, not a freeform staff field.', violations);
  requireText(sources, 'row', 'stateRail={workflow.stateRail}', 'missing-workflow-state-rail', 'Orders must paint the shared workflow state rail, not derive a local color.', violations);
  requireText(sources, 'row', 'outboundOrderId={row.entityId}', 'missing-row-realtime-observability-id', 'Orders must pass its canonical order identity to the governed non-visual measurement anchor.', violations);
  requireText(sources, 'itemCard', 'SWIPE_TRIAGE_REVEAL_PX', 'missing-swipe-triage-rail', 'The shared item row must own the left-swipe triage reveal geometry.', violations);
  requireText(sources, 'itemCard', 'sku:', 'missing-row-sku-anchor', 'Orders must keep the machine SKU on the governed Row 3 trust block.', violations);
  requireText(sources, 'itemCard', 'skuTertiary', 'missing-row-sku-tertiary-face', 'Orders SKU identity must stay present but visually tertiary to the title.', violations);
  requireText(sources, 'itemCard', 'item-card-location-context', 'missing-row-location-context', 'The governed row must lead with the physical bin before platform and order context.', violations);
  requireText(sources, 'itemCard', 'data-outbound-order-id', 'missing-row-realtime-observability-anchor', 'The governed row must expose a non-visual stable identity for receipt-to-paint measurement.', violations);
  requireText(sources, 'itemCard', 'storageContext', 'missing-row-location-fallback', 'An unallocated row must paint explicit missing bin context rather than leave a blank leading region.', violations);
  requireText(sources, 'itemCard', 'item-card-quantity-anchor', 'missing-right-quantity-pillar', 'Quantity and pick verification must remain in one pinned tactical rail.', violations);
  requireText(sources, 'itemCard', 'min-h-11 px-1', 'missing-triage-touch-target', 'Every revealed triage command must retain a 44px minimum target.', violations);
  requireText(sources, 'itemCard', 'item-card-condition', 'missing-row-condition-anchor', 'Orders must keep condition on the governed row.', violations);
  requireText(sources, 'itemCard', '<MicroListingTrigger', 'missing-governed-micro-listing', 'Marketplace verification on a governed row must use the subdued MicroListingTrigger primitive.', violations);
  requireText(sources, 'row', 'listing={listing}', 'missing-row-listing-binding', 'Orders must bind listing identity through the governed row adapter.', violations);
  requireText(sources, 'microListingTrigger', '<Dialog', 'missing-listing-context-overlay', 'A marketplace verification trigger must open inside the governed Dialog overlay.', violations);
  requireText(sources, 'microListingTrigger', '<iframe', 'missing-listing-inspection-frame', 'The context-preserving listing overlay must render the listing inspection frame.', violations);
  forbidPattern(sources, 'microListingTrigger', /window\.open|window\.location|router\.(?:push|replace)/, 'listing-context-breaking-navigation', 'Marketplace verification must not redirect, navigate, or open a new browser window.', violations);
  requireText(sources, 'itemCard', 'formatDateKeyShort', 'missing-calm-future-sla', 'Future SLA work must collapse to a quiet civil date.', violations);
  requireText(sources, 'queue', 'filterToShipByPlatform', 'missing-connected-platform-filter', 'Orders must filter by the connected platform through the shared domain filter.', violations);
  requireText(sources, 'queue', 'to-ship-platform-filter', 'missing-connected-platform-control', 'Orders must expose the connected-platform filter control.', violations);
  requireText(sources, 'row', 'min-h-11 flex-1', 'missing-selected-row-touch-target', 'Selected Orders row controls must retain 44px minimum targets.', violations);
  requireText(sources, 'row', 'price={toShipPriceText(row)}', 'missing-governed-orders-price', 'Orders must project the canonical sale amount through the shared price formatter.', violations);
  requireText(sources, 'pickQueueRow', 'price={formatSalePrice(row.saleAmount, row.currency) || null}', 'missing-governed-pick-price', 'Pick rows must project the canonical sale amount through the shared price formatter.', violations);
  requireText(sources, 'itemCard', 'item-card-price', 'missing-governed-tactical-price', 'Tactical rows must render the governed Row 3 price fact when the canonical amount exists.', violations);
  requireText(sources, 'mobilePackingRow', 'mobile-packing-row-price', 'missing-governed-packing-price', 'Packing rows must render the canonical sale amount when the packing feed provides it.', violations);
  requireText(sources, 'actions', "persistedAs: 'discrepancy'", 'missing-discrepancy-persistence', 'Flag discrepancy must persist as a named order fact.', violations);
  requireText(sources, 'ordersApi', 'allocation_facts', 'missing-allocation-facts', 'Orders API must project allocation progress and locations.', violations);
  requireText(sources, 'handlingFacts', 'OUTBOUND_HANDLING_FACTS', 'missing-handling-fact-law', 'Handling warnings must come from one closed outbound vocabulary.', violations);
  requireText(sources, 'skuCatalogSchema', 'handlingFacts', 'missing-handling-fact-schema', 'Catalog writes must validate handling facts against the shared vocabulary.', violations);
  requireText(sources, 'ordersApi', "to_jsonb(sc)->'handling_flags' AS catalog_handling_flags", 'missing-catalog-handling-projection', 'Orders must project catalog handling facts instead of reading order notes.', violations);
  requireText(sources, 'workRowAdapter', 'normalizeOutboundHandlingFacts(row.catalog_handling_flags)', 'missing-handling-row-projection', 'The shared Orders adapter must preserve normalized catalog handling facts for the governed row.', violations);
  requireText(sources, 'row', 'outboundHandlingFactFaces', 'missing-governed-handling-row-face', 'The Orders row must adapt safety flags through the shared handling law.', violations);
  requireText(sources, 'itemCard', 'item-card-handling-facts', 'missing-handling-banner', 'Governed handling facts must paint a full-width row warning strip when present.', violations);
  requireText(sources, 'itemCard', '<Alert', 'missing-handling-alert-primitive', 'The handling strip must compose the governed alert primitive.', violations);
  requireText(sources, 'orderDetail', 'cornerClass', 'missing-order-detail-corner-role', 'Order detail controls must name their sanctioned corner role instead of writing a radius utility.', violations);
  requireText(sources, 'orderDetail', 'border-t-border-accent', 'missing-order-detail-semantic-spinner', 'Order detail loading feedback must use semantic accent border ink.', violations);
  requireText(sources, 'orderDetail', 'bg-surface-card', 'missing-order-detail-semantic-action-dock', 'Order detail action dock must use the semantic surface, not a page-local gradient.', violations);
  forbidPattern(sources, 'orderDetail', /\bGlassButton\b|bg-gradient-to-t/, 'order-detail-legacy-chrome', 'Order detail actions must use the canonical Button face without legacy glass or palette-gradient chrome.', violations);
  requireText(sources, 'fbaPlanRail', "PLANNED: 'bg-fill-warning'", 'missing-fba-plan-rail-token', 'FBA plan markers must use semantic fill roles.', violations);
  requireText(sources, 'fbaPlanInput', 'ThemedStationScanBar', 'missing-fba-shared-scan-host', 'FBA planning must retain the governed station scan host.', violations);
  requireText(sources, 'fbaPlanQueue', 'radius="flush"', 'missing-fba-plan-action-radius', 'FBA plan confirmation uses canonical flush action geometry.', violations);
  requireText(sources, 'fbaPlanQty', 'border-border-danger', 'missing-fba-quantity-danger-token', 'FBA quantity depletion must use semantic danger feedback.', violations);
  requireText(sources, 'fbaSelectedLine', 'text-text-success', 'missing-fba-selected-line-token', 'FBA selected-line success feedback must be semantic.', violations);
  requireText(sources, 'fbaStatus', 'bg-surface-success', 'missing-fba-status-token', 'FBA status faces must use semantic surfaces.', violations);
  requireText(sources, 'fbaError', 'border-border-danger', 'missing-fba-error-token', 'FBA error feedback must use semantic danger roles.', violations);
  requireText(sources, 'fbaShipmentRail', "scope?: FbaShipmentRailScope", 'missing-fba-shipped-projection', 'FBA Shipped must use the existing shipment controller in a typed history scope.', violations);
  requireText(sources, 'fbaShipmentCard', 'border-border-success bg-surface-success', 'missing-fba-shipped-date-token', 'FBA shipped evidence must use semantic success roles.', violations);
  requireText(sources, 'fbaWorkspaceSidebar', 'border-border-danger bg-surface-danger', 'missing-fba-sidebar-error-token', 'FBA sidebar error feedback must use semantic danger roles.', violations);
  requireText(sources, 'mobileFbaPlan', '/api/fba/shipments/today/items', 'missing-mobile-fba-plan-write', 'The mobile FBA plan task must use the canonical today-plan write.', violations);
  requireText(sources, 'mobileFbaPlan', "appearance=\"flush\"", 'missing-mobile-fba-plan-field-role', 'The mobile FBA plan field must retain the joined industrial control role.', violations);
  requireText(sources, 'mobileFbaScan', '/api/fba/items/scan', 'missing-mobile-fba-scan-write', 'The mobile FBA unit task must use the canonical scan write.', violations);
  requireText(sources, 'mobileFbaVerify', '/api/fba/items/verify', 'missing-mobile-fba-verify-write', 'The mobile FBA verification task must use the canonical verify write.', violations);
  requireText(sources, 'mobileFbaLabel', '/api/fba/labels/bind', 'missing-mobile-fba-label-write', 'The mobile FBA label task must use the canonical label binding write.', violations);
  requireText(sources, 'mobileFbaClose', '/api/fba/shipments/close', 'missing-mobile-fba-close-write', 'The mobile FBA close task must use the canonical protected close write.', violations);
  requireText(sources, 'mobileFbaClose', 'force: false', 'missing-mobile-fba-close-safety', 'The mobile FBA close task must retain the standard non-force safety path.', violations);
  requireText(sources, 'fbaQuickAdd', 'text-text-danger', 'missing-fba-quick-add-error-token', 'FBA quick-add errors must use semantic danger ink.', violations);
  requireText(sources, 'fbaCreatePlan', 'DateRangePickerField', 'missing-fba-plan-date-picker', 'FBA planning must use the shared date field.', violations);
  requireText(sources, 'fbaCreatePlan', 'variant="compact"', 'missing-fba-plan-compact-date', 'An FBA plan due date is one civil day, not a filter range.', violations);
  requireText(sources, 'fbaCreatePlan', 'localDateToDateKey', 'missing-fba-plan-date-key-bridge', 'The calendar day must persist as the canonical civil date key.', violations);
  requireText(sources, 'fbaCreatePlan', 'text-text-danger', 'missing-fba-plan-error-token', 'FBA create errors must use semantic danger ink.', violations);
  requireText(sources, 'fbaCreatePlan', 'StageStaffAssignPopover', 'missing-fba-plan-staff-picker', 'FBA plan people fields must use the canonical staff picker.', violations);
  requireText(sources, 'fbaCreatePlan', 'StaffAvatar', 'missing-fba-plan-staff-avatar', 'FBA plan assignee triggers must identify people with the shared avatar.', violations);
  requireText(sources, 'fbaBoardDetail', 'bg-surface-accent', 'missing-fba-board-scan-token', 'FBA scan activity must use the semantic accent surface.', violations);
  requireText(sources, 'fbaBoardPlanEntry', 'radius="flush"', 'missing-fba-board-entry-radius', 'FBA board entry actions use the canonical flush geometry.', violations);
  requireText(sources, 'fbaBoardPlanEntry', 'border-border-danger bg-surface-danger', 'missing-fba-board-entry-danger-token', 'FBA board deletion confirmation uses semantic danger roles.', violations);
  requireText(sources, 'fbaBoardDelete', 'border-border-danger bg-surface-danger', 'missing-fba-board-delete-danger-token', 'FBA board delete failure uses semantic danger roles.', violations);
  requireText(sources, 'fbaCreateModal', 'radius="flush"', 'missing-fba-create-modal-close-radius', 'FBA create-plan modal close uses the canonical flush icon control.', violations);
  requireText(sources, 'fbaCatalogInfo', 'size="xs"', 'missing-fba-catalog-edit-size', 'FBA catalog edit uses the compact canonical icon-control size.', violations);
  requireText(sources, 'fbaCatalogInfo', 'radius="flush"', 'missing-fba-catalog-edit-radius', 'FBA catalog edit uses the canonical flush geometry.', violations);
  requireText(sources, 'fbaScanToast', 'bg-surface-accent', 'missing-fba-scan-toast-accent-surface', 'FBA scan feedback must use the semantic accent surface.', violations);
  requireText(sources, 'fbaScanToast', 'radius="flush"', 'missing-fba-scan-toast-flush-controls', 'FBA scan-toast controls use the canonical flush geometry.', violations);
  requireText(sources, 'fbaQtySplit', 'border-border-accent', 'missing-fba-qty-split-accent-border', 'FBA quantity split uses the semantic accent overlay role.', violations);
  requireText(sources, 'fbaQtySplit', 'radius="flush"', 'missing-fba-qty-split-flush-actions', 'FBA quantity-split actions use canonical flush geometry.', violations);
  requireText(sources, 'fbaQtySidebar', 'border-border-danger', 'missing-fba-sidebar-qty-danger-token', 'FBA sidebar quantity depletion uses semantic danger roles.', violations);
  requireText(sources, 'fbaQtySidebar', 'radius="flush"', 'missing-fba-sidebar-qty-flush-controls', 'FBA sidebar quantity controls use canonical flush geometry.', violations);
  requireText(sources, 'fbaUnallocated', 'border-border-success bg-surface-success', 'missing-fba-unallocated-drop-token', 'FBA unallocated drag target uses semantic success feedback.', violations);
  requireText(sources, 'fbaTrackingBucket', 'border-border-accent bg-surface-accent', 'missing-fba-tracking-bucket-accent-token', 'FBA tracking buckets use semantic accent feedback.', violations);
  requireText(sources, 'fbaTrackingBundle', '<TextField', 'missing-fba-tracking-field', 'FBA tracking entry must use the governed text field.', violations);
  requireText(sources, 'fbaTrackingBundle', 'radius="flush"', 'missing-fba-tracking-bundle-flush-actions', 'FBA tracking-bundle actions use canonical flush geometry.', violations);
  requireText(sources, 'fbaTrackingGroup', 'border-border-accent bg-surface-accent', 'missing-fba-tracking-group-accent-token', 'FBA tracking-group state uses semantic accent roles.', violations);
  requireText(sources, 'fbaCatalogSidebar', '<Button', 'missing-fba-catalog-action-primitive', 'FBA catalog actions use the canonical button primitive.', violations);
  requireText(sources, 'fbaCatalogSidebar', 'border-border-accent bg-surface-accent', 'missing-fba-catalog-station-token', 'FBA catalog station hand-off uses semantic accent roles.', violations);
  requireText(sources, 'fbaWorkspaceScanField', '<TextField', 'missing-fba-workspace-tracking-field', 'FBA tracking identifiers use the governed text-field primitive.', violations);
  requireText(sources, 'fbaWorkspaceScanField', 'radius="flush"', 'missing-fba-workspace-tracking-flush-actions', 'FBA tracking actions use the canonical flush geometry.', violations);
  requireText(sources, 'fbaCombineWorkspace', 'radius="flush"', 'missing-fba-combine-close-radius', 'FBA combine close control uses canonical flush geometry.', violations);
  requireText(sources, 'fbaShipmentEditor', '<TextField', 'missing-fba-editor-field', 'FBA shipment identifiers use the governed text-field primitive.', violations);
  requireText(sources, 'fbaShipmentEditor', 'radius="flush"', 'missing-fba-editor-flush-controls', 'FBA shipment-editor controls use canonical flush geometry.', violations);
  requireText(sources, 'fbaShipmentEditor', '<Button', 'missing-fba-editor-action-primitive', 'FBA shipment-editor actions use the canonical button primitive.', violations);
  requireText(sources, 'fbaEditorUnallocated', 'border-border-warning bg-surface-warning', 'missing-fba-editor-unallocated-warning-token', 'FBA unallocated drag feedback uses semantic warning roles.', violations);
  requireText(sources, 'fbaEditorUnallocated', 'radius="flush"', 'missing-fba-editor-unallocated-flush-action', 'FBA unallocated-row actions use canonical flush geometry.', violations);
  requireText(sources, 'fbaEditorFnskuSearch', '<TextField', 'missing-fba-editor-fnsku-search-field', 'FBA catalog search uses the governed text-field primitive.', violations);
  requireText(sources, 'fbaEditorFnskuSearch', 'radius="flush"', 'missing-fba-editor-fnsku-search-flush-controls', 'FBA catalog-search controls use canonical flush geometry.', violations);
  requireText(sources, 'fbaPairedReviewStrip', '<Button', 'missing-fba-paired-review-strip-button', 'FBA collapsed review uses the canonical button primitive.', violations);
  requireText(sources, 'fbaPairedReviewStrip', 'radius="flush"', 'missing-fba-paired-review-strip-radius', 'FBA collapsed review uses canonical flush geometry.', violations);
  requireText(sources, 'fbaPairedReviewPanel', '<TextField', 'missing-fba-paired-review-panel-field', 'FBA paired-review identifiers use the governed text-field primitive.', violations);
  requireText(sources, 'fbaPairedReviewPanel', 'radius="flush"', 'missing-fba-paired-review-panel-radius', 'FBA paired-review panel controls use canonical flush geometry.', violations);
  requireText(sources, 'fbaPairedReviewWorkspace', '<TextField', 'missing-fba-paired-review-workspace-field', 'FBA paired-review workspace identifiers use the governed text-field primitive.', violations);
  requireText(sources, 'fbaPairedReviewWorkspace', 'radius="flush"', 'missing-fba-paired-review-workspace-radius', 'FBA paired-review workspace controls use canonical flush geometry.', violations);
  requireText(sources, 'fbaCheckbox', '<Button', 'missing-fba-checkbox-button-primitive', 'FBA selection controls compose the canonical button primitive.', violations);
  requireText(sources, 'fbaCheckbox', 'radius="flush"', 'missing-fba-checkbox-flush-radius', 'FBA selection controls use canonical flush geometry.', violations);
  requireText(sources, 'mobilePackingRow', 'radius="flush"', 'missing-mobile-pack-row-flush-cta', 'Mobile packing-photo actions use canonical flush geometry.', violations);
  requireText(sources, 'mobilePackingRow', 'bg-fill-success', 'missing-mobile-pack-row-semantic-source', 'Mobile packing source marks use semantic fill roles.', violations);
  requireText(sources, 'mobilePackingSheet', 'radius="flush"', 'missing-mobile-pack-sheet-flush-cta', 'Mobile packing-sheet actions use canonical flush geometry.', violations);
  requireText(sources, 'mobilePackingSheet', 'bg-surface-warning', 'missing-mobile-pack-sheet-warning-token', 'Mobile packing feedback uses semantic warning surfaces.', violations);
  requireText(sources, 'mobilePackingRoute', '<MobilePackingList', 'missing-mobile-pack-door', 'Packing history and capture evidence require a dedicated mobile route.', violations);
  requireText(sources, 'pickerShells', 'onStartPacking', 'missing-pick-to-pack-handoff', 'A completed mobile pick must expose the governed packing handoff.', violations);
  requireText(sources, 'pickerShells', 'Start packing', 'missing-pick-to-pack-action', 'The pick completion face must make the next physical task explicit.', violations);
  requireText(sources, 'pickerTaskCard', 'border-border-danger bg-surface-danger', 'missing-pick-task-error-tokens', 'Pick scan errors must use semantic danger roles.', violations);
  requireText(sources, 'mobilePickSession', "cornerClass('pill')", 'missing-pick-session-identity-corner-role', 'Pick-session identity must use the named radius role.', violations);
  requireText(sources, 'mobilePickSession', 'border-border-success bg-surface-success text-text-success', 'missing-pick-session-tote-success-tokens', 'An armed tote must use semantic success roles.', violations);
  requireText(sources, 'mobilePickSession', 'border-border-warning bg-surface-warning text-text-warning', 'missing-pick-session-tote-warning-tokens', 'An unarmed tote must use semantic warning roles.', violations);
  requireText(sources, 'mobilePackStartRoute', '/api/packing-logs/draft', 'missing-mobile-pack-start', 'The phone must mint or resume an evidence parent before capture begins.', violations);
  requireText(sources, 'mobilePackStartRoute', 'body.packerLogId', 'missing-mobile-pack-draft-result', 'The capture route must use the durable pack-log identifier returned by the draft writer.', violations);
  requireText(sources, 'mobilePackStartRoute', "complete: '1'", 'missing-mobile-pack-completion-intent', 'The phone capture route must explicitly enter completion mode.', violations);
  requireText(sources, 'mobileWorkflow', "id: 'pack-order'", 'missing-pack-workflow-stage', 'The shared workflow contract must retain the packing stage.', violations);
  requireText(sources, 'mobileWorkflow', "mobilePath: '/m/pack'", 'missing-canonical-mobile-pack-path', 'The packing stage must name its canonical mobile door.', violations);
  requirePattern(sources, 'mobileWorkflow', /id: 'pack-order',[^}]*?mobilePath: '\/m\/pack',[^}]*?completion: 'live'/, 'packing-completion-not-ratified', 'A verified phone pack path must be recorded as a completed mobile workflow capability.', violations);
  requireText(sources, 'shipmentStatusBadge', 'bg-surface-accent text-text-accent', 'missing-shipment-status-info-token', 'Carrier movement status must use the semantic info surface.', violations);
  requireText(sources, 'shipmentStatusBadge', 'bg-fill-danger', 'missing-shipment-status-danger-token', 'Carrier exception status must use the semantic danger fill.', violations);
  requireText(sources, 'shippedFilterControls', '<Button', 'missing-shipped-attention-button', 'Shipping exception filtering must use the canonical Button primitive.', violations);
  requireText(sources, 'shippedFilterControls', 'radius="flush"', 'missing-shipped-attention-radius', 'Shipping exception filtering uses the governed flush control face.', violations);
  requireText(sources, 'shippedCarrierFilters', '<Button', 'missing-shipped-filter-button', 'Shipping filter triggers and chips must use the canonical Button primitive.', violations);
  requireText(sources, 'shippedCarrierFilters', 'FILTER_DROPDOWN_SELECT_CLASS', 'missing-shipped-filter-field-contract', 'Shipping filters must consume the shared semantic select field.', violations);
  requireText(sources, 'shippedFilterDropdown', 'FILTER_DROPDOWN_SELECT_CLASS', 'missing-shipped-dropdown-field-contract', 'Shipping filter dropdown must consume the shared semantic select field.', violations);
  requireText(sources, 'filterDropdownSelect', "cornerClass('field')", 'missing-filter-dropdown-radius-role', 'The shared shipping select field must resolve its corner from the radius role.', violations);
  requireText(sources, 'staffButtonGrid', "cornerClass('control')", 'missing-staff-grid-corner-role', 'Shipping staff assignment cells must use the named control corner role.', violations);
  forbidPattern(sources, 'staffButtonGrid', /\bshadow-/, 'staff-grid-shadowed-selection', 'Staff assignment selection is a flat semantic state, never an elevated card.', violations);
  requireText(sources, 'captureStackRow', 'border-border-emphasis', 'missing-outbound-capture-boundary', 'Expanded outbound packing records use a flat semantic boundary, never card shadow chrome.', violations);
  requireText(sources, 'captureStackRow', 'active:bg-surface-sunken', 'missing-outbound-capture-press-surface', 'Capture-stack press feedback must use the semantic sunken surface.', violations);
  requireText(sources, 'packingLogCreateApi', 'mirrorLegacyPackingToAllocations', 'missing-pack-create-packed-mirror', 'Pack-log creation must end at PACKED, not carrier SHIPPED.', violations);
  requireText(sources, 'packerLogCompletion', "'CAPTURING'", 'missing-pack-capture-state', 'Photo capture must have a pre-completion state distinct from a packed fact.', violations);
  requireText(sources, 'packingLogDraftApi', 'startPackerLogCapture', 'missing-mobile-pack-draft-writer', 'Phone packing must enter the canonical durable evidence writer before it can finish.', violations);
  requireText(sources, 'packerLogWriter', 'PACKER_LOG_CAPTURING', 'missing-mobile-pack-draft', 'Phone packing must mint a durable evidence parent before it can finish.', violations);
  requireText(sources, 'packerLogWriter', 'ON CONFLICT (organization_id, shipment_id)', 'missing-pack-draft-resume', 'Re-entering an active phone pack must resume its evidence parent rather than create a duplicate.', violations);
  requireText(sources, 'packingLogUpdateApi', 'mirrorLegacyPackingToAllocations', 'missing-pack-update-packed-mirror', 'Pack-log finalization must end at PACKED, not carrier SHIPPED.', violations);
  requireText(sources, 'packingLogUpdateApi', 'draftPackerLogId', 'missing-pack-draft-finalizer', 'The completion writer must finalize the existing photo-evidence parent.', violations);
  requireText(sources, 'packingLogUpdateApi', "completion_state = 'COMPLETED'", 'missing-pack-completion-transition', 'Finalizing a mobile pack must atomically promote CAPTURING evidence to a completed pack fact.', violations);
  requireText(sources, 'packingLogUpdateApi', 'Capture at least one packing photo before finishing.', 'missing-pack-evidence-gate', 'A mobile pack must not complete before at least one attached photo is durable.', violations);
  requireText(sources, 'mobilePackerPhotoStudio', 'completePacking', 'missing-mobile-pack-completion-mode', 'The photo studio must distinguish evidence-only capture from physical pack completion.', violations);
  requireText(sources, 'mobilePackerPhotoStudio', 'waitForScope(packerLogId)', 'missing-mobile-pack-upload-settle', 'The photo studio must wait for each evidence upload before verifying and completing a pack.', violations);
  requireText(sources, 'mobilePackerPhotoStudio', 'submitPackVerification', 'missing-mobile-pack-verification', 'The phone must verify the final evidence set before it can complete a pack.', violations);
  requireText(sources, 'mobilePackerPhotoStudio', "fetch('/api/packing-logs/update'", 'missing-mobile-pack-finalize-request', 'The verified phone flow must call the canonical pack finalizer.', violations);
  requireText(sources, 'mobilePackerPhotoStudio', 'draftPackerLogId: packerLogId', 'missing-mobile-pack-finalize-identity', 'The finalizer must promote the same durable photo-evidence parent.', violations);
  requireText(sources, 'ordersApi', "completion_state = 'COMPLETED'", 'draft-counts-as-packed', 'A CAPTURING photo parent must not make an order appear packed.', violations);
  requireText(sources, 'scanOutApi', 'mirrorLegacyPackToAllocations', 'missing-scanout-shipped-mirror', 'Only dock scan-out owns the terminal SHIPPED mirror.', violations);
  requireText(sources, 'packStationPanel', 'StationScanPaneHost', 'missing-pack-station-host', 'Packing must stay inside the existing governed station host.', violations);
  requireText(sources, 'packStationPanel', 'OrderPackChecklist', 'missing-pack-station-checklist', 'Packing station must render the same canonical pack checklist used by the mobile evidence flow.', violations);
  requireText(sources, 'packStationPanel', 'useOrderPackChecklist', 'missing-pack-station-facts', 'Packing station must consume the canonical packing checklist facts.', violations);
  requireText(sources, 'packStationPanel', 'StationDisplaysPushStack', 'missing-pack-station-displays', 'Packing documentation remains in the governed station Displays stack.', violations);
  requireText(sources, 'packAwaitingFeedback', "cornerClass('surface')", 'missing-pack-awaiting-corner-role', 'Pack-awaiting feedback must use its named surface corner role.', violations);
  requireText(sources, 'packPapersStatus', 'border-border-warning bg-surface-warning', 'missing-pack-papers-warning-tokens', 'Pack-paper exceptions must use semantic warning roles.', violations);
  requireText(sources, 'packPapersStatus', 'border-border-success bg-surface-success', 'missing-pack-papers-success-tokens', 'Pack-paper success feedback must use semantic success roles.', violations);
  requireText(sources, 'packerPageContent', 'radius="flush"', 'missing-packer-mobile-nav-radius-role', 'Packing mobile header controls must use the governed flush action face.', violations);
  requireText(sources, 'mobilePackingSheet', 'OrderPackChecklist', 'missing-mobile-pack-checklist', 'Phone packing must use the same canonical pack checklist as its station projection.', violations);
  requireText(sources, 'mobileDockStagingTask', "fetch('/api/shipping/mark-staged'", 'missing-mobile-dock-stage-write', 'Phone staging must persist the physical dock fact through the canonical writer.', violations);
  requireText(sources, 'mobileDockStagingTask', 'void queryClient.invalidateQueries', 'missing-mobile-dock-stage-nonblocking-refresh', 'A completed rack scan must refresh staging work without delaying the carrier-scan handoff.', violations);
  requireText(sources, 'mobileDockStagingTask', "router.replace('/m/shipping/scan-out')", 'missing-mobile-dock-stage-handoff', 'A staged carton must advance to the canonical mobile carrier scan-out queue.', violations);
  requireText(sources, 'stagedDeskQueue', "fetch('/api/shipping/mark-staged'", 'missing-desk-dock-stage-write', 'Desktop staging must share the canonical dock-stage writer used by phone.', violations);
  requireText(sources, 'mobileScanOutTask', 'identificationFromScanOut', 'missing-mobile-scanout-facts', 'Phone scan-out must map its carton through the canonical scan-out identity facts.', violations);
  requireText(sources, 'scanOutStationWorkspace', 'motionRole.swap.scan', 'missing-scanout-station-motion-role', 'Scan-out station must use the named station swap role.', violations);
  requireText(sources, 'scanOutStationWorkspace', 'ScanOutComposerDock', 'missing-scanout-station-mouth', 'Scan-out station must retain its one governed floor mouth.', violations);
  requireText(sources, 'scanOutStationWorkspace', 'bustScanOutCaches', 'missing-scanout-station-cache-bridge', 'Scan-out station must invalidate the same outbound facts consumed by its phone queue.', violations);
  requireText(sources, 'scanOutStationDock', 'useScanOutStation', 'missing-scanout-station-facts', 'Scan-out station must consume the canonical scan-out station facts.', violations);
  requireText(sources, 'scanOutStationDock', 'StationComposerHost', 'missing-scanout-composer-host', 'Scan-out station must use StationComposerHost rather than a bespoke dock.', violations);
  requireText(sources, 'scanOutStationDock', 'showModeFaces={false}', 'missing-scanout-mode-face-contract', 'Scan-out remains a dumb-gun station with only the procedure ring.', violations);
  requireText(sources, 'scanOutStationDock', 'showModeRow', 'missing-scanout-mode-row-contract', 'Scan-out must keep the governed procedure row available.', violations);
  requireText(sources, 'scanOutStationDock', 'useRegisterScanSink', 'missing-scanout-wedge-sink', 'The station wedge is an input enhancement over the same scan-out action.', violations);
  requireText(sources, 'scanOutStationDock', 'requestStationComposerFocus', 'missing-scanout-wedge-focus', 'Station focus must return to the shared composer after a scan.', violations);

  if (sources.fbaCreatePlan.includes('type="date"')) {
    violations.push({
      id: 'native-fba-plan-date',
      file: 'fbaCreatePlan',
      why: 'FBA plan due dates mount DateRangePickerField variant="compact", never a native date input.',
    });
  }
  if (sources.fbaCreatePlan.includes('<select')) {
    violations.push({
      id: 'native-fba-plan-staff-select',
      file: 'fbaCreatePlan',
      why: 'FBA plan technician and packer fields mount StageStaffAssignPopover, never native selects.',
    });
  }

  for (const [file, source] of Object.entries(sources) as Array<[keyof typeof OUTBOUND_WORKFLOW_COHORT_FILES, string]>) {
    if (hasRawStyleUtility(source)) {
      violations.push({ id: 'raw-style-utility', file, why: 'Governed outbound files use semantic tokens and named radius/elevation roles.' });
    }
  }

  if (sources.queue.includes('<NetworkChip') || sources.queue.includes('showProcessAction') || sources.queue.includes('onProcess')) {
    violations.push({ id: 'orders-execution-or-live-chrome', file: 'queue', why: 'Orders has no visible live chrome and no Pick/Pack execution seam.' });
  }
  if (sources.sheet.includes('OUTBOUND_TRIAGE_ACTIONS') || sources.sheet.includes('ToShipQtyFace')) {
    violations.push({ id: 'execution-in-administrative-sheet', file: 'sheet', why: 'The opened sheet is documentation and administration only; triage and quantity stay on the row.' });
  }
  if (
    sources.mobilePackingRow.includes('whileTap') ||
    sources.mobilePackingSheet.includes('whileTap') ||
    sources.mobilePackerPhotoStudio.includes('whileTap')
  ) {
    violations.push({ id: 'inline-mobile-pack-press-physics', file: 'mobilePackingRow', why: 'Mobile packing actions rely on the shared Button press role, never page-local motion physics.' });
  }
  if (sources.captureStackRow.includes('rounded-2xl') || sources.captureStackRow.includes('shadow-[')) {
    violations.push({ id: 'rounded-or-shadowed-outbound-capture-row', file: 'captureStackRow', why: 'Outbound packing rows remain flat records; rounded and shadowed card chrome is not permitted.' });
  }
  if (sources.packingLogCreateApi.includes("SET status = 'shipped'") || sources.packingLogUpdateApi.includes("SET status = 'shipped'")) {
    violations.push({ id: 'packing-prematurely-ships-order', file: 'packingLogCreateApi', why: 'Packing may write PACKED, but only dock scan-out may set an order to SHIPPED.' });
  }
  if (sources.packingLogDraftApi.includes('createStationActivityLog') || sources.packingLogDraftApi.includes('mirrorLegacyPackingToAllocations')) {
    violations.push({ id: 'draft-performs-pack-completion', file: 'packingLogDraftApi', why: 'Starting a photo-evidence session must not write the physical PACKED fact.' });
  }

  return { schemaVersion: OUTBOUND_WORKFLOW_COHORT_VERSION, analysis: 'deterministic-source-contract', ok: violations.length === 0, violations };
}
