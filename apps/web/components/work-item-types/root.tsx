/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import useSWR from "swr";
// plane imports
import { Button } from "@makeplane/propel/components/button";
import { useTranslation } from "@plane/i18n";
import type { TWorkItemType } from "@plane/types";
// components
import { SettingsHeading } from "@/components/settings/heading";
// hooks
import { useProject } from "@/hooks/store/use-project";
import { useWorkItemType } from "@/hooks/store/use-work-item-type";
// local imports
import { CreateUpdateWorkItemTypeModal } from "./create-update/modal";
import { DeleteWorkItemTypeModal } from "./delete-modal";
import { WorkItemTypeEnableEmptyState } from "./enable-empty-state";
import { WorkItemTypeList } from "./list";
import { WorkItemTypeLoader } from "./loader";

type Props = {
  workspaceSlug: string;
  projectId: string;
  isAdmin: boolean;
};

export const WorkItemTypeRoot = observer(function WorkItemTypeRoot(props: Props) {
  const { workspaceSlug, projectId, isAdmin } = props;
  // plane hooks
  const { t } = useTranslation();
  // store hooks
  const { getProjectById } = useProject();
  const { getProjectWorkItemTypes, fetchProjectWorkItemTypes } = useWorkItemType();
  // states
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [workItemTypeToUpdate, setWorkItemTypeToUpdate] = useState<TWorkItemType | null>(null);
  const [workItemTypeToDelete, setWorkItemTypeToDelete] = useState<TWorkItemType | null>(null);
  // derived values
  const projectDetails = getProjectById(projectId);
  const isEnabled = Boolean(projectDetails?.is_issue_type_enabled);

  // Only fetch once the feature is on -- a disabled project has no types to list
  const { isLoading } = useSWR(
    workspaceSlug && projectId && isEnabled ? `PROJECT_WORK_ITEM_TYPES_${workspaceSlug}_${projectId}` : null,
    () => fetchProjectWorkItemTypes(workspaceSlug, projectId),
    { revalidateIfStale: false, revalidateOnFocus: false }
  );

  const workItemTypes = getProjectWorkItemTypes(projectId);

  if (!isEnabled) {
    return <WorkItemTypeEnableEmptyState workspaceSlug={workspaceSlug} projectId={projectId} isAdmin={isAdmin} />;
  }

  if (isLoading || !workItemTypes) return <WorkItemTypeLoader />;

  return (
    <>
      <SettingsHeading
        title={t("work_item_types.settings.types.title")}
        description={t("work_item_types.settings.types.description")}
        variant="h6"
        control={
          isAdmin ? (
            <Button
              variant="primary"
              size="sm"
              stretch="auto"
              label={t("work_item_types.settings.types.project.add_button.create_new")}
              onClick={() => setIsCreateModalOpen(true)}
            />
          ) : undefined
        }
      />
      <div className="mt-4">
        <WorkItemTypeList
          workItemTypes={workItemTypes}
          workspaceSlug={workspaceSlug}
          projectId={projectId}
          isAdmin={isAdmin}
          onEditClick={setWorkItemTypeToUpdate}
          onDeleteClick={setWorkItemTypeToDelete}
        />
      </div>

      <CreateUpdateWorkItemTypeModal
        isOpen={isCreateModalOpen || Boolean(workItemTypeToUpdate)}
        data={workItemTypeToUpdate}
        onClose={() => {
          setIsCreateModalOpen(false);
          setWorkItemTypeToUpdate(null);
        }}
        workspaceSlug={workspaceSlug}
        projectId={projectId}
      />
      <DeleteWorkItemTypeModal
        isOpen={Boolean(workItemTypeToDelete)}
        workItemType={workItemTypeToDelete}
        onClose={() => setWorkItemTypeToDelete(null)}
        workspaceSlug={workspaceSlug}
        projectId={projectId}
      />
    </>
  );
});
