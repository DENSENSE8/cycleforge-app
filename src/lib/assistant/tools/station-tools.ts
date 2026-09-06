/**
 * Station catalog read-tool — the parts list the assistant composes a station
 * from, so a proposed composition names REAL registry ids instead of invented
 * ones (`validateStationConfig` refuses anything else, and a model that never
 * saw the catalog fails that gate every time).
 *
 * Returns the serializable registry metadata the Studio palette already uses
 * (`listBlockMeta` / `listDataSourceMeta` / `listActionMeta` — no functions),
 * plus per-source compatible action ids, the slot ids, the field kinds, and
 * the surface → (pageKey, modeKey) map so the model knows WHERE a composition
 * mounts. No SQL: the catalog is code, so this tool is skipped by the
 * org-threading sweep and gated on the same floor as GET /api/stations.
 */

import { z } from 'zod';
import {
  FIELD_KINDS,
  SLOT_IDS,
  actionsForSource,
  listActionMeta,
  listBlockMeta,
  listDataSourceMeta,
  listDataSources,
  registerStationBuiltins,
} from '@/lib/stations';
import { SURFACE_KEYS, getSurface } from '@/lib/stations/surface-keys';
import type { AssistantToolDef } from './types';

export const getStationCatalogTool: AssistantToolDef<z.ZodObject<Record<string, never>>> = {
  name: 'get_station_catalog',
  description:
    'The parts a station composition may use: registered blocks (with the slots each may occupy, the roles it binds, and its display knobs), data sources (with their row shape and which actions are compatible), actions (with the field kinds they apply to and the permission they need), the five slot ids, the field kinds, and every surface with the pageKey/modeKey a composition mounts on. Call this BEFORE proposing a station_definition.save_draft — the save is refused if any block, source, or action id is not in this catalog.',
  permission: 'dashboard.view',
  inputSchema: z.object({}),
  run: async () => {
    registerStationBuiltins();
    const compatibleBySource = new Map(
      listDataSources().map((s) => [s.id, actionsForSource(s).map((a) => a.id)]),
    );
    return {
      slots: [...SLOT_IDS],
      fieldKinds: [...FIELD_KINDS],
      configShape:
        'StationConfig = { slots: { <slotId>: BlockInstanceConfig[] } }; BlockInstanceConfig = { id: string (stable, e.g. "blk_a1"), block: <block.type>, source?: { id: <source.id>, filters?: {...}, fields?: { <role.key>: <source field key> } }, display?: { <configSchema.key>: value }, actions?: <action.id>[], done_when?: <one of actions> }',
      blocks: listBlockMeta(),
      sources: listDataSourceMeta().map((s) => ({
        ...s,
        compatibleActions: compatibleBySource.get(s.id) ?? [],
      })),
      actions: listActionMeta(),
      surfaces: SURFACE_KEYS.map((key) => {
        const s = getSurface(key);
        return { key, label: s.label, pageKey: s.pageKey, modeKey: s.modeKey, archetype: s.archetype };
      }),
    };
  },
};
