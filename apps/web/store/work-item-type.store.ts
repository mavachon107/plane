/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { set, sortBy, unset } from "lodash-es";
import { action, makeObservable, observable, runInAction } from "mobx";
import { computedFn } from "mobx-utils";
// types
import type { TWorkItemType } from "@plane/types";
// services
import { WorkItemTypeService } from "@/services/project";
// store
import type { CoreRootStore } from "./root.store";

export interface IWorkItemTypeStore {
  // loaders
  fetchedMap: Record<string, boolean>;
  // observables
  workItemTypeMap: Record<string, TWorkItemType>;
  // computed actions
  getProjectWorkItemTypes: (projectId: string | undefined | null) => TWorkItemType[] | undefined;
  getProjectWorkItemTypeIds: (projectId: string | undefined | null) => string[] | undefined;
  getWorkItemTypeById: (workItemTypeId: string | undefined | null) => TWorkItemType | null;
  getProjectDefaultWorkItemTypeId: (projectId: string | undefined | null) => string | undefined;
  // fetch actions
  fetchProjectWorkItemTypes: (workspaceSlug: string, projectId: string) => Promise<TWorkItemType[]>;
  // crud actions
  enableWorkItemTypes: (workspaceSlug: string, projectId: string) => Promise<TWorkItemType[]>;
  createWorkItemType: (
    workspaceSlug: string,
    projectId: string,
    data: Partial<TWorkItemType>
  ) => Promise<TWorkItemType>;
  updateWorkItemType: (
    workspaceSlug: string,
    projectId: string,
    workItemTypeId: string,
    data: Partial<TWorkItemType>
  ) => Promise<TWorkItemType>;
  deleteWorkItemType: (workspaceSlug: string, projectId: string, workItemTypeId: string) => Promise<void>;
  markWorkItemTypeAsDefault: (workspaceSlug: string, projectId: string, workItemTypeId: string) => Promise<void>;
}

export class WorkItemTypeStore implements IWorkItemTypeStore {
  // root store
  rootStore;
  // observables
  workItemTypeMap: Record<string, TWorkItemType> = {};
  // loaders -- keyed by project id, since types are fetched per project
  fetchedMap: Record<string, boolean> = {};
  // services
  workItemTypeService;

  constructor(_rootStore: CoreRootStore) {
    makeObservable(this, {
      workItemTypeMap: observable,
      fetchedMap: observable,
      // actions
      fetchProjectWorkItemTypes: action,
      enableWorkItemTypes: action,
      createWorkItemType: action,
      updateWorkItemType: action,
      deleteWorkItemType: action,
      markWorkItemTypeAsDefault: action,
    });

    this.rootStore = _rootStore;
    this.workItemTypeService = new WorkItemTypeService();
  }

  /**
   * Types linked to a project, in the order the settings page lists them.
   * Returns undefined until the project has been fetched, so callers can tell
   * "not loaded yet" apart from "none".
   */
  getProjectWorkItemTypes = computedFn((projectId: string | undefined | null) => {
    if (!projectId || !this.fetchedMap[projectId]) return;
    return sortBy(
      Object.values(this.workItemTypeMap).filter((workItemType) => workItemType.project_ids?.includes(projectId)),
      ["level", "name"]
    );
  });

  getProjectWorkItemTypeIds = computedFn((projectId: string | undefined | null) => {
    const workItemTypes = this.getProjectWorkItemTypes(projectId);
    if (!workItemTypes) return;
    return workItemTypes.map((workItemType) => workItemType.id);
  });

  getWorkItemTypeById = computedFn(
    (workItemTypeId: string | undefined | null): TWorkItemType | null =>
      (workItemTypeId ? this.workItemTypeMap?.[workItemTypeId] : null) || null
  );

  /**
   * The project's default type, which new work items fall back to. The server keeps
   * exactly one, so the first match is the answer.
   */
  getProjectDefaultWorkItemTypeId = computedFn((projectId: string | undefined | null) => {
    const workItemTypes = this.getProjectWorkItemTypes(projectId);
    return workItemTypes?.find((workItemType) => workItemType.is_default)?.id;
  });

  fetchProjectWorkItemTypes = async (workspaceSlug: string, projectId: string) =>
    await this.workItemTypeService.getProjectWorkItemTypes(workspaceSlug, projectId).then((response) => {
      runInAction(() => {
        response.forEach((workItemType) => {
          set(this.workItemTypeMap, [workItemType.id], workItemType);
        });
        set(this.fetchedMap, projectId, true);
      });
      return response;
    });

  /**
   * Enabling is a one-way latch on the server, so this is not undoable. The project
   * detail is refreshed too, because the settings page gates on is_issue_type_enabled.
   */
  enableWorkItemTypes = async (workspaceSlug: string, projectId: string) =>
    await this.workItemTypeService.enableWorkItemTypes(workspaceSlug, projectId).then((response) => {
      runInAction(() => {
        response.forEach((workItemType) => {
          set(this.workItemTypeMap, [workItemType.id], workItemType);
        });
        set(this.fetchedMap, projectId, true);
        const projectDetails = this.rootStore.projectRoot.project.projectMap?.[projectId];
        if (projectDetails) set(projectDetails, "is_issue_type_enabled", true);
      });
      return response;
    });

  createWorkItemType = async (workspaceSlug: string, projectId: string, data: Partial<TWorkItemType>) =>
    await this.workItemTypeService.createWorkItemType(workspaceSlug, projectId, data).then((response) => {
      runInAction(() => {
        set(this.workItemTypeMap, [response.id], response);
      });
      return response;
    });

  updateWorkItemType = async (
    workspaceSlug: string,
    projectId: string,
    workItemTypeId: string,
    data: Partial<TWorkItemType>
  ) => {
    const originalWorkItemType = this.workItemTypeMap[workItemTypeId];
    try {
      runInAction(() => {
        set(this.workItemTypeMap, [workItemTypeId], { ...originalWorkItemType, ...data });
      });
      return await this.workItemTypeService.patchWorkItemType(workspaceSlug, projectId, workItemTypeId, data);
    } catch (error) {
      runInAction(() => {
        set(this.workItemTypeMap, [workItemTypeId], originalWorkItemType);
      });
      throw error;
    }
  };

  deleteWorkItemType = async (workspaceSlug: string, projectId: string, workItemTypeId: string) => {
    const originalWorkItemType = this.workItemTypeMap[workItemTypeId];
    try {
      runInAction(() => {
        unset(this.workItemTypeMap, [workItemTypeId]);
      });
      await this.workItemTypeService.deleteWorkItemType(workspaceSlug, projectId, workItemTypeId);
    } catch (error) {
      // The server refuses to delete the default type or one still in use, so put it back
      runInAction(() => {
        set(this.workItemTypeMap, [workItemTypeId], originalWorkItemType);
      });
      throw error;
    }
  };

  /**
   * Moves the project default. The server does it in one statement, so the optimistic
   * update mirrors that: clear the old default and set the new one together.
   */
  markWorkItemTypeAsDefault = async (workspaceSlug: string, projectId: string, workItemTypeId: string) => {
    const originalWorkItemTypes = this.workItemTypeMap;
    const currentDefaultId = this.getProjectDefaultWorkItemTypeId(projectId);
    try {
      runInAction(() => {
        if (currentDefaultId) set(this.workItemTypeMap, [currentDefaultId, "is_default"], false);
        set(this.workItemTypeMap, [workItemTypeId, "is_default"], true);
      });
      await this.workItemTypeService.markWorkItemTypeAsDefault(workspaceSlug, projectId, workItemTypeId);
    } catch (error) {
      runInAction(() => {
        this.workItemTypeMap = originalWorkItemTypes;
      });
      throw error;
    }
  };
}
