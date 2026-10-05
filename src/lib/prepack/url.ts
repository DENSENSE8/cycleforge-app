/** Parse the prepack query contract (`prepackHref` in the route tree writes it). */

import type { PrepackRouteState, PrepackStepId } from '@/lib/nav/route-tree';
import { parsePrepackCondition, parsePrepackProvenance } from './types';

const STEP_IDS: readonly PrepackStepId[] = ['product', 'unit', 'facts', 'evidence', 'contents', 'label'];

type QuerySource = URLSearchParams | Record<string, string | string[] | undefined>;

function read(source: QuerySource, key: string): string {
  if (source instanceof URLSearchParams) return source.get(key)?.trim() ?? '';
  const value = source[key];
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? '';
}

function readAll(source: QuerySource, key: string): string[] {
  const values = source instanceof URLSearchParams ? source.getAll(key) : [source[key] ?? []].flat();
  return values.map((value) => value.trim()).filter(Boolean);
}

export function parsePrepackRouteState(source: QuerySource): PrepackRouteState {
  const mode = read(source, 'mode');
  const step = read(source, 'step');
  const catalogId = Number(read(source, 'catalogId'));
  return {
    mode: mode === 'single' || mode === 'bulk' ? mode : null,
    step: (STEP_IDS as readonly string[]).includes(step) ? (step as PrepackStepId) : null,
    units: readAll(source, 'unit'),
    catalogId: Number.isInteger(catalogId) && catalogId > 0 ? catalogId : null,
    condition: parsePrepackCondition(read(source, 'condition')),
    provenance: parsePrepackProvenance(read(source, 'provenance')),
    serialRequestId: read(source, 'serialRequestId') || null,
  };
}
