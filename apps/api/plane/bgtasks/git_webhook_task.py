# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import json

# Django imports
from django.core.serializers.json import DjangoJSONEncoder
from django.utils import timezone
from django.utils.dateparse import parse_datetime

# Third party imports
from celery import shared_task

# Module imports
from plane.bgtasks.issue_activities_task import issue_activity
from plane.db.models import GitRepository, Issue, IssueGitReference
from plane.utils.exception_logger import log_exception
from plane.utils.git_references import extract_closing_sequence_ids, extract_sequence_ids
from plane.utils.git_transitions import GitEvent, apply_transition, get_git_bot_user

PR_ACTIONS = {"opened", "reopened", "edited", "ready_for_review", "converted_to_draft", "closed", "synchronize"}


def _pr_state(pr: dict) -> str:
    if pr.get("merged"):
        return IssueGitReference.State.MERGED
    if pr.get("state") == "closed":
        return IssueGitReference.State.CLOSED
    if pr.get("draft"):
        return IssueGitReference.State.DRAFT
    return IssueGitReference.State.OPEN


def _resolve_issues(repository: GitRepository, sequence_ids: list[int]) -> list[Issue]:
    if not sequence_ids:
        return []
    return list(
        Issue.issue_objects.filter(project_id=repository.project_id, sequence_id__in=sequence_ids).select_related(
            "state"
        )
    )


def _emit_activity(type_: str, reference: IssueGitReference, actor_id, previous_state: str | None = None):
    payload = {
        "id": str(reference.id),
        "kind": reference.kind,
        "external_id": reference.external_id,
        "title": reference.title,
        "url": reference.url,
        "state": reference.state,
    }
    issue_activity.delay(
        type=type_,
        requested_data=json.dumps(payload, cls=DjangoJSONEncoder),
        current_instance=json.dumps({"state": previous_state}) if previous_state else None,
        issue_id=str(reference.issue_id),
        actor_id=str(actor_id),
        project_id=str(reference.project_id),
        epoch=int(timezone.now().timestamp()),
        notification=False,
    )


def _upsert_reference(repository: GitRepository, issue: Issue, kind: str, external_id: str, values: dict, actor_id):
    """Create or update a reference. Returns (reference, created)."""
    reference = IssueGitReference.objects.filter(
        repository=repository, issue=issue, kind=kind, external_id=external_id
    ).first()
    if reference is None:
        reference = IssueGitReference.objects.create(
            repository=repository,
            issue=issue,
            project_id=repository.project_id,
            kind=kind,
            external_id=external_id,
            **values,
        )
        _emit_activity("git_reference.activity.created", reference, actor_id)
        return reference, True

    previous_state = reference.state
    for key, value in values.items():
        setattr(reference, key, value)
    reference.save()
    if previous_state != reference.state:
        _emit_activity("git_reference.activity.updated", reference, actor_id, previous_state)
    return reference, False


def _handle_branch(repository: GitRepository, branch: str, actor_id):
    sequence_ids = extract_sequence_ids(branch, repository.project.identifier)
    for issue in _resolve_issues(repository, sequence_ids):
        _, created = _upsert_reference(
            repository,
            issue,
            IssueGitReference.Kind.BRANCH,
            branch,
            {
                "title": branch,
                "url": f"{repository.url.rstrip('/')}/tree/{branch}" if repository.url else "",
                "state": IssueGitReference.State.ACTIVE,
                "source_branch": branch,
            },
            actor_id,
        )
        if created:
            apply_transition(repository, issue, GitEvent.BRANCH_CREATED)


def _handle_branch_deleted(repository: GitRepository, branch: str, actor_id):
    for reference in IssueGitReference.objects.filter(
        repository=repository, kind=IssueGitReference.Kind.BRANCH, external_id=branch
    ).exclude(state=IssueGitReference.State.DELETED):
        previous_state = reference.state
        reference.state = IssueGitReference.State.DELETED
        reference.save()
        _emit_activity("git_reference.activity.updated", reference, actor_id, previous_state)


def _handle_pull_request(repository: GitRepository, action: str, pr: dict, actor_id):
    identifier = repository.project.identifier
    head_ref = (pr.get("head") or {}).get("ref", "")
    title = pr.get("title") or ""
    body = pr.get("body") or ""

    sequence_ids = []
    for text in (head_ref, title, body):
        for value in extract_sequence_ids(text, identifier):
            if value not in sequence_ids:
                sequence_ids.append(value)
    closing_ids = set(extract_closing_sequence_ids(f"{title}\n{body}", identifier))

    external_id = str(pr.get("number"))
    state = _pr_state(pr)
    user = pr.get("user") or {}
    values = {
        "title": title[:500],
        "url": pr.get("html_url") or "",
        "state": state,
        "source_branch": head_ref,
        "target_branch": (pr.get("base") or {}).get("ref", ""),
        "author_login": user.get("login", ""),
        "author_avatar_url": user.get("avatar_url", ""),
        "merged_at": parse_datetime(pr["merged_at"]) if pr.get("merged_at") else None,
    }

    issues = _resolve_issues(repository, sequence_ids)
    linked_issue_ids = set()
    for issue in issues:
        linked_issue_ids.add(issue.id)
        _upsert_reference(
            repository,
            issue,
            IssueGitReference.Kind.PULL_REQUEST,
            external_id,
            {**values, "metadata": {"closes": issue.sequence_id in closing_ids}},
            actor_id,
        )

    # A PR edit can drop a key from the title/body: unlink issues no longer referenced
    if action == "edited":
        stale = IssueGitReference.objects.filter(
            repository=repository, kind=IssueGitReference.Kind.PULL_REQUEST, external_id=external_id
        ).exclude(issue_id__in=linked_issue_ids)
        for reference in stale:
            reference.delete()

    for issue in issues:
        if state == IssueGitReference.State.OPEN and action in {"opened", "reopened", "ready_for_review"}:
            apply_transition(repository, issue, GitEvent.PR_OPENED)
        elif state == IssueGitReference.State.MERGED and action == "closed":
            if issue.sequence_id in closing_ids or repository.close_on_merge:
                apply_transition(repository, issue, GitEvent.PR_MERGED)


@shared_task
def process_github_event(repository_id: str, event: str, payload: dict):
    try:
        repository = GitRepository.objects.select_related("project").filter(pk=repository_id, is_active=True).first()
        if repository is None:
            return
        actor_id = get_git_bot_user().id

        if event == "create" and payload.get("ref_type") == "branch":
            _handle_branch(repository, payload.get("ref", ""), actor_id)
        elif event == "delete" and payload.get("ref_type") == "branch":
            _handle_branch_deleted(repository, payload.get("ref", ""), actor_id)
        elif event == "push":
            ref = payload.get("ref", "")
            branch = ref.removeprefix("refs/heads/") if ref.startswith("refs/heads/") else ""
            if not branch:
                return
            if payload.get("deleted"):
                _handle_branch_deleted(repository, branch, actor_id)
            else:
                _handle_branch(repository, branch, actor_id)
        elif event == "pull_request":
            action = payload.get("action")
            pr = payload.get("pull_request")
            if action in PR_ACTIONS and pr:
                _handle_pull_request(repository, action, pr, actor_id)
    except Exception as e:
        log_exception(e)
