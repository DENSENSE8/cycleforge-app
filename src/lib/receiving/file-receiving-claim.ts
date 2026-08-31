/**
 * File a receiving Zendesk claim — shared by POST /api/receiving/zendesk-claim
 * and Inbound Add Return orchestration.
 */

import {
  buildReceivingClaimTemplate,
  claimAttachmentFileLabel,
  claimBodyToHtml,
  CLAIM_TYPE_LABEL,
  type ClaimType,
} from '@/lib/zendesk-claim-template';
import { ZendeskNotConfiguredError } from '@/lib/zendesk';
import type { HelpdeskProvider } from '@/lib/integrations/helpdesk/types';
import {
  archiveAndStampReceivingClaimPhotos,
  claimArchiveResponseFields,
} from '@/lib/receiving-claim-archive';
import { uploadClaimPhotosToHelpdesk } from '@/lib/receiving-claim-attach';
import { listAllReceivingPhotoIds } from '@/lib/photos/queries/receiving-list';
import { createSharePack } from '@/lib/photos/share-packs';
import { buildClaimSharePack, claimOpeningBody } from './claim-share-pack';
import { linkPhoto } from '@/lib/photos/service';
import { buildExternalId, linkTicket } from '@/lib/zendesk-links';
import { zendeskTicketUrl } from '@/lib/zendesk-ticket-url';
import { upsertClaimSellerMessage } from '@/lib/receiving-claim-seller-message';
import { claimTicketLinkEntity } from '@/lib/support/tickets';
import { pairTicketShipmentFromReceiving } from '@/lib/support/ticket-link';
import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';

/** Loose email shape — Zendesk validates for real; this just drops obvious junk. */
const CLAIM_CC_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface FileReceivingClaimInput {
  orgId: OrgId;
  staffId: number | null;
  receivingId: number;
  lineId?: number | null;
  claimType: ClaimType;
  reason?: string;
  subject?: string;
  description?: string;
  sellerMessage?: string;
  attachPhotoIds?: number[];
  ccEmails?: string[];
  notePublic?: boolean;
  poReceivingLink?: string;
  /** Client idempotency key forwarded to helpdesk.createTicket. */
  idempotencyKey?: string | null;
  /** When set, share-pack links use this origin (route handler only). */
  sharePackOrigin?: string | null;
}

export interface FileReceivingClaimSuccess {
  success: true;
  ticketNumber: string;
  ticketUrl: string | null;
  ticketId: number;
  reusedExisting: boolean;
  sharePackUrl?: string | null;
  archiveWarning?: string | null;
}

export interface FileReceivingClaimFailure {
  success: false;
  error: string;
  draftBody: string;
  status: 502 | 503;
}

export type FileReceivingClaimResult = FileReceivingClaimSuccess | FileReceivingClaimFailure;

export interface FileReceivingClaimDeps {
  getHelpdesk: (orgId: OrgId) => Promise<HelpdeskProvider | null>;
  buildTemplate: typeof buildReceivingClaimTemplate;
  uploadPhotos: typeof uploadClaimPhotosToHelpdesk;
  archivePhotos: typeof archiveAndStampReceivingClaimPhotos;
  linkTicket: typeof linkTicket;
  pairShipment: typeof pairTicketShipmentFromReceiving;
  upsertSellerMessage: typeof upsertClaimSellerMessage;
  listPhotoIds: typeof listAllReceivingPhotoIds;
  createSharePack: typeof createSharePack;
  linkPhoto: typeof linkPhoto;
  query: typeof tenantQuery;
}

async function resolveDefaultDeps(): Promise<FileReceivingClaimDeps> {
  const { getHelpdeskProvider } = await import('@/lib/integrations/helpdesk');
  return {
    getHelpdesk: getHelpdeskProvider,
    buildTemplate: buildReceivingClaimTemplate,
    uploadPhotos: uploadClaimPhotosToHelpdesk,
    archivePhotos: archiveAndStampReceivingClaimPhotos,
    linkTicket,
    pairShipment: pairTicketShipmentFromReceiving,
    upsertSellerMessage: upsertClaimSellerMessage,
    listPhotoIds: listAllReceivingPhotoIds,
    createSharePack,
    linkPhoto,
    query: tenantQuery,
  };
}

function parseTicketIdFromStored(raw: string | null | undefined): number | null {
  const digits = String(raw ?? '').replace(/\D/g, '');
  if (!digits) return null;
  const id = Number(digits);
  return Number.isFinite(id) && id > 0 ? id : null;
}

/** When the line already carries zendesk_ticket, do not file a second claim. */
export async function findExistingLineClaimTicket(
  orgId: OrgId,
  lineId: number,
  deps: Pick<FileReceivingClaimDeps, 'query'> = { query: tenantQuery },
): Promise<{ ticketNumber: string; ticketId: number } | null> {
  const r = await deps.query<{ zendesk_ticket: string | null }>(
    orgId,
    `SELECT zendesk_ticket
       FROM receiving_line
      WHERE id = $1 AND organization_id = $2::uuid
      LIMIT 1`,
    [lineId, orgId],
  );
  const stored = r.rows[0]?.zendesk_ticket ?? null;
  const ticketId = parseTicketIdFromStored(stored);
  if (!ticketId || !stored) return null;
  return { ticketNumber: stored.startsWith('#') ? stored : `#${stored}`, ticketId };
}

function normalizeCcEmails(raw: string[] | undefined, notePublic: boolean): string[] {
  if (!notePublic || !Array.isArray(raw)) return [];
  return Array.from(
    new Set(
      raw
        .map((e) => String(e).trim())
        .filter((e) => CLAIM_CC_EMAIL_RE.test(e)),
    ),
  );
}

/**
 * Create (or reuse) a receiving claim ticket and link it to the carton/line.
 * Does not wrap HTTP idempotency — callers own that when needed.
 */
export async function fileReceivingClaim(
  input: FileReceivingClaimInput,
  depsArg?: Partial<FileReceivingClaimDeps>,
): Promise<FileReceivingClaimResult> {
  const deps: FileReceivingClaimDeps = {
    ...(await resolveDefaultDeps()),
    ...depsArg,
  };

  const receivingId = Number(input.receivingId);
  const lineIdRaw = input.lineId != null ? Number(input.lineId) : null;
  const lineId = lineIdRaw != null && Number.isFinite(lineIdRaw) ? lineIdRaw : null;

  if (!input.claimType || !(input.claimType in CLAIM_TYPE_LABEL)) {
    return {
      success: false,
      error: 'Invalid claimType',
      draftBody: '',
      status: 502,
    };
  }

  if (lineId != null) {
    const existing = await findExistingLineClaimTicket(input.orgId, lineId, deps);
    if (existing) {
      return {
        success: true,
        ticketNumber: existing.ticketNumber,
        ticketUrl: zendeskTicketUrl(existing.ticketId),
        ticketId: existing.ticketId,
        reusedExisting: true,
      };
    }
  }

  const notePublic = input.notePublic === true;
  const ccEmails = normalizeCcEmails(input.ccEmails, notePublic);
  const editedSubject = typeof input.subject === 'string' ? input.subject.trim() : '';
  const editedDescription = typeof input.description === 'string' ? input.description.trim() : '';

  const template = await deps.buildTemplate(
    {
      receivingId,
      lineId,
      claimType: input.claimType,
      reason: input.reason,
      poReceivingLink: input.poReceivingLink,
    },
    input.orgId,
  );
  const subject = editedSubject || template.subject;
  const description = editedDescription || template.description;
  const fileLabel = claimAttachmentFileLabel(template, receivingId);
  const { entityType, entityId } = claimTicketLinkEntity(lineId, receivingId);

  const helpdesk = await deps.getHelpdesk(input.orgId);
  if (!helpdesk) {
    const { HELPDESK_CONNECT_HINT, HELPDESK_NOT_CONNECTED_MESSAGE } = await import(
      '@/lib/integrations/helpdesk'
    );
    return {
      success: false,
      error: `${HELPDESK_NOT_CONNECTED_MESSAGE} — ${HELPDESK_CONNECT_HINT}`,
      draftBody: description,
      status: 503,
    };
  }

  const ids = Array.isArray(input.attachPhotoIds)
    ? input.attachPhotoIds.map(Number).filter((n) => Number.isFinite(n) && n > 0)
    : [];

  // Built BEFORE the ticket so its link can ride in the OPENING comment —
  // Zendesk cannot edit a comment after the fact. Backfilled with the ticket id
  // below. See {@link buildClaimSharePack} / {@link claimOpeningBody}.
  const sharePack = await buildClaimSharePack({
    orgId: input.orgId,
    staffId: input.staffId,
    receivingId,
    photoIds: ids,
    origin: input.sharePackOrigin,
    createPack: deps.createSharePack,
    listPhotos: deps.listPhotoIds,
  });
  const openingBody = claimOpeningBody(description, sharePack?.shareUrl ?? null);

  let uploads: string[] = [];
  try {
    uploads = await deps.uploadPhotos({
      helpdesk,
      organizationId: input.orgId,
      receivingId,
      photoIds: ids,
      fileLabel,
    });
  } catch {
    uploads = [];
  }

  let ticket;
  try {
    ticket = await helpdesk.createTicket(
      {
        subject,
        comment: {
          body: openingBody,
          html_body: claimBodyToHtml(openingBody),
          public: notePublic,
          uploads: uploads.length ? uploads : undefined,
        },
        type: 'task',
        tags: ['receiving_claim', `claim_${input.claimType}`],
        external_id: buildExternalId(entityType, entityId),
        ...(ccEmails.length
          ? { email_ccs: ccEmails.map((user_email) => ({ user_email, action: 'put' as const })) }
          : {}),
      },
      { idempotencyKey: input.idempotencyKey ?? undefined },
    );
  } catch (err: unknown) {
    if (err instanceof ZendeskNotConfiguredError) {
      const { HELPDESK_CONNECT_HINT, HELPDESK_NOT_CONNECTED_MESSAGE } = await import(
        '@/lib/integrations/helpdesk'
      );
      return {
        success: false,
        error: `${HELPDESK_NOT_CONNECTED_MESSAGE} — ${HELPDESK_CONNECT_HINT}`,
        draftBody: description,
        status: 503,
      };
    }
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Helpdesk request failed',
      draftBody: description,
      status: 502,
    };
  }

  const ticketNumber = `#${ticket.id}`;

  const archived = await deps.archivePhotos({
    orgId: input.orgId,
    receivingId,
    ticketId: ticket.id,
    logTag: 'zendesk-claim',
    info: ({ photoIdCount, resolvedCount }) =>
      [
        `Zendesk Ticket: ${ticketNumber}`,
        `URL: ${zendeskTicketUrl(ticket.id)}`,
        `Subject: ${subject}`,
        `Claim type: ${CLAIM_TYPE_LABEL[input.claimType]}`,
        `Filed: ${new Date().toISOString()}`,
        `Photos uploaded to Zendesk: ${uploads.length}`,
        `Photos on claim record: ${photoIdCount}`,
        `Photos resolved for NAS archive: ${resolvedCount}`,
        '',
        '--- Ticket body ---',
        description,
      ].join('\n'),
  });
  const archiveFields = claimArchiveResponseFields(archived);

  try {
    await deps.linkTicket({
      orgId: input.orgId,
      zendeskTicketId: ticket.id,
      entityType,
      entityId,
      staffId: input.staffId,
    });
  } catch (linkErr) {
    console.warn('[fileReceivingClaim] ticket link failed', linkErr);
  }

  if (input.staffId) {
    try {
      const { recordStaffForPostedComment } = await import(
        '@/lib/integrations/helpdesk/comment-staff'
      );
      await recordStaffForPostedComment({
        orgId: input.orgId,
        ticketId: ticket.id,
        staffId: input.staffId,
        body: description,
        helpdesk,
      });
    } catch (stampErr) {
      console.warn('[fileReceivingClaim] comment staff stamp failed', stampErr);
    }
  }

  try {
    await deps.pairShipment({
      orgId: input.orgId,
      ticketId: ticket.id,
      receivingId,
      staffId: input.staffId,
    });
  } catch (pairErr) {
    console.warn('[fileReceivingClaim] STN pair failed', pairErr);
  }

  try {
    if (lineId != null) {
      await deps.query(
        input.orgId,
        `UPDATE receiving_line SET zendesk_ticket = $1 WHERE id = $2 AND organization_id = $3`,
        [ticketNumber, lineId, input.orgId],
      );
    } else {
      await deps.query(
        input.orgId,
        `UPDATE receiving_carton SET zendesk_ticket = $1 WHERE id = $2 AND organization_id = $3`,
        [ticketNumber, receivingId, input.orgId],
      );
    }
  } catch (colErr) {
    console.warn('[fileReceivingClaim] zendesk_ticket column update failed', colErr);
  }

  const sellerDraft = typeof input.sellerMessage === 'string' ? input.sellerMessage.trim() : '';
  if (sellerDraft) {
    try {
      await deps.upsertSellerMessage({
        orgId: input.orgId,
        receivingId,
        lineId,
        sellerMessage: sellerDraft,
        subjectSnapshot: subject,
        zendeskTicketId: ticket.id,
        staffId: input.staffId ?? null,
      });
    } catch (sellerErr) {
      console.warn('[fileReceivingClaim] seller message persist failed', sellerErr);
    }
  }

  // The pack already shipped in the opening comment — all that is left is to
  // tie it, and its photos, to the ticket that now has an id. No second comment.
  const sharePackUrl: string | null = sharePack?.shareUrl ?? null;
  if (sharePack) {
    try {
      await deps.query(
        input.orgId,
        `UPDATE photo_share_packs SET zendesk_ticket_id = $1
          WHERE id = $2 AND organization_id = $3`,
        [ticket.id, sharePack.packId, input.orgId],
      );
      for (const photoId of sharePack.photoIds) {
        await deps.linkPhoto({
          organizationId: input.orgId,
          photoId,
          entityType: 'ZENDESK_TICKET',
          entityId: ticket.id,
          linkRole: 'claim_evidence',
        });
      }
    } catch (shareErr) {
      console.warn('[fileReceivingClaim] share pack backfill failed', shareErr);
    }
  }

  return {
    success: true,
    ticketNumber,
    ticketUrl: zendeskTicketUrl(ticket.id),
    ticketId: ticket.id,
    reusedExisting: false,
    sharePackUrl,
    archiveWarning: archiveFields.archiveWarning ?? null,
  };
}
