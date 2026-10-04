/** Server-only helper for page.tsx / layout.tsx files. */

import 'server-only';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getCurrentUser, type CurrentUser } from './current-user';
import type { PermissionString } from './permissions';
import { audit } from './audit';
import { isTrialBlocked } from '@/lib/billing/trial-gate';
import {
  ACTIVATION_REDIRECT_HREF,
  isActivationBlocked,
} from '@/lib/onboarding/activation-gate';

interface PageGuardOpts {
  /** @deprecated kept for callsite compatibility; enforcement is always on. */
  enforce?: boolean;
}

/**
 * Returns the current user if they have the permission (any one of them, given
 * a list); redirects otherwise.
 *
 * Unauthenticated → `/signin?next=<current path>`
 * Authenticated but lacks `perm` → `/not-authorized`
 */
export async function requirePermission(
  perm: PermissionString | readonly PermissionString[],
  _opts: PageGuardOpts = {},
): Promise<CurrentUser> {
  const user = await getCurrentUser();

  if (!user) {
    const h = await headers();
    const path = h.get('x-pathname') || '/';
    redirect(`/signin?next=${encodeURIComponent(path)}`);
  }

  const anyOf: readonly PermissionString[] = typeof perm === 'string' ? [perm] : perm;
  if (!anyOf.some((p) => user.permissions.has(p))) {
    await audit({
      staffId: user.staffId,
      event: 'permission.denied',
      result: 'denied',
      sid: user.session.sid,
      detail: { permission: perm, page: true },
    });
    redirect('/not-authorized');
  }

  // Trial-expiry gate — OFF by default (TRIAL_ENFORCEMENT). Send an
  // expired-trial tenant to billing to subscribe; billing/auth paths are
  // exempt in trial-gate.ts so there's no redirect loop.
  const trialPath = (await headers()).get('x-pathname') || '/';
  if (await isTrialBlocked(user.organizationId, trialPath)) {
    redirect('/settings/billing?status=trial_expired');
  }

  // Activation gate — template-less orgs go to /onboarding/template before
  // empty operator desks. Fail-open on probe error; allowlist in activation-gate.
  if (await isActivationBlocked(user.organizationId, trialPath)) {
    redirect(ACTIVATION_REDIRECT_HREF);
  }

  return user;
}
