/** Header-track keys → catalog field ids for a slot-layout drop. */

function columnFieldId(col: { fieldId?: unknown } | null | undefined): string | undefined {
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
