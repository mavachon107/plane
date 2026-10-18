/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
// plane imports
import { ConfirmDialog } from "@plane/blocks/dialog";
import { EmptyStateCompact } from "@plane/blocks/empty-state";
import { setToast } from "@plane/blocks/toast";
import { useTranslation } from "@plane/i18n";
// hooks
import { useWorkItemType } from "@/hooks/store/use-work-item-type";

type Props = {
  workspaceSlug: string;
  projectId: string;
  isAdmin: boolean;
};

export const WorkItemTypeEnableEmptyState = observer(function WorkItemTypeEnableEmptyState(props: Props) {
  const { workspaceSlug, projectId, isAdmin } = props;
  // plane hooks
  const { t } = useTranslation();
  // store hooks
  const { enableWorkItemTypes } = useWorkItemType();
  // states
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isEnabling, setIsEnabling] = useState(false);

  const handleEnable = async () => {
    setIsEnabling(true);
    try {
      await enableWorkItemTypes(workspaceSlug, projectId);
      setIsConfirmOpen(false);
    } catch (_error) {
      setToast({
        type: "error",
        title: t("common.error.label"),
        message: t("common.error.message"),
      });
    } finally {
      setIsEnabling(false);
    }
  };

  return (
    <>
      <EmptyStateCompact
        assetKey="custom-properties"
        assetClassName="size-20"
        title={t("work_item_types.empty_state.enable.title")}
        description={t("work_item_types.empty_state.enable.description")}
        actions={
          isAdmin
            ? [
                {
                  label: t("work_item_types.empty_state.enable.primary_button.text"),
                  onClick: () => setIsConfirmOpen(true),
                },
              ]
            : undefined
        }
        align="start"
        rootClassName="py-20"
      />
      {/* Enabling is a one-way latch on the server, so it is confirmed rather than toggled */}
      <ConfirmDialog
        isOpen={isConfirmOpen}
        variant="warning"
        title={t("work_item_types.empty_state.enable.confirmation.title")}
        content={t("work_item_types.empty_state.enable.confirmation.description")}
        primaryButtonText={{
          default: t("work_item_types.empty_state.enable.confirmation.button.default"),
          loading: t("work_item_types.empty_state.enable.confirmation.button.loading"),
        }}
        isSubmitting={isEnabling}
        handleClose={() => setIsConfirmOpen(false)}
        handleSubmit={handleEnable}
      />
    </>
  );
});
