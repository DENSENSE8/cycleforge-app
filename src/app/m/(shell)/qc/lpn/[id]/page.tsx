'use client';

import { useParams } from 'next/navigation';
import { QcLpnWorkSurface } from '@/components/mobile/qc/QcLpnWorkSurface';

export default function QcLpnPage() {
  const params = useParams<{ id: string }>();
  return <QcLpnWorkSurface lpnRef={decodeURIComponent(String(params?.id ?? ''))} />;
}
