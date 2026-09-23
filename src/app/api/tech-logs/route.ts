/**
 * Legacy GET /api/tech-logs — thin wrapper around GET /api/tech/logs.
 * The re-export preserves the underlying `tech.view` permission wrapper.
 */
export { GET } from '@/app/api/tech/logs/route';
