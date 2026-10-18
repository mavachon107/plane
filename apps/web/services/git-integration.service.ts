/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { API_BASE_URL } from "@plane/constants";
import type { TGitReference, TGitRepository, TGitRepositoryCreatePayload, TGitRepositoryCreated } from "@plane/types";
import { APIService } from "@/services/api.service";

export class GitIntegrationService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async getRepository(workspaceSlug: string, projectId: string): Promise<TGitRepository | null> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/git-repository/`)
      .then((response) => response?.data ?? null)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async connectRepository(
    workspaceSlug: string,
    projectId: string,
    data: TGitRepositoryCreatePayload
  ): Promise<TGitRepositoryCreated> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/git-repository/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async updateRepository(
    workspaceSlug: string,
    projectId: string,
    data: Partial<Pick<TGitRepository, "close_on_merge" | "state_mapping" | "is_active">>
  ): Promise<TGitRepository> {
    return this.patch(`/api/workspaces/${workspaceSlug}/projects/${projectId}/git-repository/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async disconnectRepository(workspaceSlug: string, projectId: string): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/projects/${projectId}/git-repository/`)
      .then(() => undefined)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getReferences(workspaceSlug: string, projectId: string, issueId: string): Promise<TGitReference[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/git-references/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async linkReference(workspaceSlug: string, projectId: string, issueId: string, url: string): Promise<TGitReference> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/git-references/`, {
      url,
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async removeReference(workspaceSlug: string, projectId: string, issueId: string, referenceId: string): Promise<void> {
    return this.delete(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/git-references/${referenceId}/`
    )
      .then(() => undefined)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
