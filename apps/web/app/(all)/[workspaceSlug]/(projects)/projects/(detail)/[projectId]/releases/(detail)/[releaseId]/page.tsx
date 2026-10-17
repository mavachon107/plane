/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import useSWR from "swr";
import { Icon } from "@makeplane/propel/components/icon";
import { IconButton } from "@makeplane/propel/components/icon-button";
import { Tab, Tabs, TabsList, TabsPanel } from "@makeplane/propel/components/tabs";
import { DocumentationOutline, OverviewOutline, RightSidePaneOutline, ScopeOutline } from "@makeplane/propel/icons";
// plane imports
import { useTranslation } from "@plane/i18n";
import { Spinner } from "@plane/blocks/spinner";
// components
import { PageHead } from "@/components/core/page-title";
import { DetailedEmptyState } from "@/components/empty-state/detailed-empty-state-root";
import { ReleaseChangelogRoot, ReleaseOverviewRoot, ReleaseScopeRoot } from "@/components/releases";
// hooks
import { useProject } from "@/hooks/store/use-project";
import { useRelease } from "@/hooks/store/use-release";
import { useAppRouter } from "@/hooks/use-app-router";
import type { Route } from "./+types/page";

const TABS = ["overview", "scope", "changelog"] as const;
const TAB_ICONS = {
  overview: <OverviewOutline className="size-4" />,
  scope: <ScopeOutline className="size-4" />,
  changelog: <DocumentationOutline className="size-4" />,
} as const;
type TReleaseTab = (typeof TABS)[number];

function ProjectReleaseDetailPage({ params }: Route.ComponentProps) {
  const { workspaceSlug, projectId, releaseId } = params;
  // state
  const [activeTab, setActiveTab] = useState<TReleaseTab>("overview");
  const [isActivityOpen, setIsActivityOpen] = useState(true);
  // router
  const router = useAppRouter();
  // plane hooks
  const { t } = useTranslation();
  // store hooks
  const { getProjectById } = useProject();
  const { fetchReleaseDetails, getReleaseById, fetchLabels, fetchTags } = useRelease();
  // derived values
  const project = getProjectById(projectId);
  const release = getReleaseById(releaseId);
  const pageTitle = release?.name ? `${project?.name} - ${release.name}` : undefined;

  // The palettes back the tag and label pickers on the Overview tab.
  const { error, isLoading } = useSWR(
    workspaceSlug && projectId && releaseId ? `CURRENT_RELEASE_DETAILS_${releaseId}` : null,
    workspaceSlug && projectId && releaseId
      ? async () => {
          await Promise.all([
            fetchReleaseDetails(workspaceSlug, projectId, releaseId),
            fetchLabels(workspaceSlug, projectId),
            fetchTags(workspaceSlug, projectId),
          ]);
        }
      : null,
    { revalidateIfStale: false, revalidateOnFocus: false }
  );

  if (error)
    return (
      <div className="flex h-full w-full items-center justify-center">
        <DetailedEmptyState
          title={t("project_releases.not_found.title")}
          description={t("project_releases.not_found.description")}
          assetPath=""
          primaryButton={{
            text: t("project_releases.not_found.primary_button"),
            onClick: () => {
              router.push(`/${workspaceSlug}/projects/${projectId}/releases`);
            },
          }}
        />
      </div>
    );

  if (isLoading || !release)
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Spinner />
      </div>
    );

  return (
    <>
      <PageHead title={pageTitle} />
      <Tabs
        variant="underline"
        value={activeTab}
        onValueChange={(value) => {
          setActiveTab(value as TReleaseTab);
        }}
      >
        <div className="relative w-full border-b border-subtle-1 px-6 pt-3">
          <TabsList>
            {TABS.map((tab) => (
              <Tab key={tab} value={tab} icon={TAB_ICONS[tab]} label={t(`project_releases.tabs.${tab}`)} />
            ))}
          </TabsList>
          {activeTab === "overview" && (
            <div className="absolute top-3 right-6">
              <IconButton
                variant="tertiary"
                size="md"
                icon={<Icon icon={RightSidePaneOutline} />}
                aria-label={t("project_releases.overview.toggle_activity")}
                onClick={() => setIsActivityOpen((open) => !open)}
              />
            </div>
          )}
        </div>
        {/* TabsPanel takes no className, so the fill height comes from this one-row grid. */}
        <div className="grid min-h-0 w-full flex-1 grid-rows-1 overflow-y-auto">
          <TabsPanel value="overview">
            <ReleaseOverviewRoot
              workspaceSlug={workspaceSlug}
              projectId={projectId}
              release={release}
              isActivityOpen={isActivityOpen}
            />
          </TabsPanel>
          <TabsPanel value="scope">
            <ReleaseScopeRoot workspaceSlug={workspaceSlug} projectId={projectId} releaseId={releaseId} />
          </TabsPanel>
          <TabsPanel value="changelog">
            <ReleaseChangelogRoot workspaceSlug={workspaceSlug} projectId={projectId} releaseId={releaseId} />
          </TabsPanel>
        </div>
      </Tabs>
    </>
  );
}

export default observer(ProjectReleaseDetailPage);
