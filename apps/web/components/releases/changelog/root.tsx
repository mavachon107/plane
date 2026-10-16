/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import useSWR from "swr";
// plane imports
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import type { TNameDescriptionLoader } from "@plane/types";
import { EFileAssetType } from "@plane/types";
import { Spinner } from "@plane/blocks/spinner";
import { setToast } from "@plane/blocks/toast";
// components
import { DescriptionInput } from "@/components/editor/rich-text/description-input";
// hooks
import { useRelease } from "@/hooks/store/use-release";
import { useUserPermissions } from "@/hooks/store/user";

type Props = {
  workspaceSlug: string;
  projectId: string;
  releaseId: string;
};

/**
 * The customer-facing notes for a release.
 *
 * `DescriptionInput` autosaves on a debounce and flushes on unmount, so there is no
 * explicit save control -- the same contract the work item description uses.
 */
export const ReleaseChangelogRoot = observer(function ReleaseChangelogRoot(props: Props) {
  const { workspaceSlug, projectId, releaseId } = props;
  // state
  const [isSubmitting, setIsSubmitting] = useState<TNameDescriptionLoader>("saved");
  // plane hooks
  const { t } = useTranslation();
  // store hooks
  const { fetchChangelog, getChangelogByReleaseId, updateChangelog } = useRelease();
  const { allowPermissions } = useUserPermissions();
  // derived values
  const isEditingAllowed = allowPermissions(
    [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
    EUserPermissionsLevel.PROJECT
  );

  const { isLoading } = useSWR(
    releaseId ? `RELEASE_CHANGELOG_${releaseId}` : null,
    releaseId ? () => fetchChangelog(workspaceSlug, projectId, releaseId) : null,
    { revalidateIfStale: false, revalidateOnFocus: false }
  );

  const changelog = getChangelogByReleaseId(releaseId);

  if (isLoading || !changelog)
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Spinner />
      </div>
    );

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-6">
      <h3 className="text-lg mb-4 font-medium text-primary">{t("project_releases.changelog")}</h3>
      <DescriptionInput
        key={changelog.id}
        entityId={changelog.id}
        fileAssetType={EFileAssetType.PAGE_DESCRIPTION}
        initialValue={changelog.description_html}
        disabled={!isEditingAllowed}
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        placeholder={t("project_releases.changelog_placeholder")}
        setIsSubmitting={(value) => setIsSubmitting(value)}
        onSubmit={async (value) => {
          await updateChangelog(workspaceSlug, projectId, releaseId, {
            description_html: value.description_html,
          }).catch(() => {
            setToast({
              type: "error",
              title: t("toast.error"),
              message: t("project_releases.toast.changelog.error"),
            });
          });
        }}
      />
      {isSubmitting === "submitting" ? (
        <span className="text-xs mt-2 block text-tertiary">{t("common.saving")}</span>
      ) : null}
    </div>
  );
});
