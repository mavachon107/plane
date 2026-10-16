/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { Link } from "react-router";
import { Icon } from "@makeplane/propel/components/icon";
import { IconButton } from "@makeplane/propel/components/icon-button";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@makeplane/propel/components/menu";
import { DeleteOutline, MoreHorizontalOutline } from "@makeplane/propel/icons";
// plane imports
import { useTranslation } from "@plane/i18n";
import { StateGroupIcon } from "@plane/blocks/icons";
import { setToast } from "@plane/blocks/toast";
// hooks
import { useProject } from "@/hooks/store/use-project";
import { useRelease } from "@/hooks/store/use-release";
import { useReleaseWorkItems } from "@/hooks/store/use-release-work-items";
import { useProjectState } from "@/hooks/store/use-project-state";

type Props = {
  workItemId: string;
  workspaceSlug: string;
  projectId: string;
  releaseId: string;
  isEditingAllowed: boolean;
};

export const ReleaseScopeItem = observer(function ReleaseScopeItem(props: Props) {
  const { workItemId, workspaceSlug, projectId, releaseId, isEditingAllowed } = props;
  // plane hooks
  const { t } = useTranslation();
  // store hooks
  const { getWorkItemById, removeWorkItems } = useReleaseWorkItems();
  const { fetchReleaseDetails } = useRelease();
  const { getProjectById } = useProject();
  const { getStateById } = useProjectState();
  // derived values
  const workItem = getWorkItemById(workItemId);
  const project = getProjectById(projectId);
  const state = workItem?.state_id ? getStateById(workItem.state_id) : undefined;

  if (!workItem) return null;

  const handleRemove = async () => {
    try {
      await removeWorkItems(workspaceSlug, projectId, releaseId, [workItemId]);
      // The completion ring reads off the release, so refresh its counts.
      await fetchReleaseDetails(workspaceSlug, projectId, releaseId);
    } catch {
      setToast({
        type: "error",
        title: t("toast.error"),
        message: t("project_releases.toast.remove_work_item.error"),
      });
    }
  };

  return (
    <div className="flex items-center gap-3 border-b border-subtle px-6 py-2.5 hover:bg-layer-1">
      <span className="text-xs flex-shrink-0 font-medium text-tertiary">
        {project?.identifier}-{workItem.sequence_id}
      </span>
      <Link
        to={`/${workspaceSlug}/browse/${project?.identifier}-${workItem.sequence_id}/`}
        className="text-sm flex-grow truncate text-primary hover:underline"
      >
        {workItem.name}
      </Link>
      {state ? (
        <span className="text-xs flex flex-shrink-0 items-center gap-1 text-tertiary">
          <StateGroupIcon stateGroup={state.group} color={state.color} />
          {state.name}
        </span>
      ) : null}
      {isEditingAllowed ? (
        <Menu>
          <MenuTrigger
            render={
              <IconButton
                variant="tertiary"
                size="sm"
                icon={<Icon icon={MoreHorizontalOutline} />}
                aria-label={t("project_releases.quick_actions.label")}
              />
            }
          />
          <MenuContent side="bottom" align="end">
            <MenuItem
              variant="danger"
              label={t("project_releases.remove_work_item")}
              icon={<Icon icon={DeleteOutline} />}
              onClick={() => {
                void handleRemove();
              }}
            />
          </MenuContent>
        </Menu>
      ) : null}
    </div>
  );
});
