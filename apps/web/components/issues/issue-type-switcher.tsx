/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import useSWR from "swr";
// plane imports
import { LayerStackOutline } from "@makeplane/propel/icons";
import { ConfirmDialog } from "@plane/blocks/dialog";
import { Logo } from "@plane/blocks/emoji-icon-picker";
import { Select } from "@plane/blocks/select";
import { setToast } from "@plane/blocks/toast";
import { useTranslation } from "@plane/i18n";
import type { TWorkItemType } from "@plane/types";
// store hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useProject } from "@/hooks/store/use-project";
import { useRouterParams } from "@/hooks/store/use-router-params";
import { useWorkItemType } from "@/hooks/store/use-work-item-type";
// components
import { IssueIdentifier } from "@/components/issues/issue-detail/issue-identifier";

// Module scope: it closes over nothing, so it need not be rebuilt on every render
const renderLogo = (workItemType: TWorkItemType | null | undefined) =>
  workItemType?.logo_props?.in_use ? (
    <Logo logo={workItemType.logo_props} size={14} type="lucide" />
  ) : (
    <LayerStackOutline className="h-4 w-4 flex-shrink-0 text-tertiary" />
  );

export type TIssueTypeSwitcherProps = {
  issueId: string;
  disabled: boolean;
};

export const IssueTypeSwitcher = observer(function IssueTypeSwitcher(props: TIssueTypeSwitcherProps) {
  const { issueId, disabled } = props;
  // plane hooks
  const { t } = useTranslation();
  // store hooks
  const {
    issue: { getIssueById },
    updateIssue,
  } = useIssueDetail();
  const { getProjectById } = useProject();
  const { workspaceSlug } = useRouterParams();
  const { getProjectWorkItemTypes, getWorkItemTypeById, fetchProjectWorkItemTypes, fetchedMap } = useWorkItemType();
  // states
  const [pendingTypeId, setPendingTypeId] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  // derived values
  const issue = getIssueById(issueId);
  const projectId = issue?.project_id;
  const isTypeEnabled = Boolean(projectId && getProjectById(projectId)?.is_issue_type_enabled);

  // ProjectAuthWrapper already loads the types for every page under a project, so this
  // only fires where that wrapper is absent -- the peek overview opened from a workspace
  // view or a profile page, which are not project-scoped routes.
  const shouldFetchTypes = Boolean(workspaceSlug && projectId && isTypeEnabled && !fetchedMap[projectId]);
  useSWR(
    shouldFetchTypes ? `ISSUE_WORK_ITEM_TYPES_${workspaceSlug}_${projectId}` : null,
    shouldFetchTypes && workspaceSlug && projectId ? () => fetchProjectWorkItemTypes(workspaceSlug, projectId) : null,
    { revalidateIfStale: false, revalidateOnFocus: false }
  );

  if (!issue || !projectId) return <></>;

  // Without the feature on there is nothing to switch between, so this stays the plain
  // identifier it has always been.
  if (!isTypeEnabled) {
    return <IssueIdentifier issueId={issueId} projectId={projectId} size="md" enableClickToCopyIdentifier />;
  }

  // Only active types can be assigned, but the current one is kept in the list even if it
  // was since deactivated, so the trigger can still render it.
  const workItemTypes = (getProjectWorkItemTypes(projectId) ?? []).filter(
    (workItemType) => workItemType.is_active || workItemType.id === issue.type_id
  );
  const selected = getWorkItemTypeById(issue.type_id);

  const handleConfirm = async () => {
    if (!pendingTypeId || !workspaceSlug) return;

    setIsUpdating(true);
    try {
      await updateIssue(workspaceSlug, projectId, issueId, { type_id: pendingTypeId });
      setPendingTypeId(null);
    } catch (_error) {
      setToast({
        type: "error",
        title: t("common.error.label"),
        message: t("common.error.message"),
      });
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Select<TWorkItemType>
        getValues={() => workItemTypes}
        value={selected ?? null}
        onChange={(nextId: string) => {
          if (nextId && nextId !== issue.type_id) setPendingTypeId(nextId);
        }}
        getOptionValue={(workItemType) => workItemType.id}
        getOptionLabel={(workItemType) => workItemType.name}
        getOptionIcon={(workItemType) => renderLogo(workItemType)}
        disabled={disabled || isUpdating}
      >
        <Select.Trigger<TWorkItemType> disabled={disabled || isUpdating} variant="select-ghost-md">
          {/* The trigger render-prop receives an array even for a single select */}
          {(selectedTypes) => (
            <span className="flex items-center gap-1.5 truncate">
              {renderLogo(selectedTypes[0])}
              <span className="truncate">{selectedTypes[0]?.name ?? t("work_item_types.label")}</span>
            </span>
          )}
        </Select.Trigger>
      </Select>
      {/* The dropdown above already shows the type, so the identifier renders the ID only */}
      <IssueIdentifier
        issueId={issueId}
        projectId={projectId}
        size="md"
        displayProperties={{ key: true, issue_type: false }}
        enableClickToCopyIdentifier
      />

      {/* Changing type can drop type-specific data, so it is confirmed rather than applied inline */}
      <ConfirmDialog
        isOpen={Boolean(pendingTypeId)}
        variant="warning"
        title={t("work_item_types.change_confirmation.title")}
        content={t("work_item_types.change_confirmation.description")}
        primaryButtonText={{
          default: t("work_item_types.change_confirmation.button.default"),
          loading: t("work_item_types.change_confirmation.button.loading"),
        }}
        isSubmitting={isUpdating}
        handleClose={() => setPendingTypeId(null)}
        handleSubmit={handleConfirm}
      />
    </div>
  );
});
