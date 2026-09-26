'use client';

import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { RSRecord } from '@/lib/neon/repair-service-queries';
import { applyRepairInfoDraft, repairInfoPlan, type RepairInfoDraft } from '@/lib/repair/repair-info-edit';

type RepairInfoSaveResult = { error: string | null; saved: string[] };

/** The one information write: */
export function useRepairInfoSave(
  repair: RSRecord | null,
  setRepair: (row: RSRecord) => void,
  reload: () => Promise<RSRecord | null>,
) {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);

  const save = useCallback(
    async (draft: RepairInfoDraft): Promise<RepairInfoSaveResult> => {
      if (!repair || saving) return { error: null, saved: [] };
      const { writes, problem } = repairInfoPlan(repair.id, repair, draft);
      if (problem) return { error: `Not saved — ${problem}.`, saved: [] };
      if (writes.length === 0) return { error: null, saved: [] };
      const previous = repair;
      setSaving(true);
      setRepair(applyRepairInfoDraft(repair, draft));
      const saved: string[] = [];
      let customerRecordTouched = false;
      try {
        for (const write of writes) {
          const res = await fetch(write.url, {
            method: write.method,
            headers: write.body ? { 'Content-Type': 'application/json' } : undefined,
            body: write.body ? JSON.stringify(write.body) : undefined,
          });
          if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            throw new Error(`${write.label}: ${body?.error || `HTTP ${res.status}`}`);
          }
          saved.push(write.label);
          if (write.url.startsWith('/api/customers/')) customerRecordTouched = true;
        }
        await reload();
        return { error: null, saved };
      } catch (err) {
        setRepair(previous);
        // Re-read before reporting, so the message and the re-enabled form arrive together.
        if (saved.length) await reload();
        const reason = err instanceof Error ? err.message : 'Save failed';
        return {
          error: saved.length
            ? `Not all saved — ${reason}. Saved before the failure: ${saved.join(', ')}.`
            : `Not saved — ${reason}. The previous values are back.`,
          saved,
        };
      } finally {
        if (customerRecordTouched) {
          void queryClient.invalidateQueries({
            predicate: ({ queryKey }) =>
              queryKey[0] === 'repairs' &&
              queryKey[1] === 'workbench' &&
              queryKey[2] !== repair.id &&
              queryKey[3] === 'record',
          });
        }
        setSaving(false);
      }
    },
    [repair, saving, reload, setRepair, queryClient],
  );

  return { save, saving };
}
