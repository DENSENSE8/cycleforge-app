import { focusRing } from '@/design-system/tokens/focus-ring';
import { Panel } from '@/design-system/primitives';


interface PublicQrInterstitialProps {
  /** Org display name (brand.name or organization name). */
  brandName: string;
  logoUrl?: string | null;
  /** What was scanned — e.g. "Receiving carton". */
  scanLabel: string;
  /** Customer website from org settings; empty ⇒ no CTA. */
  publicLandingUrl: string;
}

/**
 * Anon landing for platform Digital Links. Shows tenant brand + destination
 * link and a button to leave Cycle Forge for the customer's website.
 * Staff sessions never reach this component (ops page renders instead).
 */
export function PublicQrInterstitial({
  brandName,
  logoUrl,
  scanLabel,
  publicLandingUrl,
}: PublicQrInterstitialProps) {
  const hasWebsite = Boolean(publicLandingUrl);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-surface-canvas px-6 py-10">
      <Panel radius="2xl" padding="lg" className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-3 text-center">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- tenant-uploaded arbitrary URL
            <img
              src={logoUrl}
              alt=""
              className="h-14 w-14 rounded-xl object-contain"
            />
          ) : (
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-surface-inverse text-lg font-semibold text-white">
              {(brandName || '?').slice(0, 2).toUpperCase()}
            </div>
          )}
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-soft">
              {scanLabel}
            </p>
            <h1 className="mt-1 text-lg font-semibold text-text-default">{brandName}</h1>
          </div>
        </div>

        {hasWebsite ? (
          <div className="space-y-3">
            <p className="text-center text-sm text-text-muted">
              Continue to this workspace&rsquo;s website:
            </p>
            <a
              href={publicLandingUrl}
              className={`block break-all text-center text-sm font-medium text-blue-600 underline-offset-2 hover:underline ${focusRing('control', 'neutral')}`}
            >
              {publicLandingUrl}
            </a>
            <a
              href={publicLandingUrl}
              className={`inline-flex h-12 w-full items-center justify-center rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white shadow-sm shadow-blue-600/25 hover:bg-blue-500 ${focusRing('control', 'neutral')}`}
            >
              Continue to website
            </a>
          </div>
        ) : (
          <p className="text-center text-sm text-text-soft">
            Website not configured for this workspace.
          </p>
        )}

        <p className="text-center text-role-eyebrow uppercase tracking-wide text-text-faint">
          Powered by Cycle Forge
        </p>
      </Panel>
    </div>
  );
}
