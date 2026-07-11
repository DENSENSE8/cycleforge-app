// Legacy alias: kept so old deep links / cached clients keep working.
// The handler lives at /api/receiving/lines/[id]/inventory-note — remove this
// file after clients migrate (see docs/integrations/capability-relabel-program.md, B3).
export { PATCH } from '../inventory-note/route';
