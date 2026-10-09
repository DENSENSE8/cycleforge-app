'use client';

/** PreboxWizard — serial checklist → one master kit label or one label per unit (serial↔label pairing plan §6.4.C). */

import { useState } from 'react';
import { toast } from '@/lib/toast';
import { Check } from '@/components/Icons';
import { Button, FloatingActionFooter } from '@/design-system/primitives';
import { SearchableSelectField } from '@/design-system/components';
import { getLast8 } from '@/components/ui/CopyChip';
import { printProductLabels } from '@/lib/print/printProductLabel';
import { printManifestLabel } from '@/lib/print/printManifestLabel';

export interface PreboxWizardSerial {
  id: number;
  serial_number: string;
  unit_uid?: string | null;
  sku?: string | null;
}

type PreboxMode = 'master' | 'per-unit';

const PREBOX_MODE_OPTIONS = [
  { value: 'master', label: 'One master label' },
  { value: 'per-unit', label: 'One label per unit' },
];

/** Flush body for the Unbox Displays › Prebox leaf. */
export function PreboxWizard({
  serials,
  sku,
}: {
  serials: PreboxWizardSerial[];
  /** Kit SKU when the units are homogeneous; null for a mixed kit. */
  sku?: string | null;
}) {
  const [checked, setChecked] = useState<Set<number>>(() => new Set(serials.map((s) => s.id)));
  const [mode, setMode] = useState<PreboxMode>('master');
  const [busy, setBusy] = useState(false);

  const chosen = serials.filter((s) => checked.has(s.id));

  const toggle = (id: number) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const run = async () => {
    if (chosen.length === 0 || busy) return;
    setBusy(true);
    try {
      if (mode === 'master') {
        const res = await fetch('/api/label-manifests', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            manifestType: 'PREBOX',
            sku: sku ?? null,
            serialUnitIds: chosen.map((s) => s.id),
          }),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.ok) {
          toast.error(json?.error || `Create failed (${res.status})`);
          return;
        }
        const manifestId = json.manifest.id as number;
        const conflicts: number[] = json.conflicts ?? [];
        const sealRes = await fetch(`/api/label-manifests/${manifestId}/seal`, { method: 'POST' });
        const sealJson = await sealRes.json().catch(() => null);
        if (!sealRes.ok || !sealJson?.ok) {
          toast.error(sealJson?.error || `Seal failed (${sealRes.status})`);
          return;
        }
        printManifestLabel({
          manifestUid: sealJson.manifest_uid,
          unitCount: chosen.length - conflicts.length,
          sku: sku ?? null,
        });
        toast.success(`Sealed ${sealJson.manifest_uid} — printing master label`, {
          description: conflicts.length ? `${conflicts.length} unit(s) skipped (already in a kit)` : undefined,
        });
      } else {
        // Group by the unit's own SKU so a MIXED carton prints correct per-SKU
        // labels (each unit keeps its own unit_uid as the QR payload).
        const bySku = new Map<string, PreboxWizardSerial[]>();
        for (const s of chosen) {
          const k = (s.sku || sku || '').trim();
          if (!k) continue;
          const arr = bySku.get(k) ?? [];
          arr.push(s);
          bySku.set(k, arr);
        }
        for (const [k, group] of bySku) {
          printProductLabels({
            sku: k,
            serialNumbers: group.map((g) => g.serial_number),
            qrPayloads: group.map((g) => g.unit_uid ?? undefined),
          });
        }
        const jobs = chosen
          .filter((s) => s.unit_uid)
          .map((s) => ({
            jobType: 'UNIT' as const,
            serialUnitId: s.id,
            unitUid: s.unit_uid as string,
            qrPayload: s.unit_uid as string,
            templateId: 'product' as const,
          }));
        if (jobs.length) {
          void fetch('/api/label-print-jobs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jobs }),
          }).catch(() => {});
        }
        toast.success(`Printing ${chosen.length} unit label${chosen.length === 1 ? '' : 's'}`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Print failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col" data-prebox-wizard>
      {/* Mode — child combobox under the Prebox leaf: the house child-mode
          face (claim Create|Link), not a segment twin. */}
      <div className="shrink-0">
        <SearchableSelectField
          appearance="flush"
          value={mode}
          onChange={(id) => {
            if (id == null) return;
            setMode(id as PreboxMode);
          }}
          options={PREBOX_MODE_OPTIONS}
          placeholder="Pick a label mode…"
          searchPlaceholder="Type to filter…"
          emptyMessage="No modes match"
          ariaLabel="Prebox label mode"
        />
      </div>

      {/* Serial checklist — full-bleed hairline rows; column owns scroll. */}
      <div className="min-h-0 flex-1 overflow-y-auto text-role-data">
        {serials.length === 0 ? (
          <div className="border-y border-dashed border-border-hairline py-5 text-center text-role-caption text-text-muted">
            No serialized units to prebox.
          </div>
        ) : (
          <ul className="divide-y divide-border-hairline border-b border-border-hairline">
            {serials.map((s) => {
              const on = checked.has(s.id);
              const unitUid = String(s.unit_uid ?? '').trim();
              return (
                <li key={s.id}>
                  {/* ds-raw-button: full-bleed select row — Micro never mounts a primary Button here */}
                  <button
                    type="button"
                    onClick={() => toggle(s.id)}
                    aria-pressed={on}
                    className={`ds-raw-button flex h-11 w-full min-w-0 items-stretch divide-x divide-border-hairline text-left transition-colors ${
                      on ? 'bg-surface-sunken' : 'hover:bg-surface-hover'
                    }`}
                  >
                    <span
                      aria-hidden
                      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-none ${
                        on ? 'bg-blue-500 text-white' : 'bg-transparent text-text-faint'
                      }`}
                    >
                      {on ? (
                        <Check className="h-4 w-4" />
                      ) : (
                        <span className="h-4 w-4 ring-1 ring-inset ring-border-soft" />
                      )}
                    </span>
                    <span className="flex min-w-0 flex-1 items-center truncate px-2.5 font-mono text-role-caption font-semibold text-text-default">
                      {s.serial_number}
                    </span>
                    <span className="ml-auto flex shrink-0 items-center pr-2.5 font-mono text-role-micro tabular-nums text-text-soft">
                      {unitUid ? `# ${getLast8(unitUid)}` : 'not labeled'}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Floating action floor — always mounted (disabled when nothing selected). */}
      <FloatingActionFooter
        layout="cluster"
        leading={
          <span className="flex min-h-9 min-w-0 flex-1 items-center bg-surface-sunken px-3 text-role-eyebrow font-semibold text-text-muted">
            {chosen.length} selected
          </span>
        }
      >
        <Button
          size="md"
          variant="primary"
          disabled={busy || chosen.length === 0}
          loading={busy}
          onClick={() => void run()}
          icon={busy ? undefined : <Check className="h-3.5 w-3.5" />}
        >
          {mode === 'master' ? 'Seal + print master' : 'Print unit labels'}
        </Button>
      </FloatingActionFooter>
    </div>
  );
}
