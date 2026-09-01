#!/usr/bin/env bash
# stop — Cursor protocol wrapper around the shared machine-gate Host checker.
# Pass/skip/timeout/infra → {}. Real machine red → one followup_message.
# Fail-open: parse/timeout/crash → {}. Never an LLM grader. Never restyle paint.
set -euo pipefail
ROOT="${CURSOR_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
NODE="${CODE_GRAPH_NODE:-${DESIGN_MCP_NODE:-$HOME/.local/share/mise/shims/node}}"
if [ ! -x "$NODE" ]; then NODE="$(command -v node || true)"; fi
for _pnpm_dir in \
  "$HOME/.npm-global/bin" \
  "$HOME/.local/share/mise/shims" \
  "$HOME/.hermes/node/lib/node_modules/corepack/shims" \
  "/usr/local/bin"
do
  if [ -x "$_pnpm_dir/pnpm" ]; then
    PATH="$_pnpm_dir:$PATH"
    break
  fi
done
unset _pnpm_dir
export PATH
INPUT=$(cat || true)

case "${CYCLEFORGE_EVAL_STOP:-}" in
  0|off|false|FALSE|OFF)
    echo '{}'
    exit 0
    ;;
esac

python3 - "$ROOT" "$NODE" "$INPUT" <<'PY'
import json, os, subprocess, sys
from pathlib import Path

ROOT = Path(sys.argv[1])
NODE = sys.argv[2] or "node"
raw = sys.argv[3] if len(sys.argv) > 3 else "{}"
_mode = os.environ.get("CYCLEFORGE_EVAL_STOP", "").lower()
DRY = _mode in {"dry", "fake-fail"}
GATE = ROOT / "tools/eval-ledger/machine-gate.mjs"

def empty():
    sys.stdout.write("{}")
    sys.stdout.flush()
    raise SystemExit(0)

def out(obj):
    sys.stdout.write(json.dumps(obj))
    sys.stdout.flush()
    raise SystemExit(0)

def log(msg: str) -> None:
    sys.stderr.write(f"[stop-eval-gate] {msg}\n")
    sys.stderr.flush()

try:
    payload = json.loads(raw or "{}")
except Exception:
    log("malformed stdin — fail open")
    empty()

status = str(payload.get("status") or "")
try:
    loop_count = int(payload.get("loop_count") or 0)
except Exception:
    loop_count = 0

if status and status != "completed":
    log(f"status={status} — skip")
    empty()

if loop_count >= 1:
    log(f"loop_count={loop_count} — capped, leave fail in ledger")
    empty()

if _mode in {"timeout", "timeout-dry"}:
    log("CYCLEFORGE_EVAL_STOP=timeout — fail open")
    empty()

INTERESTING = (
    "src/",
    "tools/eval-ledger/",
    "src/lib/tables/",
    "src/lib/station/scan-station-overlay-cohort.ts",
    ".cursor/hooks/stop-eval-gate",
)

def porcelain_paths() -> list[str]:
    try:
        r = subprocess.run(
            ["git", "status", "--porcelain"],
            cwd=str(ROOT),
            capture_output=True,
            text=True,
            timeout=15,
        )
    except Exception as e:
        log(f"git status failed ({e}) — fail open")
        empty()
    paths = []
    for line in (r.stdout or "").splitlines():
        if not line.strip():
            continue
        rest = line[3:] if len(line) > 3 else line
        if " -> " in rest:
            rest = rest.split(" -> ", 1)[1]
        paths.append(rest.strip())
    return paths

try:
    dirty = porcelain_paths()
except SystemExit:
    raise
except Exception as e:
    log(f"dirty-tree probe crashed ({e}) — fail open")
    empty()

interesting = [
    p
    for p in dirty
    if any(p == pref or p.startswith(pref) for pref in INTERESTING)
]
if not interesting and not DRY:
    log("no eval-relevant dirty paths — skip")
    empty()

if not GATE.is_file():
    log(f"missing {GATE} — fail open")
    empty()

gate_args = [NODE, str(GATE)]
if DRY:
    gate_args.append("--dry-fail")

# Cursor must not hang forever; machine-gate honors CYCLEFORGE_EVAL_STOP_TIMEOUT_SEC.
env = os.environ.copy()
env.setdefault("CYCLEFORGE_EVAL_STOP_TIMEOUT_SEC", "280")
# Force when dirty/dry so machine-gate does not short-circuit on porcelain race.
if interesting or DRY:
    gate_args.append("--force")

log(f"machine-gate {' '.join(gate_args[2:])}")
try:
    r = subprocess.run(
        gate_args,
        cwd=str(ROOT),
        capture_output=True,
        text=True,
        timeout=int(env.get("CYCLEFORGE_EVAL_STOP_TIMEOUT_SEC", "280")) + 20,
        env=env,
    )
except subprocess.TimeoutExpired:
    log("machine-gate outer timeout — fail open")
    empty()
except Exception as e:
    log(f"machine-gate crashed ({e}) — fail open")
    empty()

code = r.returncode if r.returncode is not None else 1
text = (r.stdout or "") + (r.stderr or "")

if code == 0:
    log("pass")
    empty()

# Timeout / infra → silence (fail open). Real red → followup from machine-gate brief.
if code in (124, 75) or "timed out after" in text:
    log(f"machine-gate exit={code} — fail open")
    empty()

brief = (r.stdout or "").strip()
if not brief:
    brief = (
        "Machine eval failed. Stamp .cursor/eval-session.json. "
        "Snapshot .cursor/eval-session.json. Make that contract green. "
        "Do not change paint. Do not fold Queue/Viewed/History into the funnel. "
        "Do not delete overlay visibility / zIndex.panel. Do not invent Operator verdict."
        f"\n\n```\n{(r.stderr or text)[:2000]}\n```"
    )
if "All checks passed" in brief:
    brief = brief.replace("All checks passed", "(checks failed)")

log(f"machine-gate red exit={code}")
out({"followup_message": brief})
PY
