# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from plane.app.permissions import ROLE, allow_permission
from plane.app.serializers import ReleaseLabelSerializer
from plane.app.views.base import BaseAPIView, BaseViewSet
from plane.db.models import Project, Release, ReleaseLabel, ReleaseLabelAssociation


class ReleaseLabelViewSet(BaseViewSet):
    """The project-wide release label palette."""

    serializer_class = ReleaseLabelSerializer
    model = ReleaseLabel
    use_read_replica = True
    search_fields = ["name"]

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
        serializer = ReleaseLabelSerializer(data=request.data)
        if serializer.is_valid():
            if ReleaseLabel.objects.filter(project=project, name=serializer.validated_data["name"]).exists():
                return Response(
                    {"error": "A label with this name already exists"},
                    status=status.HTTP_409_CONFLICT,
                )
            # workspace is derived from project by ProjectBaseModel.save()
            serializer.save(project=project)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_permission(allowed_roles=[ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def list(self, request, slug, project_id):
        """The project palette, or just one release's labels when ``release_id`` is given."""
        labels = self.get_queryset()
        release_id = request.query_params.get("release_id")
        if release_id:
            labels = labels.filter(
                label_releases__release_id=release_id,
                label_releases__deleted_at__isnull=True,
            ).distinct()

        return self.paginate(
            request=request,
            queryset=labels,
            on_results=lambda labels: ReleaseLabelSerializer(labels, many=True).data,
        )

    @allow_permission(allowed_roles=[ROLE.ADMIN, ROLE.MEMBER])
    def partial_update(self, request, *args, **kwargs):
        return super().partial_update(request, *args, **kwargs)

    @allow_permission(allowed_roles=[ROLE.ADMIN])
    def destroy(self, request, slug, project_id, pk):
        """Removes the label from the palette entirely, detaching it everywhere."""
        label = ReleaseLabel.objects.get(workspace__slug=slug, project_id=project_id, pk=pk)
        label.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ReleaseLabelAssociationEndpoint(BaseAPIView):
    """Attach palette labels to a release, or detach them without deleting them."""

    @allow_permission(allowed_roles=[ROLE.ADMIN, ROLE.MEMBER])
    def post(self, request, slug, project_id, release_id):
        label_ids = request.data.get("label_ids", [])
        if not label_ids:
            return Response({"error": "label_ids is required"}, status=status.HTTP_400_BAD_REQUEST)

        release = Release.objects.get(workspace__slug=slug, project_id=project_id, pk=release_id)
        labels = ReleaseLabel.objects.filter(workspace__slug=slug, project_id=project_id, pk__in=label_ids)
        if len(labels) != len(set(label_ids)):
            return Response(
                {"error": "Some labels do not exist in this project"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        ReleaseLabelAssociation.objects.bulk_create(
            [
                # bulk_create bypasses ProjectBaseModel.save(), which is what would
                # otherwise derive workspace -- so both are set explicitly here.
                ReleaseLabelAssociation(
                    release=release,
                    label=label,
                    project=release.project,
                    workspace=release.workspace,
                )
                for label in labels
            ],
            batch_size=10,
            ignore_conflicts=True,
        )
        return Response(status=status.HTTP_204_NO_CONTENT)

    @allow_permission(allowed_roles=[ROLE.ADMIN, ROLE.MEMBER])
    def delete(self, request, slug, project_id, release_id):
        label_ids = request.data.get("label_ids", [])
        if not label_ids:
            return Response({"error": "label_ids is required"}, status=status.HTTP_400_BAD_REQUEST)

        ReleaseLabelAssociation.objects.filter(
            workspace__slug=slug,
            project_id=project_id,
            release_id=release_id,
            label_id__in=label_ids,
        ).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
