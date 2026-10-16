/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { sortBy } from "lodash-es";
// plane imports
import type { IRelease, TReleaseDisplayFilters, TReleaseFilters, TReleaseOrderByOptions } from "@plane/types";
// local imports
import { getDate } from "./datetime";
import { satisfiesDateFilter } from "./filter";

const collator = new Intl.Collator("en-US", { numeric: true, sensitivity: "base" });

/**
 * @description performs natural sorting of strings, so v10.x sorts after v9.x
 * @param {string} a - first string to compare
 * @param {string} b - second string to compare
 * @returns {number} - comparison result (-1, 0, or 1)
 */
const naturalSort = (a: string, b: string): number => collator.compare(a, b);

/**
 * @description orders releases by the given key
 * @param {IRelease[]} releases
 * @param {TReleaseOrderByOptions | undefined} orderByKey
 * @returns {IRelease[]}
 */
export const orderReleases = (releases: IRelease[], orderByKey: TReleaseOrderByOptions | undefined): IRelease[] => {
  if (releases.length === 0 || !orderByKey) return [];

  if (orderByKey === "name") return [...releases].toSorted((a, b) => naturalSort(a.name, b.name));
  if (orderByKey === "-name") return [...releases].toSorted((a, b) => naturalSort(b.name, a.name));
  if (["work_items_length", "-work_items_length"].includes(orderByKey))
    return sortBy(releases, [(r) => (orderByKey === "work_items_length" ? r.work_item_count : -r.work_item_count)]);
  if (orderByKey === "target_date") return sortBy(releases, [(r) => r.release_date]);
  if (orderByKey === "-target_date") return sortBy(releases, [(r) => !r.release_date]);
  if (orderByKey === "created_at") return sortBy(releases, [(r) => r.created_at]);
  if (orderByKey === "-created_at") return sortBy(releases, [(r) => !r.created_at]);
  if (orderByKey === "sort_order") return sortBy(releases, [(r) => r.sort_order]);

  return releases;
};

/**
 * @description decides whether a release survives the active filters
 * @param {IRelease} release
 * @param {TReleaseDisplayFilters} displayFilters
 * @param {TReleaseFilters} filters
 * @returns {boolean}
 */
export const shouldFilterRelease = (
  release: IRelease,
  displayFilters: TReleaseDisplayFilters,
  filters: TReleaseFilters
): boolean => {
  let fallsInFilters = true;
  Object.keys(filters).forEach((key) => {
    const filterKey = key as keyof TReleaseFilters;
    if (filterKey === "status" && filters.status && filters.status.length > 0)
      fallsInFilters = fallsInFilters && filters.status.includes(release.status);
    if (filterKey === "lead" && filters.lead && filters.lead.length > 0)
      fallsInFilters = fallsInFilters && filters.lead.includes(`${release.lead}`);
    if (filterKey === "tag" && filters.tag && filters.tag.length > 0)
      fallsInFilters = fallsInFilters && filters.tag.includes(`${release.tag}`);
    if (filterKey === "labels" && filters.labels && filters.labels.length > 0) {
      const labelIds = release.label_ids ?? release.label_details?.map((label) => label.id) ?? [];
      fallsInFilters = fallsInFilters && filters.labels.some((labelId) => labelIds.includes(labelId));
    }
    if (filterKey === "target_date" && filters.target_date && filters.target_date.length > 0) {
      const releaseDate = getDate(release.release_date);
      filters.target_date.forEach((dateFilter) => {
        fallsInFilters = fallsInFilters && !!releaseDate && satisfiesDateFilter(releaseDate, dateFilter);
      });
    }
  });

  // `displayFilters` currently only carries order_by, which is applied by orderReleases.
  void displayFilters;

  return fallsInFilters;
};
