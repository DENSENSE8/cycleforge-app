/**
 * Identification job registry — house jobs plus P3 published tenant methods.
 * Runtime classify never calls an LLM; it only resolves a published record.
 */

import type { IdentificationEntityKind, IdentificationResult, JobFaceMutate } from './types';
import type { HouseIdentificationJob } from './types';
import { IDENTIFICATION_JOB_ID_RE } from '@/lib/schemas/identification-grammar';

export type IdentificationJobOrigin = 'house' | 'tenant';

export interface IdentificationJobRecord {
  id: string;
  origin: IdentificationJobOrigin;
  entityKind: IdentificationEntityKind;
  mutate: JobFaceMutate;
  claimPath: (entityId: string) => string;
  sessionPath: (entityId: string) => string;
}

const HOUSE_JOBS: readonly IdentificationJobRecord[] = [
  {
    id: 'scan_out',
    origin: 'house',
    entityKind: 'order',
    mutate: 'SHIP_CONFIRM',
    claimPath: (entityId) => `/m/id/scan-out/${encodeURIComponent(entityId)}`,
    sessionPath: (entityId) => `/m/id/scan-out/${encodeURIComponent(entityId)}`,
  },
  {
    id: 'pick',
    origin: 'house',
    entityKind: 'order',
    mutate: 'PICK_CONFIRM',
    claimPath: (entityId) => `/m/id/pick/${encodeURIComponent(entityId)}`,
    sessionPath: (entityId) => `/m/pick/${encodeURIComponent(entityId)}`,
  },
];

const HOUSE_BY_ID = new Map<string, IdentificationJobRecord>(HOUSE_JOBS.map((j) => [j.id, j]));

/** In-process Studio publish (tests + same-isolate publish). Org loaders pass `published`. */
const tenantById = new Map<string, IdentificationJobRecord>();

export function resetTenantIdentificationJobsForTests(): void {
  tenantById.clear();
}

export function publishTenantIdentificationJob(record: IdentificationJobRecord): void {
  if (record.origin !== 'tenant') {
    throw new Error('only tenant records can be published into the overlay');
  }
  if (HOUSE_BY_ID.has(record.id)) {
    throw new Error(`cannot overlay house job ${record.id}`);
  }
  if (!IDENTIFICATION_JOB_ID_RE.test(record.id)) {
    throw new Error(`invalid tenant job id ${record.id}`);
  }
  tenantById.set(record.id, record);
}

export function listIdentificationJobs(
  published?: readonly IdentificationJobRecord[] | null,
): IdentificationJobRecord[] {
  const extra = published ?? [...tenantById.values()];
  const seen = new Set(HOUSE_JOBS.map((j) => j.id));
  const out = [...HOUSE_JOBS];
  for (const row of extra) {
    if (seen.has(row.id) || HOUSE_BY_ID.has(row.id)) continue;
    seen.add(row.id);
    out.push(row);
  }
  return out;
}

export function getIdentificationJob(
  id: string,
  published?: readonly IdentificationJobRecord[] | null,
): IdentificationJobRecord | null {
  const house = HOUSE_BY_ID.get(id);
  if (house) return house;
  if (published) {
    return published.find((j) => j.id === id) ?? null;
  }
  return tenantById.get(id) ?? null;
}

export function isIdentificationJob(id: string): id is HouseIdentificationJob {
  return HOUSE_BY_ID.has(id);
}

export function fillIdentificationPath(template: string, entityId: string): string {
  const id = String(entityId ?? '').trim();
  return String(template ?? '')
    .replaceAll('{entityId}', encodeURIComponent(id))
    .replaceAll('{id}', encodeURIComponent(id));
}

export function identificationFromPublishedClaim(args: {
  organizationId: string;
  clientEventId: string;
  record: IdentificationJobRecord;
  entityId: string;
}): IdentificationResult {
  const organizationId = String(args.organizationId ?? '').trim();
  const clientEventId = String(args.clientEventId ?? '').trim();
  if (!organizationId) throw new Error('organizationId required');
  if (!clientEventId) throw new Error('clientEventId required');
  const entityId = String(args.entityId ?? '').trim();
  return {
    organizationId,
    clientEventId,
    job: args.record.id,
    source: 'claim',
    entity: { kind: args.record.entityKind, id: entityId },
    face: {
      state: entityId ? 'ready' : 'miss',
      title: entityId ? args.record.id : 'No method found',
      message: null,
      mutate: entityId ? args.record.mutate : null,
    },
  };
}
