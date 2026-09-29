/** Tenant-owned kiosk bridge to the canonical receiving-unit label writer. */

import { recordLabelPrintJob } from '@/lib/labels/print-jobs';
import {
  issueReceivingUnitLabels,
  type ReceivingUnitLabel,
} from '@/lib/receiving/issue-receiving-unit-labels';
import type { OrgId } from '@/lib/tenancy/constants';
import { tenantQuery } from '@/lib/tenancy/db';

export interface KioskPickupLabelFailure {
  lineId: number;
  error: string;
}

export interface KioskPickupLabelResult {
  labels: ReceivingUnitLabel[];
  failures: KioskPickupLabelFailure[];
}

export class KioskPickupLabelError extends Error {
  constructor(message: string, readonly status: 409) {
    super(message);
    this.name = 'KioskPickupLabelError';
  }
}

export interface KioskPickupLabelDeps {
  ownedLineIds: (
    orgId: OrgId,
    localPickupOrderId: number,
    lineIds: readonly number[],
  ) => Promise<number[]>;
  issue: typeof issueReceivingUnitLabels;
  record: typeof recordLabelPrintJob;
}

const defaultDeps: KioskPickupLabelDeps = {
  ownedLineIds: async (orgId, localPickupOrderId, lineIds) => {
    const owned = await tenantQuery<{ receiving_line_id: number }>(
      orgId,
      `SELECT lpoi.receiving_line_id
         FROM local_pickup_order_items lpoi
         JOIN local_pickup_orders lpo
           ON lpo.id = lpoi.order_id
          AND lpo.organization_id = lpoi.organization_id
        WHERE lpoi.organization_id = $1
          AND lpo.id = $2
          AND lpoi.receiving_line_id = ANY($3::int[])`,
      [orgId, localPickupOrderId, lineIds],
    );
    return owned.rows.map((row) => Number(row.receiving_line_id));
  },
  issue: issueReceivingUnitLabels,
  record: recordLabelPrintJob,
};

/**
 * Issue and ledger all printable physical units from one landed pickup.
 * A catalog-missing line is a partial failure; a foreign line rejects the
 * entire request before any serial identity or print record is written.
 */
export async function issueKioskPickupLabels(
  args: {
    localPickupOrderId: number;
    lineIds: readonly number[];
    issuanceVersion: string;
    staffId: number;
  },
  orgId: OrgId,
  deps: KioskPickupLabelDeps = defaultDeps,
): Promise<KioskPickupLabelResult> {
  const requestedLineIds = [...new Set(args.lineIds)];
  const ownedIds = new Set(
    await deps.ownedLineIds(orgId, args.localPickupOrderId, requestedLineIds),
  );
  if (ownedIds.size !== requestedLineIds.length || requestedLineIds.some((id) => !ownedIds.has(id))) {
    throw new KioskPickupLabelError(
      'One or more receiving lines do not belong to this pickup',
      409,
    );
  }

  const attempts = await Promise.all(
    requestedLineIds.map(async (lineId) => {
      try {
        const issued = await deps.issue(
          { lineId, issuanceVersion: args.issuanceVersion, actorStaffId: args.staffId },
          orgId,
        );
        return { labels: issued.labels, failure: null };
      } catch (error) {
        return {
          labels: [] as ReceivingUnitLabel[],
          failure: {
            lineId,
            error: error instanceof Error ? error.message : 'Could not issue product labels',
          } satisfies KioskPickupLabelFailure,
        };
      }
    }),
  );
  const labels = attempts.flatMap((attempt) => attempt.labels);
  const failures = attempts
    .map((attempt) => attempt.failure)
    .filter((failure): failure is KioskPickupLabelFailure => failure != null);

  // Returning these payloads is the kiosk's print-dispatch boundary. Each
  // unit event id makes a retried PIN submission an idempotent ledger write.
  await Promise.all(
    labels.map((label) =>
      deps.record(
        {
          jobType: label.isReprint ? 'REPRINT' : 'UNIT',
          serialUnitId: label.serialUnitId,
          unitUid: label.unitUid,
          qrPayload: label.qrPayload,
          symbology: 'datamatrix',
          templateId: 'product',
          isReprint: label.isReprint,
          clientEventId: label.clientEventId,
          actorStaffId: args.staffId,
        },
        orgId,
      ),
    ),
  );

  return { labels, failures };
}
