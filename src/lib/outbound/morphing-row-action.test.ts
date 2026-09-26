/**
 *   npx tsx --test src/lib/outbound/morphing-row-action.test.ts
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyMorphingGutterClick,
  isMorphingMobileUrl,
  morphingAssignedName,
  morphingFilterRoster,
  morphingGutterClick,
  morphingHotkeyForIndex,
  morphingListingRulePair,
  morphingNotesHint,
  morphingRoster,
  pairItemNumberOnce,
} from './morphing-row-action';

const staff = [
  { id: 1, name: 'Michael' },
  { id: 3, name: 'Sang' },
  { id: 4, name: 'Tuan' },
  { id: 5, name: 'Thuy' },
  { id: 7, name: 'Kai' },
  { id: 8, name: 'Lien' },
  { id: 99, name: 'Alex' },
];

describe('morphingRoster', () => {
  it('lists only Tuan and Thuy as packers and never Kai', () => {
    const packers = morphingRoster(staff, 'packer');
    assert.deepEqual(
      packers.map((row) => row.name),
      ['Tuan', 'Thuy'],
    );
  });

  it('lists live pickers Sang / Lien / Michael and skips invented names', () => {
    const pickers = morphingRoster(staff, 'picker');
    assert.deepEqual(
      pickers.map((row) => row.name),
      ['Michael', 'Sang', 'Lien'],
    );
    assert.equal(
      pickers.some((row) => row.name === 'Alex' || row.name === 'Ajax'),
      false,
    );
  });

  it('includes Ajax only when present in live staff', () => {
    const withAjax = morphingRoster([...staff, { id: 12, name: 'Ajax' }], 'picker');
    assert.equal(
      withAjax.some((row) => row.name === 'Ajax'),
      true,
    );
  });
});

describe('morphingHotkeyForIndex', () => {
  it('maps 0..4 to 1..5', () => {
    assert.equal(morphingHotkeyForIndex(0), '1');
    assert.equal(morphingHotkeyForIndex(4), '5');
    assert.equal(morphingHotkeyForIndex(5), null);
  });
});

describe('morphingFilterRoster', () => {
  it('narrows by name fragment', () => {
    const pickers = morphingRoster(staff, 'picker');
    assert.deepEqual(
      morphingFilterRoster(pickers, 'mi').map((row) => row.name),
      ['Michael'],
    );
    assert.equal(morphingFilterRoster(pickers, '  ').length, pickers.length);
  });
});

describe('morphingListingRulePair', () => {
  it('keeps the other lane when the row already has one', () => {
    assert.deepEqual(
      morphingListingRulePair({
        lane: 'picker',
        staffId: 3,
        testerId: 1,
        packerId: 4,
      }),
      { techId: 3, packerId: 4 },
    );
    assert.deepEqual(
      morphingListingRulePair({
        lane: 'packer',
        staffId: 5,
        testerId: 3,
        packerId: 4,
      }),
      { techId: 3, packerId: 5 },
    );
  });

  it('repeats this staffer when the other lane is empty so the rule can exist', () => {
    assert.deepEqual(
      morphingListingRulePair({
        lane: 'picker',
        staffId: 8,
        testerId: null,
        packerId: null,
      }),
      { techId: 8, packerId: 8 },
    );
  });
});

describe('pairItemNumberOnce', () => {
  it('keeps a real item number and drops blanks', () => {
    assert.equal(pairItemNumberOnce('  4412  '), '4412');
    assert.equal(pairItemNumberOnce(''), null);
    assert.equal(pairItemNumberOnce(null), null);
  });
});

describe('morphingAssignedName', () => {
  it('prefers the assignee face over the scan stamp', () => {
    assert.equal(
      morphingAssignedName({ tester_name: 'Sang', tested_by_name: 'Ajax' }, 'picker'),
      'Sang',
    );
    assert.equal(
      morphingAssignedName({ packer_name: 'Thuy', packed_by_name: 'Tuan' }, 'packer'),
      'Thuy',
    );
  });

  it('falls back to the scan name and drops blanks', () => {
    assert.equal(morphingAssignedName({ tested_by_name: 'Lien' }, 'picker'), 'Lien');
    assert.equal(morphingAssignedName({ tester_name: '  ' }, 'picker'), null);
  });
});

describe('isMorphingMobileUrl', () => {
  it('is only the phone app path', () => {
    assert.equal(isMorphingMobileUrl('/m'), true);
    assert.equal(isMorphingMobileUrl('/m/pick/1'), true);
    assert.equal(isMorphingMobileUrl('/shipping/orders'), false);
    assert.equal(isMorphingMobileUrl('/'), false);
    assert.equal(isMorphingMobileUrl(null), false);
  });
});

describe('morphingNotesHint', () => {
  it('prefers the trail count over the legacy scalar', () => {
    assert.equal(morphingNotesHint({ note_count: 3, notes: 'old' }), '3 notes');
    assert.equal(morphingNotesHint({ note_count: 1 }), '1 note');
  });

  it('falls back to a legacy stamp and drops blanks', () => {
    assert.equal(morphingNotesHint({ notes: ' leave at dock ' }), 'legacy note');
    assert.equal(morphingNotesHint({ note_count: 0, notes: '  ' }), null);
  });
});

describe('morphingGutterClick — checkbox always toggles', () => {
  it('selects and opens the menu on an unchecked row', () => {
    assert.deepEqual(morphingGutterClick({ isChecked: false, shiftKey: false }), {
      extend: false,
      menu: 'open',
    });
  });

  it('unselects without unmounting the menu so bulk stays up', () => {
    assert.deepEqual(morphingGutterClick({ isChecked: true, shiftKey: false }), {
      extend: false,
      menu: 'keep',
    });
  });

  it('shift-click is the range walk and keeps the menu', () => {
    assert.deepEqual(morphingGutterClick({ isChecked: false, shiftKey: true }), {
      extend: true,
      menu: 'keep',
    });
    assert.deepEqual(morphingGutterClick({ isChecked: true, shiftKey: true }), {
      extend: true,
      menu: 'keep',
    });
  });

  it('applyMorphingGutterClick always fires onToggle, including unselect', () => {
    const toggles: Array<{ shiftKey: boolean }> = [];
    const menus: string[] = [];
    applyMorphingGutterClick({
      isChecked: true,
      shiftKey: false,
      onToggle: (event) => toggles.push(event),
      onOpenMenu: () => menus.push('open'),
      onCloseMenu: () => menus.push('close'),
    });
    assert.deepEqual(toggles, [{ shiftKey: false }]);
    assert.deepEqual(menus, []);
  });
});

describe('Morphing paints a sticky top overlay, not a left popover', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const menu = readFileSync(
    join(here, '../../components/outbound/orders/to-ship/MorphingRowActionMenu.tsx'),
    'utf8',
  );
  const table = readFileSync(
    join(here, '../../components/tables/DataTable.tsx'),
    'utf8',
  );

  it('portals into the slot under the column header', () => {
    assert.match(menu, /SLOT_TABLE_ACTION_ROW_ATTR/);
    assert.match(menu, /SLOT_TABLE_OVERLAY_HOST_ATTR/);
    assert.match(table, /SLOT_TABLE_OVERLAY_HOST_ATTR/);
    assert.doesNotMatch(menu, /placement=["']left-start["']/);
    assert.doesNotMatch(menu, /absolute inset-x-0 top-0/);
    assert.doesNotMatch(
      menu,
      /document\.addEventListener\(['"]mousedown['"]/,
      'click-off must not dismiss the bar while a row is selected',
    );
    const grid = readFileSync(
      join(here, '../../design-system/components/grid/LedgerGrid.tsx'),
      'utf8',
    );
    assert.match(grid, /data-slot-table-action-row/);
    assert.match(grid, /empty:hidden/);
    assert.match(grid, /data-slot-table-prefix/);
    assert.match(grid, /sticky top-\[var\(--cf-grid-header-h/);
    assert.match(grid, /\{pinnedPrefix\}/);
  });

  it('desktop bar is not a child of a virtualized row', () => {
    const row = readFileSync(
      join(here, '../../components/dashboard/orders-queue/OrdersQueueTableRow.tsx'),
      'utf8',
    );
    const sheet = readFileSync(
      join(here, '../../components/dashboard/orders-queue/useOrdersSpreadsheet.tsx'),
      'utf8',
    );
    assert.doesNotMatch(row, /<MorphingRowActionMenu/);
    assert.match(sheet, /OrdersMorphingHost/);
    assert.match(menu, /export function OrdersMorphingHost/);
    assert.match(menu, /inline = false/);
  });

  it('desktop Notes morphs the action row; BottomSheet is /m/ only', () => {
    assert.match(menu, /variant=["']strip["']/);
    assert.match(menu, /isMorphingMobileUrl/);
    assert.match(menu, /forceVariant=["']sheet["']/);
  });

  it('state-changers lead with transition labels; rare verbs sit behind ⋮', () => {
    // Operator 2026-09-15: a button label is the VERB it performs from the
    // current state. "Urgent" as a label states a fact the row already shows
    // three ways and hides whether clicking sets, clears, or does nothing —
    // so the urgent pill reads "Clear urgent" when the selection is all-urgent
    // and "Mark urgent" otherwise. "Out of stock" was a noun; the verb bar
    // carries verbs. Create rule is rare and configuration-flavoured, so it
    // moved into the ⋮ overflow (hotkey R unchanged).
    assert.match(menu, /selectionIsUrgent \? 'Clear urgent' : 'Mark urgent'/);
    assert.match(menu, /Report out of stock/);
    assert.doesNotMatch(menu, /'Out of stock'</);
    assert.doesNotMatch(menu, /Assign picker/);
    assert.doesNotMatch(menu, /Assign packer/);
    assert.match(menu, /\/api\/shipped\/scan-out/);
    assert.match(menu, /documents\/upload/);
  });
});
