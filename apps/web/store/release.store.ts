/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { set, sortBy } from "lodash-es";
import { action, computed, observable, makeObservable, runInAction } from "mobx";
import { computedFn } from "mobx-utils";
// types
import type { IRelease, IReleaseChangelog, IReleaseLabel, IReleaseTag, TReleaseStatus } from "@plane/types";
import { orderReleases, shouldFilterRelease } from "@plane/utils";
// services
import { ReleaseService } from "@/services/release.service";
// store
import type { CoreRootStore } from "./root.store";

export interface IReleaseStore {
  // loaders
  loader: boolean;
  fetchedMap: Record<string, boolean>;
  // observables
  releaseMap: Record<string, IRelease>;
  labelMap: Record<string, IReleaseLabel>;
  tagMap: Record<string, IReleaseTag>;
  changelogMap: Record<string, IReleaseChangelog>;
  // computed
  projectReleaseIds: string[] | null;
  // computed functions
  getReleaseById: (releaseId: string) => IRelease | undefined;
  getReleaseNameById: (releaseId: string) => string | undefined;
  getChangelogByReleaseId: (releaseId: string) => IReleaseChangelog | undefined;
  getFilteredReleaseIds: (projectId: string) => string[] | null;
  getReleaseIdsByStatus: (projectId: string, status: TReleaseStatus) => string[] | null;
  getProjectLabels: (projectId: string) => IReleaseLabel[];
  getProjectTags: (projectId: string) => IReleaseTag[];
  // fetch actions
  fetchReleases: (workspaceSlug: string, projectId: string) => Promise<IRelease[] | undefined>;
  fetchReleaseDetails: (workspaceSlug: string, projectId: string, releaseId: string) => Promise<IRelease>;
  fetchChangelog: (workspaceSlug: string, projectId: string, releaseId: string) => Promise<IReleaseChangelog>;
  fetchLabels: (workspaceSlug: string, projectId: string) => Promise<IReleaseLabel[]>;
  fetchTags: (workspaceSlug: string, projectId: string) => Promise<IReleaseTag[]>;
  // crud actions
  createRelease: (workspaceSlug: string, projectId: string, data: Partial<IRelease>) => Promise<IRelease>;
  updateReleaseDetails: (
    workspaceSlug: string,
    projectId: string,
    releaseId: string,
    data: Partial<IRelease>
  ) => Promise<IRelease>;
  deleteRelease: (workspaceSlug: string, projectId: string, releaseId: string) => Promise<void>;
  updateChangelog: (
    workspaceSlug: string,
    projectId: string,
    releaseId: string,
    data: Partial<IReleaseChangelog>
  ) => Promise<IReleaseChangelog>;
  createLabel: (workspaceSlug: string, projectId: string, data: Partial<IReleaseLabel>) => Promise<IReleaseLabel>;
  createTag: (workspaceSlug: string, projectId: string, data: Partial<IReleaseTag>) => Promise<IReleaseTag>;
  attachLabels: (workspaceSlug: string, projectId: string, releaseId: string, labelIds: string[]) => Promise<void>;
  detachLabels: (workspaceSlug: string, projectId: string, releaseId: string, labelIds: string[]) => Promise<void>;
}

export class ReleaseStore implements IReleaseStore {
  // observables
  loader: boolean = false;
  releaseMap: Record<string, IRelease> = {};
  labelMap: Record<string, IReleaseLabel> = {};
  tagMap: Record<string, IReleaseTag> = {};
  changelogMap: Record<string, IReleaseChangelog> = {};
  fetchedMap: Record<string, boolean> = {};
  // root store
  rootStore: CoreRootStore;
  // services
  releaseService;

  constructor(_rootStore: CoreRootStore) {
    makeObservable(this, {
      // observables
      loader: observable.ref,
      releaseMap: observable,
      labelMap: observable,
      tagMap: observable,
      changelogMap: observable,
      fetchedMap: observable,
      // computed
      projectReleaseIds: computed,
      // actions
      fetchReleases: action,
      fetchReleaseDetails: action,
      fetchChangelog: action,
      fetchLabels: action,
      fetchTags: action,
      createRelease: action,
      updateReleaseDetails: action,
      deleteRelease: action,
      updateChangelog: action,
      createLabel: action,
      createTag: action,
      attachLabels: action,
      detachLabels: action,
    });

    this.rootStore = _rootStore;
    this.releaseService = new ReleaseService();
  }

  // ------------------------------------------------------------------ computed

  /** All release ids for the project in the current route. */
  get projectReleaseIds() {
    const projectId = this.rootStore.router.projectId;
    if (!projectId || !this.fetchedMap[projectId]) return null;
    const releases = sortBy(
      Object.values(this.releaseMap).filter((r) => r.project === projectId),
      [(r) => r.sort_order]
    );
    return releases.map((r) => r.id);
  }

  getReleaseById = computedFn((releaseId: string) => this.releaseMap[releaseId] ?? undefined);

  getReleaseNameById = computedFn((releaseId: string) => this.releaseMap[releaseId]?.name);

  getChangelogByReleaseId = computedFn((releaseId: string) => this.changelogMap[releaseId] ?? undefined);

  getProjectLabels = computedFn((projectId: string) =>
    sortBy(
      Object.values(this.labelMap).filter((l) => l.project === projectId),
      [(l) => l.sort_order]
    )
  );

  getProjectTags = computedFn((projectId: string) => Object.values(this.tagMap).filter((t) => t.project === projectId));

  /**
   * Release ids for a project after search, filters and ordering.
   * Returns null while the project has not been fetched, which the UI reads as "loading".
   */
  getFilteredReleaseIds = computedFn((projectId: string) => {
    const displayFilters = this.rootStore.releaseFilter.getDisplayFiltersByProjectId(projectId);
    const filters = this.rootStore.releaseFilter.getFiltersByProjectId(projectId);
    const searchQuery = this.rootStore.releaseFilter.searchQuery;
    if (!this.fetchedMap[projectId]) return null;

    let releases = Object.values(this.releaseMap ?? {}).filter(
      (r) =>
        r.project === projectId &&
        r.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
        shouldFilterRelease(r, displayFilters ?? {}, filters ?? {})
    );
    releases = orderReleases(releases, displayFilters?.order_by ?? "sort_order");
    return releases.map((r) => r.id);
  });

  /** The filtered list narrowed to one status tab. */
  getReleaseIdsByStatus = computedFn((projectId: string, status: TReleaseStatus) => {
    const releaseIds = this.getFilteredReleaseIds(projectId);
    if (!releaseIds) return null;
    return releaseIds.filter((id) => this.releaseMap[id]?.status === status);
  });

  // --------------------------------------------------------------------- fetch

  fetchReleases = async (workspaceSlug: string, projectId: string) => {
    try {
      this.loader = true;
      const response = await this.releaseService.getReleases(workspaceSlug, projectId);
      runInAction(() => {
        response.forEach((release) => {
          set(this.releaseMap, [release.id], { ...this.releaseMap[release.id], ...release });
        });
        set(this.fetchedMap, projectId, true);
        this.loader = false;
      });
      return response;
    } catch {
      this.loader = false;
      return undefined;
    }
  };

  fetchReleaseDetails = async (workspaceSlug: string, projectId: string, releaseId: string) => {
    const response = await this.releaseService.getReleaseDetails(workspaceSlug, projectId, releaseId);
    runInAction(() => {
      set(this.releaseMap, [releaseId], response);
    });
    return response;
  };

  fetchChangelog = async (workspaceSlug: string, projectId: string, releaseId: string) => {
    const response = await this.releaseService.getChangelog(workspaceSlug, projectId, releaseId);
    runInAction(() => {
      set(this.changelogMap, [releaseId], response);
    });
    return response;
  };

  fetchLabels = async (workspaceSlug: string, projectId: string) => {
    const response = await this.releaseService.getLabels(workspaceSlug, projectId);
    runInAction(() => {
      response.forEach((label) => set(this.labelMap, [label.id], label));
    });
    return response;
  };

  fetchTags = async (workspaceSlug: string, projectId: string) => {
    const response = await this.releaseService.getTags(workspaceSlug, projectId);
    runInAction(() => {
      response.forEach((tag) => set(this.tagMap, [tag.id], tag));
    });
    return response;
  };

  // ---------------------------------------------------------------------- crud

  createRelease = async (workspaceSlug: string, projectId: string, data: Partial<IRelease>) => {
    const response = await this.releaseService.createRelease(workspaceSlug, projectId, data);
    runInAction(() => {
      set(this.releaseMap, [response.id], response);
    });
    return response;
  };

  /** Optimistic, with an explicit rollback so a failed PATCH cannot leave stale UI. */
  updateReleaseDetails = async (
    workspaceSlug: string,
    projectId: string,
    releaseId: string,
    data: Partial<IRelease>
  ) => {
    const originalRelease = this.getReleaseById(releaseId);
    try {
      runInAction(() => {
        set(this.releaseMap, [releaseId], { ...originalRelease, ...data });
      });
      const response = await this.releaseService.patchRelease(workspaceSlug, projectId, releaseId, data);
      runInAction(() => {
        set(this.releaseMap, [releaseId], response);
      });
      return response;
    } catch (error) {
      console.error("Failed to update release in release store", error);
      runInAction(() => {
        set(this.releaseMap, [releaseId], { ...originalRelease });
      });
      throw error;
    }
  };

  deleteRelease = async (workspaceSlug: string, projectId: string, releaseId: string) => {
    await this.releaseService.deleteRelease(workspaceSlug, projectId, releaseId);
    runInAction(() => {
      delete this.releaseMap[releaseId];
      delete this.changelogMap[releaseId];
    });
  };

  updateChangelog = async (
    workspaceSlug: string,
    projectId: string,
    releaseId: string,
    data: Partial<IReleaseChangelog>
  ) => {
    const response = await this.releaseService.updateChangelog(workspaceSlug, projectId, releaseId, data);
    runInAction(() => {
      set(this.changelogMap, [releaseId], response);
    });
    return response;
  };

  createLabel = async (workspaceSlug: string, projectId: string, data: Partial<IReleaseLabel>) => {
    const response = await this.releaseService.createLabel(workspaceSlug, projectId, data);
    runInAction(() => {
      set(this.labelMap, [response.id], response);
    });
    return response;
  };

  createTag = async (workspaceSlug: string, projectId: string, data: Partial<IReleaseTag>) => {
    const response = await this.releaseService.createTag(workspaceSlug, projectId, data);
    runInAction(() => {
      set(this.tagMap, [response.id], response);
    });
    return response;
  };

  attachLabels = async (workspaceSlug: string, projectId: string, releaseId: string, labelIds: string[]) => {
    await this.releaseService.attachLabels(workspaceSlug, projectId, releaseId, labelIds);
    // The attach endpoint returns no body, so re-read to pick up label_details.
    await this.fetchReleaseDetails(workspaceSlug, projectId, releaseId);
  };

  detachLabels = async (workspaceSlug: string, projectId: string, releaseId: string, labelIds: string[]) => {
    await this.releaseService.detachLabels(workspaceSlug, projectId, releaseId, labelIds);
    await this.fetchReleaseDetails(workspaceSlug, projectId, releaseId);
  };
}
