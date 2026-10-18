/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React, { useCallback, useState } from "react";
import { observer } from "mobx-react";
// plane imports
import type { ISearchIssueResponse, TIssue } from "@plane/types";
// components
import { IssueModalContext } from "@/components/issues/issue-modal/context";
import type { THandleProjectEntitiesFetchProps } from "@/components/issues/issue-modal/context/issue-modal-context";
// hooks
import { useProject } from "@/hooks/store/use-project";
import { useUser } from "@/hooks/store/user/user-user";
import { useWorkItemType } from "@/hooks/store/use-work-item-type";

export type TIssueModalProviderProps = {
  templateId?: string;
  dataForPreload?: Partial<TIssue>;
  allowedProjectIds?: string[];
  children: React.ReactNode;
};

export const IssueModalProvider = observer(function IssueModalProvider(props: TIssueModalProviderProps) {
  const { children, allowedProjectIds } = props;
  // states
  const [selectedParentIssue, setSelectedParentIssue] = useState<ISearchIssueResponse | null>(null);
  // store hooks
  const { projectsWithCreatePermissions } = useUser();
  const { getProjectById } = useProject();
  const { getProjectDefaultWorkItemTypeId, fetchProjectWorkItemTypes } = useWorkItemType();
  // derived values
  const projectIdsWithCreatePermissions = Object.keys(projectsWithCreatePermissions ?? {});

  /** Pre-selects the project's default type, so a new work item is typed without extra clicks. */
  const getIssueTypeIdOnProjectChange = useCallback(
    (projectId: string) => getProjectDefaultWorkItemTypeId(projectId) ?? null,
    [getProjectDefaultWorkItemTypeId]
  );

  /**
   * Loads the newly selected project's types, so the type select and the default lookup
   * above have something to work with. Only the types are fetched here -- per-type custom
   * properties have no backing models in this edition.
   */
  const handleProjectEntitiesFetch = useCallback(
    async ({ workItemProjectId, workspaceSlug }: THandleProjectEntitiesFetchProps) => {
      if (!workItemProjectId || !workspaceSlug) return;
      if (!getProjectById(workItemProjectId)?.is_issue_type_enabled) return;

      try {
        await fetchProjectWorkItemTypes(workspaceSlug, workItemProjectId);
      } catch {
        // A failed fetch just leaves the type select empty; the work item can still be created
      }
    },
    [fetchProjectWorkItemTypes, getProjectById]
  );

  return (
    <IssueModalContext.Provider
      // oxlint-disable-next-line react/jsx-no-constructed-context-values
      value={{
        allowedProjectIds: allowedProjectIds ?? projectIdsWithCreatePermissions,
        workItemTemplateId: null,
        setWorkItemTemplateId: () => {},
        isApplyingTemplate: false,
        setIsApplyingTemplate: () => {},
        selectedParentIssue,
        setSelectedParentIssue,
        issuePropertyValues: {},
        setIssuePropertyValues: () => {},
        issuePropertyValueErrors: {},
        setIssuePropertyValueErrors: () => {},
        getIssueTypeIdOnProjectChange,
        getActiveAdditionalPropertiesLength: () => 0,
        handlePropertyValuesValidation: () => true,
        handleCreateUpdatePropertyValues: () => Promise.resolve(),
        handleProjectEntitiesFetch,
        handleTemplateChange: () => Promise.resolve(),
        handleConvert: () => Promise.resolve(),
        handleCreateSubWorkItem: () => Promise.resolve(),
      }}
    >
      {children}
    </IssueModalContext.Provider>
  );
});
