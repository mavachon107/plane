# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Model-level behaviour for the release tables.

Covers the bits that live in ``save()`` and in ``Meta.constraints`` rather than in
the serializers, so a future refactor of the API layer cannot quietly drop them.
"""

from unittest import mock

import pytest
from django.db import IntegrityError, transaction

from plane.db.models import (
    Release,
    ReleaseLabel,
    ReleaseStatus,
    ReleaseTag,
)


@pytest.fixture(autouse=True)
def no_cascade_task():
    """Soft delete fans out through Celery; these tests have no broker."""
    with mock.patch("plane.db.mixins.soft_delete_related_objects"):
        yield


@pytest.mark.unit
@pytest.mark.django_db
class TestReleaseModel:
    def test_defaults(self, workspace):
        release = Release.objects.create(name="v1", workspace=workspace)

        assert release.status == ReleaseStatus.UNRELEASED
        assert release.is_prerelease is False
        assert release.release_date is None
        assert release.target_date is None
        assert release.tag is None
        assert release.lead is None

    def test_description_stripped_is_derived_from_html(self, workspace):
        release = Release.objects.create(
            name="v1",
            workspace=workspace,
            description_html="<p>Ship <strong>faster</strong></p>",
        )

        assert release.description_stripped == "Ship faster"

    def test_empty_description_html_strips_to_none(self, workspace):
        release = Release.objects.create(name="v1", workspace=workspace, description_html="")

        assert release.description_stripped is None

    def test_sort_order_increments_per_workspace(self, workspace):
        first = Release.objects.create(name="v1", workspace=workspace)
        second = Release.objects.create(name="v2", workspace=workspace)

        assert second.sort_order == first.sort_order + 10000

    def test_status_accepts_each_documented_value(self, workspace):
        for status_value in ("unreleased", "released", "cancelled"):
            release = Release.objects.create(name=f"v-{status_value}", workspace=workspace, status=status_value)
            release.refresh_from_db()
            assert release.status == status_value


@pytest.mark.unit
@pytest.mark.django_db
class TestReleaseTagModel:
    def test_version_is_unique_per_workspace(self, workspace):
        ReleaseTag.objects.create(version="v1.2.0", workspace=workspace)

        with pytest.raises(IntegrityError), transaction.atomic():
            ReleaseTag.objects.create(version="v1.2.0", workspace=workspace)

    def test_same_version_allowed_in_another_workspace(self, workspace, create_user):
        from plane.db.models import Workspace

        other = Workspace.objects.create(name="Other", owner=create_user, slug="other-workspace")

        ReleaseTag.objects.create(version="v1.2.0", workspace=workspace)
        ReleaseTag.objects.create(version="v1.2.0", workspace=other)

        assert ReleaseTag.objects.filter(version="v1.2.0").count() == 2

    def test_soft_deleted_version_frees_the_name(self, workspace):
        tag = ReleaseTag.objects.create(version="v1.2.0", workspace=workspace)
        tag.delete()

        # The partial unique constraint ignores soft-deleted rows.
        ReleaseTag.objects.create(version="v1.2.0", workspace=workspace)


@pytest.mark.unit
@pytest.mark.django_db
class TestReleaseLabelModel:
    def test_name_is_unique_per_workspace(self, workspace):
        ReleaseLabel.objects.create(name="Breaking", workspace=workspace)

        with pytest.raises(IntegrityError), transaction.atomic():
            ReleaseLabel.objects.create(name="Breaking", workspace=workspace)

    def test_sort_order_increments_per_workspace(self, workspace):
        first = ReleaseLabel.objects.create(name="Breaking", workspace=workspace)
        second = ReleaseLabel.objects.create(name="Security", workspace=workspace)

        assert second.sort_order == first.sort_order + 10000
