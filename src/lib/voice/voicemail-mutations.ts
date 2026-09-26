/** Voicemail follow-up mutations (mark done / snooze / assign / note) and case linkage. */

import { withTenantTransaction } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import type { VoicemailStatus } from './types';

export interface FollowupUpdate {
  status?: VoicemailStatus;
  snoozeUntil?: string | null;
  assignedStaffId?: number | null;
  note?: string | null;
}

export interface UpdateFollowupResult {
  ok: boolean;
  notFound?: boolean;
  status?: VoicemailStatus;
  assignedStaffId?: number | null;
}

/**
 * Patch the follow-up for a voicemail. Resolving (done/no_action) stamps
 * resolved_at/by; re-opening clears them; snoozing sets snooze_until.
 * Returns notFound when the voicemail (or its follow-up) isn't in this org.
 */
export async function updateFollowup(
  orgId: OrgId,
  voicemailId: number,
  update: FollowupUpdate,
  actorStaffId: number | null,
): Promise<UpdateFollowupResult> {
  return withTenantTransaction(orgId, async (client) => {
    // Lock the follow-up row for this voicemail in this org.
    const existing = await client.query<{ id: number }>(
      `SELECT id FROM voicemail_followups
        WHERE organization_id = $1 AND voicemail_id = $2
        FOR UPDATE`,
      [orgId, voicemailId],
    );
    if (existing.rows.length === 0) return { ok: false, notFound: true };

    const sets: string[] = ['updated_at = now()'];
    const args: unknown[] = [orgId, voicemailId];

    if (update.status !== undefined) {
      args.push(update.status);
      sets.push(`status = $${args.length}`);
      if (update.status === 'done' || update.status === 'no_action') {
        sets.push('resolved_at = now()');
        args.push(actorStaffId);
        sets.push(`resolved_by = $${args.length}`);
      } else {
        sets.push('resolved_at = NULL', 'resolved_by = NULL');
      }
      if (update.status !== 'snoozed') sets.push('snooze_until = NULL');
    }

    if (update.snoozeUntil !== undefined) {
      args.push(update.snoozeUntil);
      sets.push(`snooze_until = $${args.length}`);
    }

    if (update.assignedStaffId !== undefined) {
      args.push(update.assignedStaffId);
      sets.push(`assigned_staff_id = $${args.length}`);
      args.push(actorStaffId);
      sets.push(`assigned_by = $${args.length}`);
    }

    if (update.note !== undefined) {
      args.push(update.note);
      sets.push(`note = $${args.length}`);
    }

    const r = await client.query<{ status: VoicemailStatus; assigned_staff_id: number | null }>(
      `UPDATE voicemail_followups
          SET ${sets.join(', ')}
        WHERE organization_id = $1 AND voicemail_id = $2
        RETURNING status, assigned_staff_id`,
      args,
    );
    const row = r.rows[0];
    return { ok: true, status: row?.status, assignedStaffId: row?.assigned_staff_id ?? null };
  });
}

export interface LinkVoicemailResult {
  ok: boolean;
  notFound?: boolean;
  linkedTicketId: number | null;
}

/**
 * Link (or, with ticketId=null, unlink) a voicemail to a Zendesk ticket via the
 * universal `ticket_links` table, and refresh the voicemail's cache column.
 */
export async function linkVoicemailToTicket(
  orgId: OrgId,
  voicemailId: number,
  ticketId: number | null,
  actorStaffId: number | null,
): Promise<LinkVoicemailResult> {
  return withTenantTransaction(orgId, async (client) => {
    const vm = await client.query<{ id: number }>(
      `SELECT id FROM voicemails WHERE organization_id = $1 AND id = $2 FOR UPDATE`,
      [orgId, voicemailId],
    );
    if (vm.rows.length === 0) return { ok: false, notFound: true, linkedTicketId: null };

    if (ticketId == null) {
      await client.query(
        `DELETE FROM ticket_links
          WHERE organization_id = $1 AND entity_type = 'voicemail' AND entity_id = $2`,
        [orgId, voicemailId],
      );
      await client.query(
        `UPDATE voicemails SET linked_ticket_id = NULL, updated_at = now()
          WHERE organization_id = $1 AND id = $2`,
        [orgId, voicemailId],
      );
      return { ok: true, linkedTicketId: null };
    }

    // A voicemail link is the ticket's ANCHOR (the ticket is *about* the call), so it takes the primary slot.
    await client.query(
      `UPDATE ticket_links SET is_primary = false, updated_at = now()
        WHERE organization_id = $1
          AND zendesk_ticket_id = $2
          AND is_primary
          AND NOT (entity_type = 'voicemail' AND entity_id = $3)`,
      [orgId, ticketId, voicemailId],
    );
    await client.query(
      `INSERT INTO ticket_links
         (organization_id, zendesk_ticket_id, entity_type, entity_id, is_primary, created_by)
       VALUES ($1, $2, 'voicemail', $3, true, $4)
       ON CONFLICT (organization_id, zendesk_ticket_id, entity_type, entity_id)
       DO UPDATE SET is_primary = true, updated_at = now()`,
      [orgId, ticketId, voicemailId, actorStaffId],
    );
    await client.query(
      `UPDATE voicemails SET linked_ticket_id = $3, updated_at = now()
        WHERE organization_id = $1 AND id = $2`,
      [orgId, voicemailId, ticketId],
    );
    return { ok: true, linkedTicketId: ticketId };
  });
}
