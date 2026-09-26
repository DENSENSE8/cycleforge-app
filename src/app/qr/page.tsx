import { PublicQrLanding } from '@/components/qr/public-qr-landing';

/** `/qr` — the generic anonymous landing for a scanned Cycle Forge code that carried no resolvable entity (a damaged matrix, a retired… */
export default function GenericQrLandingPage() {
  return <PublicQrLanding scanLabel="Scanned code" />;
}
