'use client';

/** The REPAIR RECORD — the one record the Repair Service desk (`RepairTable`: */

import type { ReactNode } from 'react';
import type { RSRecord } from '@/lib/neon/repair-service-queries';
import { DeskRecordLayout } from '@/design-system/components/DeskRecordPlane';
import { ModeRegion } from '@/design-system/providers/ModeRegion';
import { EvidenceFactRow } from '@/design-system/components/record-ledger/EvidenceDisclosure';
import { EVIDENCE_CONTROL_CLASS, evidenceVerbClass } from '@/design-system/components/record-ledger/RecordEvidence';
import { RECORD_ID_CLASS, RECORD_LABEL_CLASS, RECORD_PRICE_CLASS } from '@/design-system/tokens/industrial-record';
import { repairStatusOperatorLabel } from '@/lib/repair-status';
import { repairPriceDisplay } from '@/lib/tables/field-catalog/repair-resolve';
import { resolveSkuIdentityTitle } from '@/lib/sku/sku-identity-law';
import { formatMonthDayTimePST } from '@/utils/date';
import { cn } from '@/utils/_cn';
import { useRepairDetailsPanel, type RepairDetailsController } from './details-panel/useRepairDetailsPanel';
import { RepairStatusStrip } from './RepairRecordStatus';
import { CustomerFacts, LinkFacts, REPAIR_RECORD_COLUMN_CLASS, TicketFact } from './repair-record-sections';

// ── Center: the item under repair ──────────────────────────────────────────

function RepairItem({ repair }: { repair: RSRecord }) {
  const sku = String(repair.source_sku ?? '').trim() || null;
  const serial = String(repair.serial_number ?? '').trim() || null;
  const order = String(repair.source_order_id ?? '').trim() || null;
  const title = resolveSkuIdentityTitle({ item_name: repair.product_title, sku }) || 'Unnamed device';
  const price = repairPriceDisplay(repair);
  return (
    <article data-testid="repair-record-item" aria-label={title} className="border-b border-mode-ink">
      <div className="flex flex-col gap-1 p-4">
        <p className="text-role-body font-bold">{title}</p>
        <p className={cn(RECORD_LABEL_CLASS, 'flex flex-wrap items-baseline gap-x-4 text-mode-muted')}>
          <span>
            SKU <span className={cn(RECORD_ID_CLASS, 'normal-case tracking-normal', sku ? 'text-mode-ink' : 'text-mode-warn')}>{sku ?? 'none'}</span>
          </span>
          <span>
            Serial{' '}
            <span className={cn(RECORD_ID_CLASS, 'select-all normal-case tracking-normal', serial ? 'text-mode-ink' : 'text-mode-warn')}>
              {serial ?? 'none'}
            </span>
          </span>
          <span>
            Order <span className={cn(RECORD_ID_CLASS, 'normal-case tracking-normal text-mode-ink')}>{order ?? 'Walk-in'}</span>
          </span>
          <span>
            Price{' '}
            <span className={cn(price ? RECORD_PRICE_CLASS : RECORD_ID_CLASS, 'normal-case tracking-normal', !price && 'text-mode-warn')}>
              {price ?? 'not set'}
            </span>
          </span>
        </p>
      </div>
      <div className="flex flex-col px-4">
        <EvidenceFactRow label="Reported issue" wide>
          <span className="block whitespace-pre-line break-words">{repair.issue?.trim() || 'No issue described'}</span>
        </EvidenceFactRow>
      </div>
    </article>
  );
}

/** Repair notes — the row's `notes`, edited in place; Save writes the existing PATCH. */
function RepairNotes({ repair, c }: { repair: RSRecord; c: RepairDetailsController }) {
  const saved = repair.notes || '';
  const dirty = c.notes !== saved;
  return (
    <section aria-label="Repair notes" className="border-t border-mode-edge px-4 py-3" data-testid="repair-record-notes">
      <label className="flex flex-col gap-1.5">
        <span className={cn(RECORD_LABEL_CLASS, 'text-mode-muted')}>Repair notes</span>
        <textarea
          value={c.notes}
          onChange={(event) => c.setNotes(event.target.value)}
          rows={4}
          placeholder="Diagnosis, parts used, what was done…"
          disabled={c.isSaving}
          className={cn(EVIDENCE_CONTROL_CLASS, 'w-full resize-y py-1.5')}
        />
      </label>
      {dirty ? (
        <div className="mt-2 flex justify-end gap-1.5">
          <button type="button" className={evidenceVerbClass()} disabled={c.isSaving} onClick={() => c.setNotes(saved)}>
            Revert
          </button>
          <button
            type="button"
            className={evidenceVerbClass(true)}
            disabled={c.isSaving}
            data-testid="repair-record-notes-save"
            onClick={() => void c.handleSaveNotes()}
          >
            {c.isSaving ? 'Saving…' : 'Save notes'}
          </button>
        </div>
      ) : null}
    </section>
  );
}

function RepairHistory({ repair }: { repair: RSRecord }) {
  const history = [...(repair.status_history ?? [])].reverse();
  return (
    <section aria-label="Status history" className="px-4 py-3" data-testid="repair-record-history">
      <p className={cn(RECORD_LABEL_CLASS, 'mb-1.5 text-mode-muted')}>Status history</p>
      {history.length === 0 ? (
        <p className="text-role-data text-mode-muted">No status changes recorded.</p>
      ) : (
        <ol className="flex flex-col">
          {history.map((entry, index) => (
            <li key={`${entry.timestamp}-${index}`} className="flex items-baseline gap-3 border-b border-mode-rule py-1.5 last:border-b-0">
              <span className="min-w-0 flex-1 text-role-data text-mode-ink">
                {entry.previous_status ? (
                  <span className="text-mode-muted">{repairStatusOperatorLabel(entry.previous_status)} → </span>
                ) : null}
                <span className="font-bold">{repairStatusOperatorLabel(entry.status)}</span>
                {entry.user_name ? <span className="text-mode-muted"> · {entry.user_name}</span> : null}
              </span>
              <time className={cn(RECORD_ID_CLASS, 'shrink-0 text-mode-muted')}>{formatMonthDayTimePST(entry.timestamp)}</time>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

interface RepairRecordViewProps {
  repair: RSRecord;
  /** Refetch the queue after a write. */
  onUpdate: () => void;
}

export function RepairRecordView({ repair, onUpdate }: RepairRecordViewProps) {
  const c = useRepairDetailsPanel({ repair, onUpdate });

  const main: ReactNode = (
    <div className={REPAIR_RECORD_COLUMN_CLASS}>
      <RepairItem repair={repair} />
      <RepairHistory repair={repair} />
    </div>
  );

  const aside: ReactNode = (
    <div className={REPAIR_RECORD_COLUMN_CLASS}>
      <div className="flex flex-col border-b border-mode-ink px-4">
        <TicketFact repair={repair} />
      </div>
      <CustomerFacts repair={repair} />
      <LinkFacts repair={repair} zendeskUrl={c.zendeskTicketUrl} />
      <RepairNotes repair={repair} c={c} />
    </div>
  );

  return (
    <ModeRegion mode="triage" className="flex-1 bg-mode-canvas p-4 text-mode-ink" data-testid="repair-record-view">
      <RepairStatusStrip repair={repair} zendeskUrl={c.zendeskTicketUrl} />
      <DeskRecordLayout main={main} aside={aside} />
    </ModeRegion>
  );
}
