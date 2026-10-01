'use client';

import { useParams } from 'next/navigation';
import { HandlingUnitV2Record } from '@/components/mobile/handling-units/HandlingUnitV2Record';

/** Stable identity URL for an LPN, now rendered by the V2 record surface. */
export default function MobileHandlingUnitPage() {
  const params = useParams<{ id: string }>();
  return <HandlingUnitV2Record lpnRef={decodeURIComponent(String(params?.id ?? ''))} />;
}
