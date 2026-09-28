export type WelcomeVariant = 'simple' | 'complex' | 'elevation';

export const DEFAULT_WELCOME_VARIANT: WelcomeVariant = 'simple';
export const WELCOME_VARIANT_STORAGE_KEY = 'cf:welcome-variant';
export const WELCOME_VARIANTS: readonly WelcomeVariant[] = ['simple', 'complex', 'elevation'];

export function isWelcomeVariant(value: string | null | undefined): value is WelcomeVariant {
  return value === 'simple' || value === 'complex' || value === 'elevation';
}

export interface WelcomeVariantResolution {
  variant: WelcomeVariant;
  /** Set only when a valid development URL override should replace storage. */
  persist: WelcomeVariant | null;
}

/** Resolve one play: a development URL override, then persisted preference, then the product default. */
export function resolveWelcomeVariant(
  search: string,
  stored: string | null,
  allowUrlOverride: boolean,
): WelcomeVariantResolution {
  if (allowUrlOverride) {
    const requested = new URLSearchParams(search).get('welcomeVariant');
    if (isWelcomeVariant(requested)) return { variant: requested, persist: requested };
  }
  return {
    variant: isWelcomeVariant(stored) ? stored : DEFAULT_WELCOME_VARIANT,
    persist: null,
  };
}
