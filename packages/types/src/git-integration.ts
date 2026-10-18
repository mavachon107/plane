/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

export type TGitReferenceKind = "branch" | "pull_request";

export type TGitReferenceState = "active" | "deleted" | "open" | "draft" | "merged" | "closed";

export type TGitReference = {
  id: string;
  issue: string;
  kind: TGitReferenceKind;
  external_id: string;
  url: string;
  title: string;
  state: TGitReferenceState;
  source_branch: string;
  target_branch: string;
  author_login: string;
  author_avatar_url: string;
  merged_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type TGitTransitionEvent = "branch_created" | "pr_opened" | "pr_merged";

export type TGitRepository = {
  id: string;
  project: string;
  provider: "github";
  owner: string;
  name: string;
  url: string;
  is_active: boolean;
  close_on_merge: boolean;
  state_mapping: Partial<Record<TGitTransitionEvent, string>>;
  created_at: string;
  updated_at: string;
};

/** Returned once, when the repository is connected. The secret cannot be retrieved afterwards. */
export type TGitRepositoryCreated = TGitRepository & {
  webhook_secret: string;
  webhook_path: string;
};

export type TGitRepositoryCreatePayload = Pick<TGitRepository, "owner" | "name"> &
  Partial<Pick<TGitRepository, "close_on_merge" | "state_mapping">>;
