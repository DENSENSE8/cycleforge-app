import { z } from 'zod';
import { INBOUND_FOLLOWUP_TAGS } from '@/lib/receiving/inbound-followups';

/** Canonical upper-alnum key (see `inboundFollowupKey`). */
const FollowupKey = z.string().regex(/^[A-Z0-9]{1,100}$/, 'key must be a canonical upper-alnum ref');

/** GET ?keys=a,b — up to 200 keys; an empty list reads nothing. */
export const InboundFollowupsQuery = z.object({
  keys: z.array(FollowupKey).max(200),
});

/** POST body — `tag: null` clears the follow-up on every key. */
export const InboundFollowupsWrite = z.object({
  keys: z.array(FollowupKey).min(1).max(200),
  tag: z.enum(INBOUND_FOLLOWUP_TAGS).nullable(),
  note: z.string().max(500).nullable().optional(),
});

export type InboundFollowupsWriteInput = z.infer<typeof InboundFollowupsWrite>;
