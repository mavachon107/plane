/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo } from "react";
import { observer } from "mobx-react";
import { Tab, Tabs, TabsList } from "@makeplane/propel/components/tabs";
// plane package imports
import type { TActivityFilters } from "@plane/constants";
import { E_SORT_ORDER, EActivityFilterType } from "@plane/constants";
import { useLocalStorage } from "@plane/hooks";
// i18n
import { useTranslation } from "@plane/i18n";
//types
import type { TFileSignedURLResponse, TIssueComment } from "@plane/types";
// components
import { CommentCreate } from "@/components/comments/comment-create";
// hooks
import { useProject } from "@/hooks/store/use-project";
// local imports
import { IssueActivityCommentRoot } from "./activity-comment-root";
import { useWorkItemCommentOperations } from "./helper";
import { ActivitySortRoot } from "./sort-root";

type TActivityTab = "all" | "activity" | "comments" | "updates" | "transition" | "history";

const ACTIVITY_TABS: { value: TActivityTab; i18nKey: string; filters: TActivityFilters[] | null }[] = [
  { value: "all", i18nKey: "common.all", filters: null },
  {
    value: "activity",
    i18nKey: "common.activity",
    filters: [
      EActivityFilterType.ACTIVITY,
      EActivityFilterType.STATE,
      EActivityFilterType.ASSIGNEE,
      EActivityFilterType.DEFAULT,
    ],
  },
  { value: "comments", i18nKey: "common.comments", filters: [EActivityFilterType.COMMENT] },
  { value: "updates", i18nKey: "common.updates", filters: [EActivityFilterType.ACTIVITY] },
  { value: "transition", i18nKey: "transition", filters: [EActivityFilterType.STATE] },
  {
    value: "history",
    i18nKey: "history",
    filters: [EActivityFilterType.ASSIGNEE, EActivityFilterType.DEFAULT],
  },
];

type TIssueActivity = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  disabled?: boolean;
  isIntakeIssue?: boolean;
};

export type TActivityOperations = {
  createComment: (data: Partial<TIssueComment>) => Promise<TIssueComment>;
  updateComment: (commentId: string, data: Partial<TIssueComment>) => Promise<void>;
  removeComment: (commentId: string) => Promise<void>;
  uploadCommentAsset: (blockId: string, file: File, commentId?: string) => Promise<TFileSignedURLResponse>;
};

export const IssueActivity = observer(function IssueActivity(props: TIssueActivity) {
  const { workspaceSlug, projectId, issueId, disabled = false, isIntakeIssue = false } = props;
  // i18n
  const { t } = useTranslation();
  // hooks
  const { setValue: setActiveTab, storedValue: storedTab } = useLocalStorage<TActivityTab>("issue_activity_tab", "all");
  const { setValue: setSortOrder, storedValue: sortOrder } = useLocalStorage("activity_sort_order", E_SORT_ORDER.ASC);

  const { getProjectById } = useProject();

  const toggleSortOrder = () => {
    setSortOrder(sortOrder === E_SORT_ORDER.ASC ? E_SORT_ORDER.DESC : E_SORT_ORDER.ASC);
  };

  // helper hooks
  const activityOperations = useWorkItemCommentOperations(workspaceSlug, projectId, issueId);

  const project = getProjectById(projectId);
  const activeTab = ACTIVITY_TABS.find((tab) => tab.value === storedTab) ?? ACTIVITY_TABS[0];
  // comments can only be written / read from the tabs that include them
  const showCommentBox = !disabled && (activeTab.value === "all" || activeTab.value === "comments");
  const renderCommentCreationBox = useMemo(
    () => (
      <CommentCreate
        workspaceSlug={workspaceSlug}
        entityId={issueId}
        activityOperations={activityOperations}
        showToolbarInitially
        projectId={projectId}
      />
    ),
    [workspaceSlug, issueId, activityOperations, projectId]
  );
  if (!project) return <></>;

  return (
    <div className="space-y-4">
      {/* header */}
      <div className="flex items-center justify-between gap-2 border-b border-subtle-1">
        <Tabs
          variant="underline"
          value={activeTab.value}
          onValueChange={(value) => setActiveTab(value as TActivityTab)}
        >
          <TabsList>
            {ACTIVITY_TABS.map((tab) => (
              <Tab key={tab.value} value={tab.value} label={t(tab.i18nKey)} />
            ))}
          </TabsList>
        </Tabs>
        <ActivitySortRoot sortOrder={sortOrder || E_SORT_ORDER.ASC} toggleSort={toggleSortOrder} />
      </div>

      {/* rendering activity */}
      <div className="space-y-3">
        <div className="min-h-[200px]">
          <div className="space-y-3">
            {showCommentBox && sortOrder === E_SORT_ORDER.DESC && renderCommentCreationBox}
            <IssueActivityCommentRoot
              projectId={projectId}
              workspaceSlug={workspaceSlug}
              isIntakeIssue={isIntakeIssue}
              issueId={issueId}
              selectedFilters={activeTab.filters}
              activityOperations={activityOperations}
              showAccessSpecifier={!!project.anchor}
              disabled={disabled}
              sortOrder={sortOrder || E_SORT_ORDER.ASC}
            />
            {showCommentBox && sortOrder === E_SORT_ORDER.ASC && renderCommentCreationBox}
          </div>
        </div>
      </div>
    </div>
  );
});
