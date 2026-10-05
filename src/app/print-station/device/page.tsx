import type { Metadata } from 'next';
import { PrintStationDevice } from '@/features/print-station/PrintStationDevice';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Print station device' };

/**
 * The always-on, no-staff print station. Its httpOnly device credential owns
 * the session; the root layout deliberately serves this route in public chrome
 * even if a staff cookie happens to exist in the same browser profile.
 */
export default function PrintStationDevicePage() {
  return <PrintStationDevice />;
}
