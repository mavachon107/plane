/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ReactNode } from "react";
import { useState } from "react";
import { observer } from "mobx-react";
import { LabelsOutline, PropertiesOutline, ReleaseTagOutline, UserCircleOutline } from "@makeplane/propel/icons";
// plane imports
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import type { IRelease, TNameDescriptionLoader } from "@plane/types";
import { EFileAssetType } from "@plane/types";
import { getDate, renderFormattedDate, renderFormattedPayloadDate, renderFormattedTime } from "@plane/utils";
import { DateSelect } from "@plane/blocks/property-select";
import { setToast } from "@plane/blocks/toast";
// components
import { MemberSelect } from "@/components/dropdowns/member/member-select";
import { ButtonAvatars } from "@/components/dropdowns/member/avatar";
import { DescriptionInput } from "@/components/editor/rich-text/description-input";
// hooks
import { useMember } from "@/hooks/store/use-member";
import { useRelease } from "@/hooks/store/use-release";
import { useUserPermissions, useUserProfile } from "@/hooks/store/user";
// local imports
import { ReleaseLabelSelect } from "../release-label-select";
import { ReleaseStatusDropdown } from "../release-status-dropdown";
import { ReleaseTagSelect } from "../release-tag-select";
import { ReleaseActivity } from "./activity";

type Props = {
  workspaceSlug: string;
  projectId: string;
  release: IRelease;
  /** Whether the activity panel on the right is shown. */
  isActivityOpen?: boolean;
};

const Row = ({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) => (
  <div className="flex min-h-9 items-center gap-4">
    <div className="flex w-56 flex-shrink-0 items-center gap-3 text-14 text-secondary">
      <span className="grid size-5 place-items-center text-tertiary">{icon}</span>
      {label}
    </div>
    <div className="flex flex-wrap items-center gap-2">{children}</div>
  </div>
);

const Stat = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="flex flex-col gap-2">
    <span className="text-13 text-secondary">{label}</span>
    <span className="flex items-baseline gap-1.5 text-20 font-medium text-primary">{children}</span>
  </div>
);

export const ReleaseOverviewRoot = observer(function ReleaseOverviewRoot(props: Props) {
  const { workspaceSlug, projectId, release, isActivityOpen = true } = props;
  // state
  const [, setIsSubmitting] = useState<TNameDescriptionLoader>("saved");
  // plane hooks
  const { t } = useTranslation();
  // store hooks
  const { updateReleaseDetails, attachLabels, detachLabels } = useRelease();
  const { allowPermissions } = useUserPermissions();
  const { data: userProfile } = useUserProfile();
  const { getUserDetails } = useMember();
  // derived values
  const isEditingAllowed = allowPermissions(
    [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
    EUserPermissionsLevel.PROJECT
  );
  const labelIds = release.label_details?.map((label) => label.id) ?? [];
  const createdBy = getUserDetails(release.created_by ?? "");
  const total = release.work_item_count;
  const cancelled = release.cancelled_work_item_count ?? 0;
  // `completed_work_item_count` counts both completed and cancelled work items.
  const completed = Math.max(release.completed_work_item_count - cancelled, 0);
  const pending = Math.max(total - release.completed_work_item_count, 0);
  const progress = total > 0 ? Math.floor((completed / total) * 100) : 0;

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
    <div className="flex h-full w-full">
      <div className="min-w-0 flex-1 overflow-y-auto px-9 py-8">
        <div className="max-w-4xl">
          <h2 className="mb-6 text-28 font-semibold text-primary">{release.name}</h2>

          <div className="flex flex-col gap-1">
            <Row icon={<PropertiesOutline className="size-4" />} label={t("project_releases.overview.properties")}>
              <ReleaseStatusDropdown value={release.status} onChange={handleChange} disabled={!isEditingAllowed} />
              <DateSelect
                value={getDate(release.release_date) ?? null}
                onChange={(val) => {
                  void handleChange({ release_date: val ? renderFormattedPayloadDate(val) : null });
                }}
                placeholder={t("project_releases.target_date")}
                variant="pill-md"
                weekStartsOn={userProfile?.start_of_the_week}
                disabled={!isEditingAllowed}
                clearable
                clearLabel={t("common.clear")}
              />
              <MemberSelect
                value={release.lead}
                onChange={(id) => {
                  void handleChange({ lead: id });
                }}
                projectId={projectId}
                placeholder={t("project_releases.lead")}
                variant="pill-md"
                clearable
                clearLabel={t("project_releases.no_lead")}
                disabled={!isEditingAllowed}
              />
            </Row>

            <Row icon={<ReleaseTagOutline className="size-4" />} label={t("project_releases.tag")}>
              <ReleaseTagSelect
                projectId={projectId}
                value={release.tag}
                onChange={(tagId) => {
                  void handleChange({ tag: tagId });
                }}
                disabled={!isEditingAllowed}
                variant="select-ghost-md"
              />
            </Row>

            <Row icon={<LabelsOutline className="size-4" />} label={t("common.labels")}>
              <ReleaseLabelSelect
                projectId={projectId}
                value={labelIds}
                onChange={(ids) => {
                  void handleLabelsChange(ids);
                }}
                disabled={!isEditingAllowed}
                variant="select-ghost-md"
              />
            </Row>

            <Row icon={<UserCircleOutline className="size-4" />} label={t("common.created_by")}>
              <div className="flex items-center gap-2 px-2 text-14 text-secondary">
                {createdBy && <ButtonAvatars showTooltip userIds={createdBy.id} />}
                <span>
                  {t("project_releases.overview.created_by_on", {
                    name: createdBy?.display_name ?? "",
                    date: `${renderFormattedDate(release.created_at)} ${renderFormattedTime(release.created_at, "12-hour").replace(" ", "")}`,
                  })}
                </span>
              </div>
            </Row>
          </div>

          <div className="mt-6">
            <DescriptionInput
              key={release.id}
              entityId={release.id}
              fileAssetType={EFileAssetType.PAGE_DESCRIPTION}
              initialValue={release.description_html}
              disabled={!isEditingAllowed}
              workspaceSlug={workspaceSlug}
              projectId={projectId}
              placeholder={t("project_releases.overview.click_to_add_description")}
              containerClassName="-ml-3 border-none"
              setIsSubmitting={(value) => setIsSubmitting(value)}
              onSubmit={async (value) => {
                await handleChange({ description_html: value.description_html });
              }}
            />
          </div>

          <div className="mt-6 border-t border-subtle-1 pt-8">
            <h3 className="mb-4 text-16 text-secondary">{t("project_releases.overview.progress")}</h3>
            <div className="h-2 w-full overflow-hidden rounded-full bg-layer-3">
              <div
                className="h-full rounded-full bg-success-primary transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="mt-6 flex flex-wrap gap-12">
              <Stat label={t("project_releases.overview.completed_work_items")}>
                <span>
                  {completed}/{total}
                </span>
                <span className="text-12 text-secondary">{progress}%</span>
              </Stat>
              <Stat label={t("project_releases.overview.pending_work_items")}>{pending}</Stat>
              <Stat label={t("project_releases.overview.cancelled_work_items")}>{cancelled}</Stat>
            </div>
          </div>
        </div>
      </div>

      {isActivityOpen && (
        <aside className="hidden w-96 flex-shrink-0 overflow-y-auto border-l border-subtle-1 px-6 py-8 md:block">
          <ReleaseActivity workspaceSlug={workspaceSlug} projectId={projectId} releaseId={release.id} />
        </aside>
      )}
    </div>
  );
});
