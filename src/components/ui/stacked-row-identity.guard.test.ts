import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

/**
 * Stacked row identity SoT:
 *   title on row 1 · typed CopyChip keys on row 2.
 * Narrow / small-width two-row face — never hand-roll flex-col title/meta.
 * Ticket pick lists compose thin `TicketPickRow` — never lead/trail mono `#{id}`.
 */

function read(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8');
}

const SOT = read('../../../.claude/rules/source-of-truth.md');
const PRIMITIVE = read('./StackedRowIdentity.tsx');
const TICKET_ROW = read('./TicketPickRow.tsx');
const SUPPORT = read('../support/service-workspace/SupportTicketIdentity.tsx');
const MOVE = read('../receiving/workspace/line-edit/MovePhotosBetweenPoPanel.tsx');
const ORDERS = read('../sidebar/OrderSyncDialog.tsx');
const DRILL_MAP = read('../../design-system/components/grid/LedgerDrillParentMap.tsx');
const RECEIVING_DRILL = read('../station/receiving-grid/ReceivingDrillHost.tsx');
const ORDERS_DRILL = read('../outbound/orders/OrdersDrillHost.tsx');
const INBOX = read('../quick-access/ActivityInboxPopover.tsx');
const PRODUCT_SELECTOR = read('../repair/ProductSelector.tsx');

const TICKET_PICKERS = [
  ['TicketPicker', '../support/link/TicketPicker.tsx'],
  ['TicketLinkPopover', '../support/context/TicketLinkPopover.tsx'],
  ['zendesk ClaimTicketPicker', '../support/zendesk/claim/ClaimTicketPicker.tsx'],
  ['WarrantyTicketPopover', '../warranty/WarrantyTicketPopover.tsx'],
] as const;

describe('StackedRowIdentity SoT', () => {
  it('source-of-truth names the primitive and bans title-row trailing keys', () => {
    assert.match(SOT, /StackedRowIdentity/);
    assert.match(SOT, /TicketPickRow/);
    assert.match(SOT, /Stacked row identity/);
    assert.match(SOT, /joinStackedIdentityKeys|StackedIdentityKeySep/);
    assert.match(SOT, /LedgerDrillParentMap|small-width two-row|narrow drill/);
    assert.match(
      SOT,
      /Never\*\* park a short durable key|Never\*\* trail or lead a mono/,
    );
  });

  it('primitive exports StackedRowIdentity + key join helpers', () => {
    assert.match(PRIMITIVE, /export function StackedRowIdentity/);
    assert.match(PRIMITIVE, /data-stacked-row-identity/);
    assert.match(PRIMITIVE, /keys\?:/);
    assert.match(PRIMITIVE, /function StackedIdentityKeySep/);
    assert.match(PRIMITIVE, /export function joinStackedIdentityKeys/);
  });

  it('TicketPickRow composes StackedRowIdentity + TicketChip', () => {
    assert.match(TICKET_ROW, /export function TicketPickRow/);
    assert.match(TICKET_ROW, /StackedRowIdentity/);
    assert.match(TICKET_ROW, /TicketChip/);
    assert.match(TICKET_ROW, /supportTicketIdFace/);
  });

  it('Support ticket identity stacks the # below the subject', () => {
    assert.match(SUPPORT, /StackedRowIdentity/);
    assert.match(SUPPORT, /keys=\{<SupportTicketIdMark/);
    const titleSlot = SUPPORT.match(/title=\{\s*([\s\S]*?)\n\s*\}/);
    assert.ok(titleSlot, 'title slot must be present');
    assert.doesNotMatch(
      titleSlot[1],
      /SupportTicketIdMark/,
      'ticket # must not live inside the title slot — it belongs in keys',
    );
  });

  it('Move photos targets compose StackedRowIdentity with TicketChip in keys', () => {
    assert.match(MOVE, /StackedRowIdentity/);
    const keysBlock = MOVE.match(/keys=\{\s*<>[\s\S]*?<\/>\s*\}/);
    assert.ok(keysBlock, 'Move photos must pass a keys fragment');
    assert.match(keysBlock[0], /TicketChip/, 'ticket # belongs in the keys row, not a third title sibling');
  });

  it('Orders import SyncListRow composes StackedRowIdentity', () => {
    assert.match(ORDERS, /StackedRowIdentity/);
    assert.match(ORDERS, /function SyncListRow/);
  });

  it('Orders import SyncListRow wraps product titles and paints PlatformMark', () => {
    assert.match(
      ORDERS,
      /SYNC_LIST_TITLE_CLASS[\s\S]{0,200}whitespace-normal break-words/,
      'SyncListRow titles must wrap (roster grammar), never truncate',
    );
    assert.match(
      ORDERS,
      /title=\{<p className=\{SYNC_LIST_TITLE_CLASS\}>/,
      'SyncListRow must use the wrap title class',
    );
    assert.doesNotMatch(
      ORDERS,
      /title=\{<p className="truncate text-role-caption/,
      'SyncListRow title face must not truncate',
    );
    assert.match(ORDERS, /PlatformMark/, 'SyncListRow channel trailing must be PlatformMark');
    assert.doesNotMatch(
      ORDERS,
      /uppercase tracking-wide text-text-soft[\s\S]{0,80}\{row\.platform/,
      'Order sync must not paint uppercase {row.platform} prose',
    );
  });

  it('LedgerDrillParentMap composes StackedRowIdentity — no hand-rolled title/meta flex-col', () => {
    assert.match(DRILL_MAP, /StackedRowIdentity/);
    assert.doesNotMatch(
      DRILL_MAP,
      /flex-col gap-0\.5/,
      'drill parent rows must not hand-roll the stacked title/meta shell',
    );
  });

  it('History + Orders drill adapters join keys via joinStackedIdentityKeys', () => {
    assert.match(RECEIVING_DRILL, /joinStackedIdentityKeys/);
    assert.match(ORDERS_DRILL, /joinStackedIdentityKeys/);
    assert.doesNotMatch(
      RECEIVING_DRILL,
      /function metaSep/,
      'Receiving drill must not keep a local metaSep twin',
    );
    assert.doesNotMatch(
      ORDERS_DRILL,
      /function metaSep/,
      'Orders drill must not keep a local metaSep twin',
    );
  });

  it('header inbox tech-queue identity joins CopyChips via joinStackedIdentityKeys', () => {
    assert.match(INBOX, /joinStackedIdentityKeys/);
    assert.match(INBOX, /OrderIdChip/);
    assert.match(INBOX, /TrackingChip/);
  });

  it('repair ProductSelector selected tray composes StackedRowIdentity', () => {
    assert.match(PRODUCT_SELECTOR, /StackedRowIdentity/);
    assert.match(PRODUCT_SELECTOR, /data-kiosk-cart-tray|Selected items tray/);
  });

  it('SupportTicketRow composes TicketPickRow — never mono #{id}', () => {
    const src = read('../support/zendesk/queue/SupportTicketRow.tsx');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    assert.match(code, /TicketPickRow/);
    assert.doesNotMatch(
      code,
      /#\{id\}/,
      'queue ticket rows must not paint mono #{id} — TicketChip owns the face',
    );
  });

  it('InventoryPulseSidebar / UnfoundMatchStrip / FbaSelectedLineRow compose StackedRowIdentity', () => {
    assert.match(
      read('../inventory/sidebar/InventoryPulseSidebar.tsx'),
      /StackedRowIdentity/,
    );
    assert.match(
      read('../receiving/workspace/line-edit/UnfoundMatchStrip.tsx'),
      /StackedRowIdentity/,
    );
    assert.match(
      read('../receiving/workspace/line-edit/UnfoundMatchStrip.tsx'),
      /joinStackedIdentityKeys/,
    );
    assert.match(read('../fba/sidebar/FbaSelectedLineRow.tsx'), /StackedRowIdentity/);
  });

  it('mobile sheet headers + carton-add ResultRow compose StackedRowIdentity', () => {
    assert.match(read('../mobile/packer/MobilePackingSheet.tsx'), /StackedRowIdentity/);
    assert.match(read('../mobile/receiving/MobileCartonSheet.tsx'), /StackedRowIdentity/);
    assert.match(read('../mobile/redesign/ScanTestingPanel.tsx'), /StackedRowIdentity/);
    assert.match(
      read('../receiving/workspace/carton-add/carton-add-primitives.tsx'),
      /StackedRowIdentity/,
    );
  });

  it('multi-select batch rosters compose RailSelectionRoster / StackedRowIdentity', () => {
    const roster = read('../right-rail/RailSelectionRoster.tsx');
    assert.match(roster, /StackedRowIdentity/);
    assert.match(roster, /export function RailSelectionRosterRow/);
    assert.match(
      roster,
      /RAIL_SELECTION_ROSTER_TITLE_CLASS|whitespace-normal break-words/,
      'selection roster titles must wrap (PoLineRow grammar), never truncate',
    );
    assert.doesNotMatch(
      roster.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, ''),
      /truncate text-role-caption/,
      'roster title face must not truncate',
    );
    for (const rel of [
      '../dashboard/rail/OrderRailShell.tsx',
      '../receiving/rail/ReceivingLineRailShell.tsx',
      '../repair/rail/RepairRailShell.tsx',
    ] as const) {
      const src = read(rel);
      assert.match(src, /RailSelectionRosterRow/, `${rel} must compose RailSelectionRosterRow`);
      assert.doesNotMatch(
        src,
        /ml-auto shrink-0 truncate text-role-eyebrow/,
        `${rel} must not keep the single-line title | mono id twin`,
      );
    }
    const orders = read('../dashboard/rail/OrderRailShell.tsx');
    assert.match(orders, /platformMetaIconTone/, 'order roster # glyph tone from platform SoT');
    assert.match(orders, /platformLabel/, 'order roster tooltip carries platform label');
    assert.match(orders, /usePlatformMeta/, 'order roster resolves platform from catalog');
  });

  for (const [name, rel] of TICKET_PICKERS) {
    it(`${name} composes TicketPickRow and does not lead with mono #{id}`, () => {
      const src = read(rel);
      assert.match(src, /TicketPickRow/, `${name} must compose TicketPickRow`);
      assert.doesNotMatch(
        src,
        /font-mono[^>]*>\s*#\{/,
        `${name} must not render a leading mono #{id} beside the subject`,
      );
      assert.doesNotMatch(
        src,
        /className="[^"]*font-mono[^"]*"[^>]*>\s*#/,
        `${name} must not render a leading mono #id span`,
      );
    });
  }
});
