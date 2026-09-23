'use client';

import { useEffect, useState } from 'react';
import { getActiveStaff } from '@/lib/staffCache';
import { staffHasRole } from '@/utils/staff';

export interface TechStaff {
  id: number;
  name: string;
}

/**
 * Loads the data the repair intake wizard needs: the technician directory
 * (filtered from active staff) and the reason labels for the SELECTED SKU.
 *
 * The SKU is a string, not a `favorite_skus.id`, because favorites stopped
 * being a separate rail (2026-09-16) — the operator picks from the catalog and
 * a favorite is simply a pinned product in it. Per-SKU reasons therefore have
 * to resolve from what the picker reports, which is also why they now work for
 * any product instead of only for the handful that were favorited. Mirrors
 * `useKioskSkuReasons`, which already keyed off the SKU string on the device.
 */
export function useRepairIntakeData(selectedSku?: string | null, kioskMode = false) {
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
    const sku = String(selectedSku || '').trim();
    const url = sku ? `/api/repair/issues?sku=${encodeURIComponent(sku)}` : '/api/repair/issues';
    fetch(url)
      .then((r) => r.json())
      .then((data) => {
        if (active) setSkuIssues(
          Array.isArray(data?.issues) ? data.issues.map((i: { label: string }) => i.label) : [],
        );
      })
      .catch(() => { if (active) setSkuIssues([]); });
    return () => { active = false; };
  }, [selectedSku, kioskMode]);

  return { techs, loadingTechs, skuIssues };
}
