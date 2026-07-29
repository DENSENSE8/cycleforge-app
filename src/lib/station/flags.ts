/**
 * Station-table rollout flags (station-table-unification-plan §10). Client-read
 * `NEXT_PUBLIC_*` gates, default OFF, so a new station surface can ship dark and
 * light up per staged bake-in.
 *
 * `STATION_VIRTUAL_LIST` retired 2026-07-28 — the unified `StationListTable` /
 * `LedgerGrid` path is now the ONLY path for Tech + Packer history, and the
 * legacy `StationWeekTable` is deleted.
 */
export const STATION_PIPELINE_BOARDS = process.env.NEXT_PUBLIC_STATION_PIPELINE_BOARDS === '1';
