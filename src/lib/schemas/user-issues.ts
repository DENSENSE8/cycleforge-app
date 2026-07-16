/**
 * Zod contracts for /api/user-issues (UIC-1 read + UIC-3 PATCH).
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

/**
 * PATCH body — field edits and/or a status change.
 * Status changes require `expectedFrom` (optimistic concurrency → 409).
 */
export const PatchUserIssueBody = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().min(1).max(4000).optional(),
    issueType: typeEnum.optional(),
    status: statusEnum.optional(),
    expectedFrom: statusEnum.optional(),
    resolutionCommit: z.string().trim().max(80).nullable().optional(),
    clientEventId: z.string().trim().min(1).max(80).optional(),
  })
  .superRefine((body, ctx) => {
    const hasFields =
      body.title !== undefined || body.description !== undefined || body.issueType !== undefined;
    const hasStatus = body.status !== undefined;
    if (!hasFields && !hasStatus) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Provide at least one of title, description, issueType, or status',
      });
    }
    if (hasStatus && body.expectedFrom === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['expectedFrom'],
        message: 'expectedFrom is required when changing status',
      });
    }
  });

export type PatchUserIssueBody = z.infer<typeof PatchUserIssueBody>;
