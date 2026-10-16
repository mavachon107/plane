/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useTheme } from "next-themes";
import useSWR from "swr";
// plane imports
import { EUserPermissionsLevel } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { EUserProjectRoles } from "@plane/types";
// assets -- no release illustration ships yet, so the modules art stands in.
import darkReleasesAsset from "@/app/assets/empty-state/disabled-feature/modules-dark.webp?url";
import lightReleasesAsset from "@/app/assets/empty-state/disabled-feature/modules-light.webp?url";
// components
import { PageHead } from "@/components/core/page-title";
import { DetailedEmptyState } from "@/components/empty-state/detailed-empty-state-root";
import { ReleasesListView } from "@/components/releases";
// hooks
import { useProject } from "@/hooks/store/use-project";
import { useRelease } from "@/hooks/store/use-release";
import { useUserPermissions } from "@/hooks/store/user";
import { useAppRouter } from "@/hooks/use-app-router";
import type { Route } from "./+types/page";

function ProjectReleasesPage({ params }: Route.ComponentProps) {
  // router
  const router = useAppRouter();
  const { workspaceSlug, projectId } = params;
  // theme hook
  const { resolvedTheme } = useTheme();
  // plane hooks
  const { t } = useTranslation();
  // store hooks
  const { getProjectById, currentProjectDetails } = useProject();
  const { fetchReleases, fetchLabels, fetchTags } = useRelease();
  const { allowPermissions } = useUserPermissions();
  // derived values
  const project = getProjectById(projectId);
  const pageTitle = project?.name ? `${project?.name} - Releases` : undefined;
  const canPerformEmptyStateActions = allowPermissions([EUserProjectRoles.ADMIN], EUserPermissionsLevel.PROJECT);
  const resolvedPath = resolvedTheme === "light" ? lightReleasesAsset : darkReleasesAsset;

  // The palettes back the row-level tag and label pickers, so load them alongside.
  useSWR(
    workspaceSlug && projectId ? `PROJECT_RELEASES_${workspaceSlug}_${projectId}` : null,
    workspaceSlug && projectId
      ? async () => {
          await Promise.all([
            fetchReleases(workspaceSlug, projectId),
            fetchLabels(workspaceSlug, projectId),
            fetchTags(workspaceSlug, projectId),
          ]);
        }
      : null,
    { revalidateIfStale: false, revalidateOnFocus: false }
  );

  if (currentProjectDetails?.release_view === false)
    return (
      <div className="flex h-full w-full items-center justify-center">
        <DetailedEmptyState
          title={t("project_releases.disabled.title")}
          description={t("project_releases.disabled.description")}
          assetPath={resolvedPath}
          primaryButton={{
            text: t("project_releases.disabled.primary_button"),
            onClick: () => {
              router.push(`/${workspaceSlug}/settings/projects/${projectId}/features`);
            },
            disabled: !canPerformEmptyStateActions,
          }}
        />
      </div>
    );

  return (
    <>
      <PageHead title={pageTitle} />
      <div className="flex h-full w-full flex-col">
        <ReleasesListView />
      </div>
    </>
  );
}

export default observer(ProjectReleasesPage);
