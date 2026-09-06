/**
 * /m/testing — the testing-orders scan (PO R-#### labels), as its own route.
 * Body: `MobileTestingScan` (see its docblock).
 */

import MobileTestingScan from '@/components/mobile/redesign/MobileTestingScan';

export default function MobileTestingPage() {
  return <MobileTestingScan />;
}
