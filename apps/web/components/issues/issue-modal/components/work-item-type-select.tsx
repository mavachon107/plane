/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React from "react";
import { observer } from "mobx-react";
import type { Control } from "react-hook-form";
import { Controller } from "react-hook-form";
// plane imports
import { LayerStackOutline } from "@makeplane/propel/icons";
import { Logo } from "@plane/blocks/emoji-icon-picker";
import { Select } from "@plane/blocks/select";
import { useTranslation } from "@plane/i18n";
import type { TIssue, TWorkItemType } from "@plane/types";
// hooks
import { useProject } from "@/hooks/store/use-project";
import { useWorkItemType } from "@/hooks/store/use-work-item-type";

// Module scope: it closes over nothing, so it need not be rebuilt on every render
const renderLogo = (workItemType: TWorkItemType | null | undefined) =>
  workItemType?.logo_props?.in_use ? (
    <Logo logo={workItemType.logo_props} size={12} type="lucide" withBackground />
  ) : (
    <LayerStackOutline className="h-4 w-4 flex-shrink-0 text-tertiary" />
  );

type TIssueWorkItemTypeSelectProps = {
  control: Control<TIssue>;
  projectId: string | null | undefined;
  disabled?: boolean;
  handleFormChange: () => void;
};

export const IssueWorkItemTypeSelect = observer(function IssueWorkItemTypeSelect(props: TIssueWorkItemTypeSelectProps) {
  const { control, projectId, disabled = false, handleFormChange } = props;
  // plane hooks
  const { t } = useTranslation();
  // store hooks
  const { getProjectById } = useProject();
  const { getProjectWorkItemTypes, getWorkItemTypeById } = useWorkItemType();
  // derived values
  const isTypeEnabled = Boolean(projectId && getProjectById(projectId)?.is_issue_type_enabled);
  // Only active types can be picked for a new work item
  const workItemTypes = (getProjectWorkItemTypes(projectId) ?? []).filter((workItemType) => workItemType.is_active);

  // Nothing to choose from until the project has the feature on, and the types are
  // fetched by handleProjectEntitiesFetch when the project changes.
  if (!isTypeEnabled || workItemTypes.length === 0) return null;

  return (
    <Controller
      control={control}
      name="type_id"
      render={({ field: { value, onChange } }) => (
        <Select<TWorkItemType>
          getValues={() => workItemTypes}
          value={getWorkItemTypeById(value) ?? null}
          onChange={(workItemTypeId) => {
            if (!workItemTypeId) return;
            onChange(workItemTypeId);
            handleFormChange();
          }}
          getOptionValue={(workItemType) => workItemType.id}
          getOptionLabel={(workItemType) => workItemType.name}
          getOptionIcon={(workItemType) => renderLogo(workItemType)}
          disabled={disabled}
        >
          <Select.Trigger<TWorkItemType> disabled={disabled} variant="pill-md">
            {/* The trigger render-prop receives an array even for a single select */}
            {(selectedTypes) => (
              <span className="flex items-center gap-1.5 truncate">
                {renderLogo(selectedTypes[0])}
                <span className="truncate">{selectedTypes[0]?.name ?? t("work_item_types.label")}</span>
              </span>
            )}
          </Select.Trigger>
        </Select>
      )}
    />
  );
});
