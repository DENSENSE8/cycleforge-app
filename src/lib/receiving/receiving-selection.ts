/** Pure receiving-selection helpers shared by the action catalog and its disclosed editors. */

export function receivingPackageIds(
  rows: readonly { receiving_id?: number | null }[],
): number[] {
  return Array.from(
    new Set(
      rows
        .map((row) => row.receiving_id)
        .filter((id): id is number => id != null && Number.isFinite(id) && id > 0),
    ),
  );
}
