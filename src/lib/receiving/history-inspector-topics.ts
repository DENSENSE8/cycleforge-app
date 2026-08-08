/**
 * Unbox History `detail:history` topic → action map.
 *
 * Pure descriptors for Display tabs · one identity primary CTA · More menu ·
 * View chrome cluster. Handlers stay in {@link HistoryCartonTriagePanel}; this
 * module owns order, labels, accent, and matched-vs-unfound presence.
 *
 * Recipe: `docs/todo/history-inspector-topic-icons-HANDOFF.md` §2 (+ View group).
 */

import type { CartonReadinessCta } from '@/lib/receiving/carton-readiness';

export type HistoryInspectorDisplayTopic =
  | 'summary'
  | 'logistics'
  | 'photos'
  | 'audit';

type HistoryInspectorEditTopic =
  | 'print'
  | 'unbox'
  | 'link'
  | 'flag'
  | 'more';

/** Sheet layout chrome — composed in the inspector View cluster (not query facets). */
type HistoryInspectorViewTopic =
  | 'paint'
  | 'drill'
  | 'compare'
  | 'zoom'
  | 'columns';

type HistoryInspectorTopicId =
  | HistoryInspectorDisplayTopic
  | HistoryInspectorEditTopic
  | HistoryInspectorViewTopic;

type HistoryInspectorTopicGroup = 'display' | 'edit' | 'view';

type HistoryInspectorTopicSpec = {
  key: HistoryInspectorTopicId;
  group: HistoryInspectorTopicGroup;
  /** HoverTooltip / aria — locked to handoff §2 (+ View labels). */
  label: string;
  /** Short labelled tab for Display topics (`PaneHeaderTabs`). */
  tabLabel?: string;
  /** Digit / letter shown in More menu + panel hotkeys. */
  shortcut?: string;
  /** One primary Edit may use accent tone. */
  accent?: boolean;
  disabled?: boolean;
};

type HistoryInspectorPrimaryAction = {
  key: Exclude<HistoryInspectorEditTopic, 'more' | 'flag'>;
  label: string;
  shortcut: string;
};

type HistoryInspectorMoreItem = {
  key: string;
  label: string;
  shortcut?: string;
};

type HistoryInspectorTopicActionsInput = {
  unfound: boolean;
  readinessCta?: CartonReadinessCta | null;
  /**
   * When true (no carton selected), omit Display + Edit — View-only shell for
   * sheet layout / refine without a triage target.
   */
  viewOnly?: boolean;
};

type HistoryInspectorTopicActions = {
  display: HistoryInspectorTopicSpec[];
  edit: HistoryInspectorTopicSpec[];
  view: HistoryInspectorTopicSpec[];
};

const DISPLAY_TOPICS: HistoryInspectorTopicSpec[] = [
  {
    key: 'summary',
    group: 'display',
    label: 'Order / PO summary',
    tabLabel: 'Details',
    shortcut: '1',
  },
  {
    key: 'logistics',
    group: 'display',
    label: 'Logistics & channel',
    tabLabel: 'Logistics',
    shortcut: '2',
  },
  {
    key: 'photos',
    group: 'display',
    label: 'Photo evidence',
    tabLabel: 'Evidence',
    shortcut: '3',
  },
  {
    key: 'audit',
    group: 'display',
    label: 'Audit / timeline',
    tabLabel: 'History',
    shortcut: '4',
  },
];

/**
 * Locked View order — query facets (staff · week · field · scope) live on Band 3
 * Refine, and **KPI collapse lives on Band 3 too** (removed here 2026-08-08).
 * A declaration that outlives its control is documentation that cannot fail, so
 * `kpi` leaves this list in the same change that removed the toggle from
 * {@link HistoryViewTopicsCluster}.
 */
const VIEW_TOPICS: HistoryInspectorTopicSpec[] = [
  { key: 'paint', group: 'view', label: 'Paint selected rows' },
  { key: 'drill', group: 'view', label: 'Drill / List layout' },
  { key: 'compare', group: 'view', label: 'Compare panes' },
  { key: 'zoom', group: 'view', label: 'Spreadsheet zoom' },
  { key: 'columns', group: 'view', label: 'Column display' },
];

function primaryEditAccent(
  unfound: boolean,
  readinessCta: CartonReadinessCta | null | undefined,
): Exclude<HistoryInspectorEditTopic, 'more' | 'flag'> {
  if (unfound) return 'link';
  if (readinessCta === 'continue_unbox' || readinessCta === 'match_po') return 'unbox';
  return 'print';
}

const PRIMARY_LABEL: Record<
  Exclude<HistoryInspectorEditTopic, 'more' | 'flag'>,
  string
> = {
  link: 'Resolve Unfound',
  unbox: 'Open Unbox',
  print: 'Print',
};

/**
 * Build Display | Edit | View topic specs. Edit list remains for tests /
 * readiness accent; the panel surfaces one primary CTA + More instead of an
 * Edit icon strip.
 */
export function historyInspectorTopicActions(
  input: HistoryInspectorTopicActionsInput,
): HistoryInspectorTopicActions {
  const viewOnly = Boolean(input.viewOnly);
  if (viewOnly) {
    return { display: [], edit: [], view: VIEW_TOPICS };
  }

  const unfound = Boolean(input.unfound);
  const readinessCta = input.readinessCta ?? null;
  const accent = primaryEditAccent(unfound, readinessCta);

  const edit: HistoryInspectorTopicSpec[] = [
    {
      key: 'print',
      group: 'edit',
      label: 'Print barcode / label',
      // Unfound: soft-disable — print needs a linked SKU / Unbox handoff.
      disabled: unfound,
      ...(accent === 'print' ? { accent: true as const } : {}),
    },
    {
      key: 'unbox',
      group: 'edit',
      label: 'Open / Continue / Match in Unbox',
      ...(accent === 'unbox' ? { accent: true as const } : {}),
    },
  ];

  if (unfound) {
    edit.push({
      key: 'link',
      group: 'edit',
      label: 'Link / Resolve unmatched carton',
      ...(accent === 'link' ? { accent: true as const } : {}),
    });
  }

  edit.push(
    {
      key: 'flag',
      group: 'edit',
      label: 'Flag / condition / return',
    },
    {
      key: 'more',
      group: 'edit',
      label: 'More actions',
    },
  );

  return { display: DISPLAY_TOPICS, edit, view: VIEW_TOPICS };
}

/** One readiness-picked labelled CTA for the identity row. */
export function historyInspectorPrimaryAction(input: {
  unfound: boolean;
  readinessCta?: CartonReadinessCta | null;
}): HistoryInspectorPrimaryAction {
  const key = primaryEditAccent(Boolean(input.unfound), input.readinessCta ?? null);
  return {
    key,
    label: PRIMARY_LABEL[key],
    shortcut: 'Enter',
  };
}

/**
 * Overflow menu for non-primary edits. Cap ~4; Print omitted when it is the
 * identity primary. Shortcuts are panel-scoped (ignore inputs).
 */
export function historyInspectorMoreItems(input: {
  unfound: boolean;
  readinessCta?: CartonReadinessCta | null;
}): ReadonlyArray<HistoryInspectorMoreItem> {
  const unfound = Boolean(input.unfound);
  const primary = primaryEditAccent(unfound, input.readinessCta ?? null);
  const items: HistoryInspectorMoreItem[] = [];

  if (primary !== 'print' && !unfound) {
    items.push({ key: 'print', label: 'Print barcode / label', shortcut: 'P' });
  }
  if (primary !== 'unbox') {
    items.push({ key: 'unbox', label: 'Open in Unbox', shortcut: 'U' });
  }

  items.push({ key: 'flag', label: 'Flag / condition / return', shortcut: 'F' });

  if (unfound) {
    items.push({ key: 'holding', label: 'Assign holding location', shortcut: 'H' });
    items.push({ key: 'photo', label: 'Attach photo evidence', shortcut: 'A' });
  } else {
    items.push({ key: 'photo', label: 'Attach photo evidence', shortcut: 'A' });
    items.push({ key: 'holding', label: 'Assign holding location', shortcut: 'H' });
  }

  return items.slice(0, 4);
}
