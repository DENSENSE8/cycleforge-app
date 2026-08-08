/**
 * Mount-gated URL opens must compose the paint-pending SoT — not a third
 * local pending twin. Sync-guard surfaces (Dashboard openOrderId, Receiving
 * openReceivingId) are a different job and are not ratcheted here.
 *
 *   node --import tsx --test src/lib/routing/optimistic-url-param.guard.test.ts
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');
}

const read = (rel: string) => stripComments(readFileSync(join(process.cwd(), rel), 'utf8'));

describe('Optimistic URL-param paint SoT', () => {
  it('pure helpers + hook exist as the named SoT', () => {
    const sot = read('src/lib/routing/optimistic-url-param.ts');
    const hook = read('src/hooks/useOptimisticUrlParam.ts');
    assert.match(sot, /export function resolveOptimisticParam/);
    assert.match(sot, /export function shouldClearOptimisticParam/);
    assert.match(sot, /export function resolveOptimisticParams/);
    assert.match(sot, /export function shouldClearOptimisticParams/);
    assert.match(sot, /export function readLiveSearchParams/);
    assert.match(hook, /from '@\/lib\/routing\/optimistic-url-param'/);
    assert.match(hook, /export function useOptimisticUrlParam/);
    assert.match(hook, /export function useOptimisticUrlParams/);
  });

  it('Outbound open / new compose the hook', () => {
    const outbound = read('src/hooks/useOutboundUrlState.ts');
    assert.match(outbound, /useOptimisticUrlParam/);
    assert.match(outbound, /urlValue: urlOpen/);
    assert.match(outbound, /urlValue: urlNewOpen/);
  });

  it('Search sel is paint-pending at the page (browse receives setSel)', () => {
    const page = read('src/app/search/page.tsx');
    const browse = read('src/components/search/SearchBrowseShell.tsx');
    const hook = read('src/hooks/useSearchSelParam.ts');
    assert.match(page, /useSearchSelParam/);
    assert.match(page, /setSel=\{setSel\}/);
    assert.match(browse, /setSel:\s*\(next:\s*SearchSelection\s*\|\s*null\)\s*=>\s*void/);
    assert.match(hook, /useOptimisticUrlParam/);
  });

  it('Inventory sidebar.open composes the hook', () => {
    const inv = read('src/components/inventory/useInventoryUrlState.ts');
    assert.match(inv, /useOptimisticUrlParam/);
    assert.match(inv, /setOpen\(next\.open\)/);
    assert.match(inv, /shareKey:\s*['"]inventory:open['"]/);
  });

  it('Inventory Triage/Pulse open writers route through the inventory hook', () => {
    const triage = read('src/components/inventory/sidebar/InventoryTriageSidebar.tsx');
    const pulse = read('src/components/inventory/sidebar/InventoryPulseSidebar.tsx');
    assert.match(triage, /useInventoryUrlState/);
    assert.match(triage, /setSidebarUrl\(\{\s*open:/);
    assert.doesNotMatch(
      triage,
      /router\.replace/,
      'Triage must not raw-replace ?open= beside the inventory SoT',
    );
    assert.match(pulse, /useInventoryUrlState/);
    assert.match(pulse, /setSidebarUrl\(\{\s*open:/);
    assert.doesNotMatch(
      pulse,
      /router\.replace/,
      'Pulse must not raw-replace ?open= beside the inventory SoT',
    );
  });

  it('Support ticket writers compose useSupportTicketParam + shareKey', () => {
    const hook = read('src/hooks/useSupportTicketParam.ts');
    const workspace = read('src/components/support/zendesk/SupportTicketsWorkspace.tsx');
    const board = read('src/components/support/zendesk/SupportTicketsBoard.tsx');
    const rail = read('src/components/support/zendesk/queue/SupportTicketsRecentRail.tsx');
    assert.match(hook, /useOptimisticUrlParam/);
    assert.match(hook, /shareKey:\s*['"]support:ticket['"]/);
    assert.match(workspace, /useSupportTicketParam/);
    assert.match(board, /setTicket/);
    assert.match(board, /paintTicket\(null\)/);
    assert.match(rail, /useSupportTicketParam/);
    assert.doesNotMatch(
      rail,
      /router\.push|router\.replace/,
      'Recent rail must not raw-navigate ?ticket= beside the SoT',
    );
  });

  it('Support order openOrderId is paint-pending only under context=support', () => {
    const hook = read('src/hooks/useSupportOrderOpenParam.ts');
    const desk = read('src/components/outbound/orders/OutboundOrdersDesk.tsx');
    const focus = read('src/components/support/orders/SupportOrdersFocusHost.tsx');
    assert.match(hook, /useOptimisticUrlParam/);
    assert.match(hook, /shareKey:\s*enabled\s*\?\s*['"]support:openOrderId['"]/);
    assert.match(desk, /useSupportOrderOpenParam\(isSupportContext\)/);
    assert.match(desk, /useDashboardSelectedOrder\(detailsEnabled && !isSupportContext\)/);
    assert.match(desk, /onClear=\{\(\) => setOpenOrderId\(null\)\}/);
    assert.match(focus, /onClear:\s*\(\) => void/);
    assert.match(focus, /const clearOpenOrder = onClear/);
  });

  it('Labels / ScanOut mount gates read open from useOutboundUrlState', () => {
    const labels = read('src/components/outbound/workspaces/LabelsWorkspace.tsx');
    const scanOut = read('src/components/outbound/workspaces/ScanOutWorkspace.tsx');
    assert.match(labels, /useOutboundUrlState/);
    assert.match(scanOut, /useOutboundUrlState/);
    assert.doesNotMatch(
      labels,
      /useState<.*>\(\s*null\s*\).*open|pendingOpen/,
      'Labels must not fork a local open pending beside the SoT',
    );
    assert.doesNotMatch(
      scanOut,
      /pendingOpen|useState<.*>\(\s*null\s*\).*open/,
      'ScanOut must not fork a local open pending beside the SoT',
    );
  });

  it('useNewOrderParam + Dashboard intake compose the paint-pending SoT', () => {
    const neu = read('src/hooks/useNewOrderParam.ts');
    const dash = read('src/hooks/useDashboardSearchController.ts');
    const repair = read('src/hooks/useRepairNewParam.ts');
    assert.match(neu, /useOptimisticUrlParam/);
    assert.match(dash, /useOptimisticUrlParam/);
    assert.match(dash, /showIntakeForm/);
    assert.match(repair, /shareKey:\s*['"]repair:new['"]/);
  });

  it('Warranty open + My Day task/watch compose SoT resolve/paint', () => {
    const warranty = read('src/hooks/useWarrantyClaims.ts');
    const myDay = read('src/features/my-day/useMyDayView.ts');
    assert.match(warranty, /useOptimisticUrlParam/);
    assert.match(warranty, /shareKey:\s*['"]warranty:open['"]/);
    assert.match(myDay, /useOptimisticUrlParams/);
    assert.doesNotMatch(
      myDay,
      /useState<\s*DetailSnap\s*\|\s*undefined>|useState<\s*\{[^}]*taskId/,
      'My Day must not fork a bare useState pending twin for detail',
    );
    assert.doesNotMatch(
      myDay,
      /setPendingDetail/,
      'My Day detail pending goes through the plural hook, not a local twin',
    );
  });

  it('Support vm + issueId compose shared paint-pending hooks', () => {
    const vm = read('src/hooks/useSupportVmParam.ts');
    const issue = read('src/hooks/useSupportIssueParam.ts');
    const workspace = read('src/components/support/zendesk/SupportWorkspace.tsx');
    const queue = read('src/components/support/voice/VoicemailQueue.tsx');
    const issuesWs = read('src/components/support/issues/IssuesWorkspace.tsx');
    assert.match(vm, /shareKey:\s*['"]support:vm['"]/);
    assert.match(issue, /shareKey:\s*['"]support:issueId['"]/);
    assert.match(workspace, /useSupportVmParam/);
    assert.match(queue, /useSupportVmParam/);
    assert.match(issuesWs, /useSupportIssueParam/);
  });

  it('Review packing/pairing + catalog selection compose SoT resolve', () => {
    const review = read('src/features/review/ReviewWorkspace.tsx');
    const catalog = read('src/features/review/catalog-link/ReviewCatalogLinkTable.tsx');
    assert.match(review, /resolveOptimisticParam/);
    assert.match(review, /setPendingOpen/);
    assert.match(catalog, /resolveOptimisticParam/);
    assert.match(catalog, /setPendingSel/);
  });

  it('Phase 7 nice-to-haves compose paint-pending SoT', () => {
    const signal = read('src/hooks/useSignalIdParam.ts');
    const browse = read('src/features/signals/SignalsBrowseWorkspace.tsx');
    const community = read('src/components/studio/CommunityCatalogWorkbench.tsx');
    const home = read('src/features/home/HomeTasksMode.tsx');
    const productsSku = read('src/hooks/useProductsSkuIdParam.ts');
    const kit = read('src/components/products/KitPartsWorkspace.tsx');
    const qc = read('src/components/products/QcChecklistWorkspace.tsx');
    const history = read('src/hooks/useLabelsHistoryIdParam.ts');
    const unit = read('src/components/labels/unit-detail/UnitDetailWorkspace.tsx');
    const manuals = read('src/components/manuals/library/hooks/useManualNavigation.ts');
    assert.match(signal, /useOptimisticUrlParam/);
    assert.match(browse, /useSignalIdParam/);
    assert.match(community, /useOptimisticUrlParam/);
    assert.match(home, /useOptimisticUrlParam/);
    assert.match(productsSku, /shareKey:\s*['"]products:skuId['"]/);
    assert.match(kit, /useProductsSkuIdParam/);
    assert.match(qc, /useProductsSkuIdParam/);
    assert.match(history, /shareKey:\s*['"]labels:historyId['"]/);
    assert.match(unit, /useLabelsHistoryIdParam/);
    assert.match(manuals, /useOptimisticUrlParam/);
  });

  it('Signals browse paints ephemeral row preview chrome (SoT stays id-typed)', () => {
    const signal = read('src/hooks/useSignalIdParam.ts');
    const browse = read('src/features/signals/SignalsBrowseWorkspace.tsx');
    assert.match(signal, /useOptimisticUrlParam/);
    assert.doesNotMatch(
      signal,
      /preview|SignalRowPreview/,
      'useSignalIdParam stays id-typed — preview is consumer-owned',
    );
    assert.match(browse, /SignalRowPreview|rowPreview/);
    assert.match(browse, /SignalIdentityChrome/);
    assert.match(browse, /select\(s\.id,\s*s\)/);
    assert.match(
      browse,
      /Fetch supersedes preview|detail\.id === rowPreview\.id/,
    );
  });
});
