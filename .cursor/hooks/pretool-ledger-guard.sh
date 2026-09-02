#!/usr/bin/env bash
# preToolUse — human/Host-section write guard (FABLE-5.1 D7 item 11).
#
# Agents may not write `docs/eval/**/LEDGER.md` (Operator verdict, Open gaps),
# `docs/eval/goals/**` (human-authored goal files), or
# `docs/eval/sessions/**` (Host-written receipt mirror). The eval runners patch
# LEDGER auto blocks with `fs`, not through the agent tool, so they are
# unaffected. Proposals go to the typed ask queue, never into these files.
#
# Fail open only on an unreadable payload.
set -euo pipefail
INPUT=$(cat)
python3 - "$INPUT" <<'PY'
import json, re, sys

try:
    payload = json.loads(sys.argv[1] or "{}")
except Exception:
    print(json.dumps({"permission": "allow"}))
    raise SystemExit(0)

tin = payload.get("tool_input") or payload.get("arguments") or {}
path = str(tin.get("path") or tin.get("file_path") or tin.get("target_notebook") or "").replace("\\", "/")

GUARDED = [
    (re.compile(r"(^|/)docs/eval/(.+/)?LEDGER\.md$"), "LEDGER.md human sections (Operator verdict, Open gaps)"),
    (re.compile(r"(^|/)docs/eval/goals(/|$)"), "goal files are human-authored (createdBy: human)"),
    (re.compile(r"(^|/)docs/eval/sessions(/|$)"), "session receipts are Host-written (scripts/session-receipt.ts)"),
]
for rx, why in GUARDED:
    if rx.search(path):
        print(
            json.dumps(
                {
                    "permission": "deny",
                    "user_message": "Eval ledger / goal file is not agent-writable.",
                    "agent_message": (
                        f"Write to {path} denied: {why}. Runners write auto blocks with fs; "
                        "propose changes through the typed ask queue (loop_run_blocks) instead."
                    ),
                }
            )
        )
        raise SystemExit(0)

print(json.dumps({"permission": "allow"}))
PY
