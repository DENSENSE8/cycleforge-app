'use client';

import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { RepairPhotosResponse } from '@/lib/repair/repair-photos';
import { qk } from '@/queries/keys';
import { formatMonthDayTimePST } from '@/utils/date';
import { fetchRepairJson, validRepairId } from './useRepairWorkbench';

/**
 * The repair's evidence photos and ready videos (`GET /api/repair-service/[id]/photos`,
 * entity `REPAIR_SERVICE`, each oldest first, server-stamped `createdAt`).
 * Shared by the Photos screen and the hub row summary through one cached query.
 */
export function useRepairPhotos(repairId: number) {
  const valid = validRepairId(repairId);
  const query = useQuery({
    queryKey: qk.repairs.workbench(repairId, 'photos'),
    queryFn: async ({ signal }): Promise<RepairPhotosResponse> => {
      const data = await fetchRepairJson<Partial<RepairPhotosResponse>>(`/api/repair-service/${repairId}/photos`, signal);
      return { photos: data.photos ?? [], videos: data.videos ?? [] };
    },
    enabled: valid,
  });
  const { refetch } = query;
  const reload = useCallback(() => {
    void refetch();
  }, [refetch]);
  return {
    photos: query.data?.photos ?? [],
    videos: query.data?.videos ?? [],
    loading: valid && query.isPending,
    error: !valid ? 'Invalid repair id' : query.error ? (query.error as Error).message || 'Failed to load photos' : null,
    reload,
  };
}

/** Hub row summary for the Photos screen: */
export function useRepairPhotosRow(repairId: number): { meta: string; enabled: boolean } {
  const { photos, videos, loading, error } = useRepairPhotos(repairId);
  if (!Number.isFinite(repairId) || repairId <= 0) return { meta: 'Invalid repair id', enabled: false };
  if (loading && photos.length === 0) return { meta: 'Loading…', enabled: true };
  if (error) return { meta: `Couldn't load photos — ${error}`, enabled: true };
  if (photos.length === 0 && videos.length === 0) return { meta: 'No photos yet · take the first', enabled: true };
  const counts = [
    photos.length === 0 ? null : photos.length === 1 ? '1 photo' : `${photos.length} photos`,
    videos.length === 0 ? null : videos.length === 1 ? '1 video' : `${videos.length} videos`,
  ].filter(Boolean);
  const newest = [...photos, ...videos].reduce((latest, m) => (m.createdAt > latest ? m.createdAt : latest), '');
  return { meta: `${counts.join(' · ')} · last ${formatMonthDayTimePST(newest)}`, enabled: true };
}
