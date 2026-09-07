#!/usr/bin/env node
/**
 * Starts Next.js dev (localhost:3050) + a pre-configured Cloudflare named tunnel.
 *
 * Usage:
 *   pnpm dev:tunnel:named             # :3050 — no prefix needed
 *   PORT=3060 pnpm dev:tunnel:named   # override for a one-off
 *
 * Why 3050 and not 3000: :3000 is another app on this machine, and the
 * `usav-dev` tunnel's ingress is pointed at :3050. Defaulting here keeps the
 * public URL and the dev server on the same port with no per-run prefix.
 *
 * PORT / DEV_PORT moves BOTH halves: `next dev -p <port>` and the tunnel's
 * ingress. Note `usav-dev` is a REMOTELY-managed tunnel — cloudflared pulls its
 * ingress from the Cloudflare dashboard and ignores local config — so a port
 * override also needs the dashboard route (or the API) updated to match.
 *
 * Auth (pick one — token avoids `cloudflared tunnel login` / cert.pem conflicts):
 *   CLOUDFLARE_TUNNEL_TOKEN=…   connector token from Zero Trust → Tunnels → Configure
 *                               (long eyJ… string — NOT the tunnel UUID)
 *   CLOUDFLARE_TUNNEL_ID=…      optional UUID when using ~/.cloudflared/<id>.json
 *   CLOUDFLARE_DEV_TUNNEL_NAME=…  fallback: `cloudflared tunnel run <name>`
 *
 * Cloudflare dashboard → Published application → Service URL:
 *   http://localhost:3050
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { homedir, platform, tmpdir } from "node:os";
import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";

loadEnv({ path: resolve(process.cwd(), ".env.local"), quiet: true });
loadEnv({ path: resolve(process.cwd(), ".env"), quiet: true });

/** This repo's dev port. :3000 belongs to another app; the tunnel points here. */
const DEFAULT_DEV_PORT = 3050;
const DEV_PORT = Number(
  process.env.PORT || process.env.DEV_PORT || DEFAULT_DEV_PORT,
);
const DEFAULT_TUNNEL = "usav-dev";
// Display-only public hostname. With a connector token the real hostname comes
// from the Cloudflare dashboard route; override here when the token points at a
// different tunnel than the default `usav-dev` one.
const DEFAULT_HOST =
  process.env.CLOUDFLARE_DEV_TUNNEL_HOST?.trim() || "usav-dev.michaelgarisek.com";

const BLUE = "\x1b[34m";
const CYAN = "\x1b[36m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

const log = (...args) => console.log(...args);
const banner = (title) => {
  log("");
  log(`${BOLD}${BLUE}━━━ ${title} ━━━${RESET}`);
  log("");
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const cliArgs = process.argv.slice(2).filter((a) => a !== "--");
const rawTokenEnv = process.env.CLOUDFLARE_TUNNEL_TOKEN?.trim() || "";
const explicitTunnelId = process.env.CLOUDFLARE_TUNNEL_ID?.trim() || "";
const tunnelName =
  process.env.CLOUDFLARE_DEV_TUNNEL_NAME?.trim() ||
  cliArgs[0]?.trim() ||
  DEFAULT_TUNNEL;

function isConnectorToken(value) {
  return value.length > 50 && !UUID_RE.test(value);
}

function credentialsPathForTunnelId(tunnelId) {
  return resolve(homedir(), ".cloudflared", `${tunnelId}.json`);
}

function resolveTunnelAuth() {
  if (rawTokenEnv && isConnectorToken(rawTokenEnv)) {
    return { mode: "token", token: rawTokenEnv };
  }

  const tunnelId =
    explicitTunnelId || (UUID_RE.test(rawTokenEnv) ? rawTokenEnv : "");
  if (tunnelId) {
    const credPath = credentialsPathForTunnelId(tunnelId);
    if (existsSync(credPath)) {
      return { mode: "credentials", tunnelId, credPath };
    }
    return {
      mode: "misconfigured",
      tunnelId,
      usedUuidAsToken: Boolean(rawTokenEnv && UUID_RE.test(rawTokenEnv)),
    };
  }

  if (tunnelName) {
    return { mode: "name", tunnelName };
  }

  return { mode: "missing" };
}

const tunnelAuth = resolveTunnelAuth();

/**
 * What the tunnel ACTUALLY dials. Unknown until the connector tells us.
 *
 * This used to be `const DASHBOARD_SERVICE_PORT = DEFAULT_DEV_PORT` — a guess
 * that the dashboard route matched our dev port. On 2026-09-06 it did not: the
 * remote ingress read `http://localhost:3051` while dev ran on 3050, so every
 * request 502'd with `dial tcp [::1]:3051: connect: connection refused` while
 * this banner cheerfully printed "→ http://localhost:3050". The guess made the
 * one number you need to trust the one number we invented.
 *
 * cloudflared logs the effective config on connect (`Updated to new
 * configuration config=…`). We parse THAT and report it, so the banner can
 * only ever show a fact.
 */
let effectiveIngress = null;
/** True once cloudflared reports it pulled config from the dashboard. */
let remoteManaged = false;
/** Origin dial failures cloudflared reports, surfaced instead of buried. */
const originErrors = new Set();

/** Scratch dir for the isolated config + (when needed) a fetched credentials file. */
const isolatedDir = mkdtempSync(resolve(tmpdir(), "usav-cf-tunnel-"));

/**
 * Isolated config so ~/.cloudflared/config.yml (e.g. hermes-mac) can't hijack
 * dev tunnel auth. Ingress points at THIS lane's port — a local `ingress:` block
 * overrides the dashboard's remote one, which is how `PORT=3050 pnpm dev:tunnel`
 * reaches :3050 instead of the dashboard's hardcoded :3000.
 */
function createIsolatedConfigPath(credentialsPath) {
  const configPath = resolve(isolatedDir, "config.yml");
  const lines = [
    `# generated by scripts/dev-tunnel-named.mjs — DEV_PORT=${DEV_PORT}`,
    "ingress:",
    `  - hostname: ${DEFAULT_HOST}`,
    `    service: http://localhost:${DEV_PORT}`,
    "  - service: http_status:404",
  ];
  if (credentialsPath) lines.push(`credentials-file: ${credentialsPath}`);
  writeFileSync(configPath, `${lines.join("\n")}\n`);
  return configPath;
}

/**
 * `cloudflared tunnel run <name>` needs a credentials JSON, not just cert.pem.
 * When ~/.cloudflared/<uuid>.json is absent we mint one from the existing
 * origin cert so name mode works without a dashboard round-trip.
 */
function ensureCredentialsFile(name) {
  const credPath = resolve(isolatedDir, `${name}.json`);
  const res = spawnSync(
    "cloudflared",
    ["tunnel", "token", "--cred-file", credPath, name],
    { encoding: "utf8" },
  );
  if (res.status !== 0 || !existsSync(credPath)) {
    log(`${RED}Could not fetch credentials for tunnel "${name}".${RESET}`);
    log(`${DIM}${(res.stderr || res.stdout || "").trim()}${RESET}`);
    log("");
    log(
      `Run ${CYAN}cloudflared tunnel login${RESET} (or set ${CYAN}CLOUDFLARE_TUNNEL_TOKEN${RESET} in .env.local).`,
    );
    process.exit(1);
  }
  return credPath;
}

function ensureCloudflared() {
  const check = spawnSync("cloudflared", ["--version"], { encoding: "utf8" });
  if (check.status === 0) {
    log(`${DIM}cloudflared: ${check.stdout.trim()}${RESET}`);
    return;
  }

  log(`${RED}${BOLD}cloudflared is not installed.${RESET}`);
  log("");
  log(`Install it, then re-run ${CYAN}pnpm dev:tunnel:named${RESET}:`);
  log("");
  if (platform() === "darwin") {
    log(`  ${GREEN}brew install cloudflared${RESET}`);
  } else if (platform() === "win32") {
    log(`  ${GREEN}winget install --id Cloudflare.cloudflared${RESET}`);
  } else {
    log(
      `  Download: ${CYAN}https://github.com/cloudflare/cloudflared/releases${RESET}`,
    );
  }
  log("");
  process.exit(1);
}

function ensureTunnelAuth() {
  if (tunnelAuth.mode === "misconfigured") {
    log(`${RED}${BOLD}Invalid CLOUDFLARE_TUNNEL_TOKEN.${RESET}`);
    log("");
    if (tunnelAuth.usedUuidAsToken) {
      log(
        `You set a ${BOLD}tunnel UUID${RESET} (${DIM}${tunnelAuth.tunnelId}${RESET}), not the connector token.`,
      );
      log(
        `cloudflared rejects UUIDs passed to ${CYAN}--token${RESET} with "Provided Tunnel token is not valid."`,
      );
      log("");
    }
    log(`Get the real connector token:`);
    log(
      `  Cloudflare Zero Trust → Networks → Tunnels → ${CYAN}${tunnelName}${RESET} → Configure`,
    );
    log(
      `  Copy the long token from the install command (${CYAN}cloudflared tunnel run --token eyJ…${RESET}).`,
    );
    log("");
    log(`Put it in ${CYAN}.env.local${RESET}:`);
    log(`  ${CYAN}CLOUDFLARE_TUNNEL_TOKEN=eyJ…${RESET}`);
    log("");
    log(`${DIM}Alternative: save credentials JSON as${RESET}`);
    log(`  ${DIM}${credentialsPathForTunnelId(tunnelAuth.tunnelId)}${RESET}`);
    log(`${DIM}and set CLOUDFLARE_TUNNEL_ID=${tunnelAuth.tunnelId}${RESET}`);
    log("");
    process.exit(1);
  }

  if (tunnelAuth.mode === "missing") {
    log(`${YELLOW}No tunnel auth configured in .env.local.${RESET}`);
    log("");
    log(`Add the connector token from Cloudflare Zero Trust → Tunnels → Configure:`);
    log(`  ${CYAN}CLOUDFLARE_TUNNEL_TOKEN=eyJ…${RESET}`);
    log("");
    log(
      `${DIM}Or set ${CYAN}CLOUDFLARE_TUNNEL_ID${RESET}${DIM} with ~/.cloudflared/<uuid>.json, or ${CYAN}CLOUDFLARE_DEV_TUNNEL_NAME${RESET}${DIM} + credentials.${RESET}`,
    );
    log("");
    process.exit(1);
  }
}

function tunnelSpawnArgs() {
  // Token mode is REMOTELY managed, and remote config WINS. Verified
  // 2026-09-06: cloudflared logged `Loading configuration from …/config.yml`
  // and then, one line later, `Updated to new configuration config=…3051…`.
  // So a local `ingress:` block does NOT override the dashboard here — the old
  // comment claiming it did was the reason this script believed it could point
  // itself at any port. It cannot. The dashboard route is the only thing that
  // decides, and all we can do is REPORT what it decided (see startTunnel).
  if (tunnelAuth.mode === "token") {
    return ["tunnel", "--no-autoupdate", "run", "--token", tunnelAuth.token];
  }

  switch (tunnelAuth.mode) {
    case "credentials":
      return [
        "tunnel",
        "--no-autoupdate",
        "--config",
        createIsolatedConfigPath(tunnelAuth.credPath),
        "run",
        tunnelAuth.tunnelId,
        "--credentials-file",
        tunnelAuth.credPath,
      ];
    case "name":
      return [
        "tunnel",
        "--no-autoupdate",
        "--config",
        createIsolatedConfigPath(ensureCredentialsFile(tunnelAuth.tunnelName)),
        "run",
        tunnelAuth.tunnelName,
      ];
    default:
      return ["tunnel", "--no-autoupdate", "run"];
  }
}

/**
 * Run Next through its JS entry with the current node, not the `next` shim:
 * `spawn("next", …, { shell: false })` is ENOENT on Windows, and spawning the
 * `.cmd` shim is EINVAL on Node 22+.
 */
function nextSpawnTarget() {
  const cli = resolve(process.cwd(), "node_modules", "next", "dist", "bin", "next");
  if (existsSync(cli)) return { command: process.execPath, prefix: [cli] };
  return { command: "next", prefix: [] };
}

let nextProc = null;
let tunnelProc = null;
let shuttingDown = false;

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  log("");
  log(`${DIM}Shutting down dev server and tunnel…${RESET}`);
  try {
    tunnelProc?.kill("SIGTERM");
  } catch {}
  try {
    nextProc?.kill("SIGTERM");
  } catch {}
  setTimeout(() => process.exit(code), 500);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

function startNext() {
  banner(`Starting Next.js dev server (localhost:${DEV_PORT})`);
  const next = nextSpawnTarget();
  nextProc = spawn(next.command, [...next.prefix, "dev", "--turbopack", "-p", String(DEV_PORT)], {
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
    env: { ...process.env, PORT: String(DEV_PORT) },
  });
  nextProc.stdout.on("data", (d) =>
    process.stdout.write(`${DIM}[next]${RESET} ${d}`),
  );
  nextProc.stderr.on("data", (d) =>
    process.stderr.write(`${DIM}[next]${RESET} ${d}`),
  );
  nextProc.on("exit", (code) => {
    if (!shuttingDown) {
      log(`${RED}next dev exited with code ${code}${RESET}`);
      shutdown(code ?? 1);
    }
  });
}

/**
 * cloudflared prints its effective config once per connect:
 *
 *   INF Updated to new configuration config="{\"ingress\":[{\"hostname\":…}]}" version=3
 *
 * That line is the ONLY authoritative statement of which localhost port the
 * tunnel dials. Parse it; never infer it.
 */
function parseEffectiveIngress(text) {
  const match = text.match(/Updated to new configuration config="(.+?)" version=/);
  if (!match) return null;
  try {
    // The log escapes the JSON for display; unescape before parsing.
    const parsed = JSON.parse(match[1].replace(/\\"/g, '"').replace(/\\\\/g, "\\"));
    return Array.isArray(parsed.ingress) ? parsed.ingress : null;
  } catch {
    return null;
  }
}

/** The rule that will serve our hostname, or the catch-all if none matches. */
function ruleForHost(ingress, host) {
  if (!ingress) return null;
  return (
    ingress.find((r) => r.hostname === host) ??
    ingress.find((r) => !r.hostname) ??
    null
  );
}

function portOfService(service) {
  const m = String(service ?? "").match(/:(\d{2,5})(?:\/|$)/);
  return m ? Number(m[1]) : null;
}

/** Does anything answer on this port right now? Returns the status, or null. */
async function portAnswers(port) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/`, {
      redirect: "manual",
      signal: AbortSignal.timeout(4000),
    });
    return res.status;
  } catch {
    return null;
  }
}

async function printTruthBanner() {
  const rule = ruleForHost(effectiveIngress, DEFAULT_HOST);
  const service = rule?.service ?? null;
  const originPort = portOfService(service);
  const devStatus = await portAnswers(DEV_PORT);
  // The port the tunnel dials may be served by something else (e.g. a socat
  // bridge). Traffic then works even though the route disagrees with our port,
  // and saying "will 502" there would be crying wolf.
  const originStatus =
    originPort != null && originPort !== DEV_PORT ? await portAnswers(originPort) : devStatus;
  const matched = originPort != null && originPort === DEV_PORT;
  const bridged = !matched && originPort != null && originStatus != null;

  log("");
  if (!service) {
    log(`${BOLD}${YELLOW}━━ dev tunnel connected · ORIGIN UNKNOWN ━━${RESET}`);
    log(`  ${YELLOW}cloudflared never reported its config, so this script`);
    log(`  cannot tell you which port the tunnel dials. Do not trust any`);
    log(`  number here — check Zero Trust → Tunnels → Public Hostname.${RESET}`);
  } else if (matched && devStatus != null) {
    log(`${BOLD}${GREEN}━━ dev tunnel is up ━━${RESET}`);
    log("");
    log(`  ${BOLD}${CYAN}https://${DEFAULT_HOST}${RESET}`);
    log(`  ${GREEN}→ ${service}${RESET}  ${DIM}(reported by cloudflared)${RESET}`);
    log(`  ${DIM}dev server on :${DEV_PORT} answered ${devStatus}${RESET}`);
  } else if (bridged) {
    log(`${BOLD}${YELLOW}━━ dev tunnel is up — VIA A BRIDGE, route still wrong ━━${RESET}`);
    log("");
    log(`  ${BOLD}${CYAN}https://${DEFAULT_HOST}${RESET}`);
    log(`  ${YELLOW}→ ${service}${RESET}  ${DIM}(answered ${originStatus} — something is forwarding it)${RESET}`);
    log(`  ${DIM}dev server itself is on :${DEV_PORT} (answered ${devStatus ?? "nothing"})${RESET}`);
    log("");
    log(`  ${DIM}Traffic works, but the dashboard route still names port ${originPort}.`);
    log(`  Kill the forwarder and this 502s again — fix the route to`);
    log(`  ${CYAN}http://127.0.0.1:${DEV_PORT}${RESET}${DIM} and drop the bridge.${RESET}`);
  } else {
    log(`${BOLD}${RED}━━ TUNNEL MISCONFIGURED — requests will 502 ━━${RESET}`);
    log("");
    log(`  tunnel dials   ${BOLD}${RED}${service}${RESET}${
      originPort != null ? `  ${DIM}(port ${originPort})${RESET}` : ""
    }`);
    log(`  dev server on  ${BOLD}${CYAN}:${DEV_PORT}${RESET}  ${
      devStatus != null
        ? `${DIM}(answered ${devStatus})${RESET}`
        : `${RED}(NOTHING LISTENING)${RESET}`
    }`);
    log("");
    if (originPort != null && originPort !== DEV_PORT) {
      log(`  ${YELLOW}The dashboard route points at a port your dev server is not on.${RESET}`);
      if (remoteManaged) {
        log(`  ${DIM}This tunnel is REMOTELY managed — a local ingress block cannot`);
        log(`  override it, so this is not fixable from the repo.${RESET}`);
      }
      log("");
      log(`  ${BOLD}Fix (one field):${RESET}`);
      log(`    Zero Trust → Networks → Tunnels → Public Hostname`);
      log(`    ${DEFAULT_HOST} → ${CYAN}http://127.0.0.1:${DEV_PORT}${RESET}`);
      log(`  ${DIM}Use 127.0.0.1, not localhost: cloudflared resolves localhost`);
      log(`  to [::1] first.${RESET}`);
      log("");
      log(`  ${BOLD}Or bridge it now, without the dashboard:${RESET}`);
      log(`    ${CYAN}socat TCP-LISTEN:${originPort},fork,reuseaddr,bind=127.0.0.1 TCP:127.0.0.1:${DEV_PORT}${RESET}`);
    }
  }
  for (const err of originErrors) {
    log("");
    log(`  ${RED}origin error:${RESET} ${err}`);
  }
  log("");
}

function startTunnel() {
  const authLabel =
    tunnelAuth.mode === "token"
      ? "connector token"
      : tunnelAuth.mode === "credentials"
        ? `tunnel ${tunnelAuth.tunnelId}`
        : `named tunnel "${tunnelAuth.tunnelName}"`;
  banner(`Starting Cloudflare dev tunnel (${authLabel})`);
  // Deliberately NOT claiming where the route points — that is reported after
  // the connector tells us, below.
  log(`${DIM}Dev server: ${CYAN}http://127.0.0.1:${DEV_PORT}${RESET}`);
  log(`${DIM}Public URL: ${CYAN}https://${DEFAULT_HOST}${RESET}`);
  log(`${DIM}Waiting for cloudflared to report its effective origin…${RESET}`);
  log("");

  tunnelProc = spawn("cloudflared", tunnelSpawnArgs(), {
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
  });

  let bannerPrinted = false;
  let connected = false;
  const maybePrint = () => {
    if (bannerPrinted || !connected) return;
    bannerPrinted = true;
    // Config arrives just after the first connection registers.
    setTimeout(() => void printTruthBanner(), 600);
  };

  const handle = (chunk) => {
    const text = chunk.toString();
    process.stdout.write(`${DIM}[tunnel]${RESET} ${text}`);

    const ingress = parseEffectiveIngress(text);
    if (ingress) {
      effectiveIngress = ingress;
      remoteManaged = true;
    }
    const originError = text.match(/Unable to reach the origin service[^"]*/);
    if (originError) originErrors.add(originError[0].trim());

    if (/Registered tunnel connection|Connection established/i.test(text)) {
      connected = true;
      maybePrint();
    }
  };

  tunnelProc.stdout.on("data", handle);
  tunnelProc.stderr.on("data", handle);
  tunnelProc.on("exit", (code) => {
    if (!shuttingDown) {
      log(`${RED}cloudflared exited with code ${code}${RESET}`);
      if (/address already in use/.test([...originErrors].join(" "))) {
        log(`${YELLOW}Tip:${RESET} another cloudflared owns the metrics port — stop it first (${CYAN}systemctl --user stop cloudflared${RESET}).`);
      } else if (tunnelAuth.mode === "token") {
        log(
          `${YELLOW}Tip:${RESET} refresh ${CYAN}CLOUDFLARE_TUNNEL_TOKEN${RESET} from Cloudflare Zero Trust → Tunnels → Configure (use the long ${CYAN}eyJ…${RESET} token, not the tunnel UUID).`,
        );
      } else {
        log(
          `${YELLOW}Tip:${RESET} set ${CYAN}CLOUDFLARE_TUNNEL_TOKEN${RESET} in .env.local to skip cert.pem / tunnel login.`,
        );
      }
      shutdown(code ?? 1);
    }
  });
}

ensureCloudflared();
ensureTunnelAuth();

/**
 * `DEV_TUNNEL_REPORT_ONLY=1` connects, prints what the tunnel actually dials,
 * and exits — no Next.js. Use it to answer "which port is the tunnel on?"
 * without booting a second dev server (`npm run dev:tunnel:check`).
 */
if (process.env.DEV_TUNNEL_REPORT_ONLY === "1") {
  startTunnel();
  setTimeout(() => {
    void printTruthBanner().then(() => shutdown(effectiveIngress ? 0 : 1));
  }, 8000);
} else {
  startNext();
  setTimeout(startTunnel, 1500);
}
