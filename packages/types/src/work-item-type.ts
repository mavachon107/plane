/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TLogoProps } from "./common";

export type TWorkItemType = {
  readonly id: string;
  name: string;
  description: string;
  logo_props: TLogoProps;
  is_active: boolean;
  /**
   * Whether this is the default type for the *project*. It is read-only on the wire:
   * the server stores it on the project link row, and it only moves through
   * `markWorkItemTypeAsDefault`, so there can never be zero or two defaults.
   */
  readonly is_default: boolean;
  level: number;
  readonly workspace_id: string;
  /** Every project this type is linked to; types themselves are workspace-scoped. */
  readonly project_ids: string[];
  readonly created_at?: string;
  readonly updated_at?: string;
  readonly created_by?: string;
  readonly updated_by?: string;
};

export type TWorkItemTypeOperationsCallbacks = {
  createWorkItemType: (data: Partial<TWorkItemType>) => Promise<TWorkItemType>;
  updateWorkItemType: (workItemTypeId: string, data: Partial<TWorkItemType>) => Promise<TWorkItemType | undefined>;
  deleteWorkItemType: (workItemTypeId: string) => Promise<void>;
  markWorkItemTypeAsDefault: (workItemTypeId: string) => Promise<void>;
};

/**
 * Error codes the delete endpoint returns. They match the i18n key names under
 * `work_item_types.settings.item_delete_confirmation.errors.*`, so the UI can render
 * the matching message directly.
 */
export type TWorkItemTypeDeleteError =
  | "cannot_delete_default_work_item_type"
  | "cannot_delete_work_item_type_with_associated_work_items";
