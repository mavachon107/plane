/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { orderBy } from "lodash-es";
import { observer } from "mobx-react";
import useSWR from "swr";
import { ReleasesOutline, WorkItemsOutline } from "@makeplane/propel/icons";
// plane imports
import { E_SORT_ORDER } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { calculateTimeAgo } from "@plane/utils";
// components
import { ActivitySortRoot } from "@/components/issues/issue-detail/issue-activity/sort-root";
// hooks
import { useMember } from "@/hooks/store/use-member";
// services
import { ReleaseService } from "@/services/release.service";

const releaseService = new ReleaseService();

type Props = {
  workspaceSlug: string;
  projectId: string;
  releaseId: string;
};

/** The release's activity feed: its creation and the work items added to it. */
export const ReleaseActivity = observer(function ReleaseActivity(props: Props) {
  const { workspaceSlug, projectId, releaseId } = props;
  // state
  const [sortOrder, setSortOrder] = useState<E_SORT_ORDER>(E_SORT_ORDER.ASC);
  // plane hooks
  const { t } = useTranslation();
  // store hooks
  const { getUserDetails } = useMember();

  const { data: activities } = useSWR(
    workspaceSlug && projectId && releaseId ? `RELEASE_ACTIVITY_${releaseId}` : null,
    () => releaseService.getActivity(workspaceSlug, projectId, releaseId),
    { revalidateOnFocus: false }
  );

  const sorted = activities
    ? sortOrder === E_SORT_ORDER.ASC
      ? activities
      : orderBy(activities, ["created_at"], ["desc"])
    : [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-h5-medium text-primary">{t("common.activity")}</h3>
        <ActivitySortRoot
          sortOrder={sortOrder}
          toggleSort={() => setSortOrder(sortOrder === E_SORT_ORDER.ASC ? E_SORT_ORDER.DESC : E_SORT_ORDER.ASC)}
        />
      </div>
      <div className="flex flex-col gap-5">
        {sorted.map((activity) => {
          const actorName = getUserDetails(activity.actor ?? "")?.display_name ?? "";
          const workItem = activity.work_item;
          return (
            <div key={activity.id} className="flex items-start gap-3">
              <div className="grid size-8 flex-shrink-0 place-items-center rounded-lg border border-subtle bg-surface-1">
                {workItem ? <WorkItemsOutline className="size-4" /> : <ReleasesOutline className="size-4" />}
              </div>
              <div className="min-w-0 text-13 text-secondary">
                <p>
                  <span className="font-medium text-primary">{actorName}</span>{" "}
                  {workItem ? (
                    <>
                      {t("project_releases.activity.added_work_item_prefix")}{" "}
                      <span className="font-medium text-primary">
                        {workItem.project_identifier}-{workItem.sequence_id}
                      </span>{" "}
                      {t("project_releases.activity.added_work_item_suffix")}
                    </>
                  ) : (
                    t("project_releases.activity.created")
                  )}
                </p>
                <p className="mt-1 text-tertiary">{calculateTimeAgo(activity.created_at)}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});
