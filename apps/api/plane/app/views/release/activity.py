# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from plane.app.permissions import ROLE, allow_permission
from plane.app.views.base import BaseAPIView
from plane.db.models import Release, ReleaseWorkItem


class ReleaseActivityEndpoint(BaseAPIView):
    """A release's activity feed.

    Releases have no activity table of their own; the feed is derived from the audit
    fields on the release and on its work item rows, so it needs no extra bookkeeping.
    """

    use_read_replica = True

    @allow_permission(allowed_roles=[ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def get(self, request, slug, project_id, release_id):
        release = Release.objects.filter(workspace__slug=slug, project_id=project_id, pk=release_id).first()
        if release is None:
            return Response({"error": "The required object does not exist."}, status=status.HTTP_404_NOT_FOUND)

        activities = [
            {
                "id": f"release-{release.id}",
                "verb": "created",
                "actor": release.created_by_id,
                "created_at": release.created_at,
                "work_item": None,
            }
        ]

        release_work_items = ReleaseWorkItem.objects.filter(
            workspace__slug=slug,
            project_id=project_id,
            release_id=release_id,
            issue__deleted_at__isnull=True,
        ).select_related("issue", "issue__project")
        for item in release_work_items:
            activities.append(
                {
                    "id": str(item.id),
                    "verb": "added_work_item",
                    "actor": item.created_by_id,
                    "created_at": item.created_at,
                    "work_item": {
                        "id": item.issue_id,
                        "name": item.issue.name,
                        "sequence_id": item.issue.sequence_id,
                        "project_identifier": item.issue.project.identifier,
                    },
                }
            )

        activities.sort(key=lambda activity: activity["created_at"])
        return Response(activities, status=status.HTTP_200_OK)
