'use client';

/**
 * The open record's listing rule — item # (+ SKU) → who picks and who packs,
 * each with a backup used when the primary is out that day. Reads the rule
 * that keys this order (`GET /api/automations/listing-assign`, the exact
 * pair first, then the item-#-only rule) and saves through the same
 * `save_and_assign` waist as the bulk Listing → staff card, so every painted
 * order sharing the pair is assigned now and future imports follow the rule.
 */

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ShippedOrder } from '@/lib/neon/orders-queries';
import type {
  ListingAssignOrderResult,
  ListingRuleSummary,
} from '@/lib/automations/listing-assign-from-orders';
import { normalizeItemNumber, normalizeSku } from '@/lib/automations/listing-match';
import { refreshDomain } from '@/lib/refresh/bus';
import { safeRandomUUID } from '@/lib/safe-uuid';
import { Button } from '@/design-system/primitives/Button';
import { EvidenceFactRow } from '@/design-system/components/record-ledger/EvidenceDisclosure';
import { RECORD_ID_CLASS, RECORD_LABEL_CLASS } from '@/design-system/tokens/industrial-record';
import { STATE_TONE_CLASSES } from '@/design-system/tokens/lifecycle';
import { cn } from '@/utils/_cn';
import { OrderAutoAssignSlot } from './OrderAutoAssignSlot';

type SlotKey = 'techId' | 'backupTechId' | 'packerId' | 'backupPackerId';
type Slot = { id: number; name: string | null } | null;
type Slots = Record<SlotKey, Slot>;

const SLOTS: ReadonlyArray<{ key: SlotKey; label: string; role: 'technician' | 'packer'; primary?: SlotKey }> = [
  { key: 'techId', label: 'Picker', role: 'technician' },
  { key: 'backupTechId', label: 'Backup picker', role: 'technician', primary: 'techId' },
  { key: 'packerId', label: 'Packer', role: 'packer' },
  { key: 'backupPackerId', label: 'Backup packer', role: 'packer', primary: 'packerId' },
];

/** At most this many orders per save — the route's `orderIds` ceiling. */
const MAX_ORDER_IDS = 200;

type SaveResponse = { success?: boolean; error?: string; orderResults?: ListingAssignOrderResult[] };

function slotsFromRule(rule: ListingRuleSummary | null): Slots {
  const slot = (id: number | null): Slot => (id && id > 0 ? { id, name: null } : null);
  return {
    techId: slot(rule?.techId ?? null),
    backupTechId: slot(rule?.backupTechId ?? null),
    packerId: slot(rule?.packerId ?? null),
    backupPackerId: slot(rule?.backupPackerId ?? null),
  };
}

/** What the save did, in the floor's words — `3 assigned · 1 via backup`. */
function saveOutcome(body: SaveResponse): { text: string; failed: boolean } {
  const results = body.orderResults ?? [];
  const assigned = results.filter((r) => r.status === 'assigned');
  const failed = results.filter((r) => r.status === 'failed');
  const viaBackup = assigned.filter(
    (r) => r.assigned?.TEST?.via === 'backup' || r.assigned?.PACK?.via === 'backup',
  ).length;
  const parts = [`Saved · ${assigned.length} assigned`];
  if (viaBackup > 0) parts.push(`${viaBackup} via backup`);
  if (failed.length > 0) parts.push(`${failed.length} failed${failed[0]?.reason ? ` (${failed[0].reason})` : ''}`);
  return { text: parts.join(' · '), failed: failed.length > 0 };
}

export function OrderAutoAssignRule({
  record,
  records,
  getStaffName,
}: {
  record: ShippedOrder;
  /** The painted queue — every order sharing this pair is assigned on save. */
  records: readonly ShippedOrder[];
  getStaffName: (id: number) => string;
}) {
  const queryClient = useQueryClient();
  const orderId = Number(record.id);
  const itemNumber = normalizeItemNumber(record.item_number);
  const sku = normalizeSku(record.sku);
  const ruleKey = ['listing-assign-rule', itemNumber, sku] as const;

  const ruleQuery = useQuery({
    queryKey: ruleKey,
    queryFn: async (): Promise<ListingRuleSummary | null> => {
      const res = await fetch(`/api/automations/listing-assign?orderIds=${orderId}`, {
        credentials: 'same-origin',
      });
      const body = (await res.json().catch(() => null)) as {
        success?: boolean;
        error?: string;
        listings?: Array<{ rule?: ListingRuleSummary | null }>;
      } | null;
      if (!res.ok || !body?.success) throw new Error(body?.error || `Could not read the rule (${res.status})`);
      return body.listings?.[0]?.rule ?? null;
    },
    enabled: Number.isFinite(orderId) && orderId > 0 && itemNumber.length > 0,
    staleTime: 30_000,
  });

  const saved = slotsFromRule(ruleQuery.data ?? null);
  // null = untouched: the face follows the saved rule until the operator edits.
  const [draft, setDraft] = useState<Slots | null>(null);
  const [outcome, setOutcome] = useState<{ text: string; failed: boolean } | null>(null);
  const slots = draft ?? saved;
  const dirty = draft != null && SLOTS.some(({ key }) => (draft[key]?.id ?? null) !== (saved[key]?.id ?? null));

  const clash =
    slots.techId && slots.backupTechId?.id === slots.techId.id
      ? 'Backup picker must differ from the picker.'
      : slots.packerId && slots.backupPackerId?.id === slots.packerId.id
        ? 'Backup packer must differ from the packer.'
        : null;

  const save = useMutation({
    mutationFn: async (next: Slots): Promise<SaveResponse> => {
      const ids = new Set<number>([orderId]);
      for (const row of records) {
        if (ids.size >= MAX_ORDER_IDS) break;
        const id = Number(row.id);
        if (!Number.isFinite(id) || id <= 0) continue;
        if (normalizeItemNumber(row.item_number) !== itemNumber) continue;
        if (normalizeSku(row.sku) !== sku) continue;
        ids.add(id);
      }
      const res = await fetch('/api/automations/listing-assign', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderIds: [...ids],
          mode: 'save_and_assign',
          techId: next.techId?.id ?? null,
          packerId: next.packerId?.id ?? null,
          backupTechId: next.backupTechId?.id ?? null,
          backupPackerId: next.backupPackerId?.id ?? null,
          idempotencyKey: safeRandomUUID(),
        }),
      });
      const body = (await res.json().catch(() => null)) as SaveResponse | null;
      if (!res.ok || !body?.success) throw new Error(body?.error || `Could not save the rule (${res.status})`);
      return body;
    },
    onSuccess: (body, next) => {
      setOutcome(saveOutcome(body));
      // Paint what was saved while the refetch confirms it — no flash of the old rule.
      queryClient.setQueryData<ListingRuleSummary | null>(ruleKey, (prev) => ({
        id: prev?.id ?? 0,
        techId: next.techId?.id ?? null,
        backupTechId: next.backupTechId?.id ?? null,
        packerId: next.packerId?.id ?? null,
        backupPackerId: next.backupPackerId?.id ?? null,
      }));
      setDraft(null);
      void queryClient.invalidateQueries({ queryKey: ruleKey });
      // The Pick / Pack cells read the queue rows — the same refresh the bulk card fires.
      refreshDomain('orders.outbound');
    },
  });

  if (!itemNumber) return null;

  const commitSlot = (key: SlotKey, staffId: number | null, staffName: string | null) => {
    setOutcome(null);
    save.reset();
    setDraft((prev) => ({ ...(prev ?? saved), [key]: staffId ? { id: staffId, name: staffName } : null }));
  };

  const canSave = Boolean(slots.techId && slots.packerId) && dirty && !clash && !save.isPending;
  const error = clash ?? (save.isError ? save.error.message : null) ?? (ruleQuery.isError ? ruleQuery.error.message : null);
  const status = ruleQuery.isPending ? '…' : ruleQuery.isError ? 'Unreadable' : ruleQuery.data ? 'Rule on' : 'No rule';

  return (
    <div data-testid="evidence-auto-assign">
      <div className="flex min-w-0 items-center gap-2 border-b border-mode-edge py-2">
        <span className={cn(RECORD_LABEL_CLASS, 'w-24 shrink-0 text-mode-muted')}>Auto-assign</span>
        <span className={cn(RECORD_LABEL_CLASS, 'min-w-0 flex-1 truncate text-mode-muted')} title={`Item ${itemNumber}`}>
          SKU{' '}
          <span className={cn(RECORD_ID_CLASS, 'normal-case tracking-normal', sku ? 'text-mode-ink' : 'text-mode-muted')}>
            {sku || 'any'}
          </span>
        </span>
        <span
          className={cn(
            RECORD_LABEL_CLASS,
            'shrink-0',
            ruleQuery.isError ? 'text-mode-warn' : ruleQuery.data ? 'text-mode-ink' : 'text-mode-muted',
          )}
        >
          {status}
        </span>
      </div>
      {SLOTS.map(({ key, label, role, primary }) => {
        const value = slots[key];
        return (
          <EvidenceFactRow key={key} label={label}>
            <OrderAutoAssignSlot
              label={label}
              role={role}
              staffId={value?.id ?? null}
              name={value ? value.name || getStaffName(value.id) : null}
              invalid={Boolean(primary && value && slots[primary]?.id === value.id)}
              disabled={ruleQuery.isPending || save.isPending}
              onCommit={(staffId, staffName) => commitSlot(key, staffId, staffName)}
            />
          </EvidenceFactRow>
        );
      })}
      <div className="flex min-w-0 items-center gap-2 border-b border-mode-edge py-2">
        <span
          role={error ? 'alert' : undefined}
          className={cn(
            'min-w-0 flex-1 text-role-caption',
            error || outcome?.failed ? STATE_TONE_CLASSES.danger.text : 'text-mode-muted',
          )}
        >
          {error ?? outcome?.text ?? (dirty ? 'Unsaved' : 'Backup takes over when the primary is out.')}
        </span>
        <Button
          type="button"
          size="sm"
          variant="ink"
          radius="flush"
          data-testid="evidence-auto-assign-save"
          disabled={!canSave}
          loading={save.isPending}
          onClick={() => {
            if (draft) save.mutate(draft);
          }}
        >
          Save rule
        </Button>
      </div>
    </div>
  );
}
