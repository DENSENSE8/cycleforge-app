import { withTenantTransaction } from '@/lib/tenancy/db';
import { resolvePoRef } from './resolve-po-ref';
import { remapReceivingPhotoTypeOnMove } from '@/lib/receiving/photo-intent';
import type { PhotoEntityType } from './types';

/** The minimum a caller's transaction client must provide. */
export interface ReassignClient {
  query<R extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: R[]; rowCount: number | null }>;
}

export class PhotoReassignError extends Error {
  readonly status: 400 | 404 | 409;

  constructor(message: string, status: 400 | 404 | 409) {
    super(message);
    this.name = 'PhotoReassignError';
    this.status = status;
  }
}

export interface ReassignReceivingPhotoInput {
  organizationId: string;
  photoId: number;
  targetEntityType: 'RECEIVING' | 'RECEIVING_LINE';
  targetEntityId: number;
}

export interface ReassignReceivingPhotoScope {
  entityType: 'RECEIVING' | 'RECEIVING_LINE';
  entityId: number;
  receivingId: number;
  receivingLineId: number | null;
  /** Current photo_type — populated by loadPrimaryLink (drives the stage remap on cross-entity moves). */
  photoType?: string | null;
}

export interface ReassignReceivingPhotoResult {
  photoId: number;
  from: ReassignReceivingPhotoScope;
  to: ReassignReceivingPhotoScope;
  idempotent: boolean;
}

export interface ReassignReceivingPhotoDeps {
  loadPrimaryLink: (
    organizationId: string,
    photoId: number,
  ) => Promise<ReassignReceivingPhotoScope | null>;
  resolveTarget: (
    organizationId: string,
    entityType: 'RECEIVING' | 'RECEIVING_LINE',
    entityId: number,
  ) => Promise<ReassignReceivingPhotoScope | null>;
  updateAssignment: (input: {
    organizationId: string;
    photoId: number;
    targetEntityType: 'RECEIVING' | 'RECEIVING_LINE';
    targetEntityId: number;
    poRef: string | null;
    /** New photo_type for the destination stage, or null to keep the current stamp. */
    photoType: string | null;
  }) => Promise<void>;
  /** Resolve denorm po_ref for the target entity (DB-backed in production). */
  resolvePoRef: (
    entityType: PhotoEntityType,
    entityId: number,
  ) => Promise<string | null>;
}

async function loadPrimaryLinkOn(
  client: ReassignClient,
  organizationId: string,
  photoId: number,
): Promise<ReassignReceivingPhotoScope | null> {
  {
    const res = await client.query<{
      entity_type: string;
      entity_id: string;
      photo_type: string | null;
      receiving_id_resolved: string | null;
    }>(
      `SELECT
         l.entity_type,
         l.entity_id,
         p.photo_type,
         CASE
           WHEN l.entity_type = 'RECEIVING' THEN l.entity_id
           WHEN l.entity_type = 'RECEIVING_LINE' THEN rl.receiving_id
           ELSE NULL
         END AS receiving_id_resolved
         FROM photos p
         JOIN photo_entity_links l
           ON l.photo_id = p.id
          AND l.organization_id = p.organization_id
          AND l.link_role = 'primary'
         LEFT JOIN receiving_line rl
           ON l.entity_type = 'RECEIVING_LINE' AND rl.id = l.entity_id
        WHERE p.id = $1
          AND p.organization_id = $2
          AND l.entity_type IN ('RECEIVING', 'RECEIVING_LINE')`,
      [photoId, organizationId],
    );
    const row = res.rows[0];
    if (!row) return null;
    const entityType = row.entity_type as 'RECEIVING' | 'RECEIVING_LINE';
    const entityId = Number(row.entity_id);
    const receivingId =
      row.receiving_id_resolved != null ? Number(row.receiving_id_resolved) : null;
    if (receivingId == null || !Number.isFinite(receivingId)) return null;
    return {
      entityType,
      entityId,
      receivingId,
      receivingLineId: entityType === 'RECEIVING_LINE' ? entityId : null,
      photoType: row.photo_type,
    };
  }
}

async function loadPrimaryLinkImpl(
  organizationId: string,
  photoId: number,
): Promise<ReassignReceivingPhotoScope | null> {
  return withTenantTransaction(organizationId, (client) =>
    loadPrimaryLinkOn(client, organizationId, photoId),
  );
}

async function resolveTargetOn(
  client: ReassignClient,
  organizationId: string,
  entityType: 'RECEIVING' | 'RECEIVING_LINE',
  entityId: number,
): Promise<ReassignReceivingPhotoScope | null> {
  {
    if (entityType === 'RECEIVING') {
      const res = await client.query<{ id: string }>(
        `SELECT id FROM receiving_carton WHERE id = $1 AND organization_id = $2 LIMIT 1`,
        [entityId, organizationId],
      );
      if (res.rowCount === 0) return null;
      return {
        entityType: 'RECEIVING',
        entityId,
        receivingId: entityId,
        receivingLineId: null,
      };
    }

    const res = await client.query<{ id: string; receiving_id: string }>(
      `SELECT id, receiving_id
         FROM receiving_line
        WHERE id = $1 AND organization_id = $2
        LIMIT 1`,
      [entityId, organizationId],
    );
    const row = res.rows[0];
    if (!row) return null;
    const receivingId = Number(row.receiving_id);
    if (!Number.isFinite(receivingId) || receivingId <= 0) return null;
    return {
      entityType: 'RECEIVING_LINE',
      entityId,
      receivingId,
      receivingLineId: entityId,
    };
  }
}

async function resolveTargetImpl(
  organizationId: string,
  entityType: 'RECEIVING' | 'RECEIVING_LINE',
  entityId: number,
): Promise<ReassignReceivingPhotoScope | null> {
  return withTenantTransaction(organizationId, (client) =>
    resolveTargetOn(client, organizationId, entityType, entityId),
  );
}

async function updateAssignmentImpl(input: {
  organizationId: string;
  photoId: number;
  targetEntityType: PhotoEntityType;
  targetEntityId: number;
  poRef: string | null;
  photoType: string | null;
}): Promise<void> {
  await withTenantTransaction(input.organizationId, (client) =>
    updateAssignmentOn(client, input),
  );
}

async function updateAssignmentOn(
  client: ReassignClient,
  input: {
    organizationId: string;
    photoId: number;
    targetEntityType: PhotoEntityType;
    targetEntityId: number;
    poRef: string | null;
    photoType: string | null;
  },
): Promise<void> {
  {
    const updated = await client.query(
      `UPDATE photo_entity_links
          SET entity_type = $3,
              entity_id = $4
        WHERE photo_id = $1
          AND organization_id = $2
          AND link_role = 'primary'`,
      [
        input.photoId,
        input.organizationId,
        input.targetEntityType,
        input.targetEntityId,
      ],
    );
    if (updated.rowCount === 0) {
      throw new PhotoReassignError('Primary photo link not found', 404);
    }
    // photoType null = keep the current stamp (COALESCE); the remap only ever
    // sets concrete stage types, never clears one.
    await client.query(
      `UPDATE photos
          SET po_ref = $3,
              photo_type = COALESCE($4, photo_type),
              updated_at = NOW()
        WHERE id = $1 AND organization_id = $2`,
      [input.photoId, input.organizationId, input.poRef, input.photoType],
    );
  }
}

const defaultDeps: ReassignReceivingPhotoDeps = {
  loadPrimaryLink: loadPrimaryLinkImpl,
  resolveTarget: resolveTargetImpl,
  updateAssignment: updateAssignmentImpl,
  resolvePoRef,
};

/** Deps bound to a caller-owned transaction client. */
export function makeReassignDepsForClient(client: ReassignClient): ReassignReceivingPhotoDeps {
  return {
    loadPrimaryLink: (organizationId, photoId) =>
      loadPrimaryLinkOn(client, organizationId, photoId),
    resolveTarget: (organizationId, entityType, entityId) =>
      resolveTargetOn(client, organizationId, entityType, entityId),
    updateAssignment: (input) => updateAssignmentOn(client, input),
    resolvePoRef: (entityType, entityId) => resolvePoRef(entityType, entityId, client),
  };
}

function scopesMatch(
  a: ReassignReceivingPhotoScope,
  b: ReassignReceivingPhotoScope,
): boolean {
  return a.entityType === b.entityType && a.entityId === b.entityId;
}

export async function reassignReceivingPhoto(
  input: ReassignReceivingPhotoInput,
  deps: ReassignReceivingPhotoDeps = defaultDeps,
): Promise<ReassignReceivingPhotoResult> {
  const current = await deps.loadPrimaryLink(input.organizationId, input.photoId);
  if (!current) {
    throw new PhotoReassignError('Photo not found or not a receiving photo', 404);
  }

  const target = await deps.resolveTarget(
    input.organizationId,
    input.targetEntityType,
    input.targetEntityId,
  );
  if (!target) {
    throw new PhotoReassignError('Target PO or line not found', 404);
  }

  if (scopesMatch(current, target)) {
    return {
      photoId: input.photoId,
      from: current,
      to: target,
      idempotent: true,
    };
  }

  const poRef = await deps.resolvePoRef(input.targetEntityType, input.targetEntityId);
  // Cross-entity moves remap the stamp to the destination stage (carton→line
  // becomes item evidence; line→carton falls back to package) so a move can
  // never re-create the entity×type mis-stamps the write waist rejects.
  const photoType = remapReceivingPhotoTypeOnMove({
    fromEntityType: current.entityType,
    toEntityType: target.entityType,
    photoType: current.photoType ?? null,
  });
  await deps.updateAssignment({
    organizationId: input.organizationId,
    photoId: input.photoId,
    targetEntityType: input.targetEntityType,
    targetEntityId: input.targetEntityId,
    poRef,
    photoType,
  });

  return {
    photoId: input.photoId,
    from: current,
    to: target,
    idempotent: false,
  };
}
