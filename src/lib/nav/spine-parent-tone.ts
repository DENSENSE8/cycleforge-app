/** Parent-level color and motion shared by desktop and mobile navigation. */

export type SpineParentTone = {
  icon: string;
  marker: string;
  row: string;
  section: string;
};

const sharedRow =
  'hover:bg-surface-hover data-[active=true]:text-text-default data-[active=true]:ring-1 data-[active=true]:ring-inset data-[active=true]:shadow-sm';
const sharedSection =
  'hover:bg-surface-hover data-[owns-current=true]:text-text-default data-[owns-current=true]:ring-1 data-[owns-current=true]:ring-inset data-[owns-current=true]:shadow-sm';

const tones: Readonly<Record<string, SpineParentTone>> = {
  'ai-chat': {
    icon: 'text-violet-700/85', marker: 'bg-violet-600/80',
    row: `${sharedRow} data-[active=true]:bg-violet-50/35 data-[active=true]:ring-violet-200/60 data-[active=true]:hover:bg-violet-50/45`,
    section: `${sharedSection} data-[owns-current=true]:bg-violet-50/35 data-[owns-current=true]:ring-violet-200/60`,
  },
  home: {
    icon: 'text-amber-700/90', marker: 'bg-amber-600/80',
    row: `${sharedRow} data-[active=true]:bg-amber-50/35 data-[active=true]:ring-amber-200/60 data-[active=true]:hover:bg-amber-50/45`,
    section: `${sharedSection} data-[owns-current=true]:bg-amber-50/35 data-[owns-current=true]:ring-amber-200/60`,
  },
  studio: {
    icon: 'text-cyan-700/85', marker: 'bg-cyan-600/80',
    row: `${sharedRow} data-[active=true]:bg-cyan-50/35 data-[active=true]:ring-cyan-200/60 data-[active=true]:hover:bg-cyan-50/45`,
    section: `${sharedSection} data-[owns-current=true]:bg-cyan-50/35 data-[owns-current=true]:ring-cyan-200/60`,
  },
  exceptions: {
    icon: 'text-rose-700/85', marker: 'bg-rose-600/80',
    row: `${sharedRow} data-[active=true]:bg-rose-50/35 data-[active=true]:ring-rose-200/60 data-[active=true]:hover:bg-rose-50/45`,
    section: `${sharedSection} data-[owns-current=true]:bg-rose-50/35 data-[owns-current=true]:ring-rose-200/60`,
  },
  'ops-photos': {
    icon: 'text-blue-700/85', marker: 'bg-blue-600/80',
    row: `${sharedRow} data-[active=true]:bg-blue-50/35 data-[active=true]:ring-blue-200/60 data-[active=true]:hover:bg-blue-50/45`,
    section: `${sharedSection} data-[owns-current=true]:bg-blue-50/35 data-[owns-current=true]:ring-blue-200/60`,
  },
  sales: {
    icon: 'text-green-700/85', marker: 'bg-green-600/80',
    row: `${sharedRow} data-[active=true]:bg-green-50/35 data-[active=true]:ring-green-200/60 data-[active=true]:hover:bg-green-50/45`,
    section: `${sharedSection} data-[owns-current=true]:bg-green-50/35 data-[owns-current=true]:ring-green-200/60`,
  },
  inbound: {
    icon: 'text-sky-700/85', marker: 'bg-sky-600/80',
    row: `${sharedRow} data-[active=true]:bg-sky-50/35 data-[active=true]:ring-sky-200/60 data-[active=true]:hover:bg-sky-50/45`,
    section: `${sharedSection} data-[owns-current=true]:bg-sky-50/35 data-[owns-current=true]:ring-sky-200/60`,
  },
  fulfillment: {
    icon: 'text-emerald-700/85', marker: 'bg-emerald-600/80',
    row: `${sharedRow} data-[active=true]:bg-emerald-50/35 data-[active=true]:ring-emerald-200/60 data-[active=true]:hover:bg-emerald-50/45`,
    section: `${sharedSection} data-[owns-current=true]:bg-emerald-50/35 data-[owns-current=true]:ring-emerald-200/60`,
  },
  inventory: {
    icon: 'text-orange-700/85', marker: 'bg-orange-600/80',
    row: `${sharedRow} data-[active=true]:bg-orange-50/35 data-[active=true]:ring-orange-200/60 data-[active=true]:hover:bg-orange-50/45`,
    section: `${sharedSection} data-[owns-current=true]:bg-orange-50/35 data-[owns-current=true]:ring-orange-200/60`,
  },
  // Warehouse (owner 2026-10-06): the building door, stone so it does not wear Inventory's orange.
  warehouse: {
    icon: 'text-stone-700/85', marker: 'bg-stone-600/80',
    row: `${sharedRow} data-[active=true]:bg-stone-50/35 data-[active=true]:ring-stone-200/60 data-[active=true]:hover:bg-stone-50/45`,
    section: `${sharedSection} data-[owns-current=true]:bg-stone-50/35 data-[owns-current=true]:ring-stone-200/60`,
  },
  catalog: {
    icon: 'text-indigo-700/85', marker: 'bg-indigo-600/80',
    row: `${sharedRow} data-[active=true]:bg-indigo-50/35 data-[active=true]:ring-indigo-200/60 data-[active=true]:hover:bg-indigo-50/45`,
    section: `${sharedSection} data-[owns-current=true]:bg-indigo-50/35 data-[owns-current=true]:ring-indigo-200/60`,
  },
  // Support (owner 2026-10-04): painted orange — the house orange family the Live feed row above it wears.
  support: {
    icon: 'text-orange-700/85', marker: 'bg-orange-600/80',
    row: `${sharedRow} data-[active=true]:bg-orange-50/35 data-[active=true]:ring-orange-200/60 data-[active=true]:hover:bg-orange-50/45`,
    section: `${sharedSection} data-[owns-current=true]:bg-orange-50/35 data-[owns-current=true]:ring-orange-200/60`,
  },
  reports: {
    icon: 'text-cyan-700/85', marker: 'bg-cyan-600/80',
    row: `${sharedRow} data-[active=true]:bg-cyan-50/35 data-[active=true]:ring-cyan-200/60 data-[active=true]:hover:bg-cyan-50/45`,
    section: `${sharedSection} data-[owns-current=true]:bg-cyan-50/35 data-[owns-current=true]:ring-cyan-200/60`,
  },
  floor: {
    icon: 'text-teal-700/85', marker: 'bg-teal-600/80',
    row: `${sharedRow} data-[active=true]:bg-teal-50/35 data-[active=true]:ring-teal-200/60 data-[active=true]:hover:bg-teal-50/45`,
    section: `${sharedSection} data-[owns-current=true]:bg-teal-50/35 data-[owns-current=true]:ring-teal-200/60`,
  },
};

const fallback: SpineParentTone = {
  icon: 'text-text-muted',
  marker: 'bg-text-muted',
  row: `${sharedRow} data-[active=true]:bg-surface-card data-[active=true]:ring-border-soft`,
  section: `${sharedSection} data-[owns-current=true]:bg-surface-card data-[owns-current=true]:ring-border-soft`,
};

export function spineParentTone(id: string): SpineParentTone {
  return tones[id] ?? fallback;
}
