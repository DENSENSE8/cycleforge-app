/**
 * /m/scan-out — the dock SHIP_CONFIRM station on a phone.
 *
 * No server seed: the tape is the operator's OWN session, built from the scans
 * they fire here, so there is nothing to render before the first read. The
 * screen is a client component end to end.
 */

import { MobileScanOut } from '@/components/mobile/redesign/MobileScanOut';

export default function MobileScanOutPage() {
  return <MobileScanOut />;
}
