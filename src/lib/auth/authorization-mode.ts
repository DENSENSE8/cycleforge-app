/** Runtime authorization policy for explicitly allowlisted dogfood organizations. */

import { ALL_PERMISSIONS, type PermissionString } from './permissions-shared';

export type AuthorizationMode = 'strict' | 'authenticated-only';

export interface AuthorizationModeConfig {
  mode: AuthorizationMode;
  authenticatedOnlyOrgIds: ReadonlySet<string>;
}

export type AuthorizationModeEnv = Record<string, string | undefined>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseAuthorizationModeConfig(
  env: AuthorizationModeEnv,
): AuthorizationModeConfig {
  const rawMode = String(env.AUTHORIZATION_MODE ?? '').trim().toLowerCase();
  const mode: AuthorizationMode = rawMode === '' || rawMode === 'strict'
    ? 'strict'
    : rawMode === 'authenticated-only'
      ? 'authenticated-only'
      : (() => {
          throw new Error(
            `AUTHORIZATION_MODE must be "strict" or "authenticated-only"; received ${JSON.stringify(rawMode)}`,
          );
        })();

  if (mode === 'strict') {
    return { mode, authenticatedOnlyOrgIds: new Set() };
  }

  const orgIds = String(env.AUTHORIZATION_MODE_ORGS ?? '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  if (orgIds.length === 0) {
    throw new Error('AUTHORIZATION_MODE_ORGS must contain at least one organization UUID in authenticated-only mode');
  }
  for (const orgId of orgIds) {
    if (!UUID_RE.test(orgId)) {
      throw new Error(`AUTHORIZATION_MODE_ORGS contains an invalid organization UUID: ${JSON.stringify(orgId)}`);
    }
  }

  return { mode, authenticatedOnlyOrgIds: new Set(orgIds) };
}

const configuredMode = parseAuthorizationModeConfig(process.env);

/** Strict unless authenticated-only is explicitly enabled for this exact organization UUID. */
export function resolveAuthorizationMode(
  organizationId: string,
  config: AuthorizationModeConfig = configuredMode,
): AuthorizationMode {
  if (config.mode !== 'authenticated-only') return 'strict';
  return config.authenticatedOnlyOrgIds.has(organizationId.toLowerCase())
    ? 'authenticated-only'
    : 'strict';
}

/** Apply the dogfood overlay without mutating the stored role-derived set. */
export function effectivePermissionsForAuthorizationMode(
  mode: AuthorizationMode,
  storedPermissions: ReadonlySet<PermissionString>,
): Set<PermissionString> {
  return mode === 'authenticated-only'
    ? new Set(ALL_PERMISSIONS)
    : new Set(storedPermissions);
}

/** Explicit security step-up always survives; permission-derived step-up is strict-mode only. */
export function shouldRequireStepUp(input: {
  mode: AuthorizationMode;
  isAdmin: boolean;
  explicit: boolean;
  permissionRequiresStepUp: boolean;
}): boolean {
  if (input.isAdmin) return false;
  return input.explicit ||
    (input.mode === 'strict' && input.permissionRequiresStepUp);
}
