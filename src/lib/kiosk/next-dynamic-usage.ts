/**
 * Next's "you read a request-scoped value during a static prerender" signal.
 *
 * This MUST escape any catch. Measured 2026-09-15 on the `/kiosk/v2` catalog
 * seed: swallowing it made the BUILD conclude the route was static, so
 * `next start` served a prerendered HTML with `seed: null` forever and the
 * whole seed was dead in production while every local check passed. A blanket
 * catch around a framework control-flow throw is how a route silently loses
 * its dynamism — the same shape as the `/m/scan` and `/shipping/orders`
 * warnings already in the build log.
 *
 * Routes also declare `dynamic = 'force-dynamic'`; this is the belt to that
 * suspenders, because a future caller may not.
 *
 * Its own module because it is a Next REQUEST-LIFECYCLE concern, not a catalog
 * one: it lived in `seed-catalog.ts` while that file was its only user, and
 * `counter-boot.server.ts` needing the same guard is what showed the address
 * was wrong. Any `server-only` helper that reads `cookies()`/`headers()` behind
 * a never-throw contract needs it.
 *
 * Callers: `seed-catalog.ts`, `counter-boot.server.ts`, and the shell paint
 * seeds in `src/lib/queries/*-seed.server.ts`.
 * Affected API: none. Schemas: none.
 */

export function isNextDynamicUsage(error: unknown): boolean {
  const digest = (error as { digest?: unknown } | null)?.digest;
  return typeof digest === 'string' && digest.startsWith('DYNAMIC_SERVER_USAGE');
}
