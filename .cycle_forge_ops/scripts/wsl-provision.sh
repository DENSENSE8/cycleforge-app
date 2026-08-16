#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Cycle Forge — WSL2 (Ubuntu) provisioning for the NVIDIA/CUDA host
#
# Turns the Windows RTX 5070 Ti box into the heavy dev host: fixes the WSL
# environment, installs the toolchain + inference stack, and prepares the mesh
# networking so a Mac (or anything on the tailnet) can drive it headlessly.
#
# Run INSIDE WSL (Ubuntu-22.04), NOT from Windows PowerShell:
#     wsl -d Ubuntu-22.04
#     sudo bash /mnt/e/cycleforge-app/.cycle_forge_ops/scripts/wsl-provision.sh
#
# Idempotent: safe to re-run. It never touches your Windows filesystem or git.
# Steps that are irreducibly interactive (Tailscale login, the NVIDIA driver,
# secrets, multi-GB model pulls) are PRINTED as next-steps, not auto-run.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

log()  { printf '\n\033[1;36m▶ %s\033[0m\n' "$*"; }
ok()   { printf '  \033[1;32m✓ %s\033[0m\n' "$*"; }
warn() { printf '  \033[1;33m! %s\033[0m\n' "$*"; }

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run with sudo:  sudo bash $0" >&2
  exit 1
fi

# The non-root user who will own the repo + Hermes + pm2. Defaults to 'avion'
# (the account that already holds /home/avion/.hermes on this box), overridable:
#   FORGE_USER=youruser sudo -E bash wsl-provision.sh
FORGE_USER="${FORGE_USER:-avion}"
if ! id "${FORGE_USER}" >/dev/null 2>&1; then
  warn "user '${FORGE_USER}' does not exist — creating it"
  adduser --disabled-password --gecos "" "${FORGE_USER}"
  usermod -aG sudo "${FORGE_USER}"
fi
FORGE_HOME="$(getent passwd "${FORGE_USER}" | cut -d: -f6)"
ok "provisioning for user '${FORGE_USER}' (home: ${FORGE_HOME})"

# ── 1. Fix the WSL environment (root cause of the broken login shell) ────────
# Windows PATH was leaking into WSL, corrupting every login shell. MERGE the
# required keys — never clobber the file (it may already carry [network]
# generateResolvConf=false and other settings that must survive).
log "1/8  Repairing /etc/wsl.conf (merge, preserving existing sections)"
[[ -f /etc/wsl.conf ]] && cp /etc/wsl.conf "/etc/wsl.conf.bak.$(date +%s)"
python3 - "${FORGE_USER}" <<'PY'
import configparser, os, sys
path = '/etc/wsl.conf'
cfg = configparser.ConfigParser()
cfg.optionxform = str  # preserve key case
if os.path.exists(path):
    cfg.read(path)
user = sys.argv[1]
cfg.setdefault('boot', {}); cfg['boot']['systemd'] = 'true'
cfg.setdefault('interop', {})
cfg['interop']['enabled'] = 'true'
cfg['interop']['appendWindowsPath'] = 'false'
cfg.setdefault('user', {}); cfg['user']['default'] = user
with open(path, 'w') as f:
    cfg.write(f)
PY
ok "wsl.conf merged (systemd on, Windows PATH no longer appended, default user=${FORGE_USER}; existing sections preserved)"
warn "Windows env leak fully clears after: wsl --shutdown (from PowerShell), then reopen WSL"

# ── 2. Base toolchain ────────────────────────────────────────────────────────
log "2/8  Installing base packages (apt)"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y build-essential curl git ca-certificates gnupg \
  redis-server openssh-server pkg-config
ok "build tools, git, redis-server, openssh-server installed"

# ── 3. Node 24 LTS + pnpm (via nvm, per-user) ────────────────────────────────
log "3/8  Node 24 LTS + pnpm for ${FORGE_USER}"
sudo -u "${FORGE_USER}" -H bash <<'USEREOF'
set -e
export NVM_DIR="$HOME/.nvm"
if [ ! -s "$NVM_DIR/nvm.sh" ]; then
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
fi
. "$NVM_DIR/nvm.sh"
nvm install 24
nvm alias default 24
corepack enable
corepack prepare pnpm@11.5.1 --activate
node -v; pnpm -v
USEREOF
ok "Node 24 + pnpm 11.5.1 ready"

# ── 4. Ollama (NVIDIA inference — replaces MLX, which is Apple-only) ──────────
log "4/8  Ollama (CUDA inference server on :11434)"
if ! command -v ollama >/dev/null 2>&1; then
  curl -fsSL https://ollama.com/install.sh | sh
else
  ok "ollama already installed"
fi
ok "ollama installed — GPU is used automatically IF the NVIDIA driver + CUDA are visible in WSL"

# ── 5. Tailscale (mesh VPN so the Mac reaches THIS WSL instance) ─────────────
log "5/8  Tailscale"
if ! command -v tailscale >/dev/null 2>&1; then
  curl -fsSL https://tailscale.com/install.sh | sh
else
  ok "tailscale already installed"
fi

# ── 6. Enable services (systemd is on from step 1 after a wsl --shutdown) ─────
log "6/8  Enabling ssh + redis + tailscale"
systemctl enable ssh    >/dev/null 2>&1 || warn "enable ssh deferred until systemd is active (after wsl --shutdown)"
systemctl enable redis-server >/dev/null 2>&1 || true
systemctl enable tailscaled >/dev/null 2>&1 || true
ok "services enabled (they start after the next wsl --shutdown / reopen)"

# ── 7. Verify GPU passthrough ────────────────────────────────────────────────
log "7/8  GPU passthrough check"
if command -v nvidia-smi >/dev/null 2>&1 && nvidia-smi -L >/dev/null 2>&1; then
  nvidia-smi -L || true
  ok "nvidia-smi sees the GPU inside WSL"
else
  warn "nvidia-smi NOT working in WSL yet — this is the ONE Windows-side prerequisite:"
  warn "  Install the NVIDIA app / Game-Ready or Studio driver on WINDOWS (not in WSL)."
  warn "  The 5070 Ti (Blackwell) needs a recent driver exposing CUDA 12.8+ to WSL."
  warn "  Do NOT 'apt install' an nvidia driver inside WSL — it ships with the Windows driver."
fi

# ── 8. Next steps (interactive / your call) ──────────────────────────────────
log "8/8  Done. Remaining steps are interactive:"
cat <<NEXT

  a) Apply the wsl.conf fix:      (in Windows PowerShell)  wsl --shutdown   then reopen WSL
  b) Join the tailnet:            sudo tailscale up          # opens a login URL
     (optional) allow SSH:        sudo tailscale up --ssh
  c) Pull inference models:       ollama pull qwen2.5-coder:7b
                                  ollama pull llama3.2:3b
                                  ollama pull nomic-embed-text
  d) Clone the repo into ext4 (NOT /mnt/e — that path is slow):
                                  git clone <origin> ~/cycleforge-app
                                  cd ~/cycleforge-app && pnpm install
  e) Copy secrets:               cp /mnt/e/cycleforge-app/.env ~/cycleforge-app/.env
                                  # then set, for the CUDA host:
                                  #   FORGE_INFERENCE_BACKEND=cuda
                                  #   MLX_BASE_URL=http://127.0.0.1:11434/v1
                                  #   MLX_MODEL=qwen2.5-coder:7b
  f) Start the stack:            pm2 start ecosystem.config.cjs && pm2 save
  g) Dev server:                 pnpm dev            # http://<tailnet-host>:3050

  Reach it from the Mac: Cursor → Remote-SSH to ${FORGE_USER}@<magicdns-name>,
  then forward ports 3050 (web) and 8642 (Hermes). Keep Hermes on the tunnel —
  do NOT expose :8642 via a public Cloudflare Tunnel.
NEXT
ok "wsl-provision complete"
