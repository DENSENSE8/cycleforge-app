'use client';

import { useMemo, useState } from 'react';
import { Check, ExternalLink, Ticket } from '@/components/Icons';
import type { SerialUnitRead } from '@/lib/serial/use-serial-unit';
import { Button } from '@/design-system/primitives';
import { TabSwitch } from '@/design-system/components/TabSwitch';
import { TextField } from '@/design-system/primitives/TextField';
import {
  QC_FAIL_REMEDY_LABEL,
  qcFailClaimReason,
  suggestQcFailRemedy,
  type QcFailRemedy,
} from '@/lib/qc/fail-remedy';
import { summarizeUnitQc, type UnitQcStep } from '@/lib/qc/unit-qc';
import { safeRandomUUID } from '@/lib/safe-uuid';

const PANEL = 'flex flex-col gap-3 bg-mode-panel px-mode-page py-3';
const CAPTION = 'text-role-caption text-mode-muted';
const ERROR = 'bg-rose-50 px-mode-page py-3 text-role-caption font-semibold text-rose-700';

interface ClaimResult {
  ticketNumber: string;
  ticketUrl: string | null;
  reusedExisting: boolean;
}

/**
 * A failed (or held) unit's claim ticket: Return for refund or Partial refund,
 * pre-picked by `suggestQcFailRemedy`, filed through the one receiving claim
 * writer (`POST /api/receiving/zendesk-claim`, type `vendor_defect`) against
 * the unit's carton + line. A line that already carries a ticket reuses it.
 * The phone's verdict section and the desk QC record's Failed panel both
 * mount it; each surface titles it.
 */
export function QcFailTicketPanel({
  unit,
  steps,
  note,
  onFiled,
}: {
  unit: Pick<
    SerialUnitRead,
    'serial_number' | 'sku' | 'product_title' | 'condition_grade' | 'current_receiving_id' | 'current_receiving_line_id'
  >;
  steps: readonly UnitQcStep[];
  note: string;
  /** The ticket is on the line — the record re-reads to show it. */
  onFiled?: () => void;
}) {
  const suggestion = useMemo(() => {
    const { failed, total } = summarizeUnitQc(steps);
    return suggestQcFailRemedy({ failed, total, conditionGrade: unit.condition_grade });
  }, [steps, unit.condition_grade]);
  const [remedy, setRemedy] = useState<QcFailRemedy>(suggestion.remedy);
  const [detail, setDetail] = useState(note);
  const [filing, setFiling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filed, setFiled] = useState<ClaimResult | null>(null);
  // One key per ticket intent: a double tap or a retry after a dropped response files once.
  const [idempotencyKey] = useState(safeRandomUUID);

  const receivingId = unit.current_receiving_id;
  const file = async () => {
    if (filing || receivingId == null) return;
    setFiling(true);
    setError(null);
    try {
      const res = await fetch('/api/receiving/zendesk-claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify({
          receivingId,
          lineId: unit.current_receiving_line_id,
          claimType: 'vendor_defect',
          reason: qcFailClaimReason({
            remedy,
            why: remedy === suggestion.remedy ? suggestion.why : `Tech chose over the suggestion (${suggestion.why})`,
            title: unit.product_title,
            serialNumber: unit.serial_number,
            sku: unit.sku,
            note: detail,
          }),
        }),
      });
      const json = (await res.json().catch(() => null)) as
        | { success?: boolean; error?: string; ticketNumber?: string; ticketUrl?: string | null; reusedExisting?: boolean }
        | null;
      if (!res.ok || !json?.success || !json.ticketNumber) {
        throw new Error(json?.error || (res.status === 403 ? 'No permission to open receiving tickets' : `HTTP ${res.status}`));
      }
      setFiled({ ticketNumber: json.ticketNumber, ticketUrl: json.ticketUrl ?? null, reusedExisting: json.reusedExisting === true });
      onFiled?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The ticket was not created');
    } finally {
      setFiling(false);
    }
  };

  return (
    <div className="divide-y divide-mode-rule" data-testid="qc-fail-ticket">
      {filed ? (
        <div className={PANEL} role="status" data-testid="qc-ticket-filed">
          <p className="flex items-center gap-2 text-mode-body font-semibold text-mode-ink">
            <Check aria-hidden className="h-4 w-4 text-emerald-600" />
            {filed.reusedExisting ? `Already ticketed — ${filed.ticketNumber}` : `Ticket ${filed.ticketNumber} opened`}
          </p>
          <p className={CAPTION}>Asking for: {QC_FAIL_REMEDY_LABEL[remedy]}</p>
          {filed.ticketUrl ? (
            <a
              href={filed.ticketUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 text-role-caption font-semibold text-mode-ink underline"
            >
              <ExternalLink aria-hidden className="h-3.5 w-3.5" />
              Open the ticket
            </a>
          ) : null}
        </div>
      ) : (
        <div className={PANEL}>
          <TabSwitch
            tabs={[
              { id: 'return', label: QC_FAIL_REMEDY_LABEL.return },
              { id: 'partial_refund', label: QC_FAIL_REMEDY_LABEL.partial_refund },
            ]}
            activeTab={remedy}
            onTabChange={(id) => setRemedy(id as QcFailRemedy)}
          />
          <p className={CAPTION} data-testid="qc-remedy-suggestion">
            Suggested: {QC_FAIL_REMEDY_LABEL[suggestion.remedy]} — {suggestion.why}
          </p>
          <TextField label="What failed" value={detail} onChange={setDetail} multiline rows={3} disabled={filing} />
          {receivingId == null ? (
            <p className={CAPTION}>This unit is not on a receiving carton — open the ticket from Support.</p>
          ) : null}
          <Button
            variant="primary"
            size="lg"
            className="w-full"
            icon={<Ticket />}
            loading={filing}
            disabled={receivingId == null}
            onClick={() => void file()}
            data-testid="qc-ticket-create"
          >
            Create ticket · {QC_FAIL_REMEDY_LABEL[remedy]}
          </Button>
        </div>
      )}
      {error ? (
        <p role="alert" className={ERROR}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
