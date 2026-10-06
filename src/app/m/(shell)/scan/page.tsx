/**
 * /m/scan — identification kernel (packages + PO tracking).
 *
 * No server await: the Scan button swaps straight to the camera. Earlier
 * scans load only when the operator asks for them.
 */

import MobileScanIdentify from '@/components/mobile/scan/MobileScanIdentify';

export default function MobileScanPage() {
  return <MobileScanIdentify />;
}
