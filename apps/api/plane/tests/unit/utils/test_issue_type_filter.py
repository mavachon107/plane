# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""``type_id`` / ``type_id__in`` rich-filter lookups on work items.

The work item type filter shipped in the view filter dropdown sends these keys, so a
missing field on ``IssueFilterSet`` would drop the condition and return every work item.
"""

import pytest

from plane.db.models import Issue, IssueType, Project, ProjectMember
from plane.utils.filters.filterset import IssueFilterSet


@pytest.fixture
def project(db, workspace, create_user):
    project = Project.objects.create(name="Type Filter", identifier="TF", workspace=workspace, created_by=create_user)
    ProjectMember.objects.create(project=project, member=create_user, role=20, is_active=True)
    return project


@pytest.fixture
def typed_issues(db, project, workspace, create_user):
    bug = IssueType.objects.create(workspace=workspace, name="Bug", level=1)
    task = IssueType.objects.create(workspace=workspace, name="Task", level=0)

    def make(name, issue_type):
        return Issue.objects.create(
            name=name, project=project, workspace=workspace, created_by=create_user, type=issue_type
        )

    return {"bug": bug, "task": task, "a": make("a", bug), "b": make("b", task), "c": make("c", None)}


def _filter(params):
    return set(IssueFilterSet(params, queryset=Issue.objects.all()).qs.values_list("name", flat=True))


@pytest.mark.unit
@pytest.mark.django_db
class TestIssueTypeFilter:
    def test_type_id_exact(self, typed_issues):
        assert _filter({"type_id": str(typed_issues["bug"].id)}) == {"a"}

    def test_type_id_in_matches_any_listed_type(self, typed_issues):
        ids = f'{typed_issues["bug"].id},{typed_issues["task"].id}'
        assert _filter({"type_id__in": ids}) == {"a", "b"}
