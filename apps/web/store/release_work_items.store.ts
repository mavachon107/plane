/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { set } from "lodash-es";
import { action, observable, makeObservable, runInAction } from "mobx";
import { computedFn } from "mobx-utils";
// types
import { STATE_GROUPS } from "@plane/constants";
import type { TIssue, TStateGroups } from "@plane/types";
// services
import { ReleaseService } from "@/services/release.service";
// store
import type { CoreRootStore } from "./root.store";

export type TGroupedWorkItems = Partial<Record<TStateGroups, string[]>>;

export interface IReleaseWorkItemsStore {
  // observables
  workItemMap: Record<string, TIssue>;
  workItemIdsByRelease: Record<string, string[]>;
  loader: Record<string, boolean>;
  // computed functions
  getWorkItemIds: (releaseId: string) => string[];
  getWorkItemById: (workItemId: string) => TIssue | undefined;
  getGroupedWorkItems: (releaseId: string) => TGroupedWorkItems;
  // actions
  fetchWorkItems: (workspaceSlug: string, projectId: string, releaseId: string) => Promise<TIssue[]>;
  addWorkItems: (workspaceSlug: string, projectId: string, releaseId: string, workItemIds: string[]) => Promise<void>;
  removeWorkItems: (
    workspaceSlug: string,
    projectId: string,
    releaseId: string,
    workItemIds: string[]
  ) => Promise<void>;
}

export class ReleaseWorkItemsStore implements IReleaseWorkItemsStore {
  // observables
  workItemMap: Record<string, TIssue> = {};
  workItemIdsByRelease: Record<string, string[]> = {};
  loader: Record<string, boolean> = {};
  // root store
  rootStore: CoreRootStore;
  // services
  releaseService;

  constructor(_rootStore: CoreRootStore) {
    makeObservable(this, {
      workItemMap: observable,
      workItemIdsByRelease: observable,
      loader: observable,
      fetchWorkItems: action,
      addWorkItems: action,
      removeWorkItems: action,
    });

    this.rootStore = _rootStore;
    this.releaseService = new ReleaseService();
  }

  getWorkItemIds = computedFn((releaseId: string) => this.workItemIdsByRelease[releaseId] ?? []);

  getWorkItemById = computedFn((workItemId: string) => this.workItemMap[workItemId] ?? undefined);

  /**
   * Buckets a release's work items into the five state groups.
   *
   * The list endpoint does not annotate `state__group` (the backend only adds it when
   * asked to group by state), so the group is resolved from the state store instead --
   * the same fallback the shared issue store uses.
   */
  getGroupedWorkItems = computedFn((releaseId: string): TGroupedWorkItems => {
    const grouped: TGroupedWorkItems = {};
    for (const group of Object.keys(STATE_GROUPS) as TStateGroups[]) grouped[group] = [];

    for (const workItemId of this.getWorkItemIds(releaseId)) {
      const workItem = this.workItemMap[workItemId];
      if (!workItem) continue;
      const group = this.rootStore.state.getStateById(workItem.state_id)?.group;
      if (group && grouped[group]) grouped[group]?.push(workItemId);
    }

    return grouped;
  });

  fetchWorkItems = async (workspaceSlug: string, projectId: string, releaseId: string) => {
    try {
      runInAction(() => set(this.loader, [releaseId], true));
      const response = await this.releaseService.getWorkItems(workspaceSlug, projectId, releaseId);
      const workItems = (response?.results ?? []) as unknown as TIssue[];
      runInAction(() => {
        workItems.forEach((workItem) => set(this.workItemMap, [workItem.id], workItem));
        set(
          this.workItemIdsByRelease,
          [releaseId],
          workItems.map((workItem) => workItem.id)
        );
        set(this.loader, [releaseId], false);
      });
      return workItems;
    } catch (error) {
      runInAction(() => set(this.loader, [releaseId], false));
      throw error;
    }
  };

  addWorkItems = async (workspaceSlug: string, projectId: string, releaseId: string, workItemIds: string[]) => {
    await this.releaseService.manageWorkItems(workspaceSlug, projectId, releaseId, { add_ids: workItemIds });
    // The endpoint returns no body, so re-read to pick up the added items.
    await this.fetchWorkItems(workspaceSlug, projectId, releaseId);
  };

  removeWorkItems = async (workspaceSlug: string, projectId: string, releaseId: string, workItemIds: string[]) => {
    const previous = this.getWorkItemIds(releaseId);
    try {
      runInAction(() => {
        set(
          this.workItemIdsByRelease,
          [releaseId],
          previous.filter((id) => !workItemIds.includes(id))
        );
      });
      await this.releaseService.manageWorkItems(workspaceSlug, projectId, releaseId, { remove_ids: workItemIds });
    } catch (error) {
      runInAction(() => set(this.workItemIdsByRelease, [releaseId], previous));
      throw error;
    }
  };
}
