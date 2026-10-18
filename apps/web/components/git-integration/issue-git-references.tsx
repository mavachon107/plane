/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import useSWR from "swr";
import { ExternalLink, GitBranch, GitPullRequest } from "lucide-react";
// plane imports
import { Badge } from "@makeplane/propel/components/badge";
import { Collapsible } from "@makeplane/propel/components/collapsible";
import { useTranslation } from "@plane/i18n";
// services
import { GitIntegrationService } from "@/services/git-integration.service";
// local imports
import { GIT_REFERENCE_STATE_VARIANT, isSafeGitUrl } from "./helper";

const gitIntegrationService = new GitIntegrationService();

type Props = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
};

/** Branches and pull requests linked to the work item. Renders nothing when there are none. */
export const IssueGitReferences = observer(function IssueGitReferences(props: Props) {
  const { workspaceSlug, projectId, issueId } = props;
  // translation
  const { t } = useTranslation();
  // states -- local, like the properties sections; this is not a registered work item widget
  const [isOpen, setIsOpen] = useState(true);
  // fetch
  const { data: references } = useSWR(
    workspaceSlug && projectId && issueId ? `ISSUE_GIT_REFERENCES_${issueId}` : null,
    () => gitIntegrationService.getReferences(workspaceSlug, projectId, issueId),
    { revalidateOnFocus: true }
  );

  const visible = (references ?? []).filter((reference) => reference.state !== "deleted");
  if (visible.length === 0) return null;

  return (
    <Collapsible
      open={isOpen}
      onOpenChange={setIsOpen}
      trigger={
        <span className="inline-flex items-center gap-2 text-13 font-medium text-primary">
          {t("git_integration.development")}
          <span className="text-body-xs-regular text-tertiary">{visible.length}</span>
        </span>
      }
    >
      <ul className="mt-2 mb-3 flex flex-col gap-1">
        {visible.map((reference) => {
          const Icon = reference.kind === "pull_request" ? GitPullRequest : GitBranch;
          const label =
            reference.kind === "pull_request" ? `#${reference.external_id} ${reference.title}` : reference.title;
          return (
            <li
              key={reference.id}
              className="flex items-center justify-between gap-2 rounded-md border border-subtle px-3 py-2"
            >
              <div className="flex min-w-0 items-center gap-2">
                <Icon className="size-4 shrink-0 text-tertiary" />
                {isSafeGitUrl(reference.url) ? (
                  <a
                    href={reference.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex min-w-0 items-center gap-1 text-body-xs-regular text-primary hover:underline"
                  >
                    <span className="truncate">{label}</span>
                    <ExternalLink className="size-3 shrink-0 text-tertiary" />
                  </a>
                ) : (
                  <span className="truncate text-body-xs-regular text-primary">{label}</span>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {reference.author_login && (
                  <span className="text-body-xs-regular text-tertiary">{reference.author_login}</span>
                )}
                <Badge
                  variant={GIT_REFERENCE_STATE_VARIANT[reference.state]}
                  size="xs"
                  label={t(`git_integration.state.${reference.state}`)}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </Collapsible>
  );
});
