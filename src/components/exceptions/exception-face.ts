import type { RecordStateFace } from '@/design-system/tokens/record';
import type { ExceptionRow } from '@/lib/exceptions/types';

/**
 * An exception's state face: its TAG (why it is an exception) is the state —
 * the record's spine and glyph (the word on hover and in its section head) — in the row's
 * own danger / warning tone.
 */
export function exceptionStateFace(row: Pick<ExceptionRow, 'kind' | 'tag'>): RecordStateFace {
  return {
    id: row.kind,
    code: row.tag.label,
    label: row.tag.label,
    tone: row.tag.tone,
    icon: row.tag.tone === 'danger' ? 'package-x' : 'circle-pause',
  };
}
