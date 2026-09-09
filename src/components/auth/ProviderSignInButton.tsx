'use client';

/**
 * Federated identity buttons — Google, Apple, and Microsoft.
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

import { RotateCcw } from 'lucide-react';
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

/** Apple's monochrome mark, kept black/white on its required brand chrome. */
function AppleMark() {
  return (
    <svg className="h-[18px] w-[18px] shrink-0" viewBox="0 0 24 24" aria-hidden focusable="false">
      <path fill="currentColor" d="M17.05 12.54c-.02-2.03 1.66-3.01 1.74-3.06a3.74 3.74 0 0 0-2.95-1.6c-1.24-.13-2.44.74-3.07.74-.64 0-1.62-.72-2.66-.7a3.93 3.93 0 0 0-3.3 2.01c-1.42 2.46-.36 6.08 1 8.07.67.97 1.46 2.05 2.5 2.01 1.01-.04 1.39-.65 2.61-.65 1.22 0 1.56.65 2.62.63 1.09-.02 1.77-.98 2.43-1.95a8 8 0 0 0 1.11-2.26 3.5 3.5 0 0 1-2.03-3.24Zm-2.02-5.98a3.56 3.56 0 0 0 .81-2.55 3.62 3.62 0 0 0-2.34 1.21 3.4 3.4 0 0 0-.83 2.46 2.99 2.99 0 0 0 2.36-1.12Z" />
    </svg>
  );
}

const PROVIDER_LABEL: Record<PlatformProvider, string> = {
  google: 'Continue with Google',
  apple: 'Continue with Apple',
  microsoft: 'Sign in with Microsoft',
};

const PROVIDER_MARK: Record<PlatformProvider, () => React.JSX.Element> = {
  google: GoogleMark,
  apple: AppleMark,
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
  // ds-allow-hex: Apple brand spec — monochrome black mark and text.
  apple: 'bg-[#000000] border-[#000000] text-[#FFFFFF] hover:bg-[#1D1D1F]',
  // ds-allow-hex: Microsoft brand spec — light theme fill/border/text.
  microsoft: 'bg-[#FFFFFF] border-[#8C8C8C] text-[#5E5E5E] hover:bg-[#F8F8F8]',
};

interface ProviderSignInButtonProps {
  provider: PlatformProvider;
  onClick: () => void;
  disabled?: boolean;
  /** Renders the quiet "last used" recency marker for the returning user. */
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
        'relative flex h-10 w-full items-center rounded-lg border',
        // Google's web spec fixes these at 12 / 10 / 12px. They must NOT ride the
        // density scale — brand geometry stays constant across ops densities.
        'gap-2.5 pl-3 pr-3', // ds-allow-spacing: third-party brand geometry
        // House sans (Geist) by operator call 2026-09-07 — the provider buttons
        // used to hard-code Roboto per Google's brand spec, which left the two
        // biggest buttons on the card in a third typeface. Provider GLYPHS stay
        // brand-accurate; the label rides the app face.
        'font-[var(--ds-font-sans)] text-sm font-medium leading-5',
        'transition-colors disabled:cursor-not-allowed disabled:opacity-60',
        focusRing('control'),
        PROVIDER_CHROME[provider],
        // The recency glyph is absolutely positioned, so the label needs the
        // gutter reserved or a long localized label would run under it.
        lastUsed && 'pr-9', // ds-allow-spacing: paired with the absolute marker
      )}
    >
      <Mark />
      <span className="truncate">{PROVIDER_LABEL[provider]}</span>
      {lastUsed && <LastUsedMarker />}
    </button>
  );
}

/**
 * Quiet trailing recency marker: a counter-clockwise circle arrow, the
 * universal "recent" glyph. It replaced a "Last used" text chip (2026-09-07,
 * operator call) — the words were three times the width of the signal they
 * carried and forced the button label off centre on the house buttons.
 *
 * Absolutely positioned, so it costs the label no width and never shifts a
 * centred label: the parent MUST be `relative` (ProviderSignInButton is; the
 * house `Button` usages on the sign-in card pass `relative`). House-tokened,
 * not brand-colored — it is our annotation, not part of the provider's button.
 *
 * `aria-hidden` on the glyph + an `sr-only` phrase: a screen reader gets
 * "Last used" as words, sighted operators get the icon.
 */
export function LastUsedMarker() {
  return (
    <span className="pointer-events-none absolute right-3 top-1/2 flex -translate-y-1/2 items-center text-text-faint">
      <RotateCcw className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
      <span className="sr-only">Last used</span>
    </span>
  );
}
