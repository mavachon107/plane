/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useRef, useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { Icon } from "@makeplane/propel/components/icon";
import { IconButton } from "@makeplane/propel/components/icon-button";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@makeplane/propel/components/menu";
import { Button as ButtonElement } from "@makeplane/propel/elements/button";
import {
  CloseOutline,
  FilterOutline,
  SearchOutline,
  SortAscendingOutline,
  SortDescendingOutline,
} from "@makeplane/propel/icons";
// plane imports
import { RELEASE_ORDER_BY_OPTIONS } from "@plane/constants";
import { useOutsideClickDetector } from "@plane/hooks";
import { useTranslation } from "@plane/i18n";
import type { TReleaseFilters, TReleaseOrderByOptions } from "@plane/types";
import { calculateTotalFilters, cn } from "@plane/utils";
// components
import { FilterHeader, FilterOption, FiltersDropdown } from "@/components/issues/issue-layouts/filters";
import { FilterLead, FilterTargetDate } from "@/components/modules";
// hooks
import { useMember } from "@/hooks/store/use-member";
import { useRelease } from "@/hooks/store/use-release";
import { useReleaseFilter } from "@/hooks/store/use-release-filter";

type TIdFilterKey = "labels" | "tag";

type TFilterListProps = {
  title: string;
  options: { id: string; label: string }[];
  applied: string[] | null;
  onToggle: (id: string) => void;
  searchQuery: string;
};

const FilterList = function FilterList(props: TFilterListProps) {
  const { title, options, applied, onToggle, searchQuery } = props;
  const [isOpen, setIsOpen] = useState(true);
  const count = applied?.length ?? 0;
  const visible = options.filter((option) => option.label.toLowerCase().includes(searchQuery.toLowerCase()));
  if (options.length === 0) return null;

  return (
    <>
      <FilterHeader
        title={`${title}${count > 0 ? ` (${count})` : ""}`}
        isPreviewEnabled={isOpen}
        handleIsPreviewEnabled={() => setIsOpen(!isOpen)}
      />
      {isOpen && (
        <div>
          {visible.map((option) => (
            <FilterOption
              key={option.id}
              isChecked={applied?.includes(option.id) ?? false}
              onClick={() => onToggle(option.id)}
              title={option.label}
            />
          ))}
        </div>
      )}
    </>
  );
};

/** Search, sort and filter controls for the releases list header. */
export const ReleaseViewHeader = observer(function ReleaseViewHeader() {
  // refs
  const inputRef = useRef<HTMLInputElement>(null);
  // router
  const { projectId } = useParams();
  const project = projectId?.toString() ?? "";
  // plane hooks
  const { t } = useTranslation();
  // store hooks
  const {
    workspace: { workspaceMemberIds },
  } = useMember();
  const { getProjectLabels, getProjectTags } = useRelease();
  const { displayFilters, filters, searchQuery, updateDisplayFilters, updateFilters, updateSearchQuery } =
    useReleaseFilter();
  // states
  const [isSearchOpen, setIsSearchOpen] = useState(searchQuery !== "");
  const [filtersSearchQuery, setFiltersSearchQuery] = useState("");

  const currentDisplayFilters = displayFilters[project];
  const currentFilters = filters[project] ?? {};
  const orderBy = currentDisplayFilters?.order_by;
  const isDescending = orderBy?.[0] === "-";
  const isManual = orderBy === "sort_order";
  const orderByDetails = RELEASE_ORDER_BY_OPTIONS.find((option) => orderBy?.includes(option.key));
  const isFiltersApplied = calculateTotalFilters(currentFilters) !== 0;

  const handleFilterToggle = (key: keyof TReleaseFilters, value: string | string[]) => {
    if (!project) return;
    const next = [...((currentFilters[key] as string[] | undefined) ?? [])];
    (Array.isArray(value) ? value : [value]).forEach((val) => {
      const index = next.indexOf(val);
      if (index === -1) next.push(val);
      else next.splice(index, 1);
    });
    updateFilters(project, { [key]: next });
  };

  const handleOrderBy = (value: TReleaseOrderByOptions) => {
    if (!project || value === orderBy) return;
    updateDisplayFilters(project, { order_by: value });
  };

  useOutsideClickDetector(inputRef, () => {
    if (isSearchOpen && searchQuery.trim() === "") setIsSearchOpen(false);
  });

  useEffect(() => {
    if (searchQuery.trim() !== "") setIsSearchOpen(true);
  }, [searchQuery]);

  const idFilterOptions: Record<TIdFilterKey, { id: string; label: string }[]> = {
    labels: getProjectLabels(project).map((label) => ({ id: label.id, label: label.name })),
    tag: getProjectTags(project).map((tag) => ({ id: tag.id, label: tag.version })),
  };

  return (
    <div className="hidden h-full items-center gap-2 self-end sm:flex">
      <div className="flex items-center">
        {!isSearchOpen && (
          <IconButton
            variant="ghost"
            size="md"
            render={<button type="button" className="-mr-1" />}
            onClick={() => {
              setIsSearchOpen(true);
              inputRef.current?.focus();
            }}
            icon={<Icon icon={SearchOutline} />}
            aria-label={t("common.search.label")}
          />
        )}
        <div
          className={cn(
            "ml-auto flex w-0 items-center justify-start gap-1 overflow-hidden rounded-md border border-transparent bg-surface-1 text-placeholder opacity-0 transition-[width] ease-linear",
            { "w-64 border-subtle px-2.5 py-1.5 opacity-100": isSearchOpen }
          )}
        >
          <SearchOutline className="h-3.5 w-3.5" />
          <input
            ref={inputRef}
            className="w-full max-w-[234px] border-none bg-transparent text-13 text-primary placeholder:text-placeholder focus:outline-none"
            placeholder={t("common.search.label")}
            value={searchQuery}
            onChange={(e) => updateSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Escape") return;
              if (searchQuery.trim() !== "") updateSearchQuery("");
              else {
                setIsSearchOpen(false);
                inputRef.current?.blur();
              }
            }}
          />
          {isSearchOpen && (
            <button type="button" className="grid place-items-center" onClick={() => setIsSearchOpen(false)}>
              <CloseOutline className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      <FiltersDropdown
        title={t("common.filters")}
        placement="bottom-end"
        isFiltersApplied={isFiltersApplied}
        menuButton={
          <span className="relative grid size-7 place-items-center rounded-md border border-subtle hover:bg-layer-transparent-hover">
            <FilterOutline className="size-3.5" />
            {isFiltersApplied && (
              <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-accent-primary" />
            )}
          </span>
        }
      >
        <div className="flex h-full w-full flex-col overflow-hidden">
          <div className="bg-surface-1 p-2.5 pb-0">
            <div className="flex items-center gap-1.5 rounded-sm border-[0.5px] border-subtle bg-surface-2 px-1.5 py-1 text-11">
              <SearchOutline className="text-placeholder" width={12} height={12} />
              <input
                type="text"
                className="w-full bg-surface-2 outline-none placeholder:text-placeholder"
                placeholder={t("common.search.label")}
                value={filtersSearchQuery}
                onChange={(e) => setFiltersSearchQuery(e.target.value)}
              />
            </div>
          </div>
          <div className="vertical-scrollbar scrollbar-sm h-full w-full divide-y divide-subtle-1 overflow-y-auto px-2.5">
            <div className="py-2">
              <FilterLead
                appliedFilters={currentFilters.lead ?? null}
                handleUpdate={(val) => handleFilterToggle("lead", val)}
                searchQuery={filtersSearchQuery}
                memberIds={workspaceMemberIds ?? undefined}
              />
            </div>
            <div className="py-2">
              <FilterList
                title={t("project_releases.label")}
                options={idFilterOptions.labels}
                applied={currentFilters.labels ?? null}
                onToggle={(id) => handleFilterToggle("labels", id)}
                searchQuery={filtersSearchQuery}
              />
            </div>
            <div className="py-2">
              <FilterList
                title={t("project_releases.tag")}
                options={idFilterOptions.tag}
                applied={currentFilters.tag ?? null}
                onToggle={(id) => handleFilterToggle("tag", id)}
                searchQuery={filtersSearchQuery}
              />
            </div>
            <div className="py-2">
              <FilterTargetDate
                title={t("project_releases.target_date")}
                appliedFilters={currentFilters.target_date ?? null}
                handleUpdate={(val) => handleFilterToggle("target_date", val)}
                searchQuery={filtersSearchQuery}
              />
            </div>
          </div>
        </div>
      </FiltersDropdown>

      <Menu>
        <MenuTrigger render={<ButtonElement variant="secondary" size="md" stretch="auto" />}>
          {isDescending ? (
            <SortDescendingOutline className="size-3.5" />
          ) : (
            <SortAscendingOutline className="size-3.5" />
          )}
          {orderByDetails && t(orderByDetails.i18n_label)}
        </MenuTrigger>
        <MenuContent side="bottom" align="end">
          {RELEASE_ORDER_BY_OPTIONS.map((option) => (
            <MenuItem
              key={option.key}
              label={t(option.i18n_label)}
              selected={orderBy?.includes(option.key.replace(/^-/, "")) ?? false}
              onClick={() => {
                const base = option.key.replace(/^-/, "");
                // keep the current direction when switching between sortable columns
                if (isDescending && base !== "sort_order" && !option.key.startsWith("-"))
                  handleOrderBy(`-${base}` as TReleaseOrderByOptions);
                else handleOrderBy(option.key);
              }}
            />
          ))}
          {!isManual && (
            <>
              <MenuSeparator />
              <MenuItem
                label={t("common.sort.asc")}
                selected={!isDescending}
                onClick={() => {
                  if (isDescending && orderBy) handleOrderBy(orderBy.slice(1) as TReleaseOrderByOptions);
                }}
              />
              <MenuItem
                label={t("common.sort.desc")}
                selected={isDescending}
                onClick={() => {
                  if (!isDescending && orderBy) handleOrderBy(`-${orderBy}` as TReleaseOrderByOptions);
                }}
              />
            </>
          )}
        </MenuContent>
      </Menu>
    </div>
  );
});
