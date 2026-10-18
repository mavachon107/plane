/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Loader } from "@plane/blocks/skeleton";

export function WorkItemTypeLoader() {
  return (
    <Loader className="space-y-4 md:w-2/3">
      <Loader.Item height="56px" />
      <Loader.Item height="56px" />
      <Loader.Item height="56px" />
      <Loader.Item height="56px" />
    </Loader>
  );
}
