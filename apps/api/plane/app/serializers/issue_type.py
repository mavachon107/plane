# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Third party imports
from rest_framework import serializers

# Module imports
from .base import BaseSerializer
from plane.db.models import IssueType


class IssueTypeSerializer(BaseSerializer):
    # Annotated on the queryset from the ProjectIssueType join row: is_default on
    # IssueType itself is the workspace default, which this project-scoped API
    # never touches. Defaults only move through mark_as_default.
    is_default = serializers.BooleanField(read_only=True)
    project_ids = serializers.ListField(child=serializers.UUIDField(), read_only=True)

    class Meta:
        model = IssueType
        fields = [
            "id",
            "name",
            "description",
            "logo_props",
            "is_active",
            "is_default",
            "level",
            "workspace_id",
            "project_ids",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
        ]
        read_only_fields = ["workspace", "is_default", "is_epic"]

    def validate_name(self, value):
        project_id = self.context.get("project_id")

        issue_type = IssueType.objects.filter(
            project_issue_types__project_id=project_id,
            project_issue_types__deleted_at__isnull=True,
            name__iexact=value,
        )

        if self.instance:
            issue_type = issue_type.exclude(id=self.instance.pk)

        if issue_type.exists():
            raise serializers.ValidationError(detail="WORK_ITEM_TYPE_NAME_ALREADY_EXISTS")

        return value


class IssueTypeLiteSerializer(BaseSerializer):
    class Meta:
        model = IssueType
        fields = ["id", "name", "logo_props"]
        read_only_fields = fields
