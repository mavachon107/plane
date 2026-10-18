/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
// plane imports
import { ConfirmDialog } from "@plane/blocks/dialog";
import { setToast } from "@plane/blocks/toast";
import { useTranslation } from "@plane/i18n";
import type { TWorkItemType, TWorkItemTypeDeleteError } from "@plane/types";
// hooks
import { useWorkItemType } from "@/hooks/store/use-work-item-type";

type Props = {
  workItemType: TWorkItemType | null;
  isOpen: boolean;
  onClose: () => void;
  workspaceSlug: string;
  projectId: string;
};

const DELETE_ERROR_CODES = new Set<TWorkItemTypeDeleteError>([
  "cannot_delete_default_work_item_type",
  "cannot_delete_work_item_type_with_associated_work_items",
]);

/**
 * The server refuses to delete the project default or a type still in use, and returns a
 * code matching the i18n key name so the exact reason can be shown.
 */
const getDeleteErrorKey = (error: unknown) => {
  const code = (error as { error?: string } | undefined)?.error;
  if (code && DELETE_ERROR_CODES.has(code as TWorkItemTypeDeleteError)) {
    return `work_item_types.settings.item_delete_confirmation.errors.${code}`;
  }
  return "work_item_types.settings.item_delete_confirmation.toast.error.message";
};

export const DeleteWorkItemTypeModal = observer(function DeleteWorkItemTypeModal(props: Props) {
  const { workItemType, isOpen, onClose, workspaceSlug, projectId } = props;
  // plane hooks
  const { t } = useTranslation();
  // store hooks
  const { deleteWorkItemType } = useWorkItemType();
  // states
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    if (!workItemType) return;

    setIsDeleting(true);
    try {
      await deleteWorkItemType(workspaceSlug, projectId, workItemType.id);
      onClose();
      setToast({
        type: "success",
        title: t("work_item_types.settings.item_delete_confirmation.toast.success.title"),
        message: t("work_item_types.settings.item_delete_confirmation.toast.success.message"),
      });
    } catch (error) {
      setToast({
        type: "error",
        title: t("work_item_types.settings.item_delete_confirmation.toast.error.title"),
        message: t(getDeleteErrorKey(error)),
      });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <ConfirmDialog
      isOpen={isOpen}
      variant="danger"
      title={t("work_item_types.settings.item_delete_confirmation.title")}
      content={
        <>
          {t("work_item_types.settings.item_delete_confirmation.description")}{" "}
          {t("work_item_types.settings.item_delete_confirmation.can_disable_warning")}
        </>
      }
      primaryButtonText={{
        default: t("work_item_types.settings.item_delete_confirmation.primary_button"),
        loading: t("common.loading"),
      }}
      isSubmitting={isDeleting}
      handleClose={onClose}
      handleSubmit={handleDelete}
    />
  );
});
