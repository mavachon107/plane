/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useRef, useState } from "react";
import { observer } from "mobx-react";
import useSWR from "swr";
import type { EditorRefApi } from "@plane/editor";
// plane imports
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import type { TNameDescriptionLoader } from "@plane/types";
import { EFileAssetType } from "@plane/types";
import { Spinner } from "@plane/blocks/spinner";
import { setToast } from "@plane/blocks/toast";
// components
import { DescriptionInput } from "@/components/editor/rich-text/description-input";
import { PageToolbar } from "@/components/pages/editor/toolbar";
// hooks
import { useRelease } from "@/hooks/store/use-release";
import { useUserPermissions } from "@/hooks/store/user";

type Props = {
  workspaceSlug: string;
  projectId: string;
  releaseId: string;
};

/**
 * The customer-facing notes for a release.
 *
 * `DescriptionInput` autosaves on a debounce and flushes on unmount, so there is no
 * explicit save control -- the same contract the work item description uses.
 */
export const ReleaseChangelogRoot = observer(function ReleaseChangelogRoot(props: Props) {
  const { workspaceSlug, projectId, releaseId } = props;
  // state
  const [, setIsSubmitting] = useState<TNameDescriptionLoader>("saved");
  const [editorInstance, setEditorInstance] = useState<EditorRefApi | null>(null);
  // refs
  const editorRef = useRef<EditorRefApi>(null);
  // plane hooks
  const { t } = useTranslation();
  // store hooks
  const { fetchChangelog, getChangelogByReleaseId, updateChangelog } = useRelease();
  const { allowPermissions } = useUserPermissions();
  // derived values
  const isEditingAllowed = allowPermissions(
    [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
    EUserPermissionsLevel.PROJECT
  );

  const { isLoading } = useSWR(
    releaseId ? `RELEASE_CHANGELOG_${releaseId}` : null,
    releaseId ? () => fetchChangelog(workspaceSlug, projectId, releaseId) : null,
    { revalidateIfStale: false, revalidateOnFocus: false }
  );

  const changelog = getChangelogByReleaseId(releaseId);

  // The toolbar needs the editor instance, which only exists once the editor has mounted.
  useEffect(() => {
    if (!changelog) return;
    const interval = setInterval(() => {
      if (editorRef.current) {
        setEditorInstance(editorRef.current);
        clearInterval(interval);
      }
    }, 100);
    return () => clearInterval(interval);
  }, [changelog]);

  if (isLoading || !changelog)
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Spinner />
      </div>
    );

  return (
    <div className="flex h-full w-full flex-col">
      {isEditingAllowed && (
        <div className="flex min-h-[52px] items-center border-b border-subtle-1 px-6">
          {editorInstance && <PageToolbar editorRef={editorInstance} />}
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto px-16 py-8">
        <DescriptionInput
          key={changelog.id}
          entityId={changelog.id}
          fileAssetType={EFileAssetType.PAGE_DESCRIPTION}
          initialValue={changelog.description_html}
          disabled={!isEditingAllowed}
          workspaceSlug={workspaceSlug}
          projectId={projectId}
          editorRef={editorRef}
          containerClassName="border-none"
          setIsSubmitting={(value) => setIsSubmitting(value)}
          onSubmit={async (value) => {
            await updateChangelog(workspaceSlug, projectId, releaseId, {
              description_html: value.description_html,
            }).catch(() => {
              setToast({
                type: "error",
                title: t("toast.error"),
                message: t("project_releases.toast.changelog.error"),
              });
            });
          }}
        />
      </div>
    </div>
  );
});
