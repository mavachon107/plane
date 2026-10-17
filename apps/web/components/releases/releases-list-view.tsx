/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { Tab, Tabs, TabsList } from "@makeplane/propel/components/tabs";
// plane imports
import { EUserPermissions, EUserPermissionsLevel, RELEASE_STATUS } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import type { TReleaseStatus } from "@plane/types";
import { EmptyStateDetailed } from "@plane/blocks/empty-state";
import { CycleModuleListLayoutLoader } from "@/components/ui/loader/cycle-module-list-loader";
// components
import { ListLayout } from "@/components/core/list";
// hooks
import { useCommandPalette } from "@/hooks/store/use-command-palette";
import { useRelease } from "@/hooks/store/use-release";
import { useReleaseFilter } from "@/hooks/store/use-release-filter";
import { useUserPermissions } from "@/hooks/store/user";
// local imports
import { ReleaseListItem } from "./release-list-item";

export const ReleasesListView = observer(function ReleasesListView() {
  // router
  const { projectId } = useParams();
  // plane hooks
  const { t } = useTranslation();
  // store hooks
  const { getFilteredReleaseIds, getReleaseIdsByStatus, loader } = useRelease();
  const { activeStatusTab, setActiveStatusTab, searchQuery } = useReleaseFilter();
  const { toggleCreateReleaseModal } = useCommandPalette();
  const { allowPermissions } = useUserPermissions();
  // derived values
  const project = projectId?.toString() ?? "";
  const filteredReleaseIds = getFilteredReleaseIds(project);
  const visibleReleaseIds = getReleaseIdsByStatus(project, activeStatusTab);
  const canPerformEmptyStateActions = allowPermissions(
    [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
    EUserPermissionsLevel.PROJECT
  );

  if (loader || !filteredReleaseIds || !visibleReleaseIds) return <CycleModuleListLayoutLoader />;

  const statusTabs = (
    <Tabs
      variant="underline"
      value={activeStatusTab}
      onValueChange={(value) => {
        setActiveStatusTab(value as TReleaseStatus);
      }}
    >
      <div className="pt-3 pb-3">
        <TabsList>
          {RELEASE_STATUS.map((status) => (
            <Tab key={status.value} value={status.value} label={t(status.i18n_label)} />
          ))}
        </TabsList>
      </div>
    </Tabs>
  );

  // Nothing in the project at all -- offer to create the first release.
  if (filteredReleaseIds.length === 0 && !searchQuery)
    return (
      <>
        <div className="px-6">{statusTabs}</div>
        <EmptyStateDetailed
          assetKey="module"
          title={t("project_releases.empty_state.general.title")}
          description={t("project_releases.empty_state.general.description")}
          actions={[
            {
              label: t("project_releases.add_release"),
              onClick: () => toggleCreateReleaseModal(true),
              disabled: !canPerformEmptyStateActions,
              variant: "primary",
            },
          ]}
        />
      </>
    );

  return (
    <div className="flex h-full w-full flex-col">
      <div className="px-6">{statusTabs}</div>
      {visibleReleaseIds.length === 0 ? (
        <EmptyStateDetailed
          assetKey="search"
          title={t("common_empty_state.search.title")}
          description={t("common_empty_state.search.description")}
        />
      ) : (
        <ListLayout>
          {visibleReleaseIds.map((releaseId) => (
            <ReleaseListItem key={releaseId} releaseId={releaseId} />
          ))}
        </ListLayout>
      )}
    </div>
  );
});
