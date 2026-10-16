# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.db.models import Count, Prefetch, Q

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from plane.app.permissions import ROLE, allow_permission
from plane.app.serializers import (
    ReleaseChangelogSerializer,
    ReleaseSerializer,
    ReleaseWriteSerializer,
)
from plane.app.views.base import BaseAPIView, BaseViewSet
from plane.db.models import Project, Release, ReleaseChangelog, ReleaseLabelAssociation


class ReleaseViewSet(BaseViewSet):
    serializer_class = ReleaseWriteSerializer
    model = Release
    use_read_replica = True
    search_fields = ["name"]
    filterset_fields = ["status", "is_prerelease"]

    def get_queryset(self):
        return self.filter_queryset(
            super()
            .get_queryset()
            .filter(workspace__slug=self.kwargs.get("slug"), project_id=self.kwargs.get("project_id"))
            .select_related("workspace", "project", "tag", "lead")
            .prefetch_related(
                Prefetch(
                    "label_releases",
                    queryset=ReleaseLabelAssociation.objects.select_related("label"),
                )
            )
            .annotate(
                work_item_count=Count(
                    "issue_release",
                    filter=Q(issue_release__deleted_at__isnull=True),
                    distinct=True,
                )
            )
            .distinct()
        )

    @allow_permission(allowed_roles=[ROLE.ADMIN, ROLE.MEMBER])
    def create(self, request, slug, project_id):
        project = Project.objects.get(workspace__slug=slug, pk=project_id)
        serializer = ReleaseWriteSerializer(data=request.data, context={"project": project})
        if serializer.is_valid():
            serializer.save()
            release = self.get_queryset().get(pk=serializer.instance.id)
            return Response(ReleaseSerializer(release).data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_permission(allowed_roles=[ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def list(self, request, slug, project_id):
        releases = self.get_queryset().order_by("-sort_order")
        return self.paginate(
            request=request,
            queryset=releases,
            on_results=lambda releases: ReleaseSerializer(
                releases, many=True, fields=self.fields, expand=self.expand
            ).data,
        )

    @allow_permission(allowed_roles=[ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def retrieve(self, request, slug, project_id, pk):
        release = self.get_queryset().get(pk=pk)
        return Response(
            ReleaseSerializer(release, fields=self.fields, expand=self.expand).data,
            status=status.HTTP_200_OK,
        )

    @allow_permission(allowed_roles=[ROLE.ADMIN, ROLE.MEMBER])
    def partial_update(self, request, slug, project_id, pk):
        release = self.get_queryset().get(pk=pk)
        serializer = ReleaseWriteSerializer(
            release, data=request.data, partial=True, context={"project": release.project}
        )
        if serializer.is_valid():
            serializer.save()
            return Response(ReleaseSerializer(self.get_queryset().get(pk=pk)).data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_permission(allowed_roles=[ROLE.ADMIN])
    def destroy(self, request, slug, project_id, pk):
        release = Release.objects.get(workspace__slug=slug, project_id=project_id, pk=pk)
        release.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ReleaseChangelogEndpoint(BaseAPIView):
    """Read and write the changelog attached to a release."""

    use_read_replica = True

    @allow_permission(allowed_roles=[ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def get(self, request, slug, project_id, release_id):
        changelog = ReleaseChangelog.objects.get(workspace__slug=slug, project_id=project_id, release_id=release_id)
        return Response(ReleaseChangelogSerializer(changelog).data, status=status.HTTP_200_OK)

    @allow_permission(allowed_roles=[ROLE.ADMIN, ROLE.MEMBER])
    def patch(self, request, slug, project_id, release_id):
        changelog = ReleaseChangelog.objects.get(workspace__slug=slug, project_id=project_id, release_id=release_id)
        serializer = ReleaseChangelogSerializer(changelog, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
