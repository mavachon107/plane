# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import hashlib
import hmac
import re

CLOSING_KEYWORDS = r"(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)"


def verify_github_signature(secret: str, body: bytes, signature_header: str | None) -> bool:
    """Verify GitHub's X-Hub-Signature-256 header (HMAC SHA-256 over the raw body)."""
    if not secret or not signature_header or not signature_header.startswith("sha256="):
        return False
    expected = "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature_header)


def extract_sequence_ids(text: str | None, project_identifier: str) -> list[int]:
    """Return the sequence ids of work items in `text` that reference `project_identifier` (e.g. PROJ-12)."""
    if not text or not project_identifier:
        return []
    pattern = re.compile(rf"(?<![A-Za-z0-9]){re.escape(project_identifier)}-(\d+)(?![A-Za-z0-9])", re.IGNORECASE)
    seen: list[int] = []
    for match in pattern.finditer(text):
        value = int(match.group(1))
        if value not in seen:
            seen.append(value)
    return seen


def extract_closing_sequence_ids(text: str | None, project_identifier: str) -> list[int]:
    """Return sequence ids that are preceded by a closing keyword (closes, fixes, resolves)."""
    if not text or not project_identifier:
        return []
    pattern = re.compile(
        rf"(?<![A-Za-z0-9]){CLOSING_KEYWORDS}:?\s+{re.escape(project_identifier)}-(\d+)(?![A-Za-z0-9])",
        re.IGNORECASE,
    )
    seen: list[int] = []
    for match in pattern.finditer(text):
        value = int(match.group(1))
        if value not in seen:
            seen.append(value)
    return seen
