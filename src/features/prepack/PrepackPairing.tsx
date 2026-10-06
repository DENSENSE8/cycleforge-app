'use client';

import { useState } from 'react';
import { ChevronDown, Plus } from '@/components/Icons';
import { Collapse } from '@/design-system/components/Collapse';
import { motionTransition } from '@/design-system/foundations/motion-presets';
import { useMotionTransition } from '@/design-system/foundations/motion-presets-hooks';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  TextField,
} from '@/design-system/primitives';
import { useSkuCatalogSearch } from '@/hooks/useSkuCatalogSearch';
import {
  PREPACK_KIT_PART_TYPES,
  PREPACK_KIT_PART_TYPE_LABEL,
  type PrepackKit,
  type PrepackKitPartType,
} from '@/lib/prepack/types';
import { addPrepackKitPart, prepackErrorText } from './prepack-client';
import { ProductIdentity } from './prepack-ui';

/**
 * Parts pairing, inline: add a part, optionally paired to a child SKU. Reads
 * "Resolve pairing" while the product has no parts list or child SKU.
 * Pairing is product data — every write saves at once and survives an
 * abandoned form. The manual has its own row (`PrepackManualPopover`).
 */
export function PrepackPairing({ kit, onKit }: { kit: PrepackKit; onKit: (kit: PrepackKit) => void }) {
  const [open, setOpen] = useState(false);
  const openTiming = useMotionTransition(motionTransition.findListPanelOpen);
  const closeTiming = useMotionTransition(motionTransition.findListPanelClose);
  const gaps = [kit.parts.length === 0 ? 'parts list' : null, kit.children.length === 0 ? 'child SKU' : null].filter(Boolean);
  return (
    <div className={`rounded-mode-control border border-mode-rule ${gaps.length ? 'border-dashed' : ''}`} data-testid="prepack-pairing">
      <Button
        variant="ghost"
        size="lg"
        radius="flush"
        className="h-auto min-h-12 w-full justify-between whitespace-normal px-3 py-2 text-left"
        iconRight={<ChevronDown className={open ? 'rotate-180' : undefined} />}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        data-testid="prepack-pairing-toggle"
      >
        <span className="flex flex-col items-start">
          <span className="text-sm font-semibold text-mode-ink">{gaps.length ? 'Resolve pairing' : 'Add a part'}</span>
          {gaps.length ? <span className="text-role-caption text-text-muted">No {gaps.join(' and no ')} on this product yet</span> : null}
        </span>
      </Button>
      <Collapse open={open} timing={{ open: openTiming, close: closeTiming }} className="px-3 pb-3">
        <AddPartForm kit={kit} onKit={onKit} />
      </Collapse>
    </div>
  );
}

function AddPartForm({ kit, onKit }: { kit: PrepackKit; onKit: (kit: PrepackKit) => void }) {
  const [name, setName] = useState('');
  const [type, setType] = useState<PrepackKitPartType>('ACCESSORY');
  const [qty, setQty] = useState('1');
  const [childQuery, setChildQuery] = useState('');
  const [child, setChild] = useState<{ id: number; sku: string; title: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const childSearch = useSkuCatalogSearch(child ? '' : childQuery.trim(), { searchField: 'catalog', limit: 6 });

  const save = async () => {
    const componentName = name.trim() || child?.title || '';
    if (!componentName) {
      setError('Name the part, or choose its child SKU.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      onKit(await addPrepackKitPart(kit.catalog.id, {
        componentName,
        componentType: type,
        qtyRequired: Math.max(1, Math.floor(Number(qty)) || 1),
        childSkuCatalogId: child?.id ?? null,
      }));
      setName('');
      setQty('1');
      setChild(null);
      setChildQuery('');
    } catch (cause) {
      setError(prepackErrorText(cause, 'Could not add the part'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      className="space-y-3"
      aria-label="Add a part"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <p className="text-role-caption font-semibold text-text-muted">Add a part</p>
      <TextField label="Part name" value={name} onChange={setName} autoComplete="off" data-testid="prepack-part-name" />
      <div className="grid grid-cols-[minmax(0,1fr)_6rem] gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="secondary" size="lg" className="w-full justify-between" iconRight={<ChevronDown />} data-testid="prepack-part-type">
              {PREPACK_KIT_PART_TYPE_LABEL[type]}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {PREPACK_KIT_PART_TYPES.map((option) => (
              <DropdownMenuItem key={option} onSelect={() => setType(option)}>
                {PREPACK_KIT_PART_TYPE_LABEL[option]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <TextField label="Qty" value={qty} onChange={setQty} inputMode="numeric" autoComplete="off" />
      </div>
      {child ? (
        <div className="flex items-center gap-2 rounded-mode-control border border-mode-rule p-2">
          <ProductIdentity product={{ ...child, imageUrl: null }} />
          <Button variant="ghost" size="sm" onClick={() => setChild(null)}>
            Change
          </Button>
        </div>
      ) : (
        <div className="space-y-1">
          <TextField
            label="Child SKU (optional) — SKU, title or identifier"
            value={childQuery}
            onChange={setChildQuery}
            autoComplete="off"
            spellCheck={false}
            data-testid="prepack-part-child"
          />
          {childQuery.trim() && (childSearch.data?.length ?? 0) > 0 ? (
            <ul className="divide-y divide-mode-rule border-y border-mode-rule" aria-label="Child SKU matches">
              {childSearch.data!.map((item) => (
                <li key={item.id}>
                  <Button
                    variant="ghost"
                    size="md"
                    radius="flush"
                    className="h-auto min-h-12 w-full justify-start whitespace-normal px-2 py-1.5"
                    onClick={() => setChild({ id: item.id, sku: item.sku, title: item.product_title })}
                  >
                    <ProductIdentity product={{ id: item.id, sku: item.sku, title: item.product_title, imageUrl: item.image_url }} />
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      )}
      {error ? <p role="alert" className="text-role-caption font-semibold text-text-danger">{error}</p> : null}
      <Button type="submit" variant="secondary" size="lg" icon={<Plus />} loading={saving} className="w-full" data-testid="prepack-part-save">
        Add part
      </Button>
    </form>
  );
}
