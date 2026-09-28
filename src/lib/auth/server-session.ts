import { cache } from 'react';
import { after } from 'next/server';
import { getCurrentUser } from './current-user';
import { touchSession } from './session';
import { getOrganization } from '@/lib/tenancy/organizations';
import { resolveEnvelopeMemberships } from '@/lib/identity/memberships';
import type { AuthSessionUser } from '@/contexts/AuthContext';

export const getInitialAuthUser = cache(async (): Promise<AuthSessionUser | null> => {
  const current = await getCurrentUser();
  if (!current || current.role === 'unknown') return null;

  // After the response: slides the idle window, but touchSession writes at
  // most once per session per 5 minutes, not once per render.
  const sid = current.session.sid;
  after(() => touchSession(sid));

  // Active tenant identity for the passive "which workspace" signal. Cached
  // in-process (30s); best-effort so a miss never blocks SSR hydration.
  const org = await getOrganization(current.organizationId).catch(() => null);

  const memberships = await resolveEnvelopeMemberships({
    staffId: current.staffId,
    currentOrgId: current.organizationId,
    currentOrgName: org?.name ?? 'Workspace',
    currentOrgSlug: org?.slug ?? null,
    currentOrgPlan: org?.plan ?? null,
  });

  return {
    staffId: current.staffId,
    organizationId: current.organizationId,
    organizationName: org?.name ?? 'Workspace',
    organizationSlug: org?.slug ?? null,
    organizationPlan: org?.plan ?? null,
    memberships,
    name: current.name,
    email: current.email,
    role: current.role,
    permissions: Array.from(current.permissions),
    authorizationMode: current.authorizationMode,
    storedPermissions: Array.from(current.storedPermissions),
    mobileDisplayConfig: current.mobileDisplayConfig,
    avatarPhotoId: current.avatarPhotoId,
    session: {
      sid: current.session.sid,
      deviceKind: current.session.deviceKind,
      deviceLabel: current.session.deviceLabel,
      expiresAt: current.session.expiresAt.toISOString(),
      persistent: current.session.persistent,
    },
  };
});
