/**
 * Unbox Displays Root-to-Leaf drill-down — primary nav is the station SoT
 * index, not an icon plate. Checklist is a Displays leaf (no floor % ring).
 *
 *   node --import tsx --test src/components/receiving/workspace/line-edit/unbox-displays-drilldown.guard.test.ts
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

const STACK = 'src/components/station/displays/StationDisplaysPushStack.tsx';
const COLUMN = 'src/components/station/displays/StationDisplaysPushColumn.tsx';
const PANEL = 'src/components/receiving/workspace/LineEditPanel.tsx';
const TABS = 'src/components/receiving/workspace/line-edit/unbox-side-tabs.ts';
const INDEX = 'src/components/receiving/workspace/line-edit/unbox-display-index.ts';
const SOT_INDEX = 'src/components/station/displays/display-index.ts';
const DISPLAY_VIEW = 'src/components/receiving/workspace/line-edit/hooks/useUnboxDisplayView.ts';

describe('Unbox Displays Root-to-Leaf drill-down', () => {
  it('URL vocabulary includes display=index', () => {
    const tabs = read(TABS);
    const sot = read(SOT_INDEX);
    // Unbox re-exports the station SoT constant — never a second local 'index' literal.
    assert.match(tabs, /UNBOX_DISPLAY_INDEX\s*=\s*STATION_DISPLAY_INDEX/);
    assert.match(sot, /STATION_DISPLAY_INDEX\s*=\s*'index'/);
    assert.match(tabs, /parseUnboxDisplayNav/);
    assert.match(tabs, /resolveUnboxDisplayNav/);
  });

  it('index builder emits checklist as a Displays leaf', () => {
    const index = read(INDEX);
    assert.match(index, /buildUnboxDisplayIndexRows/);
    assert.match(index, /checklist:\s*'Checklist'/);
    assert.doesNotMatch(
      index,
      /if \(id === 'checklist'\) continue/,
      'checklist must appear on the Root Index after the floor ring was deleted',
    );
    assert.match(index, /group:/, 'Unbox builder emits DisplayIndexRow.group');
  });

  it('push stack uses index + leaf chrome; Esc pops via onEscape', () => {
    const stack = read(STACK);
    const column = read(COLUMN);
    assert.match(stack, /DisplaysIndexLeafStage/);
    assert.match(stack, /StationDisplayLeafHeader/);
    assert.match(stack, /DisplaysLeafChromeProvider/);
    assert.match(stack, /leafTrail|setTrail/);
    assert.match(stack, /popOne/);
    assert.match(stack, /onEscape=\{onEscape\}/);
    assert.match(column, /onEscape \?\? onClose/);
    assert.match(column, /headerRightSlot/);
    assert.doesNotMatch(stack, /UnboxSectionTabs/);
  });

  it('LineEditPanel opens Displays on index; contextual opens keep leaf ids', () => {
    const panel = read(PANEL);
    assert.match(
      panel,
      /StationDisplaysPushStack/,
      'Unbox mounts the station Displays SoT stack',
    );
    assert.match(
      panel,
      /openDisplaysIndex|UNBOX_DISPLAY_INDEX/,
      '←| must open Root Index',
    );
    assert.match(
      panel,
      /UnboxDisplaysUtilityRailBody[\s\S]*onOpenDisplays=\{openDisplaysIndex\}/,
      'bottom-seated open toggle lands on index, not Ticket',
    );
    assert.match(
      panel,
      /openDisplays\('units',\s*\{\s*unitsAction:\s*'units'\s*\}\)/,
      'serials View All still skips index (lands Units drill, not Actions list)',
    );
    assert.match(
      panel,
      /openDisplays\('timeline'\)/,
      'return history still skips index',
    );
    assert.match(
      panel,
      /openDisplays\('inventory'/,
      'order Details / inventory dossier skips index',
    );
    assert.match(
      panel,
      /indexRows=\{displayIndexRows\}/,
      'enriched status rows are passed into the push stack',
    );
    assert.doesNotMatch(panel, /navMode/, 'navMode was deleted — one Root-to-Leaf grammar');
  });

  it('Inventory is a Displays leaf (not RightRailHost) with shared dossier host', () => {
    const tabs = read(TABS);
    const builders = read('src/components/receiving/workspace/line-edit/terminal/unbox-tabs.tsx');
    const host = read('src/components/receiving/workspace/line-edit/InventoryDisplayHost.tsx');
    const sync = read('src/components/receiving/workspace/line-edit/hooks/useZohoSync.ts');
    const panel = read(PANEL);
    const floor = read(
      'src/components/receiving/workspace/line-edit/UnboxDisplaysActionFloor.tsx',
    );
    const claim = read('src/components/receiving/workspace/ReceivingClaimPanel.tsx');
    assert.match(tabs, /\| 'inventory'/);
    assert.match(builders, /id: 'inventory'/);
    assert.match(builders, /InventoryDisplayHost/);
    assert.match(host, /useInventoryPoDossier/);
    assert.match(host, /data-testid="unbox-inventory-display"/);
    assert.match(host, /data-inventory-flat/);
    assert.match(
      host,
      /data-inventory-instrument/,
      'Inventory is a keyboard instrument panel',
    );
    assert.match(
      host,
      /data-inventory-drill/,
      'Inventory uses secondary child-row drill (index → sub-leaf)',
    );
    assert.match(host, /data-inventory-sub-index/);
    assert.match(
      host,
      /StationArmedVerbList/,
      'Secondary index is the armed SoT list — not a hand-rolled <ul>',
    );
    assert.doesNotMatch(
      host,
      /data-inventory-sub-row|tone === 'action'|Open' : r\.tone/,
      'No tone-pill / raw sub-row twin — StationArmedVerbList owns the face',
    );
    // ONE Back row — stack owns LeafHeader; Inventory reports trail UP.
    assert.doesNotMatch(
      host,
      /StationDisplayLeafHeader/,
      'Inventory must not nest a second LeafHeader — use useDisplaysLeafChrome',
    );
    assert.match(host, /useDisplaysLeafChrome/);
    assert.match(host, /setTrail/);
    assert.match(host, /setOnNestedPop/);
    assert.match(host, /setOnNestedRestore/);
    assert.match(host, /po_notes/, 'PO notes seed from dossier po_notes');
    assert.match(
      host,
      /data-station-action-dossier/,
      'Focus restore target for Displays stack',
    );
    assert.match(
      host,
      /data-claim-chrome="display"/,
      'Claim Displays chrome attribute (ReceivingClaimPanel twin)',
    );
    assert.match(
      claim,
      /data-claim-chrome=\{chrome\}/,
      'Claim panel owns the chrome attribute SoT',
    );
    assert.doesNotMatch(
      host,
      /StationActionKeyLegend/,
      'No Action KeyLegend floor — stack owns leaf-dismiss only',
    );
    assert.doesNotMatch(
      host,
      /showFloor|floorLeading/,
      'No hand-rolled Inventory floor CTAs',
    );
    assert.match(
      host,
      /setLeafTrailing/,
      'Save mounts in sticky leaf header trailing when PO notes dirty path needs it',
    );
    assert.match(
      host,
      /data-inventory-leaf-trailing/,
      'Header trailing cluster is Inventory-owned (Save notes)',
    );
    assert.match(
      host,
      /variant="instrument"/,
      'Information is StationDenseFactStrip instrument SoT',
    );
    assert.doesNotMatch(
      host,
      /data-inventory-trust-strip/,
      'Information has no trust strip — facts rows only',
    );
    assert.doesNotMatch(
      host,
      /data-inventory-receive-fact/,
      'Receive / PR trail is not a second Information chrome band',
    );
    assert.match(
      host,
      /DenseComposeBodyBand|DenseComposeBodyTextarea/,
      'Editable notes use claim sheet-band DenseCompose — not WORKSPACE_NESTED_FIELD',
    );
    assert.match(
      host,
      /variant="instrument"/,
      'Info header is edge-to-edge instrument telemetry',
    );
    assert.doesNotMatch(
      host,
      /StationActionDossierShell/,
      'No dossier accordion — instrument stack is the section SoT',
    );
    assert.doesNotMatch(host, /WORKSPACE_NESTED_FIELD/);
    assert.match(
      host,
      /InventoryActivityPanel/,
      'Trust view mounts receive + inventory activity on the leaf',
    );
    assert.doesNotMatch(host, /data-inventory-trust-strip/);
    assert.doesNotMatch(host, /data-inventory-receive-fact/);
    assert.match(host, /baseLastModifiedZoho|base_last_modified_zoho/, 'Cmd+S sends block-if-stale base stamp');
    assert.match(host, /inlineNotes/, 'Line notes paint inline (no expand-to-reveal)');
    assert.match(host, /'Refresh'|Refreshing|Refresh inventory/, 'Pull copy is Refresh (not Sync)');
    assert.match(host, /dossier\.invalidate\(\)/, 'Refresh busts incoming-details cache');
    assert.match(
      floor,
      /unbox-displays-floor-inventory-sync|RefreshCw/,
      'Zoho inventory Refresh is the Macro-floor refresh icon — not the Inventory breadcrumb',
    );
    assert.doesNotMatch(
      host,
      /ariaLabel="Refresh inventory"/,
      'Inventory breadcrumb must not host the Refresh CTA',
    );
    // Nested drill: sections live behind sub-index rows, not one stacked scroll.
    assert.match(host, /subLeaf === 'info'|id: 'info'/);
    assert.match(host, /subLeaf === 'lines'|id: 'lines'/);
    assert.match(host, /subLeaf === 'notes'|id: 'notes'/);
    assert.match(host, /subLeaf === 'activity'|id: 'activity'/);
    assert.match(
      sync,
      /refreshInventoryDossier/,
      'Refresh pulls mirror sync-one then carton inventory-sync',
    );
    assert.match(sync, /incoming\/sync-one/);
    assert.match(panel, /refreshInventoryDossier/);
    assert.match(panel, /inventoryRefreshing/);
    assert.match(
      panel,
      /onLoadZohoNotes:[\s\S]*?refreshInventoryDossier/,
      'PO notes lazy pull uses full dossier refresh (not carton-only sync)',
    );
    assert.match(host, /from '@\/lib\/toast'/, 'Refresh toasts via house toast waist');
    assert.match(host, /Inventory refreshed/, 'Success toast names Inventory refreshed');
    assert.match(host, /Inventory refresh failed/, 'Failure toast names Inventory refresh failed');
    assert.match(
      host,
      /Inventory status updated locally/,
      'Partial Refresh (local paint, live Zoho failed) warns via toast',
    );
    // Receive stays on the Unbox dock — Inventory never forks a receive engine.
    assert.doesNotMatch(
      host,
      /onMarkReceived|onUnreceive|Mark received|handleReceive/,
      'Inventory leaf has no receive CTAs — dock owns mark-received-po',
    );
    assert.doesNotMatch(
      host,
      /\/api\/receiving\/mark-received-po|\/api\/zoho\/purchase/,
      'Inventory host must not fetch receive APIs',
    );
    assert.match(
      host,
      /setLeafCommands\(null\)/,
      'Inventory clears leaf-commands so footer stays leaf-dismiss (no / Commands)',
    );
    assert.doesNotMatch(host, /RightRailHost|DetailStackRailRegistrar/);
    assert.doesNotMatch(host, /CartonMatchHub/, 'Change PO opens Linkage — no second match hub');
    assert.doesNotMatch(host, /InspectorActionFloor/);
    assert.doesNotMatch(
      host,
      /TabDisplay/,
      'Inventory stacks PO · lines · notes · activity — no nested Items/Notes/Activity tabs',
    );
    assert.doesNotMatch(
      host,
      /Bill|Void|Delete attachment|Create PO/,
      'No fake commercial write buttons without Zoho APIs',
    );
  });

  it('PO notes + line notes enforce block-if-stale (no silent last-write)', () => {
    const stamp = read('src/lib/receiving/zoho-po-stamp.ts');
    const notesSync = read('src/lib/receiving/zoho-po-notes-sync.ts');
    const descSync = read('src/lib/receiving/zoho-item-description-sync.ts');
    const poNote = read(
      'src/components/receiving/workspace/line-edit/terminal/usePoNoteTabState.ts',
    );
    const synced = read(
      'src/components/receiving/workspace/line-edit/hooks/useSyncedPoNote.ts',
    );
    const noteRoute = read('src/app/api/receiving/lines/[id]/inventory-note/route.ts');
    const details = read('src/app/api/receiving-lines/incoming/details/route.ts');
    assert.match(stamp, /isZohoPoStampStale/);
    assert.match(notesSync, /baseLastModifiedZoho/);
    assert.match(notesSync, /skipped:\s*'stale'|skipped === 'stale'| 'stale'/);
    assert.match(descSync, /baseLastModifiedZoho/);
    assert.match(poNote, /baseLastModifiedZoho/);
    assert.match(
      poNote,
      /draft\.trim\(\) !== \(overallZohoNotes \?\? ''\)\.trim\(\)\) return/,
      'Refresh must not clobber dirty drafts',
    );
    assert.match(synced, /base_last_modified_zoho/);
    assert.match(synced, /Inventory changed — Refresh/);
    assert.match(noteRoute, /INSERT INTO receiving_line_zoho/);
    assert.doesNotMatch(
      noteRoute,
      /UPDATE\s+receiving_line\s+SET[\s\S]*zoho_notes/,
      'inventory-note must not write spine receiving_line.zoho_notes (column dropped)',
    );
    assert.match(details, /rz\.zoho_notes/);
    assert.match(details, /rawLineItems\.length > 0/);
    assert.match(details, /zoho_purchase_receive_id/);
    assert.match(details, /inventory_received_at/);
    assert.match(details, /po_notes/, 'Details exposes synced PO header notes');
    assert.match(details, /r\.zoho_notes/, 'Carton zoho_notes selected for po_notes');

    // Stream C — receive/unreceive trail honesty (do/undo stay on dock).
    const activity = read(
      'src/components/receiving/inventory/InventoryActivityPanel.tsx',
    );
    const header = read(
      'src/components/receiving/inventory/InventoryPoHeader.tsx',
    );
    const lines = read(
      'src/components/receiving/inventory/InventoryPoLineList.tsx',
    );
    const controller = read(
      'src/components/receiving/workspace/line-edit/hooks/useUnboxLineController.ts',
    );
    assert.match(
      activity,
      /notes\.includes\('unreceive'\)/,
      'Unreceive labels NOTE + ADJUSTED spine rows — not ADJUSTED-only',
    );
    assert.match(
      header,
      /label:\s*'Received'/,
      'Information dense facts surface carton inventory_received_at',
    );
    assert.match(
      header,
      /label:\s*'Purchase receive'/,
      'Information dense facts surface zoho_purchase_receive_id',
    );
    assert.doesNotMatch(header, /data-inventory-receive-fact/);
    assert.match(
      lines,
      /localQty > 0 && isZohoReceivedLikeStatus/,
      'Lines trust face ignores stale Zoho received when local qty is 0 (post-unreceive)',
    );
    assert.match(
      controller,
      /if \(ok\) void core\.refreshInventoryDossier\(\)/,
      'Dock receive/unreceive refreshes Inventory dossier after local commit',
    );
    assert.match(
      controller,
      /isUnreceiveSerialBlocking/,
      'Unreceive menu pre-disables outbound / fulfillment serials',
    );
    assert.match(
      controller,
      /from '@\/lib\/receiving\/unreceive-serial-guard'/,
      'Unreceive serial guard must stay client-safe — never import receive-line (pulls @/lib/db)',
    );
    assert.doesNotMatch(
      controller,
      /from '@\/lib\/receiving\/receive-line'/,
      'receive-line is server-only; Client Component import ships Neon into the station bundle',
    );
  });

  it('Open displays paints from the shared optimistic URL SoT — not a local twin', () => {
    const view = read(DISPLAY_VIEW);
    assert.match(
      view,
      /from '@\/lib\/routing\/optimistic-url-param'/,
      'Unbox composes the paint-pending SoT — never a feature-local resolve/clear fork',
    );
    assert.match(
      view,
      /setPending\(snapshot\)/,
      'setDisplay must flip pending before router.replace so the column mounts in the click commit',
    );
    assert.match(
      view,
      /flushSync\([\s\S]*?setPending\(snapshot\)/,
      'pending paint flushSyncs so leaf mounts in the same pointer/key turn',
    );
    assert.match(
      view,
      /resolveOptimisticParam\(urlDisplay,\s*pending\?\.display\)/,
      'requestedDisplay prefers pending over lagged useSearchParams',
    );
    assert.match(
      view,
      /shouldClearOptimisticParam\(urlDisplay,\s*pending\?\.display\)/,
      'pending clears only when the URL catches the write (index→leaf race safe)',
    );
    assert.match(
      view,
      /readLiveSearchParams/,
      'param edits seed from the live address bar',
    );
  });

  it('Displays open preloads deferred leaf chunks so index→leaf is not a cold dynamic()', () => {
    const panel = read(PANEL);
    const tabsMod = read(
      'src/components/receiving/workspace/line-edit/terminal/unbox-tabs.tsx',
    );
    assert.match(
      tabsMod,
      /export function preloadUnboxDisplayLeafChunks/,
      'deferred Photos/Ticket/… loaders share one preload SoT',
    );
    assert.match(
      panel,
      /preloadUnboxDisplayLeafChunks/,
      'LineEditPanel warms leaf chunks when Displays opens',
    );
    assert.match(
      panel,
      /if \(!showDisplays\) return[\s\S]*preloadUnboxDisplayLeafChunks/,
      'preload runs only while the push column is open',
    );
  });
});

