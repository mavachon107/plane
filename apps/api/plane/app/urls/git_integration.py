# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from plane.app.views import GitRepositoryEndpoint, GithubWebhookEndpoint, IssueGitReferenceEndpoint

urlpatterns = [
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/git-repository/",
        GitRepositoryEndpoint.as_view(),
        name="project-git-repository",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/issues/<uuid:issue_id>/git-references/",
        IssueGitReferenceEndpoint.as_view(),
        name="issue-git-references",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/issues/<uuid:issue_id>/git-references/<uuid:pk>/",
        IssueGitReferenceEndpoint.as_view(),
        name="issue-git-references",
    ),
    path(
        "git/github/<uuid:repository_id>/webhook/",
        GithubWebhookEndpoint.as_view(),
        name="github-webhook",
    ),
]
