/**
 * Unfound catalog guards + resolver behaviour — wave 1.4's sixth family.
 *
 * The distinction this family makes explicit is the one the ticket question
 * raised on Warranty: an interactive cell whose subject is a ROW FACT
 * (`checked`) is bindable; a control whose subject is not a row property at all
 * (Push / Synced) is structural and stays out of the catalog.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { QueueRow } from '@/components/receiving/unfound/queue-table/unfound-queue-shared';
import {
  UNFOUND_SHEET_COLUMNS,
  defaultDirForUnfoundColumn,
  unfoundSheetColumnsFor,
  unfoundSortFactFor,
} from '@/components/receiving/unfound/grid/unfound-grid-layout';
import { UNFOUND_FIELD_CATALOG, UNFOUND_PRODUCT_LAYOUT } from './unfound';
import { resolveUnfoundSlotValue, unfoundItemHandle } from './unfound-resolve';
import { parseSlotLayout } from '../slot-layout';

function row(overrides: Partial<QueueRow> = {}): QueueRow {
  return {
    kind: 'unmatched_receiving',
    source_id: '9912',
    organization_id: '00000000-0000-0000-0000-000000000001',
    product_title: 'Bose Wave Radio IV',
    serial_numbers: '9M52B2C4',
    context: '1Z999AA10123456784',
    created_at: '2026-08-18T09:00:00.000Z',
    zendesk_ticket_id: '5512',
    zendesk_synced_at: null,
    usa_team_note: 'Chased the vendor',
    vietnam_team_note: null,
    follow_up_at: null,
    checked: false,
    checked_at: null,
    ...overrides,
  } as QueueRow;
}

describe('unfound catalog', () => {
  it('has unique ids, all unfound-family, each bindable somewhere', () => {
    const ids = UNFOUND_FIELD_CATALOG.map((f) => f.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const field of UNFOUND_FIELD_CATALOG) {
      assert.equal(field.family, 'unfound', field.id);
      assert.ok(field.slotKinds.length > 0, `${field.id} is unbindable`);
      assert.ok(field.id.startsWith('unfound.'), `${field.id} is not family-qualified`);
    }
  });

  it('product default parses against the catalog (sheet morph; the full ops set)', () => {
    const parsed = parseSlotLayout(UNFOUND_PRODUCT_LAYOUT, UNFOUND_FIELD_CATALOG);
    assert.equal(parsed.morph, 'sheet');
    assert.equal(parsed.identityFieldId, 'unfound.item');
    assert.deepEqual(parsed.statusBindings, [
      { fieldId: 'unfound.ticket' },
      { fieldId: 'unfound.usa_note' },
      { fieldId: 'unfound.vietnam_note' },
      { fieldId: 'unfound.checked' },
    ]);
  });

  it('an interactive FACT is bindable; the Push CONTROL is structural', () => {
    // `checked` writes from its cell and is still a row property, so it binds.
    assert.ok(UNFOUND_FIELD_CATALOG.some((f) => f.id === 'unfound.checked'));
    // Push / Synced is not a row property — it stays a track with no fieldId.
    const action = UNFOUND_SHEET_COLUMNS.find((c) => c.key === 'action');
    assert.ok(action, 'the action track is mounted');
    assert.equal(action.fieldId, undefined);
    assert.equal(unfoundSortFactFor(action), null);
  });
});

describe('unfoundSheetColumnsFor — the sheet materialization', () => {
  it("product default reproduces the hand model's full ops set, action last", () => {
    assert.deepEqual(
      UNFOUND_SHEET_COLUMNS.map((c) => [c.key, c.fieldId ?? null]),
      [
        ['select', null],
        ['title', null],
        ['status:1', 'unfound.ticket'],
        ['status:2', 'unfound.usa_note'],
        ['status:3', 'unfound.vietnam_note'],
        ['status:4', 'unfound.checked'],
        ['action', null],
      ],
    );
  });

  it('the action track stays last however many facts are bound', () => {
    const columns = unfoundSheetColumnsFor({
      ...UNFOUND_PRODUCT_LAYOUT,
      statusBindings: [{ fieldId: 'unfound.created' }],
      subtitleBindings: [{ fieldId: 'unfound.ticket' }],
    });
    assert.equal(columns.at(-1)?.key, 'action');
  });

  it('every track opens ASCENDING — the oldest uncleared row is the one to work', () => {
    // Including the date, where the house default would be newest-first and
    // would bury exactly the row this queue exists to surface.
    const dated = unfoundSheetColumnsFor({
      ...UNFOUND_PRODUCT_LAYOUT,
      statusBindings: [{ fieldId: 'unfound.created' }],
    });
    assert.equal(defaultDirForUnfoundColumn(dated, 'status:1'), 'asc');
    assert.equal(defaultDirForUnfoundColumn(UNFOUND_SHEET_COLUMNS, 'title'), 'asc');
  });
});

describe('resolveUnfoundSlotValue', () => {
  it('resolves each catalog field off the wire row', () => {
    const r = row();
    assert.deepEqual(resolveUnfoundSlotValue(r, 'unfound.item'), {
      kind: 'value',
      text: 'unmatched_receiving:9912',
    });
    assert.deepEqual(resolveUnfoundSlotValue(r, 'unfound.ticket'), { kind: 'value', text: '5512' });
    assert.deepEqual(resolveUnfoundSlotValue(r, 'unfound.usa_note'), {
      kind: 'value',
      text: 'Chased the vendor',
    });
    assert.ok((resolveUnfoundSlotValue(r, 'unfound.created') as { text: string | null }).text);
  });

  it('unchecked is the ordinary state and says nothing — blank, never "No"', () => {
    assert.deepEqual(resolveUnfoundSlotValue(row(), 'unfound.checked'), {
      kind: 'value',
      text: null,
    });
    assert.deepEqual(resolveUnfoundSlotValue(row({ checked: true }), 'unfound.checked'), {
      kind: 'value',
      text: 'Checked',
    });
  });

  it('honest absence: an unwritten note and an unpushed row resolve null', () => {
    const bare = row({ vietnam_team_note: null, zendesk_ticket_id: null });
    assert.deepEqual(resolveUnfoundSlotValue(bare, 'unfound.vietnam_note'), {
      kind: 'value',
      text: null,
    });
    assert.deepEqual(resolveUnfoundSlotValue(bare, 'unfound.ticket'), { kind: 'value', text: null });
  });

  it('the item handle is the same key the list renders by', () => {
    assert.equal(unfoundItemHandle(row({ kind: 'email_po', source_id: 'abc' })), 'email_po:abc');
  });

  it('unknown field id resolves null, never throws', () => {
    assert.equal(resolveUnfoundSlotValue(row(), 'unfound.ghost'), null);
  });
});
