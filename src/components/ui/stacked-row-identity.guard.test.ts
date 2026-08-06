import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

/**
 * Stacked row identity SoT:
 *   title on row 1 · typed CopyChip keys on row 2.
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
    assert.match(
      SOT,
      /Never\*\* park a short durable key|Never\*\* trail or lead a mono/,
    );
  });

  it('primitive exports StackedRowIdentity with title + keys slots', () => {
    assert.match(PRIMITIVE, /export function StackedRowIdentity/);
    assert.match(PRIMITIVE, /data-stacked-row-identity/);
    assert.match(PRIMITIVE, /keys: ReactNode/);
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
