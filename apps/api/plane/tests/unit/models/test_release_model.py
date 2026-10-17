# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Model-level behaviour for the release tables.

Covers what lives in ``save()`` and in ``Meta.constraints`` rather than in the
serializers, so a later refactor of the API layer cannot quietly drop it.
"""

from unittest import mock

import pytest
from django.db import IntegrityError, transaction

from plane.db.models import (
    Project,
    Release,
    ReleaseLabel,
    ReleaseStatus,
    ReleaseTag,
    ReleaseWorkItem,
)


@pytest.fixture(autouse=True)
def no_cascade_task():
    """Soft delete fans out through Celery; these tests have no broker."""
    with mock.patch("plane.db.mixins.soft_delete_related_objects"):
        yield


@pytest.fixture
def project(db, workspace, create_user):
    return Project.objects.create(name="P", identifier="P", workspace=workspace, created_by=create_user)


@pytest.fixture
def other_project(db, workspace, create_user):
    return Project.objects.create(name="Q", identifier="Q", workspace=workspace, created_by=create_user)


@pytest.mark.unit
@pytest.mark.django_db
class TestReleaseModel:
    def test_defaults(self, project):
        release = Release.objects.create(name="v1", project=project)

        assert release.status == ReleaseStatus.UNRELEASED
        assert release.is_prerelease is False
        assert release.release_date is None
        assert release.target_date is None
        assert release.tag is None
        assert release.lead is None

    def test_workspace_is_derived_from_project(self, project):
        release = Release.objects.create(name="v1", project=project)

        assert release.workspace_id == project.workspace_id

    def test_description_stripped_is_derived_from_html(self, project):
        release = Release.objects.create(
            name="v1", project=project, description_html="<p>Ship <strong>faster</strong></p>"
        )

        assert release.description_stripped == "Ship faster"

    def test_empty_description_html_strips_to_none(self, project):
        release = Release.objects.create(name="v1", project=project, description_html="")

        assert release.description_stripped is None

    def test_sort_order_increments_per_project(self, project):
        first = Release.objects.create(name="v1", project=project)
        second = Release.objects.create(name="v2", project=project)

        assert second.sort_order == first.sort_order + 10000

    def test_sort_order_restarts_in_another_project(self, project, other_project):
        Release.objects.create(name="v1", project=project)
        Release.objects.create(name="v2", project=project)
        elsewhere = Release.objects.create(name="v1", project=other_project)

        assert elsewhere.sort_order == 65535

    def test_name_is_unique_per_project(self, project):
        Release.objects.create(name="v1", project=project)

        with pytest.raises(IntegrityError), transaction.atomic():
            Release.objects.create(name="v1", project=project)

    def test_same_name_allowed_in_another_project(self, project, other_project):
        Release.objects.create(name="v1", project=project)
        Release.objects.create(name="v1", project=other_project)

        assert Release.objects.filter(name="v1").count() == 2

    def test_status_accepts_each_documented_value(self, project):
        for status_value in ("unreleased", "released", "cancelled"):
            release = Release.objects.create(name=f"v-{status_value}", project=project, status=status_value)
            release.refresh_from_db()
            assert release.status == status_value


@pytest.mark.unit
@pytest.mark.django_db
class TestReleaseTagModel:
    def test_version_is_unique_per_project(self, project):
        ReleaseTag.objects.create(version="v1.2.0", project=project)

        with pytest.raises(IntegrityError), transaction.atomic():
            ReleaseTag.objects.create(version="v1.2.0", project=project)

    def test_same_version_allowed_in_another_project(self, project, other_project):
        ReleaseTag.objects.create(version="v1.2.0", project=project)
        ReleaseTag.objects.create(version="v1.2.0", project=other_project)

        assert ReleaseTag.objects.filter(version="v1.2.0").count() == 2

    def test_soft_deleted_version_frees_the_name(self, project):
        tag = ReleaseTag.objects.create(version="v1.2.0", project=project)
        tag.delete()

        # The partial unique constraint ignores soft-deleted rows.
        ReleaseTag.objects.create(version="v1.2.0", project=project)


@pytest.mark.unit
@pytest.mark.django_db
class TestReleaseLabelModel:
    def test_name_is_unique_per_project(self, project):
        ReleaseLabel.objects.create(name="Breaking", project=project)

        with pytest.raises(IntegrityError), transaction.atomic():
            ReleaseLabel.objects.create(name="Breaking", project=project)

    def test_sort_order_increments_per_project(self, project):
        first = ReleaseLabel.objects.create(name="Breaking", project=project)
        second = ReleaseLabel.objects.create(name="Security", project=project)

        assert second.sort_order == first.sort_order + 10000


@pytest.mark.unit
@pytest.mark.django_db
class TestReleaseWorkItemModel:
    def test_bulk_create_must_carry_workspace_explicitly(self, project):
        """``bulk_create`` bypasses ``save()``, so workspace is not derived for free."""
        from plane.db.models import Issue, State

        release = Release.objects.create(name="v1", project=project)
        state = State.objects.create(name="Todo", project=project, group="backlog", default=True)
        issue = Issue.objects.create(name="I", workspace=project.workspace, project=project, state=state)

        ReleaseWorkItem.objects.bulk_create(
            [ReleaseWorkItem(release=release, issue=issue, project=project, workspace=project.workspace)]
        )

        link = ReleaseWorkItem.objects.get(release=release, issue=issue)
        assert link.workspace_id == project.workspace_id
        assert link.project_id == project.id
