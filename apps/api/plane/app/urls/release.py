# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from plane.app.views import (
    ReleaseChangelogEndpoint,
    ReleaseLabelAssociationEndpoint,
    ReleaseLabelViewSet,
    ReleaseTagViewSet,
    ReleaseViewSet,
    ReleaseWorkItemEndpoint,
)


urlpatterns = [
    # Releases
    path(
        "workspaces/<str:slug>/releases/",
        ReleaseViewSet.as_view({"get": "list", "post": "create"}),
        name="workspace-release",
    ),
    path(
        "workspaces/<str:slug>/releases/<uuid:pk>/",
        ReleaseViewSet.as_view({"get": "retrieve", "patch": "partial_update", "delete": "destroy"}),
        name="workspace-release",
    ),
    # Changelog
    path(
        "workspaces/<str:slug>/releases/<uuid:release_id>/changelog/",
        ReleaseChangelogEndpoint.as_view(),
        name="workspace-release-changelog",
    ),
    # Work items
    path(
        "workspaces/<str:slug>/releases/<uuid:release_id>/work-items/",
        ReleaseWorkItemEndpoint.as_view(),
        name="workspace-release-work-items",
    ),
    # Labels attached to a release
    path(
        "workspaces/<str:slug>/releases/<uuid:release_id>/labels/",
        ReleaseLabelAssociationEndpoint.as_view(),
        name="workspace-release-labels",
    ),
    # Release tags
    path(
        "workspaces/<str:slug>/release-tags/",
        ReleaseTagViewSet.as_view({"get": "list", "post": "create"}),
        name="workspace-release-tag",
    ),
    path(
        "workspaces/<str:slug>/release-tags/<uuid:pk>/",
        ReleaseTagViewSet.as_view({"get": "retrieve", "patch": "partial_update", "delete": "destroy"}),
        name="workspace-release-tag",
    ),
    # Release label palette
    path(
        "workspaces/<str:slug>/release-labels/",
        ReleaseLabelViewSet.as_view({"get": "list", "post": "create"}),
        name="workspace-release-label",
    ),
    path(
        "workspaces/<str:slug>/release-labels/<uuid:pk>/",
        ReleaseLabelViewSet.as_view({"patch": "partial_update", "delete": "destroy"}),
        name="workspace-release-label",
    ),
]
