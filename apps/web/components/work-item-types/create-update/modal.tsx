/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// plane imports
import { Dialog, DialogContent } from "@makeplane/propel/components/dialog";
import { setToast } from "@plane/blocks/toast";
import { useTranslation } from "@plane/i18n";
import type { TWorkItemType } from "@plane/types";
// hooks
import { useWorkItemType } from "@/hooks/store/use-work-item-type";
// local imports
import { WorkItemTypeForm } from "./form";

type Props = {
  data?: TWorkItemType | null;
  isOpen: boolean;
  onClose: () => void;
  workspaceSlug: string;
  projectId: string;
};

/** The serializer rejects a duplicate name with this code, which gets its own message. */
const NAME_CONFLICT = "WORK_ITEM_TYPE_NAME_ALREADY_EXISTS";

const isNameConflict = (error: unknown) => {
  const name = (error as { name?: string[] } | undefined)?.name;
  return Array.isArray(name) && name.includes(NAME_CONFLICT);
};

export const CreateUpdateWorkItemTypeModal = observer(function CreateUpdateWorkItemTypeModal(props: Props) {
  const { data, isOpen, onClose, workspaceSlug, projectId } = props;
  // plane hooks
  const { t } = useTranslation();
  // store hooks
  const { createWorkItemType, updateWorkItemType } = useWorkItemType();

  const handleFormSubmit = async (payload: Partial<TWorkItemType>) => {
    const scope = data ? "update" : "create";
    try {
      if (data) await updateWorkItemType(workspaceSlug, projectId, data.id, payload);
      else await createWorkItemType(workspaceSlug, projectId, payload);

      onClose();
      setToast({
        type: "success",
        title: t(`work_item_types.${scope}.toast.success.title`),
        message: t(`work_item_types.${scope}.toast.success.message`, { name: payload.name }),
      });
    } catch (error) {
      setToast({
        type: "error",
        title: t(`work_item_types.${scope}.toast.error.title`),
        message: isNameConflict(error)
          ? t(`work_item_types.${scope}.toast.error.message.conflict`, { name: payload.name })
          : t(`work_item_types.${scope}.toast.error.message.default`),
      });
    }
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      disablePointerDismissal
    >
      <DialogContent size="md">
        <WorkItemTypeForm data={data} handleClose={onClose} handleFormSubmit={handleFormSubmit} />
      </DialogContent>
    </Dialog>
  );
});
