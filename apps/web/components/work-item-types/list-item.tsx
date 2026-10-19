/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// plane imports
import { Badge } from "@makeplane/propel/components/badge";
import { Button } from "@makeplane/propel/components/button";
import { Icon } from "@makeplane/propel/components/icon";
import { IconButton } from "@makeplane/propel/components/icon-button";
import { Switch } from "@makeplane/propel/components/switch";
import { Tooltip } from "@makeplane/propel/components/tooltip";
import { DeleteOutline, EditOutline, LayerStackOutline } from "@makeplane/propel/icons";
import { Logo } from "@plane/blocks/emoji-icon-picker";
import { setToast } from "@plane/blocks/toast";
import { useTranslation } from "@plane/i18n";
import type { TWorkItemType } from "@plane/types";
// hooks
import { useWorkItemType } from "@/hooks/store/use-work-item-type";

type Props = {
  workItemType: TWorkItemType;
  workspaceSlug: string;
  projectId: string;
  isAdmin: boolean;
  onEditClick: (workItemType: TWorkItemType) => void;
  onDeleteClick: (workItemType: TWorkItemType) => void;
};

export const WorkItemTypeListItem = observer(function WorkItemTypeListItem(props: Props) {
  const { workItemType, workspaceSlug, projectId, isAdmin, onEditClick, onDeleteClick } = props;
  // plane hooks
  const { t } = useTranslation();
  // store hooks
  const { updateWorkItemType, markWorkItemTypeAsDefault } = useWorkItemType();

  const handleActiveToggle = async (checked: boolean) => {
    const action = checked ? t("common.actions.enable") : t("common.actions.disable");
    try {
      await updateWorkItemType(workspaceSlug, projectId, workItemType.id, { is_active: checked });
    } catch (_error) {
      setToast({
        type: "error",
        title: t("work_item_types.enable_disable.toast.error.title"),
        message: t("work_item_types.enable_disable.toast.error.message", { action: action.toLowerCase() }),
      });
    }
  };

  const handleMarkAsDefault = async () => {
    try {
      await markWorkItemTypeAsDefault(workspaceSlug, projectId, workItemType.id);
    } catch (_error) {
      setToast({
        type: "error",
        title: t("common.error.label"),
        message: t("common.error.message"),
      });
    }
  };

  // The server refuses to make an inactive type the default, so the control is disabled too
  const canBeDefault = workItemType.is_active && !workItemType.is_default;

  return (
    <div className="flex items-center justify-between gap-4 rounded-md border border-subtle-1 px-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid flex-shrink-0 place-items-center">
          {workItemType.logo_props?.in_use ? (
            <Logo logo={workItemType.logo_props} size={18} type="lucide" withBackground />
          ) : (
            <span className="grid size-8 place-items-center rounded-md bg-surface-2">
              <LayerStackOutline className="size-4 text-tertiary" />
            </span>
          )}
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h6 className="truncate text-body-sm-medium">{workItemType.name}</h6>
            {workItemType.is_default && <Badge variant="brand" size="xs" label={t("common.default")} />}
          </div>
          {workItemType.description && (
            <p className="text-body-xs truncate text-tertiary">{workItemType.description}</p>
          )}
        </div>
      </div>

      {isAdmin && (
        <div className="flex flex-shrink-0 items-center gap-2">
          {canBeDefault && (
            <Button
              variant="tertiary"
              size="sm"
              stretch="auto"
              label={t("work_item_types.settings.set_as_default")}
              onClick={handleMarkAsDefault}
            />
          )}
          <Tooltip
            label={
              workItemType.is_active
                ? t("work_item_types.enable_disable.tooltip", { action: t("common.actions.disable").toLowerCase() })
                : t("work_item_types.enable_disable.tooltip", { action: t("common.actions.enable").toLowerCase() })
            }
          >
            <Switch
              size="sm"
              checked={workItemType.is_active}
              onCheckedChange={handleActiveToggle}
              aria-label={workItemType.name}
            />
          </Tooltip>
          <IconButton
            type="button"
            variant="ghost"
            size="xs"
            aria-label={t("common.actions.edit")}
            onClick={() => onEditClick(workItemType)}
            icon={<Icon icon={EditOutline} />}
          />
          <Tooltip
            label={t("work_item_types.settings.cant_delete_default_message")}
            disabled={!workItemType.is_default}
          >
            <IconButton
              type="button"
              variant="ghost"
              size="xs"
              aria-label={t("common.actions.delete")}
              disabled={workItemType.is_default}
              onClick={() => onDeleteClick(workItemType)}
              icon={<Icon icon={DeleteOutline} />}
            />
          </Tooltip>
        </div>
      )}
    </div>
  );
});
