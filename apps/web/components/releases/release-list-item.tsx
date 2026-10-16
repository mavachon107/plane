/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useRef } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { CircularProgress } from "@makeplane/propel/components/circular-progress";
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
      prependTitleElement={
        <div className="relative flex size-[30px] items-center justify-center">
          <div className="absolute inset-0 flex scale-150 items-center justify-center">
            <CircularProgress
              value={progress}
              size="md"
              variant={progress === 100 ? "success" : "brand"}
              aria-label="Release progress"
            />
          </div>
        </div>
      }
      appendTitleElement={<span className="text-xs flex-shrink-0 text-tertiary">{progress}%</span>}
      actionableItems={
        <ReleaseListItemAction releaseId={releaseId} releaseDetails={releaseDetails} parentRef={parentRef} />
      }
      parentRef={parentRef}
    />
  );
});
