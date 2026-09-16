/**
 * Account sign-in workspace resolution — the decision half of
 * POST /api/auth/account/signin.
 *
 * Pure on purpose: the route's membership query is the only I/O, and the
 * choice policy (which workspace an account enters) is exactly the part that
 * must never drift between the picker the client renders and the session the
 * server mints. An `organizationId` is honored ONLY when it matches a
 * membership row the server just fetched — the client's word alone decides
 * nothing (NOT_A_MEMBER, not a session for someone else's org).
 */

export interface AccountMembershipRow {
  organization_id: string;
  organization_name: string;
  /** The org-scoped staff profile this account enters as. */
  staff_id: number;
}

export type AccountSigninTarget<T extends AccountMembershipRow> =
  | { kind: 'no_workspace' }
  | { kind: 'not_member'; organizationId: string }
  | { kind: 'needs_choice'; memberships: readonly T[] }
  | { kind: 'target'; target: T };

/**
 * Resolve which workspace an account signs into.
 *
 *   • no memberships            → no_workspace (403 at the route)
 *   • organizationId supplied   → target when it matches a membership,
 *                                 not_member otherwise (403 at the route)
 *   • no organizationId, >1     → needs_choice (the client's workspace picker)
 *   • no organizationId, 1      → that membership
 */
export function resolveAccountSigninTarget<T extends AccountMembershipRow>(
  memberships: readonly T[],
  organizationId: string | null | undefined,
): AccountSigninTarget<T> {
  if (memberships.length === 0) return { kind: 'no_workspace' };

  const wanted = typeof organizationId === 'string' ? organizationId.trim() : '';
  if (wanted) {
    const match = memberships.find((m) => m.organization_id === wanted);
    return match
      ? { kind: 'target', target: match }
      : { kind: 'not_member', organizationId: wanted };
  }

  if (memberships.length > 1) return { kind: 'needs_choice', memberships };
  return { kind: 'target', target: memberships[0]! };
}
