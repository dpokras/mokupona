import { useFormMetadata, type FieldMetadata } from "@conform-to/react";
import type z from "zod";

import { getViewForNonListField } from "../non-list";

import type { ListFieldSchema } from "./model";

import { ErrorList, FieldDescription } from "~/components/forms";
import { useText } from "~/features/site-content/site-text";

type ListItem = Record<string, unknown>;

type ListFieldProps = {
  fieldConfig: z.infer<typeof ListFieldSchema>;
  fieldMetadata: FieldMetadata<ListItem[]>;
};

export function ListField({
  fieldConfig: config,
  fieldMetadata: metadata,
}: ListFieldProps) {
  const form = useFormMetadata();
  const t = useText();
  const { label, description, maxCount, addLabel, removeLabel, itemFields } =
    config.data;

  if (maxCount === 0) return null;

  const items = metadata.getFieldList();

  return (
    <>
      <div aria-hidden className="bg-border my-1 h-px" />

      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground text-sm">{label}</span>
          <span className="text-muted-foreground text-xs">
            {t("dinner.listFieldLimit", { count: maxCount })}
          </span>
        </div>
        <FieldDescription>{description}</FieldDescription>
      </div>

      {items.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {items.map((item, index) => {
            const itemFieldset = item.getFieldset();

            return (
              <li
                key={item.key}
                className="bg-background flex flex-col gap-3 rounded-lg border p-4"
              >
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground text-xs font-semibold tracking-widest">
                    {label} {index + 1}
                  </span>
                  <button
                    {...form.remove.getButtonProps({
                      name: metadata.name,
                      index,
                    })}
                    className="text-primary text-xs hover:underline"
                  >
                    {removeLabel}
                  </button>
                </div>

                <fieldset className="flex w-full flex-col gap-3">
                  {itemFields.map((field) => {
                    const View = getViewForNonListField(field);

                    return (
                      <View
                        key={field.data.name}
                        fieldConfig={field}
                        fieldMetadata={itemFieldset[field.data.name]}
                      />
                    );
                  })}
                </fieldset>
              </li>
            );
          })}
        </ul>
      ) : null}

      {items.length < maxCount ? (
        <button
          {...form.insert.getButtonProps({ name: metadata.name })}
          className="text-primary flex w-fit items-center gap-2 text-sm font-semibold hover:underline"
        >
          <span aria-hidden className="text-base leading-none">
            +
          </span>
          {addLabel}
        </button>
      ) : null}

      <ErrorList id={metadata.errorId} errors={metadata.errors} />
    </>
  );
}
