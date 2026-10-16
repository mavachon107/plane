/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// plane imports
import { useTranslation } from "@plane/i18n";
import type { IRelease } from "@plane/types";
import { ConfirmDialog } from "@plane/blocks/dialog";
import { setToast } from "@plane/blocks/toast";
// hooks
import { useRelease } from "@/hooks/store/use-release";
import { useAppRouter } from "@/hooks/use-app-router";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  data: IRelease;
  workspaceSlug: string;
  projectId: string;
};

export const DeleteReleaseModal = observer(function DeleteReleaseModal(props: Props) {
  const { isOpen, onClose, data, workspaceSlug, projectId } = props;
  // state
  const [isDeleting, setIsDeleting] = useState(false);
  // router
  const router = useAppRouter();
  const { releaseId } = useParams();
  // plane hooks
  const { t } = useTranslation();
  // store hooks
  const { deleteRelease } = useRelease();

  const handleClose = () => {
    setIsDeleting(false);
    onClose();
  };

  const handleDeletion = async () => {
    setIsDeleting(true);
    try {
      await deleteRelease(workspaceSlug, projectId, data.id);
      // Navigate away when the release being deleted is the one open.
      if (releaseId?.toString() === data.id) {
        router.push(`/${workspaceSlug}/projects/${projectId}/releases`);
      }
      handleClose();
      setToast({
        type: "success",
        title: t("toast.success"),
        message: t("project_releases.toast.delete.success"),
      });
    } catch {
      setIsDeleting(false);
      setToast({
        type: "error",
        title: t("toast.error"),
        message: t("project_releases.toast.delete.error"),
      });
    }
  };

  return (
    <ConfirmDialog
      isOpen={isOpen}
      handleClose={handleClose}
      handleSubmit={handleDeletion}
      isSubmitting={isDeleting}
      title={t("project_releases.delete_release")}
      content={t("project_releases.delete_confirmation", { name: data.name })}
      variant="danger"
    />
  );
});
