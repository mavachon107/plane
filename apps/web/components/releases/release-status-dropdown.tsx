/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// plane imports
import { RELEASE_STATUS } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import type { IRelease, TReleaseStatus } from "@plane/types";
import { Select } from "@plane/blocks/select";

type ReleaseStatusOption = (typeof RELEASE_STATUS)[number];

type Props = {
  value: TReleaseStatus;
  onChange: (payload: Partial<IRelease>) => void;
  disabled?: boolean;
};

export const ReleaseStatusDropdown = observer(function ReleaseStatusDropdown(props: Props) {
  const { value, onChange, disabled = false } = props;
  const { t } = useTranslation();

  const releaseStatus = RELEASE_STATUS.find((status) => status.value === value) ?? RELEASE_STATUS[0];

  return (
    <Select<ReleaseStatusOption>
      getValues={() => RELEASE_STATUS}
      value={releaseStatus}
      onChange={(val) => {
        onChange({ status: val as TReleaseStatus });
      }}
      getOptionValue={(status) => status.value}
      getOptionLabel={(status) => t(status.i18n_label)}
      disabled={disabled}
      showSearch={false}
      pinSelected={false}
    >
      <Select.Trigger variant="pill-md" className="h-6 border-none bg-transparent p-0">
        <span
          className="text-xs flex items-center gap-1 rounded px-2 py-0.5 font-medium"
          style={{ color: releaseStatus.color, backgroundColor: `${releaseStatus.color}20` }}
        >
          {t(releaseStatus.i18n_label)}
        </span>
      </Select.Trigger>
    </Select>
  );
});
