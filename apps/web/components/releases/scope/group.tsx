/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ReactNode } from "react";
import { useState } from "react";
import { observer } from "mobx-react";
import { Collapsible } from "@makeplane/propel/components/collapsible";
// plane imports
import { STATE_GROUPS } from "@plane/constants";
import type { TStateGroups } from "@plane/types";
// local imports
import { ReleaseScopeItem } from "./item";

type Props = {
  group: TStateGroups;
  icon: ReactNode;
  workItemIds: string[];
  workspaceSlug: string;
  projectId: string;
  releaseId: string;
  isEditingAllowed: boolean;
};

export const ReleaseScopeGroup = observer(function ReleaseScopeGroup(props: Props) {
  const { group, icon, workItemIds, workspaceSlug, projectId, releaseId, isEditingAllowed } = props;
  // state
  const [isOpen, setIsOpen] = useState(true);

  return (
    <Collapsible
      open={isOpen}
      onOpenChange={setIsOpen}
      icon={<div className="grid shrink-0 place-items-center overflow-hidden">{icon}</div>}
      trigger={
        <>
          <span className="text-13 font-medium text-primary">{STATE_GROUPS[group].label}</span>
          <span className="ml-2 text-13 text-placeholder">{workItemIds.length}</span>
        </>
      }
    >
      {workItemIds.map((workItemId) => (
        <ReleaseScopeItem
          key={workItemId}
          workItemId={workItemId}
          workspaceSlug={workspaceSlug}
          projectId={projectId}
          releaseId={releaseId}
          isEditingAllowed={isEditingAllowed}
        />
      ))}
    </Collapsible>
  );
});
