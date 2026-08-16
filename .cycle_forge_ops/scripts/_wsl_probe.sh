#!/usr/bin/env bash
# Read-only inventory of the WSL host. No mutations.
echo "== identity =="
echo "whoami=$(whoami)"
echo "== /etc/wsl.conf =="
cat /etc/wsl.conf 2>/dev/null || echo "(none)"
echo "== users with homes =="
ls /home 2>/dev/null
echo "== tools =="
for c in git node pnpm python3 redis-server openssh-server sshd tailscale cloudflared ollama nvidia-smi pm2; do
  p="$(command -v "$c" 2>/dev/null || true)"
  printf '  %-16s %s\n' "$c" "${p:-MISSING}"
done
echo "== node/python versions =="
node -v 2>/dev/null || echo "node: none"
python3 --version 2>/dev/null || echo "python3: none"
echo "== hermes present? =="
ls -d /home/*/.hermes* 2>/dev/null || echo "(no hermes dirs)"
echo "== GPU in WSL =="
if command -v nvidia-smi >/dev/null 2>&1; then nvidia-smi -L 2>&1 | head -2; else echo "nvidia-smi MISSING (needs Windows NVIDIA driver w/ WSL support)"; fi
echo "== repo in ext4? =="
ls -d /home/*/cycleforge-app 2>/dev/null || echo "(repo not cloned into ext4 yet)"
