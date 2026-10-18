# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Unit tests for IssueTypeSerializer.

Name uniqueness is scoped to the *project* even though IssueType is workspace-scoped,
because the project join row is what the settings UI manages. There is no DB unique
constraint on the name, so ``validate_name`` is the only guard.
"""

import pytest

from plane.app.serializers import IssueTypeSerializer
from plane.tests.factories import IssueTypeFactory, ProjectFactory, ProjectIssueTypeFactory


@pytest.fixture
def project(db, workspace):
    return ProjectFactory(workspace=workspace, identifier="WIT")


@pytest.fixture
def linked_type(project):
    """A type named "Bug" already linked to the project."""
    issue_type = IssueTypeFactory(workspace=project.workspace, name="Bug")
    ProjectIssueTypeFactory(project=project, issue_type=issue_type)
    return issue_type


@pytest.mark.unit
class TestIssueTypeSerializer:
    @pytest.mark.django_db
    def test_valid_data_creates_a_type(self, project):
        serializer = IssueTypeSerializer(
            data={"name": "Bug", "description": "Something broken"},
            context={"project_id": project.id},
        )
        assert serializer.is_valid(), serializer.errors

        issue_type = serializer.save(workspace_id=project.workspace_id)
        assert issue_type.name == "Bug"
        assert issue_type.workspace_id == project.workspace_id
        # Epics are out of scope, so nothing here may opt a type into being one
        assert issue_type.is_epic is False

    @pytest.mark.django_db
    def test_duplicate_name_in_same_project_is_rejected(self, project, linked_type):
        serializer = IssueTypeSerializer(data={"name": "Bug"}, context={"project_id": project.id})
        assert not serializer.is_valid()
        assert serializer.errors == {"name": ["WORK_ITEM_TYPE_NAME_ALREADY_EXISTS"]}

    @pytest.mark.django_db
    def test_duplicate_name_check_ignores_case(self, project, linked_type):
        serializer = IssueTypeSerializer(data={"name": "bUg"}, context={"project_id": project.id})
        assert not serializer.is_valid()
        assert serializer.errors == {"name": ["WORK_ITEM_TYPE_NAME_ALREADY_EXISTS"]}

    @pytest.mark.django_db
    def test_same_name_in_another_project_is_allowed(self, project, linked_type):
        other_project = ProjectFactory(workspace=project.workspace, name="Other", identifier="OTH")
        serializer = IssueTypeSerializer(data={"name": "Bug"}, context={"project_id": other_project.id})
        assert serializer.is_valid(), serializer.errors

    @pytest.mark.django_db
    def test_renaming_a_type_to_its_own_name_is_allowed(self, project, linked_type):
        """self.instance must be excluded, or every PATCH that keeps the name would fail."""
        serializer = IssueTypeSerializer(
            linked_type, data={"name": "Bug"}, partial=True, context={"project_id": project.id}
        )
        assert serializer.is_valid(), serializer.errors

    @pytest.mark.django_db
    def test_soft_deleted_link_does_not_block_the_name(self, project):
        """A removed type must not keep its name reserved for the project."""
        issue_type = IssueTypeFactory(workspace=project.workspace, name="Bug")
        link = ProjectIssueTypeFactory(project=project, issue_type=issue_type)
        link.delete()

        serializer = IssueTypeSerializer(data={"name": "Bug"}, context={"project_id": project.id})
        assert serializer.is_valid(), serializer.errors

    @pytest.mark.django_db
    @pytest.mark.parametrize("field", ["is_default", "is_epic", "created_by", "updated_by", "workspace"])
    def test_protected_fields_are_ignored_when_supplied(self, project, create_user, field):
        """A client that posts these must not be able to set them: the project default
        moves only through mark_as_default, epics are out of scope, and the audit fields
        and workspace are server-derived."""
        payload = {
            "name": "Bug",
            "is_default": True,
            "is_epic": True,
            "created_by": str(create_user.id),
            "updated_by": str(create_user.id),
            "workspace": str(project.workspace_id),
        }
        serializer = IssueTypeSerializer(data=payload, context={"project_id": project.id})
        assert serializer.is_valid(), serializer.errors
        assert field not in serializer.validated_data

        issue_type = serializer.save(workspace_id=project.workspace_id)
        assert issue_type.is_epic is False
        assert issue_type.is_default is False

    @pytest.mark.django_db
    def test_is_default_is_read_from_the_join_row_annotation(self, project, linked_type):
        """is_default is rendered from the project_is_default annotation, not the model
        field of the same name -- that one is the workspace default."""
        linked_type.is_default = False
        linked_type.project_is_default = True
        linked_type.project_ids = [project.id]

        assert IssueTypeSerializer(linked_type).data["is_default"] is True
