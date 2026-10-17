/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

export type TReleaseStatus = "unreleased" | "released" | "cancelled";

export interface IReleaseTag {
  id: string;
  version: string;
  description: string;
  commit_hash: string | null;
  git_tag: string | null;
  project: string;
  workspace: string;
}

export interface IReleaseTagLite {
  id: string;
  version: string;
  commit_hash: string | null;
  git_tag: string | null;
}

export interface IReleaseLabel {
  id: string;
  name: string;
  color: string;
  sort_order: number;
  project: string;
  workspace: string;
}

export interface IReleaseLabelLite {
  id: string;
  name: string;
  color: string;
  sort_order: number;
}

export interface IRelease {
  id: string;
  name: string;
  description: object;
  description_html: string;

  status: TReleaseStatus;
  /** Surfaced in the UI as "Target date". */
  release_date: string | null;
  target_date: string | null;

  tag: string | null;
  tag_detail?: IReleaseTagLite | null;
  lead: string | null;
  label_ids?: string[];
  label_details?: IReleaseLabelLite[];

  is_prerelease: boolean;
  sort_order: number;
  work_item_count: number;
  completed_work_item_count: number;
  cancelled_work_item_count: number;

  external_source: string | null;
  external_id: string | null;

  project: string;
  workspace: string;
  created_at: string;
  updated_at: string;
  created_by?: string;
  updated_by?: string;
}

export interface IReleaseChangelog {
  id: string;
  release: string;
  project: string;
  workspace: string;
  description: object;
  description_html: string;
  description_stripped: string | null;
  created_at: string;
  updated_at: string;
}

/** Payload for `POST .../releases/<id>/work-items/`. */
export type TReleaseWorkItemPayload = {
  add_ids?: string[];
  remove_ids?: string[];
};

/** One entry of a release's activity feed. */
export type TReleaseActivity = {
  id: string;
  verb: "created" | "added_work_item";
  /** User id of whoever performed the action. */
  actor: string | null;
  created_at: string;
  work_item: {
    id: string;
    name: string;
    sequence_id: number;
    project_identifier: string;
  } | null;
};
