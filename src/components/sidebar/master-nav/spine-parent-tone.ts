/** Parent-level color and motion for the MasterNav map. Children stay neutral. */

export type SpineParentTone = {
  icon: string;
  marker: string;
  row: string;
  section: string;
};

const sharedRow =
  'data-[active=true]:ring-1 data-[active=true]:ring-inset data-[active=true]:shadow-sm';
const sharedSection =
  'data-[owns-current=true]:ring-1 data-[owns-current=true]:ring-inset data-[owns-current=true]:shadow-sm';

const tones: Readonly<Record<string, SpineParentTone>> = {
  'ai-chat': {
    icon: 'text-violet-600', marker: 'bg-violet-500',
    row: `${sharedRow} hover:bg-violet-50/70 data-[active=true]:bg-violet-50/80 data-[active=true]:text-violet-800 data-[active=true]:ring-violet-200/80 data-[active=true]:hover:bg-violet-50/90`,
    section: `${sharedSection} hover:bg-violet-50/70 data-[owns-current=true]:bg-violet-50/80 data-[owns-current=true]:text-violet-800 data-[owns-current=true]:ring-violet-200/80`,
  },
  home: {
    icon: 'text-amber-600', marker: 'bg-amber-500',
    row: `${sharedRow} hover:bg-amber-50/70 data-[active=true]:bg-amber-50/80 data-[active=true]:text-amber-900 data-[active=true]:ring-amber-200/80 data-[active=true]:hover:bg-amber-50/90`,
    section: `${sharedSection} hover:bg-amber-50/70 data-[owns-current=true]:bg-amber-50/80 data-[owns-current=true]:text-amber-900 data-[owns-current=true]:ring-amber-200/80`,
  },
  studio: {
    icon: 'text-cyan-600', marker: 'bg-cyan-500',
    row: `${sharedRow} hover:bg-cyan-50/70 data-[active=true]:bg-cyan-50/80 data-[active=true]:text-cyan-800 data-[active=true]:ring-cyan-200/80 data-[active=true]:hover:bg-cyan-50/90`,
    section: `${sharedSection} hover:bg-cyan-50/70 data-[owns-current=true]:bg-cyan-50/80 data-[owns-current=true]:text-cyan-800 data-[owns-current=true]:ring-cyan-200/80`,
  },
  exceptions: {
    icon: 'text-rose-600', marker: 'bg-rose-500',
    row: `${sharedRow} hover:bg-rose-50/70 data-[active=true]:bg-rose-50/80 data-[active=true]:text-rose-800 data-[active=true]:ring-rose-200/80 data-[active=true]:hover:bg-rose-50/90`,
    section: `${sharedSection} hover:bg-rose-50/70 data-[owns-current=true]:bg-rose-50/80 data-[owns-current=true]:text-rose-800 data-[owns-current=true]:ring-rose-200/80`,
  },
  'ops-photos': {
    icon: 'text-blue-600', marker: 'bg-blue-500',
    row: `${sharedRow} hover:bg-blue-50/70 data-[active=true]:bg-blue-50/80 data-[active=true]:text-blue-800 data-[active=true]:ring-blue-200/80 data-[active=true]:hover:bg-blue-50/90`,
    section: `${sharedSection} hover:bg-blue-50/70 data-[owns-current=true]:bg-blue-50/80 data-[owns-current=true]:text-blue-800 data-[owns-current=true]:ring-blue-200/80`,
  },
  sales: {
    icon: 'text-green-600', marker: 'bg-green-500',
    row: `${sharedRow} hover:bg-green-50/70 data-[active=true]:bg-green-50/80 data-[active=true]:text-green-800 data-[active=true]:ring-green-200/80 data-[active=true]:hover:bg-green-50/90`,
    section: `${sharedSection} hover:bg-green-50/70 data-[owns-current=true]:bg-green-50/80 data-[owns-current=true]:text-green-800 data-[owns-current=true]:ring-green-200/80`,
  },
  inbound: {
    icon: 'text-sky-600', marker: 'bg-sky-500',
    row: `${sharedRow} hover:bg-sky-50/70 data-[active=true]:bg-sky-50/80 data-[active=true]:text-sky-800 data-[active=true]:ring-sky-200/80 data-[active=true]:hover:bg-sky-50/90`,
    section: `${sharedSection} hover:bg-sky-50/70 data-[owns-current=true]:bg-sky-50/80 data-[owns-current=true]:text-sky-800 data-[owns-current=true]:ring-sky-200/80`,
  },
  fulfillment: {
    icon: 'text-emerald-600', marker: 'bg-emerald-500',
    row: `${sharedRow} hover:bg-emerald-50/70 data-[active=true]:bg-emerald-50/80 data-[active=true]:text-emerald-800 data-[active=true]:ring-emerald-200/80 data-[active=true]:hover:bg-emerald-50/90`,
    section: `${sharedSection} hover:bg-emerald-50/70 data-[owns-current=true]:bg-emerald-50/80 data-[owns-current=true]:text-emerald-800 data-[owns-current=true]:ring-emerald-200/80`,
  },
  inventory: {
    icon: 'text-orange-600', marker: 'bg-orange-500',
    row: `${sharedRow} hover:bg-orange-50/70 data-[active=true]:bg-orange-50/80 data-[active=true]:text-orange-900 data-[active=true]:ring-orange-200/80 data-[active=true]:hover:bg-orange-50/90`,
    section: `${sharedSection} hover:bg-orange-50/70 data-[owns-current=true]:bg-orange-50/80 data-[owns-current=true]:text-orange-900 data-[owns-current=true]:ring-orange-200/80`,
  },
  catalog: {
    icon: 'text-indigo-600', marker: 'bg-indigo-500',
    row: `${sharedRow} hover:bg-indigo-50/70 data-[active=true]:bg-indigo-50/80 data-[active=true]:text-indigo-800 data-[active=true]:ring-indigo-200/80 data-[active=true]:hover:bg-indigo-50/90`,
    section: `${sharedSection} hover:bg-indigo-50/70 data-[owns-current=true]:bg-indigo-50/80 data-[owns-current=true]:text-indigo-800 data-[owns-current=true]:ring-indigo-200/80`,
  },
  reports: {
    icon: 'text-cyan-600', marker: 'bg-cyan-500',
    row: `${sharedRow} hover:bg-cyan-50/70 data-[active=true]:bg-cyan-50/80 data-[active=true]:text-cyan-800 data-[active=true]:ring-cyan-200/80 data-[active=true]:hover:bg-cyan-50/90`,
    section: `${sharedSection} hover:bg-cyan-50/70 data-[owns-current=true]:bg-cyan-50/80 data-[owns-current=true]:text-cyan-800 data-[owns-current=true]:ring-cyan-200/80`,
  },
  floor: {
    icon: 'text-teal-600', marker: 'bg-teal-500',
    row: `${sharedRow} hover:bg-teal-50/70 data-[active=true]:bg-teal-50/80 data-[active=true]:text-teal-800 data-[active=true]:ring-teal-200/80 data-[active=true]:hover:bg-teal-50/90`,
    section: `${sharedSection} hover:bg-teal-50/70 data-[owns-current=true]:bg-teal-50/80 data-[owns-current=true]:text-teal-800 data-[owns-current=true]:ring-teal-200/80`,
  },
};

const fallback: SpineParentTone = {
  icon: 'text-text-muted',
  marker: 'bg-text-default',
  row: sharedRow,
  section: sharedSection,
};

export function spineParentTone(id: string): SpineParentTone {
  return tones[id] ?? fallback;
}
