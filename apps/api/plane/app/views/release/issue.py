# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from plane.app.permissions import ROLE, allow_permission
from plane.app.serializers import IssueSerializer
from plane.app.views.base import BaseAPIView
from plane.db.models import Issue, ProjectMember, Release, ReleaseWorkItem
from plane.utils.grouper import issue_queryset_grouper


class ReleaseWorkItemEndpoint(BaseAPIView):
    """List the work items in a release, and add or remove them.

    Releases are workspace-scoped while work items are project-scoped, so reads are
    narrowed to the projects the requesting user actually belongs to.
    """

    use_read_replica = True

    def _accessible_project_ids(self, request, slug):
        return ProjectMember.objects.filter(member=request.user, workspace__slug=slug, is_active=True).values_list(
            "project_id", flat=True
        )

    @allow_permission(allowed_roles=[ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def get(self, request, slug, release_id):
        issues = Issue.issue_objects.filter(
            workspace__slug=slug,
            issue_release__release_id=release_id,
            issue_release__deleted_at__isnull=True,
            project_id__in=self._accessible_project_ids(request, slug),
        ).select_related("workspace", "project", "state", "parent")

        issues = issue_queryset_grouper(queryset=issues, group_by=None, sub_group_by=None)

        return self.paginate(
            request=request,
            queryset=issues.order_by("-created_at").distinct(),
            on_results=lambda issues: IssueSerializer(issues, many=True, fields=self.fields, expand=self.expand).data,
        )

    @allow_permission(allowed_roles=[ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def post(self, request, slug, release_id):
        add_ids = request.data.get("add_ids", [])
        remove_ids = request.data.get("remove_ids", [])

        if not add_ids and not remove_ids:
            return Response(
                {"error": "Pass at least one of add_ids or remove_ids"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        release = Release.objects.get(workspace__slug=slug, pk=release_id)
        project_ids = self._accessible_project_ids(request, slug)

        if add_ids:
            issues = Issue.issue_objects.filter(workspace__slug=slug, pk__in=add_ids, project_id__in=project_ids)
            if len(issues) != len(set(add_ids)):
                return Response(
                    {"error": "Some work items do not exist or are not accessible"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            ReleaseWorkItem.objects.bulk_create(
                [ReleaseWorkItem(release=release, issue=issue, workspace=release.workspace) for issue in issues],
                batch_size=10,
                ignore_conflicts=True,
            )

        if remove_ids:
            ReleaseWorkItem.objects.filter(
                workspace__slug=slug,
                release_id=release_id,
                issue_id__in=remove_ids,
                issue__project_id__in=project_ids,
            ).delete()

        return Response(status=status.HTTP_204_NO_CONTENT)
