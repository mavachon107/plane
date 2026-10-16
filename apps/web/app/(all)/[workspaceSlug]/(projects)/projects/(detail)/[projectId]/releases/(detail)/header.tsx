/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useRef } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { Button } from "@makeplane/propel/components/button";
import { ReleasesOutline } from "@makeplane/propel/icons";
// plane imports
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { Breadcrumbs } from "@plane/blocks/breadcrumb";
import { Header } from "@plane/blocks/layout";
import { setToast } from "@plane/blocks/toast";
// components
import { CommonProjectBreadcrumbs } from "@/components/breadcrumbs/common";
import { useProjectCrumbProps } from "@/components/breadcrumbs/use-project-crumb-props";
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { ReleaseQuickActions } from "@/components/releases";
// hooks
import { useProject } from "@/hooks/store/use-project";
import { useRelease } from "@/hooks/store/use-release";
import { useUserPermissions } from "@/hooks/store/user";

export const ReleaseDetailHeader = observer(function ReleaseDetailHeader() {
  // refs
  const parentRef = useRef<HTMLDivElement>(null);
  // router
  const { workspaceSlug, projectId, releaseId } = useParams();
  const projectCrumb = useProjectCrumbProps(workspaceSlug?.toString(), projectId?.toString());
  // plane hooks
  const { t } = useTranslation();
  // store hooks
  const { getReleaseById, updateReleaseDetails } = useRelease();
  const { allowPermissions } = useUserPermissions();
  const { loader } = useProject();
  // derived values
  const slug = workspaceSlug?.toString() ?? "";
  const project = projectId?.toString() ?? "";
  const release = releaseId ? getReleaseById(releaseId.toString()) : undefined;
  const isEditingAllowed = allowPermissions(
    [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
    EUserPermissionsLevel.PROJECT
  );

  const handleReleaseNow = async () => {
    if (!release) return;
    try {
      await updateReleaseDetails(slug, project, release.id, { status: "released" });
      setToast({
        type: "success",
        title: t("toast.success"),
        message: t("project_releases.toast.released.success"),
      });
    } catch {
      setToast({
        type: "error",
        title: t("toast.error"),
        message: t("project_releases.toast.update.error"),
      });
    }
  };

  return (
    <Header>
      <Header.LeftItem>
        <div ref={parentRef}>
          <Breadcrumbs isLoading={loader === "init-loader"}>
            <CommonProjectBreadcrumbs workspaceSlug={slug} projectId={project} {...projectCrumb} />
            <Breadcrumbs.Item
              component={
                <BreadcrumbLink
                  label={t("sidebar.releases")}
                  href={`/${slug}/projects/${project}/releases/`}
                  icon={<ReleasesOutline className="h-4 w-4 text-tertiary" />}
                />
              }
            />
            <Breadcrumbs.Item component={<BreadcrumbLink label={release?.name ?? "..."} isLast />} isLast />
          </Breadcrumbs>
        </div>
      </Header.LeftItem>
      <Header.RightItem>
        {isEditingAllowed && release && release.status !== "released" ? (
          <Button
            stretch="auto"
            variant="primary"
            size="md"
            label={t("project_releases.release_now")}
            onClick={() => {
              void handleReleaseNow();
            }}
          />
        ) : null}
        {release ? (
          <ReleaseQuickActions parentRef={parentRef} releaseId={release.id} projectId={project} workspaceSlug={slug} />
        ) : null}
      </Header.RightItem>
    </Header>
  );
});
