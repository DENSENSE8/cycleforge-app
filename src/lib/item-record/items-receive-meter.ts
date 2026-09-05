/**
 * Items-band copy. A receive meter, not a census (`PO items · N`).
 *
 * Counts come from the same qty + leftover codes as {@link deriveReceiveState}.
 * Zero buckets stay off the string. PLAN hop 5: `2 lines · 1 received · 1 open`.
 */

import { deriveReceiveState } from './receive-state';

export type ItemsReceiveMeterLine = {
  quantity_received?: number | null;
  quantity_expected?: number | null;
  exception_code?: string | null;
};

export function itemsReceiveMeterCopy(
  lines: ReadonlyArray<ItemsReceiveMeterLine>,
): string {
  const n = lines.length;
  const parts = [`${n} ${n === 1 ? 'line' : 'lines'}`];
  if (n === 0) return parts[0];

  let received = 0;
  let open = 0;
  let partial = 0;
  let leftover = 0;

  for (const line of lines) {
    const listedRaw = line.quantity_expected;
    const listed =
      typeof listedRaw === 'number' && Number.isFinite(listedRaw) ? listedRaw : null;
    const gotRaw = Number(line.quantity_received);
    const state = deriveReceiveState({
      counted: Number.isFinite(gotRaw) ? gotRaw : 0,
      expected: listed,
      exceptionCode: line.exception_code,
    });
    if (state === 'received') received += 1;
    else if (state === 'partial') partial += 1;
    else if (state === 'open' || state == null) open += 1;
    else leftover += 1;
  }

  if (received > 0) parts.push(`${received} received`);
  if (open > 0) parts.push(`${open} open`);
  if (partial > 0) parts.push(`${partial} partial`);
  if (leftover > 0) parts.push(`${leftover} leftover`);
  return parts.join(' · ');
}
