/**
 * `/` action catalog — the composer reuses the launcher's destinations so a
 * slash command and ⌘K never diverge. This is the index, not a second launcher.
 */

export interface ComposerAction {
  readonly id: string;
  readonly label: string;
  readonly subtitle: string;
  readonly ref: string;
  readonly title: string;
  readonly tileType: 'session' | 'table';
}

export const COMPOSER_ACTIONS: readonly ComposerAction[] = [
  { id: 'unbox', label: 'Unbox session', subtitle: 'Start receiving cartons', ref: 'unbox', title: 'Unbox', tileType: 'session' },
  { id: 'packing', label: 'Packing session', subtitle: 'Pack graded units', ref: 'packing', title: 'Packing', tileType: 'session' },
  { id: 'qc', label: 'QC session', subtitle: 'Quality control', ref: 'qc', title: 'QC', tileType: 'session' },
  { id: 'triage', label: 'Triage queue', subtitle: 'Receiving triage', ref: 'triage', title: 'Triage', tileType: 'table' },
  { id: 'orders', label: 'Orders', subtitle: 'Open orders', ref: 'orders', title: 'Orders', tileType: 'table' },
  { id: 'receiving', label: 'Receiving feed', subtitle: 'Unbox recent', ref: 'receiving', title: 'Receiving', tileType: 'table' },
  { id: 'returns', label: 'Returns', subtitle: 'Return merchandise', ref: 'returns', title: 'Returns', tileType: 'table' },
  { id: 'units', label: 'Units', subtitle: 'All inventory units', ref: 'units', title: 'Units', tileType: 'table' },
];

export function filterComposerActions(query: string): readonly ComposerAction[] {
  const q = query.trim().toLowerCase();
  if (!q) return COMPOSER_ACTIONS;
  return COMPOSER_ACTIONS.filter(
    (a) =>
      a.label.toLowerCase().includes(q) ||
      a.id.toLowerCase().includes(q) ||
      a.subtitle.toLowerCase().includes(q),
  );
}
