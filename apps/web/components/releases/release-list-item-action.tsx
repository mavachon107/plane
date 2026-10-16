/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type React from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { UserAltOutline } from "@makeplane/propel/icons";
import { Tooltip } from "@makeplane/propel/components/tooltip";
// plane imports
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import type { IRelease } from "@plane/types";
import { getDate, renderFormattedPayloadDate } from "@plane/utils";
import { DateSelect } from "@plane/blocks/property-select";
import { setToast } from "@plane/blocks/toast";
// components
import { ButtonAvatars } from "@/components/dropdowns/member/avatar";
// hooks
import { useRelease } from "@/hooks/store/use-release";
import { useUserPermissions, useUserProfile } from "@/hooks/store/user";
// local imports
import { ReleaseLabelSelect } from "./release-label-select";
import { ReleaseQuickActions } from "./quick-actions";
import { ReleaseStatusDropdown } from "./release-status-dropdown";
import { ReleaseTagSelect } from "./release-tag-select";

type Props = {
  releaseId: string;
  releaseDetails: IRelease;
  parentRef: React.RefObject<HTMLDivElement | null>;
};

export const ReleaseListItemAction = observer(function ReleaseListItemAction(props: Props) {
  const { releaseId, releaseDetails, parentRef } = props;
  // router
  const { workspaceSlug, projectId } = useParams();
  // plane hooks
  const { t } = useTranslation();
  // store hooks
  const { updateReleaseDetails, attachLabels, detachLabels } = useRelease();
  const { allowPermissions } = useUserPermissions();
  const { data: userProfile } = useUserProfile();
  // derived values
  const isEditingAllowed = allowPermissions(
    [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
    EUserPermissionsLevel.PROJECT
  );
  const slug = workspaceSlug?.toString() ?? "";
  const project = projectId?.toString() ?? "";
  const labelIds = releaseDetails.label_details?.map((label) => label.id) ?? [];

  const notifyFailure = () => {
    setToast({
      type: "error",
      title: t("toast.error"),
      message: t("project_releases.toast.update.error"),
    });
  };

  const handleReleaseDetailsChange = async (payload: Partial<IRelease>) => {
    if (!slug || !project) return;
    try {
      await updateReleaseDetails(slug, project, releaseId, payload);
      setToast({
        type: "success",
        title: t("toast.success"),
        message: t("project_releases.toast.update.success"),
      });
    } catch {
      notifyFailure();
    }
  };

  /** The API attaches and detaches separately, so diff against what is currently on. */
  const handleLabelsChange = async (nextLabelIds: string[]) => {
    if (!slug || !project) return;
    const toAttach = nextLabelIds.filter((id) => !labelIds.includes(id));
    const toDetach = labelIds.filter((id) => !nextLabelIds.includes(id));
    try {
      if (toAttach.length > 0) await attachLabels(slug, project, releaseId, toAttach);
      if (toDetach.length > 0) await detachLabels(slug, project, releaseId, toDetach);
    } catch {
      notifyFailure();
    }
  };

  return (
    <>
      {/* The API field is release_date; the UI has always labelled it "Target date". */}
      <DateSelect
        value={getDate(releaseDetails.release_date) ?? null}
        onChange={(val) => {
          void handleReleaseDetailsChange({
            release_date: val ? renderFormattedPayloadDate(val) : null,
          });
        }}
        placeholder={t("project_releases.target_date")}
        variant="select-ghost-md"
        weekStartsOn={userProfile?.start_of_the_week}
        disabled={!isEditingAllowed}
        clearable
        clearLabel={t("common.clear")}
      />

      <ReleaseStatusDropdown
        value={releaseDetails.status}
        onChange={handleReleaseDetailsChange}
        disabled={!isEditingAllowed}
      />

      {releaseDetails.lead ? (
        <ButtonAvatars showTooltip userIds={releaseDetails.lead} />
      ) : (
        <Tooltip label={t("project_releases.no_lead")}>
          <UserAltOutline className="h-4 w-4 text-tertiary" />
        </Tooltip>
      )}

      <ReleaseLabelSelect
        projectId={project}
        value={labelIds}
        onChange={(ids) => {
          void handleLabelsChange(ids);
        }}
        disabled={!isEditingAllowed}
      />

      <ReleaseTagSelect
        projectId={project}
        value={releaseDetails.tag}
        onChange={(tagId) => {
          void handleReleaseDetailsChange({ tag: tagId });
        }}
        disabled={!isEditingAllowed}
      />

      <ReleaseQuickActions parentRef={parentRef} releaseId={releaseId} projectId={project} workspaceSlug={slug} />
    </>
  );
});
