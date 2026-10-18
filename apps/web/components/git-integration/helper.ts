/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TGitReferenceState } from "@plane/types";

type TBadgeVariant = "success" | "neutral" | "purple" | "danger" | "info";

export const GIT_REFERENCE_STATE_VARIANT: Record<TGitReferenceState, TBadgeVariant> = {
  open: "success",
  draft: "neutral",
  merged: "purple",
  closed: "danger",
  active: "info",
  deleted: "neutral",
};

/** `feat/PROJ-12-short-title`: the key in the branch name is what links the branch to the work item. */
export const generateBranchName = (projectIdentifier: string, sequenceId: number, name: string) => {
  const slug = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  const key = `${projectIdentifier}-${sequenceId}`;
  return slug ? `feat/${key}-${slug}` : `feat/${key}`;
};

/** Only render links that point at GitHub: reference URLs come from webhook payloads. */
export const isSafeGitUrl = (url: string) => url.startsWith("https://github.com/");
