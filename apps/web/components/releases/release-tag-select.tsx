/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { ReleaseTagOutline } from "@makeplane/propel/icons";
// plane imports
import { useTranslation } from "@plane/i18n";
import type { IReleaseTag } from "@plane/types";
import { Select } from "@plane/blocks/select";
// hooks
import { useRelease } from "@/hooks/store/use-release";

type Props = {
  projectId: string;
  value: string | null;
  onChange: (tagId: string | null) => void;
  disabled?: boolean;
};

/** Picks a version marker from the project's release tags. */
export const ReleaseTagSelect = observer(function ReleaseTagSelect(props: Props) {
  const { projectId, value, onChange, disabled = false } = props;
  const { t } = useTranslation();
  const { getProjectTags } = useRelease();

  const tags = getProjectTags(projectId);
  // Resolve id-first so an id whose tag has not loaded still survives onChange.
  const selected = value
    ? (tags.find((tag) => tag.id === value) ?? ({ id: value, version: value } as IReleaseTag))
    : null;

  return (
    <Select<IReleaseTag>
      getValues={() => tags}
      value={selected}
      onChange={(val) => {
        onChange(val || null);
      }}
      getOptionValue={(tag) => tag.id}
      getOptionLabel={(tag) => tag.version}
      getOptionIcon={() => <ReleaseTagOutline className="h-4 w-4" />}
      disabled={disabled}
      emptyMessage={t("project_releases.no_tags")}
    >
      <Select.Trigger<IReleaseTag>
        disabled={disabled}
        variant="select-ghost-md"
        prependIcon={(selectedTags) =>
          selectedTags.length > 0 ? undefined : <ReleaseTagOutline className="h-4 w-4" />
        }
        label={(selectedTags) => selectedTags[0]?.version ?? t("project_releases.tag")}
      />
    </Select>
  );
});
