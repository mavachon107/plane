# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Module imports
from plane.db.models import IssueType, ProjectIssueType


# "Task" is the project default. The glyphs follow the set shown in Plane's
# "Epics is becoming a work item type" post: checked square, mountain, bookmark, bug.
#
# Each type ships a distinct glyph so the five are told apart at a glance in the
# work item layouts, the way Jira colour-codes Story/Bug/Task.
#
# Two constraints on these values, both silent when broken:
#   * ``icon.name`` MUST exist in LUCIDE_ICONS_LIST
#     (packages/blocks/src/emoji-icon-picker/lucide-icons.tsx) -- the Logo component
#     returns null for an unknown name, so a typo renders nothing at all.
#   * ``icon.color`` is drawn from the picker's own swatches (DEFAULT_COLORS in
#     emoji-icon-picker/helper.tsx) so that opening the picker shows the current
#     colour as selected rather than as a custom one.
DEFAULT_ISSUE_TYPES = [
    {
        "name": "Task",
        "level": 0,
        "is_default": True,
        "logo_props": {"in_use": "icon", "icon": {"name": "CheckSquare", "color": "#02b5ed"}},
    },
    {
        "name": "Bug",
        "level": 1,
        "is_default": False,
        "logo_props": {"in_use": "icon", "icon": {"name": "Bug", "color": "#f38e82"}},
    },
    {
        "name": "Feature",
        "level": 2,
        "is_default": False,
        "logo_props": {"in_use": "icon", "icon": {"name": "Bookmark", "color": "#02b55c"}},
    },
    {
        "name": "Epic",
        "level": 3,
        "is_default": False,
        "logo_props": {"in_use": "icon", "icon": {"name": "Epic", "color": "#5e6ad2"}},
    },
    {
        "name": "Question",
        "level": 4,
        "is_default": False,
        "logo_props": {"in_use": "icon", "icon": {"name": "HelpCircle", "color": "#e57a00"}},
    },
]


def seed_default_issue_types(project):
    """Create the starter work item types for a project and link them to it.

    A helper rather than a data migration, because enabling work item types is
    per-project and opt-in.

    Idempotent: a project that already has links is left untouched, so enabling
    twice cannot double-seed. ``IssueType`` is workspace-scoped, so a same-named
    non-epic type already in the workspace is reused rather than duplicated --
    otherwise enabling a second project would litter the workspace with copies.

    Existing ``Issue`` rows are never touched: enabling types does not backfill,
    so work items created beforehand keep ``type = NULL`` until someone sets one.

    "Epic" is seeded as an ordinary type: ``is_epic`` is never set here, because the
    flag hides a type from the type list and the grouper.
    """
    if ProjectIssueType.objects.filter(project_id=project.id).exists():
        return []

    issue_types = []
    for spec in DEFAULT_ISSUE_TYPES:
        issue_type = IssueType.objects.filter(
            workspace_id=project.workspace_id, name__iexact=spec["name"], is_epic=False
        ).first()

        if issue_type is None:
            issue_type = IssueType.objects.create(
                workspace_id=project.workspace_id,
                name=spec["name"],
                level=spec["level"],
                logo_props=spec["logo_props"],
            )

        # ProjectBaseModel.save() derives workspace from project, so it is not passed here
        ProjectIssueType.objects.create(
            project=project, issue_type=issue_type, level=spec["level"], is_default=spec["is_default"]
        )
        issue_types.append(issue_type)

    return issue_types
