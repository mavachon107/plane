# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Third Party imports
from rest_framework import serializers

# Module imports
from plane.db.models import (
    Release,
    ReleaseChangelog,
    ReleaseLabel,
    ReleaseLabelAssociation,
    ReleaseTag,
    ReleaseWorkItem,
    User,
)
from plane.utils.content_validator import validate_binary_data, validate_html_content

from .base import BaseSerializer, DynamicBaseSerializer


def _validate_description(data):
    """Sanitize ``description_html`` and reject malformed ``description_binary``.

    Shared by the release and changelog serializers so the two cannot drift.
    """
    if data.get("description_html"):
        is_valid, _error_msg, sanitized_html = validate_html_content(data["description_html"])
        if not is_valid:
            raise serializers.ValidationError({"error": "html content is not valid"})
        if sanitized_html is not None:
            data["description_html"] = sanitized_html

    if data.get("description_binary"):
        is_valid, _error_msg = validate_binary_data(data["description_binary"])
        if not is_valid:
            raise serializers.ValidationError({"description_binary": "Invalid binary data"})

    return data


class ReleaseTagSerializer(BaseSerializer):
    class Meta:
        model = ReleaseTag
        fields = "__all__"
        read_only_fields = [
            "workspace",
            "project",
            "created_by",
            "updated_by",
            "created_at",
            "updated_at",
            "deleted_at",
        ]

    def validate_version(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Version cannot be empty")
        return value


class ReleaseTagLiteSerializer(BaseSerializer):
    class Meta:
        model = ReleaseTag
        fields = ["id", "version", "commit_hash", "git_tag"]
        read_only_fields = fields


class ReleaseLabelSerializer(BaseSerializer):
    class Meta:
        model = ReleaseLabel
        fields = "__all__"
        read_only_fields = [
            "workspace",
            "project",
            "created_by",
            "updated_by",
            "created_at",
            "updated_at",
            "deleted_at",
        ]

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Name cannot be empty")
        return value


class ReleaseLabelLiteSerializer(BaseSerializer):
    class Meta:
        model = ReleaseLabel
        fields = ["id", "name", "color", "sort_order"]
        read_only_fields = fields


class ReleaseWriteSerializer(BaseSerializer):
    tag_id = serializers.PrimaryKeyRelatedField(
        source="tag", queryset=ReleaseTag.objects.all(), required=False, allow_null=True
    )
    lead_id = serializers.PrimaryKeyRelatedField(
        source="lead", queryset=User.objects.all(), required=False, allow_null=True
    )
    label_ids = serializers.ListField(
        child=serializers.PrimaryKeyRelatedField(queryset=ReleaseLabel.objects.all()),
        write_only=True,
        required=False,
    )

    class Meta:
        model = Release
        fields = "__all__"
        read_only_fields = [
            "workspace",
            "project",
            "labels",
            "created_by",
            "updated_by",
            "created_at",
            "updated_at",
            "deleted_at",
        ]

    def to_representation(self, instance):
        data = super().to_representation(instance)
        # Read through the association, not the ``labels`` M2M: M2M traversal builds its
        # own join and so ignores the soft-delete filter that reverse FK managers apply,
        # which would keep detached labels visible.
        data["label_ids"] = [str(association.label_id) for association in instance.label_releases.all()]
        return data

    def validate(self, data):
        data = _validate_description(data)

        release_date = data.get("release_date", getattr(self.instance, "release_date", None))
        target_date = data.get("target_date", getattr(self.instance, "target_date", None))
        if release_date and target_date and target_date < release_date:
            raise serializers.ValidationError("Target date cannot precede release date")

        # `tag` and `label_ids` resolve against every row in their tables, so without this
        # a caller could attach another project's tag or label by passing its id.
        project = self.context.get("project") or getattr(self.instance, "project", None)
        if project:
            tag = data.get("tag")
            if tag and tag.project_id != project.id:
                raise serializers.ValidationError({"tag_id": "Tag does not belong to this project"})

            labels = data.get("label_ids")
            if labels and any(label.project_id != project.id for label in labels):
                raise serializers.ValidationError({"label_ids": "Labels do not belong to this project"})

        return data

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Name cannot be empty")
        return value

    def _sync_labels(self, release, labels):
        """Replace a release's label set, scoping every row to its workspace."""
        ReleaseLabelAssociation.objects.filter(release=release).delete()
        ReleaseLabelAssociation.objects.bulk_create(
            [
                ReleaseLabelAssociation(
                    release=release,
                    label=label,
                    # bulk_create bypasses ProjectBaseModel.save(), which is what would
                    # otherwise derive workspace -- so both are set explicitly here.
                    project=release.project,
                    workspace=release.workspace,
                    created_by=release.created_by,
                    updated_by=release.updated_by,
                )
                for label in labels
            ],
            batch_size=10,
            ignore_conflicts=True,
        )

    def create(self, validated_data):
        labels = validated_data.pop("label_ids", None)
        project = self.context["project"]

        if Release.objects.filter(name=validated_data.get("name"), project=project).exists():
            raise serializers.ValidationError({"error": "Release with this name already exists"})

        # workspace is derived from project by ProjectBaseModel.save()
        release = Release.objects.create(**validated_data, project=project)

        # A changelog is created empty with the release, so reads always find one.
        ReleaseChangelog.objects.create(
            release=release,
            project=project,
            created_by=release.created_by,
            updated_by=release.updated_by,
        )

        if labels is not None:
            self._sync_labels(release, labels)

        return release

    def update(self, instance, validated_data):
        labels = validated_data.pop("label_ids", None)

        name = validated_data.get("name")
        if name and Release.objects.filter(name=name, project=instance.project).exclude(id=instance.id).exists():
            raise serializers.ValidationError({"error": "Release with this name already exists"})

        if labels is not None:
            self._sync_labels(instance, labels)

        return super().update(instance, validated_data)


class ReleaseSerializer(DynamicBaseSerializer):
    tag_detail = ReleaseTagLiteSerializer(read_only=True, source="tag")
    label_details = serializers.SerializerMethodField()
    work_item_count = serializers.IntegerField(read_only=True)
    completed_work_item_count = serializers.IntegerField(read_only=True)

    def get_label_details(self, obj):
        """Only labels still attached -- see the note in ``ReleaseWriteSerializer``."""
        return ReleaseLabelLiteSerializer(
            [association.label for association in obj.label_releases.all()], many=True
        ).data

    class Meta:
        model = Release
        fields = [
            "id",
            "name",
            "description",
            "description_html",
            "status",
            "release_date",
            "target_date",
            "tag",
            "tag_detail",
            "lead",
            "label_details",
            "is_prerelease",
            "sort_order",
            "work_item_count",
            "completed_work_item_count",
            "external_source",
            "external_id",
            "workspace",
            "project",
            "created_by",
            "updated_by",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class ReleaseChangelogSerializer(BaseSerializer):
    class Meta:
        model = ReleaseChangelog
        fields = [
            "id",
            "release",
            "workspace",
            "project",
            "description",
            "description_html",
            "description_stripped",
            "description_binary",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "release",
            "workspace",
            "project",
            "description_stripped",
            "created_at",
            "updated_at",
        ]

    def validate(self, data):
        return _validate_description(data)


class ReleaseWorkItemSerializer(BaseSerializer):
    class Meta:
        model = ReleaseWorkItem
        fields = "__all__"
        read_only_fields = [
            "workspace",
            "project",
            "release",
            "created_by",
            "updated_by",
            "created_at",
            "updated_at",
        ]
