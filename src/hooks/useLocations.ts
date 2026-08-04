import { useCallback, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { qk } from '@/queries/keys';
import {
  applyRoomCreateToLocations,
  applyRoomDeleteToLocations,
  applyRoomPatchToLocations,
  applyRoomReorderToLocations,
  type LocationRecord,
  type LocationsListData,
  type RoomSnapshot,
  type RoomStructure,
} from './locations-cache';

export type {
  RoomStructure,
} from './locations-cache';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CreateLocationPayload {
  name: string;
  room?: string | null;
  description?: string | null;
  barcode?: string | null;
  sortOrder?: number;
  rowLabel?: string | null;
  colLabel?: string | null;
  binType?: string | null;
  capacity?: number | null;
  parentId?: number | null;
}

export interface BulkBinRangePayload {
  room: string;
  rowLabel: string;
  colStart: number;
  colEnd: number;
  binType?: string | null;
  capacity?: number | null;
}

interface RoomPatchResult {
  updated: number;
  barcodesRekeyed: number;
  room: RoomSnapshot | null;
}

// ─── Fetchers ───────────────────────────────────────────────────────────────

async function fetchLocations(): Promise<LocationsListData> {
  const res = await fetch('/api/locations', { cache: 'no-store' });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || 'Failed to fetch locations');
  return {
    locations: Array.isArray(data?.locations) ? data.locations : [],
    roomStructure: data?.roomStructure ?? {},
  };
}

async function postLocation(payload: CreateLocationPayload): Promise<LocationRecord> {
  const res = await fetch('/api/locations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || 'Failed to create location');
  return data.location;
}

async function postRoom(payload: {
  name: string;
  description?: string | null;
  zoneLetter?: string | null;
}): Promise<LocationRecord> {
  const res = await fetch('/api/rooms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || 'Failed to create room');
  return data.room;
}

async function patchRoom(args: {
  oldName: string;
  newName?: string;
  zoneLetter?: string | null;
}): Promise<RoomPatchResult> {
  const body: Record<string, unknown> = {};
  if (args.newName !== undefined) body.name = args.newName;
  if (args.zoneLetter !== undefined) body.zoneLetter = args.zoneLetter;
  const res = await fetch(`/api/rooms/${encodeURIComponent(args.oldName)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || 'Failed to update room');
  return {
    updated: typeof data?.updated === 'number' ? data.updated : 0,
    barcodesRekeyed: typeof data?.barcodesRekeyed === 'number' ? data.barcodesRekeyed : 0,
    room: data?.room ?? null,
  };
}

async function deleteRoom(name: string): Promise<{ deactivated: number }> {
  const res = await fetch(`/api/rooms/${encodeURIComponent(name)}`, { method: 'DELETE' });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || 'Failed to delete room');
  return data;
}

async function postBulkBins(
  payload: BulkBinRangePayload,
): Promise<{ created: number; bins: LocationRecord[] }> {
  const res = await fetch('/api/locations/bulk', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || 'Failed to create bins');
  return data;
}

async function postReorderRooms(order: string[]): Promise<{ updated: number }> {
  const res = await fetch('/api/rooms/reorder', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ order }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || 'Failed to reorder rooms');
  return data;
}

// ─── Hook ───────────────────────────────────────────────────────────────────

export interface UseLocationsResult {
  locations: LocationRecord[];
  /** Room-level locations only (no row/col). */
  rooms: LocationRecord[];
  /** Bin-level locations only (with row/col). */
  bins: LocationRecord[];
  /** Room → rows → cols cascading structure. */
  roomStructure: RoomStructure;
  /** Get distinct rooms as strings. */
  roomNames: string[];
  loading: boolean;
  /** True while a background refetch / invalidation is in flight. */
  fetching: boolean;
  error: Error | null;
  refetch: () => void;
  create: (payload: CreateLocationPayload) => Promise<LocationRecord | null>;
  creating: boolean;
  createError: Error | null;
  /** Create a brand-new room (just a parent entry; no bins). */
  createRoom: (name: string, zoneLetter?: string | null) => Promise<LocationRecord | null>;
  /** Rename a room everywhere it appears (parent + all bins + barcodes). */
  renameRoom: (
    oldName: string,
    newName?: string,
    zoneLetter?: string | null,
  ) => Promise<RoomPatchResult | null>;
  /** Soft-delete a room and all of its bins. */
  removeRoom: (name: string) => Promise<{ deactivated: number } | null>;
  /** Bulk-create bins from a range spec ({room, rowLabel, colStart, colEnd}). */
  createBinRange: (
    payload: BulkBinRangePayload,
  ) => Promise<{ created: number; bins: LocationRecord[] } | null>;
  /** Persist a new room display order (array of room names). */
  reorderRooms: (order: string[]) => Promise<{ updated: number } | null>;
  roomMutating: boolean;
  roomMutationError: Error | null;
  /** Resolve a barcode to its location record. */
  findByBarcode: (barcode: string) => LocationRecord | undefined;
  /** Get all bins for a specific room. */
  binsForRoom: (room: string) => LocationRecord[];
}

export function useLocations(): UseLocationsResult {
  const queryClient = useQueryClient();

  const {
    data,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useQuery({
    queryKey: qk.locations.list(),
    queryFn: fetchLocations,
    staleTime: 30_000,
  });

  const invalidateLocations = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: qk.locations.all });
    void queryClient.invalidateQueries({ queryKey: qk.locationsAdmin.all });
  }, [queryClient]);

  const writeList = useCallback(
    (updater: (prev: LocationsListData) => LocationsListData) => {
      queryClient.setQueryData<LocationsListData>(qk.locations.list(), (prev) => {
        if (!prev) return prev;
        return updater(prev);
      });
    },
    [queryClient],
  );

  const createMutation = useMutation({
    mutationFn: postLocation,
    onSuccess: () => {
      invalidateLocations();
    },
  });

  const createRoomMutation = useMutation({
    mutationFn: postRoom,
    onSuccess: (room) => {
      writeList((prev) => applyRoomCreateToLocations(prev, room));
      invalidateLocations();
    },
  });

  const renameRoomMutation = useMutation({
    mutationFn: patchRoom,
    onSuccess: (result, vars) => {
      if (result.room) {
        writeList((prev) =>
          applyRoomPatchToLocations(prev, {
            oldName: vars.oldName,
            room: result.room!,
          }),
        );
      }
      invalidateLocations();
    },
  });

  const deleteRoomMutation = useMutation({
    mutationFn: deleteRoom,
    onSuccess: (_result, name) => {
      writeList((prev) => applyRoomDeleteToLocations(prev, name));
      invalidateLocations();
    },
  });

  const bulkBinsMutation = useMutation({
    mutationFn: postBulkBins,
    onSuccess: () => {
      invalidateLocations();
    },
  });

  const reorderRoomsMutation = useMutation({
    mutationFn: postReorderRooms,
    onSuccess: (_result, order) => {
      writeList((prev) => applyRoomReorderToLocations(prev, order));
      invalidateLocations();
    },
  });

  const create = useCallback(
    async (payload: CreateLocationPayload): Promise<LocationRecord | null> => {
      try {
        return await createMutation.mutateAsync(payload);
      } catch {
        return null;
      }
    },
    [createMutation],
  );

  const createRoom = useCallback(
    async (name: string, zoneLetter?: string | null) => {
      try {
        return await createRoomMutation.mutateAsync({
          name,
          zoneLetter: zoneLetter ?? null,
        });
      } catch {
        return null;
      }
    },
    [createRoomMutation],
  );

  const renameRoomFn = useCallback(
    async (oldName: string, newName?: string, zoneLetter?: string | null) => {
      try {
        return await renameRoomMutation.mutateAsync({
          oldName,
          newName,
          zoneLetter,
        });
      } catch {
        return null;
      }
    },
    [renameRoomMutation],
  );

  const removeRoom = useCallback(
    async (name: string) => {
      try {
        return await deleteRoomMutation.mutateAsync(name);
      } catch {
        return null;
      }
    },
    [deleteRoomMutation],
  );

  const createBinRange = useCallback(
    async (payload: BulkBinRangePayload) => {
      try {
        return await bulkBinsMutation.mutateAsync(payload);
      } catch {
        return null;
      }
    },
    [bulkBinsMutation],
  );

  const reorderRoomsFn = useCallback(
    async (order: string[]) => {
      try {
        return await reorderRoomsMutation.mutateAsync(order);
      } catch {
        return null;
      }
    },
    [reorderRoomsMutation],
  );

  const roomMutating =
    createRoomMutation.isPending ||
    renameRoomMutation.isPending ||
    deleteRoomMutation.isPending ||
    bulkBinsMutation.isPending ||
    reorderRoomsMutation.isPending;

  const roomMutationError =
    createRoomMutation.error ||
    renameRoomMutation.error ||
    deleteRoomMutation.error ||
    bulkBinsMutation.error ||
    reorderRoomsMutation.error;

  const locations = data?.locations ?? [];
  const roomStructure = data?.roomStructure ?? {};

  const rooms = useMemo(
    () => locations.filter((l) => !l.row_label && !l.col_label),
    [locations],
  );

  const bins = useMemo(
    () => locations.filter((l) => l.row_label && l.col_label),
    [locations],
  );

  const roomNames = useMemo(
    () => [...new Set(locations.map((l) => l.room).filter(Boolean))] as string[],
    [locations],
  );

  const findByBarcode = useCallback(
    (barcode: string) => locations.find((l) => l.barcode === barcode),
    [locations],
  );

  const binsForRoom = useCallback(
    (room: string) => bins.filter((b) => b.room === room),
    [bins],
  );

  return {
    locations,
    rooms,
    bins,
    roomStructure,
    roomNames,
    loading: isLoading,
    fetching: isFetching,
    error: error instanceof Error ? error : error ? new Error(String(error)) : null,
    refetch: () => {
      void refetch();
    },
    create,
    creating: createMutation.isPending,
    createError:
      createMutation.error instanceof Error
        ? createMutation.error
        : createMutation.error
          ? new Error(String(createMutation.error))
          : null,
    createRoom,
    renameRoom: renameRoomFn,
    removeRoom,
    createBinRange,
    reorderRooms: reorderRoomsFn,
    roomMutating,
    roomMutationError:
      roomMutationError instanceof Error
        ? roomMutationError
        : roomMutationError
          ? new Error(String(roomMutationError))
          : null,
    findByBarcode,
    binsForRoom,
  };
}
