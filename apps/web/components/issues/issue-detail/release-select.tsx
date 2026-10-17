/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useRef, useState } from "react";
import { observer } from "mobx-react";
import { sortBy } from "lodash-es";
import useSWR from "swr";
import { ReleasesOutline } from "@makeplane/propel/icons";
import { Select } from "@plane/blocks/select";
import { useTranslation } from "@plane/i18n";
import type { IRelease } from "@plane/types";
import { cn } from "@plane/utils";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useRelease } from "@/hooks/store/use-release";
import { useReleaseWorkItems } from "@/hooks/store/use-release-work-items";
// types
import type { TIssueOperations } from "./root";

type Props = {
  className?: string;
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  issueOperations: TIssueOperations;
  disabled?: boolean;
};

/**
 * Issue-detail binding for assigning a work item to releases. Diffs the selection into add/remove
 * calls (serialized, since the multi-select stays open) and re-reads the work item afterwards so
 * `release_ids` reflects the server.
 */
export const IssueReleaseSelect = observer(function IssueReleaseSelect(props: Props) {
  const { className, workspaceSlug, projectId, issueId, issueOperations, disabled = false } = props;
  const { t } = useTranslation();
  const [isUpdating, setIsUpdating] = useState(false);
  const pendingOp = useRef<Promise<void> | null>(null);
  // store hooks
  const {
    issue: { getIssueById },
  } = useIssueDetail();
  const { releaseMap, getReleaseById, fetchReleases } = useRelease();
  const { addWorkItems, removeWorkItems } = useReleaseWorkItems();

  useSWR(
    workspaceSlug && projectId ? `ISSUE_RELEASES_${workspaceSlug}_${projectId}` : null,
    workspaceSlug && projectId ? () => fetchReleases(workspaceSlug, projectId) : null,
    { revalidateIfStale: false, revalidateOnFocus: false }
  );

  // Read the map directly: `projectReleaseIds` keys off the route's project, which is absent on /browse/.
  const releases = sortBy(
    Object.values(releaseMap).filter((release) => release.project === projectId),
    (release) => release.sort_order
  );
  const releaseIds = getIssueById(issueId)?.release_ids ?? [];
  // Resolve ids first so an id whose release has not loaded still round-trips through onChange.
  const selected = releaseIds.map((id) => getReleaseById(id) ?? ({ id, name: id } as IRelease));

  const handleChange = useCallback(
    (nextIds: string[]) => {
      setIsUpdating(true);
      const run = async () => {
        try {
          await pendingOp.current;
          const current = getIssueById(issueId)?.release_ids ?? [];
          const toAdd = nextIds.filter((id) => !current.includes(id));
          const toRemove = current.filter((id) => !nextIds.includes(id));
          if (toAdd.length === 0 && toRemove.length === 0) return;
          await Promise.all([
            ...toAdd.map((id) => addWorkItems(workspaceSlug, projectId, id, [issueId])),
            ...toRemove.map((id) => removeWorkItems(workspaceSlug, projectId, id, [issueId])),
          ]);
          await issueOperations.fetch(workspaceSlug, projectId, issueId, false);
        } catch (error) {
          console.error("Error updating work item releases:", error);
        } finally {
          setIsUpdating(false);
        }
      };
      pendingOp.current = run();
    },
    [getIssueById, issueId, workspaceSlug, projectId, addWorkItems, removeWorkItems, issueOperations]
  );

  const isDisabled = disabled || isUpdating;

  return (
    <div className={cn("flex h-full w-full grow items-center gap-1", className)}>
      <Select<IRelease>
        multiple
        getValues={() => releases}
        value={selected}
        onChange={handleChange}
        getOptionValue={(release) => release.id}
        getOptionLabel={(release) => release.name}
        getOptionIcon={() => <ReleasesOutline className="h-4 w-4" />}
        disabled={isDisabled}
        emptyMessage={t("project_releases.no_releases")}
      >
        <Select.Trigger<IRelease> disabled={isDisabled} variant="select-ghost-md">
          {(selectedReleases) =>
            selectedReleases.length === 0 ? (
              <span className="truncate text-placeholder">{t("project_releases.no_release")}</span>
            ) : (
              <span className="flex items-center gap-1.5 truncate">
                <ReleasesOutline className="h-4 w-4 flex-shrink-0 text-accent-primary" />
                <span className="truncate">{selectedReleases.map((release) => release.name).join(", ")}</span>
              </span>
            )
          }
        </Select.Trigger>
      </Select>
    </div>
  );
});
