"""Dependency-free authentication policy for the local vision service."""

from __future__ import annotations

import secrets


def vision_token_matches(provided: str | None, expected: str) -> bool:
    """Reject absence and compare supplied tokens without timing leakage."""
    return provided is not None and secrets.compare_digest(provided, expected)
