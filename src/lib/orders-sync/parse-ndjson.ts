/**
 * Pure NDJSON buffer splitter — the parse half of {@link streamNdjson}.
 *
 * Extracted so burst processing + yield can be tested without a fetch, and
 * so a single malformed line never poisons the rest of the stream.
 */

export interface NdjsonConsumeResult<T> {
  events: T[];
  rest: string;
  malformed: string[];
}

export function consumeNdjsonBuffer<T>(
  buffer: string,
  parse: (line: string) => T = JSON.parse as (line: string) => T,
): NdjsonConsumeResult<T> {
  const events: T[] = [];
  const malformed: string[] = [];
  let rest = buffer;
  let newlineIdx = rest.indexOf('\n');

  while (newlineIdx !== -1) {
    const line = rest.slice(0, newlineIdx).trim();
    rest = rest.slice(newlineIdx + 1);
    if (line) {
      try {
        events.push(parse(line));
      } catch {
        malformed.push(line);
      }
    }
    newlineIdx = rest.indexOf('\n');
  }

  return { events, rest, malformed };
}

export function consumeNdjsonTrailing<T>(
  buffer: string,
  parse: (line: string) => T = JSON.parse as (line: string) => T,
): NdjsonConsumeResult<T> {
  const trailing = buffer.trim();
  if (!trailing) return { events: [], rest: '', malformed: [] };
  try {
    return { events: [parse(trailing)], rest: '', malformed: [] };
  } catch {
    return { events: [], rest: '', malformed: [trailing] };
  }
}

export function malformedToErrorEvent<T>(line: string, trailing = false): T {
  const prefix = trailing ? 'Malformed trailing sync event' : `Malformed sync event: ${line.slice(0, 120)}`;
  return { type: 'error', error: prefix } as T;
}
