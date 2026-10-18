# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import secrets

# Django imports
from django.db import models
from django.db.models import Q

# Module imports
from .project import ProjectBaseModel


def generate_webhook_secret():
    return secrets.token_hex(32)


class GitRepository(ProjectBaseModel):
    """A source-control repository connected to a project (one active repository per project)."""

    class Provider(models.TextChoices):
        GITHUB = "github", "GitHub"

    provider = models.CharField(max_length=20, choices=Provider.choices, default=Provider.GITHUB)
    owner = models.CharField(max_length=255)
    name = models.CharField(max_length=255)
    url = models.URLField(max_length=1024, blank=True, default="")
    # Shared secret used to verify the HMAC signature of incoming webhooks. Never returned after creation.
    webhook_secret = models.CharField(max_length=255, default=generate_webhook_secret)
    is_active = models.BooleanField(default=True)
    # Close the work item when a PR referencing it is merged, even without a closing keyword
    close_on_merge = models.BooleanField(default=False)
    # Optional overrides: {"branch_created": "<state id>", "pr_opened": "<state id>", "pr_merged": "<state id>"}
    state_mapping = models.JSONField(default=dict, blank=True)

    class Meta:
        verbose_name = "Git Repository"
        verbose_name_plural = "Git Repositories"
        db_table = "git_repositories"
        ordering = ("-created_at",)
        constraints = [
            models.UniqueConstraint(
                fields=["project"],
                condition=Q(deleted_at__isnull=True),
                name="git_repository_unique_project_when_deleted_at_null",
            )
        ]

    def __str__(self):
        return f"{self.owner}/{self.name} <{self.project.name}>"


class IssueGitReference(ProjectBaseModel):
    """A branch or pull request linked to a work item."""

    class Kind(models.TextChoices):
        BRANCH = "branch", "Branch"
        PULL_REQUEST = "pull_request", "Pull Request"

    class State(models.TextChoices):
        ACTIVE = "active", "Active"
        DELETED = "deleted", "Deleted"
        OPEN = "open", "Open"
        DRAFT = "draft", "Draft"
        MERGED = "merged", "Merged"
        CLOSED = "closed", "Closed"

    issue = models.ForeignKey("db.Issue", on_delete=models.CASCADE, related_name="git_references")
    repository = models.ForeignKey("db.GitRepository", on_delete=models.CASCADE, related_name="references")
    kind = models.CharField(max_length=20, choices=Kind.choices)
    # PR number, or the branch name for branches
    external_id = models.CharField(max_length=500)
    url = models.URLField(max_length=1024, blank=True, default="")
    title = models.CharField(max_length=500, blank=True, default="")
    state = models.CharField(max_length=20, choices=State.choices)
    source_branch = models.CharField(max_length=500, blank=True, default="")
    target_branch = models.CharField(max_length=500, blank=True, default="")
    author_login = models.CharField(max_length=255, blank=True, default="")
    author_avatar_url = models.URLField(max_length=1024, blank=True, default="")
    merged_at = models.DateTimeField(null=True, blank=True)
    # e.g. {"closes": true}
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        verbose_name = "Issue Git Reference"
        verbose_name_plural = "Issue Git References"
        db_table = "issue_git_references"
        ordering = ("-created_at",)
        constraints = [
            models.UniqueConstraint(
                fields=["repository", "kind", "external_id", "issue"],
                condition=Q(deleted_at__isnull=True),
                name="issue_git_reference_unique_when_deleted_at_null",
            )
        ]

    def __str__(self):
        return f"{self.issue_id} {self.kind} {self.external_id}"
