/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// types
import type { TReleaseOrderByOptions, TReleaseStatus } from "@plane/types";

export const RELEASE_STATUS_COLORS: {
  [key in TReleaseStatus]: string;
} = {
  unreleased: "#f39e1f",
  released: "#16a34a",
  cancelled: "#ef4444",
};

export const RELEASE_STATUS: {
  i18n_label: string;
  value: TReleaseStatus;
  color: string;
  textColor: string;
  bgColor: string;
}[] = [
  {
    i18n_label: "project_releases.status.unreleased",
    value: "unreleased",
    color: RELEASE_STATUS_COLORS.unreleased,
    textColor: "text-amber-500",
    bgColor: "bg-amber-50",
  },
  {
    i18n_label: "project_releases.status.released",
    value: "released",
    color: RELEASE_STATUS_COLORS.released,
    textColor: "text-success-primary",
    bgColor: "bg-success-subtle",
  },
  {
    i18n_label: "project_releases.status.cancelled",
    value: "cancelled",
    color: RELEASE_STATUS_COLORS.cancelled,
    textColor: "text-danger-primary",
    bgColor: "bg-danger-subtle",
  },
];

export const RELEASE_ORDER_BY_OPTIONS: {
  i18n_label: string;
  key: TReleaseOrderByOptions;
}[] = [
  { i18n_label: "common.order_by.manual", key: "sort_order" },
  { i18n_label: "common.order_by.name", key: "name" },
  { i18n_label: "common.order_by.progress", key: "progress" },
  { i18n_label: "common.order_by.target_date", key: "target_date" },
  { i18n_label: "common.sort.created_on", key: "created_at" },
];
