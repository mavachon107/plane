/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// i18n
import { useTranslation } from "@plane/i18n";
// local imports
import type { TIssueOperations } from "../issue-detail";
import { IssuePropertiesSections } from "../issue-detail/properties-sections";

interface IPeekOverviewProperties {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  disabled: boolean;
  issueOperations: TIssueOperations;
}

export const PeekOverviewProperties = observer(function PeekOverviewProperties(props: IPeekOverviewProperties) {
  const { workspaceSlug, projectId, issueId, issueOperations, disabled } = props;
  const { t } = useTranslation();

  return (
    <div>
      <h6 className="mb-3 text-body-xs-medium">{t("common.properties")}</h6>
      <IssuePropertiesSections
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        issueId={issueId}
        issueOperations={issueOperations}
        disabled={disabled}
      />
    </div>
  );
});
