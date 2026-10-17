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
from plane.db.models import Issue, Release, ReleaseWorkItem
from plane.utils.grouper import issue_queryset_grouper


class ReleaseWorkItemEndpoint(BaseAPIView):
    """List the work items in a release, and add or remove them.

    A release and its work items share a project, so membership of that project --
    already proven by the permission decorator -- is the only access check needed.
    """

    use_read_replica = True

    @allow_permission(allowed_roles=[ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def get(self, request, slug, project_id, release_id):
        issues = Issue.issue_objects.filter(
            workspace__slug=slug,
            project_id=project_id,
            issue_release__release_id=release_id,
            issue_release__deleted_at__isnull=True,
        ).select_related("workspace", "project", "state", "parent")

        issues = issue_queryset_grouper(queryset=issues, group_by=None, sub_group_by=None)

        return self.paginate(
            request=request,
            queryset=issues.order_by("-created_at"),
            on_results=lambda issues: IssueSerializer(issues, many=True, fields=self.fields, expand=self.expand).data,
        )

    @allow_permission(allowed_roles=[ROLE.ADMIN, ROLE.MEMBER])
    def post(self, request, slug, project_id, release_id):
        add_ids = request.data.get("add_ids", [])
        remove_ids = request.data.get("remove_ids", [])

        if not add_ids and not remove_ids:
            return Response(
                {"error": "Pass at least one of add_ids or remove_ids"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        release = Release.objects.get(workspace__slug=slug, project_id=project_id, pk=release_id)

        if add_ids:
            issues = Issue.issue_objects.filter(workspace__slug=slug, project_id=project_id, pk__in=add_ids)
            if len(issues) != len(set(add_ids)):
                return Response(
                    {"error": "Some work items do not exist in this project"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            ReleaseWorkItem.objects.bulk_create(
                [
                    # bulk_create bypasses ProjectBaseModel.save(), which is what would
                    # otherwise derive workspace -- so both are set explicitly here.
                    ReleaseWorkItem(
                        release=release,
                        issue=issue,
                        project=release.project,
                        workspace=release.workspace,
                    )
                    for issue in issues
                ],
                batch_size=10,
                ignore_conflicts=True,
            )

        if remove_ids:
            ReleaseWorkItem.objects.filter(
                workspace__slug=slug,
                project_id=project_id,
                release_id=release_id,
                issue_id__in=remove_ids,
            ).delete()

        return Response(status=status.HTTP_204_NO_CONTENT)
