# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import hashlib
import hmac

import pytest

from plane.utils.git_references import (
    extract_closing_sequence_ids,
    extract_sequence_ids,
    verify_github_signature,
)


@pytest.mark.unit
class TestExtractSequenceIds:
    def test_branch_name(self):
        assert extract_sequence_ids("feat/PARCOURS-123-add-login", "PARCOURS") == [123]

    def test_case_insensitive_and_deduplicated(self):
        assert extract_sequence_ids("parcours-1 and PARCOURS-1 and Parcours-2", "PARCOURS") == [1, 2]

    def test_ignores_other_identifiers_and_embedded_matches(self):
        assert extract_sequence_ids("UTF-8 XPARCOURS-5 PARCOURS-5X OTHER-9", "PARCOURS") == []

    def test_empty_inputs(self):
        assert extract_sequence_ids(None, "PARCOURS") == []
        assert extract_sequence_ids("PARCOURS-1", "") == []

    def test_closing_keywords(self):
        text = "Closes PARCOURS-1, fixes: PARCOURS-2\nRelated to PARCOURS-3"
        assert extract_closing_sequence_ids(text, "PARCOURS") == [1, 2]


@pytest.mark.unit
class TestVerifyGithubSignature:
    secret = "topsecret"
    body = b'{"zen": "Keep it logically awesome."}'

    def sign(self, secret=None):
        return "sha256=" + hmac.new((secret or self.secret).encode(), self.body, hashlib.sha256).hexdigest()

    def test_valid(self):
        assert verify_github_signature(self.secret, self.body, self.sign())

    def test_wrong_secret(self):
        assert not verify_github_signature(self.secret, self.body, self.sign("other"))

    def test_missing_or_malformed_header(self):
        assert not verify_github_signature(self.secret, self.body, None)
        assert not verify_github_signature(self.secret, self.body, "md5=abc")

    def test_tampered_body(self):
        assert not verify_github_signature(self.secret, self.body + b" ", self.sign())
