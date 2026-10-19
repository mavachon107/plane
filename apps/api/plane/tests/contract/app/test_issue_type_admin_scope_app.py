# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Contract tests for IssueTypeViewSet.

Work item type configuration (enable, create, edit, delete, set default) is
project-admin-only, matching the project settings UI; reads are open to any project
member. Two things get particular attention:

* ``IssueType`` is workspace-scoped but reached through a project URL, so a type linked
  to one project must be invisible under another project's URL -- resolving by workspace
  slug + pk alone is the leak documented in ``plane/app/permissions/page.py``.
* The *project* default lives on the ``ProjectIssueType`` join row, so ``is_default``
  must not be writable through PATCH and must move only through ``mark-default``.
"""

from uuid import uuid4

import pytest
from rest_framework import status
from rest_framework.test import APIClient

from plane.db.models import Issue, IssueType, ProjectIssueType
from plane.tests.factories import (
    IssueTypeFactory,
    ProjectFactory,
    ProjectIssueTypeFactory,
    ProjectMemberFactory,
    UserFactory,
    WorkspaceMemberFactory,
)

ADMIN, MEMBER, GUEST = 20, 15, 5


def _collection_url(slug, project_id):
    return f"/api/workspaces/{slug}/projects/{project_id}/work-item-types/"


def _detail_url(slug, project_id, pk):
    return f"{_collection_url(slug, project_id)}{pk}/"


def _client_for(workspace, project, *, workspace_role, project_role):
    user = UserFactory()
    WorkspaceMemberFactory(workspace=workspace, member=user, role=workspace_role)
    ProjectMemberFactory(project=project, member=user, role=project_role)
    client = APIClient()
    client.force_authenticate(user=user)
    return client


@pytest.fixture
def project(db, workspace, create_user):
    project = ProjectFactory(workspace=workspace, identifier="WIT")
    ProjectMemberFactory(project=project, member=create_user, role=ADMIN)
    return project


@pytest.fixture
def default_type(project):
    issue_type = IssueTypeFactory(workspace=project.workspace, name="Work Item", level=0)
    ProjectIssueTypeFactory(project=project, issue_type=issue_type, is_default=True)
    return issue_type


@pytest.fixture
def issue_type(project):
    issue_type = IssueTypeFactory(workspace=project.workspace, name="Bug", level=1)
    ProjectIssueTypeFactory(project=project, issue_type=issue_type)
    return issue_type


@pytest.mark.contract
@pytest.mark.django_db
class TestIssueTypeWriteAdminScope:
    @pytest.mark.parametrize("role", [GUEST, MEMBER])
    def test_non_admin_cannot_create(self, workspace, project, role):
        client = _client_for(workspace, project, workspace_role=role, project_role=role)
        response = client.post(_collection_url(workspace.slug, project.id), {"name": "Bug"}, format="json")
        assert response.status_code == status.HTTP_403_FORBIDDEN, response.data
        assert not IssueType.objects.filter(name="Bug").exists()

    @pytest.mark.parametrize("role", [GUEST, MEMBER])
    def test_non_admin_cannot_patch(self, workspace, project, issue_type, role):
        client = _client_for(workspace, project, workspace_role=role, project_role=role)
        response = client.patch(
            _detail_url(workspace.slug, project.id, issue_type.id), {"name": "Renamed"}, format="json"
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN, response.data
        issue_type.refresh_from_db()
        assert issue_type.name == "Bug"

    @pytest.mark.parametrize("role", [GUEST, MEMBER])
    def test_non_admin_cannot_delete(self, workspace, project, issue_type, role):
        client = _client_for(workspace, project, workspace_role=role, project_role=role)
        response = client.delete(_detail_url(workspace.slug, project.id, issue_type.id))
        assert response.status_code == status.HTTP_403_FORBIDDEN, response.data
        assert IssueType.objects.filter(pk=issue_type.pk).exists()

    @pytest.mark.parametrize("role", [GUEST, MEMBER])
    def test_non_admin_cannot_enable(self, workspace, project, role):
        client = _client_for(workspace, project, workspace_role=role, project_role=role)
        response = client.post(f"{_collection_url(workspace.slug, project.id)}enable/")
        assert response.status_code == status.HTTP_403_FORBIDDEN, response.data
        project.refresh_from_db()
        assert project.is_issue_type_enabled is False

    @pytest.mark.parametrize("role", [GUEST, MEMBER])
    def test_any_member_can_list(self, workspace, project, issue_type, role):
        client = _client_for(workspace, project, workspace_role=role, project_role=role)
        response = client.get(_collection_url(workspace.slug, project.id))
        assert response.status_code == status.HTTP_200_OK, response.data
        assert [row["name"] for row in response.data] == ["Bug"]

    def test_project_admin_can_create(self, workspace, project):
        client = _client_for(workspace, project, workspace_role=MEMBER, project_role=ADMIN)
        response = client.post(_collection_url(workspace.slug, project.id), {"name": "Bug"}, format="json")
        assert response.status_code == status.HTTP_201_CREATED, response.data
        assert response.data["is_default"] is False

        # The link is created alongside the type, in the same transaction
        issue_type = IssueType.objects.get(name="Bug")
        assert issue_type.workspace_id == project.workspace_id
        assert ProjectIssueType.objects.filter(project=project, issue_type=issue_type).exists()

    def test_workspace_admin_in_project_can_create(self, workspace, project):
        client = _client_for(workspace, project, workspace_role=ADMIN, project_role=MEMBER)
        response = client.post(_collection_url(workspace.slug, project.id), {"name": "Bug"}, format="json")
        assert response.status_code == status.HTTP_201_CREATED, response.data

    def test_duplicate_name_is_rejected(self, session_client, workspace, project, issue_type):
        response = session_client.post(_collection_url(workspace.slug, project.id), {"name": "Bug"}, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.data == {"name": ["WORK_ITEM_TYPE_NAME_ALREADY_EXISTS"]}

    def test_patch_cannot_move_the_default(self, session_client, workspace, project, default_type, issue_type):
        response = session_client.patch(
            _detail_url(workspace.slug, project.id, issue_type.id), {"is_default": True}, format="json"
        )
        assert response.status_code == status.HTTP_200_OK, response.data
        assert response.data["is_default"] is False
        assert [link.issue_type_id for link in ProjectIssueType.objects.filter(project=project, is_default=True)] == [
            default_type.id
        ]


@pytest.mark.contract
@pytest.mark.django_db
class TestIssueTypeProjectScope:
    def test_type_from_another_project_404s(self, session_client, workspace, project, issue_type):
        """The join row authorizes the type, so another project's URL must not reach it."""
        other_project = ProjectFactory(workspace=workspace, name="Other", identifier="OTH")
        ProjectMemberFactory(project=other_project, member=project.workspace.owner, role=ADMIN)

        response = session_client.get(_detail_url(workspace.slug, other_project.id, issue_type.id))
        assert response.status_code == status.HTTP_404_NOT_FOUND, response.data

    def test_list_excludes_types_not_linked_to_the_project(self, session_client, workspace, project, issue_type):
        unlinked = IssueTypeFactory(workspace=workspace, name="Unlinked")

        response = session_client.get(_collection_url(workspace.slug, project.id))
        assert response.status_code == status.HTTP_200_OK, response.data
        assert unlinked.name not in [row["name"] for row in response.data]

    def test_list_excludes_epics(self, session_client, workspace, project, issue_type):
        epic = IssueTypeFactory(workspace=workspace, name="Epic", is_epic=True)
        ProjectIssueTypeFactory(project=project, issue_type=epic)

        response = session_client.get(_collection_url(workspace.slug, project.id))
        assert response.status_code == status.HTTP_200_OK, response.data
        assert [row["name"] for row in response.data] == ["Bug"]

    def test_list_excludes_types_whose_link_was_removed(self, session_client, workspace, project, issue_type):
        ProjectIssueType.objects.get(project=project, issue_type=issue_type).delete()

        response = session_client.get(_collection_url(workspace.slug, project.id))
        assert response.status_code == status.HTTP_200_OK, response.data
        assert response.data == []

    def test_non_member_cannot_read(self, workspace, project, issue_type):
        outsider = UserFactory()
        WorkspaceMemberFactory(workspace=workspace, member=outsider, role=MEMBER)
        client = APIClient()
        client.force_authenticate(user=outsider)

        response = client.get(_detail_url(workspace.slug, project.id, issue_type.id))
        assert response.status_code in (status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND), response.data


@pytest.mark.contract
@pytest.mark.django_db
class TestIssueTypeMarkAsDefault:
    def test_mark_as_default_moves_the_default(self, session_client, workspace, project, default_type, issue_type):
        response = session_client.post(f"{_detail_url(workspace.slug, project.id, issue_type.id)}mark-default/")
        assert response.status_code == status.HTTP_204_NO_CONTENT

        defaults = ProjectIssueType.objects.filter(project=project, is_default=True)
        assert [link.issue_type_id for link in defaults] == [issue_type.id]

    def test_mark_as_default_leaves_exactly_one(self, session_client, workspace, project, default_type, issue_type):
        session_client.post(f"{_detail_url(workspace.slug, project.id, issue_type.id)}mark-default/")
        assert ProjectIssueType.objects.filter(project=project, is_default=True).count() == 1

    def test_mark_as_default_refuses_an_inactive_type(self, session_client, workspace, project, default_type):
        inactive = IssueTypeFactory(workspace=workspace, name="Retired", is_active=False)
        ProjectIssueTypeFactory(project=project, issue_type=inactive)

        response = session_client.post(f"{_detail_url(workspace.slug, project.id, inactive.id)}mark-default/")
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.data == {"error": "cannot_set_inactive_work_item_type_as_default"}
        assert [link.issue_type_id for link in ProjectIssueType.objects.filter(project=project, is_default=True)] == [
            default_type.id
        ]

    def test_mark_as_default_unknown_type_404s(self, session_client, workspace, project, default_type):
        response = session_client.post(f"{_detail_url(workspace.slug, project.id, uuid4())}mark-default/")
        assert response.status_code == status.HTTP_404_NOT_FOUND
        assert ProjectIssueType.objects.filter(project=project, is_default=True).count() == 1

    @pytest.mark.parametrize("role", [GUEST, MEMBER])
    def test_non_admin_cannot_mark_as_default(self, workspace, project, default_type, issue_type, role):
        client = _client_for(workspace, project, workspace_role=role, project_role=role)
        response = client.post(f"{_detail_url(workspace.slug, project.id, issue_type.id)}mark-default/")
        assert response.status_code == status.HTTP_403_FORBIDDEN, response.data
        assert [link.issue_type_id for link in ProjectIssueType.objects.filter(project=project, is_default=True)] == [
            default_type.id
        ]


@pytest.mark.contract
@pytest.mark.django_db
class TestIssueTypeDestroyGuards:
    def test_default_type_cannot_be_deleted(self, session_client, workspace, project, default_type):
        response = session_client.delete(_detail_url(workspace.slug, project.id, default_type.id))
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        # The UI maps this code to work_item_types.settings.item_delete_confirmation.errors.*
        assert response.data == {"error": "cannot_delete_default_work_item_type"}
        assert IssueType.objects.filter(pk=default_type.pk).exists()

    def test_type_with_work_items_cannot_be_deleted(self, session_client, workspace, project, issue_type):
        Issue.objects.create(name="Broken thing", project=project, workspace=workspace, type=issue_type)

        response = session_client.delete(_detail_url(workspace.slug, project.id, issue_type.id))
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.data == {"error": "cannot_delete_work_item_type_with_associated_work_items"}
        assert IssueType.objects.filter(pk=issue_type.pk).exists()

    def test_unused_non_default_type_is_deleted(self, session_client, workspace, project, default_type, issue_type):
        response = session_client.delete(_detail_url(workspace.slug, project.id, issue_type.id))
        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert not IssueType.objects.filter(pk=issue_type.pk).exists()


@pytest.mark.contract
@pytest.mark.django_db
class TestIssueTypeEnable:
    def test_enable_seeds_the_starter_types(self, session_client, workspace, project):
        response = session_client.post(f"{_collection_url(workspace.slug, project.id)}enable/")
        assert response.status_code == status.HTTP_201_CREATED, response.data

        project.refresh_from_db()
        assert project.is_issue_type_enabled is True
        assert [row["name"] for row in response.data] == ["Task", "Bug", "Feature", "Epic", "Question"]

        defaults = [row["name"] for row in response.data if row["is_default"]]
        assert defaults == ["Task"]

    def test_enable_gives_every_type_a_distinct_icon(self, session_client, workspace, project):
        """Every layout renders a type through its glyph alone, so a seeded type without
        usable logo_props is invisible everywhere outside this feature's settings page."""
        response = session_client.post(f"{_collection_url(workspace.slug, project.id)}enable/")
        assert response.status_code == status.HTTP_201_CREATED, response.data

        logos = {row["name"]: row["logo_props"] for row in response.data}
        assert set(logos) == {"Task", "Bug", "Feature", "Epic", "Question"}

        for name, logo_props in logos.items():
            assert logo_props.get("in_use") == "icon", f"{name} renders nothing: {logo_props}"
            assert logo_props.get("icon", {}).get("name"), f"{name} has no icon name: {logo_props}"
            assert logo_props["icon"].get("color", "").startswith("#"), f"{name} has no colour: {logo_props}"

        icon_names = [logo_props["icon"]["name"] for logo_props in logos.values()]
        assert len(set(icon_names)) == len(icon_names), f"types must be told apart: {icon_names}"

    def test_enable_is_not_repeatable(self, session_client, workspace, project):
        session_client.post(f"{_collection_url(workspace.slug, project.id)}enable/")

        response = session_client.post(f"{_collection_url(workspace.slug, project.id)}enable/")
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.data == {"error": "WORK_ITEM_TYPES_ALREADY_ENABLED"}
        assert ProjectIssueType.objects.filter(project=project).count() == 5

    def test_enable_does_not_backfill_existing_work_items(self, session_client, workspace, project):
        issue = Issue.objects.create(name="Older item", project=project, workspace=workspace)

        session_client.post(f"{_collection_url(workspace.slug, project.id)}enable/")

        issue.refresh_from_db()
        assert issue.type_id is None

    def test_enabling_a_second_project_reuses_workspace_types(self, session_client, workspace, project):
        other_project = ProjectFactory(workspace=workspace, name="Second", identifier="SEC")
        ProjectMemberFactory(project=other_project, member=project.workspace.owner, role=ADMIN)

        session_client.post(f"{_collection_url(workspace.slug, project.id)}enable/")
        session_client.post(f"{_collection_url(workspace.slug, other_project.id)}enable/")

        # Five types in the workspace, not ten -- same-named types are shared
        assert IssueType.objects.filter(workspace=workspace).count() == 5
        assert ProjectIssueType.objects.filter(project=other_project).count() == 5


@pytest.mark.contract
@pytest.mark.django_db
class TestGroupWorkItemsByType:
    """Grouping the work item list by type.

    The columns come from ``issue_group_values`` while paging into one column goes
    through the ``issue_type`` filter, so this covers the two together -- a mismatch
    shows up as a group that renders but will not load.
    """

    def _issues_url(self, slug, project_id):
        return f"/api/workspaces/{slug}/projects/{project_id}/issues/"

    def test_work_items_are_grouped_by_their_type(self, session_client, workspace, project, default_type, issue_type):
        typed = Issue.objects.create(name="A bug", project=project, workspace=workspace, type=issue_type)
        untyped = Issue.objects.create(name="No type", project=project, workspace=workspace)

        response = session_client.get(self._issues_url(workspace.slug, project.id), {"group_by": "type_id"})
        assert response.status_code == status.HTTP_200_OK, response.data

        # group keys are stringified ids, while the rows keep the projection's UUIDs
        grouped = response.data["results"]
        assert str(issue_type.id) in grouped, grouped.keys()
        assert [row["id"] for row in grouped[str(issue_type.id)]["results"]] == [typed.id]
        # Untyped work items outlive enabling, so they must still be reachable
        assert [row["id"] for row in grouped["None"]["results"]] == [untyped.id]

    def test_paging_into_one_type_group_returns_only_that_type(
        self, session_client, workspace, project, default_type, issue_type
    ):
        typed = Issue.objects.create(name="A bug", project=project, workspace=workspace, type=issue_type)
        Issue.objects.create(name="No type", project=project, workspace=workspace)

        response = session_client.get(self._issues_url(workspace.slug, project.id), {"issue_type": str(issue_type.id)})
        assert response.status_code == status.HTTP_200_OK, response.data

        assert [row["id"] for row in response.data["results"]] == [typed.id]

    def test_the_untyped_group_pages_on_its_own(self, session_client, workspace, project, issue_type):
        Issue.objects.create(name="A bug", project=project, workspace=workspace, type=issue_type)
        untyped = Issue.objects.create(name="No type", project=project, workspace=workspace)

        response = session_client.get(self._issues_url(workspace.slug, project.id), {"issue_type": "None"})
        assert response.status_code == status.HTTP_200_OK, response.data

        assert [row["id"] for row in response.data["results"]] == [untyped.id]
