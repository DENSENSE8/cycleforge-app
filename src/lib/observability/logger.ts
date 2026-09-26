/** JSON-line structured logger. */

type Level = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_RANK: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function readLevel(): Level {
  const raw = (process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug')).toLowerCase();
  if (raw === 'debug' || raw === 'info' || raw === 'warn' || raw === 'error') return raw;
  return 'info';
}

const MIN_LEVEL = LEVEL_RANK[readLevel()];
const PRETTY = process.env.NODE_ENV !== 'production' && process.env.LOG_FORMAT !== 'json';

type Bindings = Record<string, unknown>;

function emit(level: Level, base: Bindings, args: unknown[]): void {
  if (LEVEL_RANK[level] < MIN_LEVEL) return;

  // pino calling convention: logger.info(obj, msg, ...rest) OR logger.info(msg, ...rest).
  let extra: Bindings = {};
  let msg = '';
  if (args.length === 0) {
    msg = '';
  } else if (typeof args[0] === 'object' && args[0] !== null) {
    extra = args[0] as Bindings;
    msg = typeof args[1] === 'string' ? args[1] : '';
  } else {
    msg = String(args[0]);
  }

  const record: Bindings = {
    ts: new Date().toISOString(),
    level,
    ...base,
    ...extra,
    msg,
  };

  if (PRETTY) {
    const ctx = Object.entries({ ...base, ...extra })
      .filter(([k]) => k !== 'ts' && k !== 'level' && k !== 'msg')
      .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
      .join(' ');
    const line = `[${level.toUpperCase()}] ${msg}${ctx ? '  ' + ctx : ''}`;
    if (level === 'error') console.error(line);
    else if (level === 'warn') console.warn(line);
    // eslint-disable-next-line no-console -- logger's own stdout sink: info/debug must go to stdout, not stderr
    else console.log(line);
    return;
  }

  // Production: single-line JSON to stdout/stderr.
  const json = JSON.stringify(record);
  if (level === 'error') console.error(json);
  // eslint-disable-next-line no-console -- logger's own stdout sink: info/debug must go to stdout, not stderr
  else console.log(json);
}

export interface Logger {
  debug: (...args: unknown[]) => void;
  info:  (...args: unknown[]) => void;
  warn:  (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  child: (bindings: Bindings) => Logger;
}

function makeLogger(base: Bindings): Logger {
  return {
    debug: (...a) => emit('debug', base, a),
    info:  (...a) => emit('info',  base, a),
    warn:  (...a) => emit('warn',  base, a),
    error: (...a) => emit('error', base, a),
    child: (bindings) => makeLogger({ ...base, ...bindings }),
  };
}

export const logger: Logger = makeLogger({
  app: 'cycle-forge',
  env: process.env.NODE_ENV || 'development',
});
