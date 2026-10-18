/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
// plane imports
import { Button } from "@makeplane/propel/components/button";
import {
  DialogActions,
  DialogBody,
  DialogHeader,
  DialogHeading,
  DialogMain,
  DialogTitle,
} from "@makeplane/propel/components/dialog";
import { Field } from "@makeplane/propel/components/field";
import { Input, InputGroup } from "@makeplane/propel/components/input";
import { TextArea, TextAreaGroup } from "@makeplane/propel/components/text-area";
import { LayerStackOutline } from "@makeplane/propel/icons";
import { EmojiPicker, Logo } from "@plane/blocks/emoji-icon-picker";
import { getRandomIconName } from "@plane/blocks/emoji-icon-picker/data";
import { useTranslation } from "@plane/i18n";
import type { TWorkItemType } from "@plane/types";

type Props = {
  data?: TWorkItemType | null;
  handleClose: () => void;
  handleFormSubmit: (values: Partial<TWorkItemType>) => Promise<void>;
};

// A new type starts with a glyph rather than nothing: the layouts render the type
// only through its logo, so an icon-less type would be invisible everywhere outside
// this settings page. getRandomIconName exists for exactly this seed. No colour is
// set, so the icon inherits the surrounding text colour until someone picks one --
// the seeded defaults carry explicit colours instead (plane/utils/issue_type.py).
const getDefaultValues = (): Partial<TWorkItemType> => ({
  name: "",
  description: "",
  logo_props: { in_use: "icon", icon: { name: getRandomIconName() } },
});

export function WorkItemTypeForm(props: Props) {
  const { data, handleClose, handleFormSubmit } = props;
  // plane hooks
  const { t } = useTranslation();
  // states
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  // form
  const {
    control,
    formState: { errors, isSubmitting },
    handleSubmit,
    watch,
    setValue,
  } = useForm<Partial<TWorkItemType>>({
    defaultValues: data ? { ...getDefaultValues(), ...data } : getDefaultValues(),
  });

  const logoValue = watch("logo_props");

  const onSubmit = async (formData: Partial<TWorkItemType>) => {
    await handleFormSubmit({
      name: formData.name?.trim(),
      description: formData.description ?? "",
      logo_props: formData.logo_props,
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <DialogMain>
        <DialogHeader>
          <DialogHeading>
            <DialogTitle>{data ? t("work_item_types.update.title") : t("work_item_types.create.title")}</DialogTitle>
          </DialogHeading>
        </DialogHeader>
        <DialogBody tabIndex={0}>
          <div className="space-y-3">
            <div className="flex w-full items-start gap-2">
              <EmojiPicker
                iconType="lucide"
                isOpen={isEmojiPickerOpen}
                handleToggle={(val: boolean) => setIsEmojiPickerOpen(val)}
                className="flex-shrink0 flex items-center justify-center"
                buttonClassName="flex items-center justify-center"
                label={
                  <span className="grid h-9 w-9 place-items-center rounded-md bg-surface-2">
                    {logoValue?.in_use ? (
                      <Logo logo={logoValue} size={18} type="lucide" />
                    ) : (
                      <LayerStackOutline className="h-4 w-4 text-tertiary" />
                    )}
                  </span>
                }
                // TODO: fix types
                onChange={(val: any) => {
                  // oxlint-disable-next-line no-shadow
                  let logoValue = {};

                  if (val?.type === "emoji") logoValue = { value: val.value };
                  else if (val?.type === "icon") logoValue = val.value;

                  setValue("logo_props", {
                    in_use: val?.type,
                    [val?.type]: logoValue,
                  });
                  setIsEmojiPickerOpen(false);
                }}
                defaultIconColor={logoValue?.in_use === "icon" ? logoValue?.icon?.color : undefined}
                defaultOpen={logoValue?.in_use === "emoji" ? "emoji" : "icon"}
              />
              <div className="flew-grow w-full space-y-1">
                <Controller
                  control={control}
                  name="name"
                  rules={{
                    required: t("common.errors.required"),
                    maxLength: { value: 255, message: t("common.errors.required") },
                  }}
                  render={({ field: { value, onChange } }) => (
                    <Field name="name" invalid={Boolean(errors?.name)}>
                      <InputGroup size="2xl">
                        <Input
                          id="name"
                          name="name"
                          type="text"
                          size="2xl"
                          value={value}
                          onChange={onChange}
                          placeholder={t("work_item_types.create_update.form.name.placeholder")}
                          // oxlint-disable-next-line jsx_a11y/no-autofocus
                          autoFocus
                        />
                      </InputGroup>
                    </Field>
                  )}
                />
                <span className="text-11 text-danger-primary">{errors?.name?.message?.toString()}</span>
              </div>
            </div>
            <Controller
              control={control}
              name="description"
              render={({ field: { value, onChange } }) => (
                <Field name="description" invalid={Boolean(errors?.description)}>
                  <TextAreaGroup resize="none">
                    <TextArea
                      id="description"
                      name="description"
                      size="lg"
                      surface="field"
                      autoResize
                      maxRows={8}
                      value={value}
                      onChange={onChange}
                      placeholder={t("work_item_types.create_update.form.description.placeholder")}
                    />
                  </TextAreaGroup>
                </Field>
              )}
            />
          </div>
        </DialogBody>
      </DialogMain>
      <DialogActions>
        <Button variant="secondary" size="md" stretch="auto" label={t("common.cancel")} onClick={handleClose} />
        <Button
          variant="primary"
          size="md"
          stretch="auto"
          type="submit"
          loading={isSubmitting}
          label={data ? t("work_item_types.update.button") : t("work_item_types.create.button")}
        />
      </DialogActions>
    </form>
  );
}
