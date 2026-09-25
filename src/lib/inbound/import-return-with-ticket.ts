/**
 * Inbound Add Return — ingest onto the spine and file a linked Return claim
 * in one server-side orchestration (no HTTP loop).
 */

import type { OrgId } from '@/lib/tenancy/constants';
import type { InboundImportPurchaseBody } from '@/lib/schemas/inbound-desk';
import {
  getHelpdeskProvider,
  HELPDESK_CONNECT_HINT,
  HELPDESK_NOT_CONNECTED_MESSAGE,
} from '@/lib/integrations/helpdesk';
import {
  importDeskInboundRow,
  isDeskImportSkip,
  resolveCatalogById,
  type ImportDeskInboundRowDeps,
} from '@/lib/inbound/desk-import';
import {
  fileReceivingClaim,
  type FileReceivingClaimDeps,
  type FileReceivingClaimResult,
} from '@/lib/receiving/file-receiving-claim';

export interface ImportReturnWithTicketInput {
  orgId: OrgId;
  staffId: number | null;
  body: InboundImportPurchaseBody;
  poReceivingLinkForCarton?: (receivingId: number) => string;
  idempotencyKey?: string | null;
}

export interface ImportReturnWithTicketSuccess {
  success: true;
  receivingLineId: number;
  receivingId: number;
  created: boolean;
  platformAccountId: number | null;
  sourceType: string;
  ticket: {
    success: true;
    ticketNumber: string;
    ticketUrl: string | null;
    reusedExisting: boolean;
  };
}

export interface ImportReturnWithTicketIngestOnly {
  success: true;
  receivingLineId: number;
  receivingId: number;
  created: boolean;
  platformAccountId: number | null;
  sourceType: string;
  ticket: {
    success: false;
    error: string;
    draftBody: string;
  };
}

export type ImportReturnWithTicketResult =
  | ImportReturnWithTicketSuccess
  | ImportReturnWithTicketIngestOnly;

export interface ImportReturnWithTicketBlocked {
  blocked: true;
  status: 400 | 503;
  error: string;
  draftBody?: string;
}

export type ImportReturnWithTicketOutcome =
  | ImportReturnWithTicketResult
  | ImportReturnWithTicketBlocked;

export function isImportReturnBlocked(
  outcome: ImportReturnWithTicketOutcome,
): outcome is ImportReturnWithTicketBlocked {
  return 'blocked' in outcome;
}

export interface ImportReturnWithTicketDeps {
  getHelpdesk?: typeof getHelpdeskProvider;
  importRow?: typeof importDeskInboundRow;
  resolveCatalog?: typeof resolveCatalogById;
  fileClaim?: typeof fileReceivingClaim;
  importRowDeps?: ImportDeskInboundRowDeps;
  claimDeps?: Partial<FileReceivingClaimDeps>;
}

/** Route-level validation for desk Add Return (not CSV). */
export async function validateAddReturnBody(
  orgId: OrgId,
  body: InboundImportPurchaseBody,
  resolveCatalog: typeof resolveCatalogById = resolveCatalogById,
): Promise<string | null> {
  if (body.kind !== 'return') return 'kind must be return';
  const tracking = body.tracking_number?.trim();
  if (!tracking) return 'tracking_number is required for returns';
  const catalogId = body.sku_catalog_id;
  if (catalogId == null || !Number.isFinite(Number(catalogId)) || Number(catalogId) <= 0) {
    return 'sku_catalog_id is required for returns';
  }
  const catalog = await resolveCatalog(orgId, Number(catalogId));
  if (!catalog) return 'sku_catalog_id is not an active catalog row';
  return null;
}

function deskRowFromBody(body: InboundImportPurchaseBody) {
  return {
    kind: 'return' as const,
    sourceType: body.source_type,
    sourcePlatform: body.source_platform,
    receivingType: body.receiving_type,
    priorityTier: body.priority_tier,
    orderId: body.order_id,
    lineItemId: body.line_item_id,
    sku: body.sku,
    itemName: body.item_name,
    quantity: body.quantity,
    trackingNumber: body.tracking_number,
    carrierCode: body.carrier_code,
    seller: body.seller,
    listingUrl: body.listing_url,
    accountName: body.account_name,
    returnReason: body.return_reason,
    rmaId: body.rma_id,
    conditionGrade: body.condition_grade,
    skuCatalogId: body.sku_catalog_id,
  };
}

export async function importReturnWithTicket(
  input: ImportReturnWithTicketInput,
  deps: ImportReturnWithTicketDeps = {},
): Promise<ImportReturnWithTicketOutcome> {
  const getHelpdesk = deps.getHelpdesk ?? getHelpdeskProvider;
  const doImport = deps.importRow ?? importDeskInboundRow;
  const doResolveCatalog = deps.resolveCatalog ?? resolveCatalogById;
  const doFileClaim = deps.fileClaim ?? fileReceivingClaim;

  const validationError = await validateAddReturnBody(
    input.orgId,
    input.body,
    doResolveCatalog,
  );
  if (validationError) {
    return { blocked: true, status: 400, error: validationError };
  }

  const helpdesk = await getHelpdesk(input.orgId);
  if (!helpdesk) {
    return {
      blocked: true,
      status: 503,
      error: `${HELPDESK_NOT_CONNECTED_MESSAGE} — ${HELPDESK_CONNECT_HINT}`,
    };
  }

  let ingest;
  try {
    const outcome = await doImport(
      input.orgId,
      deskRowFromBody(input.body),
      deps.importRowDeps ?? {},
    );
    if (isDeskImportSkip(outcome)) {
      return {
        blocked: true,
        status: 400,
        error: `skipped: ${outcome.reason}`,
      };
    }
    ingest = outcome;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'import failed';
    return { blocked: true, status: 400, error: message };
  }

  const receivingId = ingest.receivingId;
  if (receivingId == null || !Number.isFinite(receivingId) || receivingId <= 0) {
    return {
      blocked: true,
      status: 400,
      error: 'inbound: tracking did not attach a carton — cannot file return ticket',
    };
  }

  const claimResult: FileReceivingClaimResult = await doFileClaim(
    {
      orgId: input.orgId,
      staffId: input.staffId,
      receivingId,
      lineId: ingest.receivingLineId,
      claimType: 'return',
      reason: input.body.return_reason ?? undefined,
      notePublic: false,
      poReceivingLink: input.poReceivingLinkForCarton?.(receivingId),
      listingUrl: input.body.listing_url ?? undefined,
      idempotencyKey: input.idempotencyKey,
    },
    { ...deps.claimDeps, getHelpdesk: async () => helpdesk },
  );

  const base = {
    receivingLineId: ingest.receivingLineId,
    receivingId,
    created: ingest.created,
    platformAccountId: ingest.platformAccountId,
    sourceType: ingest.sourceType,
  };

  if (!claimResult.success) {
    return {
      success: true,
      ...base,
      ticket: {
        success: false,
        error: claimResult.error,
        draftBody: claimResult.draftBody,
      },
    };
  }

  return {
    success: true,
    ...base,
    ticket: {
      success: true,
      ticketNumber: claimResult.ticketNumber,
      ticketUrl: claimResult.ticketUrl,
      reusedExisting: claimResult.reusedExisting,
    },
  };
}
