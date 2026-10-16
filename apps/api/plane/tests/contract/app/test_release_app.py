# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Contract tests for the first-party release endpoints under ``/api/workspaces/<slug>/``.

Releases are workspace-scoped while work items are project-scoped, so the work-item
cases assert that a release cannot be used to reach a project the caller is not in.
"""

from unittest import mock

import pytest
from rest_framework import status

from plane.db.models import (
    Issue,
    Project,
    ProjectMember,
    Release,
    ReleaseChangelog,
    ReleaseLabel,
    ReleaseLabelAssociation,
    ReleaseTag,
    ReleaseWorkItem,
    State,
    WorkspaceMember,
)


def releases_url(workspace):
    return f"/api/workspaces/{workspace.slug}/releases/"


def release_url(workspace, release):
    return f"/api/workspaces/{workspace.slug}/releases/{release.id}/"


def changelog_url(workspace, release):
    return f"/api/workspaces/{workspace.slug}/releases/{release.id}/changelog/"


def work_items_url(workspace, release):
    return f"/api/workspaces/{workspace.slug}/releases/{release.id}/work-items/"


def release_labels_url(workspace, release):
    return f"/api/workspaces/{workspace.slug}/releases/{release.id}/labels/"


def tags_url(workspace):
    return f"/api/workspaces/{workspace.slug}/release-tags/"


def palette_url(workspace):
    return f"/api/workspaces/{workspace.slug}/release-labels/"


@pytest.fixture(autouse=True)
def no_cascade_task():
    """Soft delete fans out through Celery; these tests have no broker."""
    with mock.patch("plane.db.mixins.soft_delete_related_objects"):
        yield


@pytest.fixture
def project_with_issue(db, workspace, create_user):
    project = Project.objects.create(name="P", identifier="P", workspace=workspace, created_by=create_user)
    ProjectMember.objects.create(project=project, member=create_user, workspace=workspace, role=20)
    state = State.objects.create(name="Todo", project=project, group="backlog", default=True)
    issue = Issue.objects.create(name="I", workspace=workspace, project=project, state=state, created_by=create_user)
    return project, issue


@pytest.mark.contract
@pytest.mark.django_db
class TestReleaseCrud:
    def test_create_release(self, session_client, workspace):
        response = session_client.post(releases_url(workspace), {"name": "v1.0.0"}, format="json")

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["name"] == "v1.0.0"
        assert response.data["status"] == "unreleased"
        assert response.data["work_item_count"] == 0

    def test_create_also_creates_an_empty_changelog(self, session_client, workspace):
        """The documented contract is that ``get_changelog`` always finds one."""
        response = session_client.post(releases_url(workspace), {"name": "v1.0.0"}, format="json")

        assert ReleaseChangelog.objects.filter(release_id=response.data["id"]).exists()

    def test_duplicate_name_is_rejected(self, session_client, workspace):
        session_client.post(releases_url(workspace), {"name": "v1.0.0"}, format="json")

        response = session_client.post(releases_url(workspace), {"name": "v1.0.0"}, format="json")

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_blank_name_is_rejected(self, session_client, workspace):
        response = session_client.post(releases_url(workspace), {"name": "   "}, format="json")

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_target_date_cannot_precede_release_date(self, session_client, workspace):
        response = session_client.post(
            releases_url(workspace),
            {"name": "v1.0.0", "release_date": "2026-05-01", "target_date": "2026-04-01"},
            format="json",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_list_returns_the_release(self, session_client, workspace):
        Release.objects.create(name="v1.0.0", workspace=workspace)

        response = session_client.get(releases_url(workspace))

        assert response.status_code == status.HTTP_200_OK
        assert [r["name"] for r in response.data["results"]] == ["v1.0.0"]

    def test_retrieve_release(self, session_client, workspace):
        release = Release.objects.create(name="v1.0.0", workspace=workspace)

        response = session_client.get(release_url(workspace, release))

        assert response.status_code == status.HTTP_200_OK
        assert str(response.data["id"]) == str(release.id)

    def test_update_status_and_tag(self, session_client, workspace):
        release = Release.objects.create(name="v1.0.0", workspace=workspace)
        tag = ReleaseTag.objects.create(version="v1.0.0", workspace=workspace)

        response = session_client.patch(
            release_url(workspace, release),
            {"status": "released", "tag_id": str(tag.id), "is_prerelease": True},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "released"
        assert response.data["tag_detail"]["version"] == "v1.0.0"
        assert response.data["is_prerelease"] is True

    def test_delete_release(self, session_client, workspace):
        release = Release.objects.create(name="v1.0.0", workspace=workspace)

        response = session_client.delete(release_url(workspace, release))

        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert not Release.objects.filter(id=release.id).exists()

    def test_release_from_another_workspace_is_not_reachable(self, session_client, workspace, create_user):
        from plane.db.models import Workspace

        other = Workspace.objects.create(name="Other", owner=create_user, slug="other-ws")
        WorkspaceMember.objects.create(workspace=other, member=create_user, role=20)
        foreign = Release.objects.create(name="v9", workspace=other)

        response = session_client.get(release_url(workspace, foreign))

        assert response.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.contract
@pytest.mark.django_db
class TestReleasePermissions:
    def test_guest_can_read(self, session_client, workspace, create_user):
        WorkspaceMember.objects.filter(workspace=workspace, member=create_user).update(role=5)
        Release.objects.create(name="v1.0.0", workspace=workspace)

        response = session_client.get(releases_url(workspace))

        assert response.status_code == status.HTTP_200_OK

    def test_guest_cannot_create(self, session_client, workspace, create_user):
        WorkspaceMember.objects.filter(workspace=workspace, member=create_user).update(role=5)

        response = session_client.post(releases_url(workspace), {"name": "v1.0.0"}, format="json")

        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_member_cannot_delete(self, session_client, workspace, create_user):
        WorkspaceMember.objects.filter(workspace=workspace, member=create_user).update(role=15)
        release = Release.objects.create(name="v1.0.0", workspace=workspace)

        response = session_client.delete(release_url(workspace, release))

        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_non_member_is_denied(self, api_client, workspace, create_bot_user):
        api_client.force_authenticate(user=create_bot_user)

        response = api_client.get(releases_url(workspace))

        assert response.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.contract
@pytest.mark.django_db
class TestReleaseChangelog:
    def test_get_changelog(self, session_client, workspace):
        release = Release.objects.create(name="v1.0.0", workspace=workspace)
        ReleaseChangelog.objects.create(release=release, workspace=workspace)

        response = session_client.get(changelog_url(workspace, release))

        assert response.status_code == status.HTTP_200_OK
        assert str(response.data["release"]) == str(release.id)

    def test_update_changelog_derives_stripped_text(self, session_client, workspace):
        release = Release.objects.create(name="v1.0.0", workspace=workspace)
        ReleaseChangelog.objects.create(release=release, workspace=workspace)

        response = session_client.patch(
            changelog_url(workspace, release),
            {"description_html": "<p>Fixed <em>things</em></p>"},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["description_stripped"] == "Fixed things"

    def test_guest_cannot_update_changelog(self, session_client, workspace, create_user):
        release = Release.objects.create(name="v1.0.0", workspace=workspace)
        ReleaseChangelog.objects.create(release=release, workspace=workspace)
        WorkspaceMember.objects.filter(workspace=workspace, member=create_user).update(role=5)

        response = session_client.patch(
            changelog_url(workspace, release), {"description_html": "<p>x</p>"}, format="json"
        )

        assert response.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.contract
@pytest.mark.django_db
class TestReleaseTagsAndLabels:
    def test_create_and_list_tag(self, session_client, workspace):
        created = session_client.post(
            tags_url(workspace),
            {"version": "v1.2.0", "commit_hash": "abc123", "git_tag": "v1.2.0"},
            format="json",
        )
        assert created.status_code == status.HTTP_201_CREATED

        listed = session_client.get(tags_url(workspace))
        assert [t["version"] for t in listed.data["results"]] == ["v1.2.0"]

    def test_duplicate_tag_version_conflicts(self, session_client, workspace):
        ReleaseTag.objects.create(version="v1.2.0", workspace=workspace)

        response = session_client.post(tags_url(workspace), {"version": "v1.2.0"}, format="json")

        assert response.status_code == status.HTTP_409_CONFLICT

    def test_create_palette_label(self, session_client, workspace):
        response = session_client.post(palette_url(workspace), {"name": "Breaking", "color": "#4E5355"}, format="json")

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["color"] == "#4E5355"

    def test_attach_and_detach_labels(self, session_client, workspace):
        release = Release.objects.create(name="v1.0.0", workspace=workspace)
        label = ReleaseLabel.objects.create(name="Breaking", workspace=workspace)

        attached = session_client.post(
            release_labels_url(workspace, release), {"label_ids": [str(label.id)]}, format="json"
        )
        assert attached.status_code == status.HTTP_204_NO_CONTENT
        after_attach = session_client.get(release_url(workspace, release))
        assert [label["name"] for label in after_attach.data["label_details"]] == ["Breaking"]

        detached = session_client.delete(
            release_labels_url(workspace, release), {"label_ids": [str(label.id)]}, format="json"
        )
        assert detached.status_code == status.HTTP_204_NO_CONTENT
        after_detach = session_client.get(release_url(workspace, release))
        assert after_detach.data["label_details"] == []
        assert not ReleaseLabelAssociation.objects.filter(release=release).exists()
        # Detaching leaves the palette entry alone.
        assert ReleaseLabel.objects.filter(id=label.id).exists()

    def test_detached_label_is_hidden_despite_the_m2m_accessor(self, session_client, workspace):
        """Regression: soft-deleted join rows still satisfy ``release.labels``.

        M2M traversal builds its own join and so skips the soft-delete filter that
        reverse FK managers apply. Serialization must therefore go through
        ``label_releases``, or a detached label keeps showing up.
        """
        release = Release.objects.create(name="v1.0.0", workspace=workspace)
        label = ReleaseLabel.objects.create(name="Breaking", workspace=workspace)
        session_client.post(release_labels_url(workspace, release), {"label_ids": [str(label.id)]}, format="json")
        session_client.delete(release_labels_url(workspace, release), {"label_ids": [str(label.id)]}, format="json")

        # The raw accessor still sees the soft-deleted row ...
        assert release.labels.count() == 1
        # ... but neither the API nor the soft-delete-aware manager does.
        assert session_client.get(release_url(workspace, release)).data["label_details"] == []
        assert not ReleaseLabelAssociation.objects.filter(release=release).exists()

    def test_attach_rejects_label_from_another_workspace(self, session_client, workspace, create_user):
        from plane.db.models import Workspace

        other = Workspace.objects.create(name="Other", owner=create_user, slug="other-ws-2")
        release = Release.objects.create(name="v1.0.0", workspace=workspace)
        foreign_label = ReleaseLabel.objects.create(name="Breaking", workspace=other)

        response = session_client.post(
            release_labels_url(workspace, release), {"label_ids": [str(foreign_label.id)]}, format="json"
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_list_labels_for_one_release(self, session_client, workspace):
        release = Release.objects.create(name="v1.0.0", workspace=workspace)
        attached = ReleaseLabel.objects.create(name="Breaking", workspace=workspace)
        ReleaseLabel.objects.create(name="Unused", workspace=workspace)
        session_client.post(release_labels_url(workspace, release), {"label_ids": [str(attached.id)]}, format="json")

        response = session_client.get(palette_url(workspace), {"release_id": str(release.id)})

        assert [label["name"] for label in response.data["results"]] == ["Breaking"]


@pytest.mark.contract
@pytest.mark.django_db
class TestReleaseWorkItems:
    def test_add_and_list_work_items(self, session_client, workspace, project_with_issue):
        _project, issue = project_with_issue
        release = Release.objects.create(name="v1.0.0", workspace=workspace)

        added = session_client.post(work_items_url(workspace, release), {"add_ids": [str(issue.id)]}, format="json")
        assert added.status_code == status.HTTP_204_NO_CONTENT

        listed = session_client.get(work_items_url(workspace, release))
        assert listed.status_code == status.HTTP_200_OK
        assert [str(item["id"]) for item in listed.data["results"]] == [str(issue.id)]

    def test_remove_work_item(self, session_client, workspace, project_with_issue):
        _project, issue = project_with_issue
        release = Release.objects.create(name="v1.0.0", workspace=workspace)
        ReleaseWorkItem.objects.create(release=release, issue=issue, workspace=workspace)

        response = session_client.post(
            work_items_url(workspace, release), {"remove_ids": [str(issue.id)]}, format="json"
        )

        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert not ReleaseWorkItem.objects.filter(release=release, issue=issue).exists()

    def test_neither_add_nor_remove_is_rejected(self, session_client, workspace):
        release = Release.objects.create(name="v1.0.0", workspace=workspace)

        response = session_client.post(work_items_url(workspace, release), {}, format="json")

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_adding_the_same_work_item_twice_is_idempotent(self, session_client, workspace, project_with_issue):
        _project, issue = project_with_issue
        release = Release.objects.create(name="v1.0.0", workspace=workspace)
        payload = {"add_ids": [str(issue.id)]}

        session_client.post(work_items_url(workspace, release), payload, format="json")
        session_client.post(work_items_url(workspace, release), payload, format="json")

        assert ReleaseWorkItem.objects.filter(release=release, issue=issue).count() == 1

    def test_cannot_add_work_item_from_a_project_the_user_is_not_in(self, session_client, workspace, create_user):
        """A workspace-scoped release must not become a cross-project read primitive."""
        other_owner = create_user
        project = Project.objects.create(name="Private", identifier="PRIV", workspace=workspace, created_by=other_owner)
        state = State.objects.create(name="Todo", project=project, group="backlog", default=True)
        issue = Issue.objects.create(name="secret", workspace=workspace, project=project, state=state)
        # Deliberately no ProjectMember row for create_user.
        release = Release.objects.create(name="v1.0.0", workspace=workspace)

        response = session_client.post(work_items_url(workspace, release), {"add_ids": [str(issue.id)]}, format="json")

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert not ReleaseWorkItem.objects.filter(release=release).exists()

    def test_list_hides_work_items_from_inaccessible_projects(self, session_client, workspace, create_user):
        project = Project.objects.create(name="Private", identifier="PRIV", workspace=workspace, created_by=create_user)
        state = State.objects.create(name="Todo", project=project, group="backlog", default=True)
        issue = Issue.objects.create(name="secret", workspace=workspace, project=project, state=state)
        release = Release.objects.create(name="v1.0.0", workspace=workspace)
        ReleaseWorkItem.objects.create(release=release, issue=issue, workspace=workspace)

        response = session_client.get(work_items_url(workspace, release))

        assert response.status_code == status.HTTP_200_OK
        assert response.data["results"] == []

    def test_work_item_count_reflects_associations(self, session_client, workspace, project_with_issue):
        _project, issue = project_with_issue
        release = Release.objects.create(name="v1.0.0", workspace=workspace)
        ReleaseWorkItem.objects.create(release=release, issue=issue, workspace=workspace)

        response = session_client.get(release_url(workspace, release))

        assert response.data["work_item_count"] == 1
