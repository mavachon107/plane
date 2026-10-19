/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo } from "react";
import { sortBy } from "lodash-es";
import useSWR from "swr";
// hooks
import { useProject } from "@/hooks/store/use-project";
import { useWorkItemType } from "@/hooks/store/use-work-item-type";

/**
 * The work item type ids that can be filtered on across the given projects: the union
 * of the types of every project that has work item types enabled, fetching the ones
 * not loaded yet. Returns undefined while there is no project scope to resolve.
 *
 * Callers must be observers -- the ids are read straight off the observable store.
 */
export const useWorkItemTypeFilterIds = (
  workspaceSlug: string,
  projectIds: string[] | undefined
): string[] | undefined => {
  const { getProjectById } = useProject();
  const { workItemTypeMap, fetchedMap, fetchProjectWorkItemTypes } = useWorkItemType();
  // derived values
  const enabledProjectIds = (projectIds ?? []).filter((projectId) => getProjectById(projectId)?.is_issue_type_enabled);
  const enabledKey = enabledProjectIds.join(",");

  useSWR(
    workspaceSlug && enabledKey ? `WORK_ITEM_TYPE_FILTER_IDS_${workspaceSlug}_${enabledKey}` : null,
    () =>
      Promise.all(
        enabledProjectIds.filter((id) => !fetchedMap[id]).map((id) => fetchProjectWorkItemTypes(workspaceSlug, id))
      ),
    { revalidateIfStale: false, revalidateOnFocus: false }
  );

  const enabledSet = new Set(enabledProjectIds);
  const idsKey = sortBy(
    Object.values(workItemTypeMap).filter((workItemType) => workItemType.project_ids?.some((id) => enabledSet.has(id))),
    ["level", "name"]
  )
    .map((workItemType) => workItemType.id)
    .join(",");
  const hasProjectScope = projectIds !== undefined;

  // a stable reference, so the filter configs built from it do not churn on every render
  return useMemo(() => (hasProjectScope ? (idsKey ? idsKey.split(",") : []) : undefined), [idsKey, hasProjectScope]);
};
