import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyRoomCreateToLocations,
  applyRoomDeleteToLocations,
  applyRoomPatchToLocations,
  roomFormCanSave,
  roomFormIsDirty,
  roomSaveDisabledReason,
  shouldClearUnknownRoomSelection,
  type LocationRecord,
  type LocationsListData,
} from './locations-cache';

function parent(
  overrides: Partial<LocationRecord> & Pick<LocationRecord, 'id' | 'name'>,
): LocationRecord {
  return {
    room: overrides.room ?? overrides.name,
    description: null,
    barcode: null,
    is_active: true,
    sort_order: 0,
    row_label: null,
    col_label: null,
    bin_type: null,
    capacity: null,
    parent_id: null,
    zone_letter: null,
    ...overrides,
  };
}

function bin(
  overrides: Partial<LocationRecord> & Pick<LocationRecord, 'id' | 'name' | 'room'>,
): LocationRecord {
  return {
    description: null,
    barcode: null,
    is_active: true,
    sort_order: 0,
    row_label: 'A',
    col_label: '1',
    bin_type: null,
    capacity: null,
    parent_id: null,
    zone_letter: null,
    ...overrides,
  };
}

describe('applyRoomPatchToLocations', () => {
  it('rewrites parent + bins and zone letter so the new name is immediately in cache', () => {
    const prev: LocationsListData = {
      locations: [
        parent({ id: 1, name: 'Packing 1', room: 'Packing 1', zone_letter: null }),
        bin({ id: 2, name: 'A1', room: 'Packing 1' }),
        parent({ id: 3, name: 'Other', room: 'Other', zone_letter: 'A' }),
      ],
      roomStructure: {
        'Packing 1': { rows: { A: ['1'] } },
        Other: { rows: {} },
      },
    };

    const next = applyRoomPatchToLocations(prev, {
      oldName: 'Packing 1',
      room: parent({
        id: 1,
        name: 'Zone 2 - Packing Station 1',
        room: 'Zone 2 - Packing Station 1',
        zone_letter: 'G',
      }),
    });

    const rooms = next.locations.filter((l) => !l.row_label && !l.col_label);
    const names = rooms.map((r) => r.room || r.name);
    assert.ok(names.includes('Zone 2 - Packing Station 1'));
    assert.ok(!names.includes('Packing 1'));

    const updated = rooms.find((r) => r.id === 1)!;
    assert.equal(updated.zone_letter, 'G');

    const movedBin = next.locations.find((l) => l.id === 2)!;
    assert.equal(movedBin.room, 'Zone 2 - Packing Station 1');

    assert.ok(next.roomStructure['Zone 2 - Packing Station 1']);
    assert.equal(next.roomStructure['Packing 1'], undefined);
  });

  it('updates zone letter without rename', () => {
    const prev: LocationsListData = {
      locations: [parent({ id: 1, name: 'Packing 1', zone_letter: null })],
      roomStructure: {},
    };
    const next = applyRoomPatchToLocations(prev, {
      oldName: 'Packing 1',
      room: parent({ id: 1, name: 'Packing 1', zone_letter: 'K' }),
    });
    assert.equal(next.locations[0].zone_letter, 'K');
    assert.equal(next.locations[0].name, 'Packing 1');
  });
});

describe('applyRoomCreateToLocations / applyRoomDeleteToLocations', () => {
  it('adds and removes room parents from the shared list', () => {
    const empty: LocationsListData = { locations: [], roomStructure: {} };
    const created = applyRoomCreateToLocations(
      empty,
      parent({ id: 9, name: 'New Room', zone_letter: 'Z' }),
    );
    assert.equal(created.locations.length, 1);
    assert.ok(created.roomStructure['New Room']);

    const deleted = applyRoomDeleteToLocations(created, 'New Room');
    assert.equal(deleted.locations.length, 0);
    assert.equal(deleted.roomStructure['New Room'], undefined);
  });
});

describe('roomFormCanSave / roomFormIsDirty / roomSaveDisabledReason', () => {
  it('requires an A–Z zone letter before Save enables', () => {
    assert.equal(
      roomFormCanSave({
        trimmedName: 'Packing 1',
        trimmedLetter: '',
        nameTaken: false,
        renameTaken: false,
      }),
      false,
    );
    assert.equal(
      roomFormCanSave({
        trimmedName: 'Packing 1',
        trimmedLetter: 'G',
        nameTaken: false,
        renameTaken: false,
      }),
      true,
    );
    assert.equal(
      roomSaveDisabledReason({
        creating: false,
        canSave: false,
        isDirty: true,
        trimmedLetter: '',
      }),
      'Pick a zone letter to save.',
    );
  });

  it('treats name, letter, and description edits as dirty', () => {
    assert.equal(
      roomFormIsDirty({
        creating: false,
        selectedRoom: 'Packing 1',
        trimmedName: 'Packing 1 Renamed',
        trimmedLetter: 'G',
        baselineLetter: 'G',
      }),
      true,
    );
    assert.equal(
      roomFormIsDirty({
        creating: false,
        selectedRoom: 'Packing 1',
        trimmedName: 'Packing 1',
        trimmedLetter: 'G',
        baselineLetter: 'G',
      }),
      false,
    );
    assert.equal(
      roomFormIsDirty({
        creating: false,
        selectedRoom: 'Packing 1',
        trimmedName: 'Packing 1',
        trimmedLetter: 'G',
        baselineLetter: 'G',
        description: 'Fragile only',
        baselineDescription: '',
      }),
      true,
    );
  });

  it('does not wipe canSave after a simulated rename cache write under the new name', () => {
    const prev: LocationsListData = {
      locations: [parent({ id: 1, name: 'Old', zone_letter: 'G' })],
      roomStructure: {},
    };
    const next = applyRoomPatchToLocations(prev, {
      oldName: 'Old',
      room: parent({ id: 1, name: 'New', room: 'New', zone_letter: 'G' }),
    });
    const zoneMap: Record<string, string> = {};
    for (const r of next.locations) {
      const key = (r.room || r.name)?.trim();
      if (key && r.zone_letter && /^[A-Z]$/.test(r.zone_letter)) {
        zoneMap[key] = r.zone_letter;
      }
    }
    // After URL moves to ?room=New, form still has letter G from accept-server.
    assert.equal(zoneMap['New'], 'G');
    assert.equal(
      roomFormCanSave({
        trimmedName: 'New',
        trimmedLetter: 'G',
        nameTaken: false,
        renameTaken: false,
      }),
      true,
    );
    assert.equal(
      roomFormIsDirty({
        creating: false,
        selectedRoom: 'New',
        trimmedName: 'New',
        trimmedLetter: 'G',
        baselineLetter: zoneMap['New'] ?? '',
      }),
      false,
    );
  });
});

describe('shouldClearUnknownRoomSelection', () => {
  it('clears only when the room is truly gone and nothing is in flight', () => {
    assert.equal(
      shouldClearUnknownRoomSelection({
        selectedRoom: 'Gone',
        allRoomNames: ['Other'],
        roomsLoading: false,
        roomMutating: false,
        isFetching: false,
      }),
      true,
    );
  });

  it('does not clear during mutation or shared-cache refetch (rename race)', () => {
    assert.equal(
      shouldClearUnknownRoomSelection({
        selectedRoom: 'New',
        allRoomNames: ['Old'],
        roomsLoading: false,
        roomMutating: true,
        isFetching: false,
      }),
      false,
    );
    assert.equal(
      shouldClearUnknownRoomSelection({
        selectedRoom: 'New',
        allRoomNames: ['Old'],
        roomsLoading: false,
        roomMutating: false,
        isFetching: true,
      }),
      false,
    );
  });

  it('does not clear when the new name is already in the shared list', () => {
    assert.equal(
      shouldClearUnknownRoomSelection({
        selectedRoom: 'New',
        allRoomNames: ['New', 'Other'],
        roomsLoading: false,
        roomMutating: false,
        isFetching: false,
      }),
      false,
    );
  });
});
