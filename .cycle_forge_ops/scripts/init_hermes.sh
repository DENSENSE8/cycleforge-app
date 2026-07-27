#!/bin/bash
# Cycle Forge — one-time Hermes setup. Run once from a WSL terminal.
set -euo pipefail
OPS="/mnt/e/cycleforge-app/.cycle_forge_ops"

echo "Initializing Hermes Profiles for Cycle Forge..."

# 1. Create profiles with strict boundaries
hermes profile create orchestrator --description "Primary router + Architect. Reached over Telegram. Designs MFM manifests, delegates builds, updates global memory via Honcho."
hermes profile create coder --description "Implementation Builder on Grok 4.5. Applies MFM manifests to the codebase and runs tests. Never redesigns."
hermes profile create logistics --description "Operations expert. Manages Shopify/Ecwid API integration, print queues, and Canon PIXMA PRO-200 packing workflows."

echo ""
echo "NEXT — bind system prompts + models to each profile (verify flags against 'hermes --help'):"
echo "  orchestrator → architect prompt: $OPS/prompts/ARCHITECT_SYSTEM.md   (model: Opus/Claude)"
echo "  coder        → builder  prompt: $OPS/prompts/CODER_SYSTEM.md        (model: Grok 4.5)"
echo ""
echo "  Then bind memory:   hermes -p orchestrator memory setup   (Mem0/Honcho)"
echo ""
echo "✅ Profiles created. Drive the loop with:  bash $OPS/scripts/forge.sh \"<feature>\""
echo "   Or wire forge.sh as the shell tool the orchestrator runs on Telegram '/forge'."
