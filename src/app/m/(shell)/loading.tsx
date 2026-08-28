/**
 * Route-level loading shell for the tabbed mobile group — the STATIC house
 * loading field.
 *
 * Zero JS on purpose: `/m/*` runs the mobile Lighthouse profile (4× CPU), and
 * the live canvas field's spring loop landed on the main thread during shell
 * hydration — measured `/m/scan` 76 → 63 (TBT ~370ms) with the live field
 * here. Same lattice, no loop. SoT: {@link LoaderFieldStatic}.
 */

import { LoaderFieldStatic } from '@/design-system/components/LoaderFieldStatic';

export default function Loading() {
  return <LoaderFieldStatic label="Loading" />;
}
