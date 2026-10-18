# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Unit tests for grouping and filtering work items by their type.

Grouping by type goes through two separate pieces: ``issue_group_values`` decides which
columns exist (including empty ones), and ``issue_filters`` narrows a single group when
the client pages into it. They are exercised together here because a mismatch between
them shows up as a group that renders but cannot load.
"""

from uuid import UUID

import pytest

from plane.tests.factories import IssueTypeFactory, ProjectFactory, ProjectIssueTypeFactory
from plane.utils.grouper import issue_group_values
from plane.utils.issue_filters import issue_filters


@pytest.fixture
def project(db, workspace):
    return ProjectFactory(workspace=workspace, identifier="GRP")


def _linked_type(project, name):
    issue_type = IssueTypeFactory(workspace=project.workspace, name=name)
    ProjectIssueTypeFactory(project=project, issue_type=issue_type)
    return issue_type


@pytest.mark.unit
@pytest.mark.django_db
class TestIssueTypeGroupValues:
    def test_linked_types_become_columns(self, project, workspace):
        bug = _linked_type(project, "Bug")
        task = _linked_type(project, "Task")

        values = issue_group_values(field="type_id", slug=workspace.slug, project_id=project.id)

        assert set(values) == {bug.id, task.id, "None"}

    def test_untyped_column_is_always_offered(self, project, workspace):
        """Enabling types never backfills, so untyped work items always need a column."""
        values = issue_group_values(field="type_id", slug=workspace.slug, project_id=project.id)

        assert values == ["None"]

    def test_a_type_linked_to_another_project_is_not_a_column(self, project, workspace):
        other_project = ProjectFactory(workspace=workspace, identifier="OTH")
        _linked_type(other_project, "Bug")

        values = issue_group_values(field="type_id", slug=workspace.slug, project_id=project.id)

        assert values == ["None"]

    def test_a_workspace_type_with_no_project_link_is_not_a_column(self, project, workspace):
        IssueTypeFactory(workspace=workspace, name="Orphan")

        values = issue_group_values(field="type_id", slug=workspace.slug, project_id=project.id)

        assert values == ["None"]

    def test_epics_are_never_columns(self, project, workspace):
        epic = IssueTypeFactory(workspace=workspace, name="Epic", is_epic=True)
        ProjectIssueTypeFactory(project=project, issue_type=epic)

        values = issue_group_values(field="type_id", slug=workspace.slug, project_id=project.id)

        assert values == ["None"]


@pytest.mark.unit
class TestIssueTypeFilter:
    def test_uuids_narrow_to_those_types(self):
        type_id = "6f1a9a3c-1f3e-4f1a-9a3c-1f3e4f1a9a3c"

        # filter_valid_uuids coerces to UUID, so the ORM never sees the raw string
        assert issue_filters({"issue_type": type_id}, "GET") == {"type_id__in": [UUID(type_id)]}

    def test_none_selects_the_untyped(self):
        assert issue_filters({"issue_type": "None"}, "GET") == {"type_id__isnull": True}

    def test_garbage_is_dropped_rather_than_passed_to_the_orm(self):
        assert issue_filters({"issue_type": "not-a-uuid"}, "GET") == {}

    def test_it_does_not_collide_with_the_state_type_filter(self):
        """`type` already means active/backlog on this surface, hence the separate key."""
        parsed = issue_filters({"type": "active", "issue_type": "None"}, "GET")

        assert parsed["type_id__isnull"] is True
        assert "type_id__in" not in parsed
        # the active/backlog filter still did its own, unrelated job
        assert "state__group__in" in parsed
