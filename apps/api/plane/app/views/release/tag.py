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
from plane.db.models import ReleaseTag, Workspace


class ReleaseTagViewSet(BaseViewSet):
    serializer_class = ReleaseTagSerializer
    model = ReleaseTag
    use_read_replica = True
    search_fields = ["version"]

    def get_queryset(self):
        return self.filter_queryset(
            super().get_queryset().filter(workspace__slug=self.kwargs.get("slug")).select_related("workspace")
        )

    @allow_permission(allowed_roles=[ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def create(self, request, slug):
        workspace = Workspace.objects.get(slug=slug)
        serializer = ReleaseTagSerializer(data=request.data)
        if serializer.is_valid():
            if ReleaseTag.objects.filter(workspace=workspace, version=serializer.validated_data["version"]).exists():
                return Response(
                    {"error": "A tag with this version already exists"},
                    status=status.HTTP_409_CONFLICT,
                )
            serializer.save(workspace_id=workspace.id)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_permission(allowed_roles=[ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def list(self, request, slug):
        return self.paginate(
            request=request,
            queryset=self.get_queryset(),
            on_results=lambda tags: ReleaseTagSerializer(tags, many=True).data,
        )

    @allow_permission(allowed_roles=[ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def retrieve(self, request, slug, pk):
        return Response(ReleaseTagSerializer(self.get_queryset().get(pk=pk)).data, status=status.HTTP_200_OK)

    @allow_permission(allowed_roles=[ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def partial_update(self, request, slug, pk):
        return super().partial_update(request, slug=slug, pk=pk)

    @allow_permission(allowed_roles=[ROLE.ADMIN], level="WORKSPACE")
    def destroy(self, request, slug, pk):
        tag = ReleaseTag.objects.get(workspace__slug=slug, pk=pk)
        tag.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
