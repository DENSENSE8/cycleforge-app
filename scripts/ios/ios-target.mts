// Where the generated Swift lands: the native app's working copy on the Mac
// (`ssh prometheus`, ~/Projects/cycleforge-ios — not git; see its
// docs/handoff/HANDOFF-swiftui-app.md). Shared by the scripts/ios generators.
//
//   (default)  write every file into the Mac project over ssh
//   --check    render, then compare with the Mac project's copy; exit 1 on drift
//   --stdout   print the rendered files instead of writing them
//
// CF_IOS_TARGET=<ssh-host>:<project dir> overrides the default target.
import { execFileSync } from 'node:child_process';

const DEFAULT_TARGET = 'prometheus:Projects/cycleforge-ios';

export interface RenderedFile {
  /** Path relative to the app project root. */
  path: string;
  content: string;
}

function target(): { host: string; dir: string } {
  const raw = process.env.CF_IOS_TARGET ?? DEFAULT_TARGET;
  const colon = raw.indexOf(':');
  if (colon <= 0 || colon === raw.length - 1) throw new Error(`CF_IOS_TARGET must be <host>:<dir>, got '${raw}'`);
  return { host: raw.slice(0, colon), dir: raw.slice(colon + 1) };
}

/** Single-quote a path for the remote POSIX shell. */
function sh(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

function remotePath(dir: string, path: string): string {
  if (path.startsWith('/') || path.split('/').includes('..')) throw new Error(`refusing to write outside the project: ${path}`);
  return `${dir}/${path}`;
}

function readRemote(host: string, path: string): string | null {
  try {
    return execFileSync('ssh', [host, `cat ${sh(path)}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return null;
  }
}

/** Write, check or print `files` according to the command-line flag. */
export function deliver(generator: string, files: readonly RenderedFile[]): void {
  const args = new Set(process.argv.slice(2));
  if (args.has('--stdout')) {
    for (const file of files) process.stdout.write(`// ── ${file.path}\n${file.content}`);
    return;
  }
  const { host, dir } = target();
  if (args.has('--check')) {
    const drifted = files.filter((file) => readRemote(host, remotePath(dir, file.path)) !== file.content);
    for (const file of drifted) console.error(`${generator}: ${host}:${remotePath(dir, file.path)} differs from a fresh render`);
    if (drifted.length > 0) {
      console.error(`${generator}: regenerate with \`node --import tsx --import ./scripts/register-server-only-shim.cjs scripts/ios/${generator}\``);
      process.exit(1);
    }
    console.log(`${generator}: ${files.length} file(s) match the web (${host}:${dir})`);
    return;
  }
  for (const file of files) {
    const path = remotePath(dir, file.path);
    const parent = path.slice(0, path.lastIndexOf('/'));
    execFileSync('ssh', [host, `mkdir -p ${sh(parent)} && cat > ${sh(path)}`], { input: file.content, stdio: ['pipe', 'inherit', 'inherit'] });
    console.log(`${generator}: wrote ${host}:${path}`);
  }
}
