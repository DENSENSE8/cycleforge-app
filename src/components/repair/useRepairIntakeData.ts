'use client';

import { useEffect, useState } from 'react';
import { getActiveStaff } from '@/lib/staffCache';
import { staffHasRole } from '@/utils/staff';

export interface TechStaff {
  id: number;
  name: string;
}

/**
 * Loads the data the repair intake wizard needs up front: the technician
 * directory (filtered from active staff) and the SKU issue labels for the
 * selected favorite (or the default issue list).
 */
export function useRepairIntakeData(favoriteSkuId?: number | null, kioskMode = false) {
  const [techs, setTechs] = useState<TechStaff[]>([]);
  // On the headless kiosk (device principal) both fetches below hit staff-only
  // endpoints that 401, and neither surface is shown — start settled + empty.
  const [loadingTechs, setLoadingTechs] = useState(!kioskMode);
  const [skuIssues, setSkuIssues] = useState<string[]>([]);

  useEffect(() => {
    if (kioskMode) return;
    let active = true;
    getActiveStaff()
      .then((data) => {
        if (active) setTechs(data.filter((m) => staffHasRole(m, 'technician')));
      })
      .catch(() => setTechs([]))
      .finally(() => setLoadingTechs(false));
    return () => { active = false; };
  }, [kioskMode]);

  useEffect(() => {
    if (kioskMode) return;
    let active = true;
    const url = favoriteSkuId
      ? `/api/repair/issues?favoriteSkuId=${favoriteSkuId}`
      : '/api/repair/issues';
    fetch(url)
      .then((r) => r.json())
      .then((data) => {
        if (active) setSkuIssues(
          Array.isArray(data?.issues) ? data.issues.map((i: { label: string }) => i.label) : [],
        );
      })
      .catch(() => { if (active) setSkuIssues([]); });
    return () => { active = false; };
  }, [favoriteSkuId, kioskMode]);

  return { techs, loadingTechs, skuIssues };
}
