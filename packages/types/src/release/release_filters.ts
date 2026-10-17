/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TReleaseStatus } from "./releases";

export type TReleaseOrderByOptions =
  | "name"
  | "-name"
  | "progress"
  | "-progress"
  | "work_items_length"
  | "-work_items_length"
  | "target_date"
  | "-target_date"
  | "created_at"
  | "-created_at"
  | "sort_order";

export type TReleaseDisplayFilters = {
  order_by?: TReleaseOrderByOptions;
};

export type TReleaseFilters = {
  status?: TReleaseStatus[];
  lead?: string[];
  labels?: string[];
  tag?: string[];
  target_date?: string[];
};

export type TReleaseStoredFilters = {
  display_filters?: TReleaseDisplayFilters;
  filters?: TReleaseFilters;
};
