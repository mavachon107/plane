/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import useSWR from "swr";
import { Button } from "@makeplane/propel/components/button";
// plane imports
import { EUserPermissions, EUserPermissionsLevel, STATE_GROUPS } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import type { ISearchIssueResponse, TStateGroups } from "@plane/types";
import { StateGroupIcon } from "@plane/blocks/icons";
import { setToast } from "@plane/blocks/toast";
// components
import { ExistingIssuesListModal } from "@/components/core/modals/existing-issues-list-modal";
// hooks
import { useRelease } from "@/hooks/store/use-release";
import { useReleaseWorkItems } from "@/hooks/store/use-release-work-items";
import { useUserPermissions } from "@/hooks/store/user";
// local imports
import { ReleaseScopeGroup } from "./group";

type Props = {
  workspaceSlug: string;
  projectId: string;
  releaseId: string;
};

/**
 * Work items in a release, grouped by state group.
 *
 * Deliberately not built on `BaseIssuesStore`: that machinery exists to serve paginated,
 * server-grouped, filterable layouts. A release's scope is a bounded list, so grouping
 * client-side keeps this isolated from the shared issue-layout plumbing.
 */
export const ReleaseScopeRoot = observer(function ReleaseScopeRoot(props: Props) {
  const { workspaceSlug, projectId, releaseId } = props;
  // state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  // plane hooks
  const { t } = useTranslation();
  // store hooks
  const { fetchWorkItems, getGroupedWorkItems, addWorkItems } = useReleaseWorkItems();
  const { fetchReleaseDetails } = useRelease();
  const { allowPermissions } = useUserPermissions();
  // derived values
  const isEditingAllowed = allowPermissions(
    [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
    EUserPermissionsLevel.PROJECT
  );

  useSWR(
    releaseId ? `RELEASE_WORK_ITEMS_${releaseId}` : null,
    releaseId ? () => fetchWorkItems(workspaceSlug, projectId, releaseId) : null,
    { revalidateIfStale: false, revalidateOnFocus: false }
  );

  const grouped = getGroupedWorkItems(releaseId);

  const handleAddWorkItems = async (data: ISearchIssueResponse[]) => {
    const ids = data.map((item) => item.id);
    if (ids.length === 0) return;
    try {
      await addWorkItems(workspaceSlug, projectId, releaseId, ids);
      // The completion ring reads off the release, so refresh its counts.
      await fetchReleaseDetails(workspaceSlug, projectId, releaseId);
    } catch {
      setToast({
        type: "error",
        title: t("toast.error"),
        message: t("project_releases.toast.add_work_items.error"),
      });
    }
  };

  return (
    <>
      <ExistingIssuesListModal
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        isOpen={isAddModalOpen}
        handleClose={() => setIsAddModalOpen(false)}
        searchParams={{}}
        handleOnSubmit={handleAddWorkItems}
      />

      <div className="flex items-center justify-between px-6 py-4">
        <h3 className="text-lg font-medium text-primary">{t("project_releases.scope")}</h3>
        {isEditingAllowed ? (
          <Button
            stretch="auto"
            variant="secondary"
            size="md"
            label={t("project_releases.add_work_items")}
            onClick={() => setIsAddModalOpen(true)}
          />
        ) : null}
      </div>

      <div className="flex flex-col">
        {/* Every band renders, including empty ones, so the scope reads as a whole. */}
        {(Object.keys(STATE_GROUPS) as TStateGroups[]).map((group) => (
          <ReleaseScopeGroup
            key={group}
            group={group}
            icon={<StateGroupIcon stateGroup={group} />}
            workItemIds={grouped[group] ?? []}
            workspaceSlug={workspaceSlug}
            projectId={projectId}
            releaseId={releaseId}
            isEditingAllowed={isEditingAllowed}
          />
        ))}
      </div>
    </>
  );
});
