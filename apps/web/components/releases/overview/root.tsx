/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ReactNode } from "react";
import { observer } from "mobx-react";
// plane imports
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import type { IRelease } from "@plane/types";
import { getDate, renderFormattedPayloadDate } from "@plane/utils";
import { DateSelect } from "@plane/blocks/property-select";
import { setToast } from "@plane/blocks/toast";
// components
import { MemberSelect } from "@/components/dropdowns/member/member-select";
// hooks
import { useRelease } from "@/hooks/store/use-release";
import { useUserPermissions, useUserProfile } from "@/hooks/store/user";
// local imports
import { ReleaseLabelSelect } from "../release-label-select";
import { ReleaseStatusDropdown } from "../release-status-dropdown";
import { ReleaseTagSelect } from "../release-tag-select";

type Props = {
  workspaceSlug: string;
  projectId: string;
  release: IRelease;
};

const Row = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="flex items-center gap-4 py-2">
    <span className="text-sm w-32 flex-shrink-0 text-tertiary">{label}</span>
    <div className="flex-grow">{children}</div>
  </div>
);

export const ReleaseOverviewRoot = observer(function ReleaseOverviewRoot(props: Props) {
  const { workspaceSlug, projectId, release } = props;
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
  const labelIds = release.label_details?.map((label) => label.id) ?? [];

  const notifyFailure = () => {
    setToast({
      type: "error",
      title: t("toast.error"),
      message: t("project_releases.toast.update.error"),
    });
  };

  const handleChange = async (payload: Partial<IRelease>) => {
    await updateReleaseDetails(workspaceSlug, projectId, release.id, payload).catch(notifyFailure);
  };

  /** The API attaches and detaches separately, so diff against what is currently on. */
  const handleLabelsChange = async (nextLabelIds: string[]) => {
    const toAttach = nextLabelIds.filter((id) => !labelIds.includes(id));
    const toDetach = labelIds.filter((id) => !nextLabelIds.includes(id));
    try {
      if (toAttach.length > 0) await attachLabels(workspaceSlug, projectId, release.id, toAttach);
      if (toDetach.length > 0) await detachLabels(workspaceSlug, projectId, release.id, toDetach);
    } catch {
      notifyFailure();
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-6">
      <h2 className="text-xl mb-4 font-medium text-primary">{release.name}</h2>

      <div className="divide-y divide-subtle">
        <Row label={t("project_releases.status_label")}>
          <ReleaseStatusDropdown value={release.status} onChange={handleChange} disabled={!isEditingAllowed} />
        </Row>

        <Row label={t("project_releases.target_date")}>
          <DateSelect
            value={getDate(release.release_date) ?? null}
            onChange={(val) => {
              void handleChange({ release_date: val ? renderFormattedPayloadDate(val) : null });
            }}
            placeholder={t("project_releases.target_date")}
            variant="select-ghost-md"
            weekStartsOn={userProfile?.start_of_the_week}
            disabled={!isEditingAllowed}
            clearable
            clearLabel={t("common.clear")}
          />
        </Row>

        <Row label={t("project_releases.lead")}>
          <MemberSelect
            value={release.lead}
            onChange={(id) => {
              void handleChange({ lead: id });
            }}
            projectId={projectId}
            multiple={false}
            placeholder={t("project_releases.lead")}
            variant="select-ghost-md"
            disabled={!isEditingAllowed}
          />
        </Row>

        <Row label={t("project_releases.tag")}>
          <ReleaseTagSelect
            projectId={projectId}
            value={release.tag}
            onChange={(tagId) => {
              void handleChange({ tag: tagId });
            }}
            disabled={!isEditingAllowed}
          />
        </Row>

        <Row label={t("project_releases.label")}>
          <ReleaseLabelSelect
            projectId={projectId}
            value={labelIds}
            onChange={(ids) => {
              void handleLabelsChange(ids);
            }}
            disabled={!isEditingAllowed}
          />
        </Row>

        <Row label={t("project_releases.work_items")}>
          <span className="text-sm text-primary">
            {release.completed_work_item_count} / {release.work_item_count}
          </span>
        </Row>
      </div>
    </div>
  );
});
