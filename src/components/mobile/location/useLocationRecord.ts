'use client';

import { useCallback, useMemo } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { locationCode, parseLocationCodeFlat, unwrapScannedLocation } from '@/lib/barcode-routing';
import { mobileJobReturn, withJobReturn } from '@/lib/mobile/nav-trail';
import { locationHubPath } from '@/lib/mobile/location-hub-href';
import { fetchLocationRecord, locationRecordQueryKey } from '@/components/mobile/scan/location-bind-api';

export const LOCATION_ADDRESS_ERROR = 'No location code in this link.';

/**
 * The location record the hub and `/info` share: the scanned code from the
 * route, the job it was opened from (`?back=`, for the bar's X), and the
 * React Query read every stock write invalidates (`mobile-location-bind`).
 */
export function useLocationRecord() {
  const params = useParams<{ code: string }>();
  const searchParams = useSearchParams();
  const code = unwrapScannedLocation(decodeURIComponent(params?.code ?? ''));
  const segs = useMemo(() => parseLocationCodeFlat(code), [code]);
  const face = segs ? locationCode(segs) : code;
  const back = mobileJobReturn(searchParams.get('back'));
  const base = locationHubPath(code);
  /** A sibling screen of this record, keeping the job the X returns to. */
  const link = useCallback((href: string) => (back ? withJobReturn(href, back) : href), [back]);

  const query = useQuery({
    queryKey: locationRecordQueryKey(code),
    queryFn: () => fetchLocationRecord(code, segs),
    enabled: code.length > 0,
  });

  return {
    code,
    face,
    back,
    base,
    link,
    record: query.data,
    loading: code.length > 0 && query.isPending,
    error: code.length === 0 ? LOCATION_ADDRESS_ERROR : query.error?.message ?? null,
    reload: () => void query.refetch(),
  };
}

export function locationUnits(contents: ReadonlyArray<{ qty: number }>): number {
  return contents.reduce((sum, row) => sum + row.qty, 0);
}
