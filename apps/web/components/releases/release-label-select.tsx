/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { ReleaseTagOutline } from "@makeplane/propel/icons";
// plane imports
import { useTranslation } from "@plane/i18n";
import type { IReleaseLabel } from "@plane/types";
import { Select } from "@plane/blocks/select";
import type { SelectVariant } from "@plane/blocks/select";
// hooks
import { useRelease } from "@/hooks/store/use-release";

type Props = {
  projectId: string;
  /** Label ids currently attached to the release. */
  value: string[];
  onChange: (labelIds: string[]) => void;
  disabled?: boolean;
  variant?: SelectVariant;
};

const LabelDot = ({ color }: { color: string }) => (
  <span className="h-3 w-3 flex-shrink-0 rounded-full" style={{ backgroundColor: color || "#a3a3a2" }} />
);

/**
 * Picks from the release label palette.
 *
 * Deliberately not `@/components/dropdowns/label/label-select`: that one reads work item
 * labels, which are a different table from the release palette.
 */
export const ReleaseLabelSelect = observer(function ReleaseLabelSelect(props: Props) {
  const { projectId, value, onChange, disabled = false, variant = "pill-md" } = props;
  const { t } = useTranslation();
  const { getProjectLabels } = useRelease();

  const labels = getProjectLabels(projectId);
  // Resolve ids first so an id with no loaded label still round-trips through onChange.
  const byId = new Map(labels.map((label) => [label.id, label]));
  const selected = value.map((id) => byId.get(id) ?? ({ id, name: id, color: "" } as IReleaseLabel));

  return (
    <Select<IReleaseLabel>
      multiple
      getValues={() => labels}
      value={selected}
      onChange={(ids) => {
        onChange(ids);
      }}
      getOptionValue={(label) => label.id}
      getOptionLabel={(label) => label.name}
      getOptionIcon={(label) => <LabelDot color={label.color} />}
      disabled={disabled}
      emptyMessage={t("project_releases.no_labels")}
    >
      <Select.Trigger<IReleaseLabel>
        disabled={disabled}
        variant={variant}
        prependIcon={<ReleaseTagOutline className="h-4 w-4" />}
      >
        {(selectedLabels) => (
          <span className="truncate">
            {selectedLabels.length === 0
              ? t("project_releases.label")
              : selectedLabels.length === 1
                ? selectedLabels[0].name
                : t("labels_count", { count: selectedLabels.length })}
          </span>
        )}
      </Select.Trigger>
    </Select>
  );
});
