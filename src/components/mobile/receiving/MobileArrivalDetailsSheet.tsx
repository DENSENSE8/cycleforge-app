'use client';

/**
 * Arrival list selection sheet — Platform · Type · Priority editable in one
 * bottom sheet (not the stepped post-photo classify wizard). Persist mirrors
 * desktop / {@link MobileArrivalClassifyFlow}: PATCH receiving for platform/type,
 * receiving-logs for priority_tier.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import { BottomSheet } from '@/components/ui/BottomSheet';
import {
  platformClassifyOptions,
  typeClassifyOptions,
  urgencyClassifyOptions,
} from '@/components/receiving/workspace/line-edit/classify-pill-options';
import { usePlatformCatalog, useReceivingTypeCatalog } from '@/hooks/useCatalog';
import { returnPlatformForSource } from '@/lib/receiving/return-platform-for-source';
import { invalidateReceivingFeeds } from '@/lib/queries/receiving-queries';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import type { InlinePillOption } from '@/components/receiving/workspace/line-edit/InlinePillPicker';
import { getLast8 } from '@/lib/copy-chip-format';
import { cn } from '@/utils/_cn';

function effectiveIntakeType(row: ReceivingLineRow): string {
  const raw = row.receiving_type ?? row.carton_intake_type ?? row.intake_type ?? 'PO';
  return String(raw || 'PO').toUpperCase();
}

function priorityValue(tier: number | null | undefined): string {
  return tier == null || !Number.isFinite(tier) ? 'auto' : String(tier);
}

function OptionGrid({
  options,
  selected,
  saving,
  onPick,
}: {
  options: InlinePillOption[];
  selected: string;
  saving: boolean;
  onPick: (value: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {options.map((opt) => {
        const active =
          (opt.value || '').toLowerCase() === (selected || '').toLowerCase() ||
          (opt.value === 'auto' && selected === 'auto');
        return (
          // ds-allow-title — option face shows the short label; title is the longer hint.
          <button
            key={opt.value || opt.label}
            type="button"
            disabled={saving}
            onClick={() => onPick(opt.value)}
            title={opt.title}
            className={cn(
              'ds-raw-button flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl border px-2 py-3 text-center transition-all active:scale-[0.98] disabled:opacity-50',
              active ? opt.activeClass ?? 'border-blue-300 bg-blue-50 text-blue-800 shadow-sm' : opt.inactiveClass,
            )}
            style={active ? opt.activeStyle : opt.inactiveStyle}
          >
            <span className="flex h-6 items-center justify-center">{opt.face}</span>
            <span className="text-role-caption font-semibold">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function MobileArrivalDetailsSheet({
  row,
  open,
  onClose,
}: {
  row: ReceivingLineRow | null;
  open: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { options: platformOpts } = usePlatformCatalog();
  const { options: typeOpts } = useReceivingTypeCatalog();
  const [saving, setSaving] = useState(false);
  const [platform, setPlatform] = useState('');
  const [intakeType, setIntakeType] = useState('PO');
  const [priority, setPriority] = useState('auto');

  const receivingId = row?.receiving_id ?? null;

  useEffect(() => {
    if (!row) return;
    setPlatform((row.source_platform || '').trim());
    setIntakeType(effectiveIntakeType(row));
    setPriority(priorityValue(row.priority_tier));
  }, [row]);

  const platformOptions = useMemo(
    () =>
      platformClassifyOptions({
        catalogOptions: platformOpts,
        isUnmatched: row?.receiving_source === 'unmatched',
      }).filter((o) => o.value !== ''),
    [platformOpts, row?.receiving_source],
  );

  const typeOptions = useMemo(
    () => typeClassifyOptions({ catalogOptions: typeOpts }),
    [typeOpts],
  );

  const priorityOptions = useMemo(
    () =>
      urgencyClassifyOptions({
        derivedLabel: 'platform',
        derivedTierEquivalent: null,
        autoActiveClass:
          'border-slate-200 bg-slate-50 text-slate-700 shadow-sm', // ds-allow-raw-neutral: Auto face
      }),
    [],
  );

  const afterSave = useCallback(() => {
    invalidateReceivingFeeds(queryClient);
  }, [queryClient]);

  const persistPlatform = useCallback(
    async (value: string) => {
      if (receivingId == null) return;
      setSaving(true);
      try {
        const payload: Record<string, unknown> = {
          source_platform: value || null,
        };
        if (intakeType === 'RETURN' && value) {
          const rp = returnPlatformForSource(value);
          if (rp) {
            payload.return_platform = rp;
            payload.is_return = true;
          }
        }
        const res = await fetch(`/api/receiving/${receivingId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          toast.error('Could not save platform');
          return;
        }
        setPlatform(value);
        afterSave();
      } catch {
        toast.error('Could not save platform');
      } finally {
        setSaving(false);
      }
    },
    [receivingId, intakeType, afterSave],
  );

  const persistType = useCallback(
    async (value: string) => {
      if (receivingId == null) return;
      setSaving(true);
      try {
        const norm = (value || 'PO').toUpperCase();
        const payload: Record<string, unknown> = {
          intake_type: norm,
          is_return: norm === 'RETURN',
        };
        if (norm === 'RETURN' && platform) {
          const rp = returnPlatformForSource(platform);
          if (rp) payload.return_platform = rp;
        }
        const res = await fetch(`/api/receiving/${receivingId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          toast.error('Could not save type');
          return;
        }
        setIntakeType(norm);
        afterSave();
      } catch {
        toast.error('Could not save type');
      } finally {
        setSaving(false);
      }
    },
    [receivingId, platform, afterSave],
  );

  const persistPriority = useCallback(
    async (raw: string) => {
      if (receivingId == null) return;
      setSaving(true);
      try {
        const next = raw === 'auto' ? null : Number(raw);
        if (raw !== 'auto' && !Number.isFinite(next)) {
          toast.error('Invalid priority');
          return;
        }
        const res = await fetch('/api/receiving-logs', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: receivingId, priority_tier: next }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data?.success) {
          toast.error(data?.error || 'Could not save priority');
          return;
        }
        setPriority(raw);
        afterSave();
      } catch {
        toast.error('Could not save priority');
      } finally {
        setSaving(false);
      }
    },
    [receivingId, afterSave],
  );

  if (!row || receivingId == null) return null;

  const tracking = (row.tracking_number || '').trim();
  const title = tracking ? getLast8(tracking) : `RCV-${receivingId}`;

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Arrival details"
      forceVariant="sheet"
      dragDisabled={saving}
      maxWidth="32rem"
    >
      <div className="space-y-5 px-1 pb-2">
        <p className="text-role-caption text-text-muted">
          <span className="font-semibold text-text-default">{title}</span>
          {tracking && tracking !== title ? (
            <span className="ml-2 font-mono text-text-soft">{tracking}</span>
          ) : null}
        </p>

        <section className="space-y-2">
          <h3 className="text-role-micro font-semibold uppercase tracking-widest text-text-muted">
            Platform
          </h3>
          <OptionGrid
            options={platformOptions}
            selected={platform}
            saving={saving}
            onPick={(v) => void persistPlatform(v)}
          />
        </section>

        <section className="space-y-2">
          <h3 className="text-role-micro font-semibold uppercase tracking-widest text-text-muted">
            Type
          </h3>
          <OptionGrid
            options={typeOptions}
            selected={intakeType}
            saving={saving}
            onPick={(v) => void persistType(v)}
          />
        </section>

        <section className="space-y-2">
          <h3 className="text-role-micro font-semibold uppercase tracking-widest text-text-muted">
            Priority
          </h3>
          <OptionGrid
            options={priorityOptions}
            selected={priority}
            saving={saving}
            onPick={(v) => void persistPriority(v)}
          />
        </section>
      </div>
    </BottomSheet>
  );
}
