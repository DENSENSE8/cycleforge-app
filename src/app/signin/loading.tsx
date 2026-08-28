/**
 * Route-level loading shell for `/signin` — the STATIC house loading field.
 *
 * Zero JS on purpose: this is a public, budgeted, mobile-profiled route, and
 * the live canvas field costs main-thread time exactly when the page is
 * hydrating. Same lattice, no loop. SoT: {@link LoaderFieldStatic}.
 */

import { LoaderFieldStatic } from '@/design-system/components/LoaderFieldStatic';

export default function Loading() {
  return <LoaderFieldStatic label="Loading sign-in" />;
}
