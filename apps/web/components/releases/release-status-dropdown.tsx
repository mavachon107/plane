/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { ReleasesFilled } from "@makeplane/propel/icons";
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
      <Select.Trigger
        variant="pill-md"
        prependIcon={<ReleasesFilled className="h-4 w-4" style={{ color: releaseStatus.color }} />}
      >
        <span className="truncate">{t(releaseStatus.i18n_label)}</span>
      </Select.Trigger>
    </Select>
  );
});
