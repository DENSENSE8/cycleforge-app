/**
 * /m/prepacked — prepacked-product verify / put-away, as its own route.
 * Body: `MobilePrepackedScan` (see its docblock).
 */

import MobilePrepackedScan from '@/components/mobile/redesign/MobilePrepackedScan';

export default function MobilePrepackedPage() {
  return <MobilePrepackedScan />;
}
