import { headers } from 'next/headers';
import { getOrganizationBySlug } from '@/lib/tenancy/organizations';
import { getPublicLandingUrl } from '@/lib/tenancy/settings';
import { focusRing } from '@/lib/design/focus-ring';

/**
 * The one anonymous landing for every platform-minted Digital Link.
 *
 * A printed sticker has exactly two audiences and they scan the *same* URL:
 * a staff wedge (which ignores the host and routes internally) and a customer's
 * phone. This resolves the second one — tenant brand + the workspace's own
 * configured website — so no printed code ever hard-redirects a consumer to a
 * hardcoded storefront that belongs to one tenant.
 *
 * Tenant comes from the slug host (`x-tenant-slug`, set by the proxy). Fail
 * closed: an unknown or absent slug still renders the shell, unbranded and
 * with no CTA, rather than leaking a default tenant's website.
 *
 * ── Why this lives under `src/app/` and not `src/components/` ──────────────
 * The `/01`, `/414`, `/l`, `/p`, `/s`, `/q` trees are GS1 Digital Link and
 * short-URL landings PRINTED ONTO STICKERS on boxes physically in the
 * warehouse. They must resolve for as long as those boxes exist. During the
 * Warehouse-OS rebuild the entire `src/components/**` and `src/design-system/**`
 * trees are being deleted, so this landing was inlined here (from
 * `components/qr/public-qr-landing.tsx` + `components/qr/PublicQrInterstitial.tsx`)
 * to sever every dependency on a tree that is going away. It imports only
 * `src/lib/**`, which is kept. Do not re-point it at a component tree.
 *
 * `_label-landing` is a Next.js private folder (leading underscore) — it is
 * opted out of routing and can never become a page.
 */
async function resolvePublicQrLanding(args: {
  /** What was scanned — e.g. "Receiving carton", "Product". */
  scanLabel: string;
  /** Override the header-derived slug (tests / nested routes). */
  slug?: string | null;
}): Promise<{
  brandName: string;
  logoUrl: string | null;
  scanLabel: string;
  publicLandingUrl: string;
}> {
  const fallback = {
    brandName: 'Cycle Forge',
    logoUrl: null,
    scanLabel: args.scanLabel,
    publicLandingUrl: '',
  };

  let slug = (args.slug ?? '').trim().toLowerCase();
  if (!slug) {
    const hdrs = await headers();
    slug = (hdrs.get('x-tenant-slug') || '').trim().toLowerCase();
  }
  if (!slug) return fallback;

  const org = await getOrganizationBySlug(slug);
  if (!org) return fallback;

  return {
    brandName: (org.settings.brand?.name || '').trim() || org.name || slug,
    logoUrl: (org.settings.brand?.logoUrl || '').trim() || null,
    scanLabel: args.scanLabel,
    publicLandingUrl: getPublicLandingUrl(org.settings),
  };
}

/**
 * Anon landing for platform Digital Links. Shows tenant brand + destination
 * link and a button to leave Cycle Forge for the customer's website.
 * Staff sessions never reach this component (ops page renders instead).
 */
export async function PublicQrLanding({
  scanLabel,
  slug,
}: {
  scanLabel: string;
  slug?: string | null;
}) {
  const { brandName, logoUrl, publicLandingUrl, scanLabel: label } =
    await resolvePublicQrLanding({ scanLabel, slug });
  const hasWebsite = Boolean(publicLandingUrl);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-surface-canvas px-6 py-10">
      {/* Was <Panel radius="2xl" padding="lg">; inlined to its resolved classes. */}
      <div className="w-full max-w-sm space-y-6 rounded-2xl border border-border-soft bg-surface-card p-6 text-text-default shadow-sm">
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
              {label}
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
      </div>
    </div>
  );
}
