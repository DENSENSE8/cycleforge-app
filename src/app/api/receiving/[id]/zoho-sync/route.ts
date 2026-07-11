// Legacy alias: kept so old deep links / cached clients keep working.
// The handler lives at /api/receiving/[id]/inventory-sync — remove this file
// after clients migrate (see docs/integrations/capability-relabel-program.md, B3).
export { POST } from '../inventory-sync/route';
