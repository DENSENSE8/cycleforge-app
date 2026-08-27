/**
 * Pure helpers for the shared warehouse locations query cache and room-form
 * save gating. Kept free of React so unit tests can cover rename races and
 * dirty/canSave rules without mounting hooks.
 */

export interface LocationRecord {
  id: number;
  name: string;
  /** Operator nickname; null = read {@link name}. Not unique. */
  display_name?: string | null;
  room: string | null;
  description: string | null;
  barcode: string | null;
  is_active: boolean;
  sort_order: number;
  row_label: string | null;
  col_label: string | null;
  bin_type: string | null;
  capacity: number | null;
  parent_id: number | null;
  /** Zone letter A-Z for parent room rows only. */
  zone_letter: string | null;
  /** Typed hierarchy — ROOM / DESK / STAGING / BIN / … (2026-08-09). */
  location_kind?: string | null;
}

/** Room → { rows: { [row]: cols[] } } structure for cascading pickers. */
export type RoomStructure = Record<string, { rows: Record<string, string[]> }>;

export interface LocationsListData {
  locations: LocationRecord[];
  roomStructure: RoomStructure;
}

export type RoomSnapshot = LocationRecord;

function isParentRow(loc: LocationRecord): boolean {
  return !loc.row_label && !loc.col_label;
}

/** Insert a newly created room parent into the list cache. */
export function applyRoomCreateToLocations(
  prev: LocationsListData,
  room: LocationRecord,
): LocationsListData {
  const key = (room.room || room.name).trim();
  return {
    locations: [...prev.locations, room],
    roomStructure: {
      ...prev.roomStructure,
      ...(key && !prev.roomStructure[key] ? { [key]: { rows: {} } } : {}),
    },
  };
}

/**
 * Apply a rename and/or zone-letter patch using the authoritative room
 * snapshot from PATCH. Rewrites bin `room` fields and the roomStructure key
 * so every mount sees the new name in the same tick as the URL update.
 */
export function applyRoomPatchToLocations(
  prev: LocationsListData,
  args: {
    oldName: string;
    room: RoomSnapshot;
  },
): LocationsListData {
  const oldName = args.oldName.trim();
  const newName = (args.room.room || args.room.name).trim();
  const renamed = oldName.length > 0 && newName.length > 0 && oldName !== newName;

  const locations = prev.locations.map((loc) => {
    if (isParentRow(loc)) {
      const matches =
        loc.id === args.room.id ||
        loc.name === oldName ||
        loc.room === oldName ||
        loc.name === newName ||
        loc.room === newName;
      if (matches) {
        return {
          ...loc,
          id: args.room.id || loc.id,
          name: args.room.name,
          room: args.room.room ?? args.room.name,
          description: args.room.description ?? loc.description,
          barcode: args.room.barcode ?? loc.barcode,
          is_active: args.room.is_active ?? loc.is_active,
          sort_order: args.room.sort_order ?? loc.sort_order,
          zone_letter: args.room.zone_letter,
          parent_id: args.room.parent_id ?? loc.parent_id,
        };
      }
    }
    if (renamed && loc.room === oldName) {
      return { ...loc, room: newName };
    }
    return loc;
  });

  let roomStructure = prev.roomStructure;
  if (renamed && prev.roomStructure[oldName]) {
    roomStructure = { ...prev.roomStructure };
    roomStructure[newName] = roomStructure[oldName];
    delete roomStructure[oldName];
  }

  return { locations, roomStructure };
}

/** Soft-delete: drop the room parent and its bins from the list cache. */
export function applyRoomDeleteToLocations(
  prev: LocationsListData,
  name: string,
): LocationsListData {
  const key = name.trim();
  const locations = prev.locations.filter(
    (loc) => loc.room !== key && loc.name !== key,
  );
  if (!prev.roomStructure[key]) {
    return { locations, roomStructure: prev.roomStructure };
  }
  const roomStructure = { ...prev.roomStructure };
  delete roomStructure[key];
  return { locations, roomStructure };
}

/** Persist a new display order onto room parent `sort_order` fields. */
export function applyRoomReorderToLocations(
  prev: LocationsListData,
  order: string[],
): LocationsListData {
  const rank = new Map(order.map((name, i) => [name, i]));
  const locations = prev.locations.map((loc) => {
    if (!isParentRow(loc)) return loc;
    const key = (loc.room || loc.name)?.trim();
    if (!key || !rank.has(key)) return loc;
    return { ...loc, sort_order: rank.get(key)! };
  });
  return { locations, roomStructure: prev.roomStructure };
}

export function roomFormCanSave(opts: {
  trimmedName: string;
  trimmedLetter: string;
  nameTaken: boolean;
  renameTaken: boolean;
}): boolean {
  return (
    opts.trimmedName.length > 0 &&
    /^[A-Z]$/.test(opts.trimmedLetter) &&
    !opts.nameTaken &&
    !opts.renameTaken
  );
}

/**
 * Dirty tracking for name + zone letter only. Description is excluded until
 * note storage ships (editing notes alone must not enable Save).
 */
export function roomFormIsDirty(opts: {
  creating: boolean;
  selectedRoom: string | null;
  trimmedName: string;
  trimmedLetter: string;
  baselineLetter: string;
}): boolean {
  if (opts.creating) {
    return opts.trimmedName.length > 0 || opts.trimmedLetter.length > 0;
  }
  if (!opts.selectedRoom) return false;
  return (
    opts.trimmedName !== opts.selectedRoom ||
    opts.trimmedLetter !== opts.baselineLetter
  );
}

export function roomSaveDisabledReason(opts: {
  creating: boolean;
  canSave: boolean;
  isDirty: boolean;
  trimmedLetter: string;
}): string | undefined {
  if (opts.canSave && (opts.creating || opts.isDirty)) return undefined;
  if (!/^[A-Z]$/.test(opts.trimmedLetter)) {
    return 'Pick a zone letter to save.';
  }
  if (!opts.creating && !opts.isDirty) return 'No changes to save.';
  if (!opts.canSave) return 'Fix the room name to save.';
  return undefined;
}

/**
 * Sidebar should not clear `?room=` while a mutation or background refetch
 * is in flight — that is the rename race that wiped the edit surface.
 */
export function shouldClearUnknownRoomSelection(opts: {
  selectedRoom: string | null;
  allRoomNames: string[];
  roomsLoading: boolean;
  roomMutating: boolean;
  isFetching: boolean;
}): boolean {
  if (!opts.selectedRoom) return false;
  if (opts.roomsLoading || opts.roomMutating || opts.isFetching) return false;
  return !opts.allRoomNames.includes(opts.selectedRoom);
}
