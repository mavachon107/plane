/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// plane imports
import { useTranslation } from "@plane/i18n";
// components
import { MemberSelect } from "@/components/dropdowns/member/member-select";
import { PrioritySelect } from "@/components/dropdowns/priority/priority-select";
import { StateSelect } from "@/components/dropdowns/state/state-select";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
// types
import type { TIssueOperations } from "./root";

type Props = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  issueOperations: TIssueOperations;
  disabled: boolean;
};

/** State, priority and assignees as a compact row shown right under the work item title. */
export const IssueQuickProperties = observer(function IssueQuickProperties(props: Props) {
  const { workspaceSlug, projectId, issueId, issueOperations, disabled } = props;
  const { t } = useTranslation();
  const {
    issue: { getIssueById },
  } = useIssueDetail();
  const issue = getIssueById(issueId);
  if (!issue) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 pb-2">
      <div className="shrink-0">
        <StateSelect
          testId="work-item-state-select"
          value={issue.state_id}
          onChange={(val) => issueOperations.update(workspaceSlug, projectId, issueId, { state_id: val })}
          projectId={projectId}
          disabled={disabled}
          variant="select-ghost-md"
          tooltip
        />
      </div>
      <div className="shrink-0">
        <PrioritySelect
          testId="work-item-priority-select"
          value={issue.priority}
          onChange={(val) => issueOperations.update(workspaceSlug, projectId, issueId, { priority: val })}
          disabled={disabled}
          variant="select-ghost-md"
          tooltip
        />
      </div>
      <div className="shrink-0">
        <MemberSelect
          testId="work-item-assignee-select"
          value={issue.assignee_ids ?? []}
          onChange={(val) => issueOperations.update(workspaceSlug, projectId, issueId, { assignee_ids: val })}
          disabled={disabled}
          projectId={projectId}
          placeholder={t("issue.add.assignee")}
          multiple
          variant="select-ghost-md"
          showLabel={(issue.assignee_ids?.length ?? 0) <= 1}
          tooltip={{ heading: t("common.assignees") }}
        />
      </div>
    </div>
  );
});
