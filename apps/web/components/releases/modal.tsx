/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { Dialog, DialogContent } from "@makeplane/propel/components/dialog";
// plane imports
import { useTranslation } from "@plane/i18n";
import type { IRelease } from "@plane/types";
import { setToast } from "@plane/blocks/toast";
// hooks
import { useRelease } from "@/hooks/store/use-release";
// local imports
import { ReleaseForm } from "./form";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  data?: IRelease | null;
  workspaceSlug: string;
  projectId: string;
};

export const CreateUpdateReleaseModal = observer(function CreateUpdateReleaseModal(props: Props) {
  const { isOpen, onClose, data, workspaceSlug, projectId } = props;
  // plane hooks
  const { t } = useTranslation();
  // store hooks
  const { createRelease, updateReleaseDetails } = useRelease();

  const handleClose = () => {
    onClose();
  };

  const handleCreateRelease = async (payload: Partial<IRelease>) => {
    try {
      await createRelease(workspaceSlug, projectId, payload);
      handleClose();
      setToast({
        type: "success",
        title: t("toast.success"),
        message: t("project_releases.toast.create.success"),
      });
    } catch (error) {
      setToast({
        type: "error",
        title: t("toast.error"),
        message: (error as { error?: string })?.error ?? t("project_releases.toast.create.error"),
      });
    }
  };

  const handleUpdateRelease = async (payload: Partial<IRelease>) => {
    if (!data) return;
    try {
      await updateReleaseDetails(workspaceSlug, projectId, data.id, payload);
      handleClose();
      setToast({
        type: "success",
        title: t("toast.success"),
        message: t("project_releases.toast.update.success"),
      });
    } catch (error) {
      setToast({
        type: "error",
        title: t("toast.error"),
        message: (error as { error?: string })?.error ?? t("project_releases.toast.update.error"),
      });
    }
  };

  const handleFormSubmit = async (payload: Partial<IRelease>) => {
    if (!data) await handleCreateRelease(payload);
    else await handleUpdateRelease(payload);
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) handleClose();
      }}
      disablePointerDismissal
    >
      <DialogContent
        size="md"
        aria-label={data ? t("project_releases.update_release") : t("project_releases.create_release")}
      >
        <ReleaseForm handleFormSubmit={handleFormSubmit} handleClose={handleClose} data={data} projectId={projectId} />
      </DialogContent>
    </Dialog>
  );
});
