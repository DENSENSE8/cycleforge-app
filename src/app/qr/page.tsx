import { PublicQrLanding } from '@/components/qr/public-qr-landing';

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
 */
export default function GenericQrLandingPage() {
  return <PublicQrLanding scanLabel="Scanned code" />;
}
