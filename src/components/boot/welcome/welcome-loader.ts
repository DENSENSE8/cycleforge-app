import {
  WELCOME_VARIANT_STORAGE_KEY,
  resolveWelcomeVariant,
} from './welcome-variant';

/** Bound optional chunk warm-up so redirect responsiveness still wins on a cold network. */
const PRELOAD_BUDGET_MS = 200;

export const loadWelcomeAssembly = () => import('@/components/boot/WelcomeAssembly');
export const loadWelcomeSimple = () => import('@/components/boot/WelcomeSimple');

/** Warm only the selected post-sign-in variant while the static bridge is already visible. */
export async function preloadSelectedWelcomeVariant(): Promise<void> {
  if (typeof window === 'undefined') return;
  const { variant } = resolveWelcomeVariant(
    window.location.search,
    window.localStorage.getItem(WELCOME_VARIANT_STORAGE_KEY),
    process.env.NODE_ENV !== 'production',
  );
  const load = variant === 'complex' ? loadWelcomeAssembly() : loadWelcomeSimple();
  await Promise.race([
    load.then(() => undefined).catch(() => undefined),
    new Promise<void>((resolve) => window.setTimeout(resolve, PRELOAD_BUDGET_MS)),
  ]);
}
