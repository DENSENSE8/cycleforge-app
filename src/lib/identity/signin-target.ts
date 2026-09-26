/** Account sign-in workspace resolution — the decision half of POST /api/auth/account/signin. */

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

/** Resolve which workspace an account signs into. */
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
