/**
 * Route-level loading shell for the immersive mobile group — the STATIC house
 * loading field. Zero JS: same reasoning as the tabbed mobile group's loader
 * (mobile profile, main-thread contention during hydration).
 * SoT: {@link LoaderFieldStatic}.
 */

import { LoaderFieldStatic } from '@/design-system/components/LoaderFieldStatic';

export default function Loading() {
  return <LoaderFieldStatic label="Loading" />;
}
