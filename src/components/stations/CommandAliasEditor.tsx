'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { Plus, Printer, Trash2 } from '@/components/Icons';
import { Button, IconButton } from '@/design-system/primitives';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { FILTER_DROPDOWN_SELECT_CLASS } from '@/design-system/components/FilterDropdownSelect';
import { requestConfirm } from '@/design-system/components/confirm';
import { toast } from '@/lib/toast';
import { Gs1DataMatrix } from '@/components/barcode/Gs1DataMatrix';
import { printStationCommandLabel } from '@/lib/print/printStationCommandLabel';
import { listAliasTargets, validateAlias } from '@/lib/stations/command-alias-validate';
import { cn } from '@/utils/_cn';

/** Custom codes — a tenant's own scan strings for commands that already exist. */

interface AliasRow {
  id: number;
  code: string;
  target_code: string;
  label: string;
  sort_order: number;
}

const MATRIX_PX = 96;
const QK = ['station-command-aliases'] as const;

export function CommandAliasEditor() {
  const queryClient = useQueryClient();
  const targets = useMemo(() => listAliasTargets(), []);

  const [draft, setDraft] = useState({ code: '', targetCode: targets[0]?.code ?? '', label: '' });
  const [open, setOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: QK,
    queryFn: async () => {
      const res = await fetch('/api/station-commands/aliases');
      if (!res.ok) throw new Error('could not load custom codes');
      return (await res.json()) as { aliases: AliasRow[] };
    },
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: QK });

  const create = useMutation({
    mutationFn: async (input: typeof draft) => {
      const res = await fetch('/api/station-commands/aliases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || 'could not create custom code');
      return body;
    },
    onSuccess: () => {
      toast.success('Custom code added');
      setDraft({ code: '', targetCode: targets[0]?.code ?? '', label: '' });
      setOpen(false);
      void invalidate();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const retire = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/station-commands/aliases/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('could not retire custom code');
    },
    onSuccess: () => {
      toast.success('Custom code retired');
      void invalidate();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Validate with the SAME function the route uses, so the form can never
  // accept something the server will refuse.
  const validation = validateAlias(draft);
  const aliases = data?.aliases ?? [];

  return (
    <section className="mb-10">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-role-heading font-bold text-text-strong">Custom codes</h2>
          <p className="mt-1 text-role-caption text-text-soft">
            Your own name for a command that already exists — a sticker at bench 3
            that means Quality Control. A custom code cannot create new behaviour;
            it points at one of the codes above and does exactly what that code does.
          </p>
        </div>
        <Button
          variant="secondary"
          className="shrink-0 print:hidden"
          onClick={() => setOpen((v) => !v)}
        >
          <Plus className="h-4 w-4" />
          Add
        </Button>
      </div>

      {open ? (
        <div className="mt-3 flex flex-wrap items-end gap-3 border border-border-soft p-3 print:hidden">
          <label className="flex min-w-[12rem] flex-1 flex-col gap-1">
            <span className="text-role-caption font-semibold uppercase tracking-wider text-text-soft">
              Scan code
            </span>
            <input
              value={draft.code}
              onChange={(e) => setDraft((d) => ({ ...d, code: e.target.value.toUpperCase() }))}
              placeholder="CMD-GO-BENCH-3"
              className="h-9 border border-border-soft bg-surface-card px-2 font-mono text-role-body text-text-strong outline-none"
            />
          </label>
          <label className="flex min-w-[12rem] flex-1 flex-col gap-1">
            <span className="text-role-caption font-semibold uppercase tracking-wider text-text-soft">
              Means
            </span>
            <select
              value={draft.targetCode}
              onChange={(e) => setDraft((d) => ({ ...d, targetCode: e.target.value }))}
              className={cn(FILTER_DROPDOWN_SELECT_CLASS, 'h-9')}
            >
              {targets.map((t) => (
                <option key={t.code} value={t.code}>
                  {t.label} — {t.code}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-[10rem] flex-1 flex-col gap-1">
            <span className="text-role-caption font-semibold uppercase tracking-wider text-text-soft">
              Label
            </span>
            <input
              value={draft.label}
              onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))}
              placeholder="Bench 3"
              className="h-9 border border-border-soft bg-surface-card px-2 text-role-body text-text-strong outline-none"
            />
          </label>
          <Button
            variant="primary"
            disabled={!validation.ok || create.isPending}
            onClick={() => create.mutate(draft)}
          >
            Save
          </Button>
          {!validation.ok && (draft.code || draft.label) ? (
            <p className="w-full text-role-caption text-rose-700">{validation.error}</p>
          ) : null}
        </div>
      ) : null}

      {isLoading ? (
        <p className="mt-4 text-role-caption text-text-soft">Loading…</p>
      ) : aliases.length === 0 ? (
        <p className="mt-4 text-role-caption text-text-soft">
          No custom codes yet. Every built-in code above works without one.
        </p>
      ) : (
        <ul className="mt-3 border-t border-border-soft">
          {aliases.map((alias) => {
            const target = targets.find((t) => t.code === alias.target_code);
            return (
              <li
                key={alias.id}
                className="flex items-center justify-between gap-6 break-inside-avoid border-b border-border-soft py-4"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-role-body font-bold uppercase tracking-wide text-text-strong">
                    {alias.code}
                  </p>
                  <p className="mt-1 text-role-body font-semibold text-text-default">{alias.label}</p>
                  <p className="mt-0.5 text-role-caption text-text-soft">
                    Does the same as {target?.label ?? alias.target_code} ({alias.target_code})
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <div style={{ width: MATRIX_PX, height: MATRIX_PX }}>
                    <Gs1DataMatrix
                      value={alias.code}
                      symbology="datamatrix"
                      fill
                      quietZone={2}
                      ariaLabel={`${alias.label} barcode`}
                    />
                  </div>
                  <div className="flex flex-col gap-1 print:hidden">
                    <HoverTooltip label="Print 2×1 sticker">
                      <IconButton
                        ariaLabel="Print sticker"
                        icon={<Printer className="h-4 w-4" />}
                        onClick={() =>
                          printStationCommandLabel({ code: alias.code, label: alias.label })
                        }
                      />
                    </HoverTooltip>
                    <HoverTooltip label="Retire this code">
                      <IconButton
                        ariaLabel="Retire custom code"
                        icon={<Trash2 className="h-4 w-4" />}
                        onClick={() => {
                          void (async () => {
                            const confirmed = await requestConfirm({
                              title: `Retire ${alias.code}?`,
                              // Retire, not delete:
                              description:
                                'Stickers already printed will stop working. The code is kept so it can be recognised as retired.',
                              confirmLabel: 'Retire',
                              tone: 'danger',
                            });
                            if (confirmed) retire.mutate(alias.id);
                          })();
                        }}
                      />
                    </HoverTooltip>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
