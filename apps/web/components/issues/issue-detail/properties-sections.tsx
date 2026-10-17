/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { Collapsible } from "@makeplane/propel/components/collapsible";
import {
  CyclesOutline,
  DueDateOutline,
  EstimateOutline,
  LabelsOutline,
  ModuleOutline,
  ParentOutline,
  ReleasesOutline,
  StartDateOutline,
  UserOutline,
} from "@makeplane/propel/icons";
// plane imports
import { DateSelect } from "@plane/blocks/property-select";
import { useTranslation } from "@plane/i18n";
import {
  cn,
  getDate,
  renderFormattedDate,
  renderFormattedPayloadDate,
  shouldHighlightIssueDueDate,
} from "@plane/utils";
// components
import { SidebarPropertyListItem } from "@/components/common/layout/sidebar/property-list-item";
import { EstimateSelect } from "@/components/dropdowns/estimate/estimate-select";
import { IssueParentSelectRoot } from "@/components/issues/parent-select-root";
// hooks
import { useProjectEstimates } from "@/hooks/store/estimates";
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useMember } from "@/hooks/store/use-member";
import { useProject } from "@/hooks/store/use-project";
import { useProjectState } from "@/hooks/store/use-project-state";
import { useUserProfile } from "@/hooks/store/user";
// local imports
import { IssueCycleSelect } from "./cycle-select";
import { IssueLabel } from "./label";
import { IssueModuleSelect } from "./module-select";
import { IssueReleaseSelect } from "./release-select";
import type { TIssueOperations } from "./root";

type Props = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  issueOperations: TIssueOperations;
  disabled: boolean;
  /** Show the created-by / created-on / updated-on footer. */
  showMeta?: boolean;
};

/**
 * Shared body of the work item properties panel (full-page sidebar and peek overview):
 * a collapsible "Details" section and a collapsible "Project structure" section.
 * State, priority and assignees live in `IssueQuickProperties` under the title.
 */
export const IssuePropertiesSections = observer(function IssuePropertiesSections(props: Props) {
  const { workspaceSlug, projectId, issueId, issueOperations, disabled, showMeta = false } = props;
  const { t } = useTranslation();
  // states
  const [isDetailsOpen, setIsDetailsOpen] = useState(true);
  const [isStructureOpen, setIsStructureOpen] = useState(true);
  // store hooks
  const { getProjectById } = useProject();
  const { areEstimateEnabledByProjectId } = useProjectEstimates();
  const {
    issue: { getIssueById },
  } = useIssueDetail();
  const { getUserDetails } = useMember();
  const { getStateById } = useProjectState();
  const { data: userProfile } = useUserProfile();
  // derived values
  const issue = getIssueById(issueId);
  if (!issue) return null;

  const projectDetails = getProjectById(issue.project_id);
  const stateDetails = getStateById(issue.state_id);
  const createdByDetails = getUserDetails(issue.created_by);
  const minDate = getDate(issue.start_date);
  const maxDate = getDate(issue.target_date);
  const hasStructure = !!(projectDetails?.module_view || projectDetails?.cycle_view || projectDetails?.release_view);

  return (
    <div className={cn("w-full", { "opacity-60": disabled })}>
      <Collapsible
        open={isDetailsOpen}
        onOpenChange={setIsDetailsOpen}
        trigger={<span className="text-13 font-medium text-primary">{t("common.details")}</span>}
      >
        <div className="mt-2 mb-3 space-y-2.5">
          <SidebarPropertyListItem icon={StartDateOutline} label={t("common.order_by.start_date")}>
            <DateSelect
              testId="work-item-start-date-select"
              placeholder={t("issue.add.start_date")}
              value={minDate ?? null}
              onChange={(val) =>
                issueOperations.update(workspaceSlug, projectId, issueId, {
                  start_date: val ? renderFormattedPayloadDate(val) : null,
                })
              }
              maxDate={maxDate ?? undefined}
              disabled={disabled}
              clearable
              weekStartsOn={userProfile?.start_of_the_week}
              variant="select-ghost-md"
              showTooltip
              tooltipHeading={t("common.order_by.start_date")}
            />
          </SidebarPropertyListItem>

          <SidebarPropertyListItem icon={DueDateOutline} label={t("common.order_by.due_date")}>
            <DateSelect
              testId="work-item-due-date-select"
              placeholder={t("issue.add.due_date")}
              value={maxDate ?? null}
              onChange={(val) =>
                issueOperations.update(workspaceSlug, projectId, issueId, {
                  target_date: val ? renderFormattedPayloadDate(val) : null,
                })
              }
              minDate={minDate ?? undefined}
              disabled={disabled}
              clearable
              className={cn({
                "text-danger-primary": shouldHighlightIssueDueDate(issue.target_date, stateDetails?.group),
              })}
              weekStartsOn={userProfile?.start_of_the_week}
              variant="select-ghost-md"
              showTooltip
              tooltipHeading={t("common.order_by.due_date")}
            />
          </SidebarPropertyListItem>

          {projectId && areEstimateEnabledByProjectId(projectId) && (
            <SidebarPropertyListItem icon={EstimateOutline} label={t("common.estimate")}>
              <EstimateSelect
                value={issue.estimate_point ?? undefined}
                onChange={(val: string | null) =>
                  issueOperations.update(workspaceSlug, projectId, issueId, { estimate_point: val })
                }
                projectId={projectId}
                disabled={disabled}
                variant="select-ghost-md"
                placeholder={t("common.none")}
                tooltip
              />
            </SidebarPropertyListItem>
          )}

          <SidebarPropertyListItem icon={ParentOutline} label={t("common.parent")}>
            <IssueParentSelectRoot
              className="h-7.5 w-full grow"
              workspaceSlug={workspaceSlug}
              projectId={projectId}
              issueId={issueId}
              issueOperations={issueOperations}
              disabled={disabled}
            />
          </SidebarPropertyListItem>

          <SidebarPropertyListItem icon={LabelsOutline} label={t("common.labels")}>
            <IssueLabel workspaceSlug={workspaceSlug} projectId={projectId} issueId={issueId} disabled={disabled} />
          </SidebarPropertyListItem>
        </div>
      </Collapsible>

      {hasStructure && (
        <div className="mt-2 border-t border-subtle-1 pt-3">
          <Collapsible
            open={isStructureOpen}
            onOpenChange={setIsStructureOpen}
            trigger={<span className="text-13 font-medium text-primary">{t("common.project_structure")}</span>}
          >
            <div className="mt-2 mb-3 space-y-2.5">
              {projectDetails?.module_view && (
                <SidebarPropertyListItem icon={ModuleOutline} label={t("common.modules")}>
                  <IssueModuleSelect
                    className="w-full grow"
                    workspaceSlug={workspaceSlug}
                    projectId={projectId}
                    issueId={issueId}
                    issueOperations={issueOperations}
                    disabled={disabled}
                  />
                </SidebarPropertyListItem>
              )}

              {projectDetails?.cycle_view && (
                <SidebarPropertyListItem icon={CyclesOutline} label={t("common.cycle")} appendElement={null}>
                  <IssueCycleSelect
                    className="h-7.5 w-full grow"
                    workspaceSlug={workspaceSlug}
                    projectId={projectId}
                    issueId={issueId}
                    issueOperations={issueOperations}
                    disabled={disabled}
                  />
                </SidebarPropertyListItem>
              )}

              {projectDetails?.release_view && (
                <SidebarPropertyListItem icon={ReleasesOutline} label={t("sidebar.releases")}>
                  <IssueReleaseSelect
                    className="w-full grow"
                    workspaceSlug={workspaceSlug}
                    projectId={projectId}
                    issueId={issueId}
                    issueOperations={issueOperations}
                    disabled={disabled}
                  />
                </SidebarPropertyListItem>
              )}
            </div>
          </Collapsible>
        </div>
      )}

      {showMeta && (
        <div className="mt-3 space-y-2 border-t border-subtle-1 pt-4 text-12 text-tertiary">
          {createdByDetails && (
            <div className="flex items-center gap-2">
              <UserOutline className="size-4 shrink-0" />
              <span className="truncate">
                {t("common.created_by")} {createdByDetails.display_name}
              </span>
            </div>
          )}
          <p>
            {t("common.created_on")} {renderFormattedDate(issue.created_at)}
          </p>
          <p>
            {t("common.updated_on")} {renderFormattedDate(issue.updated_at)}
          </p>
        </div>
      )}
    </div>
  );
});
