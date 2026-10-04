/**
 * The DECLARED first screens — one entry per surface that has been put under the
 * screen budget (`screen-budget.ts`). An owner instruction about what shows, where,
 * and what hides behind what is written HERE first, in data; the composition then
 * follows it and `ds_disclosure` measures that it does.
 */

import type { SurfaceDisclosureSpec } from './screen-budget';

export const DISCLOSURE_SURFACES: readonly SurfaceDisclosureSpec[] = [
  {
    id: 'task-sheet',
    surface: 'phone',
    file: 'src/components/mobile/daily/MobileTaskSheet.tsx',
    owner:
      'Owner 2026-10-03: ✕ top-right in the title row; status top-left, overdue/due top-right; the quick slider ' +
      'only inside the status dropdown; never the title twice; the timer is a glyph that opens a full Apple-style ' +
      'timer; secondary verbs (adding staff …) behind the three dots; the ticket readable in line. Patterns: Apple ' +
      'HIG Toolbars, Pull-down buttons (More), Menus (medium layout), Sheets, Action sheets.',
    probe: { path: '/m/home?task={id}', params: { id: '16012' }, ready: '[data-disclosure-zone="l1"]' },
    chromeRow: ['title', 'timer?', 'more', 'close'],
    cornerRow: { left: 'status', right: 'due' },
    rows: [['project?', 'people?']],
    dock: ['primary'],
    doors: {
      more: [
        'timer-sheet',
        'log-call',
        'log-note',
        'add-person',
        'send-alert',
        'add-media',
        'add-video-link',
        'link-email',
        'cancel-task',
      ],
      status: ['quick-slider', 'status-list'],
      due: ['due-presets', 'due-calendar', 'due-clear'],
    },
  },
];

export function disclosureSurface(id: string): SurfaceDisclosureSpec | null {
  return DISCLOSURE_SURFACES.find((s) => s.id === id) ?? null;
}
