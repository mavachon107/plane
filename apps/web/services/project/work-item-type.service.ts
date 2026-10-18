/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { API_BASE_URL } from "@plane/constants";
import type { TWorkItemType } from "@plane/types";
// services
import { APIService } from "@/services/api.service";

export class WorkItemTypeService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  private basePath(workspaceSlug: string, projectId: string) {
    return `/api/workspaces/${workspaceSlug}/projects/${projectId}/work-item-types/`;
  }

  async getProjectWorkItemTypes(workspaceSlug: string, projectId: string): Promise<TWorkItemType[]> {
    return this.get(this.basePath(workspaceSlug, projectId))
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /**
   * Turns work item types on for a project and seeds the starter set. Irreversible by
   * design, so the caller is expected to confirm first. Returns the seeded types.
   */
  async enableWorkItemTypes(workspaceSlug: string, projectId: string): Promise<TWorkItemType[]> {
    return this.post(`${this.basePath(workspaceSlug, projectId)}enable/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async createWorkItemType(
    workspaceSlug: string,
    projectId: string,
    data: Partial<TWorkItemType>
  ): Promise<TWorkItemType> {
    return this.post(this.basePath(workspaceSlug, projectId), data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async patchWorkItemType(
    workspaceSlug: string,
    projectId: string,
    workItemTypeId: string,
    data: Partial<TWorkItemType>
  ): Promise<TWorkItemType> {
    return this.patch(`${this.basePath(workspaceSlug, projectId)}${workItemTypeId}/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deleteWorkItemType(workspaceSlug: string, projectId: string, workItemTypeId: string): Promise<void> {
    return this.delete(`${this.basePath(workspaceSlug, projectId)}${workItemTypeId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async markWorkItemTypeAsDefault(workspaceSlug: string, projectId: string, workItemTypeId: string): Promise<void> {
    return this.post(`${this.basePath(workspaceSlug, projectId)}${workItemTypeId}/mark-default/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
