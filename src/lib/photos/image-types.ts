/** Photo "image types" — the library's primary sidebar organizer. */
import { tenantQuery, withTenantTransaction } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import {
  BUILTIN_IMAGE_TYPES,
  BUILTIN_IMAGE_TYPE_KEYS as BUILTIN_KEYS,
  SYSTEM_IMAGE_TYPE_KEYS,
  slugifyImageType,
  type BuiltInImageType,
  type CustomImageType,
} from './image-type-defs';

// Pure declarations (types, BUILTIN_IMAGE_TYPES, slugifyImageType) live in ./image-type-defs so client modules can use them without this…
export * from './image-type-defs';

interface ImageTypeDeps {
  tenantQuery: typeof tenantQuery;
  withTenantTransaction: typeof withTenantTransaction;
}

const defaultDeps: ImageTypeDeps = { tenantQuery, withTenantTransaction };

export class ImageTypeConflictError extends Error {}
export class ImageTypeValidationError extends Error {}

interface RawImageTypeRow {
  id: string | number;
  key: string;
  label: string;
  gcs_prefix: string;
  icon: string | null;
  sort_index: number | string;
  is_system: boolean;
}

function mapRow(row: RawImageTypeRow): CustomImageType {
  return {
    kind: 'custom',
    id: Number(row.id),
    key: row.key,
    label: row.label,
    gcsPrefix: row.gcs_prefix,
    icon: row.icon ?? null,
    sortIndex: Number(row.sort_index),
    isSystem: Boolean(row.is_system),
  };
}

/** Custom image types for an org, ordered for stable sidebar rendering. */
export async function listCustomImageTypes(
  orgId: OrgId,
  deps: ImageTypeDeps = defaultDeps,
): Promise<CustomImageType[]> {
  const res = await deps.tenantQuery<RawImageTypeRow>(
    orgId,
    `SELECT id, key, label, gcs_prefix, icon, sort_index, is_system
       FROM photo_image_types
      WHERE organization_id = $1
      ORDER BY sort_index, id`,
    [orgId],
  );
  return res.rows.map(mapRow);
}

/** Built-ins followed by the org's custom types. */
async function listImageTypes(
  orgId: OrgId,
  deps: ImageTypeDeps = defaultDeps,
): Promise<{ builtIn: BuiltInImageType[]; custom: CustomImageType[] }> {
  return { builtIn: BUILTIN_IMAGE_TYPES, custom: await listCustomImageTypes(orgId, deps) };
}

/** Create a custom image type. The key/prefix derive from the label (slug). */
export async function createImageType(
  orgId: OrgId,
  input: { label: string; icon?: string | null },
  deps: ImageTypeDeps = defaultDeps,
): Promise<CustomImageType> {
  const label = input.label.trim();
  if (!label) throw new ImageTypeValidationError('A name is required');
  if (label.length > 60) throw new ImageTypeValidationError('Name is too long');
  const key = slugifyImageType(label);
  if (BUILTIN_KEYS.has(key) || SYSTEM_IMAGE_TYPE_KEYS.has(key)) {
    throw new ImageTypeConflictError(`"${label}" collides with a built-in image type`);
  }

  return deps.withTenantTransaction(orgId, async (client) => {
    const dup = await client.query(
      `SELECT 1 FROM photo_image_types WHERE organization_id = $1 AND lower(key) = $2 LIMIT 1`,
      [orgId, key],
    );
    if (dup.rows.length > 0) {
      throw new ImageTypeConflictError(`An image type "${label}" already exists`);
    }
    const next = await client.query<RawImageTypeRow>(
      `INSERT INTO photo_image_types (organization_id, key, label, gcs_prefix, icon, sort_index, is_system)
       VALUES ($1, $2, $3, $4, $5,
               COALESCE((SELECT MAX(sort_index) + 1 FROM photo_image_types WHERE organization_id = $1), 0),
               FALSE)
       RETURNING id, key, label, gcs_prefix, icon, sort_index, is_system`,
      [orgId, key, label, key, input.icon ?? null],
    );
    return mapRow(next.rows[0]);
  });
}

/**
 * The GCS path prefix for a photo's image type, or `undefined` to fall back to
 * the entity-derived flow. Only CUSTOM types (matched on `photoType` = key)
 * override the path; built-ins keep their existing layout untouched.
 */
export async function resolveGcsPrefix(
  orgId: OrgId,
  photoType: string | null | undefined,
  deps: ImageTypeDeps = defaultDeps,
): Promise<string | undefined> {
  const key = photoType?.trim().toLowerCase();
  if (!key || BUILTIN_KEYS.has(key)) return undefined;
  const res = await deps.tenantQuery<{ gcs_prefix: string }>(
    orgId,
    `SELECT gcs_prefix FROM photo_image_types WHERE organization_id = $1 AND lower(key) = $2 LIMIT 1`,
    [orgId, key],
  );
  return res.rows[0]?.gcs_prefix ?? undefined;
}
