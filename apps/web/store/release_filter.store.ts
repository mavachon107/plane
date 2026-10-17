/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { set } from "lodash-es";
import { action, observable, makeObservable, runInAction, reaction } from "mobx";
import { computedFn } from "mobx-utils";
// types
import type { TReleaseDisplayFilters, TReleaseFilters, TReleaseStatus } from "@plane/types";
// store
import type { CoreRootStore } from "./root.store";

export interface IReleaseFilterStore {
  // observables
  displayFilters: Record<string, TReleaseDisplayFilters>;
  filters: Record<string, TReleaseFilters>;
  searchQuery: string;
  /** The `Unreleased | Released | Cancelled` tabs above the list. */
  activeStatusTab: TReleaseStatus;
  // computed functions
  getDisplayFiltersByProjectId: (projectId: string) => TReleaseDisplayFilters | undefined;
  getFiltersByProjectId: (projectId: string) => TReleaseFilters | undefined;
  // actions
  updateDisplayFilters: (projectId: string, displayFilters: TReleaseDisplayFilters) => void;
  updateFilters: (projectId: string, filters: TReleaseFilters) => void;
  updateSearchQuery: (query: string) => void;
  setActiveStatusTab: (status: TReleaseStatus) => void;
  clearAllFilters: (projectId: string) => void;
}

export class ReleaseFilterStore implements IReleaseFilterStore {
  // observables
  displayFilters: Record<string, TReleaseDisplayFilters> = {};
  filters: Record<string, TReleaseFilters> = {};
  searchQuery: string = "";
  activeStatusTab: TReleaseStatus = "unreleased";
  // root store
  rootStore: CoreRootStore;

  constructor(_rootStore: CoreRootStore) {
    makeObservable(this, {
      // observables
      displayFilters: observable,
      filters: observable,
      searchQuery: observable.ref,
      activeStatusTab: observable.ref,
      // actions
      updateDisplayFilters: action,
      updateFilters: action,
      updateSearchQuery: action,
      setActiveStatusTab: action,
      clearAllFilters: action,
    });

    this.rootStore = _rootStore;

    // Seed per-project defaults and reset transient state when the project changes.
    reaction(
      () => this.rootStore.router.projectId,
      (projectId) => {
        if (!projectId) return;
        if (!this.displayFilters[projectId]) {
          runInAction(() => {
            set(this.displayFilters, [projectId], { order_by: "-created_at" });
            set(this.filters, [projectId], {});
            this.searchQuery = "";
            this.activeStatusTab = "unreleased";
          });
        }
      }
    );
  }

  getDisplayFiltersByProjectId = computedFn((projectId: string) => this.displayFilters[projectId]);

  getFiltersByProjectId = computedFn((projectId: string) => this.filters[projectId]);

  updateDisplayFilters = (projectId: string, displayFilters: TReleaseDisplayFilters) => {
    runInAction(() => {
      Object.keys(displayFilters).forEach((key) => {
        set(this.displayFilters, [projectId, key], displayFilters[key as keyof TReleaseDisplayFilters]);
      });
    });
  };

  updateFilters = (projectId: string, filters: TReleaseFilters) => {
    runInAction(() => {
      Object.keys(filters).forEach((key) => {
        set(this.filters, [projectId, key], filters[key as keyof TReleaseFilters]);
      });
    });
  };

  updateSearchQuery = (query: string) => {
    this.searchQuery = query;
  };

  setActiveStatusTab = (status: TReleaseStatus) => {
    this.activeStatusTab = status;
  };

  clearAllFilters = (projectId: string) => {
    runInAction(() => {
      set(this.filters, [projectId], {});
    });
  };
}
