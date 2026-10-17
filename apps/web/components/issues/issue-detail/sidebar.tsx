/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// i18n
import { useTranslation } from "@plane/i18n";
// local imports
import { IssuePropertiesSections } from "./properties-sections";
import type { TIssueOperations } from "./root";

type Props = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  issueOperations: TIssueOperations;
  isEditable: boolean;
};

export const IssueDetailsSidebar = observer(function IssueDetailsSidebar(props: Props) {
  const { t } = useTranslation();
  const { workspaceSlug, projectId, issueId, issueOperations, isEditable } = props;

  return (
    <div className="flex h-full w-full flex-col items-center divide-y-2 divide-subtle-1 overflow-hidden">
      <div className="h-full w-full overflow-y-auto px-6">
        <h5 className="mt-5 mb-3 text-body-xs-medium">{t("common.properties")}</h5>
        <IssuePropertiesSections
          workspaceSlug={workspaceSlug}
          projectId={projectId}
          issueId={issueId}
          issueOperations={issueOperations}
          disabled={!isEditable}
          showMeta
        />
      </div>
    </div>
  );
});
