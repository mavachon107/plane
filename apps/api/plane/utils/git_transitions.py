# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import json
from enum import Enum

# Django imports
from django.core.serializers.json import DjangoJSONEncoder
from django.utils import timezone

# Module imports
from plane.bgtasks.issue_activities_task import issue_activity
from plane.db.models import BotTypeEnum, GitRepository, Issue, State, StateGroup, User

GIT_BOT_USERNAME = "git_integration_bot"
GIT_BOT_EMAIL = "git-integration-bot@plane.local"


class GitEvent(str, Enum):
    BRANCH_CREATED = "branch_created"
    PR_OPENED = "pr_opened"
    PR_MERGED = "pr_merged"


# event -> (state groups the issue may move away from, target state group)
TRANSITIONS = {
    GitEvent.BRANCH_CREATED: ({StateGroup.BACKLOG.value, StateGroup.UNSTARTED.value}, StateGroup.STARTED.value),
    GitEvent.PR_OPENED: ({StateGroup.BACKLOG.value, StateGroup.UNSTARTED.value}, StateGroup.STARTED.value),
    GitEvent.PR_MERGED: (
        {StateGroup.BACKLOG.value, StateGroup.UNSTARTED.value, StateGroup.STARTED.value},
        StateGroup.COMPLETED.value,
    ),
}


def get_git_bot_user() -> User:
    """Return the system user that performs state changes on behalf of the git integration."""
    user, created = User.objects.get_or_create(
        username=GIT_BOT_USERNAME,
        defaults={
            "email": GIT_BOT_EMAIL,
            "first_name": "GitHub",
            "last_name": "",
            "is_bot": True,
            "bot_type": BotTypeEnum.GIT_INTEGRATION.value,
            "is_password_autoset": True,
        },
    )
    if created:
        user.set_unusable_password()
        user.save(update_fields=["password"])
    return user


def resolve_target_state(repository: GitRepository, event: GitEvent, target_group: str) -> State | None:
    """Pick the state to move to: the repository's explicit mapping, else the first state of the target group."""
    mapped_id = (repository.state_mapping or {}).get(event.value)
    if mapped_id:
        state = State.objects.filter(pk=mapped_id, project_id=repository.project_id).first()
        if state:
            return state
    return State.objects.filter(project_id=repository.project_id, group=target_group).order_by("sequence").first()


def apply_transition(repository: GitRepository, issue: Issue, event: GitEvent) -> bool:
    """Move `issue` according to `event`. Returns True when the state changed.

    Never moves an issue backwards, and never touches completed/cancelled issues. Idempotent: replaying the
    same event leaves the issue where it already is.
    """
    allowed_from, target_group = TRANSITIONS[event]
    current_group = issue.state.group if issue.state_id else None
    if current_group not in allowed_from:
        return False

    target = resolve_target_state(repository, event, target_group)
    if target is None or target.id == issue.state_id:
        return False

    bot = get_git_bot_user()
    old_state_id = str(issue.state_id) if issue.state_id else None
    issue.state = target
    issue.save()

    issue_activity.delay(
        type="issue.activity.updated",
        requested_data=json.dumps({"state_id": str(target.id)}, cls=DjangoJSONEncoder),
        current_instance=json.dumps({"state_id": old_state_id}, cls=DjangoJSONEncoder),
        issue_id=str(issue.id),
        actor_id=str(bot.id),
        project_id=str(issue.project_id),
        epoch=int(timezone.now().timestamp()),
        notification=True,
        origin=None,
    )
    return True
