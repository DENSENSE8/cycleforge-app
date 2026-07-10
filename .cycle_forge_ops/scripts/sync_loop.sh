#!/bin/bash
echo "Enter a brief description of the architecture Grok just built in Cursor:"
read TASK_DESCRIPTION

echo "Grabbing recent git diff..."
GIT_DIFF=$(git diff HEAD~1 HEAD --stat 2>/dev/null || echo "No git diff available")

echo "Syncing context to local Hermes Orchestrator..."
# Pass the task to the orchestrator to update global memory
hermes -p orchestrator chat "Update global Cycle Forge memory. The following architecture was just implemented locally: $TASK_DESCRIPTION. Git changes: $GIT_DIFF. Ensure the coder and logistics profiles are aware of this state change."

echo "✅ Memory Synced! The Dev Loop is complete."
