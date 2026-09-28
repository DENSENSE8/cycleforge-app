/** Shared intake chrome — shell close / subtitle / submit CTAs. */

const SIDEBAR_INTAKE_LABEL_CLASS =
  'block text-role-micro text-text-muted';

export const SIDEBAR_INTAKE_CLOSE_BUTTON_CLASS =
  'p-2 bg-surface-sunken hover:bg-surface-strong rounded-xl transition-all';

const SIDEBAR_INTAKE_SUBMIT_BUTTON_TONE_CLASS = {
  green: 'bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 shadow-green-500/20',
  orange: 'bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-700 hover:to-amber-700 shadow-orange-500/20',
} as const;

const SIDEBAR_INTAKE_SUBMIT_BUTTON_BASE_CLASS =
  'w-full px-4 py-3 disabled:bg-surface-strong text-white rounded-xl transition-all text-xs font-semibold disabled:cursor-not-allowed shadow-lg';

function getSidebarIntakeSubmitButtonClass(tone: keyof typeof SIDEBAR_INTAKE_SUBMIT_BUTTON_TONE_CLASS = 'green'): string {
  return `${SIDEBAR_INTAKE_SUBMIT_BUTTON_BASE_CLASS} ${SIDEBAR_INTAKE_SUBMIT_BUTTON_TONE_CLASS[tone]}`;
}

const SIDEBAR_INTAKE_SUBMIT_BUTTON_CLASS = getSidebarIntakeSubmitButtonClass('green');

export const SIDEBAR_INTAKE_SUBTITLE_ACCENT: Record<
  'green' | 'violet' | 'blue' | 'purple' | 'yellow' | 'black' | 'red' | 'lightblue' | 'pink',
  string
> = {
  green: 'text-role-micro text-green-600',
  violet: 'text-role-micro text-violet-600',
  blue: 'text-role-micro text-blue-600',
  purple: 'text-role-micro text-purple-600',
  yellow: 'text-role-micro text-amber-600',
  black: 'text-role-micro text-text-muted',
  red: 'text-role-micro text-red-600',
  lightblue: 'text-role-micro text-sky-600',
  pink: 'text-role-micro text-pink-600',
};
