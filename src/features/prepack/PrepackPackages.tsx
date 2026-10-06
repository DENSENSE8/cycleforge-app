'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, Pencil, Plus, X } from '@/components/Icons';
import { ProductLabelEditPopover } from '@/components/labels/ProductLabelEditPopover';
import { Collapse, CollapseItem } from '@/design-system/components/Collapse';
import { TabSwitch } from '@/design-system/components/TabSwitch';
import { AnimatePresence } from '@/design-system/motion';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/design-system/primitives';
import {
  PREPACK_CONDITIONS,
  PREPACK_CONDITION_LABEL,
  PREPACK_PROVENANCES,
  PREPACK_PROVENANCE_LABEL,
  parsePrepackCondition,
  type PrepackCatalogChoice,
  type PrepackCondition,
} from '@/lib/prepack/types';
import { qcLabelFaceInput } from '@/lib/print/printQcLabel';
import { productLabelFace } from '@/lib/print/unitLabelCore';
import { previewPrintUnit } from './PrepackContext';
import { FIELD_LABEL_CLASS, PrepackGroup, QuantityField } from './PrepackSections';
import type { PrepackSerialEntry, PrepackSerialEntryProps } from './serial-entry';
import type { PrepackForm } from './usePrepackForm';

/** Five equal cells; the selection is TabSwitch's sliding face, so choosing never shifts layout. */
const CONDITION_TABS = PREPACK_CONDITIONS.map((id) => ({ id, label: PREPACK_CONDITION_LABEL[id], testId: `prepack-condition-${id.toLowerCase()}` }));

/** Labels to print, then one row per package: serials (each entry with its own phone icon), condition, More, Edit label. */
export function PackagesGroup({
  form,
  catalog,
  SerialEntry,
  phoneFor,
}: {
  form: PrepackForm;
  catalog: PrepackCatalogChoice;
  SerialEntry: PrepackSerialEntry;
  /** The phone handoff aimed at one package row. */
  phoneFor: (index: number) => PrepackSerialEntryProps['phone'];
}) {
  const locked = Boolean(form.state.saved);
  const count = form.state.packages.length;
  return (
    <PrepackGroup
      title="Packages"
      hint={`One label per package — ${count === 1 ? '1 package' : `${count} packages`}. Each has its own condition and serials.`}
      testId="prepack-packages-section"
    >
      <QuantityField form={form} />
      <ul className="space-y-3">
        <AnimatePresence initial={false}>
          {form.state.packages.map((pkg, index) => (
            <CollapseItem key={pkg.key} as="li" data-testid="prepack-package-row">
              <PackageRow form={form} index={index} locked={locked} catalog={catalog} SerialEntry={SerialEntry} phone={phoneFor(index)} />
            </CollapseItem>
          ))}
        </AnimatePresence>
      </ul>
    </PrepackGroup>
  );
}

function PackageRow({
  form,
  index,
  locked,
  catalog,
  SerialEntry,
  phone,
}: {
  form: PrepackForm;
  index: number;
  locked: boolean;
  catalog: PrepackCatalogChoice;
  SerialEntry: PrepackSerialEntry;
  phone: PrepackSerialEntryProps['phone'];
}) {
  const pkg = form.state.packages[index]!;
  const [adding, setAdding] = useState(false);
  const [rowError, setRowError] = useState<string | null>(null);
  const [more, setMore] = useState(pkg.provenance !== 'NONE');
  const [editing, setEditing] = useState(false);
  const matrix = useMemo(
    () => productLabelFace(qcLabelFaceInput(previewPrintUnit(pkg, catalog)))?.matrix ?? null,
    [catalog, pkg],
  );
  const custom = [pkg.label.title ? `Title “${pkg.label.title}”` : null, pkg.label.text ? `“${pkg.label.text}”` : null, pkg.label.color]
    .filter(Boolean)
    .join(' · ');

  const add = async (raw: string) => {
    const refusal = await form.addSerialToPackage(index, raw);
    setRowError(refusal);
    if (!refusal) setAdding(false);
  };

  return (
    <div className="space-y-3 rounded-mode-control border border-mode-rule bg-surface-card p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-mode-ink">Package {index + 1}</span>
        {pkg.serials.map((serial) => (
          <span key={serial} className="inline-flex items-center gap-1 rounded-full bg-surface-sunken py-0.5 pl-2.5 pr-0.5 font-mono text-role-caption text-mode-ink" data-testid="prepack-serial-chip">
            {serial}
            <Button
              variant="ghost"
              size="sm"
              radius="pill"
              icon={<X />}
              ariaLabel={`Remove ${serial}`}
              disabled={locked}
              onClick={() => form.removeSerial(index, serial)}
            />
          </span>
        ))}
        {pkg.serials.length === 0 ? <span className="text-role-caption text-text-muted">No serial · U- handle</span> : null}
        {locked ? null : (
          <Button variant="ghost" size="sm" icon={<Plus />} onClick={() => setAdding((current) => !current)} aria-expanded={adding} data-testid="prepack-add-serial">
            Add serial
          </Button>
        )}
      </div>
      <Collapse open={adding || phone.waiting}>
        <SerialEntry
          label={`Serial for package ${index + 1}`}
          autoFocus={adding}
          onSerial={(raw) => void add(raw)}
          busy={false}
          phone={phone}
        />
      </Collapse>
      {rowError ? <p role="alert" className="text-role-caption font-semibold text-text-danger">{rowError}</p> : null}

      <div className="space-y-1.5">
        <p className={FIELD_LABEL_CLASS}>Condition</p>
        <div className={locked ? 'pointer-events-none opacity-60' : undefined}>
          <TabSwitch
            tabs={CONDITION_TABS}
            activeTab={pkg.condition ?? ''}
            onTabChange={(id) => form.setCondition(index, id as PrepackCondition)}
            size="sm"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          iconRight={<ChevronDown className={more ? 'rotate-180' : undefined} />}
          onClick={() => setMore((current) => !current)}
          aria-expanded={more}
        >
          More
        </Button>
        <Button variant="ghost" size="sm" icon={<Pencil />} disabled={locked || !matrix} onClick={() => setEditing(true)} data-testid="prepack-edit-label">
          {custom ? 'Edit label text' : 'Add label text'}
        </Button>
        {custom ? <span className="min-w-0 break-words text-role-caption text-mode-ink">{custom}</span> : null}
        {pkg.provenance !== 'NONE' && !more ? (
          <span className="text-role-caption text-text-muted">{PREPACK_PROVENANCE_LABEL[pkg.provenance]}</span>
        ) : null}
      </div>
      <Collapse open={more}>
        <div className="flex items-center gap-2">
          <span className={FIELD_LABEL_CLASS}>Refurb source</span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary" size="md" iconRight={<ChevronDown />} disabled={locked} data-testid="prepack-provenance">
                {PREPACK_PROVENANCE_LABEL[pkg.provenance]}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {PREPACK_PROVENANCES.map((option) => (
                <DropdownMenuItem key={option} onSelect={() => form.setProvenance(index, option)}>
                  {PREPACK_PROVENANCE_LABEL[option]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </Collapse>

      {matrix ? (
        <ProductLabelEditPopover
          open={editing}
          onClose={() => setEditing(false)}
          sku={catalog.sku}
          matrix={matrix}
          customText
          applyLabel={`Apply to package ${index + 1}`}
          defaults={{
            title: pkg.label.title ?? catalog.title,
            condition: pkg.condition ?? '',
            color: pkg.label.color ?? '',
            text: pkg.label.text ?? '',
          }}
          onApplyAndPrint={(draft) => {
            const title = draft.title.trim();
            form.setLabel(index, {
              title: title && title !== catalog.title ? title : null,
              color: draft.color.trim() || null,
              text: draft.text?.trim() || null,
            });
            const condition = parsePrepackCondition(draft.condition);
            if (condition && condition !== pkg.condition) form.setCondition(index, condition);
          }}
        />
      ) : null}
    </div>
  );
}
