/**
 * Zod contracts for /api/user-issues read paths (UIC-1).
 * Mutation bodies land with UIC-3.
 */

import { z } from 'zod';
import { USER_ISSUE_STATUSES, USER_ISSUE_TYPES } from '@/lib/user-issues/issues';

const statusEnum = z.enum(USER_ISSUE_STATUSES as [string, ...string[]]);
const typeEnum = z.enum(USER_ISSUE_TYPES as [string, ...string[]]);

/** Opaque keyset cursor: `${isoCreatedAt}~${id}`. */
export function encodeIssueCursor(cursor: { createdAt: string; id: number }): string {
  return `${cursor.createdAt}~${cursor.id}`;
}

export function decodeIssueCursor(raw: string): { createdAt: string; id: number } | null {
  const tilde = raw.lastIndexOf('~');
  if (tilde <= 0) return null;
  const createdAt = raw.slice(0, tilde);
  const id = Number(raw.slice(tilde + 1));
  if (!createdAt || !Number.isFinite(id) || id <= 0) return null;
  // Cheap ISO-ish guard — reject garbage that would 500 the timestamptz cast.
  if (!/^\d{4}-\d{2}-\d{2}T/.test(createdAt)) return null;
  return { createdAt, id };
}

export const ListUserIssuesQuery = z.object({
  status: statusEnum.optional(),
  type: typeEnum.optional(),
  reporter: z.coerce.number().int().positive().optional(),
  q: z.string().trim().max(200).optional(),
  cursor: z.string().min(1).max(80).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export type ListUserIssuesQuery = z.infer<typeof ListUserIssuesQuery>;
