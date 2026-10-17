/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type React from "react";
import { useState } from "react";
import { observer } from "mobx-react";
import { Icon } from "@makeplane/propel/components/icon";
import { IconButton } from "@makeplane/propel/components/icon-button";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@makeplane/propel/components/menu";
import { DeleteOutline, EditOutline, LinkOutline, MoreHorizontalOutline } from "@makeplane/propel/icons";
// plane imports
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { ContextMenu, getRenderableItems, resolveItemVariant } from "@plane/blocks/context-menu";
import type { TContextMenuItem } from "@plane/blocks/context-menu";
import { setToast } from "@plane/blocks/toast";
import { copyUrlToClipboard } from "@plane/utils";
// hooks
import { useRelease } from "@/hooks/store/use-release";
import { useUserPermissions } from "@/hooks/store/user";
// local imports
import { CreateUpdateReleaseModal } from "./modal";
import { DeleteReleaseModal } from "./delete-release-modal";

type Props = {
  parentRef: React.RefObject<HTMLDivElement | null>;
  releaseId: string;
  projectId: string;
  workspaceSlug: string;
};

export const ReleaseQuickActions = observer(function ReleaseQuickActions(props: Props) {
  const { parentRef, releaseId, projectId, workspaceSlug } = props;
  // state
  const [editModal, setEditModal] = useState(false);
  const [deleteModal, setDeleteModal] = useState(false);
  // plane hooks
  const { t } = useTranslation();
  // store hooks
  const { getReleaseById } = useRelease();
  const { allowPermissions } = useUserPermissions();
  // derived values
  const releaseDetails = getReleaseById(releaseId);
  const isEditingAllowed = allowPermissions(
    [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
    EUserPermissionsLevel.PROJECT
  );
  const isDeletingAllowed = allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.PROJECT);

  const releaseLink = `${workspaceSlug}/projects/${projectId}/releases/${releaseId}`;

  const handleCopyText = async () => {
    await copyUrlToClipboard(releaseLink);
    setToast({
      type: "success",
      title: t("toast.success"),
      message: t("project_releases.toast.copy.success"),
    });
  };

  const MENU_ITEMS: TContextMenuItem[] = [
    {
      key: "edit",
      title: t("common.actions.edit"),
      icon: EditOutline,
      action: () => setEditModal(true),
      shouldRender: isEditingAllowed,
    },
    {
      key: "copy-link",
      title: t("common.actions.copy_link"),
      icon: LinkOutline,
      action: () => {
        void handleCopyText();
      },
    },
    {
      key: "delete",
      title: t("common.actions.delete"),
      icon: DeleteOutline,
      variant: "danger",
      action: () => setDeleteModal(true),
      shouldRender: isDeletingAllowed,
    },
  ];

  return (
    <>
      {releaseDetails && (
        <>
          <CreateUpdateReleaseModal
            isOpen={editModal}
            onClose={() => setEditModal(false)}
            data={releaseDetails}
            workspaceSlug={workspaceSlug}
            projectId={projectId}
          />
          <DeleteReleaseModal
            isOpen={deleteModal}
            onClose={() => setDeleteModal(false)}
            data={releaseDetails}
            workspaceSlug={workspaceSlug}
            projectId={projectId}
          />
        </>
      )}

      <ContextMenu parentRef={parentRef} items={MENU_ITEMS} />

      <Menu>
        <MenuTrigger
          render={
            <IconButton
              variant="tertiary"
              size="md"
              icon={<Icon icon={MoreHorizontalOutline} />}
              aria-label={t("project_releases.quick_actions.label")}
            />
          }
        />
        <MenuContent side="bottom" align="end">
          {getRenderableItems(MENU_ITEMS).map((item) => (
            <MenuItem
              key={item.key}
              variant={resolveItemVariant(item)}
              label={item.title ?? ""}
              icon={item.icon && <Icon icon={item.icon} />}
              disabled={item.disabled}
              onClick={() => {
                item.action();
              }}
            />
          ))}
        </MenuContent>
      </Menu>
    </>
  );
});
