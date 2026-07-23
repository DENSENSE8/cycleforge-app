/** Shared intake chrome — shell close / subtitle / submit CTAs. */

export const SIDEBAR_INTAKE_LABEL_CLASS =
  'block text-role-micro uppercase tracking-widest text-text-muted';

export const SIDEBAR_INTAKE_CLOSE_BUTTON_CLASS =
  'p-2 bg-surface-sunken hover:bg-surface-strong rounded-xl transition-all';

const SIDEBAR_INTAKE_SUBMIT_BUTTON_TONE_CLASS = {
  green: 'bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 shadow-green-500/20',
  orange: 'bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-700 hover:to-amber-700 shadow-orange-500/20',
} as const;

const SIDEBAR_INTAKE_SUBMIT_BUTTON_BASE_CLASS =
  'w-full px-4 py-3 disabled:bg-surface-strong text-white rounded-xl transition-all text-xs font-black uppercase tracking-wide disabled:cursor-not-allowed shadow-lg';

export function getSidebarIntakeSubmitButtonClass(tone: keyof typeof SIDEBAR_INTAKE_SUBMIT_BUTTON_TONE_CLASS = 'green'): string {
  return `${SIDEBAR_INTAKE_SUBMIT_BUTTON_BASE_CLASS} ${SIDEBAR_INTAKE_SUBMIT_BUTTON_TONE_CLASS[tone]}`;
}

export const SIDEBAR_INTAKE_SUBMIT_BUTTON_CLASS = getSidebarIntakeSubmitButtonClass('green');

export const SIDEBAR_INTAKE_SUBTITLE_ACCENT: Record<
  'green' | 'violet' | 'blue' | 'purple' | 'yellow' | 'black' | 'red' | 'lightblue' | 'pink',
  string
> = {
  green: 'text-role-micro font-bold text-green-600 uppercase tracking-widest',
  violet: 'text-role-micro font-bold text-violet-600 uppercase tracking-widest',
  blue: 'text-role-micro font-bold text-blue-600 uppercase tracking-widest',
  purple: 'text-role-micro font-bold text-purple-600 uppercase tracking-widest',
  yellow: 'text-role-micro font-bold text-amber-600 uppercase tracking-widest',
  black: 'text-role-micro font-bold text-text-muted uppercase tracking-widest',
  red: 'text-role-micro font-bold text-red-600 uppercase tracking-widest',
  lightblue: 'text-role-micro font-bold text-sky-600 uppercase tracking-widest',
  pink: 'text-role-micro font-bold text-pink-600 uppercase tracking-widest',
};
