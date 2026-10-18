# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import hashlib
import hmac
import json
from unittest.mock import patch

import pytest
from django.urls import reverse
from rest_framework import status

from plane.bgtasks.git_webhook_task import process_github_event
from plane.db.models import (
    GitRepository,
    Issue,
    IssueGitReference,
    Project,
    ProjectMember,
    State,
    User,
)

ACTIVITY = "plane.bgtasks.git_webhook_task.issue_activity.delay"
TRANSITION_ACTIVITY = "plane.utils.git_transitions.issue_activity.delay"


@pytest.fixture
def project(db, workspace, create_user):
    project = Project.objects.create(name="Parcours", identifier="PARCOURS", workspace=workspace)
    ProjectMember.objects.create(project=project, member=create_user, role=20, workspace=workspace)
    return project


@pytest.fixture
def states(project):
    return {
        group: State.objects.create(name=group.title(), color="#000", group=group, project=project, sequence=i)
        for i, group in enumerate(["backlog", "unstarted", "started", "completed", "cancelled"])
    }


@pytest.fixture
def issue(project, states):
    return Issue.objects.create(name="Do the thing", project=project, state=states["unstarted"])


@pytest.fixture
def repository(project):
    return GitRepository.objects.create(project=project, owner="acme", name="repo", url="https://github.com/acme/repo")


def pr_payload(action, number=7, head="feat/PARCOURS-1-thing", title="Add thing", body="", **pr):
    return {
        "action": action,
        "pull_request": {
            "number": number,
            "title": title,
            "body": body,
            "state": "closed" if action == "closed" else "open",
            "draft": False,
            "merged": False,
            "html_url": f"https://github.com/acme/repo/pull/{number}",
            "head": {"ref": head},
            "base": {"ref": "main"},
            "user": {"login": "octocat", "avatar_url": "https://example.com/a.png"},
            **pr,
        },
    }


@pytest.mark.unit
class TestProcessGithubEvent:
    @patch(TRANSITION_ACTIVITY)
    @patch(ACTIVITY)
    def test_branch_create_links_and_starts_issue(self, _act, _tr, repository, issue, states):
        process_github_event(
            str(repository.id), "create", {"ref_type": "branch", "ref": f"feat/PARCOURS-{issue.sequence_id}-x"}
        )
        ref = IssueGitReference.objects.get(issue=issue)
        assert ref.kind == "branch" and ref.state == "active"
        issue.refresh_from_db()
        assert issue.state_id == states["started"].id

    @patch(TRANSITION_ACTIVITY)
    @patch(ACTIVITY)
    def test_unrelated_branch_creates_nothing(self, _act, _tr, repository, issue):
        process_github_event(str(repository.id), "create", {"ref_type": "branch", "ref": "main"})
        assert not IssueGitReference.objects.exists()

    @patch(TRANSITION_ACTIVITY)
    @patch(ACTIVITY)
    def test_pr_opened_moves_to_started_and_is_idempotent(self, _act, tr, repository, issue, states):
        payload = pr_payload("opened", head=f"feat/PARCOURS-{issue.sequence_id}")
        process_github_event(str(repository.id), "pull_request", payload)
        process_github_event(str(repository.id), "pull_request", payload)
        assert IssueGitReference.objects.filter(issue=issue, kind="pull_request").count() == 1
        issue.refresh_from_db()
        assert issue.state_id == states["started"].id
        state_changes = [c for c in tr.call_args_list if c.kwargs["type"] == "issue.activity.updated"]
        assert len(state_changes) == 1

    @patch(TRANSITION_ACTIVITY)
    @patch(ACTIVITY)
    def test_draft_pr_does_not_transition(self, _act, _tr, repository, issue, states):
        payload = pr_payload("opened", head=f"feat/PARCOURS-{issue.sequence_id}", draft=True)
        process_github_event(str(repository.id), "pull_request", payload)
        issue.refresh_from_db()
        assert issue.state_id == states["unstarted"].id
        assert IssueGitReference.objects.get(issue=issue).state == "draft"

    @patch(TRANSITION_ACTIVITY)
    @patch(ACTIVITY)
    def test_merge_without_closing_keyword_keeps_state(self, _act, _tr, repository, issue, states):
        issue.state = states["started"]
        issue.save()
        payload = pr_payload("closed", head=f"feat/PARCOURS-{issue.sequence_id}", merged=True)
        process_github_event(str(repository.id), "pull_request", payload)
        issue.refresh_from_db()
        assert issue.state_id == states["started"].id
        assert IssueGitReference.objects.get(issue=issue).state == "merged"

    @patch(TRANSITION_ACTIVITY)
    @patch(ACTIVITY)
    def test_merge_with_closing_keyword_completes(self, _act, _tr, repository, issue, states):
        issue.state = states["started"]
        issue.save()
        payload = pr_payload("closed", body=f"Fixes PARCOURS-{issue.sequence_id}", merged=True)
        process_github_event(str(repository.id), "pull_request", payload)
        issue.refresh_from_db()
        assert issue.state_id == states["completed"].id
        assert issue.completed_at is not None

    @patch(TRANSITION_ACTIVITY)
    @patch(ACTIVITY)
    def test_close_on_merge_setting(self, _act, _tr, repository, issue, states):
        repository.close_on_merge = True
        repository.save()
        payload = pr_payload("closed", head=f"feat/PARCOURS-{issue.sequence_id}", merged=True)
        process_github_event(str(repository.id), "pull_request", payload)
        issue.refresh_from_db()
        assert issue.state_id == states["completed"].id

    @patch(TRANSITION_ACTIVITY)
    @patch(ACTIVITY)
    def test_never_moves_cancelled_or_completed_issue(self, _act, _tr, repository, issue, states):
        issue.state = states["cancelled"]
        issue.save()
        process_github_event(
            str(repository.id), "pull_request", pr_payload("opened", head=f"feat/PARCOURS-{issue.sequence_id}")
        )
        issue.refresh_from_db()
        assert issue.state_id == states["cancelled"].id

    @patch(TRANSITION_ACTIVITY)
    @patch(ACTIVITY)
    def test_pr_closed_unmerged_does_not_revert(self, _act, _tr, repository, issue, states):
        process_github_event(
            str(repository.id), "pull_request", pr_payload("opened", head=f"feat/PARCOURS-{issue.sequence_id}")
        )
        process_github_event(
            str(repository.id), "pull_request", pr_payload("closed", head=f"feat/PARCOURS-{issue.sequence_id}")
        )
        issue.refresh_from_db()
        assert issue.state_id == states["started"].id
        assert IssueGitReference.objects.get(issue=issue).state == "closed"

    @patch(TRANSITION_ACTIVITY)
    @patch(ACTIVITY)
    def test_edited_pr_unlinks_removed_key(self, _act, _tr, repository, issue):
        process_github_event(
            str(repository.id), "pull_request", pr_payload("opened", title=f"PARCOURS-{issue.sequence_id} thing")
        )
        assert IssueGitReference.objects.filter(issue=issue).exists()
        process_github_event(
            str(repository.id), "pull_request", pr_payload("edited", head="feat/other", title="Renamed")
        )
        assert not IssueGitReference.objects.filter(issue=issue).exists()

    @patch(TRANSITION_ACTIVITY)
    @patch(ACTIVITY)
    def test_branch_delete_marks_deleted(self, _act, _tr, repository, issue):
        branch = f"feat/PARCOURS-{issue.sequence_id}"
        process_github_event(str(repository.id), "create", {"ref_type": "branch", "ref": branch})
        process_github_event(str(repository.id), "delete", {"ref_type": "branch", "ref": branch})
        assert IssueGitReference.objects.get(issue=issue).state == "deleted"

    @patch(TRANSITION_ACTIVITY)
    @patch(ACTIVITY)
    def test_state_mapping_override(self, _act, _tr, repository, issue, states, project):
        review = State.objects.create(name="In review", color="#000", group="started", project=project, sequence=99)
        repository.state_mapping = {"pr_opened": str(review.id)}
        repository.save()
        process_github_event(
            str(repository.id), "pull_request", pr_payload("opened", head=f"feat/PARCOURS-{issue.sequence_id}")
        )
        issue.refresh_from_db()
        assert issue.state_id == review.id

    @patch(TRANSITION_ACTIVITY)
    @patch(ACTIVITY)
    def test_state_change_is_attributed_to_bot(self, _act, tr, repository, issue):
        process_github_event(
            str(repository.id), "pull_request", pr_payload("opened", head=f"feat/PARCOURS-{issue.sequence_id}")
        )
        bot = User.objects.get(username="git_integration_bot")
        assert bot.is_bot and tr.call_args.kwargs["actor_id"] == str(bot.id)


def signed(secret, body):
    return "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


@pytest.mark.contract
class TestGithubWebhookEndpoint:
    def post(self, client, repository, payload, event="pull_request", secret=None, delivery="d-1"):
        body = json.dumps(payload).encode()
        return client.post(
            reverse("github-webhook", kwargs={"repository_id": repository.id}),
            data=body,
            content_type="application/json",
            HTTP_X_HUB_SIGNATURE_256=signed(secret or repository.webhook_secret, body),
            HTTP_X_GITHUB_EVENT=event,
            HTTP_X_GITHUB_DELIVERY=delivery,
        )

    @pytest.mark.django_db
    def test_rejects_bad_signature(self, client, repository):
        response = self.post(client, repository, {}, secret="wrong")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    @pytest.mark.django_db
    def test_rejects_unknown_repository(self, client, repository):
        repository.is_active = False
        repository.save()
        assert self.post(client, repository, {}).status_code == status.HTTP_401_UNAUTHORIZED

    @pytest.mark.django_db
    def test_ping(self, client, repository):
        response = self.post(client, repository, {"zen": "x"}, event="ping")
        assert response.status_code == status.HTTP_200_OK

    @pytest.mark.django_db
    def test_unhandled_event_ignored(self, client, repository):
        assert self.post(client, repository, {}, event="star").status_code == status.HTTP_204_NO_CONTENT

    @pytest.mark.django_db
    @patch("plane.app.views.git_integration.base.redis_instance")
    @patch("plane.app.views.git_integration.base.process_github_event.delay")
    def test_valid_event_is_queued_once_per_delivery(self, delay, redis, client, repository):
        redis.return_value.set.side_effect = [True, None]
        first = self.post(client, repository, pr_payload("opened"))
        second = self.post(client, repository, pr_payload("opened"))
        assert first.status_code == status.HTTP_202_ACCEPTED
        assert second.status_code == status.HTTP_200_OK
        assert delay.call_count == 1


@pytest.mark.contract
class TestGitRepositoryEndpoint:
    @pytest.mark.django_db
    def test_create_reveals_secret_once_and_enforces_one_per_project(self, session_client, workspace, project):
        url = reverse("project-git-repository", kwargs={"slug": workspace.slug, "project_id": project.id})
        created = session_client.post(url, {"owner": "acme", "name": "repo"}, format="json")
        assert created.status_code == status.HTTP_201_CREATED
        assert len(created.data["webhook_secret"]) == 64
        assert created.data["url"] == "https://github.com/acme/repo"

        fetched = session_client.get(url)
        assert "webhook_secret" not in fetched.data

        again = session_client.post(url, {"owner": "acme", "name": "other"}, format="json")
        assert again.status_code == status.HTTP_409_CONFLICT

    @pytest.mark.django_db
    def test_rejects_unknown_state_mapping_keys(self, session_client, workspace, project):
        url = reverse("project-git-repository", kwargs={"slug": workspace.slug, "project_id": project.id})
        response = session_client.post(
            url, {"owner": "acme", "name": "repo", "state_mapping": {"bogus": "x"}}, format="json"
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.contract
class TestIssueGitReferenceEndpoint:
    @pytest.mark.django_db
    def test_manual_link_and_list(self, session_client, workspace, project, issue, repository):
        url = reverse(
            "issue-git-references",
            kwargs={"slug": workspace.slug, "project_id": project.id, "issue_id": issue.id},
        )
        ok = session_client.post(url, {"url": "https://github.com/acme/repo/pull/12"}, format="json")
        assert ok.status_code == status.HTTP_201_CREATED
        assert ok.data["kind"] == "pull_request" and ok.data["external_id"] == "12"

        bad = session_client.post(url, {"url": "https://github.com/evil/repo/pull/1"}, format="json")
        assert bad.status_code == status.HTTP_400_BAD_REQUEST
        js = session_client.post(url, {"url": "javascript:alert(1)"}, format="json")
        assert js.status_code == status.HTTP_400_BAD_REQUEST

        listed = session_client.get(url)
        assert [r["external_id"] for r in listed.data] == ["12"]
