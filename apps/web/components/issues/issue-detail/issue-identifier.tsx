/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// plane imports
import type { TIssueIdentifierProps } from "@plane/types";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useProject } from "@/hooks/store/use-project";
import { useWorkItemType } from "@/hooks/store/use-work-item-type";
import { IdentifierText } from "@/components/issues/issue-detail/identifier-text";
import { Logo } from "@plane/blocks/emoji-icon-picker";

export const IssueIdentifier = observer(function IssueIdentifier(props: TIssueIdentifierProps) {
  const { projectId, variant, size, displayProperties, enableClickToCopyIdentifier = false } = props;
  // store hooks
  const { getProjectIdentifierById } = useProject();
  const {
    issue: { getIssueById },
  } = useIssueDetail();
  const { getWorkItemTypeById } = useWorkItemType();
  // Determine if the component is using store data or not
  const isUsingStoreData = "issueId" in props;
  // derived values
  const issue = isUsingStoreData ? getIssueById(props.issueId) : null;
  const projectIdentifier = isUsingStoreData ? getProjectIdentifierById(projectId) : props.projectIdentifier;
  const issueSequenceId = isUsingStoreData ? issue?.sequence_id : props.issueSequenceId;
  // The store-driven variant reads the type off the work item, so the ~21 call sites do
  // not have to thread a new prop; the details variant takes it explicitly.
  const issueTypeId = isUsingStoreData ? issue?.type_id : props.issueTypeId;
  const workItemType = getWorkItemTypeById(issueTypeId);
  // These two are independent: `key` controls the PROJ-1 text and `issue_type` the type
  // logo. Gating the logo on `key` is what made the type invisible wherever the
  // identifier was switched off, while callers like issue-layouts/list/block.tsx already
  // mount this component on `key || issue_type`.
  const shouldRenderIssueID = displayProperties ? Boolean(displayProperties.key) : true;
  const shouldRenderIssueType = displayProperties ? Boolean(displayProperties.issue_type) : true;
  const logo = shouldRenderIssueType && workItemType?.logo_props?.in_use ? workItemType.logo_props : undefined;

  if (!shouldRenderIssueID && !logo) return null;

  return (
    <div className="flex shrink-0 items-center space-x-2">
      {logo && (
        <span className="flex shrink-0 items-center" aria-label={workItemType?.name}>
          <Logo logo={logo} size={14} type="lucide" />
        </span>
      )}
      {shouldRenderIssueID && (
        <IdentifierText
          identifier={`${projectIdentifier}-${issueSequenceId}`}
          enableClickToCopyIdentifier={enableClickToCopyIdentifier}
          variant={variant}
          size={size}
        />
      )}
    </div>
  );
});
