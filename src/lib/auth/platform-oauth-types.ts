/**
 * Platform social-login *types* — dependency-free so client components (the
 * /signin provider buttons) can name a provider without pulling `node:crypto`
 * and the rest of the OAuth engine into the browser bundle.
 *
 * `platform-oauth.ts` re-exports these, so existing server import paths are
 * unchanged. → bundle altitude.
 */

export type PlatformProvider = 'google' | 'apple' | 'microsoft';
