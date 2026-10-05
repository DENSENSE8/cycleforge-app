'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from '@/lib/toast';
import { useLocations } from '@/hooks/useLocations';
import { useBinsOverview } from '@/hooks/useBinsOverview';
import {
  roomFormCanSave,
  roomFormIsDirty,
  roomSaveDisabledReason,
} from '@/hooks/locations-cache';
import { EMPTY_FORM, LETTERS, type FormState } from './room-detail-shared';

/** Owns the warehouse room detail form: */
export function useRoomDetailForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedRoom = searchParams.get('room') ?? null;
  const creating = searchParams.get('new') === 'true';
  const query = (searchParams.get('q') ?? '').trim().toLocaleLowerCase();

  const {
    rooms,
    roomNames,
    loading: roomsLoading,
    createRoom,
    renameRoom,
    removeRoom,
    roomMutating,
  } = useLocations();
  const { rows: bins, loading: binsLoading } = useBinsOverview({ pollMs: 0 });

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [confirmDelete, setConfirmDelete] = useState(false);
  /** Last selection key we seeded the form for (`__new__` | room name). */
  const seededForRef = useRef<string | null>(null);

  // Map existing zone letters so the picker can grey out locked letters.
  const zoneMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const r of rooms) {
      const key = (r.room || r.name)?.trim();
      if (!key) continue;
      if (r.zone_letter && /^[A-Z]$/.test(r.zone_letter)) map[key] = r.zone_letter;
    }
    return map;
  }, [rooms]);

  const allRoomNames = useMemo(() => {
    const set = new Set<string>();
    for (const r of rooms) {
      const key = (r.room || r.name)?.trim();
      if (key) set.add(key);
    }
    for (const n of roomNames) if (n) set.add(n);
    return Array.from(set);
  }, [rooms, roomNames]);

  const roomRows = useMemo(
    () =>
      allRoomNames
        .filter((name) => !query || name.toLocaleLowerCase().includes(query))
        .map((name) => {
          const roomBins = bins.filter((bin) => (bin.room || '').trim() === name);
          const record = rooms.find((room) => (room.room || room.name)?.trim() === name) ?? null;
          return {
            name,
            zoneLetter: zoneMap[name] ?? record?.zone_letter ?? '',
            description: record?.description ?? '',
            binCount: roomBins.length,
            totalQty: roomBins.reduce((sum, bin) => sum + bin.total_qty, 0),
            emptyCount: roomBins.filter((bin) => bin.is_empty).length,
            attentionCount: roomBins.filter(
              (bin) => bin.has_low_stock || bin.is_over_capacity || bin.is_stale,
            ).length,
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name)),
    [allRoomNames, bins, query, rooms, zoneMap],
  );

  const currentRecord = useMemo(() => {
    if (!selectedRoom) return null;
    return (
      rooms.find((r) => (r.room || r.name) === selectedRoom) ?? null
    );
  }, [rooms, selectedRoom]);

  // Seed form when selection identity changes. Wait for the first rooms
  // payload so zone letter is available; do not re-seed on later refetches.
  useEffect(() => {
    if (creating) {
      if (seededForRef.current === '__new__') return;
      // Wait for locked-letter map so we don't auto-pick a taken letter.
      if (roomsLoading) return;
      const usedLetters = new Set(Object.values(zoneMap));
      const next = LETTERS.find((l) => !usedLetters.has(l)) ?? 'A';
      seededForRef.current = '__new__';
      setForm({ name: '', letter: next, description: '' });
      return;
    }
    if (!selectedRoom) {
      seededForRef.current = null;
      setForm(EMPTY_FORM);
      return;
    }
    if (seededForRef.current === selectedRoom) return;
    // Still loading and we have no row yet — wait so we don't seed letter ''.
    if (roomsLoading && !currentRecord) return;

    seededForRef.current = selectedRoom;
    const desc = currentRecord?.description ?? '';
    setForm({
      name: selectedRoom,
      letter: zoneMap[selectedRoom] ?? currentRecord?.zone_letter ?? '',
      description: desc,
    });
  }, [creating, selectedRoom, roomsLoading, currentRecord, zoneMap]);

  // Live stats for the selected room — same calc the sidebar uses but
  // limited to the focused room.
  const stats = useMemo(() => {
    if (!selectedRoom) return null;
    let binCount = 0;
    let totalQty = 0;
    let totalCapacity = 0;
    let capacitySamples = 0;
    let empty = 0;
    let low = 0;
    let over = 0;
    let stale = 0;
    let lastCounted: string | null = null;
    for (const b of bins) {
      if ((b.room || '').trim() !== selectedRoom) continue;
      binCount += 1;
      totalQty += b.total_qty;
      if (b.capacity != null && b.capacity > 0) {
        totalCapacity += b.capacity;
        capacitySamples += 1;
      }
      if (b.is_empty) empty += 1;
      if (b.has_low_stock) low += 1;
      if (b.is_over_capacity) over += 1;
      if (b.is_stale) stale += 1;
      if (b.last_counted && (!lastCounted || b.last_counted > lastCounted)) {
        lastCounted = b.last_counted;
      }
    }
    return {
      binCount,
      totalQty,
      totalCapacity,
      capacitySamples,
      empty,
      low,
      over,
      stale,
      lastCounted,
    };
  }, [bins, selectedRoom]);

  const usedLetters = useMemo(() => {
    const set = new Set(Object.values(zoneMap));
    // When editing an existing room, allow its current letter to be picked
    // again (otherwise the form would think it's locked).
    if (selectedRoom && zoneMap[selectedRoom]) set.delete(zoneMap[selectedRoom]);
    return set;
  }, [zoneMap, selectedRoom]);

  const trimmedName = form.name.trim();
  const trimmedLetter = (form.letter || '').toUpperCase();
  const nameTaken =
    creating &&
    trimmedName.length > 0 &&
    allRoomNames.includes(trimmedName);
  const renameTaken =
    !creating &&
    !!selectedRoom &&
    trimmedName.length > 0 &&
    trimmedName !== selectedRoom &&
    allRoomNames.includes(trimmedName);
  const canSave = roomFormCanSave({
    trimmedName,
    trimmedLetter,
    nameTaken,
    renameTaken,
  });
  const baselineLetter = selectedRoom ? (zoneMap[selectedRoom] ?? '') : '';
  const baselineDescription = currentRecord?.description ?? '';
  const isDirty = roomFormIsDirty({
    creating,
    selectedRoom,
    trimmedName,
    trimmedLetter,
    baselineLetter,
    description: form.description,
    baselineDescription,
  });
  const saveDisabledReason = roomSaveDisabledReason({
    creating,
    canSave,
    isDirty,
    trimmedLetter,
  });

  const setParam = useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('tab', 'rooms');
      mutate(params);
      router.replace(`/inventory/locations?${params.toString()}`);
    },
    [router, searchParams],
  );

  const goToBins = useCallback(() => {
    if (!selectedRoom) return;
    setParam((p) => {
      p.set('tab', 'bins');
      p.set('room', selectedRoom);
      p.delete('new');
      p.delete('edit');
    });
  }, [selectedRoom, setParam]);

  const handleSave = useCallback(async () => {
    if (!canSave) return;
    try {
      if (creating) {
        const result = await createRoom(trimmedName, trimmedLetter, form.description);
        if (!result) throw new Error('Create failed');
        toast.success(`Room "${trimmedName}" added (Zone ${trimmedLetter})`);
        // Mark seeded for the new name so the create→edit transition does not
        // flash EMPTY then re-seed; URL change will select the room.
        seededForRef.current = trimmedName;
        setForm({
          name: trimmedName,
          letter: trimmedLetter,
          description: form.description,
        });
        setParam((p) => {
          p.delete('new');
          p.set('room', trimmedName);
        });
      } else if (selectedRoom) {
        const isRename = trimmedName !== selectedRoom;
        const result = await renameRoom(
          selectedRoom,
          isRename ? trimmedName : undefined,
          trimmedLetter,
          form.description,
        );
        if (!result) throw new Error('Save failed');
        toast.success(
          isRename
            ? `Renamed to "${trimmedName}" (Zone ${trimmedLetter})`
            : `Saved Zone ${trimmedLetter}`,
        );
        // Accept server snapshot into form so isDirty clears immediately.
        // renameRoom already wrote the shared cache; update URL in the same
        // turn so the sidebar never sees ?room=old against a new-name list.
        const nextName = isRename ? trimmedName : selectedRoom;
        seededForRef.current = nextName;
        setForm({
          name: nextName,
          letter: result.room?.zone_letter ?? trimmedLetter,
          description: result.room?.description ?? form.description,
        });
        if (isRename) {
          setParam((p) => {
            p.set('room', trimmedName);
          });
        }
      }
    } catch (err: any) {
      toast.error(err?.message || 'Could not save');
    }
  }, [
    canSave,
    creating,
    trimmedName,
    trimmedLetter,
    selectedRoom,
    createRoom,
    renameRoom,
    setParam,
    form.description,
  ]);

  const handleDelete = useCallback(async () => {
    if (!selectedRoom) return;
    try {
      const result = await removeRoom(selectedRoom);
      if (!result) throw new Error('Delete failed');
      toast.success(`Room "${selectedRoom}" deleted`);
      seededForRef.current = null;
      setParam((p) => {
        p.delete('room');
        p.delete('new');
      });
    } catch (err: any) {
      toast.error(err?.message || 'Could not delete');
    } finally {
      setConfirmDelete(false);
    }
  }, [selectedRoom, removeRoom, setParam]);

  const deleteRoomByName = useCallback(async (name: string) => {
    try {
      const result = await removeRoom(name);
      if (!result) throw new Error('Delete failed');
      toast.success(`Room "${name}" deleted`);
      if (selectedRoom === name) {
        seededForRef.current = null;
        setParam((params) => {
          params.delete('room');
          params.delete('new');
        });
      }
      return true;
    } catch (err: any) {
      toast.error(err?.message || 'Could not delete room');
      return false;
    }
  }, [removeRoom, selectedRoom, setParam]);

  const handleDiscard = useCallback(() => {
    if (creating) {
      seededForRef.current = null;
      setParam((p) => p.delete('new'));
      return;
    }
    if (!selectedRoom) return;
    const desc = currentRecord?.description ?? '';
    setForm({
      name: selectedRoom,
      letter: zoneMap[selectedRoom] ?? '',
      description: desc,
    });
  }, [creating, selectedRoom, currentRecord, zoneMap, setParam]);

  return {
    creating, selectedRoom,
    roomsLoading, binsLoading,
    allRoomNames, roomRows,
    form, setForm,
    confirmDelete, setConfirmDelete,
    stats, usedLetters,
    trimmedName, trimmedLetter,
    nameTaken, renameTaken, canSave, isDirty, saveDisabledReason,
    roomMutating,
    setParam, goToBins, handleSave, handleDelete, deleteRoomByName, handleDiscard,
  };
}

export type RoomDetailController = ReturnType<typeof useRoomDetailForm>;
