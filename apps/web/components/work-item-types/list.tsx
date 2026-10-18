/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import type { TWorkItemType } from "@plane/types";
// local imports
import { WorkItemTypeListItem } from "./list-item";

type Props = {
  workItemTypes: TWorkItemType[];
  workspaceSlug: string;
  projectId: string;
  isAdmin: boolean;
  onEditClick: (workItemType: TWorkItemType) => void;
  onDeleteClick: (workItemType: TWorkItemType) => void;
};

export const WorkItemTypeList = observer(function WorkItemTypeList(props: Props) {
  const { workItemTypes, workspaceSlug, projectId, isAdmin, onEditClick, onDeleteClick } = props;

  return (
    <div className="flex flex-col gap-2 md:w-2/3">
      {workItemTypes.map((workItemType) => (
        <WorkItemTypeListItem
          key={workItemType.id}
          workItemType={workItemType}
          workspaceSlug={workspaceSlug}
          projectId={projectId}
          isAdmin={isAdmin}
          onEditClick={onEditClick}
          onDeleteClick={onDeleteClick}
        />
      ))}
    </div>
  );
});
