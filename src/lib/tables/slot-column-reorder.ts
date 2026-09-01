/**
 * Header-track keys → catalog field ids for a slot-layout drop.
 *
 * Track keys are positional (`status:1`, `subtitle:2`). The reorder write
 * speaks field ids. Chrome tracks (`select`, `item`, `_fill`) carry no
 * `fieldId` and are ignored — same law as `LedgerGridColumnHeader`.
 */

export function columnFieldId(col: { fieldId?: unknown } | null | undefined): string | undefined {
  const id = col?.fieldId;
  return typeof id === 'string' && id.length > 0 ? id : undefined;
}

export function dropSlotColumns(
  dragKey: string,
  dropKey: string,
  columns: readonly { key: string; fieldId?: string }[],
): { dragFieldId: string; dropFieldId: string } | null {
  if (dragKey === dropKey) return null;
  const byKey = new Map(columns.map((c) => [c.key, c]));
  const dragFieldId = columnFieldId(byKey.get(dragKey));
  const dropFieldId = columnFieldId(byKey.get(dropKey));
  if (!dragFieldId || !dropFieldId || dragFieldId === dropFieldId) return null;
  return { dragFieldId, dropFieldId };
}
