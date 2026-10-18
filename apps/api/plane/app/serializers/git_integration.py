# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Third party imports
from rest_framework import serializers

# Module imports
from .base import BaseSerializer
from plane.db.models import GitRepository, IssueGitReference


class GitRepositorySerializer(BaseSerializer):
    class Meta:
        model = GitRepository
        # webhook_secret is deliberately excluded: it is only revealed once, when the repository is created
        fields = [
            "id",
            "project",
            "provider",
            "owner",
            "name",
            "url",
            "is_active",
            "close_on_merge",
            "state_mapping",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "project", "url", "created_at", "updated_at"]

    def validate_owner(self, value):
        return value.strip()

    def validate_name(self, value):
        return value.strip()

    def validate_state_mapping(self, value):
        allowed = {"branch_created", "pr_opened", "pr_merged"}
        if not isinstance(value, dict) or set(value) - allowed:
            raise serializers.ValidationError(f"state_mapping keys must be a subset of {sorted(allowed)}")
        return value


class IssueGitReferenceSerializer(BaseSerializer):
    class Meta:
        model = IssueGitReference
        fields = [
            "id",
            "issue",
            "kind",
            "external_id",
            "url",
            "title",
            "state",
            "source_branch",
            "target_branch",
            "author_login",
            "author_avatar_url",
            "merged_at",
            "metadata",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields
