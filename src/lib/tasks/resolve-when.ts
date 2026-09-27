/**
 * "3pm", "tomorrow at 9", "Friday", "in 2 hours", "Oct 3 5:30pm" → an exact
 * instant, read as wall-clock time in the ORGANIZATION's time zone (never the
 * server's, never the model's guess). Pure; `now` and the zone are inputs.
 *
 * Strict on purpose: a phrase with any word it does not understand resolves
 * to `null`, so the caller asks instead of scheduling the wrong day. A bare
 * time already past today means the next day; a bare day takes `defaultHour`.
 */

import { fromZonedTime, toZonedTime } from 'date-fns-tz';

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const NAMED_TIMES: Record<string, [number, number]> = {
  noon: [12, 0],
  midday: [12, 0],
  midnight: [0, 0],
  morning: [9, 0],
  afternoon: [14, 0],
  evening: [18, 0],
  tonight: [20, 0],
  eod: [17, 0],
  'end of day': [17, 0],
  'end of the day': [17, 0],
  cob: [17, 0],
};
const UNIT_MINUTES: Record<string, number> = { minute: 1, min: 1, hour: 60, hr: 60, day: 1440, week: 10080 };

export interface ResolvedWhen {
  /** ISO instant (UTC). */
  iso: string;
  /** How the operator reads it back, in the org zone: "Sat, Sep 27, 3:00 PM". */
  label: string;
}

/** Display an instant in the org zone — the one format the tools read back. */
export function formatWhen(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(at);
}

export function resolveWhen(
  phrase: string,
  opts: { now: Date; timeZone: string; defaultHour: number },
): ResolvedWhen | null {
  let t = phrase.toLowerCase().replace(/[,.]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t) return null;
  const { now, timeZone } = opts;
  const done = (at: Date): ResolvedWhen | null =>
    Number.isNaN(at.getTime()) ? null : { iso: at.toISOString(), label: formatWhen(at, timeZone) };

  // Relative offsets: "in 2 hours", "in 30 min".
  const rel = /^in (\d{1,4}|an?|one) (minute|min|hour|hr|day|week)s?$/.exec(t);
  if (rel) {
    const n = /^\d/.test(rel[1]) ? Number(rel[1]) : 1;
    return done(new Date(now.getTime() + n * UNIT_MINUTES[rel[2]] * 60_000));
  }

  // An explicit ISO instant with its own offset.
  if (/^\d{4}-\d{2}-\d{2}t\d{2}:\d{2}(:\d{2}(\.\d+)?)?(z|[+-]\d{2}:?\d{2})$/.test(t)) return done(new Date(phrase.trim()));

  const wall = toZonedTime(now, timeZone);
  let year = wall.getFullYear();
  let month = wall.getMonth();
  let day = wall.getDate();
  let dayGiven = false;
  let hour: number | null = null;
  let minute = 0;

  const take = (re: RegExp): RegExpExecArray | null => {
    const m = re.exec(t);
    if (m) t = `${t.slice(0, m.index)} ${t.slice(m.index + m[0].length)}`.replace(/\s+/g, ' ').trim();
    return m;
  };

  // ── time of day ──
  const clock = take(/\b(?:at )?(\d{1,2})(?::(\d{2}))? ?(am|pm|a|p)\b/) ?? take(/\b(?:at )?([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (clock) {
    let h = Number(clock[1]);
    minute = clock[2] ? Number(clock[2]) : 0;
    const mer = clock[3];
    if (mer) {
      if (h < 1 || h > 12) return null;
      if (mer.startsWith('p') && h !== 12) h += 12;
      if (mer.startsWith('a') && h === 12) h = 0;
    }
    if (minute > 59) return null;
    hour = h;
  }
  if (hour === null) {
    for (const [name, [h, m]] of Object.entries(NAMED_TIMES).sort((a, b) => b[0].length - a[0].length)) {
      if (take(new RegExp(`\\b(?:(?:in )?the |at |this )?${name}\\b`))) {
        hour = h;
        minute = m;
        if (name === 'tonight') dayGiven = true;
        break;
      }
    }
  }

  // ── day ──
  const setDate = (d: Date) => {
    year = d.getFullYear();
    month = d.getMonth();
    day = d.getDate();
    dayGiven = true;
  };
  const addDays = (n: number) => setDate(new Date(year, month, day + n));
  let m: RegExpExecArray | null;
  if (take(/\btoday\b/)) dayGiven = true;
  else if (take(/\b(?:tomorrow|tmrw|tmr)\b/)) addDays(1);
  else if ((m = take(/\b(?:on )?(?:(next|this) )?(sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)(?:day|nesday|rsday|urday|sday)?\b/))) {
    const target = WEEKDAYS.findIndex((w) => w.startsWith(m![2].slice(0, 3)));
    let diff = (target - wall.getDay() + 7) % 7;
    if (m[1] === 'next' && diff === 0) diff = 7;
    if (diff === 0 && m[1] !== 'this') diff = 7;
    addDays(diff);
  } else if ((m = take(/\b(\d{4})-(\d{2})-(\d{2})\b/))) {
    setDate(new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  } else if ((m = take(/\b(?:on )?(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/))) {
    const y = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : year;
    const d = new Date(y, Number(m[1]) - 1, Number(m[2]));
    if (!m[3] && d.getTime() < new Date(year, month, day).getTime()) d.setFullYear(y + 1);
    setDate(d);
  } else if ((m = take(/\b(?:on )?(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]* (\d{1,2})(?:st|nd|rd|th)?\b/))) {
    const d = new Date(year, MONTHS.indexOf(m[1].slice(0, 3)), Number(m[2]));
    if (d.getTime() < new Date(year, month, day).getTime()) d.setFullYear(year + 1);
    setDate(d);
  }

  t = t.replace(/\b(?:by|at|on|before)\b/g, '').trim();
  if (t) return null; // an unread word — ask, never guess
  if (hour === null && !dayGiven) return null;

  const at = (h: number, mi: number) =>
    fromZonedTime(new Date(year, month, day, h, mi, 0, 0), timeZone);
  if (hour === null) return done(at(opts.defaultHour, 0));
  let result = at(hour, minute);
  if (!dayGiven && result.getTime() <= now.getTime()) {
    addDays(1);
    result = at(hour, minute);
  }
  return done(result);
}
