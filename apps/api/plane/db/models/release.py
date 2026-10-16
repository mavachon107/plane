# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.conf import settings
from django.db import models

# Module imports
from plane.utils.html_processor import strip_tags

from .base import BaseModel


class ReleaseStatus(models.TextChoices):
    UNRELEASED = "unreleased", "Unreleased"
    RELEASED = "released", "Released"
    CANCELLED = "cancelled", "Cancelled"


class ReleaseTag(BaseModel):
    """A version marker (``v1.2.0``) a release can point at."""

    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE, related_name="release_tags")
    version = models.CharField(max_length=255, verbose_name="Tag Version")
    description = models.TextField(blank=True)
    commit_hash = models.CharField(max_length=255, blank=True, null=True)
    git_tag = models.CharField(max_length=255, blank=True, null=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["workspace", "version"],
                condition=models.Q(deleted_at__isnull=True),
                name="release_tag_unique_workspace_version_when_deleted_at_null",
            )
        ]
        verbose_name = "Release Tag"
        verbose_name_plural = "Release Tags"
        db_table = "release_tags"
        ordering = ("-created_at",)

    def __str__(self):
        return str(self.version)


class ReleaseLabel(BaseModel):
    """A workspace-level label palette entry shared across releases."""

    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE, related_name="release_labels")
    name = models.CharField(max_length=255)
    color = models.CharField(max_length=255, blank=True)
    sort_order = models.FloatField(default=65535)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["workspace", "name"],
                condition=models.Q(deleted_at__isnull=True),
                name="release_label_unique_workspace_name_when_deleted_at_null",
            )
        ]
        verbose_name = "Release Label"
        verbose_name_plural = "Release Labels"
        db_table = "release_labels"
        ordering = ("sort_order",)

    def save(self, *args, **kwargs):
        if self._state.adding:
            largest = ReleaseLabel.objects.filter(workspace=self.workspace).aggregate(largest=models.Max("sort_order"))[
                "largest"
            ]
            if largest is not None:
                self.sort_order = largest + 10000

        super(ReleaseLabel, self).save(*args, **kwargs)

    def __str__(self):
        return str(self.name)


class Release(BaseModel):
    """A workspace-scoped release that work items are shipped under."""

    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE, related_name="releases")
    name = models.CharField(max_length=255, verbose_name="Release Name")

    description = models.JSONField(blank=True, default=dict)
    description_html = models.TextField(blank=True, default="<p></p>")
    description_stripped = models.TextField(blank=True, null=True)
    description_binary = models.BinaryField(null=True)

    status = models.CharField(
        max_length=20,
        choices=ReleaseStatus.choices,
        default=ReleaseStatus.UNRELEASED,
    )
    # Surfaced in the UI as "Target date"; `target_date` below is stored but not shown.
    release_date = models.DateField(null=True, blank=True)
    target_date = models.DateField(null=True, blank=True)

    tag = models.ForeignKey(
        "db.ReleaseTag",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="releases",
    )
    lead = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="release_lead",
    )
    labels = models.ManyToManyField(
        "db.ReleaseLabel",
        through="ReleaseLabelAssociation",
        related_name="releases",
        blank=True,
    )

    is_prerelease = models.BooleanField(default=False)
    sort_order = models.FloatField(default=65535)
    external_source = models.CharField(max_length=255, null=True, blank=True)
    external_id = models.CharField(max_length=255, blank=True, null=True)

    class Meta:
        verbose_name = "Release"
        verbose_name_plural = "Releases"
        db_table = "releases"
        ordering = ("-created_at",)

    def save(self, *args, **kwargs):
        # Strip the html tags using html parser
        self.description_stripped = (
            None
            if (self.description_html == "" or self.description_html is None)
            else strip_tags(self.description_html)
        )
        if self._state.adding:
            largest = Release.objects.filter(workspace=self.workspace).aggregate(largest=models.Max("sort_order"))[
                "largest"
            ]
            if largest is not None:
                self.sort_order = largest + 10000

        super(Release, self).save(*args, **kwargs)

    def __str__(self):
        return str(self.name)


class ReleaseChangelog(BaseModel):
    """The customer-facing notes for a release, created empty alongside it."""

    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE, related_name="release_changelogs")
    release = models.OneToOneField("db.Release", on_delete=models.CASCADE, related_name="changelog")

    description = models.JSONField(blank=True, default=dict)
    description_html = models.TextField(blank=True, default="<p></p>")
    description_stripped = models.TextField(blank=True, null=True)
    description_binary = models.BinaryField(null=True)

    class Meta:
        verbose_name = "Release Changelog"
        verbose_name_plural = "Release Changelogs"
        db_table = "release_changelogs"
        ordering = ("-created_at",)

    def save(self, *args, **kwargs):
        # Strip the html tags using html parser
        self.description_stripped = (
            None
            if (self.description_html == "" or self.description_html is None)
            else strip_tags(self.description_html)
        )
        super(ReleaseChangelog, self).save(*args, **kwargs)

    def __str__(self):
        return f"{self.release.name} <changelog>"


class ReleaseLabelAssociation(BaseModel):
    """Attaches a palette label to a release."""

    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE, related_name="release_label_associations")
    release = models.ForeignKey("db.Release", on_delete=models.CASCADE, related_name="label_releases")
    label = models.ForeignKey("db.ReleaseLabel", on_delete=models.CASCADE, related_name="label_releases")

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["release", "label"],
                condition=models.Q(deleted_at__isnull=True),
                name="release_label_unique_release_label_when_deleted_at_null",
            )
        ]
        verbose_name = "Release Label Association"
        verbose_name_plural = "Release Label Associations"
        db_table = "release_label_associations"
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.release.name} {self.label.name}"


class ReleaseWorkItem(BaseModel):
    """Associates a work item with a release."""

    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE, related_name="release_work_items")
    release = models.ForeignKey("db.Release", on_delete=models.CASCADE, related_name="issue_release")
    issue = models.ForeignKey("db.Issue", on_delete=models.CASCADE, related_name="issue_release")
    sort_order = models.FloatField(default=65535)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["release", "issue"],
                condition=models.Q(deleted_at__isnull=True),
                name="release_work_item_unique_release_issue_when_deleted_at_null",
            )
        ]
        verbose_name = "Release Work Item"
        verbose_name_plural = "Release Work Items"
        db_table = "release_work_items"
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.release.name} {self.issue.name}"
