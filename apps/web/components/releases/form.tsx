/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Controller, useForm } from "react-hook-form";
import { Button } from "@makeplane/propel/components/button";
import { Field } from "@makeplane/propel/components/field";
import { Input, InputGroup } from "@makeplane/propel/components/input";
import { TextArea, TextAreaGroup } from "@makeplane/propel/components/text-area";
// plane imports
import { useTranslation } from "@plane/i18n";
import type { IRelease } from "@plane/types";
import { getDate, renderFormattedPayloadDate } from "@plane/utils";
import { DateSelect } from "@plane/blocks/property-select";
// components
import { MemberSelect } from "@/components/dropdowns/member/member-select";
// local imports
import { ReleaseStatusDropdown } from "./release-status-dropdown";
import { ReleaseTagSelect } from "./release-tag-select";

type Props = {
  handleFormSubmit: (values: Partial<IRelease>) => Promise<void>;
  handleClose: () => void;
  data?: IRelease | null;
  projectId: string;
};

const defaultValues: Partial<IRelease> = {
  name: "",
  description_html: "",
  status: "unreleased",
  release_date: null,
  lead: null,
  tag: null,
  is_prerelease: false,
};

export const ReleaseForm = function ReleaseForm(props: Props) {
  const { handleFormSubmit, handleClose, data, projectId } = props;
  // plane hooks
  const { t } = useTranslation();
  // form
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    control,
    reset,
  } = useForm<Partial<IRelease>>({
    defaultValues: data ? { ...defaultValues, ...data } : defaultValues,
  });

  const handleCreateUpdate = async (formData: Partial<IRelease>) => {
    await handleFormSubmit(formData);
    reset({ ...defaultValues });
  };

  return (
    <form
      onSubmit={(event) => {
        void handleSubmit(handleCreateUpdate)(event);
      }}
    >
      <div className="space-y-4 p-5">
        <h3 className="text-xl font-medium text-primary">
          {data ? t("project_releases.update_release") : t("project_releases.create_release")}
        </h3>

        <Controller
          control={control}
          name="name"
          rules={{
            required: t("project_releases.form.name_required"),
            maxLength: { value: 255, message: t("project_releases.form.name_too_long") },
          }}
          render={({ field: { value, onChange } }) => (
            <div>
              <Field name="name" invalid={Boolean(errors?.name)}>
                <InputGroup size="2xl">
                  <Input
                    size="2xl"
                    id="name"
                    name="name"
                    type="text"
                    value={value ?? ""}
                    onChange={onChange}
                    placeholder={t("project_releases.form.name_placeholder")}
                  />
                </InputGroup>
              </Field>
              <span className="text-11 text-danger-primary">{errors?.name?.message}</span>
            </div>
          )}
        />

        <Controller
          control={control}
          name="description_html"
          render={({ field: { value, onChange } }) => (
            <Field name="description">
              <TextAreaGroup resize="none">
                <TextArea
                  size="lg"
                  surface="field"
                  id="description"
                  name="description"
                  value={value ?? ""}
                  onChange={onChange}
                  placeholder={t("project_releases.form.description_placeholder")}
                  autoResize
                  maxRows={8}
                />
              </TextAreaGroup>
            </Field>
          )}
        />

        <div className="flex flex-wrap items-center gap-2">
          <Controller
            control={control}
            name="release_date"
            render={({ field: { value, onChange } }) => (
              <DateSelect
                value={getDate(value) ?? null}
                onChange={(date) => onChange(date ? renderFormattedPayloadDate(date) : null)}
                placeholder={t("project_releases.target_date")}
                variant="pill-md"
                clearable
                clearLabel={t("common.clear")}
              />
            )}
          />

          <Controller
            control={control}
            name="status"
            render={({ field: { value, onChange } }) => (
              <ReleaseStatusDropdown value={value ?? "unreleased"} onChange={(payload) => onChange(payload.status)} />
            )}
          />

          <Controller
            control={control}
            name="lead"
            render={({ field: { value, onChange } }) => (
              <MemberSelect
                value={value}
                onChange={onChange}
                projectId={projectId}
                multiple={false}
                placeholder={t("project_releases.lead")}
                variant="pill-md"
              />
            )}
          />

          <Controller
            control={control}
            name="tag"
            render={({ field: { value, onChange } }) => (
              <ReleaseTagSelect projectId={projectId} value={value ?? null} onChange={onChange} />
            )}
          />
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-subtle px-5 py-4">
        <Button variant="secondary" size="md" stretch="auto" onClick={handleClose} label={t("common.cancel")} />
        <Button
          stretch="auto"
          variant="primary"
          size="md"
          type="submit"
          loading={isSubmitting}
          label={
            data
              ? isSubmitting
                ? t("common.updating")
                : t("project_releases.update_release")
              : isSubmitting
                ? t("common.creating")
                : t("project_releases.create_release")
          }
        />
      </div>
    </form>
  );
};
