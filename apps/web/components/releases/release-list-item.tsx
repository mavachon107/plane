/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useRef } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// components
import { ListItem } from "@/components/core/list";
// hooks
import { useRelease } from "@/hooks/store/use-release";
// local imports
import { ReleaseListItemAction } from "./release-list-item-action";

type Props = {
  releaseId: string;
};

export const ReleaseListItem = observer(function ReleaseListItem(props: Props) {
  const { releaseId } = props;
  // refs
  const parentRef = useRef<HTMLDivElement>(null);
  // router
  const { workspaceSlug, projectId } = useParams();
  // store hooks
  const { getReleaseById } = useRelease();
  // derived values
  const releaseDetails = getReleaseById(releaseId);

  if (!releaseDetails) return null;

  // Completion mirrors cycles and modules: done means the completed or cancelled
  // state groups. A release with no work items reads 0%, not NaN%.
  const completionPercentage = (releaseDetails.completed_work_item_count / releaseDetails.work_item_count) * 100;
  const progress = isNaN(completionPercentage) ? 0 : Math.floor(completionPercentage);

  return (
    <ListItem
      title={releaseDetails.name}
      itemLink={`/${workspaceSlug}/projects/${projectId}/releases/${releaseDetails.id}`}
      actionableItems={
        <ReleaseListItemAction
          releaseId={releaseId}
          releaseDetails={releaseDetails}
          parentRef={parentRef}
          progress={progress}
        />
      }
      parentRef={parentRef}
    />
  );
});
