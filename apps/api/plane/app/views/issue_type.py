# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.contrib.postgres.aggregates import ArrayAgg
from django.contrib.postgres.fields import ArrayField
from django.db import transaction
from django.db.models import Case, OuterRef, Subquery, UUIDField, Value, When
from django.db.models.functions import Coalesce
from django.db.utils import IntegrityError

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from .base import BaseViewSet
from plane.app.permissions import ROLE, allow_permission
from plane.app.serializers import IssueTypeSerializer
from plane.db.models import Issue, IssueType, Project, ProjectIssueType
from plane.utils.issue_type import seed_default_issue_types


class IssueTypeViewSet(BaseViewSet):
    serializer_class = IssueTypeSerializer
    model = IssueType

    def get_queryset(self):
        project_id = self.kwargs.get("project_id")

        # The project link is what authorizes the row. IssueType is workspace-scoped but
        # always reached through a project URL, and resolving one by workspace slug + pk
        # alone is the cross-project leak documented in plane/app/permissions/page.py
        # (GHSA-g49r / GHSA-ghcr).
        project_link = ProjectIssueType.objects.filter(
            issue_type_id=OuterRef("pk"), project_id=project_id, deleted_at__isnull=True
        )
        all_links = (
            ProjectIssueType.objects.filter(issue_type_id=OuterRef("pk"), deleted_at__isnull=True)
            .values("issue_type_id")
            .annotate(project_ids=ArrayAgg("project_id", distinct=True))
            .values("project_ids")
        )

        return self.filter_queryset(
            super()
            .get_queryset()
            .filter(workspace__slug=self.kwargs.get("slug"))
            .filter(
                project_issue_types__project_id=project_id,
                project_issue_types__deleted_at__isnull=True,
                project_issue_types__project__project_projectmember__member=self.request.user,
                project_issue_types__project__project_projectmember__is_active=True,
                project_issue_types__project__archived_at__isnull=True,
            )
            .exclude(is_epic=True)
            # is_default is already a field on IssueType -- the *workspace* default -- so
            # Django refuses an annotation of that name. The project default lives on the
            # join row and the serializer renames it back to is_default on the way out.
            .annotate(project_is_default=Coalesce(Subquery(project_link.values("is_default")[:1]), Value(False)))
            # Every project the type is linked to, not just the one in the URL, so a
            # subquery rather than an aggregate over the filtered join above.
            .annotate(project_ids=Coalesce(Subquery(all_links), Value([], output_field=ArrayField(UUIDField()))))
            .select_related("workspace")
            .order_by("level", "name")
            .distinct()
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def list(self, request, slug, project_id):
        return Response(IssueTypeSerializer(self.get_queryset(), many=True).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def retrieve(self, request, slug, project_id, pk):
        issue_type = self.get_queryset().get(pk=pk)
        return Response(IssueTypeSerializer(issue_type).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN])
    def create(self, request, slug, project_id):
        project = Project.objects.get(pk=project_id, workspace__slug=slug)
        serializer = IssueTypeSerializer(data=request.data, context={"project_id": project_id})

        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        try:
            with transaction.atomic():
                issue_type = serializer.save(workspace_id=project.workspace_id)
                ProjectIssueType.objects.create(
                    project=project, issue_type=issue_type, level=int(issue_type.level or 0)
                )
        except IntegrityError:
            return Response({"error": "WORK_ITEM_TYPE_NAME_ALREADY_EXISTS"}, status=status.HTTP_400_BAD_REQUEST)

        # Re-read so the response carries the project-scoped annotations
        return Response(
            IssueTypeSerializer(self.get_queryset().get(pk=issue_type.pk)).data,
            status=status.HTTP_201_CREATED,
        )

    @allow_permission([ROLE.ADMIN])
    def partial_update(self, request, slug, project_id, pk):
        issue_type = self.get_queryset().get(pk=pk)
        serializer = IssueTypeSerializer(
            issue_type, data=request.data, partial=True, context={"project_id": project_id}
        )

        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        serializer.save()
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN])
    def mark_as_default(self, request, slug, project_id, pk):
        issue_type = self.get_queryset().get(pk=pk)

        if not issue_type.is_active:
            return Response(
                {"error": "cannot_set_inactive_work_item_type_as_default"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # One UPDATE, so concurrent calls can't leave the project with zero or two defaults
        ProjectIssueType.objects.filter(project_id=project_id).update(
            is_default=Case(When(issue_type_id=issue_type.pk, then=Value(True)), default=Value(False))
        )
        return Response(status=status.HTTP_204_NO_CONTENT)

    @allow_permission([ROLE.ADMIN])
    def destroy(self, request, slug, project_id, pk):
        issue_type = self.get_queryset().get(pk=pk)

        # Both codes are read by the UI -- they match the key names under
        # work_item_types.settings.item_delete_confirmation.errors.*
        if issue_type.project_is_default:
            return Response({"error": "cannot_delete_default_work_item_type"}, status=status.HTTP_400_BAD_REQUEST)

        # Not scoped to this project: the type is workspace-level, so deleting it would
        # strand work items in any other project that uses it.
        if Issue.objects.filter(type_id=issue_type.pk).exists():
            return Response(
                {"error": "cannot_delete_work_item_type_with_associated_work_items"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        issue_type.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @allow_permission([ROLE.ADMIN])
    def enable(self, request, slug, project_id):
        project = Project.objects.get(pk=project_id, workspace__slug=slug)

        # Enabling is a one-way latch, per the confirmation copy at
        # work_item_types.empty_state.enable.confirmation.title, so there is no disable
        # counterpart and a second call is a client error rather than a no-op.
        if project.is_issue_type_enabled:
            return Response({"error": "WORK_ITEM_TYPES_ALREADY_ENABLED"}, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            project.is_issue_type_enabled = True
            project.save()
            seed_default_issue_types(project)

        return Response(IssueTypeSerializer(self.get_queryset(), many=True).data, status=status.HTTP_201_CREATED)
