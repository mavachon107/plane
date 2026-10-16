# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Contract tests for the release endpoints under ``/api/workspaces/<slug>/projects/<id>/``.

Releases and their work items share a project, so the cases below pin that a release
cannot reach across projects even for a user who belongs to both.
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


def releases_url(project):
    return f"/api/workspaces/{project.workspace.slug}/projects/{project.id}/releases/"


def release_url(project, release):
    return f"/api/workspaces/{project.workspace.slug}/projects/{project.id}/releases/{release.id}/"


def changelog_url(project, release):
    return f"{release_url(project, release)}changelog/"


def work_items_url(project, release):
    return f"{release_url(project, release)}work-items/"


def release_labels_url(project, release):
    return f"{release_url(project, release)}labels/"


def tags_url(project):
    return f"/api/workspaces/{project.workspace.slug}/projects/{project.id}/release-tags/"


def palette_url(project):
    return f"/api/workspaces/{project.workspace.slug}/projects/{project.id}/release-labels/"


@pytest.fixture(autouse=True)
def no_cascade_task():
    """Soft delete fans out through Celery; these tests have no broker."""
    with mock.patch("plane.db.mixins.soft_delete_related_objects"):
        yield


@pytest.fixture
def project(db, workspace, create_user):
    """A project the test user administers."""
    project = Project.objects.create(name="P", identifier="P", workspace=workspace, created_by=create_user)
    ProjectMember.objects.create(project=project, member=create_user, workspace=workspace, role=20)
    return project


@pytest.fixture
def issue(db, workspace, project, create_user):
    state = State.objects.create(name="Todo", project=project, group="backlog", default=True)
    return Issue.objects.create(name="I", workspace=workspace, project=project, state=state, created_by=create_user)


@pytest.fixture
def other_project(db, workspace, create_user):
    """A second project in the same workspace that the test user also administers."""
    project = Project.objects.create(name="Q", identifier="Q", workspace=workspace, created_by=create_user)
    ProjectMember.objects.create(project=project, member=create_user, workspace=workspace, role=20)
    return project


def set_roles(workspace, project, user, role):
    """Set both memberships.

    A workspace admin who belongs to the project is allowed through regardless of
    project role, so a project-role test has to lower the workspace role too.
    """
    WorkspaceMember.objects.filter(workspace=workspace, member=user).update(role=role)
    ProjectMember.objects.filter(project=project, member=user).update(role=role)


@pytest.mark.contract
@pytest.mark.django_db
class TestReleaseCrud:
    def test_create_release(self, session_client, project):
        response = session_client.post(releases_url(project), {"name": "v1.0.0"}, format="json")

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["name"] == "v1.0.0"
        assert response.data["status"] == "unreleased"
        assert response.data["work_item_count"] == 0
        assert str(response.data["project"]) == str(project.id)

    def test_create_derives_workspace_from_project(self, session_client, project):
        response = session_client.post(releases_url(project), {"name": "v1.0.0"}, format="json")

        release = Release.objects.get(pk=response.data["id"])
        assert release.workspace_id == project.workspace_id

    def test_create_also_creates_an_empty_changelog(self, session_client, project):
        """The documented contract is that reading the changelog always finds one."""
        response = session_client.post(releases_url(project), {"name": "v1.0.0"}, format="json")

        changelog = ReleaseChangelog.objects.get(release_id=response.data["id"])
        assert changelog.project_id == project.id

    def test_duplicate_name_in_same_project_is_rejected(self, session_client, project):
        session_client.post(releases_url(project), {"name": "v1.0.0"}, format="json")

        response = session_client.post(releases_url(project), {"name": "v1.0.0"}, format="json")

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_same_name_allowed_in_another_project(self, session_client, project, other_project):
        session_client.post(releases_url(project), {"name": "v1.0.0"}, format="json")

        response = session_client.post(releases_url(other_project), {"name": "v1.0.0"}, format="json")

        assert response.status_code == status.HTTP_201_CREATED

    def test_blank_name_is_rejected(self, session_client, project):
        response = session_client.post(releases_url(project), {"name": "   "}, format="json")

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_target_date_cannot_precede_release_date(self, session_client, project):
        response = session_client.post(
            releases_url(project),
            {"name": "v1.0.0", "release_date": "2026-05-01", "target_date": "2026-04-01"},
            format="json",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_list_returns_only_this_projects_releases(self, session_client, project, other_project):
        Release.objects.create(name="mine", project=project)
        Release.objects.create(name="theirs", project=other_project)

        response = session_client.get(releases_url(project))

        assert response.status_code == status.HTTP_200_OK
        assert [r["name"] for r in response.data["results"]] == ["mine"]

    def test_retrieve_release(self, session_client, project):
        release = Release.objects.create(name="v1.0.0", project=project)

        response = session_client.get(release_url(project, release))

        assert response.status_code == status.HTTP_200_OK
        assert str(response.data["id"]) == str(release.id)

    def test_update_status_and_tag(self, session_client, project):
        release = Release.objects.create(name="v1.0.0", project=project)
        tag = ReleaseTag.objects.create(version="v1.0.0", project=project)

        response = session_client.patch(
            release_url(project, release),
            {"status": "released", "tag_id": str(tag.id), "is_prerelease": True},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "released"
        assert response.data["tag_detail"]["version"] == "v1.0.0"
        assert response.data["is_prerelease"] is True

    def test_cannot_attach_a_tag_from_another_project(self, session_client, project, other_project):
        release = Release.objects.create(name="v1.0.0", project=project)
        foreign_tag = ReleaseTag.objects.create(version="v9.9.9", project=other_project)

        response = session_client.patch(release_url(project, release), {"tag_id": str(foreign_tag.id)}, format="json")

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_delete_release(self, session_client, project):
        release = Release.objects.create(name="v1.0.0", project=project)

        response = session_client.delete(release_url(project, release))

        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert not Release.objects.filter(id=release.id).exists()

    def test_release_from_another_project_is_not_reachable(self, session_client, project, other_project):
        foreign = Release.objects.create(name="v9", project=other_project)

        response = session_client.get(release_url(project, foreign))

        assert response.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.contract
@pytest.mark.django_db
class TestReleasePermissions:
    def test_guest_can_read(self, session_client, workspace, project, create_user):
        set_roles(workspace, project, create_user, 5)
        Release.objects.create(name="v1.0.0", project=project)

        response = session_client.get(releases_url(project))

        assert response.status_code == status.HTTP_200_OK

    def test_guest_cannot_create(self, session_client, workspace, project, create_user):
        set_roles(workspace, project, create_user, 5)

        response = session_client.post(releases_url(project), {"name": "v1.0.0"}, format="json")

        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_member_cannot_delete(self, session_client, workspace, project, create_user):
        set_roles(workspace, project, create_user, 15)
        release = Release.objects.create(name="v1.0.0", project=project)

        response = session_client.delete(release_url(project, release))

        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_workspace_admin_in_project_is_allowed_through(self, session_client, workspace, project, create_user):
        """CE convention: a workspace admin who is a project member bypasses project role."""
        ProjectMember.objects.filter(project=project, member=create_user).update(role=5)
        release = Release.objects.create(name="v1.0.0", project=project)

        response = session_client.delete(release_url(project, release))

        assert response.status_code == status.HTTP_204_NO_CONTENT

    def test_non_member_of_the_project_is_denied(self, session_client, project, create_user):
        ProjectMember.objects.filter(project=project, member=create_user).delete()
        WorkspaceMember.objects.filter(workspace=project.workspace, member=create_user).update(role=15)

        response = session_client.get(releases_url(project))

        assert response.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.contract
@pytest.mark.django_db
class TestReleaseChangelog:
    def test_get_changelog(self, session_client, project):
        release = Release.objects.create(name="v1.0.0", project=project)
        ReleaseChangelog.objects.create(release=release, project=project)

        response = session_client.get(changelog_url(project, release))

        assert response.status_code == status.HTTP_200_OK
        assert str(response.data["release"]) == str(release.id)

    def test_update_changelog_derives_stripped_text(self, session_client, project):
        release = Release.objects.create(name="v1.0.0", project=project)
        ReleaseChangelog.objects.create(release=release, project=project)

        response = session_client.patch(
            changelog_url(project, release),
            {"description_html": "<p>Fixed <em>things</em></p>"},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["description_stripped"] == "Fixed things"

    def test_guest_cannot_update_changelog(self, session_client, workspace, project, create_user):
        release = Release.objects.create(name="v1.0.0", project=project)
        ReleaseChangelog.objects.create(release=release, project=project)
        set_roles(workspace, project, create_user, 5)

        response = session_client.patch(
            changelog_url(project, release), {"description_html": "<p>x</p>"}, format="json"
        )

        assert response.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.contract
@pytest.mark.django_db
class TestReleaseTagsAndLabels:
    def test_create_and_list_tag(self, session_client, project):
        created = session_client.post(
            tags_url(project),
            {"version": "v1.2.0", "commit_hash": "abc123", "git_tag": "v1.2.0"},
            format="json",
        )
        assert created.status_code == status.HTTP_201_CREATED

        listed = session_client.get(tags_url(project))
        assert [t["version"] for t in listed.data["results"]] == ["v1.2.0"]

    def test_duplicate_tag_version_in_same_project_conflicts(self, session_client, project):
        ReleaseTag.objects.create(version="v1.2.0", project=project)

        response = session_client.post(tags_url(project), {"version": "v1.2.0"}, format="json")

        assert response.status_code == status.HTTP_409_CONFLICT

    def test_same_tag_version_allowed_in_another_project(self, session_client, project, other_project):
        ReleaseTag.objects.create(version="v1.2.0", project=project)

        response = session_client.post(tags_url(other_project), {"version": "v1.2.0"}, format="json")

        assert response.status_code == status.HTTP_201_CREATED

    def test_create_palette_label(self, session_client, project):
        response = session_client.post(palette_url(project), {"name": "Breaking", "color": "#4E5355"}, format="json")

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["color"] == "#4E5355"

    def test_attach_and_detach_labels(self, session_client, project):
        release = Release.objects.create(name="v1.0.0", project=project)
        label = ReleaseLabel.objects.create(name="Breaking", project=project)

        attached = session_client.post(
            release_labels_url(project, release), {"label_ids": [str(label.id)]}, format="json"
        )
        assert attached.status_code == status.HTTP_204_NO_CONTENT
        after_attach = session_client.get(release_url(project, release))
        assert [label["name"] for label in after_attach.data["label_details"]] == ["Breaking"]

        detached = session_client.delete(
            release_labels_url(project, release), {"label_ids": [str(label.id)]}, format="json"
        )
        assert detached.status_code == status.HTTP_204_NO_CONTENT
        after_detach = session_client.get(release_url(project, release))
        assert after_detach.data["label_details"] == []
        assert not ReleaseLabelAssociation.objects.filter(release=release).exists()
        # Detaching leaves the palette entry alone.
        assert ReleaseLabel.objects.filter(id=label.id).exists()

    def test_detached_label_is_hidden_despite_the_m2m_accessor(self, session_client, project):
        """Regression: soft-deleted join rows still satisfy ``release.labels``.

        M2M traversal builds its own join and so skips the soft-delete filter that
        reverse FK managers apply. Serialization must therefore go through
        ``label_releases``, or a detached label keeps showing up.
        """
        release = Release.objects.create(name="v1.0.0", project=project)
        label = ReleaseLabel.objects.create(name="Breaking", project=project)
        session_client.post(release_labels_url(project, release), {"label_ids": [str(label.id)]}, format="json")
        session_client.delete(release_labels_url(project, release), {"label_ids": [str(label.id)]}, format="json")

        # The raw accessor still sees the soft-deleted row ...
        assert release.labels.count() == 1
        # ... but neither the API nor the soft-delete-aware manager does.
        assert session_client.get(release_url(project, release)).data["label_details"] == []
        assert not ReleaseLabelAssociation.objects.filter(release=release).exists()

    def test_attach_rejects_label_from_another_project(self, session_client, project, other_project):
        release = Release.objects.create(name="v1.0.0", project=project)
        foreign_label = ReleaseLabel.objects.create(name="Breaking", project=other_project)

        response = session_client.post(
            release_labels_url(project, release), {"label_ids": [str(foreign_label.id)]}, format="json"
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_attached_association_carries_both_project_and_workspace(self, session_client, project):
        """bulk_create bypasses save(), so workspace is not derived -- pin that it is set."""
        release = Release.objects.create(name="v1.0.0", project=project)
        label = ReleaseLabel.objects.create(name="Breaking", project=project)

        session_client.post(release_labels_url(project, release), {"label_ids": [str(label.id)]}, format="json")

        association = ReleaseLabelAssociation.objects.get(release=release, label=label)
        assert association.project_id == project.id
        assert association.workspace_id == project.workspace_id

    def test_list_labels_for_one_release(self, session_client, project):
        release = Release.objects.create(name="v1.0.0", project=project)
        attached = ReleaseLabel.objects.create(name="Breaking", project=project)
        ReleaseLabel.objects.create(name="Unused", project=project)
        session_client.post(release_labels_url(project, release), {"label_ids": [str(attached.id)]}, format="json")

        response = session_client.get(palette_url(project), {"release_id": str(release.id)})

        assert [label["name"] for label in response.data["results"]] == ["Breaking"]


@pytest.mark.contract
@pytest.mark.django_db
class TestReleaseWorkItems:
    def test_add_and_list_work_items(self, session_client, project, issue):
        release = Release.objects.create(name="v1.0.0", project=project)

        added = session_client.post(work_items_url(project, release), {"add_ids": [str(issue.id)]}, format="json")
        assert added.status_code == status.HTTP_204_NO_CONTENT

        listed = session_client.get(work_items_url(project, release))
        assert listed.status_code == status.HTTP_200_OK
        assert [str(item["id"]) for item in listed.data["results"]] == [str(issue.id)]

    def test_added_work_item_carries_both_project_and_workspace(self, session_client, project, issue):
        """bulk_create bypasses save(), so workspace is not derived -- pin that it is set."""
        release = Release.objects.create(name="v1.0.0", project=project)

        session_client.post(work_items_url(project, release), {"add_ids": [str(issue.id)]}, format="json")

        link = ReleaseWorkItem.objects.get(release=release, issue=issue)
        assert link.project_id == project.id
        assert link.workspace_id == project.workspace_id

    def test_remove_work_item(self, session_client, project, issue):
        release = Release.objects.create(name="v1.0.0", project=project)
        ReleaseWorkItem.objects.create(release=release, issue=issue, project=project, workspace=project.workspace)

        response = session_client.post(work_items_url(project, release), {"remove_ids": [str(issue.id)]}, format="json")

        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert not ReleaseWorkItem.objects.filter(release=release, issue=issue).exists()

    def test_neither_add_nor_remove_is_rejected(self, session_client, project):
        release = Release.objects.create(name="v1.0.0", project=project)

        response = session_client.post(work_items_url(project, release), {}, format="json")

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_adding_the_same_work_item_twice_is_idempotent(self, session_client, project, issue):
        release = Release.objects.create(name="v1.0.0", project=project)
        payload = {"add_ids": [str(issue.id)]}

        session_client.post(work_items_url(project, release), payload, format="json")
        session_client.post(work_items_url(project, release), payload, format="json")

        assert ReleaseWorkItem.objects.filter(release=release, issue=issue).count() == 1

    def test_cannot_add_work_item_from_a_different_project(self, session_client, project, other_project, create_user):
        """True even though the caller administers both projects -- a release owns one project."""
        state = State.objects.create(name="Todo", project=other_project, group="backlog", default=True)
        foreign_issue = Issue.objects.create(
            name="elsewhere", workspace=other_project.workspace, project=other_project, state=state
        )
        release = Release.objects.create(name="v1.0.0", project=project)

        response = session_client.post(
            work_items_url(project, release), {"add_ids": [str(foreign_issue.id)]}, format="json"
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert not ReleaseWorkItem.objects.filter(release=release).exists()

    def test_list_returns_only_this_projects_work_items(self, session_client, project, other_project, issue):
        """A stray cross-project link must not widen the release's work item list."""
        state = State.objects.create(name="Todo", project=other_project, group="backlog", default=True)
        foreign_issue = Issue.objects.create(
            name="elsewhere", workspace=other_project.workspace, project=other_project, state=state
        )
        release = Release.objects.create(name="v1.0.0", project=project)
        ReleaseWorkItem.objects.create(release=release, issue=issue, project=project, workspace=project.workspace)
        ReleaseWorkItem.objects.create(
            release=release, issue=foreign_issue, project=other_project, workspace=other_project.workspace
        )

        response = session_client.get(work_items_url(project, release))

        assert response.status_code == status.HTTP_200_OK
        assert [str(item["id"]) for item in response.data["results"]] == [str(issue.id)]

    def test_work_item_count_reflects_associations(self, session_client, project, issue):
        release = Release.objects.create(name="v1.0.0", project=project)
        ReleaseWorkItem.objects.create(release=release, issue=issue, project=project, workspace=project.workspace)

        response = session_client.get(release_url(project, release))

        assert response.data["work_item_count"] == 1
