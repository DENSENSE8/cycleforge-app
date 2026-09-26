/** Route-level loading shell for `/signin` — the STATIC house loading field. */

import { LoaderFieldStatic } from '@/design-system/components/LoaderFieldStatic';

export default function Loading() {
  return <LoaderFieldStatic label="Loading sign-in" />;
}
