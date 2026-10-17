/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// types
import { API_BASE_URL } from "@plane/constants";
import type {
  IRelease,
  IReleaseChangelog,
  IReleaseLabel,
  IReleaseTag,
  TIssue,
  TPaginatedResponse,
  TReleaseActivity,
  TReleaseWorkItemPayload,
} from "@plane/types";
// services
import { APIService } from "@/services/api.service";

export class ReleaseService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  private basePath(workspaceSlug: string, projectId: string): string {
    return `/api/workspaces/${workspaceSlug}/projects/${projectId}`;
  }

  // ------------------------------------------------------------------ releases

  /**
   * The list endpoint is paginated; releases per project are few enough that we take
   * the first page. Switch to cursor paging here if a project ever outgrows it.
   */
  async getReleases(workspaceSlug: string, projectId: string): Promise<IRelease[]> {
    return this.get(`${this.basePath(workspaceSlug, projectId)}/releases/`)
      .then((response) => response?.data?.results ?? [])
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getReleaseDetails(workspaceSlug: string, projectId: string, releaseId: string): Promise<IRelease> {
    return this.get(`${this.basePath(workspaceSlug, projectId)}/releases/${releaseId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async createRelease(workspaceSlug: string, projectId: string, data: Partial<IRelease>): Promise<IRelease> {
    return this.post(`${this.basePath(workspaceSlug, projectId)}/releases/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async patchRelease(
    workspaceSlug: string,
    projectId: string,
    releaseId: string,
    data: Partial<IRelease>
  ): Promise<IRelease> {
    return this.patch(`${this.basePath(workspaceSlug, projectId)}/releases/${releaseId}/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deleteRelease(workspaceSlug: string, projectId: string, releaseId: string): Promise<void> {
    return this.delete(`${this.basePath(workspaceSlug, projectId)}/releases/${releaseId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  // ----------------------------------------------------------------- changelog

  async getChangelog(workspaceSlug: string, projectId: string, releaseId: string): Promise<IReleaseChangelog> {
    return this.get(`${this.basePath(workspaceSlug, projectId)}/releases/${releaseId}/changelog/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async updateChangelog(
    workspaceSlug: string,
    projectId: string,
    releaseId: string,
    data: Partial<IReleaseChangelog>
  ): Promise<IReleaseChangelog> {
    return this.patch(`${this.basePath(workspaceSlug, projectId)}/releases/${releaseId}/changelog/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  // ------------------------------------------------------------------ activity

  async getActivity(workspaceSlug: string, projectId: string, releaseId: string): Promise<TReleaseActivity[]> {
    return this.get(`${this.basePath(workspaceSlug, projectId)}/releases/${releaseId}/activity/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  // ---------------------------------------------------------------- work items

  async getWorkItems(
    workspaceSlug: string,
    projectId: string,
    releaseId: string
  ): Promise<TPaginatedResponse<TIssue[]>> {
    return this.get(`${this.basePath(workspaceSlug, projectId)}/releases/${releaseId}/work-items/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** One request for both directions, unlike modules which fire a DELETE per issue. */
  async manageWorkItems(
    workspaceSlug: string,
    projectId: string,
    releaseId: string,
    data: TReleaseWorkItemPayload
  ): Promise<void> {
    return this.post(`${this.basePath(workspaceSlug, projectId)}/releases/${releaseId}/work-items/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  // -------------------------------------------------------------------- labels

  async getLabels(workspaceSlug: string, projectId: string, releaseId?: string): Promise<IReleaseLabel[]> {
    return this.get(`${this.basePath(workspaceSlug, projectId)}/release-labels/`, {
      params: releaseId ? { release_id: releaseId } : {},
    })
      .then((response) => response?.data?.results ?? [])
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async createLabel(workspaceSlug: string, projectId: string, data: Partial<IReleaseLabel>): Promise<IReleaseLabel> {
    return this.post(`${this.basePath(workspaceSlug, projectId)}/release-labels/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async attachLabels(workspaceSlug: string, projectId: string, releaseId: string, labelIds: string[]): Promise<void> {
    return this.post(`${this.basePath(workspaceSlug, projectId)}/releases/${releaseId}/labels/`, {
      label_ids: labelIds,
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async detachLabels(workspaceSlug: string, projectId: string, releaseId: string, labelIds: string[]): Promise<void> {
    // APIService.delete passes its second argument straight through as the request body.
    return this.delete(`${this.basePath(workspaceSlug, projectId)}/releases/${releaseId}/labels/`, {
      label_ids: labelIds,
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  // ---------------------------------------------------------------------- tags

  async getTags(workspaceSlug: string, projectId: string): Promise<IReleaseTag[]> {
    return this.get(`${this.basePath(workspaceSlug, projectId)}/release-tags/`)
      .then((response) => response?.data?.results ?? [])
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async createTag(workspaceSlug: string, projectId: string, data: Partial<IReleaseTag>): Promise<IReleaseTag> {
    return this.post(`${this.basePath(workspaceSlug, projectId)}/release-tags/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
