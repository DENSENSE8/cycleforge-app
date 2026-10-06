/**
 * The short mark on the bottom right of an FNSKU label: the color and the
 * series / generation buried in the title (`Series II`, `Radio III`,
 * `Color II`, `3rd Generation`). The title still prints; this is the part a
 * person can read when the title is cut.
 */

const COLOR_PHRASES = [
  'platinum white',
  'polar white',
  'aqua blue',
  'graphite gray',
  'graphite grey',
  'space gray',
  'space grey',
  'rose gold',
  'starlight',
  'midnight',
  'graphite',
  'champagne',
  'platinum',
  'silver',
  'black',
  'white',
  'titanium',
  'purple',
  'yellow',
  'orange',
  'green',
  'beige',
  'brown',
  'coral',
  'gold',
  'gray',
  'grey',
  'blue',
  'pink',
  'red',
  'mint',
  'tan',
];

function titleCase(text: string): string {
  return text.replace(/\b[a-z]/g, (ch) => ch.toUpperCase());
}

interface SeriesMark {
  /** `II`, `3rd` — sits beside a color. */
  short: string;
  /** `Series II`, `Radio III` — used when there is no color. */
  long: string;
}

function seriesMark(title: string): SeriesMark | null {
  const series = title.match(/\bseries\s+(i{1,3}|iv|\d+)\b/i);
  if (series) {
    const token = /^\d+$/.test(series[1]) ? series[1] : series[1].toUpperCase();
    return { short: token, long: `Series ${token}` };
  }
  const named = title.match(/\b(radio|system|color)\s+(i{1,3}|iv)\b/i);
  if (named) {
    const token = named[2].toUpperCase();
    const word = named[1][0].toUpperCase() + named[1].slice(1).toLowerCase();
    return { short: token, long: `${word} ${token}` };
  }
  const gen = title.match(/\b(\d)(st|nd|rd|th)\s+generation\b/i);
  if (gen) {
    const short = `${gen[1]}${gen[2].toLowerCase()}`;
    return { short, long: `${short} Gen` };
  }
  return null;
}

function colorMark(title: string): string {
  const lower = title.toLowerCase();
  const hits: { at: number; length: number }[] = [];
  for (const phrase of COLOR_PHRASES) {
    let from = 0;
    while (from < lower.length) {
      const at = lower.indexOf(phrase, from);
      if (at < 0) break;
      const before = at === 0 || /[^a-z]/.test(lower[at - 1]);
      const afterAt = at + phrase.length;
      const after = afterAt === lower.length || /[^a-z]/.test(lower[afterAt]);
      if (before && after) hits.push({ at, length: phrase.length });
      from = at + Math.max(1, phrase.length);
    }
  }
  if (!hits.length) return '';
  const kept = hits.filter(
    (hit) => !hits.some((other) => other.length > hit.length && other.at <= hit.at && other.at + other.length >= hit.at + hit.length),
  );
  hits.length = 0;
  hits.push(...kept);
  hits.sort((a, b) => a.at - b.at || b.length - a.length);
  const last = hits[hits.length - 1];
  const prev = hits.length > 1 ? hits[hits.length - 2] : null;
  if (prev && last.at >= prev.at + prev.length) {
    const between = title.slice(prev.at + prev.length, last.at);
    if (/^[\s/·.-]+$/.test(between)) {
      return titleCase(title.slice(prev.at, last.at + last.length).replace(/\s*\/\s*/g, '/').replace(/\s+/g, ' ').toLowerCase());
    }
  }
  return titleCase(lower.slice(last.at, last.at + last.length));
}

/**
 * What the bottom right prints. A saved mark wins; a blank mark falls back to
 * the color or series read out of the title.
 */
export function fnskuPrintedCorner(title: string | null | undefined, mark: string | null | undefined): string {
  const saved = String(mark ?? '').replace(/\s+/g, ' ').trim();
  return saved || fnskuLabelGlance(title);
}

/** Color, series, or both (`II · Black`). Empty when the title has neither. */
export function fnskuLabelGlance(title: string | null | undefined): string {
  const text = String(title ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  const series = seriesMark(text);
  const color = colorMark(text);
  if (series && color) return `${series.short} · ${color}`;
  if (color) return color;
  if (series) return series.long;
  return '';
}
