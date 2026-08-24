import { PublicQrLanding } from '@/app/_label-landing/public-qr-landing';

/**
 * `/qr` — the generic anonymous landing for a scanned Cycle Forge code that
 * carried no resolvable entity (a damaged matrix, a retired handle, a code
 * from another system).
 *
 * It exists so `resolvePublic()` has an honest destination that is still the
 * *tenant's* brand. The alternative it replaced was a 302 to a hardcoded
 * storefront, which on a multi-tenant platform means showing one workspace's
 * customer another workspace's shop.
 *
 * Staff never reach this: every real code resolves to its own landing first.
 *
 * KEPT THROUGH THE WAREHOUSE-OS REBUILD. This is not an operator surface — it
 * is the anon fallback that `PUBLIC_QR_FALLBACK_PATH` (`src/lib/gs1/resolver.ts`)
 * still hardcodes, and `/gs1/resolve` (a keep-listed printed-label resolver)
 * 302s anonymous scanners straight into it. Deleting it turns every scan of a
 * damaged or retired printed code into a 404. Delete only together with
 * `PUBLIC_QR_FALLBACK_PATH`.
 */
export default function GenericQrLandingPage() {
  return <PublicQrLanding scanLabel="Scanned code" />;
}
