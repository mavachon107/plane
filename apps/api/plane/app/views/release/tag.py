# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from plane.app.permissions import ROLE, allow_permission
from plane.app.serializers import ReleaseTagSerializer
from plane.app.views.base import BaseViewSet
from plane.db.models import Project, ReleaseTag


class ReleaseTagViewSet(BaseViewSet):
    serializer_class = ReleaseTagSerializer
    model = ReleaseTag
    use_read_replica = True
    search_fields = ["version"]

    def get_queryset(self):
        return self.filter_queryset(
            super()
            .get_queryset()
            .filter(workspace__slug=self.kwargs.get("slug"), project_id=self.kwargs.get("project_id"))
            .select_related("workspace", "project")
        )

    @allow_permission(allowed_roles=[ROLE.ADMIN, ROLE.MEMBER])
    def create(self, request, slug, project_id):
        project = Project.objects.get(workspace__slug=slug, pk=project_id)
        serializer = ReleaseTagSerializer(data=request.data)
        if serializer.is_valid():
            if ReleaseTag.objects.filter(project=project, version=serializer.validated_data["version"]).exists():
                return Response(
                    {"error": "A tag with this version already exists"},
                    status=status.HTTP_409_CONFLICT,
                )
            # workspace is derived from project by ProjectBaseModel.save()
            serializer.save(project=project)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_permission(allowed_roles=[ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def list(self, request, slug, project_id):
        return self.paginate(
            request=request,
            queryset=self.get_queryset(),
            on_results=lambda tags: ReleaseTagSerializer(tags, many=True).data,
        )

    @allow_permission(allowed_roles=[ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def retrieve(self, request, slug, project_id, pk):
        return Response(ReleaseTagSerializer(self.get_queryset().get(pk=pk)).data, status=status.HTTP_200_OK)

    @allow_permission(allowed_roles=[ROLE.ADMIN, ROLE.MEMBER])
    def partial_update(self, request, *args, **kwargs):
        return super().partial_update(request, *args, **kwargs)

    @allow_permission(allowed_roles=[ROLE.ADMIN])
    def destroy(self, request, slug, project_id, pk):
        tag = ReleaseTag.objects.get(workspace__slug=slug, project_id=project_id, pk=pk)
        tag.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
