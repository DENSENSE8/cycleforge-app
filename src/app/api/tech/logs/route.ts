/**
 * GET /api/tech/logs — handler lives in `@/lib/tech/tech-logs-get` so the
 * legacy `/api/tech-logs` alias can share it without a route-to-route import
 * (Turbopack rejects those on Vercel).
 */
export { GET } from '@/lib/tech/tech-logs-get';
