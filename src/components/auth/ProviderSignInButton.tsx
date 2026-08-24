'use client';

/**
 * Federated identity buttons — Google and Microsoft.
 *
 * These are the ONE place in the app where foreign brand colors are correct.
 * Both providers require their own mark and chrome as a condition of using their
 * identity platform, so these buttons deliberately do NOT theme with the house
 * tokens. Everything else on /signin does.
 *
 * Google — https://developers.google.com/identity/branding-guidelines
 *   · Approved text: "Sign in with Google" / "Sign up with Google" /
 *     "Continue with Google" (localization encouraged).
 *   · The 4-color "super G" must be the standard color version on a white
 *     background, never recolored, redrawn, or rescaled out of proportion.
 *   · Light theme: fill #FFFFFF · 1px inside stroke #747775 · text #1F1F1F.
 *     (Neutral: #F2F2F2, no stroke. Dark: #131314 / #8E918F / #E3E3E3.)
 *   · Web padding: 12px → logo → 10px → label → 12px.
 *   · Must be at least as prominent as other third-party sign-in options —
 *     hence Microsoft renders at the identical height and weight below.
 *   · Font is specified as Google Sans Medium 14/20. Google Sans is not publicly
 *     licensed as a webfont, so we fall back to Roboto Medium (Google's own
 *     documented substitute in the older revision of this spec). This is the one
 *     item in the spec we knowingly approximate.
 *
 * Microsoft — https://learn.microsoft.com/en-us/entra/identity-platform/howto-add-branding-in-apps
 *   · Text "Sign in with Microsoft"; 21×21 four-square mark, unmodified.
 *   · Light theme: fill #FFFFFF · 1px #8C8C8C border · text #5E5E5E.
 *
 * `ds-allow-hex` markers below are the documented escape in
 * color-tokens.guard.test.ts — brand chrome owned by a third party, not ours.
 */

import type { PlatformProvider } from '@/lib/auth/platform-oauth-types';
import { cn } from '@/utils/_cn';
import { focusRing } from '@/design-system/tokens/focus-ring';

/** Google's standard 4-color "super G". Never recolor or redraw these paths. */
function GoogleMark() {
  return (
    <svg className="h-[18px] w-[18px] shrink-0" viewBox="0 0 48 48" aria-hidden focusable="false">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

/** Microsoft's four-square mark. */
function MicrosoftMark() {
  return (
    <svg className="h-[18px] w-[18px] shrink-0" viewBox="0 0 21 21" aria-hidden focusable="false">
      <path fill="#F25022" d="M1 1h9v9H1z" />
      <path fill="#7FBA00" d="M11 1h9v9h-9z" />
      <path fill="#00A4EF" d="M1 11h9v9H1z" />
      <path fill="#FFB900" d="M11 11h9v9h-9z" />
    </svg>
  );
}

const PROVIDER_LABEL: Record<PlatformProvider, string> = {
  google: 'Continue with Google',
  microsoft: 'Sign in with Microsoft',
};

const PROVIDER_MARK: Record<PlatformProvider, () => React.JSX.Element> = {
  google: GoogleMark,
  microsoft: MicrosoftMark,
};

/**
 * Per-provider chrome. Both land on a white fill at 40px so neither reads as
 * more prominent than the other (Google's prominence rule).
 *
 * Padding follows Google's web spec — 12px lead, 10px gap, 12px trail — applied
 * to both so the marks and labels align across a stacked pair.
 */
const PROVIDER_CHROME: Record<PlatformProvider, string> = {
  // ds-allow-hex: Google brand spec — light theme fill/stroke/text.
  google: 'bg-[#FFFFFF] border-[#747775] text-[#1F1F1F] hover:bg-[#F8F9FA]',
  // ds-allow-hex: Microsoft brand spec — light theme fill/border/text.
  microsoft: 'bg-[#FFFFFF] border-[#8C8C8C] text-[#5E5E5E] hover:bg-[#F8F8F8]',
};

interface ProviderSignInButtonProps {
  provider: PlatformProvider;
  onClick: () => void;
  disabled?: boolean;
  /** Renders the quiet "Last used" marker for the returning-user hint. */
  lastUsed?: boolean;
}

export function ProviderSignInButton({
  provider,
  onClick,
  disabled,
  lastUsed,
}: ProviderSignInButtonProps) {
  const Mark = PROVIDER_MARK[provider];

  return (
    // ds-raw-button: third-party brand chrome — must not inherit house Button styling.
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex h-10 w-full items-center rounded-lg border',
        // Google's web spec fixes these at 12 / 10 / 12px. They must NOT ride the
        // density scale — brand geometry stays constant across ops densities.
        'gap-[10px] pl-[12px] pr-[12px]', // ds-allow-spacing: third-party brand geometry
        // Google Sans Medium 14/20 — Roboto is the documented public substitute.
        "font-['Roboto',var(--ds-font-sans),system-ui,sans-serif] text-sm font-medium leading-5",
        'transition-colors disabled:cursor-not-allowed disabled:opacity-60',
        focusRing('control'),
        PROVIDER_CHROME[provider],
      )}
    >
      <Mark />
      <span className="truncate">{PROVIDER_LABEL[provider]}</span>
      {lastUsed && <LastUsedMarker />}
    </button>
  );
}

/**
 * Quiet trailing "Last used" hint. Deliberately house-tokened, not brand-colored
 * — it is our annotation, not part of the provider's button.
 */
export function LastUsedMarker() {
  return (
    <span className="ml-auto shrink-0 rounded bg-surface-canvas px-1.5 py-0.5 text-role-micro font-semibold uppercase tracking-widest text-text-soft">
      Last used
    </span>
  );
}
