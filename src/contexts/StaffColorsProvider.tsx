'use client';

/** Populates the module-level staff identity cache in @/utils/staff-colors so the synchronous resolvers (getStaffThemeById,… */

import { useEffect, useReducer } from 'react';
import { useQuery } from '@tanstack/react-query';
import { qk } from '@/queries/keys';
import { useAuth } from '@/contexts/AuthContext';
import { useIdleReady } from '@/hooks/useIdleReady';
import {
  setStaffAvatarPhotoId,
  setStaffColorCache,
  _subscribeStaffColorCache,
  _getStaffColorVersion,
} from '@/utils/staff-colors';
import { fetchStaffRoster } from '@/lib/staffCache';

interface StaffColorRecord {
  id: number;
  color_hex?: string | null;
  /** `staff.avatar_photo_id` — feeds <StaffAvatar> without a per-surface join. */
  avatar_photo_id?: number | null;
}

export function StaffColorsProvider({ children }: { children: React.ReactNode }) {
  // Color cache is a nice-to-have warmup, not first-paint critical — wait for
  // idle so this app-wide fetch never races the route's own data.
  const idleReady = useIdleReady();
  const { user } = useAuth();
  // Reuses the canonical staff React Query key so updates from the admin
  // staff page (which invalidate qk.staff.all) refresh this cache for free.
  const { data } = useQuery<StaffColorRecord[]>({
    queryKey: qk.staff.all,
    enabled: idleReady,
    // Shared flight with `getActiveStaff` — one roster request serves both.
    queryFn: async () => {
      const rows = await fetchStaffRoster().catch(() => []);
      return rows as StaffColorRecord[];
    },
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (data) setStaffColorCache(data);
  }, [data]);

  // Seed the SIGNED-IN staffer's own avatar from the auth envelope.
  const selfStaffId = user?.staffId;
  const selfAvatarPhotoId = user?.avatarPhotoId ?? null;
  useEffect(() => {
    if (!selfStaffId) return;
    setStaffAvatarPhotoId(selfStaffId, selfAvatarPhotoId);
  }, [selfStaffId, selfAvatarPhotoId, data]);

  return <>{children}</>;
}

/** Subscribes to the module-level color cache version. */
export function useStaffColorVersion(): number {
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => _subscribeStaffColorCache(force), []);
  return _getStaffColorVersion();
}
