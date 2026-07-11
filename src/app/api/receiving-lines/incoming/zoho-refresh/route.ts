// Legacy alias: kept so old deep links / cached clients keep working.
// The handler lives at /api/receiving-lines/incoming/inventory-refresh —
// remove this file after clients migrate (see
// docs/integrations/capability-relabel-program.md, B3).
export { POST } from '../inventory-refresh/route';
