# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path


from plane.app.views import IssueTypeViewSet


# The route uses the product noun, as the newer endpoints do (see intake-work-items/ in
# urls/intake.py). The model and table keep the legacy IssueType / issue_types names.
urlpatterns = [
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/work-item-types/",
        IssueTypeViewSet.as_view({"get": "list", "post": "create"}),
        name="project-work-item-types",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/work-item-types/enable/",
        IssueTypeViewSet.as_view({"post": "enable"}),
        name="project-work-item-types-enable",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/work-item-types/<uuid:pk>/",
        IssueTypeViewSet.as_view({"get": "retrieve", "patch": "partial_update", "delete": "destroy"}),
        name="project-work-item-type",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/work-item-types/<uuid:pk>/mark-default/",
        IssueTypeViewSet.as_view({"post": "mark_as_default"}),
        name="project-work-item-type-mark-default",
    ),
]
